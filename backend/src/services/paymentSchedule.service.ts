import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString } from '../utils/dates.js';
import { BILLING_START_MONTH, allocateSchedule, buildFixedMonthlyPlan, daysBetween } from '../utils/paymentSchedule.js';
import type { AllocatedInstallment, PlannedInstallment } from '../utils/paymentSchedule.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CancelChargesInput, GenerateScheduleInput, ReplaceScheduleInput } from '../validators/paymentSchedule.validator.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { chargeStatus, monthOfDate, parsePeriodKey, periodKeyOf } from '../utils/billingLedger.js';
import type { ChargeStatus } from '../utils/billingLedger.js';
import { currentBusinessMonth } from '../utils/dates.js';
import { auditService } from './audit.service.js';
import { explicitByMonth, installmentPositionsSql, ledgerOf, loadLedgerInputs } from './billingLedger.service.js';
import { lockStudentContract } from './debtLock.js';
import { groupUz } from '../utils/money.js';

/** Muddatiga shuncha kun (bugun ham) qolgan to‘lov "yaqinlashayotgan" hisoblanadi */
export const UPCOMING_DUE_DAYS = 7;

export interface InstallmentDto extends AllocatedInstallment {
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Moliyaviy oyi yopilgan — jadvalni qayta tuzishda o'zgarmaydi */
  locked: boolean;
}

/** Oylik majburiyat: shu oyga tushgan qismlar yig'indisi */
export interface ScheduleMonthDto {
  /** "2026-10" */
  key: string;
  year: number;
  month: number;
  amount: number;
  paid: number;
  remaining: number;
  cancelledAmount: number;
  /** Shu oyga aniq biriktirilgan to'lov (qolgani — biriktirilmagan eski to'lovlardan muddat tartibida) */
  allocated: number;
  status: ChargeStatus;
}

function debtStatus(total: number, paid: number): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}

export interface PaymentScheduleDto {
  studentId: string;
  /** Oylik to'lov (`Student.contractPrice`) — har oy shu summa */
  monthlyFee: number;
  /** Shartnoma jami summasi = jadvaldagi bekor qilinmagan oylar yig'indisi */
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
  months: ScheduleMonthDto[];
}

/** Qarzdorlar ro‘yxati va alertlar uchun jadval ko‘rsatkichlari (bazada hisoblanadi) */
export interface StudentDueStats {
  overdueAmount: number;
  /** To'lov kuni o'tgan oylar summasi (to'langan-to'lanmaganidan qat'i nazar) — qarz ulushi uchun maxraj */
  chargedAmount: number;
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

/** Moliyaviy oyi yopilgan/qulflangan oylar ("2026-10") — ularning qismlari jadvalni qayta tuzishda saqlanadi */
async function closedMonthKeys(tx: Tx | typeof prisma): Promise<Set<string>> {
  const rows = await tx.financialPeriod.findMany({ where: { status: { not: 'OPEN' } }, select: { year: true, month: true } });
  return new Set(rows.map((row) => periodKeyOf(row.year, row.month)));
}

interface KeptInstallments {
  ids: string[];
  sequences: Set<number>;
  /** Saqlanadigan, bekor qilinmagan qismlar yig'indisi (yopilgan oylar) */
  activeTotal: number;
  closed: Set<string>;
}

/** Qayta tuzishda tegilmaydigan qismlar: bekor qilinganlar va yopilgan oylardagilar (o'tgan oy majburiyati o'zgarmaydi) */
async function keptInstallments(tx: Tx | typeof prisma, studentId: string): Promise<KeptInstallments> {
  const closed = await closedMonthKeys(tx);
  const rows = await tx.paymentInstallment.findMany({
    where: { studentId },
    select: { id: true, sequence: true, dueDate: true, amount: true, cancelledAt: true },
  });
  const kept = rows.filter((row) => row.cancelledAt !== null || closed.has(monthOfDate(row.dueDate.toISOString().slice(0, 10))));
  return {
    ids: kept.map((row) => row.id),
    sequences: new Set(kept.map((row) => row.sequence)),
    activeTotal: kept.filter((row) => row.cancelledAt === null).reduce((sum, row) => sum + row.amount.toNumber(), 0),
    closed,
  };
}

async function writeInstallments(
  tx: Tx,
  studentId: string,
  plan: Array<PlannedInstallment & { note?: string | null }>,
  kept: Pick<KeptInstallments, 'ids' | 'sequences'> = { ids: [], sequences: new Set() },
): Promise<void> {
  await tx.paymentInstallment.deleteMany({ where: { studentId, id: { notIn: kept.ids } } });
  if (plan.length === 0) return;
  // Saqlangan qismlar tartib raqamini band qiladi — yangilari bo'sh raqamlarni oladi
  let next = 1;
  const takeSequence = () => {
    while (kept.sequences.has(next)) next += 1;
    return next++;
  };
  await tx.paymentInstallment.createMany({
    data: plan.map((item) => ({
      studentId,
      sequence: takeSequence(),
      dueDate: dateOnly(item.dueDate),
      amount: item.amount,
      note: item.note ?? null,
    })),
  });
}

/** Yopilgan oyga tushadigan yangi qism rad etiladi */
function assertPlanInOpenMonths(plan: Array<{ dueDate: string }>, closed: Set<string>, field: string): void {
  const hit = plan.find((item) => closed.has(monthOfDate(item.dueDate)));
  if (hit) {
    const { year, month } = parsePeriodKey(monthOfDate(hit.dueDate));
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field, message: `${formatSalaryPeriod(year, month)} moliyaviy oyi yopilgan — bu oyga qism qo‘shib yoki o‘zgartirib bo‘lmaydi` },
    ]);
  }
}

