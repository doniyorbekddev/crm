import { prisma } from '../config/database.js';
import { formatSalaryAmount, formatSalaryPeriod } from '../config/salaryLabels.js';
import type { PaymentMethod, Prisma, SalaryPeriodStatus, SalaryType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  AdjustSalaryInput,
  CalculateSalaryInput,
  PaySalaryInput,
  SalaryHistoryQuery,
  SalaryPeriodListQuery,
} from '../validators/salary.validator.js';
import type { CreateSalaryRuleInput } from '../validators/teacher.validator.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';

/** Maosh xarajati shu kategoriyaga yoziladi (seedda ham bor) */
const SALARY_EXPENSE_CATEGORY = 'TEACHER_SALARY';

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

export interface SalaryPaymentDto {
  id: string;
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
  teacher: {
    profileId: string;
    userId: string;
    firstName: string;
    lastName: string;
    specialization: string | null;
  };
  salaryType: SalaryType;
  lessonsCount: number;
  studentsCount: number;
  groupRevenue: number;
  baseAmount: number;
  lessonAmount: number;
  studentAmount: number;
  percentageAmount: number;
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
  skipped: Array<{ teacherProfileId: string; firstName: string; lastName: string; reason: string }>;
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
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
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
    teacher: {
      profileId: period.teacherProfile.id,
      userId: period.teacherProfile.user.id,
      firstName: period.teacherProfile.user.firstName,
      lastName: period.teacherProfile.user.lastName,
      specialization: period.teacherProfile.specialization,
    },
    salaryType: period.salaryType,
    lessonsCount: period.lessonsCount,
    studentsCount: period.studentsCount,
    groupRevenue: period.groupRevenue.toNumber(),
    baseAmount: period.baseAmount.toNumber(),
    lessonAmount: period.lessonAmount.toNumber(),
    studentAmount: period.studentAmount.toNumber(),
    percentageAmount: period.percentageAmount.toNumber(),
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
    payments: period.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toNumber(),
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      note: payment.note,
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

