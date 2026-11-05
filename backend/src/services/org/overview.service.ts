import { dueDebtTotals } from '../billingLedger.service.js';
import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { AuthUser } from '../../types/auth.js';
import { businessDateString, businessMonthRange } from '../../utils/dates.js';
import { analyticsService } from '../analytics.service.js';
import { branchFilter, getBranchAccess } from '../branchAccess.js';
import { branchScopeOf } from '../branchScope.js';
import { executiveService } from '../executive.service.js';
import { evaluateEmployeeKpi } from '../kpi.service.js';
import { permissionService } from '../permission.service.js';
import { staffAttendanceAdminService } from '../staffAttendance/admin.service.js';
import { ACTIVE_TASK_STATUSES, WORKING_TASK_STATUSES } from '../task.service.js';
import { HELD_ASSET_STATUSES } from './assets.service.js';
import { orgCatalogService } from './catalog.service.js';
import { fullName } from './common.js';
import { orgStructureService } from './structure.service.js';

/**
 * CEO paneli (ORG §15, texnik spetsifikatsiya §10): bitta oynada 14 ko'rsatkich bloki.
 *
 * Har blok **o'z ruxsati** bilan qaytariladi (ruxsati yo'q blok — `null`), shuning uchun panelni ochgan har kim
 * faqat o'ziga ruxsat berilgan ma'lumotni ko'radi. Moliyaviy, sotuv va akademik raqamlar mavjud direktor paneli va
 * analitika hisoblaridan olinadi — bir xil ta'rif, ikki xil raqam chiqmaydi.
 */

export interface OrgOverviewDto {
  date: string;
  attendance: { expected: number; working: number; onTime: number; late: number; notArrived: number; absent: number; excused: number; review: number; lateNames: string[] } | null;
  team: { employees: number; teachers: number; onLeave: number; onProbation: number; withoutAccount: number; vacancies: number } | null;
  tasks: { open: number; inProgress: number; review: number; overdue: number; doneThisMonth: number; overdueItems: Array<{ id: string; title: string; assignee: string; dueAt: string }> } | null;
  kpi: { month: string; evaluated: number; averageAchievement: number | null; below: Array<{ name: string; achievement: number }> } | null;
  academic: { activeStudents: number; activeGroups: number; attendanceRate: number; newStudents: number; droppedStudents: number } | null;
  sales: { newLeads: number; wonLeads: number; conversionRate: number } | null;
  marketing: { spend: number; leads: number; costPerLead: number | null; cac: number | null; roi: number | null } | null;
  /** `dueDebt` — muddati kelgan, to'lanmagan oy majburiyatlari (qarz); `totalDebt` — shartnoma qoldig'i */
  payments: { revenue: number; totalDebt: number; dueDebt: number; dueDebtors: number } | null;
  payroll: { accrued: number; paid: number; remaining: number } | null;
  expenses: { total: number; pendingApprovals: number; overLimit: Array<{ name: string; spent: number; limit: number }> } | null;
  complaints: { open: number; newCount: number; overdue: number; escalated: number; critical: number } | null;
  assets: { count: number; value: number; underRepair: number } | null;
  /** Rahbar qarorini kutayotganlar (faqat tasdiqlash huquqi borlarga) */
  approvals: { expenses: number; discounts: number; reviews: number; promotions: number; candidates: number } | null;
}

async function safe<T>(enabled: boolean, load: () => Promise<T>): Promise<T | null> {
  if (!enabled) return null;
  return load();
}

