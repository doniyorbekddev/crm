import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AlertSeverity, AlertType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString, businessMonthRange, currentBusinessMonth, startOfBusinessDay, startOfBusinessMonth } from '../utils/dates.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { ALERT_TYPES } from '../validators/alert.validator.js';
import type { AlertListQuery, AlertSettingsInput, ResolveAlertInput } from '../validators/alert.validator.js';
import { auditService } from './audit.service.js';
import { financeService } from './finance.service.js';
import { computeTargetProgress } from './target.service.js';

/**
 * Avtomatik ogohlantirishlar.
 *
 * Har bir qoida hozirgi holatdan "nomzod" alertlar ro‘yxatini tuzadi. `dedupeKey` bir
 * obyektga bitta alert bo‘lishini ta’minlaydi:
 * - nomzod yangi bo‘lsa — alert yaratiladi (kritik bo‘lsa xodimlarga bildirishnoma);
 * - ochiq alert bo‘lsa — matni yangilanadi; daraja oshsa qayta "o‘qilmagan" bo‘ladi;
 * - holat to‘g‘rilangan (yoki qoida o‘chirilgan) bo‘lsa — alert avtomatik yopiladi va kaliti
 *   arxivlanadi, shunda muammo keyinroq qaytsa yangi alert ochiladi;
 * - xodim qo‘lda yopgan alert muammo davom etayotgan paytda qayta ochilmaydi.
 *
 * Chegaralar `settings` jadvalida (`alerts.settings`) saqlanadi va rahbar tomonidan o‘zgartiriladi.
 */

export const ALERT_SETTINGS_KEY = 'alerts.settings';

/** Konversiya solishtirilishi uchun har davrda kamida shuncha yopilgan lead bo‘lsin */
const MIN_CLOSED_LEADS = 5;
const DAY_MS = 86_400_000;

export interface AlertSettings {
  rules: Record<AlertType, boolean>;
  debtSharePercent: number;
  debtGraceDays: number;
  dropoutAbsences: number;
  attendanceWarning: number;
  attendanceCritical: number;
  followUpWarning: number;
  followUpCritical: number;
  salaryGraceDays: number;
  capacityPercent: number;
  conversionDropPoints: number;
  dropoutIncreasePercent: number;
  dropoutIncreaseMin: number;
  expenseApprovalDays: number;
  /** Shartnoma/pasport muddati tugashidan necha kun oldin ogohlantirish */
  documentExpiryDays: number;
  digestEnabled: boolean;
  digestHour: number;
}

export interface AlertSettingsDto extends AlertSettings {
  updatedAt: string | null;
}

type NumericSetting = Exclude<keyof AlertSettings, 'rules' | 'digestEnabled'>;

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  rules: Object.fromEntries(ALERT_TYPES.map((type) => [type, true])) as Record<AlertType, boolean>,
  debtSharePercent: 50,
  debtGraceDays: 30,
  dropoutAbsences: 3,
  attendanceWarning: 70,
  attendanceCritical: 60,
  followUpWarning: 5,
  followUpCritical: 15,
  salaryGraceDays: 10,
  capacityPercent: 50,
  conversionDropPoints: 15,
  dropoutIncreasePercent: 50,
  dropoutIncreaseMin: 3,
  expenseApprovalDays: 3,
  documentExpiryDays: 30,
  digestEnabled: true,
  digestHour: 8,
};

const NUMERIC_SETTINGS = Object.keys(DEFAULT_ALERT_SETTINGS).filter(
  (key) => key !== 'rules' && key !== 'digestEnabled',
) as NumericSetting[];

/** Holatga bog‘liq alertlar (holat to‘g‘rilansa avtomatik yopiladi) */
const CONDITION_TYPES: readonly AlertType[] = [
  'HIGH_DEBT',
  'LOW_ATTENDANCE',
  'HIGH_DROPOUT',
  'OVERDUE_FOLLOWUPS',
  'UNPAID_SALARY',
  'BUDGET_EXCEEDED',
  'LOW_GROUP_CAPACITY',
  'CONVERSION_DROP',
  'DROPOUT_INCREASE',
  'CASH_SHORTAGE',
  'PENDING_EXPENSE_APPROVAL',
  'DOCUMENT_EXPIRING',
];

interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  dedupeKey: string;
  metadata?: Prisma.InputJsonValue;
  /** Yangi alert haqida shaxsan xabar beriladigan xodim (masalan, rejasini bajargan manager) */
  notifyUserId?: string;
}

export type AlertPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  /** Muhimlik: kritik — yuqori, ogohlantirish — o‘rta, ma’lumot va yutuq — past */
  priority: AlertPriority;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  /** Muammoni hal qilish uchun sahifa */
  link: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  readAt: string | null;
  readBy: { id: string; firstName: string; lastName: string } | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface AlertSummaryDto {
  open: number;
  /** Ochiq va hali o‘qilmagan */
  unread: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Array<{ type: AlertType; count: number }>;
}

