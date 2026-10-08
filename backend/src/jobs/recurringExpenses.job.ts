import { recurringExpenseService } from '../services/recurringExpense.service.js';
import { logger } from '../utils/logger.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { withJobLease } from './jobLease.js';

/** Har 6 soatda: joriy oy uchun kutilayotgan takroriy xarajatlar (pul yechilmaydi) */
const INTERVAL_MS = 6 * 60 * 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Boshqa backend nusxasi shu vazifani bajarayotgan bo'lsa — bu yurish o'tkazib yuboriladi
    await withJobLease('recurringExpenses', async () => {
      const result = await recurringExpenseService.generate(new Date());
      if (result.created > 0) {
        logger.info(result, 'Takroriy xarajatlar yaratildi');
      }
    });
    reportJobSuccess('recurringExpenses');
  } catch (error) {
    reportJobFailure('recurringExpenses', error, 'Takroriy xarajatlar jobida xatolik');
  } finally {
    running = false;
  }
}

export function startRecurringExpensesJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
