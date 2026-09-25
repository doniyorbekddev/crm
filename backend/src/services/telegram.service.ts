import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

/**
 * Telegram Bot API mijozi.
 *
 * Token berilmagan bo'lsa **o'chirilgan rejim**: xabar yuborilmaydi, faqat logga yoziladi.
 * Shunda butun zanjir (navbat, bog'lanish, qayta urinish) token bo'lmasa ham ishlaydi va
 * sinaladi — bot keyinroq ulanganda hech narsani qayta yozish kerak emas.
 */

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

export interface TelegramSendResult {
  ok: boolean;
  /** Qayta urinish mantiqi uchun: 429 va 5xx — vaqtinchalik, 400/403 — doimiy xato */
  retryable: boolean;
  error?: string;
  /** Yuborilgan xabar identifikatori — keyin uni tahrirlash uchun */
  messageId?: number;
}

/** Inline tugma: `callback_data` 64 baytdan oshmasligi kerak (Telegram cheklovi) */
export interface InlineButton {
  text: string;
  data: string;
}

export type InlineKeyboard = InlineButton[][];

function toReplyMarkup(keyboard: InlineKeyboard | undefined): Record<string, unknown> | undefined {
  if (!keyboard || keyboard.length === 0) return undefined;
  return {
    inline_keyboard: keyboard.map((row) => row.map((button) => ({ text: button.text, callback_data: button.data }))),
  };
}

export function isTelegramEnabled(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

/** Telegram HTML rejimi uchun maxsus belgilar */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Telegram Bot API ga bitta so'rov. Token yo'q bo'lsa — o'chirilgan rejim.
 *
 * Xatoni ikki turga ajratadi: 429/5xx — vaqtinchalik (qayta urinsa bo'ladi),
 * 400/403 — doimiy (chat bloklagan yoki xabar eskirgan, qayta urinish foydasiz).
 */
async function request(method: string, payload: Record<string, unknown>): Promise<TelegramSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.info({ method }, 'Telegram o‘chirilgan — so‘rov yuborilmadi');
    return { ok: false, retryable: false, error: 'Telegram bot tokeni sozlanmagan' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { result?: { message_id?: number } } | null;
      const messageId = body?.result?.message_id;
      return { ok: true, retryable: false, ...(messageId === undefined ? {} : { messageId }) };
    }

    const body = (await response.json().catch(() => null)) as { description?: string } | null;
    const description = body?.description ?? `HTTP ${response.status}`;
    metrics.telegramFailures.inc({ method });
    return { ok: false, retryable: response.status === 429 || response.status >= 500, error: description.slice(0, 500) };
  } catch (error) {
    metrics.telegramFailures.inc({ method });
    return { ok: false, retryable: true, error: error instanceof Error ? error.message.slice(0, 500) : 'Tarmoq xatosi' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Telegram API dan **ma'lumot** olish (yuborish emas).
 *
 * `request()` dan farqi: u faqat "yuborildimi" ni qaytaradi, bu esa javob tanasini beradi —
 * `getUpdates` uchun kerak. Timeout alohida beriladi, chunki long polling ataylab uzoq kutadi.
 */
async function apiCall<T>(method: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T | null> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!response.ok || body?.ok !== true) {
      logger.warn({ method, status: response.status, description: body?.description }, 'Telegram API xatosi');
      return null;
    }
    return body.result ?? null;
  } catch (error) {
    // Long pollingda timeout normal holat — kutish tugadi, yangilik yo'q
    if (error instanceof Error && error.name === 'AbortError') return null;
    logger.warn({ method, err: error }, 'Telegram API ga ulanib bo‘lmadi');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Telegram media: izoh chegarasi (undan uzun matn alohida xabar bo'lib ketadi) */
export const MEDIA_CAPTION_LIMIT = 1024;

export type TelegramMedia =
  | { kind: 'photo' | 'document'; fileId: string }
  | { kind: 'document'; buffer: Buffer; fileName: string; mimeType: string };

/** Fayl yuklab yuborish (multipart) — CRM'da saqlangan faylni, masalan o'quvchi javobini o'qituvchiga */
async function uploadDocument(chatId: string, media: { buffer: Buffer; fileName: string; mimeType: string }, caption: string | undefined): Promise<TelegramSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.info({ method: 'sendDocument' }, 'Telegram o‘chirilgan — fayl yuborilmadi');
    return { ok: false, retryable: false, error: 'Telegram bot tokeni sozlanmagan' };
  }
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob([new Uint8Array(media.buffer)], { type: media.mimeType }), media.fileName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3);
  try {
    const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: controller.signal });
    if (response.ok) return { ok: true, retryable: false };
    const body = (await response.json().catch(() => null)) as { description?: string } | null;
    metrics.telegramFailures.inc({ method: 'sendDocument' });
    return { ok: false, retryable: response.status === 429 || response.status >= 500, error: (body?.description ?? `HTTP ${response.status}`).slice(0, 500) };
  } catch (error) {
    metrics.telegramFailures.inc({ method: 'sendDocument' });
    return { ok: false, retryable: true, error: error instanceof Error ? error.message.slice(0, 500) : 'Tarmoq xatosi' };
  } finally {
    clearTimeout(timer);
  }
}

