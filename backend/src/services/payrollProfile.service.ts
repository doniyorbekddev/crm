import { prisma } from '../config/database.js';
import { EMPLOYEE_POSITION_LABELS } from '../config/employeeLabels.js';
import type { EmployeePosition, Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange } from '../utils/dates.js';
import type { PayrollProfileQuery } from '../validators/salary.validator.js';
import { acquisitionsFor, evaluateEmployeeKpi, kpiService, type AcquisitionDto, type KpiDefinitionDto, type KpiEvaluationDto } from './kpi.service.js';
import { salaryService, toSalaryRuleDto, type SalaryPeriodDto, type SalaryRuleDto } from './salary.service.js';

type PersonRef = { id: string; firstName: string; lastName: string };

/** Sotuv faoliyati (operator) — KPI'dan tashqari ko'rinish uchun, oy bo'yicha */
export interface SalesActivityDto {
  leadsAssigned: number;
  leadsContacted: number;
  trialsBooked: number;
  converted: number;
  /** KPI qoidasiga mos jalb qilingan o'quvchilar */
  acquired: AcquisitionDto[];
  /** Biriktirilgan yangi leadlardan sotuvga aylangani, % */
  conversionRate: number | null;
}

export interface PayrollTimelineItemDto {
  id: string;
  action: string;
  label: string;
  at: string;
  actor: PersonRef | null;
  /** Qisqa izoh: sabab, summa yoki davr */
  details: string | null;
}

export interface PayrollProfileDto {
  payee: {
    type: 'TEACHER' | 'EMPLOYEE';
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    roleLabel: string;
    position: EmployeePosition | null;
    department: string | null;
    branch: { id: string; name: string } | null;
    since: string | null;
  };
  /** O'qituvchi maosh modellari tarixi (yangisi birinchi) */
  rules: SalaryRuleDto[];
  /** Xodim: belgilangan maosh va KPI bonus fondi */
  employeeTerms: { baseSalary: number; kpiBonusPool: number } | null;
  /** Xodim lavozimi KPI'lari (amaldagi) */
  kpis: KpiDefinitionDto[];
  current: SalaryPeriodDto | null;
  /** Hali tasdiqlanmagan oy uchun jonli KPI hisobi (maosh hisoblanmagan yoki qayta hisoblash kerak bo'lsa) */
  kpiPreview: KpiEvaluationDto | null;
  sales: SalesActivityDto | null;
  history: SalaryPeriodDto[];
  timeline: PayrollTimelineItemDto[];
}

const TIMELINE_LABELS: Record<string, string> = {
  'salary.calculated': 'Hisoblandi',
  'salary.submitted': 'Tasdiqlashga yuborildi',
  'salary.rejected': 'Rad etildi',
  'salary.approved': 'Tasdiqlandi',
  'salary.paid': 'To‘lov qayd etildi',
  'salary.advance_paid': 'Avans berildi',
  'salary.unlocked': 'Qayta ochildi',
  'salary.adjustment_added': 'Bonus yoki jarima qo‘shildi',
  'salary.adjustment_voided': 'Bonus yoki jarima bekor qilindi',
  'salary.note_updated': 'Izoh o‘zgardi',
  'salary.rule_created': 'Maosh modeli belgilandi',
  'kpi.result_saved': 'KPI natijasi kiritildi',
  'kpi.pool_updated': 'KPI bonus fondi o‘zgardi',
};

const SALES_POSITIONS: readonly EmployeePosition[] = ['SALES_MANAGER', 'CALL_CENTER'];

function money(value: unknown): string | null {
  return typeof value === 'number' ? `${new Intl.NumberFormat('uz-UZ').format(value).replace(/,/g, ' ')} so‘m` : null;
}

function timelineDetails(action: string, metadata: Record<string, unknown>, after: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof metadata.period === 'string') parts.push(metadata.period);
  if (action === 'salary.paid' || action === 'salary.advance_paid' || action === 'salary.adjustment_added') {
    const amount = money(metadata.amount);
    if (amount) parts.push(amount);
  } else if (action === 'kpi.pool_updated') {
    const amount = money(after.kpiBonusPool);
    if (amount) parts.push(amount);
  } else if (action === 'kpi.result_saved') {
    if (typeof metadata.kpi === 'string') parts.push(`${metadata.kpi}: ${String(after.actual ?? '')}`);
  } else if (action !== 'salary.rule_created') {
    const total = money(metadata.totalAmount);
    if (total) parts.push(total);
  }
  if (typeof metadata.reason === 'string') parts.push(metadata.reason);
  return parts.length > 0 ? parts.join(' · ') : null;
}