export interface EvaluateResultDto {
  created: number;
  updated: number;
  resolved: number;
  open: number;
}

const alertSelect = {
  id: true,
  type: true,
  severity: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  readAt: true,
  readBy: { select: { id: true, firstName: true, lastName: true } },
  resolvedAt: true,
  resolvedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AlertSelect;

type AlertRecord = Prisma.AlertGetPayload<{ select: typeof alertSelect }>;

const SEVERITY_RANK: Record<AlertSeverity, number> = { INFO: 0, SUCCESS: 0, WARNING: 1, CRITICAL: 2 };
const PRIORITY: Record<AlertSeverity, AlertPriority> = { CRITICAL: 'HIGH', WARNING: 'MEDIUM', INFO: 'LOW', SUCCESS: 'LOW' };

function linkFor(entityType: string | null, entityId: string | null): string | null {
  switch (entityType) {
    case 'student':
      return entityId ? `/students/${entityId}` : '/students';
    case 'students':
      return '/students';
    case 'group':
      return '/groups';
    case 'salaryPeriod':
      return '/salaries';
    case 'budget':
    case 'finance':
      return '/finance';
    case 'expenses':
      return '/expenses';
    case 'followUps':
      return '/follow-ups';
    case 'target':
      return '/targets';
    case 'analytics':
      return '/analytics';
    case 'teacher':
      return '/teachers';
    case 'employee':
      return '/employees';
    default:
      return null;
  }
}

function toDto(alert: AlertRecord): AlertDto {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    priority: PRIORITY[alert.severity],
    title: alert.title,
    message: alert.message,
    entityType: alert.entityType,
    entityId: alert.entityId,
    link: linkFor(alert.entityType, alert.entityId),
    metadata: alert.metadata,
    createdAt: alert.createdAt.toISOString(),
    readAt: alert.readAt?.toISOString() ?? null,
    readBy: alert.readBy,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedBy: alert.resolvedBy,
  };
}

/** JSONB kalitlar tartibini o'zgartiradi — solishtirish uchun kalitlar saralanadi */
function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function money(value: number): string {
  return `${value.toLocaleString('uz-UZ')} so‘m`;
}

// ---------------------------------------------------------------------
// Sozlamalar
// ---------------------------------------------------------------------

/** Saqlangan qiymatlar standart qiymatlar ustiga qo‘yiladi; noto‘g‘ri turdagi qiymat e’tiborga olinmaydi */
function mergeSettings(stored: unknown): AlertSettings {
  const value = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const merged: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, rules: { ...DEFAULT_ALERT_SETTINGS.rules } };
  for (const key of NUMERIC_SETTINGS) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) merged[key] = value[key] as number;
  }
  if (typeof value.digestEnabled === 'boolean') merged.digestEnabled = value.digestEnabled;
  const rules = value.rules && typeof value.rules === 'object' ? (value.rules as Record<string, unknown>) : {};
  for (const type of ALERT_TYPES) {
    if (typeof rules[type] === 'boolean') merged.rules[type] = rules[type] as boolean;
  }
  return merged;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const setting = await prisma.setting.findUnique({ where: { key: ALERT_SETTINGS_KEY }, select: { value: true } });
  return mergeSettings(setting?.value);
}

// ---------------------------------------------------------------------
// Qoidalar
// ---------------------------------------------------------------------

type Rule = (now: Date, settings: AlertSettings) => Promise<AlertCandidate[]>;

/** Joriy oy bugungacha va o‘tgan oyning xuddi shu nuqtasigacha */
function monthToDateWindows(now: Date) {
  const start = startOfBusinessMonth(now);
  const end = addDays(startOfBusinessDay(now), 1);
  const previousStart = startOfBusinessMonth(now, 1);
  const previousEnd = new Date(Math.min(previousStart.getTime() + (end.getTime() - start.getTime()), start.getTime()));
  return { current: { gte: start, lt: end }, previous: { gte: previousStart, lt: previousEnd } };
}

const highDebtRule: Rule = async (now, settings) => {
  const share = settings.debtSharePercent / 100;
  const debts = await prisma.debt.findMany({
    where: {
      remainingAmount: { gt: 0 },
      student: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] }, startDate: { lte: addDays(now, -settings.debtGraceDays) } },
    },
    select: {
      totalAmount: true,
      remainingAmount: true,
      paidAmount: true,
      student: { select: { id: true, number: true, firstName: true, lastName: true } },
    },
  });

  return debts.flatMap((debt) => {
    const total = debt.totalAmount.toNumber();
    const remaining = debt.remainingAmount.toNumber();
    if (total <= 0 || remaining / total < share) return [];
    const nothingPaid = debt.paidAmount.toNumber() <= 0;
    const name = `${debt.student.firstName} ${debt.student.lastName}`;
    return [
      {
        type: 'HIGH_DEBT' as const,
        severity: nothingPaid ? ('CRITICAL' as const) : ('WARNING' as const),
        title: `Katta qarz: ${name}`,
        message: `${formatStudentNumber(debt.student.number)} — qolgan qarz ${money(remaining)} (shartnomaning ${Math.round((remaining / total) * 100)}%)${nothingPaid ? ', hali bitta ham to‘lov qilinmagan' : ''}.`,
        entityType: 'student',
        entityId: debt.student.id,
        dedupeKey: `high-debt:${debt.student.id}`,
        metadata: { remaining, total },
      },
    ];
  });
};