export const telegramService = {
  /**
   * Rasm yoki hujjat yuborish. `fileId` — Telegramdagi fayl (broadcast: xodim yuborgan rasm bot
   * orqali qayta yuboriladi, qayta yuklanmaydi); `buffer` — CRM'dagi fayl. Izoh 1024 belgidan
   * uzun bo'lsa — media izohsiz, matn alohida xabar bo'lib ketadi.
   */
  async sendMedia(chatId: string, media: TelegramMedia, caption?: string, keyboard?: InlineKeyboard): Promise<TelegramSendResult> {
    const fits = !caption || caption.length <= MEDIA_CAPTION_LIMIT;
    const result =
      'buffer' in media
        ? await uploadDocument(chatId, media, fits ? caption : undefined)
        : await request(media.kind === 'photo' ? 'sendPhoto' : 'sendDocument', {
            chat_id: chatId,
            [media.kind]: media.fileId,
            ...(fits && caption ? { caption, parse_mode: 'HTML' } : {}),
            ...(fits && toReplyMarkup(keyboard) ? { reply_markup: toReplyMarkup(keyboard) } : {}),
          });
    if (result.ok && (!fits || ('buffer' in media && keyboard))) {
      if (!fits && caption) return telegramService.sendMessage(chatId, caption, keyboard);
      if (keyboard) return telegramService.sendMessage(chatId, '⬆️', keyboard);
    }
    return result;
  },

  /**
   * Telegramdagi buyruqlar menyusini yangilaydi (chatdagi "Menu" tugmasi).
   *
   * Har ishga tushishda chaqiriladi: ro'yxat kodda o'zgarsa, menyu ham o'zi yangilanadi va
   * uni qo'lda BotFather orqali kiritish kerak bo'lmaydi. Token yo'q bo'lsa — jimgina o'tadi.
   */
  async setMyCommands(commands: ReadonlyArray<{ command: string; description: string }>): Promise<boolean> {
    if (!env.TELEGRAM_BOT_TOKEN) return false;
    try {
      const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'Telegram buyruqlar menyusi yangilanmadi');
        return false;
      }
      return true;
    } catch (error) {
      // Menyu — qulaylik, u yangilanmagani uchun server ishga tushmay qolmasligi kerak
      logger.warn({ err: error }, 'Telegram buyruqlar menyusi yangilanmadi');
      return false;
    }
  },

  /**
   * Mavjud xabarni **o'rniga** yangilaydi — menyuda yurganda har bosishda yangi xabar
   * yaratilmasin. Tahrirlash imkonsiz bo'lsa (xabar eski yoki o'chirilgan) `ok: false`
   * qaytadi va chaqiruvchi yangi xabar yuboradi.
   */
  async editMessageText(chatId: string, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<TelegramSendResult> {
    return request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(toReplyMarkup(keyboard) ? { reply_markup: toReplyMarkup(keyboard) } : {}),
    });
  },

  /**
   * Tugma bosilganini tasdiqlaydi — Telegramda tugmadagi "soat" aylanib turmasligi uchun.
   * Javob berilmasa foydalanuvchi bot qotib qolgan deb o'ylaydi.
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<TelegramSendResult> {
    return request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: false } : {}),
    });
  },

  /**
   * Yangi update'larni so'raydi (long polling).
   *
   * `offset` — oldingi eng katta `update_id + 1`. Telegram shu raqamdan kichiklarini
   * **o'chiradi**, shuning uchun offset faqat update ishlangandan keyin suriladi: dastur
   * to'xtab qolsa, ishlanmagan xabar yo'qolmaydi.
   */
  async getUpdates(offset: number, timeoutSeconds: number): Promise<unknown[]> {
    const result = await apiCall<unknown[]>(
      'getUpdates',
      { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
      // Telegram `timeout` soniya kutadi; biz undan biroz ko'proq kutamiz
      (timeoutSeconds + 10) * 1_000,
    );
    return result ?? [];
  },

  /**
   * Webhook'ni o'chiradi — polling bilan webhook **birga ishlamaydi** (Telegram
   * `getUpdates` ni 409 bilan rad etadi). Sinov rejimi boshlanishida chaqiriladi.
   */
  async deleteWebhook(): Promise<boolean> {
    const result = await apiCall<boolean>('deleteWebhook', { drop_pending_updates: false }, REQUEST_TIMEOUT_MS);
    return result === true;
  },

  /**
   * Foydalanuvchi yuborgan faylni yuklab oladi (rasm yoki hujjat).
   *
   * Hajm **yuklashdan oldin** tekshiriladi: Telegram `getFile` da o'lchamni beradi, shuning
   * uchun katta faylni tarmoqdan tortib, keyin rad etish shart emas. Telegram botga 20 MB
   * gacha fayl beradi; bizning chegara esa hujjatlar bilan bir xil (`MAX_UPLOAD_MB`).
   */
  async downloadFile(fileId: string, maxBytes: number): Promise<{ buffer: Buffer } | { error: string }> {
    const info = await apiCall<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId }, REQUEST_TIMEOUT_MS);
    if (!info?.file_path) return { error: 'Faylni olib bo‘lmadi' };
    if (info.file_size !== undefined && info.file_size > maxBytes) return { error: 'Fayl juda katta' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3);
    try {
      const response = await fetch(`${API_BASE}/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.file_path}`, { signal: controller.signal });
      if (!response.ok) return { error: 'Faylni yuklab bo‘lmadi' };
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) return { error: 'Fayl juda katta' };
      return { buffer };
    } catch (error) {
      logger.warn({ err: error }, 'Telegram faylini yuklab bo‘lmadi');
      return { error: 'Faylni yuklab bo‘lmadi' };
    } finally {
      clearTimeout(timer);
    }
  },

  /** Production uchun: Telegram update'larni shu manzilga yuboradi */
  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    const result = await apiCall<boolean>(
      'setWebhook',
      { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'] },
      REQUEST_TIMEOUT_MS,
    );
    return result === true;
  },

  async sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<TelegramSendResult> {
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.info({ chatId, text: text.slice(0, 120) }, 'Telegram o‘chirilgan — xabar yuborilmadi');
      return { ok: false, retryable: false, error: 'Telegram bot tokeni sozlanmagan' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(toReplyMarkup(keyboard) ? { reply_markup: toReplyMarkup(keyboard) } : {}),
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { result?: { message_id?: number } } | null;
        const messageId = body?.result?.message_id;
        return { ok: true, retryable: false, ...(messageId === undefined ? {} : { messageId }) };
      }

      const body = (await response.json().catch(() => null)) as { description?: string } | null;
      const description = body?.description ?? `HTTP ${response.status}`;
      // 429 — juda ko'p so'rov, 5xx — Telegram tomonidagi vaqtinchalik nosozlik
      const retryable = response.status === 429 || response.status >= 500;
      metrics.telegramFailures.inc({ method: 'sendMessage' });
      return { ok: false, retryable, error: description.slice(0, 500) };
    } catch (error) {
      // Tarmoq xatosi yoki timeout — keyinroq qayta urinib ko'riladi
      metrics.telegramFailures.inc({ method: 'sendMessage' });
      return { ok: false, retryable: true, error: error instanceof Error ? error.message.slice(0, 500) : 'Tarmoq xatosi' };
    } finally {
      clearTimeout(timer);
    }
  },
};
