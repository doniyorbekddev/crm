/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Telegram sozlamasini tekshiradi: token ishlayaptimi, bot kim, webhook holati qanday.
 *
 *   npm run telegram:check
 *
 * Token **hech qachon chiqarilmaydi** — faqat "bor/yo'q" va uzunligi ko'rsatiladi.
 * "Bot javob bermayapti" degan holatda birinchi navbatda shu buyruq ishga tushiriladi.
 */
import { config } from 'dotenv';

config({ quiet: true });

interface BotInfo {
  username?: string;
  first_name?: string;
  id?: number;
}

interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
}

async function main(): Promise<void> {
  const { env } = await import('../src/config/env.js');

  console.log('Sozlama:');
  console.log(`  TELEGRAM_BOT_TOKEN      ${env.TELEGRAM_BOT_TOKEN ? `bor (${env.TELEGRAM_BOT_TOKEN.length} belgi)` : '— YO‘Q'}`);
  console.log(`  TELEGRAM_BOT_USERNAME   ${env.TELEGRAM_BOT_USERNAME ?? '— yo‘q'}`);
  console.log(`  TELEGRAM_WEBHOOK_SECRET ${env.TELEGRAM_WEBHOOK_SECRET ? `bor (${env.TELEGRAM_WEBHOOK_SECRET.length} belgi)` : '— YO‘Q'}`);
  console.log(`  TELEGRAM_POLLING        ${env.TELEGRAM_POLLING ? 'true (sinov rejimi)' : 'false (webhook rejimi)'}`);
  console.log('');

  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('Token sozlanmagan — .env dagi TELEGRAM_BOT_TOKEN ni to‘ldiring.');
    process.exit(1);
  }

  const api = async <T>(method: string): Promise<T | null> => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`);
      const body = (await response.json()) as { ok?: boolean; result?: T; description?: string };
      if (body.ok !== true) {
        console.error(`  ${method}: ${body.description ?? `HTTP ${response.status}`}`);
        return null;
      }
      return body.result ?? null;
    } catch (error) {
      console.error(`  ${method}: ulanib bo‘lmadi — ${error instanceof Error ? error.message : 'tarmoq xatosi'}`);
      return null;
    }
  };

  const me = await api<BotInfo>('getMe');
  if (!me) {
    console.error('\nToken ishlamadi. BotFather’dan yangi token oling (/revoke) va .env ni yangilang.');
    process.exit(1);
  }
  console.log(`Bot: @${me.username} — "${me.first_name}" (id: ${me.id})`);

  if (env.TELEGRAM_BOT_USERNAME && env.TELEGRAM_BOT_USERNAME !== me.username) {
    // Nomlar mos kelmasa kabinetdagi "Telegramda ochish" havolasi boshqa botga olib boradi
    console.warn(`⚠️  TELEGRAM_BOT_USERNAME (${env.TELEGRAM_BOT_USERNAME}) bot username'iga mos emas: ${me.username}`);
  }

  const webhook = await api<WebhookInfo>('getWebhookInfo');
  if (webhook) {
    console.log(`Webhook: ${webhook.url ? webhook.url : '— o‘rnatilmagan (polling uchun to‘g‘ri)'}`);
    if (webhook.pending_update_count) console.log(`  Kutayotgan xabarlar: ${webhook.pending_update_count}`);
    if (webhook.last_error_message) {
      const when = webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : 'noma’lum';
      console.log(`  Oxirgi xato: ${webhook.last_error_message} (${when})`);
    }
    // Ikkalasi birga ishlamaydi — Telegram getUpdates ni 409 bilan rad etadi
    if (env.TELEGRAM_POLLING && webhook.url) {
      console.warn('⚠️  Polling yoqilgan, lekin webhook ham o‘rnatilgan. Polling boshlanganda webhook o‘chiriladi.');
    }
    if (!env.TELEGRAM_POLLING && !webhook.url) {
      console.warn('⚠️  Webhook rejimi tanlangan, lekin webhook o‘rnatilmagan: npm run telegram:webhook -- https://<domen>');
    }
  }

  console.log('\n✓ Token ishlayapti.');
}

void main();