const dropoutRule: Rule = async (now, settings) => {
  // Har bir faol o'quvchining oxirgi N ta belgisi (window funksiya) — hammasi ABSENT bo'lsa xavf
  const since = addDays(now, -60);
  const absences = settings.dropoutAbsences;
  const risky = await prisma.$queryRaw<Array<{ studentId: string }>>`
    SELECT "studentId"
    FROM (
      SELECT a."studentId", a."status",
             ROW_NUMBER() OVER (PARTITION BY a."studentId" ORDER BY a."date" DESC) AS rn
      FROM "attendances" a
      JOIN "students" s ON s."id" = a."studentId"
      WHERE a."date" >= ${since} AND s."deletedAt" IS NULL AND s."status" = 'ACTIVE'
    ) latest
    WHERE rn <= ${absences}
    GROUP BY "studentId"
    HAVING COUNT(*) = ${absences} AND BOOL_AND("status" = 'ABSENT')
  `;
  if (risky.length === 0) return [];

  const students = await prisma.student.findMany({
    where: { id: { in: risky.map((row) => row.studentId) } },
    select: { id: true, number: true, firstName: true, lastName: true, group: { select: { name: true } } },
  });

  return students.map((student) => ({
    type: 'HIGH_DROPOUT' as const,
    severity: 'CRITICAL' as const,
    title: `Chiqib ketish xavfi: ${student.firstName} ${student.lastName}`,
    message: `${formatStudentNumber(student.number)}${student.group ? ` (${student.group.name})` : ''} oxirgi ${absences} ta darsga sababsiz kelmadi. O‘quvchi yoki ota-onasi bilan bog‘laning.`,
    entityType: 'student',
    entityId: student.id,
    dedupeKey: `dropout:${student.id}`,
  }));
};

const ATTENDANCE_WINDOW_DAYS = 14;
const ATTENDANCE_MIN_MARKS = 5;

const lowAttendanceRule: Rule = async (now, settings) => {
  const grouped = await prisma.attendance.groupBy({
    by: ['groupId', 'status'],
    where: { date: { gte: addDays(now, -ATTENDANCE_WINDOW_DAYS) }, group: { status: 'ACTIVE' } },
    _count: { _all: true },
  });

  const stats = new Map<string, { total: number; attended: number }>();
  for (const row of grouped) {
    const current = stats.get(row.groupId) ?? { total: 0, attended: 0 };
    current.total += row._count._all;
    if (row.status === 'PRESENT' || row.status === 'LATE') current.attended += row._count._all;
    stats.set(row.groupId, current);
  }

  const lowIds = [...stats.entries()]
    .filter(([, value]) => value.total >= ATTENDANCE_MIN_MARKS && (value.attended / value.total) * 100 < settings.attendanceWarning)
    .map(([groupId]) => groupId);
  if (lowIds.length === 0) return [];

  const groups = await prisma.group.findMany({ where: { id: { in: lowIds } }, select: { id: true, name: true } });
  return groups.map((group) => {
    const value = stats.get(group.id)!;
    const rate = Math.round((value.attended / value.total) * 100);
    return {
      type: 'LOW_ATTENDANCE' as const,
      severity: rate < settings.attendanceCritical ? ('CRITICAL' as const) : ('WARNING' as const),
      title: `Past davomat: ${group.name}`,
      message: `Oxirgi ${ATTENDANCE_WINDOW_DAYS} kunda davomat ${rate}% (${value.total} ta belgi), me’yor — ${settings.attendanceWarning}%.`,
      entityType: 'group',
      entityId: group.id,
      dedupeKey: `low-attendance:${group.id}`,
      metadata: { rate, marks: value.total },
    };
  });
};

const overdueFollowUpsRule: Rule = async (now, settings) => {
  const grouped = await prisma.followUp.groupBy({
    by: ['assignedToId'],
    where: { status: 'PENDING', dueAt: { lt: now }, assignedToId: { not: null } },
    _count: { _all: true },
  });
  const heavy = grouped.filter((row) => row.assignedToId && row._count._all >= settings.followUpWarning);
  if (heavy.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: heavy.map((row) => row.assignedToId!) }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  return users.map((user) => {
    const count = heavy.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
    return {
      type: 'OVERDUE_FOLLOWUPS' as const,
      severity: count >= settings.followUpCritical ? ('CRITICAL' as const) : ('WARNING' as const),
      title: `Kechikkan follow-up: ${user.firstName} ${user.lastName}`,
      message: `${count} ta follow-up muddati o‘tgan va bajarilmagan.`,
      entityType: 'followUps',
      entityId: user.id,
      dedupeKey: `overdue-followups:${user.id}`,
      metadata: { count },
    };
  });
};

