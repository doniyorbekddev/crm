import { escalationService } from '../services/escalation.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { withJobLease } from './jobLease.js';

/** Muddati o'tgan vazifa va hal qilinmagan ogohlantirishlarni rahbarga ko'taradi (soatiga bir marta) */
const INTERVAL_MS = 60 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Boshqa backend nusxasi shu vazifani bajarayotgan bo'lsa — bu yurish o'tkazib yuboriladi
    await withJobLease('escalation', async () => {
      const result = await escalationService.run(new Date());
      if (result.tasks > 0 || result.alerts > 0) logger.info(result, 'Eskalatsiya: rahbarlarga xabar yuborildi');
    });
    reportJobSuccess('escalation');
  } catch (error) {
    reportJobFailure('escalation', error, 'Eskalatsiya jobida xatolik');
  } finally {
    running = false;
  }
}

export function startEscalationJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
