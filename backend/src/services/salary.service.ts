import { prisma } from '../config/database.js';
import { formatSalaryAmount, formatSalaryPeriod } from '../config/salaryLabels.js';
import { EMPLOYEE_POSITION_LABELS } from '../config/employeeLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import type {
  EmployeePosition,
  PaymentMethod,
  PayrollAdjustmentCategory,
  PayrollAdjustmentType,
  Prisma,
  SalaryPaymentKind,
  SalaryPeriodStatus,
  SalaryType,
} from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  AdjustSalaryInput,
  CalculateSalaryInput,
  CreateAdjustmentInput,
  PaySalaryInput,
  ReasonInput,
  SalaryHistoryQuery,
  SalaryPeriodListQuery,
} from '../validators/salary.validator.js';
import type { CreateSalaryRuleInput } from '../validators/teacher.validator.js';
import { auditService } from './audit.service.js';
import { COMMISSION_SALARY_TYPES, commissionService } from './commission.service.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { assertFinancialPeriodOpen } from './financialPeriod.service.js';

/** Maosh xarajati shu kategoriyaga yoziladi (seedda ham bor) */
const SALARY_EXPENSE_CATEGORY = 'TEACHER_SALARY';
/** Xodim (o‘qituvchi emas) maoshi xarajati */
const EMPLOYEE_SALARY_EXPENSE_CATEGORY = 'EMPLOYEE_SALARY';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface SalaryRuleDto {
  id: string;
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
  bonus: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

type PersonRefDto = { id: string; firstName: string; lastName: string };

export interface PayeeRefDto {
  type: 'TEACHER' | 'EMPLOYEE';
  /** teacherProfileId yoki employeeId */
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  subtitle: string | null;
}

export interface PayrollAdjustmentDto {
  id: string;
  type: PayrollAdjustmentType;
  category: PayrollAdjustmentCategory;
  amount: number;
  reason: string;
  /** "2026-09-15" */
  date: string;
  createdAt: string;
  createdBy: PersonRefDto | null;
  /** Kiritgan xodimda tasdiqlash ruxsati bo‘lsa darhol, aks holda maosh tasdiqlanganda */
  approvedBy: PersonRefDto | null;
  approvedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: PersonRefDto | null;
}

export interface SalaryPaymentDto {
  id: string;
  kind: SalaryPaymentKind;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string | null;
  account: { id: string; name: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface SalaryPeriodDto {
  id: string;
  year: number;
  month: number;
  /** "2026-yil sentabr" */
  label: string;
  /** To‘lov oluvchi — o‘qituvchi yoki xodim (subtitle: mutaxassislik yoki lavozim) */
  payee: PayeeRefDto;
  teacher: {
    profileId: string;
    userId: string;
    firstName: string;
    lastName: string;
    specialization: string | null;
  } | null;
  employee: { id: string; firstName: string; lastName: string; position: EmployeePosition } | null;
  salaryType: SalaryType;
  lessonsCount: number;
  studentsCount: number;
  groupRevenue: number;
  baseAmount: number;
  lessonAmount: number;
  studentAmount: number;
  percentageAmount: number;
  /** Hisoblashda qo‘llangan foiz */
  commissionRate: number;
  /** Maosh modelidagi bonus; bonus = modelBonus + faol bonus yozuvlari */
  modelBonus: number;
  bonus: number;
  penalty: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: SalaryPeriodStatus;
  note: string | null;
  calculatedAt: string | null;
  approvedAt: string | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  lockedAt: string | null;
  unlockedAt: string | null;
  unlockedBy: PersonRefDto | null;
  unlockReason: string | null;
  adjustments: PayrollAdjustmentDto[];
  payments: SalaryPaymentDto[];
}

export interface SalarySummaryDto {
  year: number;
  month: number;
  label: string;
  /** Hisoblangan davrlar soni */
  periods: number;
  awaitingApproval: number;
  accrued: number;
  paid: number;
  remaining: number;
  byStatus: Array<{ status: SalaryPeriodStatus; count: number; total: number }>;
}

export interface CalculateResultDto {
  year: number;
  month: number;
  calculated: number;
  /** Maosh modeli yo‘q yoki tasdiqlangani uchun o‘tkazib yuborilganlar */
  skipped: Array<{
    payeeType: 'TEACHER' | 'EMPLOYEE';
    teacherProfileId: string | null;
    employeeId: string | null;
    firstName: string;
    lastName: string;
    reason: string;
  }>;
  total: number;
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const periodSelect = {
  id: true,
  year: true,
  month: true,
  salaryType: true,
  lessonsCount: true,
  studentsCount: true,
  groupRevenue: true,
  baseAmount: true,
  lessonAmount: true,
  studentAmount: true,
  percentageAmount: true,
  commissionRate: true,
  modelBonus: true,
  bonus: true,
  penalty: true,
  totalAmount: true,
  paidAmount: true,
  remainingAmount: true,
  status: true,
  note: true,
  calculatedAt: true,
  approvedAt: true,
  lockedAt: true,
  unlockedAt: true,
  unlockReason: true,
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  unlockedBy: { select: { id: true, firstName: true, lastName: true } },
  employee: { select: { id: true, firstName: true, lastName: true, position: true, userId: true } },
  adjustments: {
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      type: true,
      category: true,
      amount: true,
      reason: true,
      date: true,
      createdAt: true,
      approvedAt: true,
      voidedAt: true,
      voidReason: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      voidedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  teacherProfile: {
    select: {
      id: true,
      specialization: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
    select: {
      id: true,
      kind: true,
      amount: true,
      method: true,
      paidAt: true,
      note: true,
      account: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.TeacherSalaryPeriodSelect;

type PeriodRecord = Prisma.TeacherSalaryPeriodGetPayload<{ select: typeof periodSelect }>;

function payeeOf(period: Pick<PeriodRecord, 'teacherProfile' | 'employee'>): PayeeRefDto {
  if (period.teacherProfile) {
    return {
      type: 'TEACHER',
      id: period.teacherProfile.id,
      userId: period.teacherProfile.user.id,
      firstName: period.teacherProfile.user.firstName,
      lastName: period.teacherProfile.user.lastName,
      subtitle: period.teacherProfile.specialization,
    };
  }
  if (period.employee) {
    return {
      type: 'EMPLOYEE',
      id: period.employee.id,
      userId: period.employee.userId,
      firstName: period.employee.firstName,
      lastName: period.employee.lastName,
      subtitle: EMPLOYEE_POSITION_LABELS[period.employee.position],
    };
  }
  throw new Error('Maosh davrida to‘lov oluvchi yo‘q');
}

function payeeName(period: Pick<PeriodRecord, 'teacherProfile' | 'employee'>): string {
  const payee = payeeOf(period);
  return `${payee.firstName} ${payee.lastName}`;
}

/** Bonus/jarima yoki hisoblash so‘ralgan to‘lov oluvchi */
async function resolvePayee(input: {
  teacherProfileId?: string | null;
  employeeId?: string | null;
}): Promise<{ type: 'TEACHER' | 'EMPLOYEE'; id: string; userId: string | null; name: string }> {
  if (input.teacherProfileId) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { id: input.teacherProfileId },
      select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!profile) {
      throw AppError.notFound('O‘qituvchi topilmadi');
    }
    return { type: 'TEACHER', id: profile.id, userId: profile.user.id, name: `${profile.user.firstName} ${profile.user.lastName}` };
  }
  const employee = input.employeeId
    ? await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, userId: true, firstName: true, lastName: true } })
    : null;
  if (!employee) {
    throw AppError.notFound('Xodim topilmadi');
  }
  return { type: 'EMPLOYEE', id: employee.id, userId: employee.userId, name: `${employee.firstName} ${employee.lastName}` };
}

const ruleSelect = {
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

type RuleRecord = Prisma.TeacherSalaryRuleGetPayload<{ select: typeof ruleSelect }>;

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toSalaryRuleDto(rule: RuleRecord): SalaryRuleDto {
  return {
    id: rule.id,
    type: rule.type,
    baseSalary: rule.baseSalary.toNumber(),
    perLessonRate: rule.perLessonRate.toNumber(),
    perStudentRate: rule.perStudentRate.toNumber(),
    percentage: rule.percentage.toNumber(),
    bonus: rule.bonus.toNumber(),
    effectiveFrom: toDateOnly(rule.effectiveFrom),
    effectiveTo: rule.effectiveTo ? toDateOnly(rule.effectiveTo) : null,
    isActive: rule.isActive,
    note: rule.note,
    createdAt: rule.createdAt.toISOString(),
    createdBy: rule.createdBy,
  };
}

export function toSalaryPeriodDto(period: PeriodRecord): SalaryPeriodDto {
  return {
    id: period.id,
    year: period.year,
    month: period.month,
    label: formatSalaryPeriod(period.year, period.month),
    payee: payeeOf(period),
    teacher: period.teacherProfile
      ? {
          profileId: period.teacherProfile.id,
          userId: period.teacherProfile.user.id,
          firstName: period.teacherProfile.user.firstName,
          lastName: period.teacherProfile.user.lastName,
          specialization: period.teacherProfile.specialization,
        }
      : null,
    employee: period.employee
      ? { id: period.employee.id, firstName: period.employee.firstName, lastName: period.employee.lastName, position: period.employee.position }
      : null,
    salaryType: period.salaryType,
    lessonsCount: period.lessonsCount,
    studentsCount: period.studentsCount,
    groupRevenue: period.groupRevenue.toNumber(),
    baseAmount: period.baseAmount.toNumber(),
    lessonAmount: period.lessonAmount.toNumber(),
    studentAmount: period.studentAmount.toNumber(),
    percentageAmount: period.percentageAmount.toNumber(),
    commissionRate: period.commissionRate.toNumber(),
    modelBonus: period.modelBonus.toNumber(),
    bonus: period.bonus.toNumber(),
    penalty: period.penalty.toNumber(),
    totalAmount: period.totalAmount.toNumber(),
    paidAmount: period.paidAmount.toNumber(),
    remainingAmount: period.remainingAmount.toNumber(),
    status: period.status,
    note: period.note,
    calculatedAt: period.calculatedAt?.toISOString() ?? null,
    approvedAt: period.approvedAt?.toISOString() ?? null,
    approvedBy: period.approvedBy,
    lockedAt: period.lockedAt?.toISOString() ?? null,
    unlockedAt: period.unlockedAt?.toISOString() ?? null,
    unlockedBy: period.unlockedBy,
    unlockReason: period.unlockReason,
    adjustments: period.adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      category: adjustment.category,
      amount: adjustment.amount.toNumber(),
      reason: adjustment.reason,
      date: toDateOnly(adjustment.date),
      createdAt: adjustment.createdAt.toISOString(),
      createdBy: adjustment.createdBy,
      approvedBy: adjustment.approvedBy,
      approvedAt: adjustment.approvedAt?.toISOString() ?? null,
      voidedAt: adjustment.voidedAt?.toISOString() ?? null,
      voidReason: adjustment.voidReason,
      voidedBy: adjustment.voidedBy,
    })),
    payments: period.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toNumber(),
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      note: payment.note,
      kind: payment.kind,
      account: payment.account,
      createdBy: payment.createdBy,
    })),
  };
}

