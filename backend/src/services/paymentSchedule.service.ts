import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString } from '../utils/dates.js';
import { allocateSchedule, buildMonthlyPlan, daysBetween } from '../utils/paymentSchedule.js';
import type { AllocatedInstallment, PlannedInstallment } from '../utils/paymentSchedule.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { GenerateScheduleInput, ReplaceScheduleInput } from '../validators/paymentSchedule.validator.js';
import { auditService } from './audit.service.js';
import { groupUz } from '../utils/money.js';

/** Muddatiga shuncha kun (bugun ham) qolgan to‘lov "yaqinlashayotgan" hisoblanadi */
export const UPCOMING_DUE_DAYS = 7;

export type InstallmentDto = AllocatedInstallment;

export interface PaymentScheduleDto {
  studentId: string;
  contractTotal: number;
  paid: number;
  scheduledTotal: number;
  /** Jadval yig‘indisi shartnomadan farq qiladi (shartnoma narxi keyin o‘zgargan) — qayta tuzish kerak */
  mismatch: boolean;
  dueToDate: number;
  overdueAmount: number;
  overdueDays: number;
  nextDue: { dueDate: string; amount: number } | null;
  installments: InstallmentDto[];
}

/** Qarzdorlar ro‘yxati va alertlar uchun jadval ko‘rsatkichlari (bazada hisoblanadi) */
export interface StudentDueStats {
  overdueAmount: number;
  /** Eng eski to‘lanmagan qismning kechikishi (kun) */
  overdueDays: number;
  /** Bugun yoki keyin keladigan eng yaqin to‘lanmagan muddat */
  nextDueDate: string | null;
  /** Keyingi {@link UPCOMING_DUE_DAYS} kun ichida (bugun ham) to‘lanishi kerak bo‘lgan summa */
  upcomingAmount: number;
}

type Tx = Prisma.TransactionClient;

/** Juda ko‘p o‘quvchi bo‘lsa IN ro‘yxati o‘rniga hammasi hisoblanib, JS'da ajratiladi */
const MAX_FILTER_IDS = 5000;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function writeInstallments(
  tx: Tx,
  studentId: string,
  plan: Array<PlannedInstallment & { note?: string | null }>,
): Promise<void> {
  await tx.paymentInstallment.deleteMany({ where: { studentId } });
  if (plan.length === 0) return;
  await tx.paymentInstallment.createMany({
    data: plan.map((item) => ({
      studentId,
      sequence: item.sequence,
      dueDate: dateOnly(item.dueDate),
      amount: item.amount,
      note: item.note ?? null,
    })),
  });
}

/** Yangi o‘quvchi uchun standart jadval: kurs davomiyligi bo‘yicha oylik, birinchi muddat — o‘qish boshlangan kun */
export async function createDefaultSchedule(
  tx: Tx,
  input: { studentId: string; total: number; months: number; startDate: Date },
): Promise<number> {
  const plan = buildMonthlyPlan(input.total, input.months, input.startDate.toISOString().slice(0, 10));
  await writeInstallments(tx, input.studentId, plan);
  return plan.length;
}

async function loadStudent(id: string): Promise<{ id: string; total: number; paid: number }> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, debt: { select: { totalAmount: true, paidAmount: true } } },
  });
  if (!student) {
    throw AppError.notFound('O‘quvchi topilmadi');
  }
  if (!student.debt) {
    throw AppError.unprocessable('Bu o‘quvchida shartnoma balansi yo‘q');
  }
  return { id: student.id, total: student.debt.totalAmount.toNumber(), paid: student.debt.paidAmount.toNumber() };
}

const formatSum = (value: number) => groupUz(value);

/**
 * Jadvali bor o‘quvchilar bo‘yicha ko‘rsatkichlar. To‘langan summa qismlarga muddat tartibida
 * taqsimlanadi (`allocateSchedule` bilan bir xil qoida) — hisob bitta SQL so‘rovda.
 */