/** Qayta tuzilgan jadvalda oy summasi shu oyga biriktirilgan to'lovdan kam bo'lmasligi kerak */
async function assertAllocationsFit(tx: Tx, studentId: string, field: string): Promise<void> {
  const explicit = await explicitByMonth(tx, studentId);
  if (explicit.size === 0) return;
  const rows = await tx.paymentInstallment.findMany({ where: { studentId, cancelledAt: null }, select: { dueDate: true, amount: true } });
  const charges = new Map<string, number>();
  for (const row of rows) {
    const key = monthOfDate(row.dueDate.toISOString().slice(0, 10));
    charges.set(key, (charges.get(key) ?? 0) + row.amount.toNumber());
  }
  for (const [key, allocated] of explicit) {
    if (allocated > (charges.get(key) ?? 0)) {
      const { year, month } = parsePeriodKey(key);
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        {
          field,
          message: `${formatSalaryPeriod(year, month)} uchun ${formatSum(allocated)} so‘m to‘lov biriktirilgan — bu oy summasi undan kam bo‘lishi mumkin emas`,
        },
      ]);
    }
  }
}

/**
 * Shartnoma jami summasi = jadvaldagi bekor qilinmagan oylar yig'indisi (`Student.contractPrice` — **oylik** to'lov).
 * Jadval o'zgargan har safar qarz balansi (`Debt`) shu bilan qayta hisoblanadi; to'langan summa saqlanadi.
 */
export async function syncContractTotal(tx: Tx, studentId: string): Promise<number> {
  const [sum, rows, debt, student] = await Promise.all([
    tx.paymentInstallment.aggregate({ where: { studentId, cancelledAt: null }, _sum: { amount: true } }),
    tx.paymentInstallment.count({ where: { studentId } }),
    tx.debt.findUnique({ where: { studentId }, select: { paidAmount: true } }),
    tx.student.findUnique({ where: { id: studentId }, select: { contractPrice: true } }),
  ]);
  // Jadvali umuman yo'q o'quvchi (eski yozuv) — shartnoma bitta oylik to'lovga teng
  const total = rows === 0 ? (student?.contractPrice.toNumber() ?? 0) : (sum._sum.amount?.toNumber() ?? 0);
  if (!debt) return total;
  const paid = debt.paidAmount.toNumber();
  await tx.debt.update({
    where: { studentId },
    data: { totalAmount: total, remainingAmount: Math.max(total - paid, 0), status: debtStatus(total, paid) },
  });
  return total;
}

