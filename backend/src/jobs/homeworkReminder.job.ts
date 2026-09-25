import { prisma } from '../config/database.js';
import { notifyHomeworkDeadline } from '../services/studentNotify.service.js';
import { logger } from '../utils/logger.js';

/**
 * Uy vazifasi fon vazifasi (TZ 3.0 §42: "Homework deadline"), har 30 daqiqada:
 *
 * 1. **Eslatma** — muddatga 24 soatdan kam qolgan, hali topshirilmagan (PENDING / IN_PROGRESS /
 *    RETURNED) o'quvchi va ota-onasiga bir marta (`dedupeKey`).
 * 2. **Topshirmadi** — muddati o'tgan va umuman topshirilmagan ish MISSED bo'ladi. Kech topshirish
 *    baribir mumkin (LATE bo'ladi) — bu faqat holatni aniq ko'rsatadi (hisobot va risk uchun).
 */
const INTERVAL_MS = 30 * 60_000;
const REMIND_BEFORE_MS = 24 * 60 * 60_000;

let running = false;

export async function runHomeworkReminders(now: Date = new Date()): Promise<{ reminded: number; missed: number }> {
  const due = await prisma.homeworkSubmission.findMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS', 'RETURNED'] },
      homework: { status: 'PUBLISHED', deadline: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) } },
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    select: { studentId: true, homework: { select: { id: true, title: true, deadline: true } } },
    take: 2000,
  });

  let reminded = 0;
  for (const row of due) {
    reminded += await prisma.$transaction((tx) =>
      notifyHomeworkDeadline(tx, { homeworkId: row.homework.id, studentId: row.studentId, title: row.homework.title, deadline: row.homework.deadline }),
    );
  }

  const missed = await prisma.homeworkSubmission.updateMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, homework: { status: 'PUBLISHED', deadline: { lt: now } } },
    data: { status: 'MISSED' },
  });
  return { reminded, missed: missed.count };
}

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await runHomeworkReminders();
    if (result.reminded > 0 || result.missed > 0) logger.info(result, 'Uy vazifasi eslatmalari');
  } catch (error) {
    logger.error({ err: error }, 'Uy vazifasi eslatma jobida xatolik');
  } finally {
    running = false;
  }
}

export function startHomeworkReminderJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
