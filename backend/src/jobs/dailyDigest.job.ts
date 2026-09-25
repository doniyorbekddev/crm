import { digestService } from '../services/digest.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure } from '../services/observability.js';

/** Har 30 daqiqada tekshiriladi; belgilangan soatdan keyin kuniga bir marta yuboriladi (dedupeKey) */
const INTERVAL_MS = 30 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await digestService.sendDaily(new Date());
    if (result.sent > 0) {
      logger.info(result, 'Kunlik xulosa yuborildi');
    }
  } catch (error) {
    reportJobFailure('dailyDigest', error, 'Kunlik xulosa jobida xatolik');
  } finally {
    running = false;
  }
}

export function startDailyDigestJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