const unpaidSalaryRule: Rule = async (now, settings) => {
  const periods = await prisma.teacherSalaryPeriod.findMany({
    where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] }, remainingAmount: { gt: 0 } },
    select: {
      id: true,
      year: true,
      month: true,
      remainingAmount: true,
      teacherProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  return periods.flatMap((period) => {
    const due = addDays(businessMonthRange(period.year, period.month).end, settings.salaryGraceDays);
    if (now < due) return [];
    const overdueDays = Math.floor((now.getTime() - due.getTime()) / DAY_MS);
    const person = period.teacherProfile?.user ?? period.employee;
    const name = person ? `${person.firstName} ${person.lastName}` : 'Noma’lum';
    return [
      {
        type: 'UNPAID_SALARY' as const,
        severity: overdueDays >= 20 ? ('CRITICAL' as const) : ('WARNING' as const),
        title: `To‘lanmagan maosh: ${name}`,
        message: `${formatSalaryPeriod(period.year, period.month)} maoshidan ${money(period.remainingAmount.toNumber())} to‘lanmagan.`,
        entityType: 'salaryPeriod',
        entityId: period.id,
        dedupeKey: `unpaid-salary:${period.id}`,
        metadata: { remaining: period.remainingAmount.toNumber() },
      },
    ];
  });
};

const budgetRule: Rule = async (now) => {
  const { year, month } = currentBusinessMonth(now);
  const lines = await prisma.budgetLine.findMany({
    where: { budget: { year, month }, plannedAmount: { gt: 0 } },
    select: { categoryId: true, plannedAmount: true, category: { select: { name: true } } },
  });
  if (lines.length === 0) return [];

  const { start, end } = businessMonthRange(year, month);
  const actuals = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: { spentAt: { gte: start, lt: end }, transaction: { status: 'COMPLETED' }, categoryId: { in: lines.map((line) => line.categoryId) } },
    _sum: { amount: true },
  });

  return lines.flatMap((line) => {
    const planned = line.plannedAmount.toNumber();
    const actual = actuals.find((row) => row.categoryId === line.categoryId)?._sum.amount?.toNumber() ?? 0;
    if (actual <= planned) return [];
    const usage = Math.round((actual / planned) * 100);
    return [
      {
        type: 'BUDGET_EXCEEDED' as const,
        severity: usage >= 120 ? ('CRITICAL' as const) : ('WARNING' as const),
        title: `Budjetdan oshdi: ${line.category.name}`,
        message: `${formatSalaryPeriod(year, month)}: reja ${money(planned)}, sarflangan ${money(actual)} (${usage}%).`,
        entityType: 'budget',
        entityId: line.categoryId,
        dedupeKey: `budget-exceeded:${year}-${month}:${line.categoryId}`,
        metadata: { planned, actual, usage },
      },
    ];
  });
};

const CAPACITY_GRACE_DAYS = 14;

const lowCapacityRule: Rule = async (now, settings) => {
  const groups = await prisma.group.findMany({
    where: { status: 'ACTIVE', startDate: { lte: addDays(now, -CAPACITY_GRACE_DAYS) } },
    select: {
      id: true,
      name: true,
      capacity: true,
      _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } },
    },
  });

  return groups.flatMap((group) => {
    if (group.capacity <= 0 || (group._count.students / group.capacity) * 100 >= settings.capacityPercent) return [];
    return [
      {
        type: 'LOW_GROUP_CAPACITY' as const,
        severity: 'INFO' as const,
        title: `Guruh to‘lmagan: ${group.name}`,
        message: `${group._count.students} / ${group.capacity} o‘rin band — sotuv bo‘limi bu guruhga o‘quvchi yo‘naltirishi mumkin.`,
        entityType: 'group',
        entityId: group.id,
        dedupeKey: `low-capacity:${group.id}`,
        metadata: { students: group._count.students, capacity: group.capacity },
      },
    ];
  });
};

const TARGET_TITLES = { LEADS: 'leadlar', SALES: 'sotuvlar', REVENUE: 'tushum' } as const;

const targetAchievedRule: Rule = async (now) => {
  const { year, month } = currentBusinessMonth(now);
  const rows = await computeTargetProgress(year, month);

  return rows.flatMap((row) =>
    (['LEADS', 'SALES', 'REVENUE'] as const).flatMap((type) => {
      const cell = row.targets[type];
      if (!cell.id || cell.target <= 0 || cell.progress < 100) return [];
      return [
        {
          type: 'SALES_TARGET_ACHIEVED' as const,
          severity: 'SUCCESS' as const,
          title: `Reja bajarildi: ${row.firstName} ${row.lastName}`,
          message: `${formatSalaryPeriod(year, month)} ${TARGET_TITLES[type]} rejasi ${cell.progress}% bajarildi.`,
          entityType: 'target',
          entityId: cell.id,
          dedupeKey: `target-achieved:${cell.id}`,
          metadata: { type, target: cell.target, actual: cell.actual },
          notifyUserId: row.userId,
        },
      ];
    }),
  );
};

