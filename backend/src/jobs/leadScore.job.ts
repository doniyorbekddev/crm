import { leadScoreService } from '../services/leadScore.service.js';
import { logger } from '../utils/logger.js';

/**
 * Lead ballarini qayta hisoblaydi. Har 30 daqiqada — ball vaqtga ham bog'liq
 * (aloqa bo'lmasa lead sovuydi), shuning uchun davriy yangilanishi kerak.
 */
const INTERVAL_MS = 30 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await leadScoreService.recalculateAll(new Date());
    if (result.updated > 0) logger.info(result, 'Lead ballari yangilandi');
  } catch (error) {
    logger.error({ err: error }, 'Lead scoring jobida xatolik');
  } finally {
    running = false;
  }
}

export function startLeadScoreJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
