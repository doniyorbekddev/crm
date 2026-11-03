import { prisma } from '../../config/database.js';
import { EMPLOYEE_POSITION_LABELS } from '../../config/employeeLabels.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { ApprovalStatus, EmployeePosition, PerformanceRating, PerformanceReviewStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { businessDateString } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { AwardInput, PromotionInput, ReviewInput } from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from '../branchAccess.js';
import { employeeService } from '../employee.service.js';
import { evaluateEmployeeKpi } from '../kpi.service.js';
import { notificationService } from '../notification.service.js';
import { permissionService } from '../permission.service.js';
import { salaryService } from '../salary.service.js';
import { staffAttendanceAdminService } from '../staffAttendance/admin.service.js';
import { ensureOrgCatalog, positionTitle, TEACHER_POSITION_KEY } from './catalogDefaults.js';
import { fullName, permissionHolders, personSelect, staffRoleWhere, toDateOnly } from './common.js';
import type { Person } from './common.js';

/**
 * Natija va rivojlanish (ORG §5.1, §6.2, §13):
 *  - **choraklik baholash (attestatsiya):** KPI o'rtachasi va davomat avtomatik olinadi, baholovchi mezonlarni
 *    1–5 bilan baholaydi; yakunlangach markaz rahbari tasdiqlaydi (`performance.approve`);
 *  - **taqdirlash:** oy/chorak xodimi, mukofot, malaka oshirish; pul mukofoti — maosh tuzatmasi sifatida
 *    (maosh qoidalari va tasdiqlash tartibi o'zgarmaydi);
 *  - **lavozimga ko'tarish:** katalogdagi karyera yo'li talablari (eng kam KPI, lavozimdagi muddat) tekshiriladi,
 *    tavsiya rahbar tasdig'idan keyin xodim kartasiga va ish tarixiga yoziladi.
 */

export const REVIEW_CRITERIA = ['quality', 'discipline', 'teamwork', 'initiative', 'results'] as const;
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

const QUARTER_MONTHS = (quarter: number) => [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];

function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const start = new Date(Date.UTC(year, quarter * 3 - 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0));
  return { from: toDateOnly(start), to: toDateOnly(end) };
}

export function ratingFor(overall: number): PerformanceRating {
  if (overall >= 4.25) return 'EXCEEDS';
  if (overall >= 3) return 'MEETS';
  return 'BELOW';
}

async function permissionsOf(actor: AuthUser): Promise<ReadonlySet<string>> {
  return permissionService.getRolePermissions(actor.roleId);
}

/** Baholanadigan xodim: faol xodim hisobi (filial doirasida) va uning xodim kartasi yoki o'qituvchi profili */
async function subjectOf(actor: AuthUser, userId: string): Promise<{ id: string; name: string; branchId: string; employee: { id: string; position: EmployeePosition; positionTitle: string | null; branchId: string; kpiBonusPool: Prisma.Decimal; userId: string | null; hireDate: Date } | null; isTeacher: boolean }> {
  const access = await getBranchAccess(actor);
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      branchId: true,
      employee: { select: { id: true, position: true, positionTitle: true, branchId: true, kpiBonusPool: true, userId: true, hireDate: true } },
      teacherProfile: { select: { id: true } },
    },
  });
  if (!user) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'userId', message: 'Xodim topilmadi' }]);
  return { id: user.id, name: fullName(user), branchId: user.branchId, employee: user.employee, isTeacher: Boolean(user.teacherProfile) };
}

