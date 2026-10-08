import { codeRunService, isRunnerEnabled } from '../services/codeRun.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { withJobLease } from './jobLease.js';

/** Kod sandbox navbati (TZ 3.1 GAP-19): har 30 s — runner sozlangan bo'lsagina ishlaydi */
const INTERVAL_MS = 30_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running || !isRunnerEnabled()) return;
  running = true;
  try {
    // Boshqa backend nusxasi shu vazifani bajarayotgan bo'lsa — bu yurish o'tkazib yuboriladi
    await withJobLease('codeRun', async () => {
      await codeRunService.processQueue(new Date());
    });
    reportJobSuccess('codeRun');
  } catch (error) {
    reportJobFailure('codeRun', error, 'Kod sandbox navbatida xatolik');
  } finally {
    running = false;
  }
}

export function startCodeRunJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
