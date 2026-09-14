import { prisma } from '../config/database.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { Prisma, TransactionType } from '../generated/prisma/client.js';
import {
  addDays,
  businessDateString,
  businessMonthRange,
  currentBusinessMonth,
  startOfBusinessDay,
  startOfBusinessMonth,
} from '../utils/dates.js';
import type { ExecutiveQuery } from '../validators/dashboard.validator.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';
import { refundTotal } from './revenue.js';

/**
 * Owner/Director paneli: butun markaz holati bitta so‘rovda.
 * Moliyaviy raqamlar moliyaviy daftardan olinadi — moliya bo‘limi bilan bir xil bo‘lishi uchun.
 */

export interface ExecutiveKpiDto {
  totalStudents: number;
  activeStudents: number;
  newStudents: number;
  droppedStudents: number;
  totalGroups: number;
  activeGroups: number;
  totalTeachers: number;
  monthRevenue: number;
  monthExpense: number;
  netProfit: number;
  totalDebt: number;
  /** Davrdagi davomat: kelgan (kechikkan ham) foizi */
  attendanceRate: number;
  /** Yopilgan leadlarning necha foizi sotilgan */
  salesConversion: number;
}

export interface ExecutiveTodayDto {
  date: string;
  newLeads: number;
  newStudents: number;
  /** Bugunga rejalashtirilgan sinov darslari */
  trialLessons: number;
  lessons: number;
  markedLessons: number;
  attendanceRate: number;
  absentStudents: number;
  payments: number;
  expenses: number;
  netRevenue: number;
  activeGroups: number;
  activeTeachers: number;
}

/** Davr ko‘rsatkichlari — joriy va oldingi davr uchun bir xil */
export interface ExecutivePeriodMetricsDto {
  revenue: number;
  expense: number;
  netProfit: number;
  margin: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  newStudents: number;
  droppedStudents: number;
  attendanceRate: number;
  /** Davomat belgilari soni — 0 bo‘lsa davomat foizi ma’lumotsiz */
  attendanceMarks: number;
}

export interface ExecutiveMonthDto extends ExecutivePeriodMetricsDto {
  year: number;
  month: number;
  label: string;
  activeStudents: number;
  totalDebt: number;
  /** Davr oylari uchun hisoblangan maoshlar */
  salaryAccrued: number;
  salaryPaid: number;
}

export interface ExecutivePeriodDto {
  /** current-month — joriy oy bugungacha; month — tanlangan to‘liq oy; range — ixtiyoriy oraliq */
  kind: 'current-month' | 'month' | 'range';
  from: string;
  to: string;
  label: string;
  previousFrom: string;
  previousTo: string;
}

export interface ExecutiveTrendPointDto {
  date: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
}

export type HealthStatus = 'GOOD' | 'FAIR' | 'POOR' | 'NO_DATA';

export interface ExecutiveHealthDto {
  /** 0–100; ma’lumot bo‘lmasa null */
  score: number | null;
  status: HealthStatus;
  components: Array<{
    key: 'finance' | 'attendance' | 'debt' | 'retention' | 'sales';
    label: string;
    /** 0–100; ma’lumot bo‘lmasa null va umumiy bahoga kirmaydi */
    score: number | null;
    weight: number;
    value: string;
    hint: string;
  }>;
}

export interface ExecutiveInsightDto {
  key: string;
  tone: 'positive' | 'negative' | 'neutral';
  text: string;
}

export interface ExecutiveForecastDto {
  daysElapsed: number;
  daysInMonth: number;
  /** Hozirgi sur’at bo‘yicha oy oxiridagi tushum */
  projectedRevenue: number;
  /** Hozirgacha xarajat + oy oxirigacha kutilayotgan (to‘lanmagan) xarajatlar */
  projectedExpense: number;
  upcomingExpenses: number;
  projectedProfit: number;
  /** Shu oy uchun tushum rejasi (sotuv rejalari) */
  revenueTarget: number;
  /** Prognozning rejaga nisbati (%); reja bo‘lmasa null */
  targetProgress: number | null;
}

