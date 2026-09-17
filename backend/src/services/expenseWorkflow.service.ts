import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { ExpenseStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { ExpenseSettingsInput, PayExpenseInput, VoidMoneyInput } from '../validators/incomeExpense.validator.js';
import { auditService } from './audit.service.js';
import { assertFinancialPeriodOpen } from './financialPeriod.service.js';
import { accountIdForMethod, recordTransaction } from './ledger.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { moneyUz } from '../utils/money.js';

/**
 * Xarajatni tasdiqlash (promt 21-bo‘lim): chegara summadan katta xarajat rahbar tasdiqlamaguncha
 * haqiqiy xarajatga (daftar, kassa) kirmaydi. Holatlar: PENDING → APPROVED → PAID yoki REJECTED.
 * Takroriy xarajatdan kelgan UPCOMING yozuvlar to‘g‘ridan-to‘g‘ri to‘lanadi.
 */

const THRESHOLD_KEY = 'finance.expenseApprovalThreshold';

export interface ExpenseSettingsDto {
  /** 0 — tasdiqlash o‘chirilgan */
  approvalThreshold: number;
  updatedAt: string | null;
}

export async function getApprovalThreshold(db: Prisma.TransactionClient = prisma): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: THRESHOLD_KEY }, select: { value: true } });
  const value = (setting?.value as { amount?: unknown } | null)?.amount;
  return typeof value === 'number' && value > 0 ? value : 0;
}

/** Xodimda tasdiqlash ruxsati bo‘lmasa va summa chegaradan katta bo‘lsa — tasdiq talab qilinadi */
export async function requiresApproval(actor: AuthUser | null, amount: number, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  const threshold = await getApprovalThreshold(db);
  if (threshold <= 0 || amount < threshold) return false;
  if (!actor) return true;
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return !permissions.has(PERMISSIONS.EXPENSE_APPROVE);
}

/** Tasdiqlash ruxsati bor faol xodimlarga bildirishnoma */
export async function notifyApprovers(
  db: Prisma.TransactionClient,
  expense: { id: string; number: number; amount: number; categoryName: string; description: string | null },
  exceptUserId: string | null,
): Promise<void> {
  const approvers = await db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      role: { permissions: { some: { permission: { key: PERMISSIONS.EXPENSE_APPROVE } } } },
    },
    select: { id: true },
  });
  for (const approver of approvers) {
    await notificationService.createInTransaction(db, {
      userId: approver.id,
      type: 'EXPENSE_APPROVAL',
      title: 'Xarajat tasdiq kutmoqda',
      message: `#${expense.number} · ${expense.categoryName} · ${moneyUz(expense.amount)}${expense.description ? ` — ${expense.description}` : ''}`,
      entityType: 'expense',
      entityId: expense.id,
      dedupeKey: `expense:${expense.id}:approval:${approver.id}`,
    });
  }
}

async function findExpense(id: string) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      amount: true,
      method: true,
      accountId: true,
      status: true,
      description: true,
      responsibleId: true,
      category: { select: { name: true } },
    },
  });
  if (!expense) {
    throw AppError.notFound('Xarajat topilmadi');
  }
  return expense;
}

function assertStatus(status: ExpenseStatus, allowed: ExpenseStatus[], message: string): void {
  if (!allowed.includes(status)) {
    throw AppError.conflict(message);
  }
}

