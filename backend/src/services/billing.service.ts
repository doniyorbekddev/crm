import { prisma } from '../config/database.js';
import { PAYMENT_METHOD_LABELS, formatPaymentNumber } from '../config/paymentLabels.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { PaymentMethod, Prisma, StudentStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { monthOfDate, parsePeriodKey, periodKeyOf } from '../utils/billingLedger.js';
import type { ChargeStatus, StudentLedger } from '../utils/billingLedger.js';
import { businessDateString, businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import { daysBetween } from '../utils/paymentSchedule.js';
import type { BillingReportQuery, MonthlyDebtorsQuery, OutstandingDebtsQuery } from '../validators/billing.validator.js';
import { assertBranchAccess, getBranchAccess } from './branchAccess.js';
import { ledgerOf, loadLedgerInputs } from './billingLedger.service.js';
import type { LedgerInputs } from './billingLedger.service.js';

/**
 * Oylik majburiyatlar va tarixiy qarzdorlik (qoida — `utils/billingLedger.ts`):
 *  A. tanlangan oy qarzdorlari (hozir va oy oxiridagi holat);
 *  B. barcha oylardan qolgan, muddati kelgan qarzlar;
 *  C. o'quvchi qarz tarixi (oy majburiyati, to'lovlar, qachon yopilgani);
 *  hisobot: hisoblangan / shu oy uchun yig'ilgan / kassa tushumi / qarz — bir-biridan alohida.
 *
 * O'quvchi guruhi va o'qituvchisi — hozirgi (guruh o'qituvchisi tarixi saqlanmaydi).
 */

interface BillingFilter {
  groupId?: string | undefined;
  courseId?: string | undefined;
  teacherId?: string | undefined;
  search?: string | undefined;
}

const studentSelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  phone: true,
  parentPhone: true,
  status: true,
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, teacher: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export interface BillingStudentDto {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  parentPhone: string | null;
  status: StudentStatus;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
}

function toStudentDto(student: StudentRow): BillingStudentDto {
  return {
    id: student.id,
    code: formatStudentNumber(student.number),
    firstName: student.firstName,
    lastName: student.lastName,
    phone: student.phone,
    parentPhone: student.parentPhone,
    status: student.status,
    course: student.course,
    group: student.group ? { id: student.group.id, name: student.group.name } : null,
    teacher: student.group?.teacher ?? null,
  };
}

function studentWhere(filter: BillingFilter, scope: Prisma.StudentWhereInput): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [{ deletedAt: null, ...scope }];
  if (filter.courseId) conditions.push({ courseId: filter.courseId });
  if (filter.groupId) conditions.push({ groupId: filter.groupId });
  if (filter.teacherId) conditions.push({ group: { teacherId: filter.teacherId } });
  const search = filter.search?.trim();
  if (search) {
    const or: Prisma.StudentWhereInput[] = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 2) or.push({ phone: { contains: digits } }, { parentPhone: { contains: digits } });
    const numberMatch = /^(?:st-?)?0*(\d{1,9})$/i.exec(search);
    if (numberMatch?.[1]) or.push({ number: Number(numberMatch[1]) });
    conditions.push({ OR: or });
  }
  return { AND: conditions };
}