export interface ExecutiveSummaryDto {
  period: ExecutivePeriodDto;
  kpi: ExecutiveKpiDto;
  today: ExecutiveTodayDto;
  month: ExecutiveMonthDto;
  previous: ExecutivePeriodMetricsDto;
  /**
   * Oldingi davrga nisbatan o‘zgarish: summalar va sonlar — foizda (oldingi 0 bo‘lsa null),
   * foiz ko‘rsatkichlar (marja, konversiya, davomat) — foiz punktida.
   */
  changes: Record<'revenue' | 'expense' | 'netProfit' | 'newLeads' | 'wonLeads' | 'newStudents' | 'droppedStudents' | 'margin' | 'conversionRate' | 'attendanceRate', number | null>;
  health: ExecutiveHealthDto;
  insights: ExecutiveInsightDto[];
  /** Faqat joriy oy tanlanganda */
  forecast: ExecutiveForecastDto | null;
  /** Davr oxirigacha oxirgi 6 oy: tushum, xarajat, foyda */
  trend: ExecutiveTrendPointDto[];
  /** Diqqat talab qiladigan holatlar */
  attention: Array<{ key: string; label: string; value: number; tone: 'warning' | 'danger' }>;
}

const DAY_MS = 86_400_000;
const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** O‘tkazma va boshlang‘ich qoldiq moliyaviy natijaga kirmaydi */
const LEDGER_BASE: Prisma.TransactionWhereInput = OPERATING_LEDGER_WHERE;

function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** "2026-08-01" → shu kunning boshlanishi o‘quv markaz vaqti bo‘yicha */
function businessDayStart(value: string): Date {
  return startOfBusinessDay(new Date(`${value}T12:00:00.000Z`));
}

/** "2026-08-01" → "01.08.2026" */
function displayDate(value: string): string {
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
}

function formatSum(value: number): string {
  return `${String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`;
}

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const changeOf = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 100);

interface ResolvedPeriod extends ExecutivePeriodDto {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  year: number;
  month: number;
}

/** Tanlangan davr va u bilan solishtiriladigan oldingi davr */
function resolvePeriod(now: Date, query: ExecutiveQuery): ResolvedPeriod {
  const build = (
    kind: ExecutivePeriodDto['kind'],
    start: Date,
    end: Date,
    previousStart: Date,
    previousEnd: Date,
    label: string,
  ): ResolvedPeriod => ({
    kind,
    start,
    end,
    previousStart,
    previousEnd,
    label,
    from: businessDateString(start),
    to: businessDateString(addDays(end, -1)),
    previousFrom: businessDateString(previousStart),
    previousTo: businessDateString(addDays(previousEnd, -1)),
    year: Number(businessDateString(start).slice(0, 4)),
    month: Number(businessDateString(start).slice(5, 7)),
  });

  if (query.from && query.to) {
    const start = businessDayStart(query.from);
    const end = addDays(businessDayStart(query.to), 1);
    const length = end.getTime() - start.getTime();
    return build('range', start, end, new Date(start.getTime() - length), start, `${displayDate(query.from)} — ${displayDate(query.to)}`);
  }

  const current = currentBusinessMonth(now);
  const isCurrent = !query.year || !query.month || (query.year === current.year && query.month === current.month);
  if (isCurrent) {
    // Joriy oy bugungacha — o‘tgan oyning xuddi shu kunigacha solishtiriladi
    const start = startOfBusinessMonth(now);
    const end = addDays(startOfBusinessDay(now), 1);
    const previousStart = startOfBusinessMonth(now, 1);
    const previousEnd = new Date(Math.min(previousStart.getTime() + (end.getTime() - start.getTime()), start.getTime()));
    return build('current-month', start, end, previousStart, previousEnd, formatSalaryPeriod(current.year, current.month));
  }

  const year = query.year!;
  const month = query.month!;
  const range = businessMonthRange(year, month);
  const previous = month === 1 ? businessMonthRange(year - 1, 12) : businessMonthRange(year, month - 1);
  return build('month', range.start, range.end, previous.start, previous.end, formatSalaryPeriod(year, month));
}

