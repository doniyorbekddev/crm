import { prisma } from '../config/database.js';
import type { PaymentMethod, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { currentBusinessMonth } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { RecurringExpenseInput, UpdateRecurringExpenseInput } from '../validators/incomeExpense.validator.js';
import { auditService } from './audit.service.js';
import { getApprovalThreshold, notifyApprovers } from './expenseWorkflow.service.js';

/**
 * Takroriy xarajatlar (promt 22-bo‘lim): har oy uchun bitta "kutilayotgan" xarajat yaratiladi
 * (chegara summadan katta bo‘lsa — tasdiq kutadi). Pul avtomatik yechilmaydi.
 */

export interface RecurringExpenseDto {
  id: string;
  name: string;
  amount: number;
  method: PaymentMethod;
  vendor: string | null;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  note: string | null;
  category: { id: string; name: string };
  account: { id: string; name: string } | null;
  /** Joriy oy uchun yaratilgan xarajat holati */
  currentMonth: { expenseId: string; status: string; dueDate: string | null } | null;
  createdAt: string;
}

const recurringSelect = {
  id: true,
  name: true,
  amount: true,
  method: true,
  vendor: true,
  dayOfMonth: true,
  startDate: true,
  endDate: true,
  isActive: true,
  note: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.RecurringExpenseSelect;

type RecurringRecord = Prisma.RecurringExpenseGetPayload<{ select: typeof recurringSelect }>;

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);
const periodKeyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

async function assertReferences(input: { categoryId?: string; accountId?: string | null }): Promise<void> {
  if (input.categoryId) {
    const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
    if (!category) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'categoryId', message: 'Kategoriya topilmadi' }]);
    }
  }
  if (input.accountId) {
    const account = await prisma.financialAccount.findFirst({ where: { id: input.accountId, isActive: true }, select: { id: true } });
    if (!account) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'accountId', message: 'Hisob topilmadi' }]);
    }
  }
}

export const recurringExpenseService = {
  async list(): Promise<RecurringExpenseDto[]> {
    const { year, month } = currentBusinessMonth();
    const records = await prisma.recurringExpense.findMany({ select: recurringSelect, orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }] });
    const current = await prisma.expense.findMany({
      where: { recurringExpenseId: { in: records.map((record) => record.id) }, recurringPeriod: periodKeyOf(year, month) },
      select: { id: true, status: true, dueDate: true, recurringExpenseId: true },
    });
    return records.map((record: RecurringRecord) => {
      const expense = current.find((row) => row.recurringExpenseId === record.id);
      return {
        id: record.id,
        name: record.name,
        amount: record.amount.toNumber(),
        method: record.method,
        vendor: record.vendor,
        dayOfMonth: record.dayOfMonth,
        startDate: toDateOnly(record.startDate),
        endDate: record.endDate ? toDateOnly(record.endDate) : null,
        isActive: record.isActive,
        note: record.note,
        category: record.category,
        account: record.account,
        currentMonth: expense ? { expenseId: expense.id, status: expense.status, dueDate: expense.dueDate ? toDateOnly(expense.dueDate) : null } : null,
        createdAt: record.createdAt.toISOString(),
      };
    });
  },

  async create(actor: AuthUser, input: RecurringExpenseInput, client: ClientInfo): Promise<RecurringExpenseDto> {
    await assertReferences(input);
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.recurringExpense.create({
        data: {
          name: input.name,
          categoryId: input.categoryId,
          amount: input.amount,
          method: input.method,
          accountId: input.accountId ?? null,
          vendor: input.vendor ?? null,
          dayOfMonth: input.dayOfMonth,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          note: input.note ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.recurring_created',
        entityType: 'recurringExpense',
        entityId: record.id,
        metadata: { name: input.name, amount: input.amount, dayOfMonth: input.dayOfMonth },
        ...client,
      });
      return record;
    });
    return (await this.list()).find((row) => row.id === created.id)!;
  },

  async update(actor: AuthUser, id: string, input: UpdateRecurringExpenseInput, client: ClientInfo): Promise<RecurringExpenseDto> {
    const existing = await prisma.recurringExpense.findUnique({ where: { id }, select: { id: true, name: true, amount: true, isActive: true } });
    if (!existing) {
      throw AppError.notFound('Takroriy xarajat topilmadi');
    }
    await assertReferences(input);
    await prisma.$transaction(async (tx) => {
      await tx.recurringExpense.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
          ...(input.amount === undefined ? {} : { amount: input.amount }),
          ...(input.method === undefined ? {} : { method: input.method }),
          ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
          ...(input.vendor === undefined ? {} : { vendor: input.vendor }),
          ...(input.dayOfMonth === undefined ? {} : { dayOfMonth: input.dayOfMonth }),
          ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
          ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.recurring_updated',
        entityType: 'recurringExpense',
        entityId: id,
        metadata: {
          name: existing.name,
          before: { amount: existing.amount.toNumber(), isActive: existing.isActive },
          after: { amount: input.amount ?? existing.amount.toNumber(), isActive: input.isActive ?? existing.isActive },
        },
        ...client,
      });
    });
    return (await this.list()).find((row) => row.id === id)!;
  },

  /**
   * Joriy oy uchun kutilayotgan xarajatlarni yaratadi (takrorlanmaydi — unique [recurringExpenseId, recurringPeriod]).
   * Job va "Hozir yaratish" tugmasi shu funksiyani chaqiradi.
   */
  async generate(now: Date = new Date(), actorId: string | null = null): Promise<{ created: number; period: string }> {
    const { year, month } = currentBusinessMonth(now);
    const period = periodKeyOf(year, month);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const due = await prisma.recurringExpense.findMany({
      where: {
        isActive: true,
        startDate: { lt: monthEnd },
        OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
        expenses: { none: { recurringPeriod: period } },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        method: true,
        accountId: true,
        vendor: true,
        dayOfMonth: true,
        categoryId: true,
        createdById: true,
        category: { select: { name: true } },
      },
    });
    if (due.length === 0) return { created: 0, period };

    const threshold = await getApprovalThreshold();
    let created = 0;
    for (const item of due) {
      const amount = item.amount.toNumber();
      const dueDate = new Date(Date.UTC(year, month - 1, Math.min(item.dayOfMonth, daysInMonth)));
      const status = threshold > 0 && amount >= threshold ? ('PENDING' as const) : ('UPCOMING' as const);
      try {
        await prisma.$transaction(async (tx) => {
          const expense = await tx.expense.create({
            data: {
              categoryId: item.categoryId,
              amount,
              method: item.method,
              accountId: item.accountId,
              spentAt: new Date(dueDate.getTime() + 12 * 3_600_000),
              dueDate,
              description: item.name,
              vendor: item.vendor,
              status,
              recurringExpenseId: item.id,
              recurringPeriod: period,
              responsibleId: actorId ?? item.createdById,
            },
            select: { id: true, number: true },
          });
          if (status === 'PENDING') {
            await notifyApprovers(tx, { id: expense.id, number: expense.number, amount, categoryName: item.category.name, description: item.name }, null);
          }
        });
        created += 1;
      } catch (error) {
        // Parallel ishga tushgan job allaqachon yaratgan bo'lsa — unique cheklov, o'tkazib yuboriladi
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    return { created, period };
  },
};
