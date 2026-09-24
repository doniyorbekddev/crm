import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import type { AutomationAudience, AutomationTrigger, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessDateString, startOfBusinessDay } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { moneyUz } from '../utils/money.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { scheduleDueStats } from './paymentSchedule.service.js';

/**
 * Avtomatlashtirish dvigateli: "shart bo'lsa — xabar bering".
 *
 * Tamoyillar:
 *  - **Takror xabar yo'q:** har bir bildirishnoma `dedupeKey` bilan yuboriladi (kalitda sana bor),
 *    shuning uchun qoida har 30 daqiqada ishlasa ham odam kuniga bir marta xabar oladi.
 *  - **Yangi kod emas, mavjud yo'l:** xabar mavjud `notificationService` orqali ketadi — demak
 *    Telegramga yetkazish navbati ham avtomatik ishlaydi.
 *  - **Har yurish yoziladi:** `AutomationRun` da nechta holat topilgani, nechta xabar ketgani va
 *    xatolik bo'lsa sababi qoladi — "nega xabar kelmadi?" degan savolga javob shu yerda.
 *  - **Sozlanadi:** qoidani o'chirib qo'yish yoki parametrini (masalan 2 marta emas, 3 marta)
 *    o'zgartirish mumkin; kod o'zgarmaydi.
 *  - **Xodimga yig'ma, oilaga aniq:** xodimga har bir holat uchun alohida xabar yuborilmaydi —
 *    kuniga bitta yig'ma xabar boradi ("112 o'quvchida muddati o'tgan to'lov bor"), aks holda
 *    bildirishnomalar ro'yxati foydasiz bo'lib qoladi. O'quvchi yoki ota-onaga esa aynan o'ziga
 *    tegishli xabar boradi.
 */

const DAY_MS = 86_400_000;

export interface AutomationRuleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  audience: AutomationAudience;
  params: Record<string, number>;
  isActive: boolean;
  lastRunAt: string | null;
  lastMatched: number;
}

export interface AutomationRunDto {
  id: string;
  ruleKey: string;
  ruleName: string;
  startedAt: string;
  durationMs: number | null;
  matched: number;
  notified: number;
  skipped: number;
  error: string | null;
}

const ruleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  trigger: true,
  audience: true,
  params: true,
  isActive: true,
  lastRunAt: true,
  lastMatched: true,
} satisfies Prisma.AutomationRuleSelect;

type RuleRecord = Prisma.AutomationRuleGetPayload<{ select: typeof ruleSelect }>;

function toRuleDto(record: RuleRecord): AutomationRuleDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    description: record.description,
    trigger: record.trigger,
    audience: record.audience,
    params: (record.params ?? {}) as Record<string, number>,
    isActive: record.isActive,
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
    lastMatched: record.lastMatched,
  };
}

function paramOf(rule: RuleRecord, key: string, fallback: number): number {
  const params = (rule.params ?? {}) as Record<string, unknown>;
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Qoida qaysi ruxsatli xodimlarga xabar beradi */
const STAFF_PERMISSION: Record<AutomationTrigger, PermissionKey> = {
  STUDENT_ABSENT_STREAK: PERMISSIONS.ATTENDANCE_VIEW,
  PAYMENT_DUE_SOON: PERMISSIONS.DEBT_VIEW,
  PAYMENT_OVERDUE: PERMISSIONS.DEBT_VIEW,
  STUDENT_RISK_CRITICAL: PERMISSIONS.STUDENT_VIEW,
  FOLLOWUP_OVERDUE: PERMISSIONS.FOLLOWUP_VIEW,
  STOCK_BELOW_MIN: PERMISSIONS.INVENTORY_VIEW,
  CERTIFICATE_ELIGIBLE: PERMISSIONS.STUDENT_MANAGE,
};

async function staffIdsFor(permission: PermissionKey): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE', role: { permissions: { some: { permission: { key: permission } } } } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

interface RuleOutcome {
  matched: number;
  notified: number;
  skipped: number;
}

/** Bitta xabarni kerakli odamlarga yuboradi va nechtasi yangi ekanini qaytaradi */
async function notify(
  tx: Prisma.TransactionClient,
  params: {
    userIds: string[];
    type: 'SYSTEM' | 'DEBT_REMINDER' | 'FOLLOW_UP_OVERDUE' | 'CHILD_ABSENT' | 'PAYMENT_DUE_SOON';
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    dedupeKey: string;
  },
): Promise<number> {
  if (params.userIds.length === 0) return 0;
  const before = await tx.notification.count({ where: { dedupeKey: { startsWith: params.dedupeKey } } });
  await notificationService.createManyInTransaction(
    tx,
    params.userIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
      dedupeKey: `${params.dedupeKey}:${userId}`,
    })),
  );
  const after = await tx.notification.count({ where: { dedupeKey: { startsWith: params.dedupeKey } } });
  return after - before;
}

