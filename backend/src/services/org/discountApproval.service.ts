import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { ApprovalStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { moneyUz } from '../../utils/money.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { closeApproval, openApproval } from '../approval.service.js';
import { auditService } from '../audit.service.js';
import { getBranchAccess } from '../branchAccess.js';
import { discountService, loadDiscountSettings } from '../discount.service.js';
import type { EvaluatedDiscount, GrantDiscountInput, StudentDiscountSummary } from '../discount.service.js';
import { notificationService } from '../notification.service.js';
import { permissionService } from '../permission.service.js';
import { fullName, permissionHolders, personSelect } from './common.js';
import type { Person } from './common.js';

/**
 * Chegirma vakolati (ORG §2.2).
 *
 *  - O'quvchining umumiy chegirmasi (shu chegirma bilan birga) chegaradan — standart 5% — oshmasa, xodim o'zi beradi.
 *  - Oshsa va xodimda `discount.approve` bo'lmasa — chegirma darhol berilmaydi: sababi bilan so'rov yaratiladi,
 *    rahbar(lar) xabar oladi. Tasdiqlanganda chegirma **o'sha paytdagi** shartnoma bo'yicha qayta hisoblanib beriladi
 *    (so'rovdan keyin to'lov yoki boshqa chegirma bo'lgan bo'lsa ham hisob to'g'ri).
 *  - Rahbar sozlagan qoida va promo kodlar — sozlamaga qarab oldindan tasdiqlangan hisoblanishi mumkin.
 * Har qaror audit jurnaliga yoziladi; berilgan chegirmada kim so'ragani va kim tasdiqlagani saqlanadi.
 */

export const DISCOUNT_REQUESTS_LINK = '/discounts?tab=requests';

export interface DiscountRequestDto {
  id: string;
  status: ApprovalStatus;
  student: { id: string; firstName: string; lastName: string };
  label: string;
  amount: number;
  /** O'quvchining umumiy chegirma foizi (so'rov paytida, shu chegirma bilan) */
  percent: number;
  reason: string;
  requestedBy: Person | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export type GrantOutcome = { status: 'GRANTED'; summary: StudentDiscountSummary } | { status: 'PENDING'; request: DiscountRequestDto };

const requestSelect = {
  id: true,
  status: true,
  label: true,
  amount: true,
  percent: true,
  reason: true,
  payload: true,
  studentId: true,
  branchId: true,
  requestedById: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  requestedBy: personSelect,
  decidedBy: personSelect,
} satisfies Prisma.DiscountRequestSelect;

type RequestRow = Prisma.DiscountRequestGetPayload<{ select: typeof requestSelect }>;

function toDto(row: RequestRow): DiscountRequestDto {
  return {
    id: row.id,
    status: row.status,
    student: row.student,
    label: row.label,
    amount: row.amount.toNumber(),
    percent: row.percent.toNumber(),
    reason: row.reason,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

/** O'quvchining umumiy chegirma foizi shu chegirma bilan birga (boshlang'ich narxga nisbatan) */
export function percentAfter(evaluated: EvaluatedDiscount): number {
  const { basePrice, newContractPrice } = evaluated;
  if (basePrice <= 0) return 0;
  return Math.round(((basePrice - newContractPrice) / basePrice) * 10_000) / 100;
}

async function canApprove(actor: AuthUser): Promise<boolean> {
  return (await permissionService.getRolePermissions(actor.roleId)).has(PERMISSIONS.DISCOUNT_APPROVE);
}

async function findRequest(actor: AuthUser, id: string): Promise<RequestRow> {
  const access = await getBranchAccess(actor);
  const row = await prisma.discountRequest.findFirst({ where: { id, ...(access.canViewAll ? {} : { branchId: access.branchId }) }, select: requestSelect });
  if (!row) throw AppError.notFound('So‘rov topilmadi');
  return row;
}

export const discountApprovalService = {
  /**
   * Chegirma berish: chegara ichida — darhol; undan yuqori va tasdiqlash huquqi yo'q — so'rov.
   * Cheklovlar (umumiy foiz, birga qo'llanish, promo limiti) ikkala holatda ham oldindan tekshiriladi.
   */
  async grantOrRequest(actor: AuthUser, studentId: string, input: GrantDiscountInput, client: ClientInfo): Promise<GrantOutcome> {
    const [evaluated, settings, approver] = await Promise.all([discountService.evaluate(studentId, input), loadDiscountSettings(), canApprove(actor)]);
    const percent = percentAfter(evaluated);
    const preapproved = settings.rulesPreapproved && evaluated.resolved.ruleId !== null;
    if (approver || preapproved || percent <= settings.approvalThresholdPercent) {
      return { status: 'GRANTED', summary: await discountService.grant(actor, studentId, input, client) };
    }

    const reason = input.note?.trim();
    if (!reason || reason.length < 3) {
      throw AppError.unprocessable(`Chegirma ${settings.approvalThresholdPercent}% dan oshadi — rahbar tasdig‘i uchun sababni yozing`, [{ field: 'note', message: 'Sababni yozing' }]);
    }
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { firstName: true, lastName: true, branchId: true } });
    const pending = await prisma.discountRequest.count({ where: { studentId, status: 'PENDING' } });
    if (pending > 0) throw AppError.conflict('Bu o‘quvchi uchun tasdiq kutayotgan chegirma so‘rovi bor');

    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.discountRequest.create({
        data: {
          studentId,
          payload: { ...input } as Prisma.InputJsonValue,
          label: evaluated.resolved.label,
          amount: evaluated.amount,
          percent,
          reason,
          requestedById: actor.id,
          branchId: student.branchId,
        },
        select: { id: true },
      });
      const title = `Chegirma: ${fullName(student)} · ${evaluated.resolved.label} · ${percent}%`;
      await openApproval(tx, { type: 'DISCOUNT', entityType: 'discount_request', entityId: row.id, title, amount: evaluated.amount, link: DISCOUNT_REQUESTS_LINK, branchId: student.branchId }, actor.id);
      const approvers = (await permissionHolders(PERMISSIONS.DISCOUNT_APPROVE, student.branchId)).filter((userId) => userId !== actor.id);
      await notificationService.createManyInTransaction(
        tx,
        approvers.map((userId) => ({
          userId,
          type: 'APPROVAL_REQUEST' as const,
          title: 'Chegirma tasdiq kutmoqda',
          message: `${fullName(student)}: ${evaluated.resolved.label} — ${moneyUz(evaluated.amount)} (umumiy ${percent}%). Sabab: ${reason}. So‘radi: ${fullName(actor)}`,
          entityType: 'discount_request',
          entityId: row.id,
          actionUrl: DISCOUNT_REQUESTS_LINK,
          dedupeKey: `discount-request:${row.id}:${userId}`,
        })),
      );
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.requested',
        entityType: 'student',
        entityId: studentId,
        metadata: { requestId: row.id, label: evaluated.resolved.label, amount: evaluated.amount, percent, threshold: settings.approvalThresholdPercent, reason },
        ...client,
      });
      return row.id;
    });
    return { status: 'PENDING', request: toDto(await prisma.discountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect })) };
  },

  /** Tasdiqlovchi — filialdagi hammasi; boshqalar — faqat o'zi so'raganlar */
  async list(actor: AuthUser, status: ApprovalStatus | undefined): Promise<{ items: DiscountRequestDto[]; pending: number; canApprove: boolean }> {
    const [access, approver] = await Promise.all([getBranchAccess(actor), canApprove(actor)]);
    const scope: Prisma.DiscountRequestWhereInput = {
      ...(access.canViewAll ? {} : { branchId: access.branchId }),
      ...(approver ? {} : { requestedById: actor.id }),
    };
    const [rows, pending] = await Promise.all([
      prisma.discountRequest.findMany({ where: { ...scope, ...(status ? { status } : {}) }, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take: 200, select: requestSelect }),
      prisma.discountRequest.count({ where: { ...scope, status: 'PENDING' } }),
    ]);
    return { items: rows.map(toDto), pending, canApprove: approver };
  },

  async approve(actor: AuthUser, id: string, note: string | undefined, client: ClientInfo): Promise<DiscountRequestDto> {
    if (!(await canApprove(actor))) throw AppError.forbidden('Chegirmani tasdiqlash huquqi yo‘q');
    const row = await findRequest(actor, id);
    if (row.status !== 'PENDING') throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');
    if (row.requestedById === actor.id) throw AppError.forbidden('O‘z so‘rovingizni o‘zingiz tasdiqlay olmaysiz');
    const input = row.payload as GrantDiscountInput;
    // Hozirgi shartnoma bo'yicha qayta hisob: cheklovdan oshsa (masalan, orada boshqa chegirma berilgan) — 422, so'rov kutishda qoladi
    const evaluated = await discountService.evaluate(row.studentId, input);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.discountRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: actor.id, decidedAt: now, decisionNote: note ?? null } });
      if (claimed.count === 0) throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');
      const discountId = await discountService.applyInTransaction(tx, { grantedById: row.requestedById ?? actor.id, approvedById: actor.id }, row.studentId, input, evaluated, client);
      await tx.discountRequest.update({ where: { id }, data: { discountId } });
      await closeApproval(tx, { entityType: 'discount_request', entityId: id }, { status: 'APPROVED', decidedById: actor.id, reason: note ?? null });
      if (row.requestedById) {
        await notificationService.createInTransaction(tx, {
          userId: row.requestedById,
          type: 'APPROVAL_REQUEST',
          title: 'Chegirma tasdiqlandi',
          message: `✅ ${fullName(row.student)}: ${row.label} — ${moneyUz(evaluated.amount)}${note ? `. ${note}` : ''}`,
          entityType: 'discount_request',
          entityId: id,
          actionUrl: `/students/${row.studentId}`,
          dedupeKey: `discount-request:${id}:approved`,
        });
      }
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'discount.request_approved', entityType: 'student', entityId: row.studentId, metadata: { requestId: id, discountId, amount: evaluated.amount, note: note ?? null }, ...client });
    });
    return toDto(await prisma.discountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
  },

  async reject(actor: AuthUser, id: string, note: string, client: ClientInfo): Promise<DiscountRequestDto> {
    if (!(await canApprove(actor))) throw AppError.forbidden('Chegirmani tasdiqlash huquqi yo‘q');
    const row = await findRequest(actor, id);
    await this.close(actor, row, 'REJECTED', note, client);
    return toDto(await prisma.discountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
  },

  /** So'ragan xodim kutilayotgan so'rovini qaytarib oladi */
  async cancel(actor: AuthUser, id: string, client: ClientInfo): Promise<DiscountRequestDto> {
    const row = await findRequest(actor, id);
    if (row.requestedById !== actor.id) throw AppError.forbidden('Faqat o‘z so‘rovingizni bekor qila olasiz');
    await this.close(actor, row, 'CANCELLED', null, client);
    return toDto(await prisma.discountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
  },

  async close(actor: AuthUser, row: RequestRow, status: 'REJECTED' | 'CANCELLED', note: string | null, client: ClientInfo): Promise<void> {
    if (row.status !== 'PENDING') throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.discountRequest.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status, decidedById: actor.id, decidedAt: new Date(), decisionNote: note } });
      if (claimed.count === 0) throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');
      await closeApproval(tx, { entityType: 'discount_request', entityId: row.id }, { status, decidedById: actor.id, reason: note });
      if (status === 'REJECTED' && row.requestedById) {
        await notificationService.createInTransaction(tx, {
          userId: row.requestedById,
          type: 'APPROVAL_REQUEST',
          title: 'Chegirma rad etildi',
          message: `❌ ${fullName(row.student)}: ${row.label}. Sabab: ${note ?? '—'}`,
          entityType: 'discount_request',
          entityId: row.id,
          actionUrl: DISCOUNT_REQUESTS_LINK,
          dedupeKey: `discount-request:${row.id}:rejected`,
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: status === 'REJECTED' ? 'discount.request_rejected' : 'discount.request_cancelled',
        entityType: 'student',
        entityId: row.studentId,
        metadata: { requestId: row.id, note },
        ...client,
      });
    });
  },
};