export const orgOverviewService = {
  async get(actor: AuthUser, now: Date = new Date()): Promise<OrgOverviewDto> {
    const can = await permissionService.getRolePermissions(actor.roleId);
    const has = (key: string) => can.has(key);
    const access = await getBranchAccess(actor);
    const branch = branchFilter(access);
    const scope = await branchScopeOf(actor);
    const today = businessDateString(now);
    const [year, month] = today.split('-').map(Number) as [number, number];
    const { start: monthStart, end: monthEnd } = businessMonthRange(year, month);
    const monthFrom = `${today.slice(0, 8)}01`;
    // Direktor paneli bir marta yuklanadi — moliya, sotuv va akademik bloklar uchun
    const executive = has(PERMISSIONS.ANALYTICS_VIEW) ? await executiveService.summary({}, scope) : null;
    // Qarz — qarzdorlik sahifasi bilan bir xil ma'noda: muddati kelgan, to'lanmagan oy majburiyatlari
    const due = executive ? await dueDebtTotals(today, scope.branchId) : null;

    const [attendance, team, tasks, kpi, marketing, expenses, complaints, assets, approvals] = await Promise.all([
      safe(has(PERMISSIONS.STAFF_ATTENDANCE_VIEW), async () => {
        const overview = await staffAttendanceAdminService.overview(actor, undefined, now);
        return {
          ...overview.counts,
          lateNames: overview.rows.filter((row) => row.arrival === 'LATE').slice(0, 5).map((row) => row.name),
        };
      }),
      safe(has(PERMISSIONS.EMPLOYEE_VIEW), async () => {
        const structure = await orgStructureService.get(actor, now);
        return {
          employees: structure.summary.employees,
          teachers: structure.summary.teachers,
          onLeave: structure.summary.onLeave,
          onProbation: structure.summary.onProbation,
          withoutAccount: structure.summary.withoutAccount,
          vacancies: structure.vacancies.length,
        };
      }),
      safe(has(PERMISSIONS.TASK_VIEW_ALL), async () => {
        const where = access.canViewAll ? {} : { assignee: { branchId: access.branchId } };
        const [grouped, overdue, done, items] = await Promise.all([
          prisma.task.groupBy({ by: ['status'], where: { ...where, status: { in: [...ACTIVE_TASK_STATUSES] } }, _count: { _all: true } }),
          prisma.task.count({ where: { ...where, status: { in: [...WORKING_TASK_STATUSES] }, dueAt: { lt: now } } }),
          prisma.task.count({ where: { ...where, status: 'DONE', completedAt: { gte: monthStart, lt: monthEnd } } }),
          prisma.task.findMany({
            where: { ...where, status: { in: [...WORKING_TASK_STATUSES] }, dueAt: { lt: now } },
            orderBy: { dueAt: 'asc' },
            take: 5,
            select: { id: true, title: true, dueAt: true, assignee: { select: { firstName: true, lastName: true } } },
          }),
        ]);
        const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
        return {
          open: count('OPEN'),
          inProgress: count('IN_PROGRESS'),
          review: count('REVIEW'),
          overdue,
          doneThisMonth: done,
          overdueItems: items.map((item) => ({ id: item.id, title: item.title, assignee: fullName(item.assignee), dueAt: item.dueAt!.toISOString() })),
        };
      }),
      // KPI — o'tgan oy (joriy oy hali tugamagan); faqat maosh ko'rish huquqi bilan (KPI bonusga bog'liq)
      safe(has(PERMISSIONS.SALARY_VIEW) && has(PERMISSIONS.EMPLOYEE_VIEW), async () => {
        const previous = new Date(Date.UTC(year, month - 2, 1));
        const kpiYear = previous.getUTCFullYear();
        const kpiMonth = previous.getUTCMonth() + 1;
        const employees = await prisma.employee.findMany({
          where: { ...branch, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
          select: { id: true, firstName: true, lastName: true, userId: true, branchId: true, position: true, kpiBonusPool: true },
        });
        const results: Array<{ name: string; achievement: number }> = [];
        for (const employee of employees) {
          const evaluation = await evaluateEmployeeKpi(prisma, employee, kpiYear, kpiMonth);
          if (evaluation.achievement !== null) results.push({ name: fullName(employee), achievement: evaluation.achievement });
        }
        return {
          month: `${kpiYear}-${String(kpiMonth).padStart(2, '0')}`,
          evaluated: results.length,
          averageAchievement: results.length ? Math.round((results.reduce((sum, row) => sum + row.achievement, 0) / results.length) * 10) / 10 : null,
          below: results.filter((row) => row.achievement < 70).sort((a, b) => a.achievement - b.achievement).slice(0, 5),
        };
      }),
      safe(has(PERMISSIONS.ANALYTICS_VIEW), async () => {
        const [unit, sources] = await Promise.all([analyticsService.unitEconomics({ from: monthFrom, to: today }, scope), analyticsService.sources({ from: monthFrom, to: today }, scope)]);
        return { spend: unit.marketingSpend, leads: unit.leads, costPerLead: unit.costPerLead, cac: unit.cac, roi: sources.totals.roi };
      }),
      safe(has(PERMISSIONS.EXPENSE_VIEW), async () => {
        const [total, pending, spending] = await Promise.all([
          prisma.expense.aggregate({ where: { ...branch, spentAt: { gte: monthStart, lt: monthEnd }, status: { not: 'REJECTED' } }, _sum: { amount: true } }),
          prisma.expense.count({ where: { ...branch, status: 'PENDING' } }),
          orgCatalogService.spending(actor, year, month),
        ]);
        return {
          total: total._sum.amount?.toNumber() ?? 0,
          pendingApprovals: pending,
          overLimit: spending.rows.filter((row) => row.limit !== null && row.spent > row.limit).map((row) => ({ name: row.name, spent: row.spent, limit: row.limit! })),
        };
      }),
      safe(has(PERMISSIONS.COMPLAINT_VIEW), async () => {
        const open = { ...branch, status: { in: ['NEW' as const, 'UNDER_REVIEW' as const] } };
        // Maxfiy murojaatlar soni faqat ularni ko'ra oladiganlarga
        const visible = has(PERMISSIONS.COMPLAINT_CONFIDENTIAL) ? open : { ...open, confidential: false };
        const [all, fresh, overdue, escalated, critical] = await Promise.all([
          prisma.complaint.count({ where: visible }),
          prisma.complaint.count({ where: { ...visible, status: 'NEW' } }),
          prisma.complaint.count({ where: { ...visible, dueAt: { lt: now } } }),
          prisma.complaint.count({ where: { ...visible, escalatedAt: { not: null } } }),
          prisma.complaint.count({ where: { ...visible, severity: 'CRITICAL' } }),
        ]);
        return { open: all, newCount: fresh, overdue, escalated, critical };
      }),
      safe(has(PERMISSIONS.ASSET_VIEW), async () => {
        const [value, repair] = await Promise.all([
          prisma.asset.aggregate({ where: { ...branch, status: { in: [...HELD_ASSET_STATUSES] } }, _sum: { purchaseCost: true }, _count: { _all: true } }),
          prisma.asset.count({ where: { ...branch, status: 'UNDER_REPAIR' } }),
        ]);
        return { count: value._count._all, value: value._sum.purchaseCost?.toNumber() ?? 0, underRepair: repair };
      }),
      safe(has(PERMISSIONS.EXPENSE_APPROVE) || has(PERMISSIONS.DISCOUNT_APPROVE) || has(PERMISSIONS.PERFORMANCE_APPROVE) || has(PERMISSIONS.HIRING_DECIDE), async () => {
        const [expensesPending, discounts, reviews, promotions, candidates] = await Promise.all([
          has(PERMISSIONS.EXPENSE_APPROVE) ? prisma.expense.count({ where: { ...branch, status: 'PENDING' } }) : 0,
          has(PERMISSIONS.DISCOUNT_APPROVE) ? prisma.discountRequest.count({ where: { ...branch, status: 'PENDING' } }) : 0,
          has(PERMISSIONS.PERFORMANCE_APPROVE) ? prisma.performanceReview.count({ where: { ...branch, status: 'SUBMITTED' } }) : 0,
          has(PERMISSIONS.PERFORMANCE_APPROVE) ? prisma.promotionRecommendation.count({ where: { ...branch, status: 'PENDING' } }) : 0,
          has(PERMISSIONS.HIRING_DECIDE) ? prisma.candidate.count({ where: { ...branch, stage: 'OFFER' } }) : 0,
        ]);
        return { expenses: expensesPending, discounts, reviews, promotions, candidates };
      }),
    ]);

    return {
      date: today,
      attendance,
      team,
      tasks,
      kpi,
      academic: executive
        ? {
            activeStudents: executive.kpi.activeStudents,
            activeGroups: executive.kpi.activeGroups,
            attendanceRate: executive.kpi.attendanceRate,
            newStudents: executive.kpi.newStudents,
            droppedStudents: executive.kpi.droppedStudents,
          }
        : null,
      sales: executive ? { newLeads: executive.month.newLeads, wonLeads: executive.month.wonLeads, conversionRate: executive.month.conversionRate } : null,
      marketing,
      payments: executive ? { revenue: executive.month.revenue, totalDebt: executive.kpi.totalDebt, dueDebt: due?.total ?? 0, dueDebtors: due?.debtors ?? 0 } : null,
      payroll:
        executive && has(PERMISSIONS.SALARY_VIEW)
          ? { accrued: executive.month.salaryAccrued, paid: executive.month.salaryPaid, remaining: Math.max(executive.month.salaryAccrued - executive.month.salaryPaid, 0) }
          : null,
      expenses,
      complaints,
      assets,
      approvals,
    };
  },
};
