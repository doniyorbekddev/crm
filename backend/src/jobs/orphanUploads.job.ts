import { pendingUploadService } from '../services/pendingUpload.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';

/**
 * Yetim fayllar (TZ 3.1 PHASE 21): 24 soatdan beri hech narsaga bog'lanmagan yuklamalar diskdan o'chiriladi.
 * Har 6 soatda yetarli — fayllar kam va shoshilinch emas.
 */
const INTERVAL_MS = 6 * 60 * 60_000;
const FIRST_RUN_DELAY_MS = 10 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await pendingUploadService.sweep(new Date());
    if (result.removed + result.kept + result.failed > 0) logger.info(result, 'Yetim yuklamalar tozalandi');
    reportJobSuccess('orphanUploads');
  } catch (error) {
    reportJobFailure('orphanUploads', error, 'Yetim fayllarni tozalash jobida xatolik');
  } finally {
    running = false;
  }
}

export function startOrphanUploadsJob(): () => void {
  const first = setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  first.unref();
  const timer = setInterval(() => void runOnce(), INTERVAL_MS);
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
