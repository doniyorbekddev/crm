import { studentRiskService } from '../services/studentRisk.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure } from '../services/observability.js';

/**
 * O'quvchilarning ketib qolish xavfini qayta hisoblaydi.
 *
 * Har 30 daqiqada — ogohlantirishlar jobi bilan bir xil ritm, chunki ikkalasi ham
 * bir xil chegaralarga tayanadi. Hisob bir necha agregat so'rov bilan bajariladi
 * (1000 o'quvchida ~300 ms), natija `students` jadvaliga keshlanadi.
 */
const INTERVAL_MS = 30 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await studentRiskService.recalculateAll(new Date());
    if (result.updated > 0) {
      logger.info(result, 'O‘quvchilar xavf bahosi yangilandi');
    }
  } catch (error) {
    reportJobFailure('studentRisk', error, 'Xavf bahosi jobida xatolik');
  } finally {
    running = false;
  }
}

export function startStudentRiskJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