/** (2026, 9) → [2026-09-01, 2026-10-01) — UTC, @db.Date bilan mos */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/** Oyga tegishli maosh modeli: shu oyda kuchda bo‘lgan eng oxirgi qoida */
async function findRuleForMonth(
  tx: Prisma.TransactionClient,
  teacherProfileId: string,
  year: number,
  month: number,
): Promise<RuleRecord | null> {
  const { start, end } = monthRange(year, month);
  return tx.teacherSalaryRule.findFirst({
    where: {
      teacherProfileId,
      effectiveFrom: { lt: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    select: ruleSelect,
  });
}

export interface WorkloadDto {
  lessonsCount: number;
  studentsCount: number;
  groupRevenue: number;
  /** Oy foiz yozuvlari yig‘indisi (teskari yozuvlar bilan). Berilmasa — tushum × foiz */
  commissionAmount?: number;
}

/**
 * O‘qituvchining oylik yuklamasi:
 * - o‘tkazilgan darslar (HELD seanslar — seansda o‘qituvchi ko‘rsatilmagan bo‘lsa guruh o‘qituvchisi hisobga olinadi)
 * - guruhlaridagi faol o‘quvchilar soni
 * - guruhlari o‘quvchilaridan shu oyda tushgan to‘lovlar (ulush uchun)
 */
export async function loadWorkload(
  tx: Prisma.TransactionClient,
  teacherUserId: string,
  year: number,
  month: number,
): Promise<WorkloadDto> {
  const { start, end } = monthRange(year, month);

  const lessonsCount = await tx.attendanceSession.count({
    where: {
      status: 'HELD',
      date: { gte: start, lt: end },
      OR: [{ teacherId: teacherUserId }, { teacherId: null, group: { teacherId: teacherUserId } }],
    },
  });

  const studentsCount = await tx.student.count({
    where: { deletedAt: null, status: 'ACTIVE', group: { teacherId: teacherUserId } },
  });

  // Tushum to'lov paytida yozilgan o'qituvchi bo'yicha (o'quvchining hozirgi guruhi emas)
  const paymentRange = businessMonthRange(year, month);
  const revenue = await tx.payment.aggregate({
    where: { deletedAt: null, teacherId: teacherUserId, paidAt: { gte: paymentRange.start, lt: paymentRange.end } },
    _sum: { amount: true },
  });

  return { lessonsCount, studentsCount, groupRevenue: revenue._sum.amount?.toNumber() ?? 0 };
}

export interface SalaryParts {
  baseAmount: number;
  lessonAmount: number;
  studentAmount: number;
  percentageAmount: number;
}

/** Maosh modelining stavkalari (Decimal'dan sonlarga o‘girilgan holda) */
export interface SalaryRates {
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
}

export function toSalaryRates(rule: {
  type: SalaryType;
  baseSalary: Prisma.Decimal;
  perLessonRate: Prisma.Decimal;
  perStudentRate: Prisma.Decimal;
  percentage: Prisma.Decimal;
}): SalaryRates {
  return {
    type: rule.type,
    baseSalary: rule.baseSalary.toNumber(),
    perLessonRate: rule.perLessonRate.toNumber(),
    perStudentRate: rule.perStudentRate.toNumber(),
    percentage: rule.percentage.toNumber(),
  };
}

/**
 * Maosh tarkibi modelga qarab hisoblanadi. MIXED — barcha tarkibiy qismlar birga,
 * qolgan modellarda faqat o‘ziga tegishli qism. Summalar butun so‘mga yaxlitlanadi.
 */
export function computeSalaryParts(rates: SalaryRates, workload: WorkloadDto): SalaryParts {
  const mixed = rates.type === 'MIXED';
  const round = (value: number) => Math.round(value);

  return {
    baseAmount: mixed || rates.type === 'FIXED' ? round(rates.baseSalary) : 0,
    lessonAmount: mixed || rates.type === 'PER_LESSON' ? round(rates.perLessonRate * workload.lessonsCount) : 0,
    studentAmount: mixed || rates.type === 'PER_STUDENT' ? round(rates.perStudentRate * workload.studentsCount) : 0,
    percentageAmount:
      workload.commissionAmount ?? (mixed || rates.type === 'PERCENTAGE' ? round((workload.groupRevenue * rates.percentage) / 100) : 0),
  };
}

function statusAfterPayment(total: number, paid: number): SalaryPeriodStatus {
  if (paid <= 0) return 'APPROVED';
  return paid >= total ? 'PAID' : 'PARTIALLY_PAID';
}

async function sumAdjustments(tx: Prisma.TransactionClient, salaryPeriodId: string): Promise<{ bonus: number; penalty: number }> {
  const rows = await tx.payrollAdjustment.groupBy({
    by: ['type'],
    where: { salaryPeriodId, voidedAt: null },
    _sum: { amount: true },
  });
  const sum = (type: PayrollAdjustmentType) => rows.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
  return { bonus: sum('BONUS'), penalty: sum('PENALTY') };
}

/** Bonus/jarima o‘zgarganda (tasdiqlanmagan davr) jami va qoldiq qayta yig‘iladi */
async function recomputeTotals(tx: Prisma.TransactionClient, salaryPeriodId: string): Promise<number> {
  const period = await tx.teacherSalaryPeriod.findUniqueOrThrow({
    where: { id: salaryPeriodId },
    select: {
      baseAmount: true,
      lessonAmount: true,
      studentAmount: true,
      percentageAmount: true,
      modelBonus: true,
      paidAmount: true,
    },
  });
  const adjustments = await sumAdjustments(tx, salaryPeriodId);
  const bonus = period.modelBonus.toNumber() + adjustments.bonus;
  const totalAmount = Math.max(
    period.baseAmount.toNumber() +
      period.lessonAmount.toNumber() +
      period.studentAmount.toNumber() +
      period.percentageAmount.toNumber() +
      bonus -
      adjustments.penalty,
    0,
  );
  await tx.teacherSalaryPeriod.update({
    where: { id: salaryPeriodId },
    data: {
      bonus,
      penalty: adjustments.penalty,
      totalAmount,
      remainingAmount: Math.max(totalAmount - period.paidAmount.toNumber(), 0),
    },
  });
  return totalAmount;
}

async function findPeriodOrFail(id: string): Promise<PeriodRecord> {
  const period = await prisma.teacherSalaryPeriod.findUnique({ where: { id }, select: periodSelect });
  if (!period) {
    throw AppError.notFound('Maosh davri topilmadi');
  }
  return period;
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const salaryService = {
  /** O‘qituvchining maosh modellari tarixi (yangisi birinchi) */
  async rules(teacherProfileId: string): Promise<SalaryRuleDto[]> {
    const rules = await prisma.teacherSalaryRule.findMany({
      where: { teacherProfileId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: ruleSelect,
    });
    return rules.map(toSalaryRuleDto);
  },

  /**
   * Yangi maosh modeli. Oldingi faol model o‘chirilmaydi — uning `effectiveTo`
   * yangi model boshlanishidan bir kun oldingi sanaga yopiladi (tarix saqlanadi).
   */
  async createRule(
    actor: AuthUser,
    teacherProfileId: string,
    input: CreateSalaryRuleInput,
    client: ClientInfo,
  ): Promise<SalaryRuleDto> {
    const profile = await prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!profile) {
      throw AppError.notFound('O‘qituvchi topilmadi');
    }

    const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
    const previousDay = new Date(effectiveFrom.getTime() - 86_400_000);

    const ruleId = await prisma.$transaction(async (tx) => {
      const active = await tx.teacherSalaryRule.findMany({
        where: { teacherProfileId, isActive: true },
        select: { id: true, effectiveFrom: true },
      });
      for (const rule of active) {
        if (rule.effectiveFrom >= effectiveFrom) {
          // Yangi model eskisidan oldin boshlansa — eskisi butunlay o‘rnini bo‘shatadi
          await tx.teacherSalaryRule.update({ where: { id: rule.id }, data: { isActive: false } });
        } else {
          await tx.teacherSalaryRule.update({
            where: { id: rule.id },
            data: { isActive: false, effectiveTo: previousDay },
          });
        }
      }

      const created = await tx.teacherSalaryRule.create({
        data: {
          teacherProfileId,
          type: input.type,
          baseSalary: input.baseSalary,
          perLessonRate: input.perLessonRate,
          perStudentRate: input.perStudentRate,
          percentage: input.percentage,
          bonus: input.bonus,
          effectiveFrom,
          note: input.note ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.rule_created',
        entityType: 'teacher',
        entityId: teacherProfileId,
        metadata: {
          payee: `${profile.user.firstName} ${profile.user.lastName}`,
          type: input.type,
          baseSalary: input.baseSalary,
          perLessonRate: input.perLessonRate,
          perStudentRate: input.perStudentRate,
          percentage: input.percentage,
          bonus: input.bonus,
          effectiveFrom: input.effectiveFrom,
        },
        ...client,
      });

      return created.id;
    });

    const rule = await prisma.teacherSalaryRule.findUniqueOrThrow({ where: { id: ruleId }, select: ruleSelect });
    return toSalaryRuleDto(rule);
  },

  /** Oy bo‘yicha maosh davrlari */
  async periods(query: SalaryPeriodListQuery): Promise<SalaryPeriodDto[]> {
    const periods = await prisma.teacherSalaryPeriod.findMany({
      where: {
        year: query.year,
        month: query.month,
        ...(query.payeeType === 'TEACHER' ? { teacherProfileId: { not: null } } : {}),
        ...(query.payeeType === 'EMPLOYEE' ? { employeeId: { not: null } } : {}),
        ...(query.teacherProfileId ? { teacherProfileId: query.teacherProfileId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ totalAmount: 'desc' }, { createdAt: 'asc' }],
      select: periodSelect,
    });
    return periods.map(toSalaryPeriodDto);
  },

  async periodById(id: string): Promise<SalaryPeriodDto> {
    return toSalaryPeriodDto(await findPeriodOrFail(id));
  },

  /** Bitta o‘qituvchining oxirgi oylari (maosh tarixi) */
  async history(teacherProfileId: string, query: SalaryHistoryQuery): Promise<SalaryPeriodDto[]> {
    const periods = await prisma.teacherSalaryPeriod.findMany({
      where: { teacherProfileId, ...(query.year ? { year: query.year } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: query.limit,
      select: periodSelect,
    });
    return periods.map(toSalaryPeriodDto);
  },

  /** Oylik yig‘ma ko‘rsatkichlar */
  async summary(query: SalaryPeriodListQuery): Promise<SalarySummaryDto> {
    const grouped = await prisma.teacherSalaryPeriod.groupBy({
      by: ['status'],
      where: {
        year: query.year,
        month: query.month,
        ...(query.payeeType === 'TEACHER' ? { teacherProfileId: { not: null } } : {}),
        ...(query.payeeType === 'EMPLOYEE' ? { employeeId: { not: null } } : {}),
      },
      _count: { _all: true },
      _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
    });

    const byStatus = grouped.map((row) => ({
      status: row.status,
      count: row._count._all,
      total: row._sum.totalAmount?.toNumber() ?? 0,
    }));

    return {
      year: query.year,
      month: query.month,
      label: formatSalaryPeriod(query.year, query.month),
      periods: grouped.reduce((sum, row) => sum + row._count._all, 0),
      awaitingApproval: grouped
        .filter((row) => row.status === 'PENDING' || row.status === 'CALCULATED')
        .reduce((sum, row) => sum + row._count._all, 0),
      accrued: grouped.reduce((sum, row) => sum + (row._sum.totalAmount?.toNumber() ?? 0), 0),
      paid: grouped.reduce((sum, row) => sum + (row._sum.paidAmount?.toNumber() ?? 0), 0),
      remaining: grouped.reduce((sum, row) => sum + (row._sum.remainingAmount?.toNumber() ?? 0), 0),
      byStatus,
    };
  },

  /**
   * Maoshni hisoblaydi (bitta o‘qituvchi yoki barcha faol o‘qituvchilar uchun).
   * Qo‘lda kiritilgan (adjust) bonus va jarima qayta hisoblashda saqlanadi, qo‘l tegmagan
   * bo‘lsa model bonusi qo‘llanadi; tasdiqlangan (locked) davr qayta hisoblanmaydi.
   */
  async calculate(actor: AuthUser, input: CalculateSalaryInput, client: ClientInfo): Promise<CalculateResultDto> {
    const { start: monthStart, end: monthEnd } = monthRange(input.year, input.month);
    const profiles = input.employeeId
      ? []
      : await prisma.teacherProfile.findMany({
          where: input.teacherProfileId ? { id: input.teacherProfileId } : { isActive: true },
          select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        });
    // Xodimlar: oyda kamida bir kun ishlaganlar (ishdan ketgan bo'lsa ham, shu oyda ketgan bo'lsa)
    const employees = input.teacherProfileId
      ? []
      : await prisma.employee.findMany({
          where: input.employeeId
            ? { id: input.employeeId }
            : { hireDate: { lt: monthEnd }, OR: [{ terminationDate: null }, { terminationDate: { gte: monthStart } }] },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            position: true,
            baseSalary: true,
            status: true,
            hireDate: true,
            terminationDate: true,
          },
          orderBy: { createdAt: 'asc' },
        });
    if (input.teacherProfileId && profiles.length === 0) {
      throw AppError.notFound('O‘qituvchi topilmadi');
    }
    if (input.employeeId && employees.length === 0) {
      throw AppError.notFound('Xodim topilmadi');
    }
    if (profiles.length === 0 && employees.length === 0) {
      throw AppError.unprocessable('Faol o‘qituvchi yoki xodim topilmadi');
    }

    const skipped: CalculateResultDto['skipped'] = [];
    let calculated = 0;
    let total = 0;

    for (const profile of profiles) {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.teacherSalaryPeriod.findUnique({
          where: { teacherProfileId_year_month: { teacherProfileId: profile.id, year: input.year, month: input.month } },
          select: { id: true, lockedAt: true, paidAmount: true },
        });
        if (existing?.lockedAt) {
          return { ok: false, reason: 'Maosh tasdiqlangan — qayta hisoblanmaydi' } as const;
        }

        const rule = await findRuleForMonth(tx, profile.id, input.year, input.month);
        if (!rule) {
          return { ok: false, reason: 'Maosh modeli belgilanmagan' } as const;
        }

        // Foiz real to'lov yozuvlaridan: yozuvi yo'q to'lovlar qo'shiladi, stavka joriy modelga moslanadi
        const commission = await commissionService.syncMonth(tx, profile, input, actor.id);
        const workload = {
          ...(await loadWorkload(tx, profile.userId, input.year, input.month)),
          commissionAmount: commission.commission,
        };
        const parts = computeSalaryParts(toSalaryRates(rule), workload);
        // Bonus = model bonusi + faol bonus yozuvlari, jarima = faol jarima yozuvlari (qayta hisoblashda saqlanadi)
        const modelBonus = rule.bonus.toNumber();
        const adjustments = existing ? await sumAdjustments(tx, existing.id) : { bonus: 0, penalty: 0 };
        const bonus = modelBonus + adjustments.bonus;
        const penalty = adjustments.penalty;
        const totalAmount = Math.max(
          parts.baseAmount + parts.lessonAmount + parts.studentAmount + parts.percentageAmount + bonus - penalty,
          0,
        );
        const paidAmount = existing?.paidAmount.toNumber() ?? 0;
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);

        const calculatedAt = new Date();
        const data = {
          salaryType: rule.type,
          lessonsCount: workload.lessonsCount,
          studentsCount: workload.studentsCount,
          groupRevenue: workload.groupRevenue,
          baseAmount: parts.baseAmount,
          lessonAmount: parts.lessonAmount,
          studentAmount: parts.studentAmount,
          percentageAmount: parts.percentageAmount,
          commissionRate: COMMISSION_SALARY_TYPES.includes(rule.type) ? rule.percentage.toNumber() : 0,
          modelBonus,
          bonus,
          penalty,
          totalAmount,
          paidAmount,
          remainingAmount,
          // Avans berilgan bo'lsa ham tasdiqlanmaguncha holat CALCULATED
          status: 'CALCULATED' as const,
          calculatedAt,
        };

        const period = existing
          ? await tx.teacherSalaryPeriod.update({ where: { id: existing.id }, data, select: { id: true } })
          : await tx.teacherSalaryPeriod.create({
              data: { teacherProfileId: profile.id, year: input.year, month: input.month, ...data },
              select: { id: true },
            });
        await commissionService.linkToPeriod(tx, profile.userId, input, period.id);

        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'salary.calculated',
          entityType: 'salary',
          entityId: period.id,
          metadata: {
            teacher: `${profile.user.firstName} ${profile.user.lastName}`,
            period: formatSalaryPeriod(input.year, input.month),
            salaryType: rule.type,
            lessonsCount: workload.lessonsCount,
            studentsCount: workload.studentsCount,
            groupRevenue: workload.groupRevenue,
            totalAmount,
          },
          ...client,
        });

        return { ok: true, totalAmount } as const;
      });

      if (!result.ok) {
        skipped.push({
          payeeType: 'TEACHER',
          employeeId: null,
          teacherProfileId: profile.id,
          firstName: profile.user.firstName,
          lastName: profile.user.lastName,
          reason: result.reason,
        });
      } else {
        calculated += 1;
        total += result.totalAmount;
      }
    }

    const DAY_MS = 86_400_000;
    for (const employee of employees) {
      const name = `${employee.firstName} ${employee.lastName}`;
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.teacherSalaryPeriod.findUnique({
          where: { employeeId_year_month: { employeeId: employee.id, year: input.year, month: input.month } },
          select: { id: true, lockedAt: true, paidAmount: true },
        });
        if (existing?.lockedAt) {
          return { ok: false, reason: 'Maosh tasdiqlangan — qayta hisoblanmaydi' } as const;
        }
        if (employee.status === 'SUSPENDED') {
          return { ok: false, reason: 'Faoliyati to‘xtatilgan' } as const;
        }
        const baseSalary = employee.baseSalary.toNumber();
        if (baseSalary <= 0) {
          return { ok: false, reason: 'Maosh belgilanmagan' } as const;
        }
        if (employee.hireDate >= monthEnd || (employee.terminationDate && employee.terminationDate < monthStart)) {
          return { ok: false, reason: 'Bu oyda ishlamagan' } as const;
        }

        // Oy o'rtasida ishga kirgan yoki ketgan bo'lsa — ishlagan kunlarga proporsional
        const activeFrom = Math.max(employee.hireDate.getTime(), monthStart.getTime());
        const activeTo = Math.min(
          employee.terminationDate ? employee.terminationDate.getTime() + DAY_MS : monthEnd.getTime(),
          monthEnd.getTime(),
        );
        const monthDays = Math.round((monthEnd.getTime() - monthStart.getTime()) / DAY_MS);
        const activeDays = Math.max(Math.round((activeTo - activeFrom) / DAY_MS), 0);
        const baseAmount = Math.round((baseSalary * activeDays) / monthDays);
        const adjustments = existing ? await sumAdjustments(tx, existing.id) : { bonus: 0, penalty: 0 };
        const totalAmount = Math.max(baseAmount + adjustments.bonus - adjustments.penalty, 0);
        const paidAmount = existing?.paidAmount.toNumber() ?? 0;

        const data = {
          salaryType: 'FIXED' as const,
          lessonsCount: 0,
          studentsCount: 0,
          groupRevenue: 0,
          baseAmount,
          lessonAmount: 0,
          studentAmount: 0,
          percentageAmount: 0,
          commissionRate: 0,
          modelBonus: 0,
          bonus: adjustments.bonus,
          penalty: adjustments.penalty,
          totalAmount,
          paidAmount,
          remainingAmount: Math.max(totalAmount - paidAmount, 0),
          status: 'CALCULATED' as const,
          calculatedAt: new Date(),
        };
        const period = existing
          ? await tx.teacherSalaryPeriod.update({ where: { id: existing.id }, data, select: { id: true } })
          : await tx.teacherSalaryPeriod.create({
              data: { employeeId: employee.id, year: input.year, month: input.month, ...data },
              select: { id: true },
            });

        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'salary.calculated',
          entityType: 'salary',
          entityId: period.id,
          metadata: {
            payee: name,
            position: employee.position,
            period: formatSalaryPeriod(input.year, input.month),
            activeDays,
            monthDays,
            baseAmount,
            totalAmount,
          },
          ...client,
        });
        return { ok: true, totalAmount } as const;
      });

      if (!result.ok) {
        skipped.push({
          payeeType: 'EMPLOYEE',
          teacherProfileId: null,
          employeeId: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          reason: result.reason,
        });
      } else {
        calculated += 1;
        total += result.totalAmount;
      }
    }

    return { year: input.year, month: input.month, calculated, skipped, total };
  },

  /** Maosh izohi — faqat tasdiqlashdan oldin. Bonus va jarima alohida yozuv (addAdjustment) */
  async adjust(actor: AuthUser, id: string, input: AdjustSalaryInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const period = await findPeriodOrFail(id);
    if (period.lockedAt) {
      throw AppError.conflict('Maosh tasdiqlangan — o‘zgartirilmaydi');
    }

    await prisma.$transaction(async (tx) => {
      await tx.teacherSalaryPeriod.update({ where: { id }, data: { note: input.note || null } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.note_updated',
        entityType: 'salary',
        entityId: id,
        metadata: {
          payee: payeeName(period),
          period: formatSalaryPeriod(period.year, period.month),
          before: period.note,
          after: input.note || null,
        },
        ...client,
      });
    });

    return this.periodById(id);
  },

  /**
   * Bonus yoki jarima yozuvi (tasdiqlanmagan oyga). Oy uchun davr hali bo‘lmasa — ochiladi,
   * hisoblashda summalar saqlanadi. Kiritgan xodimda tasdiqlash ruxsati bo‘lsa, yozuv darhol tasdiqlanadi.
   */
  async addAdjustment(actor: AuthUser, input: CreateAdjustmentInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const payee = await resolvePayee(input);
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const canApprove = permissions.has(PERMISSIONS.SALARY_APPROVE);
    const label = formatSalaryPeriod(input.year, input.month);

    const periodId = await prisma.$transaction(async (tx) => {
      let period = await tx.teacherSalaryPeriod.findUnique({
        where:
          payee.type === 'TEACHER'
            ? { teacherProfileId_year_month: { teacherProfileId: payee.id, year: input.year, month: input.month } }
            : { employeeId_year_month: { employeeId: payee.id, year: input.year, month: input.month } },
        select: { id: true, lockedAt: true },
      });
      if (period?.lockedAt) {
        throw AppError.conflict('Maosh tasdiqlangan — bonus va jarima qo‘shilmaydi');
      }
      if (!period && payee.type === 'TEACHER') {
        const rule = await findRuleForMonth(tx, payee.id, input.year, input.month);
        if (!rule) {
          throw AppError.unprocessable('Avval o‘qituvchiga maosh modelini belgilang');
        }
        period = await tx.teacherSalaryPeriod.create({
          data: { teacherProfileId: payee.id, year: input.year, month: input.month, salaryType: rule.type },
          select: { id: true, lockedAt: true },
        });
      } else if (!period) {
        period = await tx.teacherSalaryPeriod.create({
          data: { employeeId: payee.id, year: input.year, month: input.month, salaryType: 'FIXED' },
          select: { id: true, lockedAt: true },
        });
      }

      const now = new Date();
      const adjustment = await tx.payrollAdjustment.create({
        data: {
          salaryPeriodId: period.id,
          type: input.type,
          category: input.category,
          amount: input.amount,
          reason: input.reason,
          date: input.date,
          createdById: actor.id,
          approvedById: canApprove ? actor.id : null,
          approvedAt: canApprove ? now : null,
        },
        select: { id: true },
      });
      const totalAmount = await recomputeTotals(tx, period.id);

      if (payee.userId) await notificationService.createInTransaction(tx, {
        userId: payee.userId,
        type: 'SYSTEM',
        title: input.type === 'BONUS' ? 'Bonus qo‘shildi' : 'Jarima qo‘shildi',
        message: `${label}: ${formatSalaryAmount(input.amount)} — ${input.reason}`,
        entityType: 'salary',
        entityId: period.id,
        dedupeKey: `salary:adjustment:${adjustment.id}`,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.adjustment_added',
        entityType: 'salary',
        entityId: period.id,
        metadata: {
          payee: payee.name,
          period: label,
          type: input.type,
          category: input.category,
          amount: input.amount,
          reason: input.reason,
          date: toDateOnly(input.date),
          approved: canApprove,
          totalAmount,
        },
        ...client,
      });

      return period.id;
    });

    return this.periodById(periodId);
  },

  /** Bonus/jarimani bekor qilish — yozuv o‘chirilmaydi, sabab saqlanadi */
  async voidAdjustment(actor: AuthUser, id: string, input: ReasonInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const adjustment = await prisma.payrollAdjustment.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        amount: true,
        reason: true,
        voidedAt: true,
        salaryPeriodId: true,
        salaryPeriod: {
          select: {
            lockedAt: true,
            year: true,
            month: true,
            teacherProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!adjustment) {
      throw AppError.notFound('Bonus yoki jarima yozuvi topilmadi');
    }
    if (adjustment.voidedAt) {
      throw AppError.conflict('Bu yozuv allaqachon bekor qilingan');
    }
    if (adjustment.salaryPeriod.lockedAt) {
      throw AppError.conflict('Maosh tasdiqlangan — yozuvni bekor qilib bo‘lmaydi');
    }

    await prisma.$transaction(async (tx) => {
      await tx.payrollAdjustment.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById: actor.id, voidReason: input.reason },
      });
      const totalAmount = await recomputeTotals(tx, adjustment.salaryPeriodId);
      const teacher = adjustment.salaryPeriod.teacherProfile?.user ?? adjustment.salaryPeriod.employee!;
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.adjustment_voided',
        entityType: 'salary',
        entityId: adjustment.salaryPeriodId,
        metadata: {
          payee: `${teacher.firstName} ${teacher.lastName}`,
          period: formatSalaryPeriod(adjustment.salaryPeriod.year, adjustment.salaryPeriod.month),
          type: adjustment.type,
          amount: adjustment.amount.toNumber(),
          originalReason: adjustment.reason,
          reason: input.reason,
          totalAmount,
        },
        ...client,
      });
    });

    return this.periodById(adjustment.salaryPeriodId);
  },

  /**
   * Tasdiqlangan maoshni qayta ochish (salary.unlock). Maosh to‘lovi qilingan davr ochilmaydi —
   * tuzatish keyingi oyda bonus/jarima orqali kiritiladi. Sabab auditda saqlanadi.
   */
  async unlock(actor: AuthUser, id: string, input: ReasonInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const period = await findPeriodOrFail(id);
    if (!period.lockedAt) {
      throw AppError.conflict('Maosh tasdiqlanmagan — qayta ochish shart emas');
    }
    if (period.payments.some((payment) => payment.kind === 'SALARY')) {
      throw AppError.conflict('Maosh to‘lovi qilingan — qayta ochib bo‘lmaydi. Tuzatishni keyingi oyda bonus yoki jarima orqali kiriting');
    }

    const now = new Date();
    const label = formatSalaryPeriod(period.year, period.month);
    await prisma.$transaction(async (tx) => {
      await tx.teacherSalaryPeriod.update({
        where: { id },
        data: {
          status: 'CALCULATED',
          lockedAt: null,
          approvedAt: null,
          approvedById: null,
          unlockedAt: now,
          unlockedById: actor.id,
          unlockReason: input.reason,
        },
      });

      const payeeUserId = payeeOf(period).userId;
      if (payeeUserId) await notificationService.createInTransaction(tx, {
        userId: payeeUserId,
        type: 'SYSTEM',
        title: 'Maosh qayta ochildi',
        message: `${label} maoshi qayta ko‘rib chiqish uchun ochildi: ${input.reason}`,
        entityType: 'salary',
        entityId: id,
        dedupeKey: `salary:${id}:unlocked:${now.getTime()}`,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.unlocked',
        entityType: 'salary',
        entityId: id,
        metadata: {
          payee: payeeName(period),
          period: label,
          reason: input.reason,
          totalAmount: period.totalAmount.toNumber(),
          approvedAt: period.approvedAt?.toISOString() ?? null,
        },
        ...client,
      });
    });

    return this.periodById(id);
  },

  /** Tasdiqlash — shundan keyin hisob o‘zgarmaydi (lockedAt) va to‘lash mumkin bo‘ladi */
  async approve(actor: AuthUser, id: string, client: ClientInfo): Promise<SalaryPeriodDto> {
    const period = await findPeriodOrFail(id);
    if (period.lockedAt) {
      throw AppError.conflict('Bu maosh allaqachon tasdiqlangan');
    }
    if (period.status !== 'CALCULATED') {
      throw AppError.unprocessable('Avval maoshni hisoblang');
    }

    const teacherId = period.teacherProfile?.user.id ?? null;
    const percentageAmount = period.percentageAmount.toNumber();
    // Hisoblangandan keyin to'lov kelgan yoki bekor qilingan bo'lsa — eski raqam qotirilmasin
    if (teacherId && (await commissionService.monthTotal(prisma, teacherId, period)) !== percentageAmount) {
      throw AppError.conflict('Hisoblangandan keyin to‘lovlar o‘zgargan — maoshni qayta hisoblang');
    }

    const rawTotal =
      period.baseAmount.toNumber() +
      period.lessonAmount.toNumber() +
      period.studentAmount.toNumber() +
      percentageAmount +
      period.bonus.toNumber() -
      period.penalty.toNumber();
    // Qaytarilgan to'lovlar foizi maoshdan katta — manfiy qoldiq keyingi oyga ko'chiriladi
    const carry = rawTotal < 0 && percentageAmount < 0 ? Math.min(-rawTotal, -percentageAmount) : 0;
    if (period.totalAmount.toNumber() <= 0 && carry === 0) {
      throw AppError.unprocessable('Maosh summasi nol — tasdiqlash mumkin emas');
    }
    const finalTotal = Math.max(rawTotal + carry, 0);
    const paidAmount = period.paidAmount.toNumber();
    // Berilgan avans yakuniy maoshdan oshmasligi kerak
    if (paidAmount > finalTotal) {
      throw AppError.unprocessable(
        `Berilgan avans (${formatSalaryAmount(paidAmount)}) maoshdan (${formatSalaryAmount(finalTotal)}) katta — jarimani qayta ko‘rib chiqing`,
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (teacherId) await commissionService.linkToPeriod(tx, teacherId, period, id);
      // Tasdiqlanmagan bonus/jarima yozuvlari maosh bilan birga tasdiqlanadi
      await tx.payrollAdjustment.updateMany({
        where: { salaryPeriodId: id, voidedAt: null, approvedById: null },
        data: { approvedById: actor.id, approvedAt: now },
      });
      if (carry > 0 && teacherId && period.teacherProfile) {
        await commissionService.carryOver(tx, {
          period: {
            id,
            teacherProfileId: period.teacherProfile.id,
            year: period.year,
            month: period.month,
            label: formatSalaryPeriod(period.year, period.month),
          },
          teacherId,
          amount: carry,
          actorId: actor.id,
          client,
        });
      }

      await tx.teacherSalaryPeriod.update({
        where: { id },
        data: {
          // Avans berilgan bo'lsa — darhol qisman to'langan
          status: paidAmount > 0 ? statusAfterPayment(finalTotal, paidAmount) : 'APPROVED',
          approvedAt: now,
          approvedById: actor.id,
          lockedAt: now,
          totalAmount: finalTotal,
          remainingAmount: Math.max(finalTotal - paidAmount, 0),
          ...(carry > 0 ? { percentageAmount: percentageAmount + carry } : {}),
        },
      });

      const payeeUserId = payeeOf(period).userId;
      if (payeeUserId) await notificationService.createInTransaction(tx, {
        userId: payeeUserId,
        type: 'SYSTEM',
        title: 'Maosh tasdiqlandi',
        message: `${formatSalaryPeriod(period.year, period.month)} maoshi tasdiqlandi: ${formatSalaryAmount(finalTotal)}.`,
        entityType: 'salary',
        entityId: id,
        dedupeKey: `salary:${id}:approved`,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.approved',
        entityType: 'salary',
        entityId: id,
        metadata: {
          payee: payeeName(period),
          period: formatSalaryPeriod(period.year, period.month),
          totalAmount: finalTotal,
          ...(carry > 0 ? { carriedOver: carry } : {}),
        },
        ...client,
      });
    });

    return this.periodById(id);
  },

  /**
   * Maoshni to‘lash. Tasdiqlangandan keyin qismlab to‘lash mumkin.
   * Har bir to‘lov moliyaviy daftarga (Transaction) va xarajatga (Expense) yoziladi,
   * tanlangan hisob qoldig‘i kamayadi.
   */
  async pay(actor: AuthUser, id: string, input: PaySalaryInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const period = await findPeriodOrFail(id);
    const remaining = period.remainingAmount.toNumber();
    const isAdvance = input.kind === 'ADVANCE';
    if (period.status === 'PAID' || (period.lockedAt && remaining <= 0)) {
      throw AppError.conflict('Bu maosh to‘liq to‘langan');
    }
    if (isAdvance) {
      if (period.lockedAt || period.status !== 'CALCULATED') {
        throw AppError.unprocessable('Avans faqat hisoblangan va hali tasdiqlanmagan maoshdan beriladi');
      }
    } else if (period.status !== 'APPROVED' && period.status !== 'PARTIALLY_PAID') {
      throw AppError.unprocessable('Maosh tasdiqlanmagan — to‘lov qabul qilinmaydi (avans sifatida berish mumkin)');
    }
    if (input.amount > remaining) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'amount', message: `Qolgan summa ${formatSalaryAmount(remaining)} — undan ko‘p to‘lanmaydi` },
      ]);
    }

    if (input.accountId) {
      const account = await prisma.financialAccount.findFirst({
        where: { id: input.accountId, isActive: true },
        select: { id: true },
      });
      if (!account) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'accountId', message: 'Hisob topilmadi' },
        ]);
      }
    }

    const paidAt = input.paidAt ?? new Date();
    await assertFinancialPeriodOpen(prisma, paidAt);
    const teacherName = payeeName(period);
    const isEmployee = period.employee !== null;
    const expenseCategoryKey = isEmployee ? EMPLOYEE_SALARY_EXPENSE_CATEGORY : SALARY_EXPENSE_CATEGORY;
    const expenseCategoryName = isEmployee ? 'Xodim maoshi' : 'O‘qituvchi maoshi';
    const label = formatSalaryPeriod(period.year, period.month);
    const description = `${teacherName} — ${label} ${isAdvance ? 'avansi' : 'maoshi'}`;

    await prisma.$transaction(async (tx) => {
      const payment = await tx.teacherSalaryPayment.create({
        data: {
          periodId: id,
          kind: input.kind,
          amount: input.amount,
          method: input.method,
          accountId: input.accountId ?? null,
          paidAt,
          note: input.note ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: input.amount,
          accountId: input.accountId ?? null,
          occurredAt: paidAt,
          description,
          categoryName: expenseCategoryName,
          entityType: 'teacherSalaryPayment',
          entityId: payment.id,
          createdById: actor.id,
        },
        select: { id: true },
      });

      const category = await tx.expenseCategory.upsert({
        where: { key: expenseCategoryKey },
        update: {},
        create: { key: expenseCategoryKey, name: expenseCategoryName, isSystem: true, sortOrder: isEmployee ? 2 : 1 },
        select: { id: true },
      });

      await tx.expense.create({
        data: {
          categoryId: category.id,
          amount: input.amount,
          method: input.method,
          accountId: input.accountId ?? null,
          spentAt: paidAt,
          description,
          responsibleId: actor.id,
          transactionId: transaction.id,
          salaryPaymentId: payment.id,
        },
      });

      if (input.accountId) {
        await tx.financialAccount.update({
          where: { id: input.accountId },
          data: { balance: { decrement: input.amount } },
        });
      }

      const aggregate = await tx.teacherSalaryPayment.aggregate({ where: { periodId: id }, _sum: { amount: true } });
      const paidAmount = aggregate._sum.amount?.toNumber() ?? 0;
      const totalAmount = period.totalAmount.toNumber();
      // Bir vaqtda ikki to'lov kelib qolsa — tranzaksiya bekor qiladi
      if (paidAmount > totalAmount) {
        throw AppError.conflict('Maosh bo‘yicha qolgan summa o‘zgardi — to‘lovni qaytadan kiriting');
      }

      await tx.teacherSalaryPeriod.update({
        where: { id },
        data: {
          paidAmount,
          remainingAmount: Math.max(totalAmount - paidAmount, 0),
          // Avans holatni o'zgartirmaydi — maosh hali tasdiqlanmagan
          status: isAdvance ? period.status : statusAfterPayment(totalAmount, paidAmount),
        },
      });

      const payeeUserId = payeeOf(period).userId;
      if (payeeUserId) await notificationService.createInTransaction(tx, {
        userId: payeeUserId,
        type: 'SYSTEM',
        title: isAdvance ? 'Avans berildi' : 'Maosh to‘landi',
        message: `${label} maoshi uchun ${formatSalaryAmount(input.amount)} to‘landi. Qolgan: ${formatSalaryAmount(Math.max(totalAmount - paidAmount, 0))}.`,
        entityType: 'salary',
        entityId: id,
        dedupeKey: `salary:payment:${payment.id}`,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: isAdvance ? 'salary.advance_paid' : 'salary.paid',
        entityType: 'salary',
        entityId: id,
        metadata: {
          teacher: teacherName,
          period: label,
          amount: input.amount,
          method: input.method,
          paidAmount,
          remaining: Math.max(totalAmount - paidAmount, 0),
        },
        ...client,
      });
    });

    return this.periodById(id);
  },
};
