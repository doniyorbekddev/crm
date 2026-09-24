import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

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
    return { ok: false, retryable: response.status === 429 || response.status >= 500, error: description.slice(0, 500) };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message.slice(0, 500) : 'Tarmoq xatosi' };
  } finally {
    clearTimeout(timer);
  }
}

export const telegramService = {
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
      return { ok: false, retryable, error: description.slice(0, 500) };
    } catch (error) {
      // Tarmoq xatosi yoki timeout — keyinroq qayta urinib ko'riladi
      return { ok: false, retryable: true, error: error instanceof Error ? error.message.slice(0, 500) : 'Tarmoq xatosi' };
    } finally {
      clearTimeout(timer);
    }
  },
};
