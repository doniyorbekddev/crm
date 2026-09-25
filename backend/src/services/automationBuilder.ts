import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import type { AutomationSchedule, AutomationTrigger, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { addDays, businessDateString, dateColumn } from '../utils/dates.js';
import { getAlertSettings } from './alert.service.js';
import { notificationService } from './notification.service.js';
import { notifyStudentAudience } from './studentNotify.service.js';

/**
 * Avtomatlashtirish quruvchisi (TZ 3.0 §50–51): **TRIGGER → SHART → AMAL → KANAL → JADVAL**.
 *
 * Xavfsizlik: faqat whitelist triggerlar va amallar; shart va amallar zod bilan tekshiriladi —
 * ixtiyoriy kod yoki so'rov yo'q. Har amal takrorlanmaydi (`dedupeKey`: qoida + holat + kun).
 * Amallar mavjud servislar orqali: bildirishnoma (`notificationService`, `notifyStudentAudience`),
 * ogohlantirish (`Alert`), ish (`Task`). Vazifa va quiz **taklif** sifatida — o'qituvchi tasdiqlaydi
 * (qoralama vazifa + ish), avtomatik e'lon qilinmaydi.
 */

/** Maxsus qoidalar uchun triggerlar (akademik) */
export const BUILDER_TRIGGERS = ['STUDENT_ABSENT_STREAK', 'HOMEWORK_COMPLETION_LOW', 'EXAM_SCORE_LOW', 'MASTERY_LOW', 'NO_LOGIN_DAYS', 'NO_SUBMISSION_DAYS', 'STUDENT_RISK_CRITICAL'] as const;
export type BuilderTrigger = (typeof BUILDER_TRIGGERS)[number];

const id = z.string().trim().min(1).max(50);
const count = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const conditionsSchema = z
  .object({
    /** Chegara: foiz (vazifa/imtihon/o'zlashtirish) yoki son (ketma-ket kelmaslik) */
    threshold: count(1, 100).optional(),
    /** Qaralayotgan davr, kun */
    days: count(1, 120).optional(),
    courseId: id.optional(),
    groupId: id.optional(),
  })
  .strict();

const channel = z.enum(['IN_APP', 'TELEGRAM', 'BOTH']).default('BOTH');

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NOTIFY'), audience: z.enum(['TEACHER', 'MANAGER', 'STUDENT', 'PARENT']), channel }).strict(),
  z.object({ type: z.literal('CREATE_TASK'), assignee: z.enum(['TEACHER', 'MANAGER']).default('TEACHER'), dueDays: count(0, 30).default(2) }).strict(),
  z.object({ type: z.literal('CREATE_ALERT'), severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('WARNING') }).strict(),
  z.object({ type: z.literal('ASSIGN_HOMEWORK'), dueDays: count(1, 30).default(5) }).strict(),
  z.object({ type: z.literal('RECOMMEND_QUIZ') }).strict(),
]);
export type BuilderAction = z.infer<typeof actionSchema>;

export const builderRuleSchema = z.object({
  name: z.string().trim().min(3, 'Kamida 3 belgi').max(120),
  description: z.string().trim().max(255).optional(),
  trigger: z.enum(BUILDER_TRIGGERS, 'Trigger noto‘g‘ri'),
  conditions: conditionsSchema.default({}),
  actions: z.array(actionSchema).min(1, 'Kamida bitta amal tanlang').max(6),
  schedule: z.enum(['HOURLY', 'DAILY', 'WEEKLY']).default('DAILY'),
  scheduleHour: count(0, 23).default(9),
  scheduleWeekday: count(0, 6).default(1),
  isActive: z.boolean().default(true),
});
export type BuilderRuleInput = z.infer<typeof builderRuleSchema>;

/** Trigger bo'yicha standart chegaralar */
export const TRIGGER_DEFAULTS: Record<BuilderTrigger, { threshold: number; days: number }> = {
  STUDENT_ABSENT_STREAK: { threshold: 3, days: 30 },
  HOMEWORK_COMPLETION_LOW: { threshold: 60, days: 30 },
  EXAM_SCORE_LOW: { threshold: 60, days: 7 },
  MASTERY_LOW: { threshold: 40, days: 30 },
  NO_LOGIN_DAYS: { threshold: 7, days: 7 },
  NO_SUBMISSION_DAYS: { threshold: 14, days: 14 },
  STUDENT_RISK_CRITICAL: { threshold: 0, days: 1 },
};

/** Holat: bitta o'quvchi (va kerak bo'lsa mavzu/imtihon) */
export interface Subject {
  key: string;
  studentId: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  teacherId: string | null;
  courseId: string;
  topicId?: string;
  topicTitle?: string;
  detail: string;
}

type Conditions = z.infer<typeof conditionsSchema>;

