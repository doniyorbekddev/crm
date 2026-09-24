import type { InlineButton, InlineKeyboard } from '../services/telegram.service.js';

/**
 * Inline tugmalar va sahifalash.
 *
 * `callback_data` Telegramda **64 baytdan** oshmasligi kerak — oshsa Telegram tugmani
 * umuman qabul qilmaydi va xato aniq ko'rinmaydi. Shuning uchun tugma shu yerda quriladi
 * va uzunligi tekshiriladi.
 *
 * Callback ichidagi ma'lumotga **ishonilmaydi**: u foydalanuvchi tomonidan o'zgartirilishi
 * mumkin (TZ §32). Har handler egalikni qaytadan tekshiradi.
 */

/** Telegram cheklovi */
const MAX_CALLBACK_BYTES = 64;

export const MAIN_MENU = 'menu';
export const BACK_BUTTON_TEXT = '⬅️ Orqaga';
export const MAIN_MENU_BUTTON_TEXT = '🏠 Bosh menyu';

/**
 * Callback ma'lumotini quradi: `action` yoki `action:arg`.
 *
 * Uzun bo'lsa xato tashlanadi — bu dasturchi xatosi va uni ishlab chiqishda ushlash kerak,
 * productionda "tugma ishlamayapti" bo'lib chiqmasin.
 */
export function callback(action: string, arg?: string): string {
  const data = arg === undefined ? action : `${action}:${arg}`;
  if (Buffer.byteLength(data, 'utf8') > MAX_CALLBACK_BYTES) {
    throw new Error(`Telegram callback_data juda uzun (${data.length} belgi): ${action}`);
  }
  return data;
}

/** Callback ma'lumotini harakat va argumentga ajratadi */
export function parseCallback(data: string): { action: string; arg: string | null } {
  const index = data.indexOf(':');
  if (index === -1) return { action: data, arg: null };
  return { action: data.slice(0, index), arg: data.slice(index + 1) };
}

/** Tugmalarni ustunlar soni bo'yicha qatorlarga bo'ladi */
export function grid(buttons: InlineButton[], columns = 2): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let index = 0; index < buttons.length; index += columns) {
    rows.push(buttons.slice(index, index + columns));
  }
  return rows;
}

/** Oxirgi qatorga "Bosh menyu" (va kerak bo'lsa "Orqaga") qo'shadi */
export function withNavigation(keyboard: InlineKeyboard, backAction?: string): InlineKeyboard {
  const row: InlineButton[] = [];
  if (backAction) row.push({ text: BACK_BUTTON_TEXT, data: backAction });
  row.push({ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) });
  return [...keyboard, row];
}

export interface PageInfo {
  page: number;
  totalPages: number;
}

/**
 * Sahifalash qatori: `⬅️  2/5  ➡️`.
 *
 * Chekkadagi tugmalar **ko'rsatilmaydi** (o'chirilgan holda emas): Telegramda o'chirilgan
 * tugma yo'q, bosilsa baribir callback keladi va foydalanuvchi javob kutib qoladi.
 */
export function paginationRow(action: string, info: PageInfo): InlineButton[] {
  if (info.totalPages <= 1) return [];
  const row: InlineButton[] = [];
  if (info.page > 1) row.push({ text: '⬅️', data: callback(action, String(info.page - 1)) });
  row.push({ text: `${info.page}/${info.totalPages}`, data: callback('noop') });
  if (info.page < info.totalPages) row.push({ text: '➡️', data: callback(action, String(info.page + 1)) });
  return row;
}
