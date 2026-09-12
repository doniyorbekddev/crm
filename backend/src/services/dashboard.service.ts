import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { LEAD_STATUS_ORDER, formatLeadNumber } from '../config/leadLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { LeadStatus, Prisma, TransactionType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { addDays, businessDateString, startOfBusinessDay, startOfBusinessMonth } from '../utils/dates.js';
import type { ChartPeriod, ChartQuery, ManagerStatsQuery } from '../validators/dashboard.validator.js';
import { attendanceAnalyticsService } from './attendanceAnalytics.service.js';
import { getLeadAccess, leadScopeCondition } from './leadAccess.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';
import { permissionService } from './permission.service.js';

/** Sotuv jarayonidagi "ishlanayotgan" statuslar (yopilmagan leadlar) */
const OPEN_LEAD_STATUSES: readonly LeadStatus[] = LEAD_STATUS_ORDER.filter(
  (status) => status !== 'WON' && status !== 'LOST',
);

export interface DashboardLeadsBlock {
  todayNew: number;
  monthNew: number;
  open: number;
  monthWon: number;
  monthLost: number;
  /** Oylik konversiya: yopilgan leadlarning necha foizi sotilgan */
  conversionRate: number;
}

export interface DashboardStudentsBlock {
  active: number;
  monthNew: number;
  frozen: number;
}

export interface DashboardFinanceBlock {
  todayRevenue: number;
  monthRevenue: number;
  prevMonthRevenue: number;
  /** O‘tgan oyning shu kunigacha bo‘lgan tushumiga nisbatan o‘sish (%) */
  monthGrowth: number;
}

export interface DashboardDebtBlock {
  totalRemaining: number;
  debtors: number;
}

export interface DashboardTasksBlock {
  todayFollowUps: number;
  overdueFollowUps: number;
  todayCalls: number;
}

/** O‘qituvchi uchun: o‘z guruhlari, bugungi darslar, davomat va baholash navbati */
export interface DashboardTeachingBlock {
  groups: number;
  students: number;
  todayLessons: number;
  markedLessons: number;
  todayAbsent: number;
  monthAttendanceRate: number;
  /** Topshirilgan, lekin hali ball qo‘yilmagan uy vazifalari */
  pendingGrading: number;
  /** Keyingi 7 kundagi rejalashtirilgan imtihonlar */
  upcomingExams: number;
}

/** Buxgalter/moliya uchun: oylik natija, kassalar va maosh navbati */
export interface DashboardMoneyBlock {
  monthIncome: number;
  monthExpense: number;
  monthNetProfit: number;
  cashBalance: number;
  /** salary.view ruxsati bo‘lmasa null */
  salaryDue: number | null;
  salaryAwaitingApproval: number | null;
}

export interface DashboardSummaryDto {
  /** Hisob-kitob qilingan sana (o‘quv markaz vaqt mintaqasi bo‘yicha) */
  date: string;
  leads: DashboardLeadsBlock | null;
  students: DashboardStudentsBlock | null;
  finance: DashboardFinanceBlock | null;
  debts: DashboardDebtBlock | null;
  tasks: DashboardTasksBlock | null;
  teaching: DashboardTeachingBlock | null;
  money: DashboardMoneyBlock | null;
}

export interface ChartPointDto {
  /** Bucket boshlanishi: "2026-09-12" */
  date: string;
  label: string;
  leads: number;
  won: number;
  revenue: number;
}

export interface FunnelStageDto {
  status: LeadStatus;
  count: number;
  /** Barcha leadlarga nisbatan ulush (yo‘qotilganlar ham hisobga olinadi) */
  percent: number;
}

export interface ManagerStatsDto {
  id: string;
  firstName: string;
  lastName: string;
  roleName: string;
  leads: number;
  won: number;
  conversionRate: number;
  revenue: number;
}

export interface DashboardFollowUpDto {
  id: string;
  dueAt: string;
  title: string;
  notes: string | null;
  overdue: boolean;
  lead: { id: string; code: string; firstName: string; lastName: string | null; phone: string };
}