function studentScope(conditions: Conditions): Prisma.StudentWhereInput {
  return {
    deletedAt: null,
    status: 'ACTIVE',
    ...(conditions.courseId ? { courseId: conditions.courseId } : {}),
    ...(conditions.groupId ? { groupId: conditions.groupId } : {}),
  };
}

const studentSelect = { id: true, firstName: true, lastName: true, groupId: true, courseId: true, group: { select: { name: true, teacherId: true } } } as const;
type StudentRow = { id: string; firstName: string; lastName: string; groupId: string | null; courseId: string; group: { name: string; teacherId: string | null } | null };

function subjectOf(student: StudentRow, detail: string, extra: Partial<Subject> = {}): Subject {
  return {
    key: student.id,
    studentId: student.id,
    name: `${student.firstName} ${student.lastName}`,
    groupId: student.groupId,
    groupName: student.group?.name ?? null,
    teacherId: student.group?.teacherId ?? null,
    courseId: student.courseId,
    detail,
    ...extra,
  };
}

/** Trigger bo'yicha mos holatlar (dry-run ham shuni ishlatadi) */
export async function evaluateTrigger(trigger: BuilderTrigger, conditions: Conditions, now: Date = new Date()): Promise<Subject[]> {
  const threshold = conditions.threshold ?? TRIGGER_DEFAULTS[trigger].threshold;
  const days = conditions.days ?? TRIGGER_DEFAULTS[trigger].days;
  const since = new Date(now.getTime() - days * 86_400_000);
  const scope = studentScope(conditions);

  switch (trigger) {
    case 'STUDENT_ABSENT_STREAK': {
      const rows = await prisma.attendance.findMany({
        where: { date: { gte: dateColumn(since) }, student: scope },
        select: { studentId: true, status: true, student: { select: studentSelect } },
        orderBy: [{ studentId: 'asc' }, { date: 'desc' }],
      });
      const streaks = new Map<string, { student: StudentRow; count: number; done: boolean }>();
      for (const row of rows) {
        const current = streaks.get(row.studentId) ?? { student: row.student, count: 0, done: false };
        if (!current.done) {
          if (row.status === 'ABSENT') current.count += 1;
          else current.done = true;
        }
        streaks.set(row.studentId, current);
      }
      return [...streaks.values()].filter((item) => item.count >= threshold).map((item) => subjectOf(item.student, `ketma-ket ${item.count} darsga kelmadi`));
    }
    case 'HOMEWORK_COMPLETION_LOW': {
      const rows = await prisma.homeworkSubmission.groupBy({
        by: ['studentId', 'status'],
        where: { student: scope, homework: { status: { not: 'DRAFT' }, deadline: { gte: since, lt: now } } },
        _count: { _all: true },
      });
      const totals = new Map<string, { done: number; total: number }>();
      for (const row of rows) {
        const entry = totals.get(row.studentId) ?? { done: 0, total: 0 };
        entry.total += row._count._all;
        if (['SUBMITTED', 'LATE', 'GRADED'].includes(row.status)) entry.done += row._count._all;
        totals.set(row.studentId, entry);
      }
      const low = [...totals].filter(([, value]) => value.total >= 2 && (value.done / value.total) * 100 < threshold);
      const students = await prisma.student.findMany({ where: { id: { in: low.map(([studentId]) => studentId) } }, select: studentSelect });
      return students.map((student) => {
        const value = totals.get(student.id)!;
        return subjectOf(student, `vazifa topshirish ${Math.round((value.done / value.total) * 100)}% (${value.done}/${value.total})`);
      });
    }
    case 'EXAM_SCORE_LOW': {
      const rows = await prisma.examResult.findMany({
        where: { percentage: { lt: threshold }, student: scope, exam: { status: { not: 'CANCELLED' }, date: { gte: dateColumn(since) } } },
        select: { percentage: true, examId: true, exam: { select: { title: true } }, student: { select: studentSelect } },
      });
      return rows.map((row) => ({ ...subjectOf(row.student, `«${row.exam.title}» — ${row.percentage}%`), key: `${row.student.id}:${row.examId}` }));
    }
    case 'MASTERY_LOW': {
      const rows = await prisma.topicMastery.findMany({
        where: { score: { not: null, lt: threshold }, student: scope },
        select: { score: true, topicId: true, topic: { select: { title: true } }, student: { select: studentSelect } },
      });
      return rows.map((row) => ({
        ...subjectOf(row.student, `«${row.topic.title}» mavzusi ${row.score}%`, { topicId: row.topicId, topicTitle: row.topic.title }),
        key: `${row.student.id}:${row.topicId}`,
      }));
    }
    case 'NO_LOGIN_DAYS': {
      const cutoff = new Date(now.getTime() - threshold * 86_400_000);
      const students = await prisma.student.findMany({
        where: { ...scope, user: { is: { createdAt: { lt: cutoff }, OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] } } },
        select: { ...studentSelect, user: { select: { lastLoginAt: true } } },
      });
      return students.map((student) => subjectOf(student, student.user?.lastLoginAt ? `kabinetga ${Math.floor((now.getTime() - student.user.lastLoginAt.getTime()) / 86_400_000)} kundan beri kirmagan` : 'kabinetga hali kirmagan'));
    }
    case 'NO_SUBMISSION_DAYS': {
      const cutoff = new Date(now.getTime() - threshold * 86_400_000);
      const students = await prisma.student.findMany({
        where: {
          ...scope,
          // Shu davrda muddati o'tgan vazifasi bor, lekin hech birini topshirmagan
          submissions: {
            some: { homework: { status: { not: 'DRAFT' }, deadline: { gte: cutoff, lt: now } } },
            none: { submittedAt: { gte: cutoff } },
          },
        },
        select: studentSelect,
      });
      return students.map((student) => subjectOf(student, `${threshold} kundan beri vazifa topshirmagan`));
    }
    case 'STUDENT_RISK_CRITICAL': {
      const students = await prisma.student.findMany({ where: { ...scope, riskLevel: 'CRITICAL' }, select: { ...studentSelect, healthScore: true } });
      return students.map((student) => subjectOf(student, `xavf darajasi kritik (sog‘lik ${student.healthScore ?? '—'})`));
    }
  }
}

