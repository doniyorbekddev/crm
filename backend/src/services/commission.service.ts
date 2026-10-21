import { prisma } from '../config/database.js';
import { formatPaymentNumber } from '../config/paymentLabels.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { CommissionEntryKind, Prisma, SalaryPeriodStatus, SalaryType } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CommissionQuery } from '../validators/commission.validator.js';
import { auditService } from './audit.service.js';
import { ACTIVE_MEMBERSHIP } from './groupMembership.js';

/**
 * O‘qituvchi foizi (revenue commission) — promt: "o‘qituvchiga biriktirilgan o‘quvchilardan HAQIQATDA
 * tushgan to‘lov asosida". Har bir to‘lov uchun alohida yozuv (CommissionEntry) saqlanadi:
 *
 * - to‘lov qabul qilinganda — ACCRUAL (+ summa × foiz), to‘lov paytidagi o‘qituvchiga;
 * - to‘lov bekor qilinganda — REVERSAL (−). Asl oy maoshi tasdiqlangan (qulflangan) bo‘lsa,
 *   teskari yozuv keyingi ochiq oyga tushadi — o‘tgan oy tarixi o‘zgarmaydi;
 * - oy maoshi manfiy chiqsa — CARRY_OVER: qoldiq keyingi oyga ko‘chiriladi (pul yo‘qolmaydi).
 *
 * To‘lanmagan qarz hech qachon hisobga kirmaydi — yozuv faqat real to‘lovdan paydo bo‘ladi.
 */

type Db = Prisma.TransactionClient;

export interface YearMonth {
  year: number;
  month: number;
}

/** Foiz faqat shu modellarda hisoblanadi */
export const COMMISSION_SALARY_TYPES: readonly SalaryType[] = ['PERCENTAGE', 'MIXED'];

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface CommissionEntryDto {
  id: string;
  kind: CommissionEntryKind;
  year: number;
  month: number;
  label: string;
  occurredAt: string;
  baseAmount: number;
  percentage: number;
  amount: number;
  reason: string | null;
  /** Maosh tasdiqlangan — yozuv o‘zgarmaydi */
  locked: boolean;
  payment: {
    id: string;
    code: string;
    paidAt: string;
    amount: number;
    isCancelled: boolean;
    student: { id: string; code: string; firstName: string; lastName: string };
    group: { id: string; name: string } | null;
  } | null;
}

export interface CommissionMonthDto {
  year: number;
  month: number;
  label: string;
  /** Guruhlaridagi faol o‘quvchilar (hozirgi holat) */
  students: number;
  /** Oy davomida o‘qituvchiga tegishli, bekor qilinmagan to‘lovlar */
  payments: number;
  revenue: number;
  /** Shu oyga amal qilgan foiz (PERCENTAGE / MIXED modelda) */
  percentage: number;
  /** Shu oy maoshiga kiradigan foiz yozuvlari yig‘indisi (teskari yozuvlar bilan) */
  commission: number;
  salary: {
    id: string;
    status: SalaryPeriodStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    lockedAt: string | null;
  } | null;
}

export interface TeacherRefDto {
  profileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialization: string | null;
  isActive: boolean;
}

export interface TeacherCommissionSummaryDto extends CommissionMonthDto {
  teacher: TeacherRefDto;
}

