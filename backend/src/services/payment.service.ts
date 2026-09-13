import { prisma } from '../config/database.js';
import { PAYMENT_METHOD_LABELS, formatPaymentNumber } from '../config/paymentLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { PaymentMethod, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreatePaymentInput,
  DeletePaymentInput,
  PaymentListQuery,
  PaymentStatsQuery,
} from '../validators/payment.validator.js';
import { auditService } from './audit.service.js';
import { accountIdForMethod, recordTransaction, voidTransaction } from './ledger.js';
import { notificationService } from './notification.service.js';
import { debtStatusOf } from './student.service.js';
import { EXPORT_ROW_LIMIT, exportSubtitle } from '../utils/tableExport.js';
import type { ExportColumn, ExportTable } from '../utils/tableExport.js';
import { businessDateString } from '../utils/dates.js';
import { commissionService } from './commission.service.js';

/** Daftardagi kategoriya nomi — moliyaviy panel shu nom bo'yicha ajratadi */
const STUDENT_PAYMENT_CATEGORY = 'O‘quvchi to‘lovi';

const paymentSelect = {
  id: true,
  number: true,
  amount: true,
  method: true,
  paidAt: true,
  comment: true,
  deletedAt: true,
  deleteReason: true,
  createdAt: true,
  student: {
    select: {
      id: true,
      number: true,
      firstName: true,
      lastName: true,
      phone: true,
      group: { select: { id: true, name: true } },
    },
  },
  course: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  accountant: { select: { id: true, firstName: true, lastName: true } },
  deletedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export interface PaymentDto {
  id: string;
  number: number;
  /** "PM-000045" — kvitansiya raqami */
  code: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  comment: string | null;
  isDeleted: boolean;
  deleteReason: string | null;
  deletedBy: { id: string; firstName: string; lastName: string } | null;
  student: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    phone: string;
    group: { id: string; name: string } | null;
  };
  course: { id: string; name: string };
  manager: { id: string; firstName: string; lastName: string } | null;
  accountant: { id: string; firstName: string; lastName: string } | null;
}

export interface PaymentStatsDto {
  /** Bekor qilinmagan to‘lovlar yig‘indisi */
  total: number;
  count: number;
  byMethod: Array<{ method: PaymentMethod; total: number; count: number }>;
}

function toPaymentDto(payment: PaymentRecord): PaymentDto {
  return {
    id: payment.id,
    number: payment.number,
    code: formatPaymentNumber(payment.number),
    amount: payment.amount.toNumber(),
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
    comment: payment.comment,
    isDeleted: payment.deletedAt !== null,
    deleteReason: payment.deleteReason,
    deletedBy: payment.deletedBy,
    student: {
      id: payment.student.id,
      code: formatStudentNumber(payment.student.number),
      firstName: payment.student.firstName,
      lastName: payment.student.lastName,
      phone: payment.student.phone,
      group: payment.student.group,
    },
    course: payment.course,
    manager: payment.manager,
    accountant: payment.accountant,
  };
}

/** "2026-10-01" → shu kun boshlanishi / ertangi kun boshlanishi (UTC) */
function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

function buildPaymentWhere(query: Partial<PaymentListQuery>): Prisma.PaymentWhereInput {
  const conditions: Prisma.PaymentWhereInput[] = [];
  if (!query.includeDeleted) conditions.push({ deletedAt: null });
  if (query.studentId) conditions.push({ studentId: query.studentId });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.groupId) conditions.push({ student: { groupId: query.groupId } });
  if (query.managerId) conditions.push({ managerId: query.managerId });
  if (query.method) conditions.push({ method: query.method });
  if (query.from) conditions.push({ paidAt: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ paidAt: { lt: nextDayStart(query.to) } });

  const search = query.search?.trim();
  if (search) {
    const or: Prisma.PaymentWhereInput[] = [
      { student: { firstName: { contains: search, mode: 'insensitive' } } },
      { student: { lastName: { contains: search, mode: 'insensitive' } } },
      { comment: { contains: search, mode: 'insensitive' } },
    ];
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 2) or.push({ student: { phone: { contains: digits } } });
    const receiptMatch = /^(?:pm-?)?0*(\d{1,9})$/i.exec(search);
    if (receiptMatch?.[1]) or.push({ number: Number(receiptMatch[1]) });
    const studentMatch = /^(?:st-?)0*(\d{1,9})$/i.exec(search);
    if (studentMatch?.[1]) or.push({ student: { number: Number(studentMatch[1]) } });
    conditions.push({ OR: or });
  }

  return { AND: conditions };
}

function buildOrderBy(
  sortBy: PaymentListQuery['sortBy'],
  sortOrder: PaymentListQuery['sortOrder'],
): Prisma.PaymentOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'amount':
      return [{ amount: sortOrder }, { id: 'asc' }];
    case 'number':
      return [{ number: sortOrder }];
    case 'paidAt':
      return [{ paidAt: sortOrder }, { id: 'asc' }];
  }
}