async function ledgerTotals(start: Date, end: Date): Promise<{ income: number; expense: number }> {
  const rows = await prisma.transaction.groupBy({
    by: ['type'],
    where: { ...LEDGER_BASE, occurredAt: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const sumOf = (type: TransactionType) => rows.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
  // Qaytarilgan to'lov xarajat emas — tushumdan ayriladi (sof tushum)
  return { income: sumOf('INCOME') - sumOf('REFUND'), expense: sumOf('EXPENSE') };
}

/** Davomat foizi: kelgan va kechikkanlar umumiy belgilar soniga nisbatan */
async function attendanceRate(start: Date, end: Date): Promise<{ rate: number; absent: number; total: number }> {
  const rows = await prisma.attendance.groupBy({
    by: ['status'],
    where: { date: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const countOf = (status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const present = countOf('PRESENT') + countOf('LATE');
  return { rate: total === 0 ? 0 : Math.round((present / total) * 100), absent: countOf('ABSENT'), total };
}

async function todayBlock(now: Date): Promise<ExecutiveTodayDto> {
  const dayStart = startOfBusinessDay(now);
  const dayEnd = addDays(dayStart, 1);
  const dateString = businessDateString(now);
  const sessionDay = dateOnlyUtc(dateString);
  const sessionNextDay = addDays(sessionDay, 1);

  const newLeads = await prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } } });
  const newStudents = await prisma.student.count({
    where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const trialLessons = await prisma.lead.count({
    where: { deletedAt: null, status: 'TRIAL_BOOKED', nextFollowUpAt: { gte: dayStart, lt: dayEnd } },
  });
  const lessons = await prisma.attendanceSession.count({
    where: { date: { gte: sessionDay, lt: sessionNextDay }, status: { not: 'CANCELLED' } },
  });
  const markedLessons = await prisma.attendanceSession.count({
    where: { date: { gte: sessionDay, lt: sessionNextDay }, status: 'HELD', attendances: { some: {} } },
  });
  const attendance = await attendanceRate(sessionDay, sessionNextDay);
  const money = await ledgerTotals(dayStart, dayEnd);
  const payments = await prisma.payment.aggregate({
    where: { deletedAt: null, paidAt: { gte: dayStart, lt: dayEnd } },
    _sum: { amount: true },
  });
  const activeGroups = await prisma.group.count({ where: { status: 'ACTIVE' } });
  const activeTeachers = await prisma.teacherProfile.count({ where: { isActive: true, user: { deletedAt: null } } });

  return {
    date: dateString,
    newLeads,
    newStudents,
    trialLessons,
    lessons,
    markedLessons,
    attendanceRate: attendance.rate,
    absentStudents: attendance.absent,
    payments: (payments._sum.amount?.toNumber() ?? 0) - (await refundTotal({ gte: dayStart, lt: dayEnd })),
    expenses: money.expense,
    netRevenue: money.income - money.expense,
    activeGroups,
    activeTeachers,
  };
}

async function periodMetrics(start: Date, end: Date): Promise<ExecutivePeriodMetricsDto> {
  const money = await ledgerTotals(start, end);
  const newLeads = await prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end } } });
  const wonLeads = await prisma.lead.count({
    where: { deletedAt: null, status: 'WON', convertedAt: { gte: start, lt: end } },
  });
  const lostLeads = await prisma.lead.count({
    where: { deletedAt: null, status: 'LOST', updatedAt: { gte: start, lt: end } },
  });
  const newStudents = await prisma.student.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end } } });
  const droppedStudents = await prisma.student.count({
    where: { deletedAt: null, status: 'DROPPED', statusChangedAt: { gte: start, lt: end } },
  });
  const attendance = await attendanceRate(start, end);
  const closed = wonLeads + lostLeads;

  return {
    revenue: money.income,
    expense: money.expense,
    netProfit: money.income - money.expense,
    margin: percentOf(money.income - money.expense, money.income),
    newLeads,
    wonLeads,
    lostLeads,
    conversionRate: percentOf(wonLeads, closed),
    newStudents,
    droppedStudents,
    attendanceRate: attendance.rate,
    attendanceMarks: attendance.total,
  };
}