interface DashboardAccess {
  userId: string;
  canViewLeads: boolean;
  canViewAllLeads: boolean;
  canViewStudents: boolean;
  canViewPayments: boolean;
  canViewDebts: boolean;
  canViewFollowUps: boolean;
  canViewReports: boolean;
  /** Dars beradigan xodim (guruhlarni boshqaruvchi admin emas) */
  canTeach: boolean;
  canGradeHomework: boolean;
  canViewFinance: boolean;
  canViewSalary: boolean;
}

async function getDashboardAccess(actor: AuthUser): Promise<DashboardAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    userId: actor.id,
    canViewLeads: permissions.has(PERMISSIONS.LEAD_VIEW),
    canViewAllLeads: permissions.has(PERMISSIONS.LEAD_VIEW_ALL),
    canViewStudents: permissions.has(PERMISSIONS.STUDENT_VIEW),
    canViewPayments: permissions.has(PERMISSIONS.PAYMENT_VIEW),
    canViewDebts: permissions.has(PERMISSIONS.DEBT_VIEW),
    canViewFollowUps: permissions.has(PERMISSIONS.FOLLOWUP_VIEW),
    canViewReports: permissions.has(PERMISSIONS.REPORT_VIEW),
    canTeach: permissions.has(PERMISSIONS.ATTENDANCE_MARK) && !permissions.has(PERMISSIONS.GROUP_MANAGE),
    canGradeHomework: permissions.has(PERMISSIONS.HOMEWORK_GRADE),
    canViewFinance: permissions.has(PERMISSIONS.FINANCE_VIEW),
    canViewSalary: permissions.has(PERMISSIONS.SALARY_VIEW),
  };
}

async function teachingBlock(actor: AuthUser, access: DashboardAccess, now: Date): Promise<DashboardTeachingBlock | null> {
  // Bugungi darslar va davomat — o'qituvchi panelidagi hisob bilan bir xil bo'lishi uchun o'sha servis
  const overview = await attendanceAnalyticsService.teacherOverview(actor);
  if (overview.groups.length === 0) return null;
  const groupIds = overview.groups.map((group) => group.id);
  const today = new Date(`${businessDateString(now)}T00:00:00.000Z`);

  const pendingGrading = access.canGradeHomework
    ? await prisma.homeworkSubmission.count({
        where: { status: { in: ['SUBMITTED', 'LATE'] }, score: null, homework: { groupId: { in: groupIds }, status: { not: 'DRAFT' } } },
      })
    : 0;
  const upcomingExams = await prisma.exam.count({
    where: { groupId: { in: groupIds }, status: 'PLANNED', date: { gte: today, lte: addDays(today, 7) } },
  });

  return {
    groups: overview.groups.length,
    students: overview.groups.reduce((sum, group) => sum + group.students, 0),
    todayLessons: overview.todayLessons,
    markedLessons: overview.markedLessons,
    todayAbsent: overview.todayAbsent.length,
    monthAttendanceRate: overview.monthRate,
    pendingGrading,
    upcomingExams,
  };
}

async function moneyBlock(access: DashboardAccess, now: Date): Promise<DashboardMoneyBlock> {
  const rows = await prisma.transaction.groupBy({
    by: ['type'],
    where: { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: startOfBusinessMonth(now) } },
    _sum: { amount: true },
  });
  const sumOf = (type: TransactionType) => rows.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
  const monthIncome = sumOf('INCOME');
  const monthExpense = sumOf('EXPENSE') + sumOf('REFUND');
  const balance = await prisma.financialAccount.aggregate({ where: { isActive: true }, _sum: { balance: true } });

  let salaryDue: number | null = null;
  let salaryAwaitingApproval: number | null = null;
  if (access.canViewSalary) {
    const due = await prisma.teacherSalaryPeriod.aggregate({
      where: { status: { in: ['CALCULATED', 'APPROVED', 'PARTIALLY_PAID'] } },
      _sum: { remainingAmount: true },
    });
    salaryDue = due._sum.remainingAmount?.toNumber() ?? 0;
    salaryAwaitingApproval = await prisma.teacherSalaryPeriod.count({ where: { status: 'CALCULATED' } });
  }

  return {
    monthIncome,
    monthExpense,
    monthNetProfit: monthIncome - monthExpense,
    cashBalance: balance._sum.balance?.toNumber() ?? 0,
    salaryDue,
    salaryAwaitingApproval,
  };
}

function growthPercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function leadsBlock(access: DashboardAccess, now: Date): Promise<DashboardLeadsBlock> {
  const scope: Prisma.LeadWhereInput = access.canViewAllLeads
    ? {}
    : { OR: [{ assignedToId: access.userId }, { assignedToId: null }] };
  const base: Prisma.LeadWhereInput = { deletedAt: null, ...scope };
  const dayStart = startOfBusinessDay(now);
  const monthStart = startOfBusinessMonth(now);

  const todayNew = await prisma.lead.count({ where: { ...base, createdAt: { gte: dayStart } } });
  const monthNew = await prisma.lead.count({ where: { ...base, createdAt: { gte: monthStart } } });
  const open = await prisma.lead.count({ where: { ...base, status: { in: [...OPEN_LEAD_STATUSES] } } });
  const monthWon = await prisma.lead.count({ where: { ...base, status: 'WON', convertedAt: { gte: monthStart } } });
  const monthLost = await prisma.lead.count({ where: { ...base, status: 'LOST', updatedAt: { gte: monthStart } } });

  const closed = monthWon + monthLost;
  return {
    todayNew,
    monthNew,
    open,
    monthWon,
    monthLost,
    conversionRate: closed === 0 ? 0 : Math.round((monthWon / closed) * 100),
  };
}

async function studentsBlock(now: Date): Promise<DashboardStudentsBlock> {
  const monthStart = startOfBusinessMonth(now);
  const active = await prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } });
  const frozen = await prisma.student.count({ where: { deletedAt: null, status: 'FROZEN' } });
  const monthNew = await prisma.student.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } });
  return { active, frozen, monthNew };
}

async function financeBlock(now: Date): Promise<DashboardFinanceBlock> {
  const dayStart = startOfBusinessDay(now);
  const monthStart = startOfBusinessMonth(now);
  const prevMonthStart = startOfBusinessMonth(now, 1);
  // O‘tgan oyning shu kunigacha — taqqoslash adolatli bo‘lishi uchun
  const prevMonthSamePoint = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));

  const today = await prisma.payment.aggregate({
    where: { deletedAt: null, paidAt: { gte: dayStart } },
    _sum: { amount: true },
  });
  const month = await prisma.payment.aggregate({
    where: { deletedAt: null, paidAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const prevMonth = await prisma.payment.aggregate({
    where: { deletedAt: null, paidAt: { gte: prevMonthStart, lt: prevMonthSamePoint } },
    _sum: { amount: true },
  });

  const monthRevenue = month._sum.amount?.toNumber() ?? 0;
  const prevMonthRevenue = prevMonth._sum.amount?.toNumber() ?? 0;
  return {
    todayRevenue: today._sum.amount?.toNumber() ?? 0,
    monthRevenue,
    prevMonthRevenue,
    monthGrowth: growthPercent(monthRevenue, prevMonthRevenue),
  };
}

async function debtsBlock(): Promise<DashboardDebtBlock> {
  const aggregate = await prisma.debt.aggregate({
    where: { student: { deletedAt: null }, remainingAmount: { gt: 0 } },
    _sum: { remainingAmount: true },
    _count: { _all: true },
  });
  return {
    totalRemaining: aggregate._sum.remainingAmount?.toNumber() ?? 0,
    debtors: aggregate._count._all,
  };
}

async function tasksBlock(access: DashboardAccess, now: Date): Promise<DashboardTasksBlock> {
  const dayStart = startOfBusinessDay(now);
  const mine: Prisma.FollowUpWhereInput = access.canViewAllLeads ? {} : { assignedToId: access.userId };

  const todayFollowUps = await prisma.followUp.count({
    where: { ...mine, status: 'PENDING', dueAt: { gte: dayStart, lt: addDays(dayStart, 1) } },
  });
  const overdueFollowUps = await prisma.followUp.count({
    where: { ...mine, status: 'PENDING', dueAt: { lt: now } },
  });
  const todayCalls = await prisma.call.count({
    where: {
      status: 'COMPLETED',
      calledAt: { gte: dayStart },
      ...(access.canViewAllLeads ? {} : { managerId: access.userId }),
    },
  });

  return { todayFollowUps, overdueFollowUps, todayCalls };
}

/** Grafik uchun bucketlar ro‘yxati (eng eskisidan bugungacha) */
function buildBuckets(period: ChartPeriod, now: Date): Array<{ start: Date; end: Date; date: string; label: string }> {
  const buckets: Array<{ start: Date; end: Date; date: string; label: string }> = [];
  const monthLabels = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

  if (period === 'month') {
    for (let index = 5; index >= 0; index -= 1) {
      const start = startOfBusinessMonth(now, index);
      const end = index === 0 ? addDays(startOfBusinessDay(now), 1) : startOfBusinessMonth(now, index - 1);
      const shifted = new Date(start.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000);
      buckets.push({ start, end, date: businessDateString(start), label: monthLabels[shifted.getUTCMonth()] ?? '' });
    }
    return buckets;
  }

  const dayStart = startOfBusinessDay(now);
  if (period === 'week') {
    for (let index = 7; index >= 0; index -= 1) {
      const start = addDays(dayStart, -7 * index - 6);
      const end = index === 0 ? addDays(dayStart, 1) : addDays(dayStart, -7 * index + 1);
      buckets.push({ start, end, date: businessDateString(start), label: businessDateString(start).slice(5) });
    }
    return buckets;
  }

  for (let index = 13; index >= 0; index -= 1) {
    const start = addDays(dayStart, -index);
    const date = businessDateString(start);
    buckets.push({ start, end: addDays(start, 1), date, label: date.slice(5) });
  }
  return buckets;
}

/** Yozuvlarni vaqt bo‘laklariga taqsimlaydi (binar qidiruv bilan) */
function assignToBuckets<T>(
  buckets: Array<{ start: Date; end: Date }>,
  items: readonly T[],
  getDate: (item: T) => Date | null,
  apply: (index: number, item: T) => void,
): void {
  if (buckets.length === 0) return;
  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    const time = date.getTime();
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const bucket = buckets[mid]!;
      if (time < bucket.start.getTime()) high = mid - 1;
      else if (time >= bucket.end.getTime()) low = mid + 1;
      else {
        apply(mid, item);
        break;
      }
    }
  }
}