/** Joriy oyda sotuv konversiyasi o‘tgan oyning shu davriga nisbatan tushib ketdi */
const conversionDropRule: Rule = async (now, settings) => {
  const { current, previous } = monthToDateWindows(now);
  const won = (range: { gte: Date; lt: Date }) => prisma.lead.count({ where: { deletedAt: null, status: 'WON', convertedAt: range } });
  const lost = (range: { gte: Date; lt: Date }) => prisma.lead.count({ where: { deletedAt: null, status: 'LOST', updatedAt: range } });
  const wonNow = await won(current);
  const lostNow = await lost(current);
  const wonBefore = await won(previous);
  const lostBefore = await lost(previous);
  const closedNow = wonNow + lostNow;
  const closedBefore = wonBefore + lostBefore;
  if (closedNow < MIN_CLOSED_LEADS || closedBefore < MIN_CLOSED_LEADS) return [];

  const rateNow = Math.round((wonNow / closedNow) * 100);
  const rateBefore = Math.round((wonBefore / closedBefore) * 100);
  const drop = rateBefore - rateNow;
  if (drop < settings.conversionDropPoints) return [];

  const { year, month } = currentBusinessMonth(now);
  return [
    {
      type: 'CONVERSION_DROP',
      severity: drop >= settings.conversionDropPoints * 2 ? 'CRITICAL' : 'WARNING',
      title: 'Sotuv konversiyasi tushdi',
      message: `Joriy oyda konversiya ${rateNow}% (${wonNow} / ${closedNow}), o‘tgan oyning shu davrida ${rateBefore}% edi — ${drop} punkt past.`,
      entityType: 'analytics',
      entityId: null,
      dedupeKey: `conversion-drop:${year}-${month}`,
      metadata: { rateNow, rateBefore, drop },
    },
  ];
};

/** Joriy oyda ketgan o‘quvchilar o‘tgan oyning shu davriga nisbatan ko‘paydi */
const dropoutIncreaseRule: Rule = async (now, settings) => {
  const { current, previous } = monthToDateWindows(now);
  const dropped = (range: { gte: Date; lt: Date }) =>
    prisma.student.count({ where: { deletedAt: null, status: 'DROPPED', statusChangedAt: range } });
  const droppedNow = await dropped(current);
  const droppedBefore = await dropped(previous);
  if (droppedNow < settings.dropoutIncreaseMin || droppedNow <= droppedBefore) return [];

  const increase = droppedBefore === 0 ? null : Math.round(((droppedNow - droppedBefore) / droppedBefore) * 100);
  if (increase !== null && increase < settings.dropoutIncreasePercent) return [];

  const { year, month } = currentBusinessMonth(now);
  const critical = droppedNow >= settings.dropoutIncreaseMin * 2 && (increase === null || increase >= settings.dropoutIncreasePercent * 2);
  return [
    {
      type: 'DROPOUT_INCREASE',
      severity: critical ? 'CRITICAL' : 'WARNING',
      title: 'Ketgan o‘quvchilar ko‘paydi',
      message: `Joriy oyda ${droppedNow} ta o‘quvchi ketdi, o‘tgan oyning shu davrida ${droppedBefore} ta${increase === null ? '' : ` (+${increase}%)`}.`,
      entityType: 'students',
      entityId: null,
      dedupeKey: `dropout-increase:${year}-${month}`,
      metadata: { droppedNow, droppedBefore, increase },
    },
  ];
};

/** 30 kunlik prognozda majburiyatlarga mablag‘ yetmaydi */
const cashShortageRule: Rule = async () => {
  const accounts = await prisma.financialAccount.count({ where: { isActive: true } });
  if (accounts === 0) return [];
  const { forecast } = await financeService.cashFlowStatement({});
  if (forecast.projectedBalance >= 0) return [];

  const obligations = forecast.upcomingExpenses + forecast.unpaidSalaries;
  return [
    {
      type: 'CASH_SHORTAGE',
      severity: 'CRITICAL',
      title: 'Kassada mablag‘ yetishmasligi kutilmoqda',
      message: `Keyingi ${forecast.days} kunda to‘lanishi kerak: ${money(obligations)}, kassalarda ${money(forecast.currentBalance)} — ${money(-forecast.projectedBalance)} yetishmaydi.`,
      entityType: 'finance',
      entityId: null,
      dedupeKey: 'cash-shortage',
      metadata: { currentBalance: forecast.currentBalance, obligations, shortage: -forecast.projectedBalance },
    },
  ];
};