/** Davrga tushadigan oylar (maosh davrlari yil/oy bilan saqlanadi) */
function monthsBetween(start: Date, end: Date): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  const last = businessDateString(addDays(end, -1)).slice(0, 7);
  let cursor = businessDateString(start).slice(0, 7);
  while (cursor <= last && months.length < 13) {
    const [year, month] = cursor.split('-').map(Number) as [number, number];
    months.push({ year, month });
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  return months;
}

async function monthBlock(period: ResolvedPeriod, metrics: ExecutivePeriodMetricsDto): Promise<ExecutiveMonthDto> {
  const activeStudents = await prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } });
  const debt = await prisma.debt.aggregate({
    where: { student: { deletedAt: null }, remainingAmount: { gt: 0 } },
    _sum: { remainingAmount: true },
  });
  const salary = await prisma.teacherSalaryPeriod.aggregate({
    where: { OR: monthsBetween(period.start, period.end) },
    _sum: { totalAmount: true, paidAmount: true },
  });

  return {
    ...metrics,
    year: period.year,
    month: period.month,
    label: period.label,
    activeStudents,
    totalDebt: debt._sum.remainingAmount?.toNumber() ?? 0,
    salaryAccrued: salary._sum.totalAmount?.toNumber() ?? 0,
    salaryPaid: salary._sum.paidAmount?.toNumber() ?? 0,
  };
}

/** Davr oxirigacha oxirgi 6 oy: tushum, xarajat va foyda dinamikasi */
async function trendBlock(anchor: Date): Promise<ExecutiveTrendPointDto[]> {
  const start = startOfBusinessMonth(anchor, 5);
  const end = addDays(startOfBusinessDay(anchor), 1);
  const transactions = await prisma.transaction.findMany({
    where: { ...LEDGER_BASE, occurredAt: { gte: start, lt: end } },
    select: { type: true, amount: true, occurredAt: true },
  });

  const points: ExecutiveTrendPointDto[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const date = businessDateString(startOfBusinessMonth(anchor, index));
    points.push({ date, label: MONTH_LABELS[Number(date.slice(5, 7)) - 1] ?? date, revenue: 0, expense: 0, profit: 0 });
  }

  for (const transaction of transactions) {
    const key = businessDateString(transaction.occurredAt).slice(0, 7);
    const point = points.find((item) => item.date.slice(0, 7) === key);
    if (!point) continue;
    const amount = transaction.amount.toNumber();
    if (transaction.type === 'INCOME') point.revenue += amount;
    else if (transaction.type === 'REFUND') point.revenue -= amount;
    else point.expense += amount;
  }

  return points.map((point) => ({ ...point, profit: point.revenue - point.expense }));
}

/** Diqqat talab qiladigan holatlar — Owner birinchi navbatda shularni ko‘radi */
async function attentionBlock(now: Date): Promise<ExecutiveSummaryDto['attention']> {
  const dayStart = startOfBusinessDay(now);
  const sessionDay = dateOnlyUtc(businessDateString(now));

  const debtors = await prisma.debt.count({ where: { student: { deletedAt: null }, remainingAmount: { gt: 0 } } });
  const unmarkedLessons = await prisma.attendanceSession.count({
    where: { date: { gte: sessionDay, lt: addDays(sessionDay, 1) }, status: { not: 'CANCELLED' }, attendances: { none: {} } },
  });
  const overdueFollowUps = await prisma.followUp.count({ where: { status: 'PENDING', dueAt: { lt: dayStart } } });
  const pendingSalaries = await prisma.teacherSalaryPeriod.count({ where: { status: 'CALCULATED' } });
  const pendingUsers = await prisma.user.count({ where: { deletedAt: null, status: 'PENDING' } });
  const criticalAlerts = await prisma.alert.count({ where: { resolvedAt: null, severity: 'CRITICAL' } });

  const rows: ExecutiveSummaryDto['attention'] = [
    { key: 'criticalAlerts', label: 'Kritik ogohlantirishlar', value: criticalAlerts, tone: 'danger' },
    { key: 'debtors', label: 'Qarzdor o‘quvchilar', value: debtors, tone: 'danger' },
    { key: 'unmarkedLessons', label: 'Davomati belgilanmagan darslar', value: unmarkedLessons, tone: 'warning' },
    { key: 'overdueFollowUps', label: 'Kechikkan follow-up', value: overdueFollowUps, tone: 'warning' },
    { key: 'pendingSalaries', label: 'Tasdiq kutayotgan maoshlar', value: pendingSalaries, tone: 'warning' },
    { key: 'pendingUsers', label: 'Tasdiqlanmagan xodimlar', value: pendingUsers, tone: 'warning' },
  ];
  return rows.filter((row) => row.value > 0);
}

