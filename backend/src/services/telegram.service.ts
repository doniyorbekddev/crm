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
}

export function isTelegramEnabled(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

/** Telegram HTML rejimi uchun maxsus belgilar */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const telegramService = {
  async sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
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
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: controller.signal,
      });

      if (response.ok) return { ok: true, retryable: false };

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
