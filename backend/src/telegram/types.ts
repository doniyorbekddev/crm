import type { InlineKeyboard } from '../services/telegram.service.js';
import type { CommandScope } from '../services/telegramCommand.service.js';

/**
 * Telegramdan keladigan update'ning **bizga kerak bo'lgan** qismi.
 *
 * Telegram yuboradigan tuzilma juda katta; bu yerda faqat ishlatiladigan maydonlar bor.
 * Qolgani ataylab tiplanmaydi — kerak bo'lmagan maydonga tayanib qolmaslik uchun.
 */
export interface TelegramChat {
  id?: number | string;
  type?: string;
  first_name?: string;
  title?: string;
}

export interface TelegramFrom {
  id?: number | string;
  is_bot?: boolean;
}

export interface TelegramMessage {
  message_id?: number;
  chat?: TelegramChat;
  from?: TelegramFrom;
  text?: string;
}

export interface TelegramCallbackQuery {
  id?: string;
  data?: string;
  from?: TelegramFrom;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * Bitta update uchun ish konteksti.
 *
 * Handler shu obyektdan boshqa hech narsaga tayanmaydi: chat kimligi, nima so'ralgani va
 * javobni qanday yuborish — hammasi shu yerda. Shu tufayli handlerni testda Telegram'siz
 * chaqirish mumkin.
 */
export interface BotContext {
  chatId: string;
  /** Telegram foydalanuvchi id — guruh chatida chatId dan farq qiladi */
  telegramUserId: string | null;
  /** Xabar matni (callback bo'lsa — null) */
  text: string | null;
  /** Bosilgan tugma ma'lumoti */
  callbackData: string | null;
  /** Tugma bosilganini tasdiqlash uchun */
  callbackQueryId: string | null;
  /** Tugma qaysi xabarda bosilgan — o'sha xabarni tahrirlash uchun */
  messageId: number | null;
  /** Bog'langan bo'lsa — kim va qaysi o'quvchilarni ko'radi; bog'lanmagan bo'lsa null */
  scope: CommandScope | null;

  /** Yangi xabar yuboradi */
  reply(text: string, keyboard?: InlineKeyboard): Promise<void>;
  /**
   * Menyuni **o'rniga** yangilaydi (tugma bosilganda). Tahrirlash imkonsiz bo'lsa —
   * yangi xabar yuboriladi, shunda foydalanuvchi javobsiz qolmaydi.
   */
  render(text: string, keyboard?: InlineKeyboard): Promise<void>;
}

/** Handler natijasi — `action` jurnalga yoziladi (foydalanuvchi matni emas) */
export type HandlerResult = { action: string } | null;

export type BotHandler = (context: BotContext) => Promise<HandlerResult>;