/** Qiymatni 0–100 bahoga o‘tkazadi: `bad` va undan yomon — 0, `good` va undan yaxshi — 100 */
function scale(value: number, bad: number, good: number): number {
  const score = Math.round(((value - bad) / (good - bad)) * 100);
  return Math.min(Math.max(score, 0), 100);
}

/**
 * Markaz sog‘lomlik bahosi. Har bir yo‘nalish 0–100 ball, vazn bilan o‘rtacha olinadi.
 * Ma’lumoti yo‘q yo‘nalish (masalan, davrda davomat belgilanmagan) bahoga kirmaydi.
 */
async function healthBlock(metrics: ExecutivePeriodMetricsDto, activeStudents: number): Promise<ExecutiveHealthDto> {
  const debtors = await prisma.debt.count({
    where: { remainingAmount: { gt: 0 }, student: { deletedAt: null, status: 'ACTIVE' } },
  });
  const debtShare = percentOf(debtors, activeStudents);
  const retentionBase = activeStudents + metrics.droppedStudents;
  const dropRate = percentOf(metrics.droppedStudents, retentionBase);
  const closedLeads = metrics.wonLeads + metrics.lostLeads;
  const hasMoney = metrics.revenue !== 0 || metrics.expense !== 0;

  const components: ExecutiveHealthDto['components'] = [
    {
      key: 'finance',
      label: 'Moliya',
      weight: 25,
      score: hasMoney ? scale(metrics.margin, -10, 30) : null,
      value: hasMoney ? `${metrics.margin}%` : '—',
      hint: 'Sof foyda marjasi (30% va undan yuqori — a’lo)',
    },
    {
      key: 'attendance',
      label: 'Davomat',
      weight: 20,
      score: metrics.attendanceMarks > 0 ? scale(metrics.attendanceRate, 60, 95) : null,
      value: metrics.attendanceMarks > 0 ? `${metrics.attendanceRate}%` : '—',
      hint: 'Darsga kelganlar ulushi (95% — a’lo, 60% — xavfli)',
    },
    {
      key: 'debt',
      label: 'To‘lov intizomi',
      weight: 20,
      score: activeStudents > 0 ? scale(debtShare, 50, 0) : null,
      value: activeStudents > 0 ? `${debtShare}%` : '—',
      hint: 'Faol o‘quvchilar ichida qarzdorlar ulushi',
    },
    {
      key: 'retention',
      label: 'O‘quvchilarni saqlash',
      weight: 20,
      score: retentionBase > 0 ? scale(dropRate, 20, 0) : null,
      value: retentionBase > 0 ? `${dropRate}%` : '—',
      hint: 'Davrda ketgan o‘quvchilar ulushi (20% — xavfli)',
    },
    {
      key: 'sales',
      label: 'Sotuv',
      weight: 15,
      score: closedLeads > 0 ? scale(metrics.conversionRate, 0, 40) : null,
      value: closedLeads > 0 ? `${metrics.conversionRate}%` : '—',
      hint: 'Yopilgan leadlardan sotuvga aylangani (40% — a’lo)',
    },
  ];

  const scored = components.filter((component) => component.score !== null);
  const weight = scored.reduce((sum, component) => sum + component.weight, 0);
  const score = weight === 0 ? null : Math.round(scored.reduce((sum, component) => sum + component.score! * component.weight, 0) / weight);
  const status: HealthStatus = score === null ? 'NO_DATA' : score >= 80 ? 'GOOD' : score >= 60 ? 'FAIR' : 'POOR';
  return { score, status, components };
}

