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
  RefundPaymentInput,
  PaymentListQuery,
  PaymentStatsQuery,
} from '../validators/payment.validator.js';
import { auditService } from './audit.service.js';
import { branchFilter, getBranchAccess } from './branchAccess.js';
import type { BranchAccess } from './branchAccess.js';
import { accountIdForMethod, recordTransaction, voidTransaction } from './ledger.js';
import { notificationService } from './notification.service.js';
import { debtStatusOf } from './student.service.js';
import { EXPORT_ROW_LIMIT, exportSubtitle } from '../utils/tableExport.js';
import type { ExportColumn, ExportTable } from '../utils/tableExport.js';
import { addDays, businessDateString, startOfBusinessDay } from '../utils/dates.js';
import { commissionService } from './commission.service.js';
import { assertFinancialPeriodOpen } from './financialPeriod.service.js';
import { moneyUz } from '../utils/money.js';

/** Daftardagi kategoriya nomi — moliyaviy panel shu nom bo'yicha ajratadi */
const STUDENT_PAYMENT_CATEGORY = 'O‘quvchi to‘lovi';

/**
 * Shu vaqt ichida bitta o‘quvchidan xuddi shu summa xuddi shu to‘lov kuni bilan qayta kiritilsa — ehtimol takror,
 * tasdiq so‘raladi. Boshqa kun bilan kiritilgan teng summa (masalan, o‘tgan oylar qismlari) takror emas.
 */
export const DUPLICATE_PAYMENT_WINDOW_MINUTES = 10;

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
  refunds: {
    orderBy: { refundedAt: 'asc' },
    select: {
      id: true,
      number: true,
      amount: true,
      method: true,
      refundedAt: true,
      reason: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

export function formatRefundNumber(value: number): string {
  return `QT-${String(value).padStart(6, '0')}`;
}

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
  /** Qaytarilgan jami summa (qisman qaytarishlar yig‘indisi) */
  refundedAmount: number;
  refunds: Array<{
    id: string;
    /** "QT-000012" */
    code: string;
    amount: number;
    method: PaymentMethod;
    refundedAt: string;
    reason: string;
    createdBy: { id: string; firstName: string; lastName: string } | null;
  }>;
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
    refundedAmount: payment.refunds.reduce((sum, refund) => sum + refund.amount.toNumber(), 0),
    refunds: payment.refunds.map((refund) => ({
      id: refund.id,
      code: formatRefundNumber(refund.number),
      amount: refund.amount.toNumber(),
      method: refund.method,
      refundedAt: refund.refundedAt.toISOString(),
      reason: refund.reason,
      createdBy: refund.createdBy,
    })),
  };
}

/** "2026-10-01" → shu kun boshlanishi / ertangi kun boshlanishi (UTC) */
function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

function buildPaymentWhere(query: Partial<PaymentListQuery>, branch?: BranchAccess): Prisma.PaymentWhereInput {
  const conditions: Prisma.PaymentWhereInput[] = [];
  // Filial doirasi: barcha filialni ko'ra olmaydigan xodim faqat o'zinikini ko'radi
  if (branch) conditions.push(branchFilter(branch, query.branchId));
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
  // Qaytarilgan pul to'langan summadan ayiriladi
  const refunded = await tx.paymentRefund.aggregate({
    where: { payment: { studentId, deletedAt: null } },
    _sum: { amount: true },
  });
  const total = debt.totalAmount.toNumber();
  const paid = (aggregate._sum.amount?.toNumber() ?? 0) - (refunded._sum.amount?.toNumber() ?? 0);
  const remaining = Math.max(total - paid, 0);
  await tx.debt.update({
    where: { studentId },
    data: { paidAmount: paid, remainingAmount: remaining, status: debtStatusOf(total, paid) },
  });
  return { paid, remaining };
}

