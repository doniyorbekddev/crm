import { alertService } from '../services/alert.service.js';
import { logger } from '../utils/logger.js';

/** Har 30 daqiqada qoidalar tekshiriladi; takrorlanish `dedupeKey` bilan bloklanadi */
const INTERVAL_MS = 30 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await alertService.evaluate(new Date());
    if (result.created > 0 || result.resolved > 0) {
      logger.info(result, 'Ogohlantirishlar yangilandi');
    }
  } catch (error) {
    logger.error({ err: error }, 'Ogohlantirishlar jobida xatolik');
  } finally {
    running = false;
  }
}

export function startAlertsJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