export interface TeacherCommissionDetailDto {
  teacher: TeacherRefDto;
  month: CommissionMonthDto;
  entries: CommissionEntryDto[];
  /** Oxirgi 6 oy — yangisi birinchi */
  history: CommissionMonthDto[];
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

export function commissionAmount(base: number, percentage: number): number {
  return Math.round((base * percentage) / 100);
}

const accrualKey = (paymentId: string) => `payment:${paymentId}:accrual`;
const reversalKey = (paymentId: string) => `payment:${paymentId}:reversal`;
/** PMT: qo'shimcha guruh o'qituvchisining yozuvi (asosiy o'qituvchi kalitlari o'zgarmagan — eski yozuvlar bilan mos) */
const shareAccrualKey = (paymentId: string, teacherId: string) => `payment:${paymentId}:accrual:${teacherId}`;

/** To'lovning bir o'qituvchiga tegishli qismi (foiz asosi) */
interface CommissionPart {
  teacherId: string;
  base: number;
  /** Asosiy guruh o'qituvchisi (to'lovdagi `teacherId`) */
  main: boolean;
  /** Qo'shimcha guruh ulushi bo'lsa — izoh uchun */
  share: { percent: number; groupName: string | null } | null;
}

/**
 * To'lov o'qituvchilar bo'yicha: qo'shimcha guruh ulushlari to'lov paytida qotirilgan (payment_teacher_shares),
 * qolgani asosiy guruh o'qituvchisiga. Ulushsiz (eski) to'lov — butun summa asosiy o'qituvchiga, avvalgidek.
 */
async function partsOf(db: Db, payment: { id: string; amount: number; teacherId: string | null }): Promise<CommissionPart[]> {
  const shares = await db.paymentTeacherShare.findMany({
    where: { paymentId: payment.id },
    orderBy: { createdAt: 'asc' },
    select: { teacherId: true, sharePercent: true, baseAmount: true, group: { select: { name: true } } },
  });
  const extra = shares.map((row) => ({
    teacherId: row.teacherId,
    base: row.baseAmount.toNumber(),
    main: false,
    share: { percent: row.sharePercent.toNumber(), groupName: row.group?.name ?? null },
  }));
  const mainBase = payment.amount - extra.reduce((sum, part) => sum + part.base, 0);
  return [...(payment.teacherId ? [{ teacherId: payment.teacherId, base: mainBase, main: true, share: null }] : []), ...extra];
}

function shareReason(share: NonNullable<CommissionPart['share']>): string {
  return `PMT ulushi${share.groupName ? `: ${share.groupName}` : ''} (${share.percent}%)`;
}

/**
 * To'lov paytida PMT bo'linishini qotiradi: o'quvchining faol qo'shimcha guruhlaridagi ulushlar (o'qituvchi bo'yicha
 * jamlanadi). Asosiy o'qituvchining o'zi dars beradigan qo'shimcha guruh ulushi unda qoladi (alohida yozuv emas).
 * Ulushlar yig'indisi 100% dan oshmaydi (a'zolikda tekshiriladi); yaxlitlash summadan oshirmaydi.
 */
async function recordShares(db: Db, payment: { id: string; studentId: string; amount: number; teacherId: string | null }): Promise<void> {
  if ((await db.paymentTeacherShare.count({ where: { paymentId: payment.id } })) > 0) return;
  const memberships = await db.studentGroupMembership.findMany({
    where: { studentId: payment.studentId, ...ACTIVE_MEMBERSHIP, commissionShare: { gt: 0 }, group: { teacherId: { not: null } } },
    orderBy: { joinedAt: 'asc' },
    select: { groupId: true, commissionShare: true, group: { select: { teacherId: true } } },
  });
  const byTeacher = new Map<string, { groupId: string; percent: number }>();
  for (const membership of memberships) {
    const teacherId = membership.group.teacherId!;
    if (teacherId === payment.teacherId) continue;
    const current = byTeacher.get(teacherId);
    byTeacher.set(teacherId, { groupId: current?.groupId ?? membership.groupId, percent: (current?.percent ?? 0) + membership.commissionShare.toNumber() });
  }
  let left = payment.amount;
  const rows = [];
  for (const [teacherId, value] of byTeacher) {
    const percent = Math.min(value.percent, 100);
    const base = Math.min(Math.round((payment.amount * percent) / 100), left);
    if (base <= 0) continue;
    left -= base;
    rows.push({ paymentId: payment.id, teacherId, groupId: value.groupId, sharePercent: percent, baseAmount: base });
  }
  if (rows.length > 0) await db.paymentTeacherShare.createMany({ data: rows });
}

function monthIndex(value: YearMonth): number {
  return value.year * 12 + (value.month - 1);
}

function fromIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function nextMonth(value: YearMonth): YearMonth {
  return fromIndex(monthIndex(value) + 1);
}

/** Tanlangan oy va undan oldingi (count − 1) oy — eskisidan yangisiga */
export function monthsEndingAt(value: YearMonth, count: number): YearMonth[] {
  const last = monthIndex(value);
  return Array.from({ length: count }, (_, index) => fromIndex(last - count + 1 + index));
}

/** Maosh modeli sanalari @db.Date (UTC) — oy chegarasi ham UTC */
function ruleMonthRange(value: YearMonth): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(value.year, value.month - 1, 1)), end: new Date(Date.UTC(value.year, value.month, 1)) };
}