/**
 * O‘quvchining bekor qilinmagan to‘lovlari yig‘indisidan qarzdorlikni qayta hisoblaydi.
 * To‘lov qo‘shilganda ham, bekor qilinganda ham shu funksiya ishlatiladi —
 * shunda qarz har doim to‘lovlar tarixiga mos bo‘ladi.
 */
async function recalculateDebt(tx: Prisma.TransactionClient, studentId: string): Promise<{ paid: number; remaining: number }> {
  const debt = await tx.debt.findUnique({ where: { studentId }, select: { totalAmount: true } });
  if (!debt) {
    throw AppError.unprocessable('Bu o‘quvchida shartnoma balansi yo‘q');
  }
  const aggregate = await tx.payment.aggregate({
    where: { studentId, deletedAt: null },
    _sum: { amount: true },
  });
  const total = debt.totalAmount.toNumber();
  const paid = aggregate._sum.amount?.toNumber() ?? 0;
  const remaining = Math.max(total - paid, 0);
  await tx.debt.update({
    where: { studentId },
    data: { paidAmount: paid, remainingAmount: remaining, status: debtStatusOf(total, paid) },
  });
  return { paid, remaining };
}

export const paymentService = {
  async list(query: PaymentListQuery): Promise<{ items: PaymentDto[]; total: number }> {
    const where = buildPaymentWhere(query);
    const items = await prisma.payment.findMany({
      where,
      select: paymentSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.payment.count({ where });
    return { items: items.map(toPaymentDto), total };
  },

  /** Filtrga mos to‘lovlar — eksport uchun; "Jami" faqat bekor qilinmaganlarni qo‘shadi */
  async exportTable(query: PaymentListQuery): Promise<ExportTable> {
    const where = buildPaymentWhere(query);
    const records = await prisma.payment.findMany({
      where,
      select: paymentSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      take: EXPORT_ROW_LIMIT,
    });
    const total = await prisma.payment.count({ where });

    const columns: ExportColumn[] = [
      { key: 'code', label: 'Kvitansiya', type: 'text' },
      { key: 'paidAt', label: 'Sana', type: 'date' },
      { key: 'student', label: 'O‘quvchi', type: 'text' },
      { key: 'studentCode', label: 'O‘quvchi ID', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'method', label: 'Usul', type: 'text' },
      { key: 'amount', label: 'Summa', type: 'money' },
      { key: 'manager', label: 'Menejer', type: 'text' },
      { key: 'status', label: 'Holat', type: 'text' },
      { key: 'comment', label: 'Izoh', type: 'text' },
    ];
    const payments = records.map(toPaymentDto);
    const rows = payments.map((payment) => ({
      code: payment.code,
      paidAt: businessDateString(new Date(payment.paidAt)),
      student: `${payment.student.firstName} ${payment.student.lastName}`,
      studentCode: payment.student.code,
      course: payment.course.name,
      group: payment.student.group?.name ?? null,
      method: PAYMENT_METHOD_LABELS[payment.method],
      amount: payment.amount,
      manager: payment.manager ? `${payment.manager.firstName} ${payment.manager.lastName}` : null,
      status: payment.isDeleted ? 'Bekor qilingan' : 'Faol',
      comment: payment.isDeleted ? (payment.deleteReason ?? payment.comment) : payment.comment,
    }));
    const activeSum = payments.reduce((sum, payment) => sum + (payment.isDeleted ? 0 : payment.amount), 0);
    return { title: 'To‘lovlar', subtitle: exportSubtitle(rows.length, total), columns, rows, totals: { amount: activeSum } };
  },

  /** Filtrga mos to‘lovlar yig‘indisi va usullar kesimi (sahifalashdan qat’i nazar) */
  async stats(query: PaymentStatsQuery): Promise<PaymentStatsDto> {
    const where = buildPaymentWhere({ ...query, includeDeleted: false });
    const grouped = await prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const byMethod = grouped
      .map((row) => ({ method: row.method, total: row._sum.amount?.toNumber() ?? 0, count: row._count._all }))
      .sort((a, b) => b.total - a.total);

    return {
      total: byMethod.reduce((sum, row) => sum + row.total, 0),
      count: byMethod.reduce((sum, row) => sum + row.count, 0),
      byMethod,
    };
  },

  async getById(id: string): Promise<PaymentDto> {
    const payment = await prisma.payment.findUnique({ where: { id }, select: paymentSelect });
    if (!payment) {
      throw AppError.notFound('To‘lov topilmadi');
    }
    return toPaymentDto(payment);
  },

  /**
   * To‘lov qabul qilinadi: kvitansiya yoziladi, qarz qayta hisoblanadi va
   * o‘quvchini olib kelgan manager (lead egasi) to‘lov haqida xabar oladi.
   */
  async create(actor: AuthUser, input: CreatePaymentInput, client: ClientInfo): Promise<PaymentDto> {
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        courseId: true,
        groupId: true,
        group: { select: { teacherId: true } },
        status: true,
        debt: { select: { totalAmount: true, paidAmount: true } },
        lead: { select: { assignedToId: true } },
      },
    });
    if (!student) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);
    }
    if (!student.debt) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'studentId', message: 'Bu o‘quvchida shartnoma balansi yo‘q' },
      ]);
    }

    const total = student.debt.totalAmount.toNumber();
    const alreadyPaid = student.debt.paidAmount.toNumber();
    if (alreadyPaid + input.amount > total) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        {
          field: 'amount',
          message: `Shartnoma bo‘yicha qolgan qarz ${total - alreadyPaid} so‘m — undan ko‘p to‘lov qabul qilinmaydi`,
        },
      ]);
    }

    const paymentId = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          courseId: student.courseId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt ?? new Date(),
          comment: input.comment ?? null,
          managerId: student.lead?.assignedToId ?? null,
          accountantId: actor.id,
          // O'qituvchi foizi to'lov paytidagi guruhga bog'lanadi
          groupId: student.groupId,
          teacherId: student.group?.teacherId ?? null,
        },
        select: { id: true, number: true, paidAt: true, teacherId: true },
      });

      // Har bir to'lov moliyaviy daftarga tushadi: usulga mos kassa qoldig'i oshadi
      const accountId = await accountIdForMethod(tx, input.method);
      const transaction = await recordTransaction(tx, {
        type: 'INCOME',
        amount: input.amount,
        accountId,
        occurredAt: input.paidAt ?? new Date(),
        description: `O‘quv to‘lovi — ${student.firstName} ${student.lastName}`,
        categoryName: STUDENT_PAYMENT_CATEGORY,
        entityType: 'payment',
        entityId: payment.id,
        createdById: actor.id,
      });
      await tx.payment.update({ where: { id: payment.id }, data: { transactionId: transaction.id } });
      await commissionService.accrueForPayment(
        tx,
        { id: payment.id, amount: input.amount, paidAt: payment.paidAt, teacherId: payment.teacherId },
        actor.id,
      );

      const { remaining } = await recalculateDebt(tx, student.id);

      const managerId = student.lead?.assignedToId;
      if (managerId && managerId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: managerId,
          type: 'NEW_PAYMENT',
          title: 'Yangi to‘lov',
          message: `${student.firstName} ${student.lastName} ${input.amount.toLocaleString('uz-UZ')} so‘m to‘lov qildi. Qolgan qarz: ${remaining.toLocaleString('uz-UZ')} so‘m.`,
          entityType: 'payment',
          entityId: payment.id,
          dedupeKey: `payment:${payment.id}`,
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment.created',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          receipt: formatPaymentNumber(payment.number),
          studentId: student.id,
          amount: input.amount,
          method: input.method,
          remaining,
        },
        ...client,
      });
      return payment.id;
    });

    return this.getById(paymentId);
  },

  /**
   * To‘lovni bekor qiladi (soft delete — kvitansiya tarixi saqlanadi) va qarzni qayta hisoblaydi.
   * Sabab majburiy: moliyaviy yozuvni izsiz o‘chirib bo‘lmaydi.
   */
  async remove(actor: AuthUser, id: string, input: DeletePaymentInput, client: ClientInfo): Promise<PaymentDto> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, number: true, studentId: true, amount: true, paidAt: true, teacherId: true, deletedAt: true, transactionId: true },
    });
    if (!payment) {
      throw AppError.notFound('To‘lov topilmadi');
    }
    if (payment.deletedAt) {
      throw AppError.conflict('Bu to‘lov allaqachon bekor qilingan');
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actor.id, deleteReason: input.reason },
      });
      // Daftardagi yozuv ham bekor qilinadi — kassa qoldig'i qaytariladi
      if (payment.transactionId) {
        await voidTransaction(tx, payment.transactionId, { userId: actor.id, reason: input.reason });
      }
      // O'qituvchi foizi teskari yozuv bilan qaytariladi (tasdiqlangan oy o'zgarmaydi)
      await commissionService.reverseForPayment(
        tx,
        { id, number: payment.number, amount: payment.amount.toNumber(), paidAt: payment.paidAt, teacherId: payment.teacherId },
        { actorId: actor.id, reason: input.reason, client },
      );
      const { remaining } = await recalculateDebt(tx, payment.studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment.deleted',
        entityType: 'payment',
        entityId: id,
        metadata: {
          receipt: formatPaymentNumber(payment.number),
          amount: payment.amount.toNumber(),
          reason: input.reason,
          remaining,
        },
        ...client,
      });
    });

    return this.getById(id);
  },
};
