import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AlertSeverity, AlertType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { AlertListQuery, ResolveAlertInput } from '../validators/alert.validator.js';
import { auditService } from './audit.service.js';
import { computeTargetProgress } from './target.service.js';

/**
 * Avtomatik ogohlantirishlar (promt.md 13-bosqich).
 *
 * Har bir qoida hozirgi holatdan "nomzod" alertlar ro‘yxatini tuzadi. `dedupeKey` bir
 * obyektga bitta alert bo‘lishini ta’minlaydi:
 * - nomzod yangi bo‘lsa — alert yaratiladi (kritik bo‘lsa xodimlarga bildirishnoma);
 * - ochiq alert bo‘lsa — matni yangilanadi;
 * - holat to‘g‘rilangan bo‘lsa — alert avtomatik yopiladi va kaliti arxivlanadi, shunda
 *   muammo keyinroq qaytsa yangi alert ochiladi;
 * - xodim qo‘lda yopgan alert muammo davom etayotgan paytda qayta ochilmaydi.
 */

// --- Chegaralar ---
const DEBT_SHARE = 0.5; // qarz shartnomaning kamida yarmi
const DEBT_GRACE_DAYS = 30; // o‘qish boshlanganiga kamida shuncha kun o‘tgan
const DROPOUT_ABSENCES = 3; // ketma-ket sababsiz qoldirilgan darslar
const ATTENDANCE_WINDOW_DAYS = 14;
const ATTENDANCE_MIN_MARKS = 5;
const ATTENDANCE_WARNING = 75;
const ATTENDANCE_CRITICAL = 60;
const FOLLOWUP_WARNING = 5;
const FOLLOWUP_CRITICAL = 15;
const SALARY_GRACE_DAYS = 10; // oy tugaganidan keyin
const CAPACITY_SHARE = 0.5;
const CAPACITY_GRACE_DAYS = 14;