interface RuleLike {
  type: SalaryType;
  percentage: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** Oyga amal qilgan modeldagi foiz (qoidalar effectiveFrom bo‘yicha kamayish tartibida berilishi kerak) */
function percentageFromRules(rules: RuleLike[], value: YearMonth): number {
  const { start, end } = ruleMonthRange(value);
  const rule = rules.find((item) => item.effectiveFrom < end && (item.effectiveTo === null || item.effectiveTo >= start));
  return rule && COMMISSION_SALARY_TYPES.includes(rule.type) ? rule.percentage.toNumber() : 0;
}

async function percentageForMonth(db: Db, teacherProfileId: string, value: YearMonth): Promise<number> {
  const { start, end } = ruleMonthRange(value);
  const rules = await db.teacherSalaryRule.findMany({
    where: { teacherProfileId, effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    select: { type: true, percentage: true, effectiveFrom: true, effectiveTo: true },
  });
  return percentageFromRules(rules, value);
}

async function lockedPeriod(db: Db, teacherProfileId: string, value: YearMonth) {
  const period = await db.teacherSalaryPeriod.findUnique({
    where: { teacherProfileId_year_month: { teacherProfileId, year: value.year, month: value.month } },
    select: { id: true, lockedAt: true, percentageAmount: true },
  });
  return period?.lockedAt ? period : null;
}

/**
 * Yozuv tushadigan oy: tanlangan oy maoshi tasdiqlangan bo‘lsa — joriy oy,
 * u ham tasdiqlangan bo‘lsa — keyingi birinchi ochiq oy.
 */
export async function resolveOpenMonth(db: Db, teacherProfileId: string, preferred: YearMonth): Promise<YearMonth> {
  const now = currentBusinessMonth();
  let target = preferred;
  for (let guard = 0; guard < 36; guard += 1) {
    if (!(await lockedPeriod(db, teacherProfileId, target))) return target;
    target = monthIndex(target) < monthIndex(now) ? now : nextMonth(target);
  }
  return target;
}

const entrySelect = {
  id: true,
  kind: true,
  year: true,
  month: true,
  occurredAt: true,
  baseAmount: true,
  percentage: true,
  amount: true,
  reason: true,
  salaryPeriod: { select: { lockedAt: true } },
  payment: {
    select: {
      id: true,
      number: true,
      paidAt: true,
      amount: true,
      deletedAt: true,
      student: { select: { id: true, number: true, firstName: true, lastName: true } },
      group: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CommissionEntrySelect;

type EntryRecord = Prisma.CommissionEntryGetPayload<{ select: typeof entrySelect }>;

function toEntryDto(entry: EntryRecord): CommissionEntryDto {
  return {
    id: entry.id,
    kind: entry.kind,
    year: entry.year,
    month: entry.month,
    label: formatSalaryPeriod(entry.year, entry.month),
    occurredAt: entry.occurredAt.toISOString(),
    baseAmount: entry.baseAmount.toNumber(),
    percentage: entry.percentage.toNumber(),
    amount: entry.amount.toNumber(),
    reason: entry.reason,
    locked: Boolean(entry.salaryPeriod?.lockedAt),
    payment: entry.payment
      ? {
          id: entry.payment.id,
          code: formatPaymentNumber(entry.payment.number),
          paidAt: entry.payment.paidAt.toISOString(),
          amount: entry.payment.amount.toNumber(),
          isCancelled: entry.payment.deletedAt !== null,
          student: {
            id: entry.payment.student.id,
            code: formatStudentNumber(entry.payment.student.number),
            firstName: entry.payment.student.firstName,
            lastName: entry.payment.student.lastName,
          },
          group: entry.payment.group,
        }
      : null,
  };
}

interface ProfileRef {
  id: string;
  userId: string;
  specialization: string | null;
  isActive: boolean;
  user: { firstName: string; lastName: string };
}

const profileRefSelect = {
  id: true,
  userId: true,
  specialization: true,
  isActive: true,
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TeacherProfileSelect;

function toTeacherRef(profile: ProfileRef): TeacherRefDto {
  return {
    profileId: profile.id,
    userId: profile.userId,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    specialization: profile.specialization,
    isActive: profile.isActive,
  };
}

const summaryKey = (profileId: string, value: YearMonth) => `${profileId}:${value.year}-${value.month}`;

/**
 * Bir nechta o‘qituvchi × bir nechta oy uchun yig‘ma ko‘rsatkichlar — 6 ta so‘rov bilan
 * (o‘qituvchi va oylar sonidan qat’i nazar).
 */
async function summarizeMonths(profiles: ProfileRef[], months: YearMonth[]): Promise<Map<string, CommissionMonthDto>> {
  const result = new Map<string, CommissionMonthDto>();
  const first = months[0];
  const last = months[months.length - 1];
  if (profiles.length === 0 || !first || !last) return result;

  const userIds = profiles.map((profile) => profile.userId);
  const profileIds = profiles.map((profile) => profile.id);
  const monthFilter = months.map(({ year, month }) => ({ year, month }));

  const [payments, entries, rules, periods, groups, shares] = await Promise.all([
    prisma.payment.findMany({
      where: {
        teacherId: { in: userIds },
        deletedAt: null,
        paidAt: { gte: businessMonthRange(first.year, first.month).start, lt: businessMonthRange(last.year, last.month).end },
      },
      select: { teacherId: true, amount: true, paidAt: true, teacherShares: { select: { baseAmount: true } } },
    }),
    prisma.commissionEntry.groupBy({
      by: ['teacherId', 'year', 'month'],
      where: { teacherId: { in: userIds }, OR: monthFilter },
      _sum: { amount: true },
    }),
    prisma.teacherSalaryRule.findMany({
      where: { teacherProfileId: { in: profileIds } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { teacherProfileId: true, type: true, percentage: true, effectiveFrom: true, effectiveTo: true },
    }),
    prisma.teacherSalaryPeriod.findMany({
      where: { teacherProfileId: { in: profileIds }, OR: monthFilter },
      select: {
        id: true,
        teacherProfileId: true,
        year: true,
        month: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        lockedAt: true,
      },
    }),
    prisma.group.findMany({
      where: { teacherId: { in: userIds } },
      select: { teacherId: true, _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } } },
    }),
    // PMT: boshqa guruh to'lovidan shu o'qituvchilarga qotirilgan ulushlar
    prisma.paymentTeacherShare.findMany({
      where: {
        teacherId: { in: userIds },
        payment: { deletedAt: null, paidAt: { gte: businessMonthRange(first.year, first.month).start, lt: businessMonthRange(last.year, last.month).end } },
      },
      select: { teacherId: true, baseAmount: true, payment: { select: { paidAt: true } } },
    }),
  ]);

  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const studentsByUser = new Map<string, number>();
  for (const group of groups) {
    if (!group.teacherId) continue;
    studentsByUser.set(group.teacherId, (studentsByUser.get(group.teacherId) ?? 0) + group._count.students);
  }

  for (const profile of profiles) {
    const profileRules = rules.filter((rule) => rule.teacherProfileId === profile.id);
    for (const value of months) {
      const period = periods.find((row) => row.teacherProfileId === profile.id && row.year === value.year && row.month === value.month);
      result.set(summaryKey(profile.id, value), {
        year: value.year,
        month: value.month,
        label: formatSalaryPeriod(value.year, value.month),
        students: studentsByUser.get(profile.userId) ?? 0,
        payments: 0,
        revenue: 0,
        percentage: percentageFromRules(profileRules, value),
        commission: 0,
        salary: period
          ? {
              id: period.id,
              status: period.status,
              totalAmount: period.totalAmount.toNumber(),
              paidAmount: period.paidAmount.toNumber(),
              remainingAmount: period.remainingAmount.toNumber(),
              lockedAt: period.lockedAt?.toISOString() ?? null,
            }
          : null,
      });
    }
  }

  for (const payment of payments) {
    const profile = payment.teacherId ? profileByUser.get(payment.teacherId) : undefined;
    if (!profile) continue;
    const row = result.get(summaryKey(profile.id, currentBusinessMonth(payment.paidAt)));
    if (!row) continue;
    row.payments += 1;
    row.revenue += payment.amount.toNumber() - payment.teacherShares.reduce((sum, share) => sum + share.baseAmount.toNumber(), 0);
  }
  for (const share of shares) {
    const profile = profileByUser.get(share.teacherId);
    const row = profile ? result.get(summaryKey(profile.id, currentBusinessMonth(share.payment.paidAt))) : undefined;
    if (!row) continue;
    row.payments += 1;
    row.revenue += share.baseAmount.toNumber();
  }
  for (const entry of entries) {
    const profile = profileByUser.get(entry.teacherId);
    const row = profile ? result.get(summaryKey(profile.id, entry)) : undefined;
    if (row) row.commission += entry._sum.amount?.toNumber() ?? 0;
  }

  return result;
}

interface PaymentRef {
  id: string;
  number: number;
  amount: number;
  paidAt: Date;
  teacherId: string | null;
}

/**
 * + yozuvning teskarisi (to‘liq yoki qisman). Asl yozuv o‘chirilmaydi.
 * Asl oy maoshi tasdiqlangan bo‘lsa — teskari yozuv keyingi ochiq oyga tushadi.
 * PMT bo'linishi bo'lsa — har o'qituvchining qismi o'z ulushiga proporsional qaytariladi.
 */
async function reverseAccrual(
  db: Db,
  payment: PaymentRef,
  options: { sourceKey: string; baseAmount: number; actorId: string | null; reason: string; client: ClientInfo },
): Promise<void> {
  for (const part of await partsOf(db, payment)) {
    await reversePart(db, payment, part, options);
  }
}

async function reversePart(
  db: Db,
  payment: PaymentRef,
  part: CommissionPart,
  options: { sourceKey: string; baseAmount: number; actorId: string | null; reason: string; client: ClientInfo },
): Promise<void> {
  if (part.base <= 0) return;
  const profile = await db.teacherProfile.findUnique({ where: { userId: part.teacherId }, select: { id: true } });
  if (!profile) return;
  const sourceKey = part.main ? options.sourceKey : `${options.sourceKey}:${part.teacherId}`;
  if (await db.commissionEntry.findUnique({ where: { sourceKey }, select: { id: true } })) return;

  let accrual = await db.commissionEntry.findUnique({
    where: { sourceKey: part.main ? accrualKey(payment.id) : shareAccrualKey(payment.id, part.teacherId) },
    select: { id: true, year: true, month: true, baseAmount: true, percentage: true, amount: true },
  });

  if (!accrual) {
    // Qo'shimcha guruh ulushida + yozuv bo'lmasa (foizsiz model) — qaytariladigan foiz yo'q
    if (!part.main) return;
    // Funksiya qo'shilishidan oldingi to'lov: oy maoshi tasdiqlangan va foiz umumiy tushumdan
    // hisoblangan bo'lsa — tarixiy + yozuv tiklanadi, aks holda qaytariladigan foiz yo'q.
    const paidMonth = currentBusinessMonth(payment.paidAt);
    const period = await lockedPeriod(db, profile.id, paidMonth);
    if (!period || period.percentageAmount.toNumber() <= 0) return;
    const percentage = await percentageForMonth(db, profile.id, paidMonth);
    if (percentage <= 0) return;
    accrual = await db.commissionEntry.create({
      data: {
        sourceKey: accrualKey(payment.id),
        teacherId: part.teacherId,
        paymentId: payment.id,
        kind: 'ACCRUAL',
        baseAmount: part.base,
        percentage,
        amount: commissionAmount(part.base, percentage),
        year: paidMonth.year,
        month: paidMonth.month,
        occurredAt: payment.paidAt,
        salaryPeriodId: period.id,
        reason: 'Tarixiy yozuv: foiz tasdiqlangan maoshda hisoblangan',
        createdById: options.actorId,
      },
      select: { id: true, year: true, month: true, baseAmount: true, percentage: true, amount: true },
    });
  }

  const accrualLocked = await lockedPeriod(db, profile.id, accrual);
  const target = accrualLocked
    ? await resolveOpenMonth(db, profile.id, currentBusinessMonth())
    : { year: accrual.year, month: accrual.month };
  const percentage = accrual.percentage.toNumber();
  // Shu o'qituvchi qismidan qaytariladigan asos: to'liq bekor qilishda — butun qism, qisman qaytarishda — ulushga proporsional
  const base = options.baseAmount === payment.amount ? part.base : Math.round((options.baseAmount * part.base) / payment.amount);
  if (base <= 0) return;
  // To'liq bekor qilishda aynan + yozuv qoplanadi, qisman qaytarishda summaga proporsional
  const amount = base === accrual.baseAmount.toNumber() ? -accrual.amount.toNumber() : -commissionAmount(base, percentage);

  const reversal = await db.commissionEntry.create({
    data: {
      sourceKey,
      teacherId: part.teacherId,
      paymentId: payment.id,
      kind: 'REVERSAL',
      baseAmount: -base,
      percentage,
      amount,
      year: target.year,
      month: target.month,
      occurredAt: new Date(),
      reason: part.share ? `${options.reason} · ${shareReason(part.share)}`.slice(0, 255) : options.reason,
      createdById: options.actorId,
    },
    select: { id: true },
  });

  await auditService.recordInTransaction(db, {
    userId: options.actorId,
    action: 'commission.reversed',
    entityType: 'commission',
    entityId: reversal.id,
    metadata: {
      receipt: formatPaymentNumber(payment.number),
      amount,
      base: -base,
      period: formatSalaryPeriod(target.year, target.month),
      movedToOpenPeriod: Boolean(accrualLocked),
      reason: options.reason,
      ...(part.share ? { share: part.share.percent } : {}),
    },
    ...options.client,
  });
}

// ---------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------

export const commissionService = {
  /**
   * To‘lov qabul qilinganda: PMT bo'linishi qotiriladi, so'ng foizli modeldagi har o'qituvchiga o'z qismidan + yozuv
   * (asosiy guruh o'qituvchisi — qolgan summadan, qo'shimcha guruh o'qituvchisi — ulushidan).
   */
  async accrueForPayment(
    db: Db,
    payment: { id: string; studentId: string; amount: number; paidAt: Date; teacherId: string | null },
    actorId: string | null,
  ): Promise<void> {
    await recordShares(db, payment);
    for (const part of await partsOf(db, payment)) {
      if (part.base <= 0) continue;
      const profile = await db.teacherProfile.findUnique({ where: { userId: part.teacherId }, select: { id: true } });
      if (!profile) continue;
      const sourceKey = part.main ? accrualKey(payment.id) : shareAccrualKey(payment.id, part.teacherId);
      if (await db.commissionEntry.findUnique({ where: { sourceKey }, select: { id: true } })) continue;

      const target = await resolveOpenMonth(db, profile.id, currentBusinessMonth(payment.paidAt));
      const percentage = await percentageForMonth(db, profile.id, target);
      if (percentage <= 0) continue;

      await db.commissionEntry.create({
        data: {
          sourceKey,
          teacherId: part.teacherId,
          paymentId: payment.id,
          kind: 'ACCRUAL',
          baseAmount: part.base,
          percentage,
          amount: commissionAmount(part.base, percentage),
          year: target.year,
          month: target.month,
          occurredAt: payment.paidAt,
          reason: part.share ? shareReason(part.share) : null,
          createdById: actorId,
        },
      });
    }
  },

  /** To‘lov bekor qilinganda: + yozuvning to‘liq teskarisi */
  async reverseForPayment(
    db: Db,
    payment: PaymentRef,
    options: { actorId: string; reason: string; client: ClientInfo },
  ): Promise<void> {
    await reverseAccrual(db, payment, { ...options, sourceKey: reversalKey(payment.id), baseAmount: payment.amount });
  },

  /** To‘lovning bir qismi qaytarilganda: qaytarilgan summaga proporsional teskari yozuv */
  async reverseForRefund(
    db: Db,
    input: { payment: PaymentRef; refund: { id: string; amount: number } },
    options: { actorId: string | null; reason: string; client: ClientInfo },
  ): Promise<void> {
    await reverseAccrual(db, input.payment, { ...options, sourceKey: `refund:${input.refund.id}`, baseAmount: input.refund.amount });
  },

  /**
   * Maosh hisoblashdan oldin (qulflanmagan oy): yozuvi yo‘q to‘lovlarga yozuv yaratadi va
   * oydagi yozuvlarni joriy foizga moslaydi (model o‘zgargan bo‘lishi mumkin).
   */
  async syncMonth(
    db: Db,
    profile: { id: string; userId: string },
    value: YearMonth,
    actorId: string | null,
  ): Promise<{ revenue: number; commission: number }> {
    const percentage = await percentageForMonth(db, profile.id, value);
    const { start, end } = businessMonthRange(value.year, value.month);

    if (percentage > 0) {
      // Asosiy guruh o'qituvchisi sifatida: yozuvi yo'q to'lovlar (asos — PMT ulushlaridan qolgani)
      const missing = await db.payment.findMany({
        where: {
          teacherId: profile.userId,
          deletedAt: null,
          paidAt: { gte: start, lt: end },
          commissionEntries: { none: { kind: 'ACCRUAL', teacherId: profile.userId } },
        },
        select: { id: true, amount: true, paidAt: true, teacherShares: { select: { baseAmount: true } } },
      });
      for (const payment of missing) {
        const amount = payment.amount.toNumber() - payment.teacherShares.reduce((sum, share) => sum + share.baseAmount.toNumber(), 0);
        if (amount <= 0) continue;
        await db.commissionEntry.create({
          data: {
            sourceKey: accrualKey(payment.id),
            teacherId: profile.userId,
            paymentId: payment.id,
            kind: 'ACCRUAL',
            baseAmount: amount,
            percentage,
            amount: commissionAmount(amount, percentage),
            year: value.year,
            month: value.month,
            occurredAt: payment.paidAt,
            createdById: actorId,
          },
        });
      }
      // Qo'shimcha guruh o'qituvchisi sifatida: qotirilgan ulushi bor, yozuvi yo'q to'lovlar
      const missingShares = await db.paymentTeacherShare.findMany({
        where: {
          teacherId: profile.userId,
          payment: { deletedAt: null, paidAt: { gte: start, lt: end }, commissionEntries: { none: { kind: 'ACCRUAL', teacherId: profile.userId } } },
        },
        select: { baseAmount: true, sharePercent: true, group: { select: { name: true } }, payment: { select: { id: true, paidAt: true } } },
      });
      for (const share of missingShares) {
        const amount = share.baseAmount.toNumber();
        if (amount <= 0) continue;
        await db.commissionEntry.create({
          data: {
            sourceKey: shareAccrualKey(share.payment.id, profile.userId),
            teacherId: profile.userId,
            paymentId: share.payment.id,
            kind: 'ACCRUAL',
            baseAmount: amount,
            percentage,
            amount: commissionAmount(amount, percentage),
            year: value.year,
            month: value.month,
            occurredAt: share.payment.paidAt,
            reason: shareReason({ percent: share.sharePercent.toNumber(), groupName: share.group?.name ?? null }),
            createdById: actorId,
          },
        });
      }
    }

    const monthEntries = await db.commissionEntry.findMany({
      where: { teacherId: profile.userId, year: value.year, month: value.month, kind: { in: ['ACCRUAL', 'REVERSAL'] } },
      select: { id: true, kind: true, paymentId: true, baseAmount: true, percentage: true, amount: true },
    });
    const accrualByPayment = new Map<string, { amount: number; percentage: number }>();
    const accrualBase = new Map<string, number>();
    for (const entry of monthEntries) {
      if (entry.kind !== 'ACCRUAL') continue;
      const base = entry.baseAmount.toNumber();
      const amount = commissionAmount(base, percentage);
      if (entry.percentage.toNumber() !== percentage || entry.amount.toNumber() !== amount) {
        await db.commissionEntry.update({ where: { id: entry.id }, data: { percentage, amount } });
      }
      if (entry.paymentId) {
        accrualByPayment.set(entry.paymentId, { amount, percentage });
        accrualBase.set(entry.paymentId, base);
      }
    }
    // Shu oyning o'zida bekor qilingan to'lovlar — teskari yozuv + yozuvni aynan qoplaydi
    for (const entry of monthEntries) {
      if (entry.kind !== 'REVERSAL' || !entry.paymentId) continue;
      const accrual = accrualByPayment.get(entry.paymentId);
      if (!accrual) continue;
      const base = Math.abs(entry.baseAmount.toNumber());
      const mirrored = base === accrualBase.get(entry.paymentId) ? -accrual.amount : -commissionAmount(base, accrual.percentage);
      if (entry.amount.toNumber() !== mirrored || entry.percentage.toNumber() !== accrual.percentage) {
        await db.commissionEntry.update({
          where: { id: entry.id },
          data: { percentage: accrual.percentage, amount: mirrored },
        });
      }
    }

    const monthPayments = { deletedAt: null, paidAt: { gte: start, lt: end } };
    const [commission, revenue, sharedOut, sharedIn] = await Promise.all([
      db.commissionEntry.aggregate({
        where: { teacherId: profile.userId, year: value.year, month: value.month },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { teacherId: profile.userId, ...monthPayments },
        _sum: { amount: true },
      }),
      // Tushum: asosiy guruh to'lovlari − boshqa o'qituvchilarga berilgan PMT ulushlari + o'ziga berilgan ulushlar
      db.paymentTeacherShare.aggregate({ where: { payment: { teacherId: profile.userId, ...monthPayments } }, _sum: { baseAmount: true } }),
      db.paymentTeacherShare.aggregate({ where: { teacherId: profile.userId, payment: monthPayments }, _sum: { baseAmount: true } }),
    ]);
    const revenueTotal =
      (revenue._sum.amount?.toNumber() ?? 0) - (sharedOut._sum.baseAmount?.toNumber() ?? 0) + (sharedIn._sum.baseAmount?.toNumber() ?? 0);
    return { revenue: revenueTotal, commission: commission._sum.amount?.toNumber() ?? 0 };
  },

  /** Oydagi barcha yozuvlarni maosh davriga bog‘laydi */
  async linkToPeriod(db: Db, teacherId: string, value: YearMonth, salaryPeriodId: string): Promise<void> {
    await db.commissionEntry.updateMany({
      where: { teacherId, year: value.year, month: value.month },
      data: { salaryPeriodId },
    });
  },

  /** Oy yozuvlari yig‘indisi — tasdiqlashdan oldin hisob eskirmaganini tekshirish uchun */
  async monthTotal(db: Db, teacherId: string, value: YearMonth): Promise<number> {
    const total = await db.commissionEntry.aggregate({
      where: { teacherId, year: value.year, month: value.month },
      _sum: { amount: true },
    });
    return total._sum.amount?.toNumber() ?? 0;
  },

  /**
   * Oy maoshi manfiy chiqqanda (masalan, tasdiqlangan oydagi to‘lov qaytarilgan): qoldiq keyingi
   * ochiq oyga ko‘chiriladi — shu oyga +, keyingisiga − yozuv. Maosh 0 bo‘lib tasdiqlanadi.
   */
  async carryOver(
    db: Db,
    input: {
      period: { id: string; teacherProfileId: string; year: number; month: number; label: string };
      teacherId: string;
      /** Musbat son — ko‘chiriladigan summa */
      amount: number;
      actorId: string;
      client: ClientInfo;
    },
  ): Promise<YearMonth> {
    if (await db.commissionEntry.findUnique({ where: { sourceKey: `period:${input.period.id}:carry-out` }, select: { id: true } })) {
      throw AppError.conflict('Bu oyning manfiy qoldig‘i avval ko‘chirilgan — qo‘shimcha tuzatishni keyingi oyda kiriting');
    }
    const target = await resolveOpenMonth(db, input.period.teacherProfileId, nextMonth(input.period));
    const now = new Date();
    const reason = `${input.period.label} maoshidan ko‘chirilgan manfiy qoldiq`;

    await db.commissionEntry.create({
      data: {
        sourceKey: `period:${input.period.id}:carry-out`,
        teacherId: input.teacherId,
        kind: 'CARRY_OVER',
        baseAmount: 0,
        amount: input.amount,
        year: input.period.year,
        month: input.period.month,
        occurredAt: now,
        salaryPeriodId: input.period.id,
        reason: `Keyingi oyga ko‘chirildi: ${formatSalaryPeriod(target.year, target.month)}`,
        createdById: input.actorId,
      },
    });
    const incoming = await db.commissionEntry.create({
      data: {
        sourceKey: `period:${input.period.id}:carry-in`,
        teacherId: input.teacherId,
        kind: 'CARRY_OVER',
        baseAmount: 0,
        amount: -input.amount,
        year: target.year,
        month: target.month,
        occurredAt: now,
        reason,
        createdById: input.actorId,
      },
      select: { id: true },
    });

    await auditService.recordInTransaction(db, {
      userId: input.actorId,
      action: 'commission.carried_over',
      entityType: 'commission',
      entityId: incoming.id,
      metadata: { from: input.period.label, to: formatSalaryPeriod(target.year, target.month), amount: -input.amount },
      ...input.client,
    });
    return target;
  },

  /** Owner: tanlangan oy bo‘yicha barcha o‘qituvchilar */
  async list(query: CommissionQuery): Promise<TeacherCommissionSummaryDto[]> {
    const profiles = await prisma.teacherProfile.findMany({
      where: { user: { deletedAt: null } },
      select: profileRefSelect,
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
    });
    const value = { year: query.year, month: query.month };
    const summaries = await summarizeMonths(profiles, [value]);

    return profiles
      .map((profile) => ({ teacher: toTeacherRef(profile), ...summaries.get(summaryKey(profile.id, value))! }))
      .filter((row) => row.teacher.isActive || row.revenue !== 0 || row.commission !== 0 || row.salary !== null)
      .sort((a, b) => b.revenue - a.revenue || a.teacher.firstName.localeCompare(b.teacher.firstName));
  },

  async detail(teacherProfileId: string, query: CommissionQuery): Promise<TeacherCommissionDetailDto> {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: teacherProfileId }, select: profileRefSelect });
    if (!profile) {
      throw AppError.notFound('O‘qituvchi topilmadi');
    }
    const value = { year: query.year, month: query.month };
    const months = monthsEndingAt(value, 6);
    const summaries = await summarizeMonths([profile], months);

    const entries = await prisma.commissionEntry.findMany({
      where: { teacherId: profile.userId, year: value.year, month: value.month },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: entrySelect,
    });

    return {
      teacher: toTeacherRef(profile),
      month: summaries.get(summaryKey(profile.id, value))!,
      entries: entries.map(toEntryDto),
      history: months
        .slice()
        .reverse()
        .map((month) => summaries.get(summaryKey(profile.id, month))!),
    };
  },

  /** O‘qituvchining o‘zi: "Mening daromadim" */
  async mine(userId: string, query: CommissionQuery): Promise<TeacherCommissionDetailDto> {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      throw AppError.notFound('Sizda o‘qituvchi profili yo‘q');
    }
    return this.detail(profile.id, query);
  },
};
