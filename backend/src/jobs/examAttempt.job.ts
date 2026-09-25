import { examTakingService } from '../services/examTaking.service.js';
import { logger } from '../utils/logger.js';

/**
 * Onlayn imtihon muddati (TZ 3.0 §25): o'quvchi sahifani yopib qo'ysa ham vaqt tugagach
 * urinish saqlangan javoblar bilan avtomatik topshiriladi. Har daqiqada.
 * (Urinish ochilganda ham muddat tekshiriladi — bu vazifa faqat "tashlab ketilgan"larni yopadi.)
 */
const INTERVAL_MS = 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const finalized = await examTakingService.finalizeExpired();
    if (finalized > 0) logger.info({ finalized }, 'Muddati tugagan imtihon urinishlari yakunlandi');
  } catch (error) {
    logger.error({ err: error }, 'Imtihon urinishlari jobida xatolik');
  } finally {
    running = false;
  }
}

export function startExamAttemptJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