export const dashboardService = {
  async summary(actor: AuthUser): Promise<DashboardSummaryDto> {
    const access = await getDashboardAccess(actor);
    const now = new Date();

    return {
      date: businessDateString(now),
      leads: access.canViewLeads ? await leadsBlock(access, now) : null,
      students: access.canViewStudents ? await studentsBlock(now) : null,
      finance: access.canViewPayments ? await financeBlock(now) : null,
      debts: access.canViewDebts ? await debtsBlock() : null,
      tasks: access.canViewFollowUps ? await tasksBlock(access, now) : null,
      teaching: access.canTeach ? await teachingBlock(actor, access, now) : null,
      money: access.canViewFinance ? await moneyBlock(access, now) : null,
    };
  },

  /**
   * Vaqt kesimidagi grafik: yangi leadlar, sotilganlar va tushum.
   * Bucketlar ketma-ket so‘raladi — lokal dev bazasi ko‘p parallel so‘rovni ko‘tarmaydi.
   */
  async charts(actor: AuthUser, query: ChartQuery): Promise<ChartPointDto[]> {
    const access = await getDashboardAccess(actor);
    const now = new Date();
    const buckets = buildBuckets(query.period, now);
    const rangeStart = buckets[0]?.start ?? startOfBusinessDay(now);
    const rangeEnd = buckets.at(-1)?.end ?? addDays(startOfBusinessDay(now), 1);
    const scope: Prisma.LeadWhereInput = access.canViewAllLeads
      ? {}
      : { OR: [{ assignedToId: access.userId }, { assignedToId: null }] };

    const points: ChartPointDto[] = buckets.map((bucket) => ({
      date: bucket.date,
      label: bucket.label,
      leads: 0,
      won: 0,
      revenue: 0,
    }));

    // Har bir ustun uchun alohida COUNT o‘rniga — davr bo‘yicha bitta so‘rov va JS’da guruhlash
    if (access.canViewLeads) {
      const created = await prisma.lead.findMany({
        where: { deletedAt: null, ...scope, createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { createdAt: true },
      });
      const won = await prisma.lead.findMany({
        where: { deletedAt: null, ...scope, status: 'WON', convertedAt: { gte: rangeStart, lt: rangeEnd } },
        select: { convertedAt: true },
      });
      assignToBuckets(buckets, created, (lead) => lead.createdAt, (index) => {
        points[index]!.leads += 1;
      });
      assignToBuckets(buckets, won, (lead) => lead.convertedAt, (index) => {
        points[index]!.won += 1;
      });
    }

    if (access.canViewPayments) {
      const payments = await prisma.payment.findMany({
        where: { deletedAt: null, paidAt: { gte: rangeStart, lt: rangeEnd } },
        select: { paidAt: true, amount: true },
      });
      assignToBuckets(buckets, payments, (payment) => payment.paidAt, (index, payment) => {
        points[index]!.revenue += payment.amount.toNumber();
      });
    }

    return points;
  },

  /** Sotuv voronkasi: har bir bosqichdagi leadlar soni (joriy holat bo‘yicha) */
  async funnel(actor: AuthUser): Promise<FunnelStageDto[]> {
    const leadAccess = await getLeadAccess(actor);
    const scope = leadScopeCondition(leadAccess);
    const grouped = await prisma.lead.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...(scope ? { AND: [scope] } : {}) },
      _count: { _all: true },
    });

    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    const total = LEAD_STATUS_ORDER.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

    return LEAD_STATUS_ORDER.filter((status) => status !== 'LOST').map((status) => {
      const count = counts.get(status) ?? 0;
      return { status, count, percent: total === 0 ? 0 : Math.round((count / total) * 100) };
    });
  },

  /** Managerlar reytingi: biriktirilgan leadlar, sotuvlar va olib kelgan tushum */
  async managers(query: ManagerStatsQuery): Promise<ManagerStatsDto[]> {
    const now = new Date();
    const monthsAgo = query.period === 'year' ? 11 : query.period === 'quarter' ? 2 : 0;
    const periodStart = startOfBusinessMonth(now, monthsAgo);

    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        role: { permissions: { some: { permission: { key: PERMISSIONS.LEAD_VIEW } } } },
      },
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });

    const ids = users.map((user) => user.id);
    const [leads, won, revenue] = await Promise.all([
      prisma.lead.groupBy({ by: ['assignedToId'], where: { deletedAt: null, assignedToId: { in: ids }, createdAt: { gte: periodStart } }, _count: { _all: true } }),
      prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { deletedAt: null, assignedToId: { in: ids }, status: 'WON', convertedAt: { gte: periodStart } },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({ by: ['managerId'], where: { deletedAt: null, managerId: { in: ids }, paidAt: { gte: periodStart } }, _sum: { amount: true } }),
    ]);

    const stats: ManagerStatsDto[] = users.map((user) => {
      const leadCount = leads.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
      const wonCount = won.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        roleName: user.role.name,
        leads: leadCount,
        won: wonCount,
        conversionRate: leadCount === 0 ? 0 : Math.round((wonCount / leadCount) * 100),
        revenue: revenue.find((row) => row.managerId === user.id)?._sum.amount?.toNumber() ?? 0,
      };
    });

    return stats
      .filter((row) => row.leads > 0 || row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue || b.won - a.won)
      .slice(0, query.limit);
  },

  /** Bugungi va kechikkan follow-uplar (xodimning o‘z vazifalari) */
  async followUps(actor: AuthUser): Promise<DashboardFollowUpDto[]> {
    const access = await getDashboardAccess(actor);
    const now = new Date();
    const dayStart = startOfBusinessDay(now);

    const items = await prisma.followUp.findMany({
      where: {
        status: 'PENDING',
        dueAt: { lt: addDays(dayStart, 1) },
        ...(access.canViewAllLeads ? {} : { assignedToId: access.userId }),
        lead: { deletedAt: null },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
      select: {
        id: true,
        dueAt: true,
        title: true,
        notes: true,
        lead: { select: { id: true, number: true, firstName: true, lastName: true, phone: true } },
      },
    });

    return items.map((item) => ({
      id: item.id,
      dueAt: item.dueAt.toISOString(),
      title: item.title,
      notes: item.notes,
      overdue: item.dueAt.getTime() < now.getTime(),
      lead: {
        id: item.lead.id,
        code: formatLeadNumber(item.lead.number),
        firstName: item.lead.firstName,
        lastName: item.lead.lastName,
        phone: item.lead.phone,
      },
    }));
  },
};