async function salesActivity(userId: string, year: number, month: number): Promise<SalesActivityDto> {
  const { start, end } = businessMonthRange(year, month);
  const leadsAssigned = await prisma.lead.count({ where: { deletedAt: null, assignedToId: userId, createdAt: { gte: start, lt: end } } });
  const contacted = await prisma.call.findMany({
    where: { managerId: userId, calledAt: { gte: start, lt: end } },
    select: { leadId: true },
    distinct: ['leadId'],
  });
  const trialActivities = await prisma.leadActivity.findMany({
    where: { userId, type: 'STATUS_CHANGED', createdAt: { gte: start, lt: end } },
    select: { leadId: true, metadata: true },
  });
  const trials = new Set(
    trialActivities.filter((row) => (row.metadata as { to?: unknown } | null)?.to === 'TRIAL_BOOKED').map((row) => row.leadId),
  );
  const converted = await prisma.lead.count({ where: { deletedAt: null, assignedToId: userId, status: 'WON', convertedAt: { gte: start, lt: end } } });
  const wonFromAssigned = await prisma.lead.count({
    where: { deletedAt: null, assignedToId: userId, createdAt: { gte: start, lt: end }, status: 'WON', convertedAt: { gte: start, lt: end } },
  });
  return {
    leadsAssigned,
    leadsContacted: contacted.length,
    trialsBooked: trials.size,
    converted,
    acquired: await acquisitionsFor(prisma, userId, year, month),
    conversionRate: leadsAssigned === 0 ? null : Math.round((wonFromAssigned / leadsAssigned) * 1000) / 10,
  };
}

async function timeline(periodIds: string[], extra: { entityType: string; entityId: string }): Promise<PayrollTimelineItemDto[]> {
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      ...(periodIds.length > 0 ? [{ entityType: 'salary', entityId: { in: periodIds } }] : []),
      { entityType: extra.entityType, entityId: extra.entityId, action: { in: Object.keys(TIMELINE_LABELS) } },
    ],
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true, action: true, createdAt: true, metadata: true, after: true, user: { select: { id: true, firstName: true, lastName: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    label: TIMELINE_LABELS[row.action] ?? row.action,
    at: row.createdAt.toISOString(),
    actor: row.user,
    details: timelineDetails(row.action, (row.metadata ?? {}) as Record<string, unknown>, (row.after ?? {}) as Record<string, unknown>),
  }));
}

export const payrollProfileService = {
  /** Xodim yoki o'qituvchining maosh profili: shartnoma, tanlangan oy hisobi, tarix va o'zgarishlar xronologiyasi */
  async profile(query: PayrollProfileQuery): Promise<PayrollProfileDto> {
    if (query.type === 'TEACHER') {
      const profile = await prisma.teacherProfile.findUnique({
        where: { id: query.id },
        select: {
          id: true,
          specialization: true,
          hireDate: true,
          user: { select: { id: true, firstName: true, lastName: true, branch: { select: { id: true, name: true } } } },
          salaryRules: { orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], select: ruleSelectForProfile },
        },
      });
      if (!profile) throw AppError.notFound('O‘qituvchi topilmadi');
      const periods = await salaryService.history(profile.id, { limit: 12 });
      const current = periods.find((period) => period.year === query.year && period.month === query.month) ?? null;
      return {
        payee: {
          type: 'TEACHER',
          id: profile.id,
          userId: profile.user.id,
          firstName: profile.user.firstName,
          lastName: profile.user.lastName,
          roleLabel: profile.specialization ? `O‘qituvchi · ${profile.specialization}` : 'O‘qituvchi',
          position: null,
          department: null,
          branch: profile.user.branch,
          since: profile.hireDate ? profile.hireDate.toISOString().slice(0, 10) : null,
        },
        rules: profile.salaryRules.map(toSalaryRuleDto),
        employeeTerms: null,
        kpis: [],
        current,
        kpiPreview: null,
        sales: null,
        history: periods,
        timeline: await timeline(
          periods.map((period) => period.id),
          { entityType: 'teacher', entityId: profile.id },
        ),
      };
    }

    const employee = await prisma.employee.findUnique({
      where: { id: query.id },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        position: true,
        department: true,
        hireDate: true,
        baseSalary: true,
        kpiBonusPool: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!employee) throw AppError.notFound('Xodim topilmadi');
    const periods = await salaryService.employeeHistory(employee.id, 12);
    const current = periods.find((period) => period.year === query.year && period.month === query.month) ?? null;
    const { definitions } = await kpiService.definitions();
    const kpis = definitions.filter((definition) => definition.position === employee.position && definition.isActive);
    const kpiPreview = current?.lockedAt ? null : await evaluateEmployeeKpi(prisma, employee, query.year, query.month);
    const showSales =
      employee.userId !== null &&
      (SALES_POSITIONS.includes(employee.position) || kpis.some((kpi) => kpi.metric === 'ACQUIRED_STUDENTS' || kpi.metric === 'LEAD_CONVERSION'));

    return {
      payee: {
        type: 'EMPLOYEE',
        id: employee.id,
        userId: employee.userId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        roleLabel: EMPLOYEE_POSITION_LABELS[employee.position],
        position: employee.position,
        department: employee.department,
        branch: employee.branch,
        since: employee.hireDate.toISOString().slice(0, 10),
      },
      rules: [],
      employeeTerms: { baseSalary: employee.baseSalary.toNumber(), kpiBonusPool: employee.kpiBonusPool.toNumber() },
      kpis,
      current,
      kpiPreview,
      sales: showSales ? await salesActivity(employee.userId!, query.year, query.month) : null,
      history: periods,
      timeline: await timeline(
        periods.map((period) => period.id),
        { entityType: 'employee', entityId: employee.id },
      ),
    };
  },
};

const ruleSelectForProfile = {
  id: true,
  type: true,
  baseSalary: true,
  perLessonRate: true,
  perStudentRate: true,
  percentage: true,
  bonus: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TeacherSalaryRuleSelect;