  const revenue = await tx.payment.aggregate({
    where: {
      deletedAt: null,
      paidAt: { gte: start, lt: end },
      student: { group: { teacherId: teacherUserId } },
    },
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
    percentageAmount: mixed || rates.type === 'PERCENTAGE' ? round((workload.groupRevenue * rates.percentage) / 100) : 0,
  };
}

function statusAfterPayment(total: number, paid: number): SalaryPeriodStatus {
  if (paid <= 0) return 'APPROVED';
  return paid >= total ? 'PAID' : 'PARTIALLY_PAID';
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
          teacher: `${profile.user.firstName} ${profile.user.lastName}`,
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
        ...(query.teacherProfileId ? { teacherProfileId: query.teacherProfileId } : {}),
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
      where: { year: query.year, month: query.month },
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
   * Qo‘lda kiritilgan bonus va jarima qayta hisoblashda saqlanadi;
   * tasdiqlangan (locked) davr qayta hisoblanmaydi.
   */
  async calculate(actor: AuthUser, input: CalculateSalaryInput, client: ClientInfo): Promise<CalculateResultDto> {
    const profiles = await prisma.teacherProfile.findMany({
      where: input.teacherProfileId ? { id: input.teacherProfileId } : { isActive: true },
      select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (profiles.length === 0) {
      throw input.teacherProfileId
        ? AppError.notFound('O‘qituvchi topilmadi')
        : AppError.unprocessable('Faol o‘qituvchi topilmadi');
    }

    const skipped: CalculateResultDto['skipped'] = [];
    let calculated = 0;
    let total = 0;

    for (const profile of profiles) {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.teacherSalaryPeriod.findUnique({
          where: { teacherProfileId_year_month: { teacherProfileId: profile.id, year: input.year, month: input.month } },
          select: { id: true, lockedAt: true, bonus: true, penalty: true, paidAmount: true, note: true },
        });
        if (existing?.lockedAt) {
          return { ok: false, reason: 'Maosh tasdiqlangan — qayta hisoblanmaydi' } as const;
        }

        const rule = await findRuleForMonth(tx, profile.id, input.year, input.month);
        if (!rule) {
          return { ok: false, reason: 'Maosh modeli belgilanmagan' } as const;
        }

        const workload = await loadWorkload(tx, profile.userId, input.year, input.month);
        const parts = computeSalaryParts(toSalaryRates(rule), workload);
        const bonus = existing ? existing.bonus.toNumber() : rule.bonus.toNumber();
        const penalty = existing ? existing.penalty.toNumber() : 0;
        const totalAmount = Math.max(
          parts.baseAmount + parts.lessonAmount + parts.studentAmount + parts.percentageAmount + bonus - penalty,
          0,
        );
        const paidAmount = existing?.paidAmount.toNumber() ?? 0;
        const remainingAmount = Math.max(totalAmount - paidAmount, 0);

        const data = {
          salaryType: rule.type,
          lessonsCount: workload.lessonsCount,
          studentsCount: workload.studentsCount,
          groupRevenue: workload.groupRevenue,
          baseAmount: parts.baseAmount,
          lessonAmount: parts.lessonAmount,
          studentAmount: parts.studentAmount,
          percentageAmount: parts.percentageAmount,
          bonus,
          penalty,
          totalAmount,
          paidAmount,
          remainingAmount,
          status: paidAmount > 0 ? statusAfterPayment(totalAmount, paidAmount) : ('CALCULATED' as const),
          calculatedAt: new Date(),
        };

        const period = existing
          ? await tx.teacherSalaryPeriod.update({ where: { id: existing.id }, data, select: { id: true } })
          : await tx.teacherSalaryPeriod.create({
              data: { teacherProfileId: profile.id, year: input.year, month: input.month, ...data },
              select: { id: true },
            });

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

    return { year: input.year, month: input.month, calculated, skipped, total };
  },

  /** Bonus/jarima — faqat tasdiqlashdan oldin */
  async adjust(actor: AuthUser, id: string, input: AdjustSalaryInput, client: ClientInfo): Promise<SalaryPeriodDto> {
    const period = await findPeriodOrFail(id);
    if (period.lockedAt) {
      throw AppError.conflict('Maosh tasdiqlangan — bonus va jarima o‘zgartirilmaydi');
    }

    const bonus = input.bonus ?? period.bonus.toNumber();
    const penalty = input.penalty ?? period.penalty.toNumber();
    const accrued =
      period.baseAmount.toNumber() +
      period.lessonAmount.toNumber() +
      period.studentAmount.toNumber() +
      period.percentageAmount.toNumber();
    const totalAmount = Math.max(accrued + bonus - penalty, 0);
    const paidAmount = period.paidAmount.toNumber();

    await prisma.$transaction(async (tx) => {
      await tx.teacherSalaryPeriod.update({
        where: { id },
        data: {
          bonus,
          penalty,
          totalAmount,
          remainingAmount: Math.max(totalAmount - paidAmount, 0),
          ...(input.note === undefined ? {} : { note: input.note }),
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.adjusted',
        entityType: 'salary',
        entityId: id,
        metadata: {
          teacher: `${period.teacherProfile.user.firstName} ${period.teacherProfile.user.lastName}`,
          period: formatSalaryPeriod(period.year, period.month),
          before: { bonus: period.bonus.toNumber(), penalty: period.penalty.toNumber() },
          after: { bonus, penalty },
          totalAmount,
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
    if (period.totalAmount.toNumber() <= 0) {
      throw AppError.unprocessable('Maosh summasi nol — tasdiqlash mumkin emas');
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.teacherSalaryPeriod.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: now, approvedById: actor.id, lockedAt: now },
      });

      await notificationService.createInTransaction(tx, {
        userId: period.teacherProfile.user.id,
        type: 'SYSTEM',
        title: 'Maosh tasdiqlandi',
        message: `${formatSalaryPeriod(period.year, period.month)} maoshi tasdiqlandi: ${formatSalaryAmount(period.totalAmount.toNumber())}.`,
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
          teacher: `${period.teacherProfile.user.firstName} ${period.teacherProfile.user.lastName}`,
          period: formatSalaryPeriod(period.year, period.month),
          totalAmount: period.totalAmount.toNumber(),
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
    if (period.status !== 'APPROVED' && period.status !== 'PARTIALLY_PAID') {
      throw AppError.unprocessable('Maosh tasdiqlanmagan — to‘lov qabul qilinmaydi');
    }

    const remaining = period.remainingAmount.toNumber();
    if (remaining <= 0) {
      throw AppError.conflict('Bu maosh to‘liq to‘langan');
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
    const teacherName = `${period.teacherProfile.user.firstName} ${period.teacherProfile.user.lastName}`;
    const label = formatSalaryPeriod(period.year, period.month);
    const description = `${teacherName} — ${label} maoshi`;

    await prisma.$transaction(async (tx) => {
      const payment = await tx.teacherSalaryPayment.create({
        data: {
          periodId: id,
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
          categoryName: 'O‘qituvchi maoshi',
          entityType: 'teacherSalaryPayment',
          entityId: payment.id,
          createdById: actor.id,
        },
        select: { id: true },
      });

      const category = await tx.expenseCategory.upsert({
        where: { key: SALARY_EXPENSE_CATEGORY },
        update: {},
        create: { key: SALARY_EXPENSE_CATEGORY, name: 'O‘qituvchi maoshi', isSystem: true, sortOrder: 1 },
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
          status: statusAfterPayment(totalAmount, paidAmount),
        },
      });

      await notificationService.createInTransaction(tx, {
        userId: period.teacherProfile.user.id,
        type: 'SYSTEM',
        title: 'Maosh to‘landi',
        message: `${label} maoshi uchun ${formatSalaryAmount(input.amount)} to‘landi. Qolgan: ${formatSalaryAmount(Math.max(totalAmount - paidAmount, 0))}.`,
        entityType: 'salary',
        entityId: id,
        dedupeKey: `salary:payment:${payment.id}`,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'salary.paid',
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
