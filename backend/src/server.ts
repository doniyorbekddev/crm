import { createApp } from './app.js';
import { disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { startDebtReminderJob } from './jobs/debtReminder.job.js';
import { startFollowUpReminderJob } from './jobs/followUpReminder.job.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

// Follow-up eslatmalari va kechikish ogohlantirishlari (har daqiqada tekshiriladi)
const stopFollowUpReminders = startFollowUpReminderJob();
const stopDebtReminders = startDebtReminderJob();

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    logger.fatal({ err: error }, `Serverni ${env.PORT}-portda ishga tushirib bo‘lmadi`);
    process.exit(1);
  }
  logger.info(`CRM API ishga tushdi: http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Server to‘xtatilmoqda...');
  stopFollowUpReminders();
  stopDebtReminders();

  const forceExitTimer = setTimeout(() => {
    logger.error('Server belgilangan vaqtda to‘xtamadi, majburan yopilmoqda');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Serverni yopishda xatolik');
    }
    disconnectDatabase()
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, 'Ma’lumotlar bazasidan uzilishda xatolik');
      })
      .finally(() => {
        logger.info('Server to‘xtatildi');
        process.exit(error ? 1 : 0);
      });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Ushlanmagan promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Ushlanmagan xatolik — jarayon to‘xtatiladi');
  process.exit(1);
});