/** Holatga bog‘liq alertlar (holat to‘g‘rilansa avtomatik yopiladi) */
const CONDITION_TYPES: readonly AlertType[] = [
  'HIGH_DEBT',
  'LOW_ATTENDANCE',
  'HIGH_DROPOUT',
  'OVERDUE_FOLLOWUPS',
  'UNPAID_SALARY',
  'BUDGET_EXCEEDED',
  'LOW_GROUP_CAPACITY',
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

export interface AlertDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  /** Muammoni hal qilish uchun sahifa */
  link: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface AlertSummaryDto {
  open: number;
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
  resolvedAt: true,
  resolvedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AlertSelect;

type AlertRecord = Prisma.AlertGetPayload<{ select: typeof alertSelect }>;

function linkFor(entityType: string | null, entityId: string | null): string | null {
  switch (entityType) {
    case 'student':
      return entityId ? `/students/${entityId}` : '/students';
    case 'group':
      return '/groups';
    case 'salaryPeriod':
      return '/salaries';
    case 'budget':
      return '/finance';
    case 'followUps':
      return '/follow-ups';
    case 'target':
      return '/targets';
    default:
      return null;
  }
}

function toDto(alert: AlertRecord): AlertDto {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    entityType: alert.entityType,
    entityId: alert.entityId,
    link: linkFor(alert.entityType, alert.entityId),
    metadata: alert.metadata,
    createdAt: alert.createdAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedBy: alert.resolvedBy,
  };
}

function money(value: number): string {
  return `${value.toLocaleString('uz-UZ')} so‘m`;
}

// ---------------------------------------------------------------------
// Qoidalar
// ---------------------------------------------------------------------

async function highDebtRule(now: Date): Promise<AlertCandidate[]> {
  const debts = await prisma.debt.findMany({
    where: {
      remainingAmount: { gt: 0 },
      student: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] }, startDate: { lte: addDays(now, -DEBT_GRACE_DAYS) } },
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
    if (total <= 0 || remaining / total < DEBT_SHARE) return [];
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
}

async function dropoutRule(now: Date): Promise<AlertCandidate[]> {
  const marks = await prisma.attendance.findMany({
    where: { date: { gte: addDays(now, -60) }, student: { deletedAt: null, status: 'ACTIVE' } },
    select: {
      status: true,
      studentId: true,
      student: { select: { number: true, firstName: true, lastName: true } },
      group: { select: { name: true } },
    },
    orderBy: [{ date: 'desc' }],
  });

  const latest = new Map<string, typeof marks>();
  for (const mark of marks) {
    const list = latest.get(mark.studentId) ?? [];
    if (list.length < DROPOUT_ABSENCES) {
      list.push(mark);
      latest.set(mark.studentId, list);
    }
  }

  return [...latest.entries()].flatMap(([studentId, list]) => {
    if (list.length < DROPOUT_ABSENCES || !list.every((mark) => mark.status === 'ABSENT')) return [];
    const first = list[0]!;
    const name = `${first.student.firstName} ${first.student.lastName}`;
    return [
      {
        type: 'HIGH_DROPOUT' as const,
        severity: 'CRITICAL' as const,
        title: `Chiqib ketish xavfi: ${name}`,
        message: `${formatStudentNumber(first.student.number)} (${first.group.name}) oxirgi ${DROPOUT_ABSENCES} ta darsga sababsiz kelmadi. O‘quvchi yoki ota-onasi bilan bog‘laning.`,
        entityType: 'student',
        entityId: studentId,
        dedupeKey: `dropout:${studentId}`,
      },
    ];
  });
}

async function lowAttendanceRule(now: Date): Promise<AlertCandidate[]> {
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
    .filter(([, value]) => value.total >= ATTENDANCE_MIN_MARKS && (value.attended / value.total) * 100 < ATTENDANCE_WARNING)
    .map(([groupId]) => groupId);
  if (lowIds.length === 0) return [];

  const groups = await prisma.group.findMany({ where: { id: { in: lowIds } }, select: { id: true, name: true } });
  return groups.map((group) => {
    const value = stats.get(group.id)!;
    const rate = Math.round((value.attended / value.total) * 100);
    return {
      type: 'LOW_ATTENDANCE' as const,
      severity: rate < ATTENDANCE_CRITICAL ? ('CRITICAL' as const) : ('WARNING' as const),
      title: `Past davomat: ${group.name}`,
      message: `Oxirgi ${ATTENDANCE_WINDOW_DAYS} kunda davomat ${rate}% (${value.total} ta belgi).`,
      entityType: 'group',
      entityId: group.id,
      dedupeKey: `low-attendance:${group.id}`,
      metadata: { rate, marks: value.total },
    };
  });
}

async function overdueFollowUpsRule(now: Date): Promise<AlertCandidate[]> {
  const grouped = await prisma.followUp.groupBy({
    by: ['assignedToId'],
    where: { status: 'PENDING', dueAt: { lt: now }, assignedToId: { not: null } },
    _count: { _all: true },
  });
  const heavy = grouped.filter((row) => row.assignedToId && row._count._all >= FOLLOWUP_WARNING);
  if (heavy.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: heavy.map((row) => row.assignedToId!) }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  return users.map((user) => {
    const count = heavy.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
    return {
      type: 'OVERDUE_FOLLOWUPS' as const,
      severity: count >= FOLLOWUP_CRITICAL ? ('CRITICAL' as const) : ('WARNING' as const),
      title: `Kechikkan follow-up: ${user.firstName} ${user.lastName}`,
      message: `${count} ta follow-up muddati o‘tgan va bajarilmagan.`,
      entityType: 'followUps',
      entityId: user.id,
      dedupeKey: `overdue-followups:${user.id}`,
      metadata: { count },
    };
  });
}

async function unpaidSalaryRule(now: Date): Promise<AlertCandidate[]> {
  const periods = await prisma.teacherSalaryPeriod.findMany({
    where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] }, remainingAmount: { gt: 0 } },
    select: {
      id: true,
      year: true,
      month: true,
      remainingAmount: true,
      teacherProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  return periods.flatMap((period) => {
    const due = addDays(businessMonthRange(period.year, period.month).end, SALARY_GRACE_DAYS);
    if (now < due) return [];
    const overdueDays = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    const name = `${period.teacherProfile.user.firstName} ${period.teacherProfile.user.lastName}`;
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
}

async function budgetRule(now: Date): Promise<AlertCandidate[]> {
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
}

async function lowCapacityRule(now: Date): Promise<AlertCandidate[]> {
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
    if (group.capacity <= 0 || group._count.students / group.capacity >= CAPACITY_SHARE) return [];
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
}

const TARGET_TITLES = { LEADS: 'leadlar', SALES: 'sotuvlar', REVENUE: 'tushum' } as const;

async function targetAchievedRule(now: Date): Promise<AlertCandidate[]> {
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
}

const RULES = [
  highDebtRule,
  dropoutRule,
  lowAttendanceRule,
  overdueFollowUpsRule,
  unpaidSalaryRule,
  budgetRule,
  lowCapacityRule,
  targetAchievedRule,
];

/** Yangi kritik alert — alert.view ruxsati bor xodimlarga; reja bajarilgani — managerning o‘ziga */
async function notifyNewAlert(alertId: string, candidate: AlertCandidate): Promise<void> {
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
  /** Barcha qoidalarni tekshiradi (job har 30 daqiqada chaqiradi) */
  async evaluate(now: Date = new Date()): Promise<EvaluateResultDto> {
    const candidates = (await Promise.all(RULES.map((rule) => rule(now)))).flat();
    const byKey = new Map(candidates.map((candidate) => [candidate.dedupeKey, candidate]));

    const existing = await prisma.alert.findMany({
      where: { dedupeKey: { in: [...byKey.keys()] } },
      select: { id: true, dedupeKey: true, resolvedAt: true, resolvedById: true },
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
        await notifyNewAlert(alert.id, candidate);
      } else if (!current.resolvedAt) {
        await prisma.alert.update({ where: { id: current.id }, data: content });
        updated += 1;
      }
      // Qo'lda yopilgan va muammo davom etayotgan alert — qayta ochilmaydi
    }

    // Holati to'g'rilangan alertlar: ochiqlari yopiladi, kalitlar arxivlanadi
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
    const where: Prisma.AlertWhereInput = {
      ...(query.status === 'open' ? { resolvedAt: null } : query.status === 'resolved' ? { resolvedAt: { not: null } } : {}),
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
      bySeverity,
      byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    };
  },

  /** Qo‘lda yopish — muammo davom etsa ham qayta ochilmaydi, to‘g‘rilangach arxivlanadi */
  async resolve(actor: AuthUser, id: string, input: ResolveAlertInput, client: ClientInfo): Promise<AlertDto> {
    const alert = await prisma.alert.findUnique({ where: { id }, select: { id: true, title: true, resolvedAt: true, metadata: true } });
    if (!alert) {
      throw AppError.notFound('Ogohlantirish topilmadi');
    }
    if (alert.resolvedAt) {
      throw AppError.conflict('Bu ogohlantirish allaqachon yopilgan');
    }

    const metadata =
      alert.metadata && typeof alert.metadata === 'object' && !Array.isArray(alert.metadata) ? alert.metadata : {};
    const updated = await prisma.alert.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedById: actor.id,
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
};
