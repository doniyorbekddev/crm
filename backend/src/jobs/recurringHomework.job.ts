import { recurringHomeworkService } from '../services/recurringHomework.service.js';
import { reportJobFailure } from '../services/observability.js';

/**
 * Takrorlanuvchi uy vazifalari (TZ 3.1 GAP-18): har 15 daqiqada bugungi takrorlanishlar — e'lon vaqti kelganlari.
 * Qayta yurish xavfsiz (bir jadval bir kunda bitta vazifa — unikal indeks).
 */
const INTERVAL_MS = 15 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await recurringHomeworkService.generate(new Date());
  } catch (error) {
    reportJobFailure('recurringHomework', error, 'Takrorlanuvchi vazifalar jobida xatolik');
  } finally {
    running = false;
  }
}

export function startRecurringHomeworkJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