/** Chorak oylari KPI bajarilishining o'rtachasi (ma'lumoti bor oylar bo'yicha) */
async function kpiAverage(employee: { id: string; userId: string | null; branchId: string; position: EmployeePosition; kpiBonusPool: Prisma.Decimal }, year: number, months: number[]): Promise<number | null> {
  const values: number[] = [];
  for (const month of months) {
    const evaluation = await evaluateEmployeeKpi(prisma, employee, year, month);
    if (evaluation.achievement !== null) values.push(evaluation.achievement);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

async function attendanceRate(actor: AuthUser, userId: string, year: number, quarter: number): Promise<number | null> {
  const { from, to } = quarterRange(year, quarter);
  try {
    const report = await staffAttendanceAdminService.report(actor, from, to);
    return report.rows.find((row) => row.userId === userId)?.summary.attendancePercent ?? null;
  } catch {
    // Davomat yuritilmaydigan hisob yoki ruxsat doirasidan tashqari — ko'rsatkichsiz baholanadi
    return null;
  }
}

// ---------------------------------------------------------------- baholash

const reviewSelect = {
  id: true,
  year: true,
  quarter: true,
  positionKey: true,
  positionTitle: true,
  kpiAverage: true,
  attendanceRate: true,
  scores: true,
  overallScore: true,
  rating: true,
  strengths: true,
  improvements: true,
  goals: true,
  recommendPromotion: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
  user: personSelect,
  reviewer: personSelect,
  approvedBy: personSelect,
} satisfies Prisma.PerformanceReviewSelect;

type ReviewRow = Prisma.PerformanceReviewGetPayload<{ select: typeof reviewSelect }>;

export interface ReviewDto {
  id: string;
  year: number;
  quarter: number;
  positionKey: string;
  positionTitle: string;
  kpiAverage: number | null;
  attendanceRate: number | null;
  scores: Record<ReviewCriterion, number>;
  overallScore: number;
  rating: PerformanceRating;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  recommendPromotion: boolean;
  status: PerformanceReviewStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  user: Person;
  reviewer: Person | null;
  approvedBy: Person | null;
}

function toReviewDto(row: ReviewRow): ReviewDto {
  return {
    ...row,
    kpiAverage: row.kpiAverage?.toNumber() ?? null,
    attendanceRate: row.attendanceRate?.toNumber() ?? null,
    scores: row.scores as Record<ReviewCriterion, number>,
    overallScore: row.overallScore.toNumber(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------- taqdirlash va ko'tarilish

const awardSelect = { id: true, type: true, year: true, period: true, title: true, reason: true, amount: true, salaryPeriodId: true, createdAt: true, user: personSelect, createdBy: personSelect } satisfies Prisma.StaffAwardSelect;
type AwardRow = Prisma.StaffAwardGetPayload<{ select: typeof awardSelect }>;
export interface AwardDto extends Omit<AwardRow, 'amount' | 'createdAt'> {
  amount: number | null;
  createdAt: string;
}
const toAwardDto = (row: AwardRow): AwardDto => ({ ...row, amount: row.amount?.toNumber() ?? null, createdAt: row.createdAt.toISOString() });

const promotionSelect = {
  id: true,
  fromPositionKey: true,
  toPositionKey: true,
  reason: true,
  kpiAverage: true,
  monthsInPosition: true,
  status: true,
  effectiveDate: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
  recommendedBy: personSelect,
  decidedBy: personSelect,
} satisfies Prisma.PromotionRecommendationSelect;
type PromotionRow = Prisma.PromotionRecommendationGetPayload<{ select: typeof promotionSelect }>;
export interface PromotionDto {
  id: string;
  employee: { id: string; firstName: string; lastName: string };
  from: { key: string; title: string };
  to: { key: string; title: string };
  reason: string;
  kpiAverage: number | null;
  monthsInPosition: number;
  status: ApprovalStatus;
  effectiveDate: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  recommendedBy: Person | null;
  decidedBy: Person | null;
}
function toPromotionDto(row: PromotionRow): PromotionDto {
  return {
    id: row.id,
    employee: { id: row.employee.id, firstName: row.employee.firstName, lastName: row.employee.lastName },
    from: { key: row.fromPositionKey, title: positionTitle(row.fromPositionKey) },
    to: { key: row.toPositionKey, title: positionTitle(row.toPositionKey) },
    reason: row.reason,
    kpiAverage: row.kpiAverage?.toNumber() ?? null,
    monthsInPosition: row.monthsInPosition,
    status: row.status,
    effectiveDate: row.effectiveDate ? toDateOnly(row.effectiveDate) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
    recommendedBy: row.recommendedBy,
    decidedBy: row.decidedBy,
  };
}

export interface CareerStatusDto {
  employeeId: string;
  name: string;
  position: { key: string; title: string };
  next: { key: string; title: string; requirements: string | null; minimumKpiScore: number | null; minimumMonths: number | null } | null;
  monthsInPosition: number;
  /** Oxirgi 3 oy KPI o'rtachasi */
  kpiAverage: number | null;
  /** Talablar bajarilganmi (talab qo'yilmagan bo'lsa — true) */
  meetsKpi: boolean;
  meetsTenure: boolean;
  eligible: boolean;
  pendingPromotion: boolean;
}

/** Joriy lavozimda necha oy: ish tarixidagi oxirgi lavozim o'zgarishidan (yo'q bo'lsa — ishga kirgan sanadan) */
async function monthsInPosition(employeeId: string, hireDate: Date, now: Date): Promise<number> {
  const last = await prisma.employmentHistory.findFirst({
    where: { employeeId, type: { in: ['HIRED', 'POSITION_CHANGED', 'PROMOTED'] } },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    select: { effectiveDate: true },
  });
  const start = last?.effectiveDate ?? hireDate;
  return Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()) - (now.getUTCDate() < start.getUTCDate() ? 1 : 0));
}

function lastMonths(now: Date, count: number): Array<{ year: number; month: number }> {
  const [year, month] = businessDateString(now).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 2 - index, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
}

export const performanceService = {
  // ------------------------------------------------------------ baholash
  async reviews(actor: AuthUser, query: { year: number; quarter?: number | undefined; status?: PerformanceReviewStatus | undefined }): Promise<ReviewDto[]> {
    const access = await getBranchAccess(actor);
    const rows = await prisma.performanceReview.findMany({
      where: { ...branchFilter(access), year: query.year, ...(query.quarter ? { quarter: query.quarter } : {}), ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ quarter: 'desc' }, { overallScore: 'desc' }],
      select: reviewSelect,
    });
    return rows.map(toReviewDto);
  },

  /** Baholash formasi uchun avtomatik ko'rsatkichlar (KPI o'rtachasi, davomat) */
  async prefill(actor: AuthUser, userId: string, year: number, quarter: number): Promise<{ kpiAverage: number | null; attendanceRate: number | null; position: { key: string; title: string } }> {
    const subject = await subjectOf(actor, userId);
    const position = subject.employee ? subject.employee.position : TEACHER_POSITION_KEY;
    return {
      kpiAverage: subject.employee ? await kpiAverage(subject.employee, year, QUARTER_MONTHS(quarter)) : null,
      attendanceRate: await attendanceRate(actor, userId, year, quarter),
      position: { key: position, title: subject.employee?.positionTitle ?? positionTitle(position) },
    };
  },

  async saveReview(actor: AuthUser, input: ReviewInput, client: ClientInfo): Promise<ReviewDto> {
    if (input.userId === actor.id) throw AppError.forbidden('O‘zingizni baholay olmaysiz');
    const subject = await subjectOf(actor, input.userId);
    const existing = await prisma.performanceReview.findUnique({ where: { userId_year_quarter: { userId: input.userId, year: input.year, quarter: input.quarter } }, select: { id: true, status: true } });
    if (existing?.status === 'APPROVED') throw AppError.conflict('Tasdiqlangan baholash o‘zgartirilmaydi');
    const values = REVIEW_CRITERIA.map((key) => input.scores[key]);
    const overall = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
    const prefill = await this.prefill(actor, input.userId, input.year, input.quarter);
    const now = new Date();
    const data = {
      positionKey: prefill.position.key,
      positionTitle: prefill.position.title,
      kpiAverage: prefill.kpiAverage,
      attendanceRate: prefill.attendanceRate,
      scores: input.scores as Prisma.InputJsonValue,
      overallScore: overall,
      rating: ratingFor(overall),
      strengths: input.strengths ?? null,
      improvements: input.improvements ?? null,
      goals: input.goals ?? null,
      recommendPromotion: input.recommendPromotion,
      status: (input.submit ? 'SUBMITTED' : 'DRAFT') as PerformanceReviewStatus,
      submittedAt: input.submit ? now : null,
      reviewerId: actor.id,
    };
    const id = await prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.performanceReview.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.performanceReview.create({ data: { ...data, userId: input.userId, employeeId: subject.employee?.id ?? null, year: input.year, quarter: input.quarter, branchId: subject.branchId }, select: { id: true } });
      if (input.submit) {
        const approvers = (await permissionHolders(PERMISSIONS.PERFORMANCE_APPROVE, subject.branchId)).filter((userId) => userId !== actor.id);
        await notificationService.createManyInTransaction(
          tx,
          approvers.map((userId) => ({
            userId,
            type: 'APPROVAL_REQUEST' as const,
            title: 'Baholash tasdiq kutmoqda',
            message: `${subject.name}: ${input.year}-yil ${input.quarter}-chorak — ${overall} / 5`,
            entityType: 'performance_review',
            entityId: row.id,
            actionUrl: `/performance?review=${row.id}`,
            dedupeKey: `review:${row.id}:submitted:${now.getTime()}:${userId}`,
          })),
        );
      }
      await auditService.recordInTransaction(tx, { userId: actor.id, action: input.submit ? 'performance.review_submitted' : 'performance.review_saved', entityType: 'performance_review', entityId: row.id, metadata: { subject: subject.name, year: input.year, quarter: input.quarter, overall, rating: ratingFor(overall) }, ...client });
      return row.id;
    });
    return toReviewDto(await prisma.performanceReview.findUniqueOrThrow({ where: { id }, select: reviewSelect }));
  },

  /** Tasdiqlash — markaz rahbari; xodim natijasini ko'radi va xabar oladi */
  async approveReview(actor: AuthUser, id: string, client: ClientInfo): Promise<ReviewDto> {
    const access = await getBranchAccess(actor);
    const row = await prisma.performanceReview.findFirst({ where: { id, ...branchFilter(access) }, select: { id: true, status: true, userId: true, reviewerId: true, year: true, quarter: true, overallScore: true } });
    if (!row) throw AppError.notFound('Baholash topilmadi');
    if (row.status !== 'SUBMITTED') throw AppError.unprocessable('Faqat yakunlangan baholash tasdiqlanadi');
    if (row.userId === actor.id) throw AppError.forbidden('O‘z baholashingizni tasdiqlay olmaysiz');
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.performanceReview.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } });
      if (claimed.count === 0) throw AppError.conflict('Baholash hozirgina o‘zgartirildi');
      await notificationService.createInTransaction(tx, {
        userId: row.userId,
        type: 'HR_UPDATE',
        title: 'Choraklik baholash natijasi',
        message: `${row.year}-yil ${row.quarter}-chorak: ${row.overallScore.toNumber()} / 5`,
        entityType: 'performance_review',
        entityId: id,
        actionUrl: '/my-growth',
        dedupeKey: `review:${id}:approved`,
      });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'performance.review_approved', entityType: 'performance_review', entityId: id, metadata: { year: row.year, quarter: row.quarter }, ...client });
    });
    return toReviewDto(await prisma.performanceReview.findUniqueOrThrow({ where: { id }, select: reviewSelect }));
  },

  // ------------------------------------------------------------ taqdirlash
  async awards(actor: AuthUser, year: number): Promise<AwardDto[]> {
    const access = await getBranchAccess(actor);
    const rows = await prisma.staffAward.findMany({ where: { ...branchFilter(access), year }, orderBy: [{ createdAt: 'desc' }], select: awardSelect });
    return rows.map(toAwardDto);
  },

  /**
   * Taqdirlash. Oy/chorak xodimi davr uchun bitta. Pul mukofoti — maoshga bonus tuzatmasi (maosh servisi orqali:
   * tasdiqlangan oyga qo'shilmaydi, tasdiqlash tartibi o'zgarmaydi) — buning uchun maosh hisoblash huquqi kerak.
   */
  async addAward(actor: AuthUser, input: AwardInput, client: ClientInfo): Promise<AwardDto> {
    const subject = await subjectOf(actor, input.userId);
    if ((input.type === 'EMPLOYEE_OF_MONTH' || input.type === 'EMPLOYEE_OF_QUARTER') && !input.period) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'period', message: input.type === 'EMPLOYEE_OF_MONTH' ? 'Oyni tanlang' : 'Chorakni tanlang' }]);
    }
    if (input.type === 'EMPLOYEE_OF_MONTH' || input.type === 'EMPLOYEE_OF_QUARTER') {
      const taken = await prisma.staffAward.count({ where: { type: input.type, year: input.year, period: input.period!, branchId: resolveBranchId(await getBranchAccess(actor)) } });
      if (taken > 0) throw AppError.conflict(input.type === 'EMPLOYEE_OF_MONTH' ? 'Bu oy uchun “Oy xodimi” allaqachon tanlangan' : 'Bu chorak uchun “Chorak xodimi” allaqachon tanlangan');
    }
    let salaryPeriodId: string | null = null;
    if (input.amount && input.addToPayroll) {
      if (!(await permissionsOf(actor)).has(PERMISSIONS.SALARY_CALCULATE)) throw AppError.forbidden('Mukofotni maoshga qo‘shish uchun maosh hisoblash huquqi kerak');
      const teacher = subject.employee ? null : await prisma.teacherProfile.findUnique({ where: { userId: subject.id }, select: { id: true } });
      if (!subject.employee && !teacher) throw AppError.unprocessable('Xodim kartasi yoki o‘qituvchi profili yo‘q — mukofotni maoshga qo‘shib bo‘lmaydi');
      const [year, month] = businessDateString(new Date()).split('-').map(Number) as [number, number];
      const period = await salaryService.addAdjustment(
        actor,
        {
          ...(subject.employee ? { employeeId: subject.employee.id } : { teacherProfileId: teacher!.id }),
          year,
          month,
          type: 'BONUS',
          category: 'PERFORMANCE',
          amount: input.amount,
          reason: `${input.title}: ${input.reason}`.slice(0, 255),
          date: new Date(`${businessDateString(new Date())}T00:00:00.000Z`),
        },
        client,
      );
      salaryPeriodId = period.id;
    }
    const award = await prisma.$transaction(async (tx) => {
      const row = await tx.staffAward.create({
        data: { userId: subject.id, type: input.type, year: input.year, period: input.period ?? null, title: input.title, reason: input.reason, amount: input.amount ?? null, salaryPeriodId, createdById: actor.id, branchId: subject.branchId },
        select: awardSelect,
      });
      await notificationService.createInTransaction(tx, {
        userId: subject.id,
        type: 'HR_UPDATE',
        title: '🏆 Siz taqdirlandingiz',
        message: `${input.title} — ${input.reason}`,
        entityType: 'staff_award',
        entityId: row.id,
        actionUrl: '/my-growth',
        dedupeKey: `award:${row.id}`,
      });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'performance.award_added', entityType: 'staff_award', entityId: row.id, metadata: { subject: subject.name, type: input.type, amount: input.amount ?? null, salaryPeriodId }, ...client });
      return row;
    });
    return toAwardDto(award);
  },

  // ------------------------------------------------------------ karyera
  /** Har xodim uchun karyera holati: keyingi lavozim, talablar va bajarilishi */
  async careers(actor: AuthUser, now: Date = new Date()): Promise<CareerStatusDto[]> {
    await ensureOrgCatalog(prisma);
    const access = await getBranchAccess(actor);
    const [employees, positions, pending] = await Promise.all([
      prisma.employee.findMany({ where: { ...branchFilter(access), status: { in: ['ACTIVE', 'ON_LEAVE'] } }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true, position: true, positionTitle: true, hireDate: true, userId: true, branchId: true, kpiBonusPool: true } }),
      prisma.position.findMany({ select: { key: true, title: true, careerRequirements: true, minimumKpiScore: true, minimumMonths: true, nextPosition: { select: { key: true, title: true } } } }),
      prisma.promotionRecommendation.findMany({ where: { status: 'PENDING' }, select: { employeeId: true } }),
    ]);
    const byKey = new Map(positions.map((position) => [position.key, position]));
    const pendingIds = new Set(pending.map((row) => row.employeeId));
    const months = lastMonths(now, 3);
    const result: CareerStatusDto[] = [];
    for (const employee of employees) {
      const position = byKey.get(employee.position);
      const next = position?.nextPosition ?? null;
      const tenure = await monthsInPosition(employee.id, employee.hireDate, now);
      let kpi: number | null = null;
      if (next) {
        const values: number[] = [];
        for (const { year, month } of months) {
          const evaluation = await evaluateEmployeeKpi(prisma, employee, year, month);
          if (evaluation.achievement !== null) values.push(evaluation.achievement);
        }
        kpi = values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
      }
      const meetsKpi = !position?.minimumKpiScore || (kpi !== null && kpi >= position.minimumKpiScore);
      const meetsTenure = !position?.minimumMonths || tenure >= position.minimumMonths;
      result.push({
        employeeId: employee.id,
        name: fullName(employee),
        position: { key: employee.position, title: employee.positionTitle ?? position?.title ?? EMPLOYEE_POSITION_LABELS[employee.position] },
        next: next ? { key: next.key, title: next.title, requirements: position?.careerRequirements ?? null, minimumKpiScore: position?.minimumKpiScore ?? null, minimumMonths: position?.minimumMonths ?? null } : null,
        monthsInPosition: tenure,
        kpiAverage: kpi,
        meetsKpi,
        meetsTenure,
        eligible: Boolean(next) && meetsKpi && meetsTenure,
        pendingPromotion: pendingIds.has(employee.id),
      });
    }
    return result;
  },

  async promotions(actor: AuthUser, status: ApprovalStatus | undefined): Promise<PromotionDto[]> {
    const access = await getBranchAccess(actor);
    const rows = await prisma.promotionRecommendation.findMany({ where: { ...branchFilter(access), ...(status ? { status } : {}) }, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take: 200, select: promotionSelect });
    return rows.map(toPromotionDto);
  },

  /** Tavsiya: talablar bajarilmagan bo'lsa ham kiritiladi (sabab bilan), lekin ko'rsatkichlar yoziladi — qarorni rahbar qiladi */
  async recommend(actor: AuthUser, input: PromotionInput, client: ClientInfo): Promise<PromotionDto> {
    const access = await getBranchAccess(actor);
    const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, ...branchFilter(access), status: { in: ['ACTIVE', 'ON_LEAVE'] } }, select: { id: true, firstName: true, lastName: true, position: true, hireDate: true, branchId: true } });
    if (!employee) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'employeeId', message: 'Xodim topilmadi' }]);
    if (input.toPositionKey === employee.position) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'toPositionKey', message: 'Xodim allaqachon shu lavozimda' }]);
    if (!(await prisma.position.findUnique({ where: { key: input.toPositionKey }, select: { id: true } })) || input.toPositionKey === TEACHER_POSITION_KEY) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'toPositionKey', message: 'Lavozim topilmadi' }]);
    }
    if (await prisma.promotionRecommendation.count({ where: { employeeId: employee.id, status: 'PENDING' } })) throw AppError.conflict('Bu xodim uchun kutilayotgan tavsiya bor');
    const status = (await this.careers(actor)).find((row) => row.employeeId === employee.id);
    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.promotionRecommendation.create({
        data: {
          employeeId: employee.id,
          fromPositionKey: employee.position,
          toPositionKey: input.toPositionKey,
          reason: input.reason,
          kpiAverage: status?.kpiAverage ?? null,
          monthsInPosition: status?.monthsInPosition ?? 0,
          effectiveDate: input.effectiveDate ?? null,
          recommendedById: actor.id,
          branchId: employee.branchId,
        },
        select: { id: true },
      });
      const approvers = (await permissionHolders(PERMISSIONS.PERFORMANCE_APPROVE, employee.branchId)).filter((userId) => userId !== actor.id);
      await notificationService.createManyInTransaction(
        tx,
        approvers.map((userId) => ({
          userId,
          type: 'APPROVAL_REQUEST' as const,
          title: 'Lavozimga ko‘tarish tavsiyasi',
          message: `${fullName(employee)}: ${positionTitle(employee.position)} → ${positionTitle(input.toPositionKey)}. ${input.reason}`,
          entityType: 'promotion',
          entityId: row.id,
          actionUrl: '/performance?tab=career',
          dedupeKey: `promotion:${row.id}:${userId}`,
        })),
      );
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'performance.promotion_recommended', entityType: 'promotion', entityId: row.id, metadata: { employee: fullName(employee), from: employee.position, to: input.toPositionKey, kpiAverage: status?.kpiAverage ?? null }, ...client });
      return row.id;
    });
    return toPromotionDto(await prisma.promotionRecommendation.findUniqueOrThrow({ where: { id }, select: promotionSelect }));
  },

  /** Qaror — markaz rahbari. Tasdiqlanganda xodim kartasi yangilanadi va ish tarixiga "lavozimga ko'tarildi" yoziladi */
  async decidePromotion(actor: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, client: ClientInfo): Promise<PromotionDto> {
    const access = await getBranchAccess(actor);
    const row = await prisma.promotionRecommendation.findFirst({ where: { id, ...branchFilter(access) }, select: { id: true, status: true, employeeId: true, toPositionKey: true, recommendedById: true, employee: { select: { userId: true, firstName: true, lastName: true } } } });
    if (!row) throw AppError.notFound('Tavsiya topilmadi');
    if (row.status !== 'PENDING') throw AppError.conflict('Tavsiya allaqachon ko‘rib chiqilgan');
    if (row.employee.userId === actor.id) throw AppError.forbidden('O‘z lavozimingiz bo‘yicha qaror qabul qila olmaysiz');
    if (decision === 'REJECTED' && !note) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'note', message: 'Rad etish sababini yozing' }]);
    const claimed = await prisma.promotionRecommendation.updateMany({ where: { id, status: 'PENDING' }, data: { status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: note ?? null } });
    if (claimed.count === 0) throw AppError.conflict('Tavsiya allaqachon ko‘rib chiqilgan');
    if (decision === 'APPROVED') {
      // Xodimlar servisi orqali: tekshiruvlar, audit va ish tarixi (lavozim o'zgarishi) bir joyda.
      // U o'z tranzaksiyasida ishlaydi — muvaffaqiyatsiz bo'lsa qaror qaytariladi (tavsiya yana kutishda)
      try {
        await employeeService.update(actor, row.employeeId, { position: row.toPositionKey as EmployeePosition, changeReason: `Lavozimga ko‘tarildi${note ? `: ${note}` : ''}` }, client);
      } catch (error) {
        await prisma.promotionRecommendation.updateMany({ where: { id, status: 'APPROVED', decidedById: actor.id }, data: { status: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null } });
        throw error;
      }
      await prisma.employmentHistory.updateMany({
        where: { employeeId: row.employeeId, type: 'POSITION_CHANGED', positionKey: row.toPositionKey, approvedById: null },
        data: { type: 'PROMOTED', approvedById: actor.id },
      });
    }
    await prisma.$transaction(async (tx) => {
      const recipients = [row.recommendedById, row.employee.userId].filter((userId): userId is string => Boolean(userId) && userId !== actor.id);
      await notificationService.createManyInTransaction(
        tx,
        [...new Set(recipients)].map((userId) => ({
          userId,
          type: 'HR_UPDATE' as const,
          title: decision === 'APPROVED' ? '🎉 Lavozimga ko‘tarilish tasdiqlandi' : 'Ko‘tarilish tavsiyasi rad etildi',
          message: `${fullName(row.employee)}: ${positionTitle(row.toPositionKey)}${note ? ` — ${note}` : ''}`,
          entityType: 'promotion',
          entityId: id,
          actionUrl: userId === row.employee.userId ? '/my-growth' : '/performance?tab=career',
          dedupeKey: `promotion:${id}:${decision.toLowerCase()}:${userId}`,
        })),
      );
      await auditService.recordInTransaction(tx, { userId: actor.id, action: decision === 'APPROVED' ? 'performance.promotion_approved' : 'performance.promotion_rejected', entityType: 'promotion', entityId: id, metadata: { employeeId: row.employeeId, to: row.toPositionKey, note: note ?? null }, ...client });
    });
    return toPromotionDto(await prisma.promotionRecommendation.findUniqueOrThrow({ where: { id }, select: promotionSelect }));
  },

  /** Xodimning o'zi: tasdiqlangan baholashlar, taqdirlashlar va karyera yo'li */
  async mine(actor: AuthUser, now: Date = new Date()): Promise<{ reviews: ReviewDto[]; awards: AwardDto[]; career: CareerStatusDto | null }> {
    const [reviews, awards, employee] = await Promise.all([
      prisma.performanceReview.findMany({ where: { userId: actor.id, status: 'APPROVED' }, orderBy: [{ year: 'desc' }, { quarter: 'desc' }], select: reviewSelect }),
      prisma.staffAward.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, select: awardSelect }),
      prisma.employee.findFirst({ where: { userId: actor.id }, select: { id: true } }),
    ]);
    let career: CareerStatusDto | null = null;
    if (employee) {
      // O'z kartasi bo'yicha — ko'rinish doirasi tekshiruvisiz (faqat o'zi)
      const full = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, select: { id: true, firstName: true, lastName: true, position: true, positionTitle: true, hireDate: true, userId: true, branchId: true, kpiBonusPool: true } });
      await ensureOrgCatalog(prisma);
      const position = await prisma.position.findUnique({ where: { key: full.position }, select: { title: true, careerRequirements: true, minimumKpiScore: true, minimumMonths: true, nextPosition: { select: { key: true, title: true } } } });
      const tenure = await monthsInPosition(full.id, full.hireDate, now);
      const values: number[] = [];
      for (const { year, month } of lastMonths(now, 3)) {
        const evaluation = await evaluateEmployeeKpi(prisma, full, year, month);
        if (evaluation.achievement !== null) values.push(evaluation.achievement);
      }
      const kpi = values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
      const meetsKpi = !position?.minimumKpiScore || (kpi !== null && kpi >= position.minimumKpiScore);
      const meetsTenure = !position?.minimumMonths || tenure >= position.minimumMonths;
      career = {
        employeeId: full.id,
        name: fullName(full),
        position: { key: full.position, title: full.positionTitle ?? position?.title ?? EMPLOYEE_POSITION_LABELS[full.position] },
        next: position?.nextPosition ? { ...position.nextPosition, requirements: position.careerRequirements, minimumKpiScore: position.minimumKpiScore, minimumMonths: position.minimumMonths } : null,
        monthsInPosition: tenure,
        kpiAverage: kpi,
        meetsKpi,
        meetsTenure,
        eligible: Boolean(position?.nextPosition) && meetsKpi && meetsTenure,
        pendingPromotion: (await prisma.promotionRecommendation.count({ where: { employeeId: full.id, status: 'PENDING' } })) > 0,
      };
    }
    return { reviews: reviews.map(toReviewDto), awards: awards.map(toAwardDto), career };
  },

  async canApprove(actor: AuthUser): Promise<boolean> {
    return (await permissionsOf(actor)).has(PERMISSIONS.PERFORMANCE_APPROVE);
  },
};

/** Chorak boshlanganda (birinchi 7 kun) baholovchilarga "choraklik baholash vaqti" eslatmasi — chorakka bir marta */
export async function notifyReviewSeason(now: Date): Promise<number> {
  const [year, month, day] = businessDateString(now).split('-').map(Number) as [number, number, number];
  if (![1, 4, 7, 10].includes(month) || day > 7) return 0;
  const quarter = month === 1 ? 4 : (month - 1) / 3;
  const reviewYear = month === 1 ? year - 1 : year;
  const reviewers = await permissionHolders(PERMISSIONS.PERFORMANCE_MANAGE, null);
  if (reviewers.length === 0) return 0;
  await prisma.$transaction((tx) =>
    notificationService.createManyInTransaction(
      tx,
      reviewers.map((userId) => ({
        userId,
        type: 'HR_UPDATE' as const,
        title: 'Choraklik baholash vaqti',
        message: `${reviewYear}-yil ${quarter}-chorak bo‘yicha xodimlarni baholang (KPI va attestatsiya).`,
        actionUrl: '/performance',
        dedupeKey: `review-season:${reviewYear}-q${quarter}:${userId}`,
      })),
    ),
  );
  return reviewers.length;
}