/** Keyingi ishga tushish vaqti (o'quv markaz vaqti bilan) */
export function computeNextRun(schedule: AutomationSchedule, hour: number, weekday: number, now: Date = new Date()): Date {
  if (schedule === 'HOURLY') return new Date(now.getTime() + 3_600_000);
  const offset = env.APP_UTC_OFFSET_MINUTES * 60_000;
  const local = new Date(now.getTime() + offset);
  const candidate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, 0) - offset);
  if (schedule === 'DAILY') return candidate > now ? candidate : addDays(candidate, 1);
  let days = (weekday - local.getUTCDay() + 7) % 7;
  if (days === 0 && candidate <= now) days = 7;
  return addDays(candidate, days);
}

export interface ActionOutcome {
  notified: number;
  actionsDone: number;
}

async function staffWith(permission: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { deletedAt: null, status: 'ACTIVE', role: { permissions: { some: { permission: { key: permission } } } } }, select: { id: true } });
  return users.map((user) => user.id);
}

/**
 * Amallarni bajaradi. `owner` — qoida egasi (vazifa qoralamasi shu xodim nomidan, doira va audit
 * bilan). Har amal holat + kun bo'yicha takrorlanmaydi.
 */
export async function runActions(
  rule: { id: string; key: string; name: string },
  actions: BuilderAction[],
  subjects: Subject[],
  owner: AuthUser | null,
  now: Date = new Date(),
): Promise<ActionOutcome> {
  const day = businessDateString(now);
  let notified = 0;
  let actionsDone = 0;
  let alertsEnabled: boolean | undefined;
  const managers = actions.some((action) => (action.type === 'NOTIFY' && action.audience === 'MANAGER') || (action.type === 'CREATE_TASK' && action.assignee === 'MANAGER'))
    ? await staffWith('student.manage')
    : [];

  for (const subject of subjects) {
    const base = `automation:${rule.key}:${subject.key}:${day}`;
    const title = rule.name;
    const message = `${subject.name}${subject.groupName ? ` (${subject.groupName})` : ''}: ${subject.detail}.`;
    for (const action of actions) {
      if (action.type === 'NOTIFY') {
        const channels = { inApp: action.channel !== 'TELEGRAM', telegram: action.channel !== 'IN_APP' };
        if (action.audience === 'STUDENT' || action.audience === 'PARENT') {
          notified += await prisma.$transaction((tx) =>
            notifyStudentAudience(tx, { studentId: subject.studentId, audience: action.audience as 'STUDENT' | 'PARENT', type: 'SYSTEM', title, message, entityType: 'student', entityId: subject.studentId, dedupeKey: `${base}:${action.audience}`, channels }),
          );
        } else {
          const userIds = action.audience === 'TEACHER' ? (subject.teacherId ? [subject.teacherId] : []) : managers;
          if (userIds.length === 0) continue;
          const before = await prisma.notification.count({ where: { dedupeKey: { startsWith: `${base}:${action.audience}` } } });
          await prisma.$transaction((tx) =>
            notificationService.createManyInTransaction(
              tx,
              userIds.map((userId) => ({ userId, type: 'SYSTEM' as const, title, message, entityType: 'student', entityId: subject.studentId, dedupeKey: `${base}:${action.audience}:${userId}` })),
              channels,
            ),
          );
          notified += (await prisma.notification.count({ where: { dedupeKey: { startsWith: `${base}:${action.audience}` } } })) - before;
        }
      } else if (action.type === 'CREATE_TASK') {
        const assignees = action.assignee === 'TEACHER' ? (subject.teacherId ? [subject.teacherId] : []) : managers.slice(0, 1);
        for (const assigneeId of assignees) {
          const created = await prisma.task.createMany({
            data: [
              {
                title: `${rule.name}: ${subject.name}`.slice(0, 200),
                description: message,
                assigneeId,
                dueAt: addDays(now, action.dueDays),
                entityType: 'student',
                entityId: subject.studentId,
                link: `/students/${subject.studentId}`,
                ruleId: rule.id,
                dedupeKey: `${base}:task:${assigneeId}`.slice(0, 200),
              },
            ],
            skipDuplicates: true,
          });
          actionsDone += created.count;
        }
      } else if (action.type === 'CREATE_ALERT') {
        // Ogohlantirish sozlamasida "Akademik xavf" o'chirilgan bo'lsa — yaratilmaydi
        alertsEnabled ??= (await getAlertSettings()).rules.ACADEMIC_RISK !== false;
        if (!alertsEnabled) continue;
        const created = await prisma.alert.createMany({
          data: [
            {
              type: 'ACADEMIC_RISK',
              severity: action.severity,
              title: `${rule.name}: ${subject.name}`.slice(0, 200),
              message,
              entityType: 'student',
              entityId: subject.studentId,
              metadata: { ruleKey: rule.key, groupId: subject.groupId } as Prisma.InputJsonValue,
              dedupeKey: `${base}:alert`.slice(0, 150),
            },
          ],
          skipDuplicates: true,
        });
        actionsDone += created.count;
      } else if (action.type === 'ASSIGN_HOMEWORK' || action.type === 'RECOMMEND_QUIZ') {
        // Taklif: o'qituvchiga ish (va vazifa uchun qoralama) — o'qituvchi tasdiqlab e'lon qiladi
        if (!subject.teacherId) continue;
        const isQuiz = action.type === 'RECOMMEND_QUIZ';
        const dedupeKey = `${base}:${isQuiz ? 'quiz' : 'hw'}`.slice(0, 200);
        const exists = await prisma.task.findUnique({ where: { dedupeKey }, select: { id: true } });
        if (exists) continue;
        let link = subject.groupId ? `/teaching/groups/${subject.groupId}` : `/students/${subject.studentId}`;
        if (!isQuiz && subject.groupId && owner) {
          const homework = await prisma.homework.create({
            data: {
              title: `Takrorlash${subject.topicTitle ? `: ${subject.topicTitle}` : ''} — ${subject.name}`.slice(0, 200),
              description: `Avtomatlashtirish tavsiyasi (${rule.name}). O‘qituvchi tekshirib e’lon qiladi.`,
              groupId: subject.groupId,
              courseId: subject.courseId,
              teacherId: subject.teacherId,
              deadline: addDays(now, action.type === 'ASSIGN_HOMEWORK' ? action.dueDays : 5),
              status: 'DRAFT',
              targetType: 'INDIVIDUAL',
              topicId: subject.topicId ?? null,
              maxPoints: 100,
              submissions: { create: [{ studentId: subject.studentId }] },
            },
            select: { id: true },
          });
          link = '/homework';
          actionsDone += homework.id ? 1 : 0;
        }
        await prisma.task.create({
          data: {
            title: (isQuiz ? `Quiz tavsiya: ${subject.topicTitle ?? subject.name}` : `Qoralama vazifani ko‘rib chiqing: ${subject.name}`).slice(0, 200),
            description: isQuiz ? `${message} Mavzu bo‘yicha 10 savollik quiz (remedial reja: O‘qituvchi markazi → guruh → AI tahlil).` : `${message} Qoralama vazifa yaratildi — tekshirib e’lon qiling.`,
            assigneeId: subject.teacherId,
            dueAt: addDays(now, 2),
            entityType: subject.groupId ? 'group' : 'student',
            entityId: subject.groupId ?? subject.studentId,
            link,
            ruleId: rule.id,
            dedupeKey,
          },
        });
        actionsDone += 1;
      }
    }
  }
  return { notified, actionsDone };
}

/** Qoida egasidan AuthUser (vazifa qoralamasi shu xodim nomidan) */
export async function ownerOf(userId: string | null): Promise<AuthUser | null> {
  if (!userId) return null;
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, email: true, firstName: true, lastName: true, roleId: true, branchId: true, role: { select: { key: true } } },
  });
  if (!user) return null;
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roleId: user.roleId, roleKey: user.role.key, branchId: user.branchId };
}

export function isBuilderTrigger(trigger: AutomationTrigger): trigger is BuilderTrigger {
  return (BUILDER_TRIGGERS as readonly string[]).includes(trigger);
}
