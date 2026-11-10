import { prisma } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import type { NotificationInput } from '../services/notification.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { AUTO_CHECKOUT_AT, recordAutoAttendance } from '../services/staffAttendance/auto.service.js';
import { attendanceManagers, clockTime, fullName, toDateString } from '../services/staffAttendance/common.js';
import { loadPlanner, loadSubjects } from '../services/staffAttendance/planning.js';
import type { StaffSubject } from '../services/staffAttendance/planning.js';
import { businessDateString } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { atBusinessTime, evaluateDay, parseTime } from '../utils/staffAttendance.js';
import { withJobLease } from './jobLease.js';

const INTERVAL_MS = 5 * 60_000;
const BATCH_SIZE = 50;
/** Shu soatdan keyin ham chiqish belgilanmagan bo'lsa — eslatma (markaz vaqti) */
const MISSING_CHECKOUT_AFTER = '22:00';
/** Ish tugaganidan shuncha daqiqa keyin ketish belgilanmagan bo'lsa — xodimga eslatma */
const CHECKOUT_REMINDER_MINUTES = 30;
/** Rahbarlarga "ketishi belgilanmaganlar" ro'yxati; jadvali yo'q xodimga eslatma ham shu vaqtda */
const CHECKOUT_DIGEST_AT = '18:00';
const DIGEST_NAMES = 15;

/**
 * Xodim davomati bo'yicha fon tekshiruvi (har 5 daqiqada):
 *  - **ketishni eslatish**: ish tugaganidan 30 daqiqa keyin (jadvali yo'q bo'lsa 18:00 da) ketishi belgilanmagan xodimga bir marta;
 *  - **18:00 ro'yxati**: rahbarlarga — ishi 18:00 gacha tugagan, lekin ketishi belgilanmaganlar (filial bo'yicha, bir marta);
 *  - **avtomatik "ketdi"**: jadvalida `autoMark` yoqilgan va QR bilan kelganlarning ochiq kunini 20:00 da jadval tugash vaqti
 *    bilan yopadi (`recordAutoAttendance`; "keldi" avtomatik yozilmaydi) — ogohlantirishlardan oldin;
 *  - **chiqish belgilanmagan**: kech soat 22:00 dan keyin (yoki keyingi kuni) xodimga va rahbarlarga bir marta (avtomatik
 *    yopilmaganlar: jadvalsiz yoki tanaffusda qolgan);
 *  - **kelmagan**: ish boshlanishi + `absentAfterMinutes` o'tib ham kelmagan, sababsiz — rahbarlarga bir marta.
 * Takrorlanmasligi kun yozuvidagi belgi (`…NotifiedAt`) yoki bildirishnomaning `dedupeKey`si bilan kafolatlanadi.
 * Ish vaqti o'ylab topilmaydi — kun tekshiruvga tushadi, rahbar sabab bilan tuzatadi.
 */
/** Bugun ish qachon tugaydi ("erta ketaman" ruxsati hisobga olinadi); ish kuni bo'lmasa — null */
function plannedEnd(planner: Awaited<ReturnType<typeof loadPlanner>>, subject: StaffSubject, date: string): string | null {
  const plan = planner.plan(subject.id, date);
  if (plan.kind !== 'WORK' || !plan.endTime) return null;
  const excuse = planner.excuse(subject.id, date);
  return excuse.earlyFrom && parseTime(excuse.earlyFrom) < parseTime(plan.endTime) ? excuse.earlyFrom : plan.endTime;
}

/** Bugun kelgan, lekin hali ketishi belgilanmagan kunlar — xodim va reja bilan */
async function openDaysToday(now: Date) {
  const today = businessDateString(now);
  const days = await prisma.staffAttendanceDay.findMany({
    where: { date: new Date(`${today}T00:00:00Z`), phase: { in: ['WORKING', 'ON_BREAK'] } },
    select: { id: true, userId: true, branchId: true },
  });
  if (days.length === 0) return { today, rows: [] };
  const subjects = await loadSubjects(null, { id: { in: days.map((day) => day.userId) } });
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const planner = await loadPlanner(subjects, today, today);
  const rows = days.flatMap((day) => {
    const subject = byId.get(day.userId);
    if (!subject) return [];
    return [{ day, subject, end: plannedEnd(planner, subject, today), autoClose: planner.schedule(subject.id, today)?.autoMark === true }];
  });
  return { today, rows };
}