/** Tasdiq kutayotgan xarajatlar uzoq kutib qoldi */
const pendingApprovalRule: Rule = async (now, settings) => {
  const pending = await prisma.expense.findMany({
    where: { status: 'PENDING', createdAt: { lt: addDays(now, -settings.expenseApprovalDays) } },
    select: { amount: true, createdAt: true },
  });
  if (pending.length === 0) return [];

  const total = pending.reduce((sum, expense) => sum + expense.amount.toNumber(), 0);
  const oldest = Math.min(...pending.map((expense) => expense.createdAt.getTime()));
  const oldestDays = Math.floor((now.getTime() - oldest) / DAY_MS);
  return [
    {
      type: 'PENDING_EXPENSE_APPROVAL',
      severity: oldestDays >= settings.expenseApprovalDays * 3 ? 'CRITICAL' : 'WARNING',
      title: 'Tasdiq kutayotgan xarajatlar',
      message: `${pending.length} ta xarajat (${money(total)}) ${settings.expenseApprovalDays} kundan ortiq tasdiq kutmoqda, eng eskisi — ${oldestDays} kun.`,
      entityType: 'expenses',
      entityId: null,
      dedupeKey: 'pending-expense-approval',
      metadata: { count: pending.length, total, oldestDays },
    },
  ];
};

const DOCUMENT_CATEGORY_TITLES = { CONTRACT: 'Shartnoma', PASSPORT: 'Pasport', CERTIFICATE: 'Sertifikat', RECEIPT: 'Chek', OTHER: 'Hujjat' } as const;

/** O‘qituvchi yoki xodim hujjati (shartnoma, pasport) muddati tugayapti yoki o‘tib ketgan */
const documentExpiringRule: Rule = async (now, settings) => {
  const today = new Date(`${businessDateString(now)}T00:00:00.000Z`);
  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      expiresAt: { not: null, lte: addDays(today, settings.documentExpiryDays) },
      OR: [
        { teacherProfile: { employmentStatus: { not: 'RESIGNED' } } },
        { employee: { status: { not: 'RESIGNED' } } },
      ],
    },
    select: {
      id: true,
      category: true,
      title: true,
      originalName: true,
      expiresAt: true,
      teacherProfile: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return documents.flatMap((document) => {
    const person = document.teacherProfile?.user ?? document.employee;
    const ownerId = document.teacherProfile?.id ?? document.employee?.id;
    if (!person || !ownerId || !document.expiresAt) return [];
    const daysLeft = Math.round((document.expiresAt.getTime() - today.getTime()) / DAY_MS);
    const date = document.expiresAt.toISOString().slice(0, 10);
    const when = daysLeft < 0 ? `${-daysLeft} kun oldin tugagan` : daysLeft === 0 ? 'bugun tugaydi' : `${daysLeft} kundan keyin tugaydi`;
    const kind = DOCUMENT_CATEGORY_TITLES[document.category];
    return [
      {
        type: 'DOCUMENT_EXPIRING' as const,
        severity: daysLeft < 0 ? ('CRITICAL' as const) : ('WARNING' as const),
        title: `${kind} muddati ${daysLeft < 0 ? 'o‘tgan' : 'tugamoqda'}: ${person.firstName} ${person.lastName}`,
        message: `${document.title ?? document.originalName} — ${when} (${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}).`,
        entityType: document.teacherProfile ? 'teacher' : 'employee',
        entityId: ownerId,
        dedupeKey: `document-expiring:${document.id}`,
        metadata: { document: document.id, daysLeft, expiresAt: date },
      },
    ];
  });
};

const RULES: ReadonlyArray<[AlertType, Rule]> = [
  ['HIGH_DEBT', highDebtRule],
  ['HIGH_DROPOUT', dropoutRule],
  ['LOW_ATTENDANCE', lowAttendanceRule],
  ['OVERDUE_FOLLOWUPS', overdueFollowUpsRule],
  ['UNPAID_SALARY', unpaidSalaryRule],
  ['BUDGET_EXCEEDED', budgetRule],
  ['LOW_GROUP_CAPACITY', lowCapacityRule],
  ['SALES_TARGET_ACHIEVED', targetAchievedRule],
  ['CONVERSION_DROP', conversionDropRule],
  ['DROPOUT_INCREASE', dropoutIncreaseRule],
  ['CASH_SHORTAGE', cashShortageRule],
  ['PENDING_EXPENSE_APPROVAL', pendingApprovalRule],
  ['DOCUMENT_EXPIRING', documentExpiringRule],
];