/**
 * Oylik to'lov o'zgardi (chegirma, narx tahriri, taklif bonusi): joriy va kelgusi oylar summasi yangi oylik to'lovga
 * tenglanadi. O'tgan oylar (muddati o'tgan qarz) va yopilgan moliyaviy oylar o'zgarmaydi; bir oyda bir nechta qism
 * bo'lsa (qo'lda tuzilgan) — tegilmaydi. Keyin shartnoma jami summasi qayta hisoblanadi.
 */
export async function applyMonthlyFee(tx: Tx, studentId: string, monthly: number, now: Date = new Date()): Promise<void> {
  const current = currentBusinessMonth(now);
  const fromKey = periodKeyOf(current.year, current.month);
  const [rows, closed] = await Promise.all([
    tx.paymentInstallment.findMany({ where: { studentId, cancelledAt: null }, select: { id: true, dueDate: true, amount: true } }),
    closedMonthKeys(tx),
  ]);
  const byMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = monthOfDate(row.dueDate.toISOString().slice(0, 10));
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }
  const ids = [...byMonth]
    .filter(([key, list]) => key >= fromKey && !closed.has(key) && list.length === 1 && list[0]!.amount.toNumber() !== monthly)
    .map(([, list]) => list[0]!.id);
  if (ids.length > 0 && monthly > 0) {
    await tx.paymentInstallment.updateMany({ where: { id: { in: ids } }, data: { amount: monthly } });
    await assertAllocationsFit(tx, studentId, 'contractPrice');
  }
  await syncContractTotal(tx, studentId);
}

/** Muzlatish vaqtida yozilmagan oylar shu sabab bilan bekor qilinadi — qayta faollashtirilganda aynan shular tiklanadi */
export const FREEZE_CANCEL_REASON = 'Muzlatilgan — to‘lov yozilmaydi';

/**
 * O'quvchi muzlatildi: `from` (bugun) va undan keyingi muddatli, to'lov tushmagan oylar bekor qilinadi — muzlatilgan
 * davrda qarz yozilmaydi. Muzlatishgacha muddati kelgan oylar qarz bo'lib qoladi; yopilgan oylar tegilmaydi.
 */
export async function freezeCharges(tx: Tx, studentId: string, from: string, actorId: string | null, now: Date = new Date()): Promise<number> {
  const [inputs, closed] = await Promise.all([loadLedgerInputs(tx, [studentId]), closedMonthKeys(tx)]);
  const paidByMonth = new Map(ledgerOf(inputs.get(studentId)!).months.map((month) => [month.key, month.paid]));
  const ids = inputs
    .get(studentId)!
    .installments.filter((row) => !row.cancelled && row.dueDate >= from)
    .filter((row) => {
      const key = monthOfDate(row.dueDate);
      return !closed.has(key) && (paidByMonth.get(key) ?? 0) <= 0;
    })
    .map((row) => row.id);
  if (ids.length > 0) {
    await tx.paymentInstallment.updateMany({
      where: { id: { in: ids }, cancelledAt: null },
      data: { cancelledAt: now, cancelledById: actorId, cancelReason: FREEZE_CANCEL_REASON },
    });
  }
  await syncContractTotal(tx, studentId);
  return ids.length;
}

/**
 * Muzlatishdan qaytdi: muzlatish sababli bekor qilingan, muddati `from` (bugun) va undan keyingi oylar tiklanadi —
 * to'lov shu kundan davom etadi. Muzlatilgan davrdagi oylar bekor bo'lib qoladi.
 */
export async function unfreezeCharges(tx: Tx, studentId: string, from: string): Promise<number> {
  const closed = await closedMonthKeys(tx);
  const rows = await tx.paymentInstallment.findMany({
    where: { studentId, cancelReason: FREEZE_CANCEL_REASON, cancelledAt: { not: null }, dueDate: { gte: dateOnly(from) } },
    select: { id: true, dueDate: true },
  });
  const ids = rows.filter((row) => !closed.has(monthOfDate(row.dueDate.toISOString().slice(0, 10)))).map((row) => row.id);
  if (ids.length > 0) {
    await tx.paymentInstallment.updateMany({ where: { id: { in: ids } }, data: { cancelledAt: null, cancelledById: null, cancelReason: null } });
  }
  await syncContractTotal(tx, studentId);
  return ids.length;
}

