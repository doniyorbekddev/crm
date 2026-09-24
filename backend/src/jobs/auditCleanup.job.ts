import { cleanupAuditLogs } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';

/**
 * Audit jurnalini saqlash muddati bo'yicha tozalaydi.
 *
 * Kuniga bir marta yetarli: jurnal tez o'smaydi va o'chirish og'ir so'rov. Muhim amallar
 * alohida (uzunroq) muddat bilan saqlanadi — sozlamada ko'rsatiladi.
 */
const INTERVAL_MS = 24 * 60 * 60_000;
/** Server ko'tarilgach darhol emas, biroz keyin — startda boshqa ishlar muhimroq */
const FIRST_RUN_DELAY_MS = 5 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await cleanupAuditLogs(new Date());
    if (result.deleted > 0) logger.info(result, 'Audit jurnali tozalandi');
  } catch (error) {
    logger.error({ err: error }, 'Audit tozalash jobida xatolik');
  } finally {
    running = false;
  }
}

export function startAuditCleanupJob(): () => void {
  const first = setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  first.unref();
  const timer = setInterval(() => void runOnce(), INTERVAL_MS);
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
