import { ensurePreviousMonthSnapshot } from '../services/monthSnapshot.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { logger } from '../utils/logger.js';
import { withJobLease } from './jobLease.js';

const INTERVAL_MS = 60 * 60_000;

/**
 * Oy oxiri snapshoti (tarixiy ma'lumot, 7-bosqich): soatiga bir marta tekshiriladi — o'tgan oy snapshoti yo'q bo'lsa
 * olinadi. Yangi oyning birinchi soatida olingani aniq, keyinroq (masalan birinchi ishga tushishda) olingani taxminiy.
 * Mavjud snapshot qayta yozilmaydi; qulflangan oyga tegilmaydi.
 */
let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withJobLease('month-snapshot', async () => {
      const result = await ensurePreviousMonthSnapshot(new Date());
      if (result && result.created > 0) logger.info(result, 'Oy oxiri snapshoti olindi');
    });
    reportJobSuccess('month-snapshot');
  } catch (error) {
    reportJobFailure('month-snapshot', error, 'Oy oxiri snapshotida xatolik');
  } finally {
    running = false;
  }
}

export function startMonthSnapshotJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
