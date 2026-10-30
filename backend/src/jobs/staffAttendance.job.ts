import { prisma } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import type { NotificationInput } from '../services/notification.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { attendanceManagers, clockTime, fullName, toDateString } from '../services/staffAttendance/common.js';
import { loadPlanner, loadSubjects } from '../services/staffAttendance/planning.js';
import { businessDateString } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { evaluateDay } from '../utils/staffAttendance.js';
import { withJobLease } from './jobLease.js';

const INTERVAL_MS = 5 * 60_000;
const BATCH_SIZE = 50;
/** Shu soatdan keyin ham chiqish belgilanmagan bo'lsa — eslatma (markaz vaqti) */
const MISSING_CHECKOUT_AFTER = '22:00';

/**
 * Xodim davomati bo'yicha fon tekshiruvi (har 5 daqiqada):
 *  - **chiqish belgilanmagan**: kech soat 22:00 dan keyin (yoki keyingi kuni) xodimga va rahbarlarga bir marta;
 *  - **kelmagan**: ish boshlanishi + `absentAfterMinutes` o'tib ham kelmagan, sababsiz — rahbarlarga bir marta.
 * Takrorlanmasligi kun yozuvidagi belgi (`…NotifiedAt`) bilan, shartli yangilash orqali kafolatlanadi.
 * Ish vaqti o'ylab topilmaydi — kun tekshiruvga tushadi, rahbar sabab bilan tuzatadi.
 */
export async function notifyMissingCheckouts(now: Date): Promise<number> {
  const today = businessDateString(now);
  const lateEnough = clockTime(now) >= MISSING_CHECKOUT_AFTER;
  const days = await prisma.staffAttendanceDay.findMany({
    where: {
      phase: { in: ['WORKING', 'ON_BREAK'] },
      missingCheckoutNotifiedAt: null,
      date: lateEnough ? { lte: new Date(`${today}T00:00:00Z`) } : { lt: new Date(`${today}T00:00:00Z`) },
    },
    select: { id: true, date: true, branchId: true, checkInAt: true, user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { date: 'asc' },
    take: BATCH_SIZE,
  });
  let sent = 0;
  for (const day of days) {
    const date = toDateString(day.date);
    const managers = await attendanceManagers(day.branchId, day.user.id);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.staffAttendanceDay.updateMany({ where: { id: day.id, missingCheckoutNotifiedAt: null }, data: { missingCheckoutNotifiedAt: now } });
      if (claimed.count !== 1) return;
      const since = day.checkInAt ? clockTime(day.checkInAt) : '—';
      const notifications: NotificationInput[] = [
        {
          userId: day.user.id,
          type: 'STAFF_ATTENDANCE',
          title: 'Ishdan ketish belgilanmagan',
          message: `⚠️ ${date}: ishga ${since} da kelgansiz, lekin ketishingiz belgilanmagan. Vaqt o‘ylab topilmaydi — rahbaringizga ayting, u sabab bilan tuzatadi.`,
          actionUrl: '/my-attendance',
          dedupeKey: `staff-nocheckout:${day.id}`,
        },
        ...managers.map((userId) => ({
          userId,
          type: 'STAFF_ATTENDANCE' as const,
          title: 'Tekshiruv kerak: ketish belgilanmagan',
          message: `⚠️ ${fullName(day.user)} — ${date}: ${since} da kelgan, ketishi belgilanmagan`,
          actionUrl: `/staff-attendance?user=${day.user.id}&date=${date}`,
          dedupeKey: `staff-nocheckout:${day.id}:${userId}`,
        })),
      ];
      await notificationService.createManyInTransaction(tx, notifications);
      sent += 1;
    });
  }
  return sent;
}

export async function notifyAbsences(now: Date): Promise<number> {
  const today = businessDateString(now);
  const subjects = await loadSubjects(null);
  if (subjects.length === 0) return 0;
  const [planner, rows] = await Promise.all([
    loadPlanner(subjects, today, today),
    prisma.staffAttendanceDay.findMany({
      where: { userId: { in: subjects.map((subject) => subject.id) }, date: new Date(`${today}T00:00:00Z`) },
      select: { userId: true, checkInAt: true, absenceNotifiedAt: true },
    }),
  ]);
  const rowByUser = new Map(rows.map((row) => [row.userId, row]));
  const managersByBranch = new Map<string, string[]>();
  let sent = 0;

  for (const subject of subjects) {
    const row = rowByUser.get(subject.id);
    if (row?.checkInAt || row?.absenceNotifiedAt) continue;
    const plan = planner.plan(subject.id, today);
    const evaluation = evaluateDay({ date: today, today, now, plan, facts: null, excuse: planner.excuse(subject.id, today) });
    if (evaluation.status !== 'ABSENT') continue;

    if (!managersByBranch.has(subject.branchId)) managersByBranch.set(subject.branchId, await attendanceManagers(subject.branchId));
    const managers = (managersByBranch.get(subject.branchId) ?? []).filter((id) => id !== subject.id);
    await prisma.$transaction(async (tx) => {
      const dateValue = new Date(`${today}T00:00:00Z`);
      await tx.staffAttendanceDay.createMany({ data: [{ userId: subject.id, date: dateValue, branchId: subject.branchId }], skipDuplicates: true });
      const claimed = await tx.staffAttendanceDay.updateMany({
        where: { userId: subject.id, date: dateValue, absenceNotifiedAt: null, checkInAt: null },
        data: { absenceNotifiedAt: now },
      });
      if (claimed.count !== 1) return;
      await notificationService.createManyInTransaction(
        tx,
        managers.map((userId) => ({
          userId,
          type: 'STAFF_ATTENDANCE' as const,
          title: 'Xodim ishga kelmadi',
          message: `🚫 ${fullName(subject)} (${subject.position}) bugun kelmadi: jadval ${plan.startTime}, ruxsat so‘rovi yo‘q`,
          actionUrl: `/staff-attendance?user=${subject.id}&date=${today}`,
          dedupeKey: `staff-absent:${subject.id}:${today}:${userId}`,
        })),
      );
      sent += 1;
    });
  }
  return sent;
}

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withJobLease('staffAttendance', async () => {
      const now = new Date();
      const missing = await notifyMissingCheckouts(now);
      const absent = await notifyAbsences(now);
      if (missing > 0 || absent > 0) logger.info({ missing, absent }, 'Xodim davomati ogohlantirishlari yuborildi');
    });
    reportJobSuccess('staffAttendance');
  } catch (error) {
    reportJobFailure('staffAttendance', error, 'Xodim davomati jobida xatolik');
  } finally {
    running = false;
  }
}

export function startStaffAttendanceJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
