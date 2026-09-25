import { prisma } from '../config/database.js';
import { captureException } from '../utils/errorTracker.js';
import { logger } from '../utils/logger.js';
import { metrics, registerGauge } from '../utils/metrics.js';

/**
 * Scrape paytida o'qiladigan o'lchagichlar (TZ 3.0 §68: "Queue size", "Notification failures").
 * Arzon so'rovlar: indeksli `count`/`groupBy`.
 */
registerGauge('crm_notification_queue', 'Yetkazish navbati holati bo‘yicha (PENDING — kutmoqda)', async () => {
  const rows = await prisma.notificationDelivery.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'FAILED'] } }, _count: { _all: true } });
  return rows.map((row) => ({ labels: { status: row.status }, value: row._count._all }));
});

registerGauge('crm_exam_attempts_in_progress', 'Hozir davom etayotgan onlayn imtihon urinishlari', async () => [
  { labels: {}, value: await prisma.examAttempt.count({ where: { status: 'IN_PROGRESS' } }) },
]);

registerGauge('crm_tasks_open', 'Ochiq xodim ishlari (muddati o‘tganlar alohida)', async () => {
  const [open, overdue] = await Promise.all([prisma.task.count({ where: { status: 'OPEN' } }), prisma.task.count({ where: { status: 'OPEN', dueAt: { lt: new Date() } } })]);
  return [
    { labels: { state: 'open' }, value: open },
    { labels: { state: 'overdue' }, value: overdue },
  ];
});

registerGauge('crm_automation_errors_24h', 'So‘nggi 24 soatda xato bilan tugagan avtomatlashtirish yurishlari', async () => [
  { labels: {}, value: await prisma.automationRun.count({ where: { error: { not: null }, startedAt: { gte: new Date(Date.now() - 86_400_000) } } }) },
]);

/** Fon vazifasi xatosi: log + metrika + (sozlangan bo'lsa) Sentry */
export function reportJobFailure(job: string, error: unknown, message: string): void {
  logger.error({ err: error, job }, message);
  metrics.jobFailures.inc({ job });
  captureException(error, { tags: { job } });
}