/**
 * Yangi o‘quvchi uchun standart jadval: kurs davomiyligicha har oyga to'liq oylik to'lov, birinchi muddat — o‘qish
 * boshlangan kun (to'lov kuni). {@link BILLING_START_MONTH} dan oldingi oylar qo'shilmaydi.
 */
export async function createDefaultSchedule(
  tx: Tx,
  input: { studentId: string; monthly: number; months: number; startDate: Date },
): Promise<number> {
  const plan = buildFixedMonthlyPlan(input.monthly, input.months, input.startDate.toISOString().slice(0, 10));
  await writeInstallments(tx, input.studentId, plan);
  await syncContractTotal(tx, input.studentId);
  return plan.length;
}

async function loadStudent(id: string): Promise<{ id: string; total: number; paid: number; monthly: number }> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, contractPrice: true, debt: { select: { totalAmount: true, paidAmount: true } } },
  });
  if (!student) {
    throw AppError.notFound('O‘quvchi topilmadi');
  }
  if (!student.debt) {
    throw AppError.unprocessable('Bu o‘quvchida shartnoma balansi yo‘q');
  }
  return {
    id: student.id,
    total: student.debt.totalAmount.toNumber(),
    paid: student.debt.paidAmount.toNumber(),
    monthly: student.contractPrice.toNumber(),
  };
}

const formatSum = (value: number) => groupUz(value);

/**
 * Jadvali bor o‘quvchilar bo‘yicha ko‘rsatkichlar. Avval oyga biriktirilgan to'lovlar, qolgani muddat tartibida
 * taqsimlanadi (`allocateSchedule` bilan bir xil qoida) — hisob bitta SQL so‘rovda.
 */
