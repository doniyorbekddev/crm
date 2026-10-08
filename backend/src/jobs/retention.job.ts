import { cleanupRetention } from '../services/retention.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { withJobLease } from './jobLease.js';

/**
 * Xizmat jadvallarini saqlash muddati bo'yicha tozalaydi (`services/retention.service.ts`).
 *
 * Kuniga bir marta yetarli. Server ko'tarilgach darhol emas — startda boshqa ishlar muhimroq.
 */
const INTERVAL_MS = 24 * 60 * 60_000;
const FIRST_RUN_DELAY_MS = 10 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Boshqa backend nusxasi shu vazifani bajarayotgan bo'lsa — bu yurish o'tkazib yuboriladi
    await withJobLease('retention', async () => {
      const result = await cleanupRetention(new Date());
      if (Object.values(result).some((count) => count > 0)) logger.info(result, 'Eski xizmat yozuvlari tozalandi');
    });
    reportJobSuccess('retention');
  } catch (error) {
    reportJobFailure('retention', error, 'Saqlash muddati bo‘yicha tozalash jobida xatolik');
  } finally {
    running = false;
  }
}

export function startRetentionJob(): () => void {
  const first = setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  first.unref();
  const timer = setInterval(() => void runOnce(), INTERVAL_MS);
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
