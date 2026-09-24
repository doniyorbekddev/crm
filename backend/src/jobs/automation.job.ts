import { automationService } from '../services/automation.service.js';
import { logger } from '../utils/logger.js';

/**
 * Avtomatlashtirish qoidalarini davriy ishga tushiradi.
 *
 * Har 30 daqiqada — shart tezda o'zgaradi (to'lov qilindi, davomat belgilandi), lekin
 * bildirishnoma `dedupeKey` tufayli kuniga bir marta ketadi, shuning uchun tez-tez tekshirish
 * odamni bezovta qilmaydi.
 */
const INTERVAL_MS = 30 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await automationService.runAll(new Date());
    if (result.notified > 0) logger.info(result, 'Avtomatlashtirish qoidalari ishladi');
  } catch (error) {
    logger.error({ err: error }, 'Avtomatlashtirish jobida xatolik');
  } finally {
    running = false;
  }
}

export function startAutomationJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  // Server ko'tarilgach darhol bir marta — kechikkan holatlar kutib qolmasin
  void runOnce();
  return () => clearInterval(timer);
}