/** Joriy oy uchun oy oxiri prognozi */
async function forecastBlock(now: Date, metrics: ExecutivePeriodMetricsDto): Promise<ExecutiveForecastDto> {
  const { year, month } = currentBusinessMonth(now);
  const range = businessMonthRange(year, month);
  const daysInMonth = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);
  const daysElapsed = Math.min(Math.floor((startOfBusinessDay(now).getTime() - range.start.getTime()) / DAY_MS) + 1, daysInMonth);

  const upcoming = await prisma.expense.aggregate({
    where: { status: { in: ['UPCOMING', 'PENDING', 'APPROVED'] }, spentAt: { gte: range.start, lt: range.end } },
    _sum: { amount: true },
  });
  // Umumiy (jamoa) reja bo'lsa — o'sha, aks holda managerlar rejalari yig'indisi
  const targets = await prisma.salesTarget.findMany({
    where: { year, month, type: 'REVENUE' },
    select: { userId: true, targetValue: true },
  });
  const teamTarget = targets.find((target) => target.userId === null);
  const revenueTarget = teamTarget
    ? teamTarget.targetValue.toNumber()
    : targets.reduce((sum, target) => sum + target.targetValue.toNumber(), 0);

  const projectedRevenue = Math.round((metrics.revenue / daysElapsed) * daysInMonth);
  const upcomingExpenses = upcoming._sum.amount?.toNumber() ?? 0;
  const projectedExpense = metrics.expense + upcomingExpenses;

  return {
    daysElapsed,
    daysInMonth,
    projectedRevenue,
    projectedExpense,
    upcomingExpenses,
    projectedProfit: projectedRevenue - projectedExpense,
    revenueTarget,
    targetProgress: revenueTarget > 0 ? percentOf(projectedRevenue, revenueTarget) : null,
  };
}

/** Qoidaga asoslangan qisqa xulosalar — salbiylari birinchi */
function insightsBlock(
  current: ExecutivePeriodMetricsDto,
  previous: ExecutivePeriodMetricsDto,
  changes: ExecutiveSummaryDto['changes'],
  forecast: ExecutiveForecastDto | null,
): ExecutiveInsightDto[] {
  const insights: ExecutiveInsightDto[] = [];

  if (changes.revenue !== null && changes.revenue <= -10) {
    insights.push({ key: 'revenue_down', tone: 'negative', text: `Tushum oldingi davrga nisbatan ${Math.abs(changes.revenue)}% kamaydi` });
  } else if (changes.revenue !== null && changes.revenue >= 10) {
    insights.push({ key: 'revenue_up', tone: 'positive', text: `Tushum oldingi davrga nisbatan ${changes.revenue}% oshdi` });
  }
  if (changes.expense !== null && changes.expense >= 15) {
    insights.push({ key: 'expense_up', tone: 'negative', text: `Xarajatlar ${changes.expense}% oshdi` });
  } else if (changes.expense !== null && changes.expense <= -15) {
    insights.push({ key: 'expense_down', tone: 'positive', text: `Xarajatlar ${Math.abs(changes.expense)}% kamaydi` });
  }
  if (current.netProfit < 0) {
    insights.push({ key: 'loss', tone: 'negative', text: `Davr zarar bilan: −${formatSum(current.netProfit)}` });
  }
  if (current.attendanceMarks > 0 && current.attendanceRate < 85) {
    insights.push({ key: 'attendance_low', tone: 'negative', text: `Davomat ${current.attendanceRate}% — me’yordan (85%) past` });
  }
  if (current.droppedStudents > previous.droppedStudents) {
    insights.push({
      key: 'dropouts_up',
      tone: 'negative',
      text: `${current.droppedStudents} ta o‘quvchi ketdi (oldingi davrda ${previous.droppedStudents} ta)`,
    });
  }
  const closedNow = current.wonLeads + current.lostLeads;
  const closedBefore = previous.wonLeads + previous.lostLeads;
  if (closedNow > 0 && closedBefore > 0 && changes.conversionRate !== null) {
    if (changes.conversionRate <= -10) {
      insights.push({ key: 'conversion_down', tone: 'negative', text: `Sotuv konversiyasi ${Math.abs(changes.conversionRate)} punktga tushdi` });
    } else if (changes.conversionRate >= 10) {
      insights.push({ key: 'conversion_up', tone: 'positive', text: `Sotuv konversiyasi ${changes.conversionRate} punktga oshdi` });
    }
  }
  if (forecast?.targetProgress !== null && forecast?.targetProgress !== undefined) {
    insights.push(
      forecast.targetProgress < 100
        ? { key: 'target_risk', tone: 'negative', text: `Hozirgi sur’atda oylik tushum rejasining ${forecast.targetProgress}% bajariladi` }
        : { key: 'target_on_track', tone: 'positive', text: `Oylik tushum rejasi bajarilishi kutilmoqda (${forecast.targetProgress}%)` },
    );
  }
  if (current.newStudents > previous.newStudents) {
    insights.push({
      key: 'students_up',
      tone: 'positive',
      text: `${current.newStudents} ta yangi o‘quvchi (oldingi davrda ${previous.newStudents} ta)`,
    });
  }

  if (insights.length === 0) {
    insights.push({ key: 'stable', tone: 'neutral', text: 'Muhim o‘zgarish yo‘q — ko‘rsatkichlar barqaror' });
  }
  const order = { negative: 0, positive: 1, neutral: 2 } as const;
  return insights.sort((a, b) => order[a.tone] - order[b.tone]);
}

