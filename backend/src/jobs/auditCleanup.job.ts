import { cleanupAuditLogs } from '../services/audit.service.js';
import { telegramLinkService } from '../services/telegramLink.service.js';
import { telegramSessionService } from '../telegram/session.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { withJobLease } from './jobLease.js';

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
    // Boshqa backend nusxasi shu vazifani bajarayotgan bo'lsa — bu yurish o'tkazib yuboriladi
    await withJobLease('auditCleanup', async () => {
      const result = await cleanupAuditLogs(new Date());
      if (result.deleted > 0) logger.info(result, 'Audit jurnali tozalandi');

      // Tashlab ketilgan Telegram oqimlari ham shu yerda tozalanadi — ular uchun
      // alohida job ochish ortiqcha: yozuvlar oz va muddati o'qishda ham tekshiriladi.
      const sessions = await telegramSessionService.purgeExpired(new Date());
      if (sessions > 0) logger.info({ sessions }, 'Muddati o‘tgan Telegram oqimlari tozalandi');

      // Ishlatilmagan, muddati o'tgan bog'lash kodlari ham qolib ketmasin
      const codes = await telegramLinkService.purgeExpiredCodes(new Date());
      if (codes > 0) logger.info({ codes }, 'Muddati o‘tgan Telegram kodlari tozalandi');
    });
    reportJobSuccess('auditCleanup');
  } catch (error) {
    reportJobFailure('auditCleanup', error, 'Audit tozalash jobida xatolik');
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