const sentKeys = async (keys: string[]) =>
  new Set((await prisma.notification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((row) => row.dedupeKey));

/**
 * Ketishni eslatish: ish tugaganidan 30 daqiqa o'tib ham ketishi belgilanmagan xodimga (jadvali yo'q yoki dam olish kuni
 * kelgan bo'lsa — 18:00 da) bir marta. Avtomatik yopiladigan bo'lsa — qachon va qaysi vaqt bilan yopilishi aytiladi.
 */
export async function notifyCheckoutReminders(now: Date): Promise<number> {
  const { today, rows } = await openDaysToday(now);
  if (rows.length === 0) return 0;
  const key = (dayId: string) => `staff-checkout-reminder:${dayId}`;
  const done = await sentKeys(rows.map((row) => key(row.day.id)));
  let sent = 0;
  for (const { day, subject, end, autoClose } of rows) {
    if (done.has(key(day.id))) continue;
    const remindAt = end
      ? new Date(atBusinessTime(today, end).getTime() + CHECKOUT_REMINDER_MINUTES * 60_000)
      : atBusinessTime(today, CHECKOUT_DIGEST_AT);
    if (now.getTime() < remindAt.getTime()) continue;
    const closeAt = end && parseTime(end) > parseTime(AUTO_CHECKOUT_AT) ? end : AUTO_CHECKOUT_AT;
    const message = end
      ? `⏰ Ish vaqtingiz ${end} da tugagan, lekin ketishingiz belgilanmagan. Ketayotganda QR’ni skanerlab “Ishdan ketdim” ni bosing.` +
        (autoClose ? ` ${closeAt} gacha belgilanmasa, tizim ${end} vaqti bilan “ketdi” deb yozadi.` : '')
      : '⏰ Bugun ketishingiz belgilanmagan. Ketayotganda QR’ni skanerlab “Ishdan ketdim” ni bosing.';
    await prisma.$transaction(async (tx) => {
      await notificationService.createManyInTransaction(tx, [
        { userId: subject.id, type: 'STAFF_ATTENDANCE', title: 'Ishdan ketishni belgilang', message, actionUrl: '/my-attendance', dedupeKey: key(day.id) },
      ]);
    });
    sent += 1;
  }
  return sent;
}

/**
 * 18:00 ro'yxati: rahbarlarga filial bo'yicha bitta xabar — ishi 18:00 gacha tugagan (yoki jadvali yo'q), lekin ketishi
 * belgilanmagan xodimlar. Ishi kechroq tugaydiganlar (kechki dars) hali ishda — ro'yxatga kirmaydi. 18:00–20:00 oralig'ida,
 * kuniga bir marta (ro'yxat bo'sh bo'lsa xabar yo'q).
 */
export async function notifyCheckoutDigest(now: Date): Promise<number> {
  const clock = clockTime(now);
  if (clock < CHECKOUT_DIGEST_AT || clock >= AUTO_CHECKOUT_AT) return 0;
  const { today, rows } = await openDaysToday(now);
  const due = rows.filter((row) => row.end === null || parseTime(row.end) <= parseTime(CHECKOUT_DIGEST_AT));
  if (due.length === 0) return 0;
  const byBranch = new Map<string, typeof due>();
  for (const row of due) byBranch.set(row.day.branchId, [...(byBranch.get(row.day.branchId) ?? []), row]);

  let sent = 0;
  for (const [branchId, list] of byBranch) {
    const managers = await attendanceManagers(branchId);
    const key = (managerId: string) => `staff-checkout-digest:${branchId}:${today}:${managerId}`;
    const done = await sentKeys(managers.map(key));
    const notifications: NotificationInput[] = [];
    for (const managerId of managers) {
      if (done.has(key(managerId))) continue;
      const others = list.filter((row) => row.subject.id !== managerId);
      if (others.length === 0) continue;
      const names = others.slice(0, DIGEST_NAMES).map((row) => `${fullName(row.subject)}${row.end ? ` (${row.end} gacha)` : ''}`);
      const more = others.length > DIGEST_NAMES ? ` va yana ${others.length - DIGEST_NAMES} kishi` : '';
      notifications.push({
        userId: managerId,
        type: 'STAFF_ATTENDANCE',
        title: `Ketishi belgilanmagan: ${others.length} kishi`,
        message: `🕕 ${CHECKOUT_DIGEST_AT} holatiga: ${names.join(', ')}${more}. ${AUTO_CHECKOUT_AT} da avtomatik yopiladi (jadval tugash vaqti bilan).`,
        actionUrl: '/staff-attendance',
        dedupeKey: key(managerId),
      });
    }
    if (notifications.length === 0) continue;
    await prisma.$transaction(async (tx) => notificationService.createManyInTransaction(tx, notifications));
    sent += notifications.length;
  }
  return sent;
}

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
      const auto = await recordAutoAttendance(now);
      const reminders = await notifyCheckoutReminders(now);
      const digest = await notifyCheckoutDigest(now);
      const missing = await notifyMissingCheckouts(now);
      const absent = await notifyAbsences(now);
      if (auto.checkOuts > 0) logger.info(auto, 'Avtomatik "ketdi" yozildi');
      if (reminders > 0 || digest > 0 || missing > 0 || absent > 0) {
        logger.info({ reminders, digest, missing, absent }, 'Xodim davomati ogohlantirishlari yuborildi');
      }
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
