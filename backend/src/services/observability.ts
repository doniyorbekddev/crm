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

/**
 * Fon vazifalari salomatligi (TZ 3.1 §44, PHASE 21): har job oxirgi muvaffaqiyatli va xato yurish vaqti — Prometheus
 * o'lchagichi va "Tizim holati" uchun. Xotirada (jarayon qayta ishga tushsa — birinchi yurishdan keyin to'ladi).
 */
const jobState = new Map<string, { lastSuccessAt: number | null; lastFailureAt: number | null }>();

function stateOf(job: string) {
  const current = jobState.get(job) ?? { lastSuccessAt: null, lastFailureAt: null };
  jobState.set(job, current);
  return current;
}

export function reportJobSuccess(job: string, now: Date = new Date()): void {
  stateOf(job).lastSuccessAt = now.getTime();
}

export function jobHealth(): Array<{ job: string; lastSuccessAt: string | null; lastFailureAt: string | null }> {
  return [...jobState.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([job, state]) => ({
      job,
      lastSuccessAt: state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString(),
      lastFailureAt: state.lastFailureAt === null ? null : new Date(state.lastFailureAt).toISOString(),
    }));
}

registerGauge('crm_job_last_success_timestamp_seconds', 'Fon vazifasining oxirgi muvaffaqiyatli yurishi (unix vaqt)', async () =>
  [...jobState.entries()].filter(([, state]) => state.lastSuccessAt !== null).map(([job, state]) => ({ labels: { job }, value: Math.floor(state.lastSuccessAt! / 1000) })),
);

registerGauge('crm_job_last_failure_timestamp_seconds', 'Fon vazifasining oxirgi xato bilan tugagan yurishi (unix vaqt)', async () =>
  [...jobState.entries()].filter(([, state]) => state.lastFailureAt !== null).map(([job, state]) => ({ labels: { job }, value: Math.floor(state.lastFailureAt! / 1000) })),
);

/** Fon vazifasi xatosi: log + metrika + (sozlangan bo'lsa) Sentry */
export function reportJobFailure(job: string, error: unknown, message: string): void {
  stateOf(job).lastFailureAt = Date.now();
  logger.error({ err: error, job }, message);
  metrics.jobFailures.inc({ job });
  captureException(error, { tags: { job } });
}