export const executiveService = {
  async summary(query: ExecutiveQuery): Promise<ExecutiveSummaryDto> {
    const now = new Date();
    const period = resolvePeriod(now, query);
    const [today, current, previous, attention] = await Promise.all([
      todayBlock(now),
      periodMetrics(period.start, period.end),
      periodMetrics(period.previousStart, period.previousEnd),
      attentionBlock(now),
    ]);
    const month = await monthBlock(period, current);
    const trend = await trendBlock(new Date(period.end.getTime() - 1));
    const health = await healthBlock(current, month.activeStudents);
    const forecast = period.kind === 'current-month' ? await forecastBlock(now, current) : null;

    const changes: ExecutiveSummaryDto['changes'] = {
      revenue: changeOf(current.revenue, previous.revenue),
      expense: changeOf(current.expense, previous.expense),
      netProfit: changeOf(current.netProfit, previous.netProfit),
      newLeads: changeOf(current.newLeads, previous.newLeads),
      wonLeads: changeOf(current.wonLeads, previous.wonLeads),
      newStudents: changeOf(current.newStudents, previous.newStudents),
      droppedStudents: changeOf(current.droppedStudents, previous.droppedStudents),
      margin: previous.revenue === 0 && previous.expense === 0 ? null : current.margin - previous.margin,
      conversionRate: previous.wonLeads + previous.lostLeads === 0 ? null : current.conversionRate - previous.conversionRate,
      attendanceRate: previous.attendanceMarks === 0 ? null : current.attendanceRate - previous.attendanceRate,
    };

    const totalStudents = await prisma.student.count({ where: { deletedAt: null } });
    const totalGroups = await prisma.group.count();
    const totalTeachers = await prisma.teacherProfile.count({ where: { user: { deletedAt: null } } });

    return {
      period: {
        kind: period.kind,
        from: period.from,
        to: period.to,
        label: period.label,
        previousFrom: period.previousFrom,
        previousTo: period.previousTo,
      },
      kpi: {
        totalStudents,
        activeStudents: month.activeStudents,
        newStudents: month.newStudents,
        droppedStudents: month.droppedStudents,
        totalGroups,
        activeGroups: today.activeGroups,
        totalTeachers,
        monthRevenue: month.revenue,
        monthExpense: month.expense,
        netProfit: month.netProfit,
        totalDebt: month.totalDebt,
        attendanceRate: month.attendanceRate,
        salesConversion: month.conversionRate,
      },
      today,
      month,
      previous,
      changes,
      health,
      insights: insightsBlock(current, previous, changes, forecast),
      forecast,
      trend,
      attention,
    };
  },
};