/** Kritik alert — alert.view ruxsati bor xodimlarga; reja bajarilgani — managerning o‘ziga */
async function notifyAlert(alertId: string, candidate: AlertCandidate): Promise<void> {
  const recipients: string[] = [];
  if (candidate.severity === 'CRITICAL') {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        role: { permissions: { some: { permission: { key: PERMISSIONS.ALERT_VIEW } } } },
      },
      select: { id: true },
    });
    recipients.push(...users.map((user) => user.id));
  }
  if (candidate.notifyUserId) recipients.push(candidate.notifyUserId);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: [...new Set(recipients)].map((userId) => ({
      userId,
      type: 'SYSTEM' as const,
      title: candidate.title,
      message: candidate.message,
      entityType: 'alert',
      entityId: alertId,
      dedupeKey: `alert:${alertId}:${userId}`,
    })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const alertService = {
  /** Yoqilgan qoidalarni tekshiradi (job har 30 daqiqada chaqiradi) */
  async evaluate(now: Date = new Date()): Promise<EvaluateResultDto> {
    const settings = await getAlertSettings();
    const enabled = RULES.filter(([type]) => settings.rules[type]);
    const candidates = (await Promise.all(enabled.map(([, rule]) => rule(now, settings)))).flat();
    const byKey = new Map(candidates.map((candidate) => [candidate.dedupeKey, candidate]));

    const existing = await prisma.alert.findMany({
      where: { dedupeKey: { in: [...byKey.keys()] } },
      select: { id: true, dedupeKey: true, resolvedAt: true, severity: true, title: true, message: true, metadata: true },
    });
    const existingByKey = new Map(existing.map((alert) => [alert.dedupeKey, alert]));

    let created = 0;
    let updated = 0;
    for (const candidate of byKey.values()) {
      const current = existingByKey.get(candidate.dedupeKey);
      const content = {
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        ...(candidate.metadata === undefined ? {} : { metadata: candidate.metadata }),
      };

      if (!current) {
        const alert = await prisma.alert.create({
          data: {
            type: candidate.type,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            dedupeKey: candidate.dedupeKey,
            ...content,
          },
          select: { id: true },
        });
        created += 1;
        await notifyAlert(alert.id, candidate);
      } else if (!current.resolvedAt) {
        // Matn yoki raqamlar o'zgarmagan bo'lsa — yozuv qilinmaydi (har 30 daqiqada yuzlab UPDATE bo'lmasin)
        const changed =
          current.severity !== content.severity ||
          current.title !== content.title ||
          current.message !== content.message ||
          stableJson(current.metadata) !== stableJson(candidate.metadata ?? null);
        if (changed) {
          // Daraja oshsa — qayta "o'qilmagan" va kritikka chiqqan bo'lsa xodimlarga xabar
          const escalated = SEVERITY_RANK[content.severity] > SEVERITY_RANK[current.severity];
          await prisma.alert.update({
            where: { id: current.id },
            data: { ...content, ...(escalated ? { readAt: null, readById: null } : {}) },
          });
          if (escalated) await notifyAlert(current.id, candidate);
          updated += 1;
        }
      }
      // Qo'lda yopilgan va muammo davom etayotgan alert — qayta ochilmaydi
    }

    // Holati to'g'rilangan yoki qoidasi o'chirilgan alertlar: ochiqlari yopiladi, kalitlar arxivlanadi
    const stale = await prisma.alert.findMany({
      where: { type: { in: [...CONDITION_TYPES] }, dedupeKey: { not: null }, NOT: { dedupeKey: { contains: '#' } } },
      select: { id: true, dedupeKey: true, resolvedAt: true },
    });
    let resolved = 0;
    for (const alert of stale) {
      if (!alert.dedupeKey || byKey.has(alert.dedupeKey)) continue;
      await prisma.alert.update({
        where: { id: alert.id },
        data: { dedupeKey: `${alert.dedupeKey}#${now.getTime()}`, ...(alert.resolvedAt ? {} : { resolvedAt: now }) },
      });
      if (!alert.resolvedAt) resolved += 1;
    }

    const open = await prisma.alert.count({ where: { resolvedAt: null } });
    return { created, updated, resolved, open };
  },

  async list(query: AlertListQuery): Promise<{ items: AlertDto[]; total: number }> {
    const statusWhere: Prisma.AlertWhereInput =
      query.status === 'open'
        ? { resolvedAt: null }
        : query.status === 'unread'
          ? { resolvedAt: null, readAt: null }
          : query.status === 'resolved'
            ? { resolvedAt: { not: null } }
            : {};
    const where: Prisma.AlertWhereInput = {
      ...statusWhere,
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { message: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await prisma.alert.findMany({
      where,
      select: alertSelect,
      orderBy: [{ severity: 'desc' }, { createdAt: query.sortOrder }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.alert.count({ where });
    return { items: items.map(toDto), total };
  },

  async summary(): Promise<AlertSummaryDto> {
    const grouped = await prisma.alert.groupBy({
      by: ['severity', 'type'],
      where: { resolvedAt: null },
      _count: { _all: true },
    });
    const bySeverity: Record<AlertSeverity, number> = { INFO: 0, SUCCESS: 0, WARNING: 0, CRITICAL: 0 };
    const byType = new Map<AlertType, number>();
    for (const row of grouped) {
      bySeverity[row.severity] += row._count._all;
      byType.set(row.type, (byType.get(row.type) ?? 0) + row._count._all);
    }
    return {
      open: grouped.reduce((sum, row) => sum + row._count._all, 0),
      unread: await prisma.alert.count({ where: { resolvedAt: null, readAt: null } }),
      bySeverity,
      byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    };
  },

  /** "O‘qildi" — takroriy chaqiruv o‘zgartirmaydi */
  async markRead(actor: AuthUser, id: string): Promise<AlertDto> {
    const alert = await prisma.alert.findUnique({ where: { id }, select: { readAt: true } });
    if (!alert) {
      throw AppError.notFound('Ogohlantirish topilmadi');
    }
    const record = alert.readAt
      ? await prisma.alert.findUniqueOrThrow({ where: { id }, select: alertSelect })
      : await prisma.alert.update({ where: { id }, data: { readAt: new Date(), readById: actor.id }, select: alertSelect });
    return toDto(record);
  },

  async markAllRead(actor: AuthUser): Promise<{ updated: number }> {
    const result = await prisma.alert.updateMany({
      where: { resolvedAt: null, readAt: null },
      data: { readAt: new Date(), readById: actor.id },
    });
    return { updated: result.count };
  },

  /** Qo‘lda yopish (dismiss) — muammo davom etsa ham qayta ochilmaydi, to‘g‘rilangach arxivlanadi */
  async resolve(actor: AuthUser, id: string, input: ResolveAlertInput, client: ClientInfo): Promise<AlertDto> {
    const alert = await prisma.alert.findUnique({ where: { id }, select: { id: true, title: true, resolvedAt: true, readAt: true, metadata: true } });
    if (!alert) {
      throw AppError.notFound('Ogohlantirish topilmadi');
    }
    if (alert.resolvedAt) {
      throw AppError.conflict('Bu ogohlantirish allaqachon yopilgan');
    }

    const metadata =
      alert.metadata && typeof alert.metadata === 'object' && !Array.isArray(alert.metadata) ? alert.metadata : {};
    const now = new Date();
    const updated = await prisma.alert.update({
      where: { id },
      data: {
        resolvedAt: now,
        resolvedById: actor.id,
        ...(alert.readAt ? {} : { readAt: now, readById: actor.id }),
        ...(input.note ? { metadata: { ...metadata, resolutionNote: input.note } } : {}),
      },
      select: alertSelect,
    });
    await auditService.record({
      userId: actor.id,
      action: 'alert.resolved',
      entityType: 'alert',
      entityId: id,
      metadata: { title: alert.title, note: input.note ?? null },
      ...client,
    });
    return toDto(updated);
  },

  async settings(): Promise<AlertSettingsDto> {
    const setting = await prisma.setting.findUnique({ where: { key: ALERT_SETTINGS_KEY }, select: { value: true, updatedAt: true } });
    return { ...mergeSettings(setting?.value), updatedAt: setting?.updatedAt.toISOString() ?? null };
  },

  async updateSettings(actor: AuthUser, input: AlertSettingsInput, client: ClientInfo): Promise<AlertSettingsDto> {
    const current = await getAlertSettings();
    const { rules, ...values } = input;
    const next: AlertSettings = {
      ...current,
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
      rules: { ...current.rules, ...Object.fromEntries(Object.entries(rules ?? {}).filter(([, value]) => value !== undefined)) },
    };

    const errors: Array<{ field: string; message: string }> = [];
    if (next.attendanceCritical >= next.attendanceWarning) {
      errors.push({ field: 'attendanceCritical', message: 'Kritik chegara past davomat chegarasidan kichik bo‘lsin' });
    }
    if (next.followUpCritical <= next.followUpWarning) {
      errors.push({ field: 'followUpCritical', message: 'Kritik chegara ogohlantirish chegarasidan katta bo‘lsin' });
    }
    if (errors.length > 0) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', errors);
    }

    const changed = [
      ...NUMERIC_SETTINGS.filter((key) => next[key] !== current[key]),
      ...(next.digestEnabled !== current.digestEnabled ? ['digestEnabled'] : []),
      ...ALERT_TYPES.filter((type) => next.rules[type] !== current.rules[type]).map((type) => `rules.${type}`),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: ALERT_SETTINGS_KEY },
        create: {
          key: ALERT_SETTINGS_KEY,
          value: next as unknown as Prisma.InputJsonValue,
          description: 'Ogohlantirish qoidalari, chegaralari va kunlik xulosa',
          updatedById: actor.id,
        },
        update: { value: next as unknown as Prisma.InputJsonValue, updatedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'alert.settings_updated',
        entityType: 'setting',
        entityId: ALERT_SETTINGS_KEY,
        metadata: { changed },
        ...client,
      });
    });

    return this.settings();
  },
};