export async function scheduleDueStats(now: Date = new Date(), studentIds?: string[]): Promise<Map<string, StudentDueStats>> {
  if (studentIds && studentIds.length === 0) return new Map();
  const today = businessDateString(now);
  const weekEnd = businessDateString(addDays(now, UPCOMING_DUE_DAYS));
  const useFilter = studentIds !== undefined && studentIds.length <= MAX_FILTER_IDS;
  const filter = useFilter ? Prisma.sql`AND i."studentId" IN (${Prisma.join(studentIds)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{ studentId: string; overdueAmount: unknown; chargedAmount: unknown; firstUnpaidDue: string | null; nextDueDate: string | null; upcomingAmount: unknown }>
  >`
    WITH allocated AS (${installmentPositionsSql(filter)})
    SELECT a."studentId",
      COALESCE(SUM(a."remaining") FILTER (WHERE a."dueDate" < ${today}::date), 0) AS "overdueAmount",
      COALESCE(SUM(a."amount") FILTER (WHERE a."dueDate" < ${today}::date), 0) AS "chargedAmount",
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
      chargedAmount: Number(row.chargedAmount ?? 0),
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
    const [rows, explicit, closed] = await Promise.all([
      prisma.paymentInstallment.findMany({
        where: { studentId },
        orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
        select: { id: true, sequence: true, dueDate: true, amount: true, note: true, cancelledAt: true, cancelReason: true },
      }),
      explicitByMonth(prisma, studentId),
      closedMonthKeys(prisma),
    ]);
    const meta = new Map(rows.map((row) => [row.id, row]));
    const { installments, totals } = allocateSchedule(
      rows.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        dueDate: row.dueDate.toISOString().slice(0, 10),
        amount: row.amount.toNumber(),
        note: row.note,
        cancelled: row.cancelledAt !== null,
      })),
      student.paid,
      businessDateString(now),
      explicit,
    );

    const items: InstallmentDto[] = installments.map((item) => {
      const row = meta.get(item.id);
      return {
        ...item,
        cancelledAt: row?.cancelledAt?.toISOString() ?? null,
        cancelReason: row?.cancelReason ?? null,
        locked: closed.has(monthOfDate(item.dueDate)),
      };
    });

    const months = new Map<string, ScheduleMonthDto>();
    for (const item of items) {
      const key = monthOfDate(item.dueDate);
      const { year, month } = parsePeriodKey(key);
      const entry = months.get(key) ?? { key, year, month, amount: 0, paid: 0, remaining: 0, cancelledAmount: 0, allocated: 0, status: 'UNPAID' };
      if (item.status === 'CANCELLED') entry.cancelledAmount += item.amount;
      else {
        entry.amount += item.amount;
        entry.paid += item.paid;
        entry.remaining += item.remaining;
      }
      months.set(key, entry);
    }
    for (const entry of months.values()) {
      entry.allocated = Math.max(explicit.get(entry.key) ?? 0, 0);
      entry.status = chargeStatus(entry.amount, entry.paid, entry.cancelledAmount);
    }

    return {
      studentId: student.id,
      monthlyFee: student.monthly,
      contractTotal: student.total,
      paid: student.paid,
      scheduledTotal: totals.scheduledTotal,
      mismatch: rows.length > 0 && totals.scheduledTotal !== student.total,
      dueToDate: totals.dueToDate,
      overdueAmount: totals.overdueAmount,
      overdueDays: totals.overdueDays,
      nextDue: totals.nextDue,
      installments: items,
      months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
  },

  /**
   * Oylik jadval: `count` oy, har oyga to'liq oylik to'lov (`contractPrice`), birinchi muddat — to'lov kuni. Mavjud
   * jadval almashtiriladi; bekor qilingan qismlar va yopilgan oylar qismlari saqlanadi (o'sha oylar takrorlanmaydi).
   * Shartnoma jami summasi jadvaldan qayta hisoblanadi.
   */
  async generate(actor: AuthUser, studentId: string, input: GenerateScheduleInput, client: ClientInfo): Promise<PaymentScheduleDto> {
    const student = await loadStudent(studentId);
    if (student.monthly <= 0) {
      throw AppError.unprocessable('Oylik to‘lov nol — to‘lov jadvali tuzilmaydi');
    }

    await prisma.$transaction(async (tx) => {
      const kept = await keptInstallments(tx, studentId);
      const keptMonths = new Set(
        (await tx.paymentInstallment.findMany({ where: { id: { in: kept.ids } }, select: { dueDate: true } })).map((row) => monthOfDate(row.dueDate.toISOString().slice(0, 10))),
      );
      const plan = buildFixedMonthlyPlan(student.monthly, input.count, input.firstDueDate).filter((item) => !keptMonths.has(monthOfDate(item.dueDate)));
      if (plan.length === 0) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'firstDueDate', message: 'Tanlangan oylar uchun yangi qism yo‘q (oktyabr 2026 dan oldingi yoki yopilgan oylar)' },
        ]);
      }
      assertPlanInOpenMonths(plan, kept.closed, 'firstDueDate');
      const replaced = await tx.paymentInstallment.count({ where: { studentId, id: { notIn: kept.ids } } });
      await writeInstallments(tx, studentId, plan, kept);
      await assertAllocationsFit(tx, studentId, 'firstDueDate');
      const total = await syncContractTotal(tx, studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment_schedule.generated',
        entityType: 'student',
        entityId: studentId,
        metadata: { count: plan.length, firstDueDate: input.firstDueDate, monthly: student.monthly, totalBefore: student.total, total, replaced, kept: kept.ids.length },
        ...client,
      });
    });

    return this.get(studentId);
  },

  /**
   * Qo‘lda tuzilgan jadval (masalan, bir oy boshqa summa). Shartnoma jami summasi = qismlar (+ saqlanadigan yopilgan
   * oylar) yig'indisi; u to'langan summadan kam bo'lmasligi kerak.
   */
  async replace(actor: AuthUser, studentId: string, input: ReplaceScheduleInput, client: ClientInfo): Promise<PaymentScheduleDto> {
    const student = await loadStudent(studentId);

    await prisma.$transaction(async (tx) => {
      const kept = await keptInstallments(tx, studentId);
      const total = input.installments.reduce((sum, item) => sum + item.amount, 0);
      const early = input.installments.find((item) => monthOfDate(item.dueDate) < BILLING_START_MONTH);
      if (early) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'installments', message: `To‘lov hisobi ${formatSalaryPeriod(parsePeriodKey(BILLING_START_MONTH).year, parsePeriodKey(BILLING_START_MONTH).month)} dan boshlanadi — undan oldingi oyga qism qo‘shilmaydi` },
        ]);
      }
      if (total + kept.activeTotal < student.paid) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          {
            field: 'installments',
            message: `Jadval yig‘indisi (${formatSum(total + kept.activeTotal)} so‘m) to‘langan summadan (${formatSum(student.paid)} so‘m) kam bo‘lmasin`,
          },
        ]);
      }
      assertPlanInOpenMonths(input.installments, kept.closed, 'installments');
      await writeInstallments(
        tx,
        studentId,
        input.installments.map((item, index) => ({ sequence: index + 1, dueDate: item.dueDate, amount: item.amount, note: item.note ?? null })),
        kept,
      );
      await assertAllocationsFit(tx, studentId, 'installments');
      const contractTotal = await syncContractTotal(tx, studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment_schedule.updated',
        entityType: 'student',
        entityId: studentId,
        metadata: { count: input.installments.length, total, totalBefore: student.total, contractTotal, kept: kept.ids.length },
        ...client,
      });
    });

    return this.get(studentId);
  },

  /**
   * Oy majburiyatlarini bekor qilish (qaror 3 — masalan, o'quvchi ketgach kelgusi oylar). Faqat joriy va kelgusi oylar,
   * to'lov tushmagan oylar. Qismlar o'chirilmaydi (`cancelledAt`), shartnoma narxi bekor qilingan summaga kamayadi,
   * qarz qayta hisoblanadi. Sabab va audit majburiy.
   */
  async cancel(actor: AuthUser, studentId: string, input: CancelChargesInput, client: ClientInfo, now: Date = new Date()): Promise<PaymentScheduleDto> {
    await loadStudent(studentId);
    const current = currentBusinessMonth(now);
    const currentKey = periodKeyOf(current.year, current.month);
    const past = input.months.find((key) => key < currentKey);
    if (past) {
      const { year, month } = parsePeriodKey(past);
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'months', message: `${formatSalaryPeriod(year, month)} o‘tib ketgan — faqat joriy va kelgusi oylar bekor qilinadi` },
      ]);
    }

    await prisma.$transaction(async (tx) => {
      const locked = await lockStudentContract(tx, studentId);
      if (!locked.debt) throw AppError.unprocessable('Bu o‘quvchida shartnoma balansi yo‘q');
      const inputs = (await loadLedgerInputs(tx, [studentId])).get(studentId)!;
      const ledger = ledgerOf(inputs);
      const byKey = new Map(ledger.months.map((month) => [month.key, month]));
      let cancelled = 0;
      for (const key of input.months) {
        const month = byKey.get(key);
        const { year, month: monthNumber } = parsePeriodKey(key);
        const label = formatSalaryPeriod(year, monthNumber);
        if (!month || month.charge <= 0) {
          throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'months', message: `${label} uchun bekor qilinadigan majburiyat yo‘q` }]);
        }
        if (month.paid > 0) {
          throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
            { field: 'months', message: `${label} uchun ${formatSum(month.paid)} so‘m to‘langan — bu oyni bekor qilib bo‘lmaydi` },
          ]);
        }
        cancelled += month.charge;
      }

      const cancelledAt = new Date();
      const ids = inputs.installments
        .filter((row) => row.cancelledAt === null && input.months.includes(monthOfDate(row.dueDate)))
        .map((row) => row.id);
      await tx.paymentInstallment.updateMany({
        where: { id: { in: ids }, cancelledAt: null },
        data: { cancelledAt, cancelledById: actor.id, cancelReason: input.reason },
      });

      // Oylik to'lov (contractPrice) o'zgarmaydi — shartnoma jami summasi bekor qilingan oylarsiz qayta hisoblanadi
      const contractTotal = await syncContractTotal(tx, studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment_schedule.cancelled',
        entityType: 'student',
        entityId: studentId,
        metadata: {
          months: input.months.map((key) => {
            const { year, month } = parsePeriodKey(key);
            return formatSalaryPeriod(year, month);
          }),
          amount: cancelled,
          reason: input.reason,
          monthly: locked.contractPrice,
          contractTotalAfter: contractTotal,
        },
        ...client,
      });
    });

    return this.get(studentId, now);
  },
};
