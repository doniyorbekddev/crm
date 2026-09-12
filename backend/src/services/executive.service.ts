import { prisma } from '../config/database.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { Prisma, TransactionType } from '../generated/prisma/client.js';
import { addDays, businessDateString, startOfBusinessDay, startOfBusinessMonth } from '../utils/dates.js';
import type { ExecutiveQuery } from '../validators/dashboard.validator.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';

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
  /** Oylik davomat: kelgan (kechikkan ham) foizi */
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

export interface ExecutiveMonthDto {
  year: number;
  month: number;
  label: string;
  revenue: number;
  expense: number;
  netProfit: number;
  margin: number;
  newLeads: number;
  wonLeads: number;
  conversionRate: number;
  newStudents: number;
  droppedStudents: number;
  activeStudents: number;
  totalDebt: number;
  /** Shu oy uchun hisoblangan o‘qituvchi maoshlari */
  salaryAccrued: number;
  salaryPaid: number;
  attendanceRate: number;
}

export interface ExecutiveTrendPointDto {
  date: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface ExecutiveSummaryDto {
  kpi: ExecutiveKpiDto;
  today: ExecutiveTodayDto;
  month: ExecutiveMonthDto;
  /** Oxirgi 6 oy: tushum, xarajat, foyda */
  trend: ExecutiveTrendPointDto[];
  /** Diqqat talab qiladigan holatlar */
  attention: Array<{ key: string; label: string; value: number; tone: 'warning' | 'danger' }>;
}

const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** O‘tkazma va boshlang‘ich qoldiq moliyaviy natijaga kirmaydi */
const LEDGER_BASE: Prisma.TransactionWhereInput = OPERATING_LEDGER_WHERE;

/** Sanani @db.Date maydonlariga mos UTC yarim tuniga o‘tkazadi */
function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function ledgerTotals(start: Date, end: Date): Promise<{ income: number; expense: number }> {
  const rows = await prisma.transaction.groupBy({
    by: ['type'],
    where: { ...LEDGER_BASE, occurredAt: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const sumOf = (type: TransactionType) => rows.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
  return { income: sumOf('INCOME'), expense: sumOf('EXPENSE') + sumOf('REFUND') };
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
    payments: payments._sum.amount?.toNumber() ?? 0,
    expenses: money.expense,
    netRevenue: money.income - money.expense,
    activeGroups,
    activeTeachers,
  };
}

async function monthBlock(now: Date, query: ExecutiveQuery): Promise<ExecutiveMonthDto> {
  const selected = query.year && query.month ? { year: query.year, month: query.month } : null;
  const start = selected
    ? new Date(Date.UTC(selected.year, selected.month - 1, 1))
    : startOfBusinessMonth(now);
  const end = selected ? new Date(Date.UTC(selected.year, selected.month, 1)) : addDays(startOfBusinessDay(now), 1);
  const year = selected?.year ?? Number(businessDateString(start).slice(0, 4));
  const month = selected?.month ?? Number(businessDateString(start).slice(5, 7));

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
  const activeStudents = await prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } });
  const debt = await prisma.debt.aggregate({
    where: { student: { deletedAt: null }, remainingAmount: { gt: 0 } },
    _sum: { remainingAmount: true },
  });
  const salary = await prisma.teacherSalaryPeriod.aggregate({
    where: { year, month },
    _sum: { totalAmount: true, paidAmount: true },
  });
  const attendance = await attendanceRate(start, end);
  const closed = wonLeads + lostLeads;

  return {
    year,
    month,
    label: formatSalaryPeriod(year, month),
    revenue: money.income,
    expense: money.expense,
    netProfit: money.income - money.expense,
    margin: money.income === 0 ? 0 : Math.round(((money.income - money.expense) / money.income) * 100),
    newLeads,
    wonLeads,
    conversionRate: closed === 0 ? 0 : Math.round((wonLeads / closed) * 100),
    newStudents,
    droppedStudents,
    activeStudents,
    totalDebt: debt._sum.remainingAmount?.toNumber() ?? 0,
    salaryAccrued: salary._sum.totalAmount?.toNumber() ?? 0,
    salaryPaid: salary._sum.paidAmount?.toNumber() ?? 0,
    attendanceRate: attendance.rate,
  };
}

/** Oxirgi 6 oy: tushum, xarajat va foyda dinamikasi */
async function trendBlock(now: Date): Promise<ExecutiveTrendPointDto[]> {
  const start = startOfBusinessMonth(now, 5);
  const end = addDays(startOfBusinessDay(now), 1);
  const transactions = await prisma.transaction.findMany({
    where: { ...LEDGER_BASE, occurredAt: { gte: start, lt: end } },
    select: { type: true, amount: true, occurredAt: true },
  });

  const points: ExecutiveTrendPointDto[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const monthStart = startOfBusinessMonth(now, index);
    const date = businessDateString(monthStart);
    points.push({
      date,
      label: MONTH_LABELS[Number(date.slice(5, 7)) - 1] ?? date,
      revenue: 0,
      expense: 0,
      profit: 0,
    });
  }

  for (const transaction of transactions) {
    const key = businessDateString(transaction.occurredAt).slice(0, 7);
    const point = points.find((item) => item.date.slice(0, 7) === key);
    if (!point) continue;
    const amount = transaction.amount.toNumber();
    if (transaction.type === 'INCOME') point.revenue += amount;
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

  const rows: ExecutiveSummaryDto['attention'] = [
    { key: 'debtors', label: 'Qarzdor o‘quvchilar', value: debtors, tone: 'danger' },
    { key: 'unmarkedLessons', label: 'Davomati belgilanmagan darslar', value: unmarkedLessons, tone: 'warning' },
    { key: 'overdueFollowUps', label: 'Kechikkan follow-up', value: overdueFollowUps, tone: 'warning' },
    { key: 'pendingSalaries', label: 'Tasdiq kutayotgan maoshlar', value: pendingSalaries, tone: 'warning' },
    { key: 'pendingUsers', label: 'Tasdiqlanmagan xodimlar', value: pendingUsers, tone: 'warning' },
  ];
  return rows.filter((row) => row.value > 0);
}

export const executiveService = {
  async summary(query: ExecutiveQuery): Promise<ExecutiveSummaryDto> {
    const now = new Date();
    const [today, month, trend, attention] = await Promise.all([
      todayBlock(now),
      monthBlock(now, query),
      trendBlock(now),
      attentionBlock(now),
    ]);

    const totalStudents = await prisma.student.count({ where: { deletedAt: null } });
    const totalGroups = await prisma.group.count();
    const totalTeachers = await prisma.teacherProfile.count({ where: { user: { deletedAt: null } } });

    return {
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
      trend,
      attention,
    };
  },
};
