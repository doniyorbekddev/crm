import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { masteryService } from '../services/mastery.service.js';
import { progressSnapshotService } from '../services/progressSnapshot.service.js';
import { businessDateString, currentBusinessMonth } from '../utils/dates.js';
import { logger } from '../utils/logger.js';

/**
 * Tungi progress vazifasi (TZ 3.0 §26–27), kuniga bir marta, o'quv markaz vaqti bilan 03:00 dan keyin:
 *
 * 1. **Mavzu o'zlashtirishini to'liq qayta hisoblash** — hooklar o'tkazib yuborgan holatlar
 *    (muddati o'tgan vazifa MISSED bo'ldi, dars arxivlandi va h.k.) shu yerda tuzaladi.
 * 2. **Oylik snapshot** — joriy oy yangilanadi; o'tgan oy hali yozilmagan bo'lsa yakunlanadi.
 */
const INTERVAL_MS = 30 * 60_000;
const RUN_HOUR = 3;

let running = false;
let lastRunDay: string | null = null;

function localHour(now: Date): number {
  return new Date(now.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000).getUTCHours();
}

export async function runNightlyProgress(now: Date = new Date()): Promise<{ students: number; writes: number; snapshots: number }> {
  const recalculated = await masteryService.recalculateAll();
  const current = currentBusinessMonth(now);
  const previous = current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 };
  let snapshots = await progressSnapshotService.writeMonth(current.year, current.month);
  if ((await prisma.studentProgressSnapshot.count({ where: { year: previous.year, month: previous.month } })) === 0) {
    snapshots += await progressSnapshotService.writeMonth(previous.year, previous.month);
  }
  return { ...recalculated, snapshots };
}

async function runOnce(): Promise<void> {
  const now = new Date();
  const today = businessDateString(now);
  if (running || lastRunDay === today || localHour(now) < RUN_HOUR) return;
  running = true;
  try {
    const result = await runNightlyProgress(now);
    lastRunDay = today;
    logger.info(result, 'Tungi progress: o‘zlashtirish va oylik snapshot');
  } catch (error) {
    logger.error({ err: error }, 'Tungi progress jobida xatolik');
  } finally {
    running = false;
  }
}

export function startProgressJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
