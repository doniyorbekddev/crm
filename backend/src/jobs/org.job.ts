import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { notificationService } from '../services/notification.service.js';
import type { NotificationInput } from '../services/notification.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { notifyOverdueComplaints } from '../services/org/complaints.service.js';
import { notifyReviewSeason } from '../services/org/performance.service.js';
import { WORKING_TASK_STATUSES } from '../services/task.service.js';
import { taskNotificationButtons } from '../telegram/taskButtons.js';
import { businessToday, daysBetween, fullName, permissionHolders, toDateOnly } from '../services/org/common.js';
import { addDays } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { withJobLease } from './jobLease.js';

const INTERVAL_MS = 60 * 60_000;
/** Sinov muddati tugashidan necha kun oldin eslatiladi */
export const PROBATION_NOTICE_DAYS = 7;

/**
 * ORG tizimi fon tekshiruvlari (soatiga bir marta): sinov muddati, muddati o'tgan murojaatlar, muddati yaqin vazifalar.
 *
 * Sinov muddati (ORG §3.2): tugashiga 7 kun qolganda va tugagan kuni rahbarga (xodim kartasini boshqaradiganlarga)
 * bir martadan eslatma — qaror (davom ettirish yoki to'xtatish) o'z vaqtida qabul qilinsin.
 * Takrorlanmasligi bildirishnomaning `dedupeKey` i bilan (sana kalitda — sana o'zgarsa yangi eslatma).
 */
export async function notifyProbationEnds(now: Date): Promise<number> {
  const today = businessToday(now);
  const horizon = addDays(today, PROBATION_NOTICE_DAYS);
  const window = { gte: today, lte: horizon };
  const [employees, teachers] = await Promise.all([
    prisma.employee.findMany({
      where: { probationEndDate: window, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: { id: true, firstName: true, lastName: true, branchId: true, probationEndDate: true },
    }),
    prisma.teacherProfile.findMany({
      where: { probationEndDate: window, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] }, user: { deletedAt: null } },
      select: { id: true, userId: true, probationEndDate: true, user: { select: { firstName: true, lastName: true, branchId: true } } },
    }),
  ]);

  const subjects = [
    ...employees.map((row) => ({ key: `employee:${row.id}`, name: fullName(row), branchId: row.branchId, end: row.probationEndDate!, link: `/employees?employee=${row.id}`, permission: PERMISSIONS.EMPLOYEE_MANAGE })),
    ...teachers.map((row) => ({ key: `teacher:${row.id}`, name: fullName(row.user), branchId: row.user.branchId, end: row.probationEndDate!, link: `/teachers/${row.id}`, permission: PERMISSIONS.TEACHER_MANAGE })),
  ];

  let sent = 0;
  for (const subject of subjects) {
    const left = daysBetween(today, subject.end);
    // Ikki nuqta: "bir hafta qoldi" (oynaga kirgan birinchi kun) va "bugun tugaydi"
    const stage = left === 0 ? 'due' : 'week';
    const recipients = await permissionHolders(subject.permission, subject.branchId);
    if (recipients.length === 0) continue;
    const date = toDateOnly(subject.end);
    const notifications: NotificationInput[] = recipients.map((userId) => ({
      userId,
      type: 'HR_UPDATE',
      title: stage === 'due' ? 'Sinov muddati bugun tugaydi' : 'Sinov muddati tugashiga oz qoldi',
      message:
        stage === 'due'
          ? `⏳ ${subject.name}: sinov muddati bugun (${date}) tugaydi — natijalarni ko‘rib, qaror qabul qiling.`
          : `⏳ ${subject.name}: sinov muddati ${date} da tugaydi (${left} kun qoldi).`,
      actionUrl: subject.link,
      dedupeKey: `probation:${subject.key}:${date}:${stage}:${userId}`,
    }));
    await prisma.$transaction((tx) => notificationService.createManyInTransaction(tx, notifications));
    sent += 1;
  }
  return sent;
}

/** Vazifa muddatiga shuncha soat qolganda ijrochiga eslatma (spetsifikatsiya §9) */
export const TASK_DUE_SOON_HOURS = 24;
const HOUR_MS = 3_600_000;

/**
 * Muddati yaqinlashgan vazifalar: ijrochi ishlayotgan (Yangi / Jarayonda) va muddatgacha 24 soatdan kam qolgan.
 * Faqat uzoqroq muddat bilan berilgan vazifalarga (berilganda muddat allaqachon yaqin bo'lsa, birinchi xabar yetarli).
 * Takror yo'q: `dedupeKey` muddat bilan — muddat surilsa, yangi muddat uchun yana bir marta.
 */
export async function notifyTasksDueSoon(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + TASK_DUE_SOON_HOURS * HOUR_MS);
  const rows = await prisma.task.findMany({
    where: { status: { in: [...WORKING_TASK_STATUSES] }, dueAt: { gt: now, lte: horizon } },
    select: { id: true, title: true, dueAt: true, createdAt: true, assigneeId: true },
    take: 500,
  });
  const due = rows.filter((row) => row.dueAt!.getTime() - row.createdAt.getTime() > TASK_DUE_SOON_HOURS * HOUR_MS);
  if (due.length === 0) return 0;
  const notifications: NotificationInput[] = due.map((row) => {
    const hours = Math.max(1, Math.round((row.dueAt!.getTime() - now.getTime()) / HOUR_MS));
    return {
      userId: row.assigneeId,
      type: 'TASK_UPDATE',
      title: 'Vazifa muddati yaqinlashdi',
      message: `⏰ ${row.title} — ${hours} soat qoldi`,
      entityType: 'task',
      entityId: row.id,
      actionUrl: '/tasks',
      buttons: taskNotificationButtons(row.id),
      dedupeKey: `task:${row.id}:due-soon:${row.dueAt!.getTime()}`,
    };
  });
  // `createMany` takroriy kalitni o'tkazib yuboradi — avval yuborilganlari qayta yaratilmaydi
  await prisma.$transaction((tx) => notificationService.createManyInTransaction(tx, notifications));
  return due.length;
}

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withJobLease('org', async () => {
      const now = new Date();
      const probation = await notifyProbationEnds(now);
      const complaints = await notifyOverdueComplaints(now);
      const tasks = await notifyTasksDueSoon(now);
      const reviews = await notifyReviewSeason(now);
      if (probation + complaints + tasks + reviews > 0) logger.info({ probation, complaints, tasks, reviews }, 'ORG eslatmalari yuborildi');
    });
    reportJobSuccess('org');
  } catch (error) {
    reportJobFailure('org', error, 'ORG jobida xatolik');
  } finally {
    running = false;
  }
}

export function startOrgJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