export async function scheduleDueStats(now: Date = new Date(), studentIds?: string[]): Promise<Map<string, StudentDueStats>> {
  if (studentIds && studentIds.length === 0) return new Map();
  const today = businessDateString(now);
  const weekEnd = businessDateString(addDays(now, UPCOMING_DUE_DAYS));
  const useFilter = studentIds !== undefined && studentIds.length <= MAX_FILTER_IDS;
  const filter = useFilter ? Prisma.sql`AND i."studentId" IN (${Prisma.join(studentIds)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{ studentId: string; overdueAmount: unknown; firstUnpaidDue: string | null; nextDueDate: string | null; upcomingAmount: unknown }>
  >`
    WITH ordered AS (
      SELECT i."studentId", i."dueDate", i."amount",
        SUM(i."amount") OVER (PARTITION BY i."studentId" ORDER BY i."dueDate", i."sequence") AS "cumulative"
      FROM "payment_installments" i
      JOIN "students" s ON s."id" = i."studentId" AND s."deletedAt" IS NULL
      WHERE TRUE ${filter}
    ), allocated AS (
      SELECT o."studentId", o."dueDate",
        LEAST(o."amount", GREATEST(o."cumulative" - d."paidAmount", 0)) AS "remaining"
      FROM ordered o
      JOIN "debts" d ON d."studentId" = o."studentId"
    )
    SELECT a."studentId",
      COALESCE(SUM(a."remaining") FILTER (WHERE a."dueDate" < ${today}::date), 0) AS "overdueAmount",
      to_char(MIN(a."dueDate") FILTER (WHERE a."remaining" > 0), 'YYYY-MM-DD') AS "firstUnpaidDue",
      to_char(MIN(a."dueDate") FILTER (WHERE a."remaining" > 0 AND a."dueDate" >= ${today}::date), 'YYYY-MM-DD') AS "nextDueDate",
      COALESCE(SUM(a."remaining") FILTER (WHERE a."dueDate" >= ${today}::date AND a."dueDate" <= ${weekEnd}::date), 0) AS "upcomingAmount"
    FROM allocated a
    GROUP BY a."studentId"
  `;

  const allowed = studentIds && !useFilter ? new Set(studentIds) : null;
  const result = new Map<string, StudentDueStats>();
  for (const row of rows) {
    if (allowed && !allowed.has(row.studentId)) continue;
    const overdueAmount = Number(row.overdueAmount ?? 0);
    result.set(row.studentId, {
      overdueAmount,
      overdueDays: overdueAmount > 0 && row.firstUnpaidDue ? Math.max(daysBetween(row.firstUnpaidDue, today), 0) : 0,
      nextDueDate: row.nextDueDate,
      upcomingAmount: Number(row.upcomingAmount ?? 0),
    });
  }
  return result;
}

export const paymentScheduleService = {
  async get(studentId: string, now: Date = new Date()): Promise<PaymentScheduleDto> {
    const student = await loadStudent(studentId);
    const rows = await prisma.paymentInstallment.findMany({
      where: { studentId },
      orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
      select: { id: true, sequence: true, dueDate: true, amount: true, note: true },
    });
    const { installments, totals } = allocateSchedule(
      rows.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        dueDate: row.dueDate.toISOString().slice(0, 10),
        amount: row.amount.toNumber(),
        note: row.note,
      })),
      student.paid,
      businessDateString(now),
    );

    return {
      studentId: student.id,
      contractTotal: student.total,
      paid: student.paid,
      scheduledTotal: totals.scheduledTotal,
      mismatch: rows.length > 0 && totals.scheduledTotal !== student.total,
      dueToDate: totals.dueToDate,
      overdueAmount: totals.overdueAmount,
      overdueDays: totals.overdueDays,
      nextDue: totals.nextDue,
      installments,
    };
  },

  /** Shartnoma summasidan oylik teng qismlar — mavjud jadval almashtiriladi */
  async generate(actor: AuthUser, studentId: string, input: GenerateScheduleInput, client: ClientInfo): Promise<PaymentScheduleDto> {
    const student = await loadStudent(studentId);
    if (student.total <= 0) {
      throw AppError.unprocessable('Shartnoma summasi nol — to‘lov jadvali tuzilmaydi');
    }
    const plan = buildMonthlyPlan(student.total, input.count, input.firstDueDate);

    await prisma.$transaction(async (tx) => {
      const replaced = await tx.paymentInstallment.count({ where: { studentId } });
      await writeInstallments(tx, studentId, plan);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment_schedule.generated',
        entityType: 'student',
        entityId: studentId,
        metadata: { count: plan.length, firstDueDate: input.firstDueDate, total: student.total, replaced },
        ...client,
      });
    });

    return this.get(studentId);
  },

  /** Qo‘lda tuzilgan jadval: qismlar yig‘indisi shartnoma summasiga teng bo‘lishi shart */
  async replace(actor: AuthUser, studentId: string, input: ReplaceScheduleInput, client: ClientInfo): Promise<PaymentScheduleDto> {
    const student = await loadStudent(studentId);
    const total = input.installments.reduce((sum, item) => sum + item.amount, 0);
    if (total !== student.total) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        {
          field: 'installments',
          message: `Qismlar yig‘indisi (${formatSum(total)} so‘m) shartnoma summasiga (${formatSum(student.total)} so‘m) teng bo‘lishi kerak`,
        },
      ]);
    }

    await prisma.$transaction(async (tx) => {
      await writeInstallments(
        tx,
        studentId,
        input.installments.map((item, index) => ({ sequence: index + 1, dueDate: item.dueDate, amount: item.amount, note: item.note ?? null })),
      );
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment_schedule.updated',
        entityType: 'student',
        entityId: studentId,
        metadata: { count: input.installments.length, total },
        ...client,
      });
    });

    return this.get(studentId);
  },
};