export const paymentService = {
  async list(actor: AuthUser, query: PaymentListQuery): Promise<{ items: PaymentDto[]; total: number }> {
    const where = buildPaymentWhere(query, await getBranchAccess(actor));
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
      { key: 'refunded', label: 'Qaytarilgan', type: 'money' },
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
      refunded: payment.refundedAmount,
      manager: payment.manager ? `${payment.manager.firstName} ${payment.manager.lastName}` : null,
      status: payment.isDeleted ? 'Bekor qilingan' : 'Faol',
      comment: payment.isDeleted ? (payment.deleteReason ?? payment.comment) : payment.comment,
    }));
    const activeSum = payments.reduce((sum, payment) => sum + (payment.isDeleted ? 0 : payment.amount), 0);
    const refundedSum = payments.reduce((sum, payment) => sum + (payment.isDeleted ? 0 : payment.refundedAmount), 0);
    return { title: 'To‘lovlar', subtitle: exportSubtitle(rows.length, total), columns, rows, totals: { amount: activeSum, refunded: refundedSum } };
  },

  /** Filtrga mos to‘lovlar yig‘indisi va usullar kesimi (sahifalashdan qat’i nazar) */
  async stats(actor: AuthUser, query: PaymentStatsQuery): Promise<PaymentStatsDto> {
    const where = buildPaymentWhere({ ...query, includeDeleted: false }, await getBranchAccess(actor));
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
  /**
   * To‘lov qabul qiladi. Takrordan himoya:
   * - `idempotencyKey` bilan qayta kelgan so‘rov yangi to‘lov yaratmaydi — mavjudi qaytadi (`replayed`);
   * - bitta o‘quvchiga parallel so‘rovlar qarz qatorini qulflab ketma-ket bajariladi, qarz qayta tekshiriladi;
   * - oxirgi daqiqalarda xuddi shu summa xuddi shu to‘lov kuni bilan qabul qilingan bo‘lsa, `confirmDuplicate` bo‘lmaguncha 409 qaytadi.
   */
  /**
   * To'lov qabul qilish.
   *
   * `actor` — to'lovni qabul qilgan xodim. **Onlayn to'lovda `null`**: pulni hech kim qo'lda
   * qabul qilmagan, shuning uchun kvitansiyada buxgalter ko'rsatilmaydi va audit egasiz yoziladi
   * (webhook tafsilotlari `payment.online_received` yozuvida qoladi).
   */
  async create(
    actor: AuthUser | null,
    input: CreatePaymentInput,
    client: ClientInfo,
  ): Promise<{ payment: PaymentDto; replayed: boolean }> {
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
        branchId: true,
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

    await assertFinancialPeriodOpen(prisma, input.paidAt ?? new Date());

    const result = await prisma.$transaction(async (tx) => {
      // Qarz qatori qulflanadi: bir o'quvchiga bir vaqtda kelgan to'lovlar ketma-ket bajariladi
      const [debt] = await tx.$queryRaw<Array<{ totalAmount: unknown; paidAmount: unknown }>>`
        SELECT "totalAmount", "paidAmount" FROM "debts" WHERE "studentId" = ${student.id} FOR UPDATE
      `;
      if (!debt) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'studentId', message: 'Bu o‘quvchida shartnoma balansi yo‘q' },
        ]);
      }

      if (input.idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, studentId: true, amount: true },
        });
        if (existing) {
          if (existing.studentId !== student.id || existing.amount.toNumber() !== input.amount) {
            throw AppError.conflict('Bu so‘rov kaliti boshqa to‘lov uchun ishlatilgan — formani qaytadan oching');
          }
          return { id: existing.id, replayed: true };
        }
      }

      const total = Number(debt.totalAmount);
      const alreadyPaid = Number(debt.paidAmount);
      if (alreadyPaid + input.amount > total) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          {
            field: 'amount',
            message: `Shartnoma bo‘yicha qolgan qarz ${total - alreadyPaid} so‘m — undan ko‘p to‘lov qabul qilinmaydi`,
          },
        ]);
      }

      const paymentDay = startOfBusinessDay(input.paidAt ?? new Date());
      const recent = await tx.payment.findFirst({
        where: {
          studentId: student.id,
          amount: input.amount,
          deletedAt: null,
          paidAt: { gte: paymentDay, lt: addDays(paymentDay, 1) },
          createdAt: { gte: new Date(Date.now() - DUPLICATE_PAYMENT_WINDOW_MINUTES * 60_000) },
        },
        orderBy: { createdAt: 'desc' },
        select: { number: true, createdAt: true },
      });
      const duplicateOf = recent ? formatPaymentNumber(recent.number) : null;
      if (recent && duplicateOf && !input.confirmDuplicate) {
        const minutes = Math.floor((Date.now() - recent.createdAt.getTime()) / 60_000);
        const when = minutes < 1 ? 'hozirgina' : `${minutes} daqiqa oldin`;
        throw AppError.conflict(`Bu o‘quvchidan xuddi shu summa ${when} qabul qilingan (${duplicateOf})`, [
          { field: 'duplicatePayment', message: duplicateOf },
        ]);
      }

      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          courseId: student.courseId,
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt ?? new Date(),
          comment: input.comment ?? null,
          managerId: student.lead?.assignedToId ?? null,
          accountantId: actor?.id ?? null,
          // O'qituvchi foizi to'lov paytidagi guruhga bog'lanadi
          groupId: student.groupId,
          teacherId: student.group?.teacherId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          // To'lov o'quvchi qaysi filialda bo'lsa, o'sha filialning tushumi hisoblanadi
          branchId: student.branchId,
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
        createdById: actor?.id ?? null,
        branchId: student.branchId,
      });
      await tx.payment.update({ where: { id: payment.id }, data: { transactionId: transaction.id } });
      await commissionService.accrueForPayment(
        tx,
        { id: payment.id, amount: input.amount, paidAt: payment.paidAt, teacherId: payment.teacherId },
        actor?.id ?? null,
      );

      const { remaining } = await recalculateDebt(tx, student.id);

      const managerId = student.lead?.assignedToId;
      if (managerId && managerId !== actor?.id) {
        await notificationService.createInTransaction(tx, {
          userId: managerId,
          type: 'NEW_PAYMENT',
          title: 'Yangi to‘lov',
          message: `${student.firstName} ${student.lastName} ${moneyUz(input.amount)} to‘lov qildi. Qolgan qarz: ${moneyUz(remaining)}.`,
          entityType: 'payment',
          entityId: payment.id,
          dedupeKey: `payment:${payment.id}`,
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: actor?.id ?? null,
        action: 'payment.created',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          receipt: formatPaymentNumber(payment.number),
          studentId: student.id,
          amount: input.amount,
          method: input.method,
          remaining,
          // Foydalanuvchi takror ogohlantirishini ko'rib, alohida to'lov ekanini tasdiqlagan
          ...(duplicateOf ? { duplicateOf } : {}),
        },
        ...client,
      });
      return { id: payment.id, replayed: false };
    });

    return { payment: await this.getById(result.id), replayed: result.replayed };
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
    if ((await prisma.paymentRefund.count({ where: { paymentId: id } })) > 0) {
      throw AppError.conflict('To‘lovning bir qismi qaytarilgan — bekor qilib bo‘lmaydi. Qolgan summani “Pulni qaytarish” orqali qaytaring');
    }
    await assertFinancialPeriodOpen(prisma, payment.paidAt);

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

  /**
   * To‘lovni to‘liq yoki qisman qaytarish. Kvitansiya o‘chirilmaydi: qaytarish alohida yozuv,
   * daftarga REFUND (kassadan chiqim); o‘quvchi qarzi va o‘qituvchi foizi mos ravishda kamayadi.
   */
  async refund(actor: AuthUser, id: string, input: RefundPaymentInput, client: ClientInfo): Promise<PaymentDto> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        studentId: true,
        amount: true,
        paidAt: true,
        teacherId: true,
        deletedAt: true,
        student: { select: { firstName: true, lastName: true } },
        refunds: { select: { amount: true } },
      },
    });
    if (!payment) {
      throw AppError.notFound('To‘lov topilmadi');
    }
    if (payment.deletedAt) {
      throw AppError.conflict('Bekor qilingan to‘lovni qaytarib bo‘lmaydi');
    }
    const refunded = payment.refunds.reduce((sum, refund) => sum + refund.amount.toNumber(), 0);
    const refundable = payment.amount.toNumber() - refunded;
    if (refundable <= 0) {
      throw AppError.conflict('To‘lov to‘liq qaytarilgan');
    }
    if (input.amount > refundable) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'amount', message: `Eng ko‘pi ${moneyUz(refundable)} qaytarish mumkin` },
      ]);
    }
    const refundedAt = new Date();
    await assertFinancialPeriodOpen(prisma, refundedAt);

    await prisma.$transaction(async (tx) => {
      const accountId = input.accountId
        ? (await tx.financialAccount.findFirst({ where: { id: input.accountId, isActive: true }, select: { id: true } }))?.id
        : await accountIdForMethod(tx, input.method);
      if (input.accountId && !accountId) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'accountId', message: 'Hisob topilmadi' }]);
      }
      if (accountId) {
        const account = await tx.financialAccount.findUniqueOrThrow({ where: { id: accountId }, select: { name: true, balance: true } });
        if (account.balance.toNumber() < input.amount) {
          throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
            { field: 'amount', message: `${account.name} hisobida yetarli mablag‘ yo‘q` },
          ]);
        }
      }

      const studentName = `${payment.student.firstName} ${payment.student.lastName}`;
      const transaction = await recordTransaction(tx, {
        type: 'REFUND',
        amount: input.amount,
        accountId: accountId ?? null,
        occurredAt: refundedAt,
        description: `To‘lov qaytarildi — ${studentName} (${formatPaymentNumber(payment.number)})`,
        categoryName: 'O‘quvchi to‘lovi qaytarildi',
        entityType: 'paymentRefund',
        createdById: actor.id,
      });
      const refund = await tx.paymentRefund.create({
        data: {
          paymentId: id,
          amount: input.amount,
          method: input.method,
          accountId: accountId ?? null,
          refundedAt,
          reason: input.reason,
          transactionId: transaction.id,
          createdById: actor.id,
        },
        select: { id: true, number: true },
      });
      await tx.transaction.update({ where: { id: transaction.id }, data: { entityId: refund.id } });

      const { remaining } = await recalculateDebt(tx, payment.studentId);
      await commissionService.reverseForRefund(
        tx,
        {
          payment: { id, number: payment.number, amount: payment.amount.toNumber(), paidAt: payment.paidAt, teacherId: payment.teacherId },
          refund: { id: refund.id, amount: input.amount },
        },
        { actorId: actor.id, reason: input.reason, client },
      );

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment.refunded',
        entityType: 'payment',
        entityId: id,
        metadata: {
          receipt: formatPaymentNumber(payment.number),
          refund: formatRefundNumber(refund.number),
          student: studentName,
          amount: input.amount,
          method: input.method,
          reason: input.reason,
          refundedTotal: refunded + input.amount,
          remaining,
        },
        ...client,
      });
    });

    return this.getById(id);
  },

};
