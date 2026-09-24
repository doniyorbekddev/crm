import { createApp } from './app.js';
import { disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { startAlertsJob } from './jobs/alerts.job.js';
import { startLeadScoreJob } from './jobs/leadScore.job.js';
import { startAutomationJob } from './jobs/automation.job.js';
import { startAuditCleanupJob } from './jobs/auditCleanup.job.js';
import { startNotificationDeliveryJob } from './jobs/notificationDelivery.job.js';
import { startStudentRiskJob } from './jobs/studentRisk.job.js';
import { startDailyDigestJob } from './jobs/dailyDigest.job.js';
import { startDebtReminderJob } from './jobs/debtReminder.job.js';
import { startFollowUpReminderJob } from './jobs/followUpReminder.job.js';
import { startRecurringExpensesJob } from './jobs/recurringExpenses.job.js';
import { telegramService } from './services/telegram.service.js';
import { BOT_COMMAND_MENU } from './services/telegramCommand.service.js';
import { startTelegramPolling } from './telegram/polling.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

// Follow-up eslatmalari va kechikish ogohlantirishlari (har daqiqada tekshiriladi)
const stopFollowUpReminders = startFollowUpReminderJob();
const stopDebtReminders = startDebtReminderJob();
// Avtomatik ogohlantirishlar (har 30 daqiqada)
const stopAlerts = startAlertsJob();
const stopStudentRisk = startStudentRiskJob();
const stopDelivery = startNotificationDeliveryJob();
const stopLeadScore = startLeadScoreJob();
const stopAutomation = startAutomationJob();
const stopAuditCleanup = startAuditCleanupJob();
const stopRecurringExpenses = startRecurringExpensesJob();
// Rahbar uchun kunlik xulosa (belgilangan soatdan keyin, kuniga bir marta)
const stopDailyDigest = startDailyDigestJob();
// Sinov rejimi: webhook o'rniga botning o'zi Telegramdan so'rab turadi (ishlab chiqishda)
const stopTelegramPolling = env.TELEGRAM_POLLING ? startTelegramPolling() : () => undefined;

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    logger.fatal({ err: error }, `Serverni ${env.PORT}-portda ishga tushirib bo‘lmadi`);
    process.exit(1);
  }
  logger.info(`CRM API ishga tushdi: http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  // Bot menyusi kod bilan bir xil bo'lib tursin (token yo'q bo'lsa jimgina o'tadi)
  void telegramService.setMyCommands(BOT_COMMAND_MENU);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Server to‘xtatilmoqda...');
  stopFollowUpReminders();
  stopDebtReminders();
  stopAlerts();
  stopStudentRisk();
  stopDelivery();
  stopLeadScore();
  stopAutomation();
  stopAuditCleanup();
  stopRecurringExpenses();
  stopTelegramPolling();
  stopDailyDigest();

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
