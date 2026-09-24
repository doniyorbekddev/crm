/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Telegram webhook'ini ro'yxatdan o'tkazadi yoki o'chiradi.
 *
 *   npm run telegram:webhook -- https://crm.markaz.uz
 *   npm run telegram:webhook -- --delete
 *
 * Production uchun: Telegram update'larni shu manzilga yuboradi. Polling rejimi bilan
 * birga ishlatilmaydi — Telegram bitta botda ikkalasini qabul qilmaydi.
 *
 * `TELEGRAM_BOT_TOKEN` va `TELEGRAM_WEBHOOK_SECRET` `.env` dan olinadi va **terminalga
 * chiqarilmaydi**.
 */
import { config } from 'dotenv';

config({ quiet: true });

const WEBHOOK_PATH = '/api/telegram/webhook';

async function main(): Promise<void> {
  const { env } = await import('../src/config/env.js');
  const { telegramService } = await import('../src/services/telegram.service.js');

  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN sozlanmagan — .env ni to‘ldiring.');
    process.exit(1);
  }

  const argument = process.argv[2];

  if (argument === '--delete') {
    const ok = await telegramService.deleteWebhook();
    console.log(ok ? 'Webhook o‘chirildi.' : 'Webhook o‘chirilmadi — loglarni tekshiring.');
    process.exit(ok ? 0 : 1);
  }

  if (!argument || !argument.startsWith('https://')) {
    console.error('Ishlatish: npm run telegram:webhook -- https://<domen>   yoki   -- --delete');
    console.error('Telegram faqat HTTPS manzilni qabul qiladi.');
    process.exit(1);
  }

  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    // Secret bo'lmasa webhook controlleri **hech qanday** so'rovni qabul qilmaydi —
    // bot jim qolardi va sababi ko'rinmasdi.
    console.error('TELEGRAM_WEBHOOK_SECRET sozlanmagan — usiz webhook so‘rovlari rad etiladi.');
    process.exit(1);
  }

  const url = `${argument.replace(/\/$/, '')}${WEBHOOK_PATH}`;
  const ok = await telegramService.setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
  console.log(ok ? `Webhook o‘rnatildi: ${url}` : 'Webhook o‘rnatilmadi — loglarni tekshiring.');
  process.exit(ok ? 0 : 1);
}

void main();
