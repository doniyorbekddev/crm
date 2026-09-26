/* eslint-disable no-console -- CLI: natija terminalga chiqariladi */
import { env } from '../config/env.js';
import { telegramService } from '../services/telegram.service.js';

/**
 * Telegram CLI amallari (TZ 3.1, audit S9): `src/` ichida — `tsc` ularni `dist/cli/` ga kompilyatsiya qiladi,
 * shuning uchun production image'da (tsx va `scripts/` yo'q) `node dist/cli/…` bilan ishlaydi.
 * Dev'da `scripts/telegram*.ts` shu funksiyalarni chaqiradi — mantiq bitta.
 *
 * Token va secret **hech qachon chiqarilmaydi** — faqat "bor/yo'q" va uzunligi.
 */

export const WEBHOOK_PATH = '/api/telegram/webhook';

/** Chiqish kodi: 0 — muvaffaqiyat */
export async function runWebhook(argument: string | undefined): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN sozlanmagan — .env ni to‘ldiring.');
    return 1;
  }

  if (argument === '--delete') {
    const ok = await telegramService.deleteWebhook();
    console.log(ok ? 'Webhook o‘chirildi.' : 'Webhook o‘chirilmadi — loglarni tekshiring.');
    return ok ? 0 : 1;
  }

  if (!argument || !argument.startsWith('https://')) {
    console.error('Ishlatish: telegram:webhook https://<domen>   yoki   --delete');
    console.error('Telegram faqat HTTPS manzilni qabul qiladi.');
    return 1;
  }

  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    // Secret bo'lmasa webhook controlleri **hech qanday** so'rovni qabul qilmaydi —
    // bot jim qolardi va sababi ko'rinmasdi.
    console.error('TELEGRAM_WEBHOOK_SECRET sozlanmagan — usiz webhook so‘rovlari rad etiladi.');
    return 1;
  }

  const url = `${argument.replace(/\/$/, '')}${WEBHOOK_PATH}`;
  const ok = await telegramService.setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
  console.log(ok ? `Webhook o‘rnatildi: ${url}` : 'Webhook o‘rnatilmadi — loglarni tekshiring.');
  return ok ? 0 : 1;
}

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

/** Token ishlayaptimi, bot kim, webhook holati — "bot javob bermayapti" da birinchi buyruq */
export async function runCheck(): Promise<number> {
  console.log('Sozlama:');
  console.log(`  TELEGRAM_BOT_TOKEN      ${env.TELEGRAM_BOT_TOKEN ? `bor (${env.TELEGRAM_BOT_TOKEN.length} belgi)` : '— YO‘Q'}`);
  console.log(`  TELEGRAM_BOT_USERNAME   ${env.TELEGRAM_BOT_USERNAME ?? '— yo‘q'}`);
  console.log(`  TELEGRAM_WEBHOOK_SECRET ${env.TELEGRAM_WEBHOOK_SECRET ? `bor (${env.TELEGRAM_WEBHOOK_SECRET.length} belgi)` : '— YO‘Q'}`);
  console.log(`  TELEGRAM_POLLING        ${env.TELEGRAM_POLLING ? 'true (sinov rejimi)' : 'false (webhook rejimi)'}`);
  console.log('');

  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('Token sozlanmagan — .env dagi TELEGRAM_BOT_TOKEN ni to‘ldiring.');
    return 1;
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
    return 1;
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
      console.warn('⚠️  Webhook rejimi tanlangan, lekin webhook o‘rnatilmagan: telegram:webhook https://<domen>');
    }
  }

  console.log('\n✓ Token ishlayapti.');
  return 0;
}