export const expenseWorkflowService = {
  async settings(): Promise<ExpenseSettingsDto> {
    const setting = await prisma.setting.findUnique({ where: { key: THRESHOLD_KEY }, select: { updatedAt: true } });
    return { approvalThreshold: await getApprovalThreshold(), updatedAt: setting?.updatedAt.toISOString() ?? null };
  },

  async updateSettings(actor: AuthUser, input: ExpenseSettingsInput, client: ClientInfo): Promise<ExpenseSettingsDto> {
    const before = await getApprovalThreshold();
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: THRESHOLD_KEY },
        create: { key: THRESHOLD_KEY, value: { amount: input.approvalThreshold }, description: 'Shu summadan katta xarajat rahbar tasdig‘ini talab qiladi (0 — o‘chirilgan)', updatedById: actor.id },
        update: { value: { amount: input.approvalThreshold }, updatedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.threshold_changed',
        entityType: 'setting',
        entityId: THRESHOLD_KEY,
        metadata: { before, after: input.approvalThreshold },
        ...client,
      });
    });
    return this.settings();
  },

  async approve(actor: AuthUser, id: string, client: ClientInfo): Promise<string> {
    const expense = await findExpense(id);
    assertStatus(expense.status, ['PENDING'], 'Faqat tasdiq kutayotgan xarajat tasdiqlanadi');

    await prisma.$transaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } });
      if (expense.responsibleId && expense.responsibleId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: expense.responsibleId,
          type: 'EXPENSE_APPROVAL',
          title: 'Xarajat tasdiqlandi',
          message: `#${expense.number} · ${expense.category.name} · ${moneyUz(expense.amount.toNumber())} — to‘lash mumkin`,
          entityType: 'expense',
          entityId: id,
          dedupeKey: `expense:${id}:approved`,
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.approved',
        entityType: 'expense',
        entityId: id,
        metadata: { number: expense.number, amount: expense.amount.toNumber(), category: expense.category.name },
        ...client,
      });
    });
    return id;
  },

  /** Rad etish: tasdiq kutayotgan/tasdiqlangan — rahbar, kutilayotgan (takroriy) — xarajat boshqaruvchisi */
  async reject(actor: AuthUser, id: string, input: VoidMoneyInput, client: ClientInfo): Promise<string> {
    const expense = await findExpense(id);
    assertStatus(expense.status, ['PENDING', 'APPROVED', 'UPCOMING'], 'Bu xarajatni rad etib bo‘lmaydi');
    if (expense.status !== 'UPCOMING') {
      const permissions = await permissionService.getRolePermissions(actor.roleId);
      if (!permissions.has(PERMISSIONS.EXPENSE_APPROVE)) {
        throw AppError.forbidden('Tasdiq kutayotgan xarajatni faqat rahbar rad etadi');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: { status: 'REJECTED', rejectedById: actor.id, rejectedAt: new Date(), rejectReason: input.reason },
      });
      if (expense.responsibleId && expense.responsibleId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: expense.responsibleId,
          type: 'EXPENSE_APPROVAL',
          title: 'Xarajat rad etildi',
          message: `#${expense.number} · ${expense.category.name}: ${input.reason}`,
          entityType: 'expense',
          entityId: id,
          dedupeKey: `expense:${id}:rejected`,
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.rejected',
        entityType: 'expense',
        entityId: id,
        metadata: { number: expense.number, amount: expense.amount.toNumber(), previousStatus: expense.status, reason: input.reason },
        ...client,
      });
    });
    return id;
  },

  /** To‘lash: shundan keyin xarajat daftarga tushadi va kassa qoldig‘i kamayadi */
  async pay(actor: AuthUser, id: string, input: PayExpenseInput, client: ClientInfo): Promise<string> {
    const expense = await findExpense(id);
    assertStatus(expense.status, ['APPROVED', 'UPCOMING'], 'Faqat tasdiqlangan yoki kutilayotgan xarajat to‘lanadi');
    const amount = expense.amount.toNumber();
    if (expense.status === 'UPCOMING' && (await requiresApproval(actor, amount))) {
      throw AppError.unprocessable('Summa tasdiq chegarasidan katta — avval rahbar tasdiqlashi kerak');
    }
    const occurredAt = input.date ? new Date(`${input.date}T12:00:00.000Z`) : new Date();
    await assertFinancialPeriodOpen(prisma, occurredAt);
    const method = input.method ?? expense.method;

    await prisma.$transaction(async (tx) => {
      let accountId = input.accountId ?? expense.accountId;
      if (accountId) {
        const account = await tx.financialAccount.findFirst({ where: { id: accountId, isActive: true }, select: { id: true } });
        if (!account) {
          throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'accountId', message: 'Hisob topilmadi' }]);
        }
      } else {
        accountId = await accountIdForMethod(tx, method);
      }

      const transaction = await recordTransaction(tx, {
        type: 'EXPENSE',
        amount,
        accountId,
        occurredAt,
        description: expense.description ?? expense.category.name,
        categoryName: expense.category.name,
        entityType: 'expense',
        entityId: id,
        createdById: actor.id,
      });
      await tx.expense.update({
        where: { id },
        data: { status: 'PAID', transactionId: transaction.id, spentAt: occurredAt, method, accountId },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.paid',
        entityType: 'expense',
        entityId: id,
        metadata: { number: expense.number, amount, method, previousStatus: expense.status },
        ...client,
      });
    });
    return id;
  },
};
