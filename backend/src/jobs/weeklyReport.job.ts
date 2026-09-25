import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { notifyWeeklyReport } from '../services/studentNotify.service.js';
import { weeklyReportService } from '../services/weeklyReport.service.js';
import { businessDateString, startOfBusinessWeek } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { aiAcademicService } from '../services/ai/academic.service.js';
import { reportJobFailure } from '../services/observability.js';

/**
 * Haftalik hisobot (TZ 3.0 §11): **yakshanba, 18:00 dan keyin** (o'quv markaz vaqti) har bir
 * faol o'quvchi va uning ota-onasiga — ilova ichida va Telegramda.
 *
 * Har 30 daqiqada tekshiriladi; `dedupeKey` (`weekly-report:<o'quvchi>:<hafta>`) tufayli
 * server qayta ishga tushsa ham bir hafta uchun bir marta ketadi. Qabul qiluvchisi yo'q
 * o'quvchi uchun hisobot umuman hisoblanmaydi.
 */
const INTERVAL_MS = 30 * 60_000;
const SEND_WEEKDAY = 0; // yakshanba
const SEND_HOUR = 18;

let running = false;

/** O'quv markaz vaqtida yakshanba 18:00 dan keyinmi */
export function isWeeklyReportTime(now: Date): boolean {
  const local = new Date(now.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000);
  return local.getUTCDay() === SEND_WEEKDAY && local.getUTCHours() >= SEND_HOUR;
}

/** Bir hafta uchun yuborish — test va qo'lda ishga tushirish uchun alohida */
export async function sendWeeklyReports(now: Date = new Date()): Promise<{ students: number; notified: number }> {
  const weekStart = startOfBusinessWeek(now);
  const week = businessDateString(weekStart);
  // Kabinet hisobi yoki bog'langan Telegrami bor o'quvchilar (o'zi yoki ota-onasi)
  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { userId: { not: null } },
        { telegramLinks: { some: { verifiedAt: { not: null }, isActive: true } } },
        { parents: { some: { parent: { OR: [{ userId: { not: null } }, { telegramLinks: { some: { verifiedAt: { not: null }, isActive: true } } }] } } } },
      ],
    },
    select: { id: true },
  });

  let notified = 0;
  for (const { id } of students) {
    const report = await aiAcademicService.withAiSummary(await weeklyReportService.build(id, weekStart));
    notified += await prisma.$transaction((tx) =>
      notifyWeeklyReport(tx, { studentId: id, weekStart: week, weekLabel: report.week.label, summary: report.summary }),
    );
  }
  return { students: students.length, notified };
}

async function runOnce(): Promise<void> {
  if (running || !isWeeklyReportTime(new Date())) return;
  running = true;
  try {
    const result = await sendWeeklyReports();
    if (result.students > 0) logger.info(result, 'Haftalik hisobotlar yuborildi');
  } catch (error) {
    reportJobFailure('weeklyReport', error, 'Haftalik hisobot jobida xatolik');
  } finally {
    running = false;
  }
}

export function startWeeklyReportJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