/** Ketma-ket kelmaganlar: oxirgi belgilangan darslardan boshlab sanaladi */
async function runAbsentStreak(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  const needed = Math.max(2, Math.round(paramOf(rule, 'absences', 2)));
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const rows = await prisma.attendance.findMany({
    where: { date: { gte: since }, student: { deletedAt: null, status: 'ACTIVE' } },
    select: { studentId: true, date: true, status: true, student: { select: { firstName: true, lastName: true, userId: true } } },
    orderBy: [{ studentId: 'asc' }, { date: 'desc' }],
  });

  // Har o'quvchi uchun oxiridan boshlab ketma-ket "yo'q" larni sanaymiz
  const streaks = new Map<string, { count: number; name: string; done: boolean }>();
  for (const row of rows) {
    const current = streaks.get(row.studentId) ?? {
      count: 0,
      name: `${row.student.firstName} ${row.student.lastName}`,
      done: false,
    };
    if (current.done) continue;
    if (row.status === 'ABSENT') current.count += 1;
    else current.done = true;
    streaks.set(row.studentId, current);
  }

  const matched = [...streaks.entries()].filter(([, value]) => value.count >= needed);
  if (matched.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  const date = businessDateString(now);
  let notified = 0;

  if (rule.audience === 'STAFF') {
    const staff = await staffIdsFor(STAFF_PERMISSION.STUDENT_ABSENT_STREAK);
    const names = matched.slice(0, 3).map(([, value]) => value.name).join(', ');
    notified = await prisma.$transaction((tx) =>
      notify(tx, {
        userIds: staff,
        type: 'CHILD_ABSENT',
        title: matched.length === 1 ? 'Ketma-ket darsga kelmagan o‘quvchi' : 'Ketma-ket darsga kelmaganlar',
        message:
          matched.length === 1
            ? `${names} ketma-ket ${matched[0]![1].count} marta darsga kelmadi.`
            : `${matched.length} o‘quvchi ketma-ket ${needed}+ marta darsga kelmadi: ${names}${matched.length > 3 ? '…' : ''}`,
        entityType: 'student',
        entityId: matched[0]![0],
        dedupeKey: `automation:${rule.key}:${date}`,
      }),
    );
  } else {
    // Ota-onaga tashqi kanal orqali (kabinet hisobi shart emas)
    for (const [studentId, value] of matched) {
      await prisma.$transaction(async (tx) => {
        notified += await notificationService.notifyExternalInTransaction(tx, {
          title: 'Farzandingiz darsga kelmadi',
          message: `${value.name} ketma-ket ${value.count} marta darsga kelmadi.`,
          studentId,
          dedupeKey: `automation:${rule.key}:${studentId}:${date}`,
        });
      });
    }
  }

  return { matched: matched.length, notified, skipped: 0 };
}

/** To'lov muddati yaqinlashdi yoki o'tdi */
async function runPaymentSchedule(rule: RuleRecord, now: Date, overdue: boolean): Promise<RuleOutcome> {
  const stats = await scheduleDueStats(now);
  const daysBefore = Math.max(1, Math.round(paramOf(rule, 'daysBefore', 3)));
  const minDaysOverdue = Math.max(1, Math.round(paramOf(rule, 'minDaysOverdue', 1)));

  const candidates = [...stats.entries()].filter(([, value]) =>
    overdue ? value.overdueAmount > 0 && value.overdueDays >= minDaysOverdue : value.upcomingAmount > 0 && value.overdueAmount === 0,
  );
  if (candidates.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  const students = await prisma.student.findMany({
    where: { id: { in: candidates.map(([id]) => id) }, deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(students.map((student) => [student.id, `${student.firstName} ${student.lastName}`]));
  const date = businessDateString(now);
  const rows = candidates.filter(([studentId]) => nameById.has(studentId));
  let notified = 0;

  if (rule.audience === 'STAFF') {
    // Xodimga bitta yig'ma xabar — 100 ta alohida xabar ro'yxatni ko'mib yuboradi
    const staff = await staffIdsFor(STAFF_PERMISSION.PAYMENT_OVERDUE);
    const total = rows.reduce((sum, [, value]) => sum + (overdue ? value.overdueAmount : value.upcomingAmount), 0);
    const sample = rows
      .slice(0, 3)
      .map(([studentId]) => nameById.get(studentId))
      .join(', ');
    notified = await prisma.$transaction((tx) =>
      notify(tx, {
        userIds: staff,
        type: overdue ? 'DEBT_REMINDER' : 'PAYMENT_DUE_SOON',
        title: overdue ? 'Muddati o‘tgan to‘lovlar' : 'To‘lov muddati yaqinlashdi',
        message: overdue
          ? `${rows.length} o‘quvchida muddati o‘tgan to‘lov bor — jami ${moneyUz(total)}. Masalan: ${sample}${rows.length > 3 ? '…' : ''}`
          : `${rows.length} o‘quvchining to‘lov muddati ${daysBefore} kun ichida keladi — jami ${moneyUz(total)}.`,
        entityType: 'debt',
        entityId: 'summary',
        dedupeKey: `automation:${rule.key}:${date}`,
      }),
    );
  } else {
    // O'quvchi yoki ota-onaga — aynan o'ziga tegishli xabar
    for (const [studentId, value] of rows) {
      const name = nameById.get(studentId)!;
      const amount = overdue ? value.overdueAmount : value.upcomingAmount;
      const message = overdue
        ? `${name}: ${moneyUz(amount)} to‘lov muddati ${value.overdueDays} kun oldin o‘tgan.`
        : `${name}: ${moneyUz(amount)} to‘lov muddati yaqinlashdi (${daysBefore} kun ichida).`;
      await prisma.$transaction(async (tx) => {
        const sent = await notificationService.notifyExternalInTransaction(tx, {
          title: overdue ? 'To‘lov muddati o‘tdi' : 'To‘lov muddati yaqinlashdi',
          message,
          studentId,
          dedupeKey: `automation:${rule.key}:${studentId}:${date}`,
        });
        notified += sent;
      });
    }
  }

  return { matched: rows.length, notified, skipped: 0 };
}

async function runRiskCritical(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: 'ACTIVE', riskLevel: 'CRITICAL' },
    select: { id: true, firstName: true, lastName: true, healthScore: true },
  });
  if (students.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  const staff = await staffIdsFor(STAFF_PERMISSION.STUDENT_RISK_CRITICAL);
  const date = businessDateString(now);
  const names = students.slice(0, 3).map((student) => `${student.firstName} ${student.lastName}`).join(', ');
  const notified = await prisma.$transaction((tx) =>
    notify(tx, {
      userIds: staff,
      title: students.length === 1 ? 'Kritik xavfdagi o‘quvchi' : 'Kritik xavfdagi o‘quvchilar',
      type: 'SYSTEM',
      message:
        students.length === 1
          ? `${names} — sog‘lomlik balli ${students[0]!.healthScore ?? '—'}. Bog‘lanish kerak.`
          : `${students.length} o‘quvchi kritik xavfda: ${names}${students.length > 3 ? '…' : ''}`,
      entityType: 'student',
      entityId: students[0]!.id,
      dedupeKey: `automation:${rule.key}:${date}`,
    }),
  );

  return { matched: students.length, notified, skipped: 0 };
}

async function runFollowUpOverdue(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  const minHours = Math.max(1, Math.round(paramOf(rule, 'minHoursOverdue', 24)));
  const cutoff = new Date(now.getTime() - minHours * 3_600_000);
  const rows = await prisma.followUp.findMany({
    where: { status: 'PENDING', dueAt: { lt: cutoff }, lead: { deletedAt: null } },
    select: { id: true, assignedToId: true, lead: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (rows.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  // Mas'ul xodim bo'yicha guruhlanadi — har kimga bitta yig'ma xabar
  const byUser = new Map<string, number>();
  for (const row of rows) {
    if (!row.assignedToId) continue;
    byUser.set(row.assignedToId, (byUser.get(row.assignedToId) ?? 0) + 1);
  }

  const date = businessDateString(now);
  let notified = 0;
  for (const [userId, count] of byUser) {
    notified += await prisma.$transaction((tx) =>
      notify(tx, {
        userIds: [userId],
        type: 'FOLLOW_UP_OVERDUE',
        title: 'Kechikkan aloqalar',
        message: `Sizda ${count} ta kechikkan follow-up bor.`,
        entityType: 'follow_up',
        entityId: userId,
        dedupeKey: `automation:${rule.key}:${userId}:${date}`,
      }),
    );
  }

  return { matched: rows.length, notified, skipped: 0 };
}

async function runStockBelowMin(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  const products = await prisma.product.findMany({
    where: { isActive: true, minQuantity: { gt: 0 } },
    select: { id: true, name: true, quantity: true, minQuantity: true, unit: true },
  });
  const low = products.filter((product) => product.quantity <= product.minQuantity);
  if (low.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  const staff = await staffIdsFor(STAFF_PERMISSION.STOCK_BELOW_MIN);
  const date = businessDateString(now);
  const notified = await prisma.$transaction((tx) =>
    notify(tx, {
      userIds: staff,
      type: 'SYSTEM',
      title: 'Omborda kam qoldi',
      message: `${low.length} ta mahsulot chegaradan kam qoldi: ${low
        .slice(0, 3)
        .map((product) => `${product.name} (${product.quantity} ${product.unit})`)
        .join(', ')}${low.length > 3 ? '…' : ''}`,
      entityType: 'product',
      entityId: low[0]!.id,
      dedupeKey: `automation:${rule.key}:${date}`,
    }),
  );

  return { matched: low.length, notified, skipped: 0 };
}

/** Kursni tugatgan, lekin sertifikati yo'q o'quvchilar */
async function runCertificateEligible(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: 'GRADUATED', certificates: { none: {} } },
    select: { id: true, firstName: true, lastName: true, course: { select: { name: true } } },
    take: 50,
  });
  if (students.length === 0) return { matched: 0, notified: 0, skipped: 0 };

  const staff = await staffIdsFor(STAFF_PERMISSION.CERTIFICATE_ELIGIBLE);
  const date = businessDateString(now);
  let notified = 0;
  for (const student of students) {
    notified += await prisma.$transaction((tx) =>
      notify(tx, {
        userIds: staff,
        type: 'SYSTEM',
        title: 'Sertifikat berish mumkin',
        message: `${student.firstName} ${student.lastName} "${student.course.name}" kursini tugatgan, sertifikat berilmagan.`,
        entityType: 'student',
        entityId: student.id,
        dedupeKey: `automation:${rule.key}:${student.id}:${date}`,
      }),
    );
  }
  return { matched: students.length, notified, skipped: 0 };
}

async function execute(rule: RuleRecord, now: Date): Promise<RuleOutcome> {
  switch (rule.trigger) {
    case 'STUDENT_ABSENT_STREAK':
      return runAbsentStreak(rule, now);
    case 'PAYMENT_DUE_SOON':
      return runPaymentSchedule(rule, now, false);
    case 'PAYMENT_OVERDUE':
      return runPaymentSchedule(rule, now, true);
    case 'STUDENT_RISK_CRITICAL':
      return runRiskCritical(rule, now);
    case 'FOLLOWUP_OVERDUE':
      return runFollowUpOverdue(rule, now);
    case 'STOCK_BELOW_MIN':
      return runStockBelowMin(rule, now);
    case 'CERTIFICATE_ELIGIBLE':
      return runCertificateEligible(rule, now);
  }
}

export const automationService = {
  async list(): Promise<AutomationRuleDto[]> {
    const rules = await prisma.automationRule.findMany({ select: ruleSelect, orderBy: { name: 'asc' } });
    return rules.map(toRuleDto);
  },

  async runs(query: { page: number; limit: number; ruleKey?: string | undefined }): Promise<{ items: AutomationRunDto[]; total: number }> {
    const where: Prisma.AutomationRunWhereInput = query.ruleKey ? { rule: { key: query.ruleKey } } : {};
    const [rows, total] = await Promise.all([
      prisma.automationRun.findMany({
        where,
        select: {
          id: true,
          startedAt: true,
          durationMs: true,
          matched: true,
          notified: true,
          skipped: true,
          error: true,
          rule: { select: { key: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.automationRun.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        ruleKey: row.rule.key,
        ruleName: row.rule.name,
        startedAt: row.startedAt.toISOString(),
        durationMs: row.durationMs,
        matched: row.matched,
        notified: row.notified,
        skipped: row.skipped,
        error: row.error,
      })),
      total,
    };
  },

  async update(
    actor: AuthUser,
    key: string,
    input: { isActive?: boolean | undefined; params?: Record<string, number> | undefined; audience?: AutomationAudience | undefined },
    client: ClientInfo,
  ): Promise<AutomationRuleDto> {
    const rule = await prisma.automationRule.findUnique({ where: { key }, select: { id: true, params: true, isActive: true } });
    if (!rule) throw AppError.notFound('Qoida topilmadi');

    const saved = await prisma.$transaction(async (tx) => {
      const record = await tx.automationRule.update({
        where: { key },
        data: {
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.params === undefined ? {} : { params: input.params as Prisma.InputJsonValue }),
          ...(input.audience === undefined ? {} : { audience: input.audience }),
          updatedById: actor.id,
        },
        select: ruleSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'automation.rule_updated',
        entityType: 'settings',
        entityId: record.id,
        metadata: { key },
        before: { isActive: rule.isActive, params: rule.params } as never,
        after: { isActive: record.isActive, params: record.params } as never,
        ...client,
      });
      return record;
    });
    return toRuleDto(saved);
  },

  /** Barcha faol qoidalarni bir marta ishga tushiradi (job va qo'lda sinash uchun) */
  async runAll(now: Date = new Date()): Promise<{ rules: number; notified: number }> {
    const rules = await prisma.automationRule.findMany({ where: { isActive: true }, select: ruleSelect });
    let notified = 0;

    for (const rule of rules) {
      const started = Date.now();
      try {
        const outcome = await execute(rule, now);
        notified += outcome.notified;
        await prisma.$transaction([
          prisma.automationRun.create({
            data: {
              ruleId: rule.id,
              durationMs: Math.min(Date.now() - started, 2_000_000_000),
              matched: outcome.matched,
              notified: outcome.notified,
              skipped: outcome.skipped,
            },
          }),
          prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date(), lastMatched: outcome.matched } }),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, rule: rule.key }, 'Avtomatlashtirish qoidasida xatolik');
        // Xatolik boshqa qoidalarni to'xtatmaydi — har biri mustaqil
        await prisma.automationRun.create({
          data: { ruleId: rule.id, durationMs: Date.now() - started, error: message.slice(0, 500) },
        });
      }
    }

    return { rules: rules.length, notified };
  },
};

/** Test va job uchun: bugungi kun boshlanishi (biznes vaqti bo'yicha) */
export const automationInternals = { startOfBusinessDay, staffIdsFor };