async function loadStudents(filter: BillingFilter, scope: Prisma.StudentWhereInput): Promise<{ students: StudentRow[]; inputs: Map<string, LedgerInputs> }> {
  const students = await prisma.student.findMany({
    where: { AND: [studentWhere(filter, scope), { installments: { some: {} } }] },
    select: studentSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const inputs = await loadLedgerInputs(
    prisma,
    students.map((student) => student.id),
  );
  return { students, inputs };
}

/** Oy oxiri (oxirgi millisekund) — "shu oy oxiridagi holat"; oy hali tugamagan bo'lsa null */
function periodEndMoment(key: string, now: Date): Date | null {
  const { year, month } = parsePeriodKey(key);
  const { end } = businessMonthRange(year, month);
  return end.getTime() <= now.getTime() ? new Date(end.getTime() - 1) : null;
}

function inRange(value: number, min?: number, max?: number): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function paginate<T>(items: T[], page: number, limit: number): T[] {
  return items.slice((page - 1) * limit, page * limit);
}

const fullName = (item: { student: BillingStudentDto }) => `${item.student.firstName} ${item.student.lastName}`;

// ------------------------------------------------------------------------------------------------
// A. Tanlangan oy
// ------------------------------------------------------------------------------------------------

export interface MonthlyDebtorDto {
  student: BillingStudentDto;
  period: string;
  dueDate: string;
  /** Muddat keldimi (bugun yoki oldin) */
  due: boolean;
  charge: number;
  cancelledAmount: number;
  paid: number;
  remaining: number;
  status: ChargeStatus;
  /** Oy oxiridagi qoldiq (oy tugamagan bo'lsa null) */
  remainingAtPeriodEnd: number | null;
  /** Oy tugagandan keyin shu oy uchun to'langan */
  paidAfterPeriod: number | null;
  closedAt: string | null;
}

export interface MonthlyDebtorsSummaryDto {
  period: string;
  label: string;
  periodEnded: boolean;
  students: number;
  /** Muddati kelgan, qoldig'i bor */
  debtors: number;
  /** Qoldig'i bor, muddati hali kelmagan */
  upcoming: number;
  charge: number;
  cancelled: number;
  paid: number;
  /** Muddati kelgan qoldiq (qarz) */
  dueRemaining: number;
  /** Jami qoldiq (muddati kelmaganlar ham) */
  remaining: number;
  remainingAtPeriodEnd: number | null;
  paidAfterPeriod: number | null;
  byStatus: Record<ChargeStatus, number>;
}

function monthlyRows(students: StudentRow[], inputs: Map<string, LedgerInputs>, period: string, now: Date): MonthlyDebtorDto[] {
  const atEnd = periodEndMoment(period, now);
  const today = businessDateString(now);
  const rows: MonthlyDebtorDto[] = [];
  for (const student of students) {
    const studentInputs = inputs.get(student.id);
    if (!studentInputs) continue;
    const month = ledgerOf(studentInputs).months.find((item) => item.key === period);
    if (!month) continue;
    const endMonth = atEnd ? ledgerOf(studentInputs, atEnd).months.find((item) => item.key === period) : undefined;
    rows.push({
      student: toStudentDto(student),
      period,
      dueDate: month.firstDueDate,
      due: month.firstDueDate <= today,
      charge: month.charge,
      cancelledAmount: month.cancelledAmount,
      paid: month.paid,
      remaining: month.remaining,
      status: month.status,
      remainingAtPeriodEnd: atEnd ? (endMonth?.remaining ?? 0) : null,
      paidAfterPeriod: atEnd ? Math.max(month.paid - (endMonth?.paid ?? 0), 0) : null,
      closedAt: month.closedAt,
    });
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------
// B. Barcha qarzlar
// ------------------------------------------------------------------------------------------------

export interface OutstandingDebtDto {
  student: BillingStudentDto;
  /** Muddati kelgan, to'lanmagan jami */
  debt: number;
  months: Array<{ period: string; remaining: number; dueDate: string }>;
  oldestDueDate: string;
  overdueDays: number;
  /** Shartnomaning hali muddati kelmagan qismi */
  upcoming: number;
}

export interface OutstandingSummaryDto {
  /** Qaysi kun holati ("2026-10-31" — o'tgan oy oxiri yoki bugun) */
  asOfDate: string;
  /** O'tgan oy oxiridagi holat ko'rsatilyaptimi */
  historical: boolean;
  students: number;
  debt: number;
  upcoming: number;
  /** Qaysi oy uchun qarz: "2026-10" — shuncha (n o'quvchi), "2026-11" — shuncha; yig'indisi = `debt` */
  byMonth: Array<{ period: string; students: number; debt: number }>;
  /** Eng eski qarz yoshi bo'yicha */
  byAge: { upTo30: { students: number; debt: number }; upTo60: { students: number; debt: number }; over60: { students: number; debt: number } };
}

function outstandingOf(student: StudentRow, ledger: StudentLedger, today: string): OutstandingDebtDto | null {
  const months = new Map<string, { remaining: number; dueDate: string }>();
  let upcoming = 0;
  for (const item of ledger.installments) {
    if (item.remaining <= 0) continue;
    if (item.row.dueDate > today) {
      upcoming += item.remaining;
      continue;
    }
    const key = monthOfDate(item.row.dueDate);
    const entry = months.get(key) ?? { remaining: 0, dueDate: item.row.dueDate };
    entry.remaining += item.remaining;
    if (item.row.dueDate < entry.dueDate) entry.dueDate = item.row.dueDate;
    months.set(key, entry);
  }
  if (months.size === 0) return null;
  const list = [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([period, value]) => ({ period, ...value }));
  const oldestDueDate = list[0]!.dueDate;
  return {
    student: toStudentDto(student),
    debt: list.reduce((sum, item) => sum + item.remaining, 0),
    months: list,
    oldestDueDate,
    overdueDays: Math.max(daysBetween(oldestDueDate, today), 0),
    upcoming,
  };
}

// ------------------------------------------------------------------------------------------------
// C. O'quvchi qarz tarixi
// ------------------------------------------------------------------------------------------------

export interface StudentBillingHistoryDto {
  student: BillingStudentDto;
  contractTotal: number;
  paidTotal: number;
  /** Muddati kelgan, to'lanmagan */
  debt: number;
  upcoming: number;
  months: Array<{
    period: string;
    label: string;
    dueDate: string;
    charge: number;
    cancelledAmount: number;
    cancelReason: string | null;
    paid: number;
    remaining: number;
    status: ChargeStatus;
    due: boolean;
    closedAt: string | null;
    payments: Array<{ paymentId: string; code: string; paidAt: string; amount: number; explicit: boolean }>;
  }>;
  payments: Array<{
    id: string;
    code: string;
    amount: number;
    method: PaymentMethod;
    methodLabel: string;
    paidAt: string;
    isDeleted: boolean;
    refunded: number;
    allocations: Array<{ period: string; amount: number; explicit: boolean }>;
  }>;
  refunds: Array<{ id: string; paymentCode: string; amount: number; refundedAt: string; reason: string }>;
}

// ------------------------------------------------------------------------------------------------
// Oylik hisobot
// ------------------------------------------------------------------------------------------------

export interface BillingReportMonthDto {
  period: string;
  label: string;
  /** Hisoblangan majburiyat (bekor qilinganlarsiz) */
  accrued: number;
  cancelled: number;
  /** Shu oy majburiyati uchun hozirgacha yig'ilgan (qaysi sanada kelganidan qat'i nazar) */
  collectedForPeriod: number;
  /** Shu oy majburiyatidan hozir qolgan */
  remainingNow: number;
  /** Shu oy oxiridagi jami qarz (shu va oldingi oylar, muddati kelgan); joriy oy — hozirgi holat */
  debtAtPeriodEnd: number;
  /** Kassa: shu oyda kelib tushgan o'quvchi to'lovlari va qaytarishlar */
  cashIn: number;
  refunds: number;
  cashNet: number;
  /** Shu oyda tushgan pul qaysi oylar uchun */
  cashFor: { earlier: number; same: number; later: number; unallocated: number };
  students: number;
  debtors: number;
}

function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  let { year, month } = parsePeriodKey(from);
  for (let guard = 0; guard < 60; guard += 1) {
    const key = periodKeyOf(year, month);
    if (key > to) break;
    keys.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

const MAX_REPORT_MONTHS = 24;

const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);

export const billingService = {
  async monthlyDebtors(
    query: MonthlyDebtorsQuery,
    scope: Prisma.StudentWhereInput,
    now: Date = new Date(),
  ): Promise<{ items: MonthlyDebtorDto[]; total: number; summary: MonthlyDebtorsSummaryDto }> {
    const { students, inputs } = await loadStudents(query, scope);
    const all = monthlyRows(students, inputs, query.period, now);
    const byStatus: Record<ChargeStatus, number> = { UNPAID: 0, PARTIAL: 0, PAID: 0, CANCELLED: 0 };
    for (const row of all) byStatus[row.status] += 1;
    const ended = periodEndMoment(query.period, now) !== null;
    const { year, month } = parsePeriodKey(query.period);
    const summary: MonthlyDebtorsSummaryDto = {
      period: query.period,
      label: formatSalaryPeriod(year, month),
      periodEnded: ended,
      students: all.length,
      debtors: all.filter((row) => row.remaining > 0 && row.due).length,
      upcoming: all.filter((row) => row.remaining > 0 && !row.due).length,
      charge: sum(all, (row) => row.charge),
      cancelled: sum(all, (row) => row.cancelledAmount),
      paid: sum(all, (row) => row.paid),
      dueRemaining: sum(
        all.filter((row) => row.due),
        (row) => row.remaining,
      ),
      remaining: sum(all, (row) => row.remaining),
      remainingAtPeriodEnd: ended ? sum(all, (row) => row.remainingAtPeriodEnd ?? 0) : null,
      paidAfterPeriod: ended ? sum(all, (row) => row.paidAfterPeriod ?? 0) : null,
      byStatus,
    };

    const filtered = all
      .filter((row) => {
        if (query.status === 'ALL') return true;
        if (query.status === 'DEBT') return row.remaining > 0 && row.due;
        if (query.status === 'UPCOMING') return row.remaining > 0 && !row.due;
        return row.status === query.status;
      })
      .filter((row) => inRange(row.remaining, query.minAmount, query.maxAmount));
    filtered.sort((a, b) => {
      if (query.sortBy === 'name') return fullName(a).localeCompare(fullName(b)) * (query.sortOrder === 'desc' ? -1 : 1);
      if (query.sortBy === 'dueDate') return a.dueDate.localeCompare(b.dueDate) * (query.sortOrder === 'desc' ? -1 : 1);
      return (b.remaining - a.remaining) * (query.sortOrder === 'asc' ? -1 : 1) || fullName(a).localeCompare(fullName(b));
    });
    return { items: paginate(filtered, query.page, query.limit), total: filtered.length, summary };
  },

  async outstanding(
    query: OutstandingDebtsQuery,
    scope: Prisma.StudentWhereInput,
    now: Date = new Date(),
  ): Promise<{ items: OutstandingDebtDto[]; total: number; summary: OutstandingSummaryDto }> {
    const { students, inputs } = await loadStudents(query, scope);
    // O'tgan oy — o'sha oy oxiridagi holat: keyingi to'lovlar, bekor qilishlar va taqsimot tuzatishlari ta'sir qilmaydi
    const asOf = query.period ? periodEndMoment(query.period, now) : null;
    const today = businessDateString(asOf ?? now);
    const all = students
      .map((student) => outstandingOf(student, ledgerOf(inputs.get(student.id)!, asOf), today))
      .filter((row): row is OutstandingDebtDto => row !== null);
    const bucket = (rows: OutstandingDebtDto[]) => ({ students: rows.length, debt: sum(rows, (row) => row.debt) });
    const months = new Map<string, { students: number; debt: number }>();
    for (const row of all) {
      for (const month of row.months) {
        const entry = months.get(month.period) ?? { students: 0, debt: 0 };
        entry.students += 1;
        entry.debt += month.remaining;
        months.set(month.period, entry);
      }
    }
    const summary: OutstandingSummaryDto = {
      asOfDate: today,
      historical: asOf !== null,
      students: all.length,
      debt: sum(all, (row) => row.debt),
      upcoming: sum(all, (row) => row.upcoming),
      byMonth: [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([period, value]) => ({ period, ...value })),
      byAge: {
        upTo30: bucket(all.filter((row) => row.overdueDays <= 30)),
        upTo60: bucket(all.filter((row) => row.overdueDays > 30 && row.overdueDays <= 60)),
        over60: bucket(all.filter((row) => row.overdueDays > 60)),
      },
    };
    const filtered = all.filter((row) => inRange(row.debt, query.minAmount, query.maxAmount));
    filtered.sort((a, b) => {
      if (query.sortBy === 'name') return fullName(a).localeCompare(fullName(b)) * (query.sortOrder === 'desc' ? -1 : 1);
      if (query.sortBy === 'oldest') return a.oldestDueDate.localeCompare(b.oldestDueDate) * (query.sortOrder === 'desc' ? -1 : 1);
      return (b.debt - a.debt) * (query.sortOrder === 'asc' ? -1 : 1) || fullName(a).localeCompare(fullName(b));
    });
    return { items: paginate(filtered, query.page, query.limit), total: filtered.length, summary };
  },

  async studentHistory(actor: AuthUser, studentId: string, now: Date = new Date()): Promise<StudentBillingHistoryDto> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { ...studentSelect, branchId: true, debt: { select: { totalAmount: true, paidAmount: true } } },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');
    assertBranchAccess(await getBranchAccess(actor), student.branchId);

    const inputs = (await loadLedgerInputs(prisma, [studentId])).get(studentId)!;
    const ledger = ledgerOf(inputs);
    const today = businessDateString(now);
    const paymentRows = await prisma.payment.findMany({
      where: { studentId },
      orderBy: [{ paidAt: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, amount: true, method: true, paidAt: true, deletedAt: true },
    });
    const paymentById = new Map(paymentRows.map((row) => [row.id, row]));
    const refundRows = await prisma.paymentRefund.findMany({
      where: { payment: { studentId } },
      orderBy: { refundedAt: 'asc' },
      select: { id: true, paymentId: true, amount: true, refundedAt: true, reason: true },
    });

    const contributionsByMonth = new Map<string, StudentBillingHistoryDto['months'][number]['payments']>();
    const contributionsByPayment = new Map<string, StudentBillingHistoryDto['payments'][number]['allocations']>();
    for (const item of ledger.contributions) {
      const payment = paymentById.get(item.paymentId);
      if (!payment) continue;
      const list = contributionsByMonth.get(item.periodKey) ?? [];
      list.push({ paymentId: payment.id, code: formatPaymentNumber(payment.number), paidAt: payment.paidAt.toISOString(), amount: item.amount, explicit: item.explicit });
      contributionsByMonth.set(item.periodKey, list);
      const perPayment = contributionsByPayment.get(payment.id) ?? [];
      perPayment.push({ period: item.periodKey, amount: item.amount, explicit: item.explicit });
      contributionsByPayment.set(payment.id, perPayment);
    }
    const cancelReasons = new Map<string, string>();
    for (const row of inputs.installments) {
      if (row.cancelReason) cancelReasons.set(monthOfDate(row.dueDate), row.cancelReason);
    }
    const outstanding = outstandingOf(student, ledger, today);

    return {
      student: toStudentDto(student),
      contractTotal: student.debt?.totalAmount.toNumber() ?? 0,
      paidTotal: student.debt?.paidAmount.toNumber() ?? ledger.paidTotal,
      debt: outstanding?.debt ?? 0,
      upcoming: outstanding?.upcoming ?? sum(ledger.installments.filter((item) => item.row.dueDate > today), (item) => item.remaining),
      months: ledger.months.map((month) => ({
        period: month.key,
        label: formatSalaryPeriod(month.year, month.month),
        dueDate: month.firstDueDate,
        charge: month.charge,
        cancelledAmount: month.cancelledAmount,
        cancelReason: cancelReasons.get(month.key) ?? null,
        paid: month.paid,
        remaining: month.remaining,
        status: month.status,
        due: month.firstDueDate <= today,
        closedAt: month.closedAt,
        payments: (contributionsByMonth.get(month.key) ?? []).sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
      })),
      payments: paymentRows.map((row) => ({
        id: row.id,
        code: formatPaymentNumber(row.number),
        amount: row.amount.toNumber(),
        method: row.method,
        methodLabel: PAYMENT_METHOD_LABELS[row.method],
        paidAt: row.paidAt.toISOString(),
        isDeleted: row.deletedAt !== null,
        refunded: sum(
          refundRows.filter((refund) => refund.paymentId === row.id),
          (refund) => refund.amount.toNumber(),
        ),
        allocations: (contributionsByPayment.get(row.id) ?? []).sort((a, b) => a.period.localeCompare(b.period)),
      })),
      refunds: refundRows.map((row) => ({
        id: row.id,
        paymentCode: formatPaymentNumber(paymentById.get(row.paymentId)?.number ?? 0),
        amount: row.amount.toNumber(),
        refundedAt: row.refundedAt.toISOString(),
        reason: row.reason,
      })),
    };
  },

  async report(query: BillingReportQuery, scope: Prisma.StudentWhereInput, now: Date = new Date()): Promise<{ months: BillingReportMonthDto[]; totals: Omit<BillingReportMonthDto, 'period' | 'label' | 'debtAtPeriodEnd' | 'students' | 'debtors' | 'remainingNow'> }> {
    const keys = monthKeysBetween(query.from, query.to);
    if (keys.length > MAX_REPORT_MONTHS) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'from', message: `Ko‘pi bilan ${MAX_REPORT_MONTHS} oy tanlang` }]);
    }
    const current = currentBusinessMonth(now);
    const currentKey = periodKeyOf(current.year, current.month);
    const { students, inputs } = await loadStudents(query, scope);
    const ledgers = students.map((student) => ({ id: student.id, inputs: inputs.get(student.id)!, now: ledgerOf(inputs.get(student.id)!) }));

    const months = keys.map((key): BillingReportMonthDto => {
      const { year, month } = parsePeriodKey(key);
      const { start, end } = businessMonthRange(year, month);
      const asOf = key < currentKey ? new Date(end.getTime() - 1) : null;
      const endDate = businessDateString(asOf ?? now);

      let accrued = 0;
      let cancelled = 0;
      let collectedForPeriod = 0;
      let remainingNow = 0;
      let debtAtPeriodEnd = 0;
      let cashIn = 0;
      let refunds = 0;
      let studentsWithCharge = 0;
      let debtors = 0;
      const cashFor = { earlier: 0, same: 0, later: 0, unallocated: 0 };

      for (const entry of ledgers) {
        const monthRow = entry.now.months.find((item) => item.key === key);
        if (monthRow && monthRow.charge + monthRow.cancelledAmount > 0) {
          studentsWithCharge += 1;
          accrued += monthRow.charge;
          cancelled += monthRow.cancelledAmount;
          collectedForPeriod += monthRow.paid;
          remainingNow += monthRow.remaining;
        }
        const atEnd = asOf ? ledgerOf(entry.inputs, asOf) : entry.now;
        const debt = sum(
          atEnd.installments.filter((item) => item.row.dueDate <= endDate),
          (item) => item.remaining,
        );
        debtAtPeriodEnd += debt;
        if (debt > 0) debtors += 1;

        const inMonth = (date: Date) => date.getTime() >= start.getTime() && date.getTime() < end.getTime();
        const paidHere = new Set<string>();
        for (const payment of entry.inputs.payments) {
          if (payment.deletedAt !== null || !inMonth(payment.paidAt)) continue;
          cashIn += payment.amount;
          paidHere.add(payment.id);
        }
        for (const refund of entry.inputs.refunds) {
          const payment = entry.inputs.payments.find((item) => item.id === refund.paymentId);
          if (payment && payment.deletedAt === null && inMonth(refund.refundedAt)) refunds += refund.amount;
        }
        let placed = 0;
        for (const item of entry.now.contributions) {
          if (!paidHere.has(item.paymentId)) continue;
          placed += item.amount;
          if (item.periodKey < key) cashFor.earlier += item.amount;
          else if (item.periodKey === key) cashFor.same += item.amount;
          else cashFor.later += item.amount;
        }
        const netHere = sum(
          entry.inputs.payments.filter((payment) => paidHere.has(payment.id)),
          (payment) => payment.amount - sum(entry.inputs.refunds.filter((refund) => refund.paymentId === payment.id), (refund) => refund.amount),
        );
        cashFor.unallocated += Math.max(netHere - placed, 0);
      }

      return {
        period: key,
        label: formatSalaryPeriod(year, month),
        accrued,
        cancelled,
        collectedForPeriod,
        remainingNow,
        debtAtPeriodEnd,
        cashIn,
        refunds,
        cashNet: cashIn - refunds,
        cashFor,
        students: studentsWithCharge,
        debtors,
      };
    });

    return {
      months,
      totals: {
        accrued: sum(months, (item) => item.accrued),
        cancelled: sum(months, (item) => item.cancelled),
        collectedForPeriod: sum(months, (item) => item.collectedForPeriod),
        cashIn: sum(months, (item) => item.cashIn),
        refunds: sum(months, (item) => item.refunds),
        cashNet: sum(months, (item) => item.cashNet),
        cashFor: {
          earlier: sum(months, (item) => item.cashFor.earlier),
          same: sum(months, (item) => item.cashFor.same),
          later: sum(months, (item) => item.cashFor.later),
          unallocated: sum(months, (item) => item.cashFor.unallocated),
        },
      },
    };
  },
};
