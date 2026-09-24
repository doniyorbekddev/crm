import { escapeHtml, type InlineButton } from '../../services/telegram.service.js';
import { buildCommandReply, type CommandScope } from '../../services/telegramCommand.service.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, grid } from '../keyboards.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Asosiy menyu va unga ulangan buyruqlar.
 *
 * Menyu **rolga qarab** quriladi: o'quvchi va ota-onaga ma'lumot tugmalari, xodimga esa
 * faqat bog'lanishni boshqarish. Xodim CRM'ga kira oladi, o'quvchi va ota-ona — yo'q,
 * shuning uchun qiymatning katta qismi kabinet tomonida.
 *
 * Tugma bosilganda javob **o'sha xabarning o'rniga** yoziladi (`context.render`), shunda
 * suhbat o'nlab xabar bilan to'lib ketmaydi.
 */

/** Menyudagi tugma → mavjud matnli buyruq */
const STUDENT_ITEMS: ReadonlyArray<{ text: string; command: string }> = [
  { text: '💳 To‘lovlarim', command: '/qarz' },
  { text: '📅 Dars jadvali', command: '/darslar' },
  { text: '✅ Davomatim', command: '/davomat' },
];

const COMMON_ITEMS: ReadonlyArray<{ text: string; command: string }> = [
  { text: '🔗 Bog‘lanish holati', command: '/holat' },
  { text: '🚫 Bog‘lanishni uzish', command: '/uzish' },
];

function itemsFor(scope: CommandScope): ReadonlyArray<{ text: string; command: string }> {
  return scope.kind === 'STAFF' ? COMMON_ITEMS : [...STUDENT_ITEMS, ...COMMON_ITEMS];
}

/** Buyruq matni → menyu tugmasi ma'lumoti (`cmd:/qarz`) */
const COMMAND_ACTION = 'cmd';

function greeting(scope: CommandScope): string {
  const name = escapeHtml(scope.label);
  if (scope.kind === 'PARENT') {
    return `Assalomu alaykum, <b>${name}</b>!\nFarzandlaringiz: ${scope.studentIds.length} ta.\n\nKerakli bo‘limni tanlang:`;
  }
  if (scope.kind === 'STUDENT') {
    return `Assalomu alaykum, <b>${name}</b>!\n\nKerakli bo‘limni tanlang:`;
  }
  return `Assalomu alaykum, <b>${name}</b>!\nBu chat xodim hisobiga bog‘langan — eslatmalar shu yerga keladi.`;
}

/** Bosh menyuni ko'rsatadi */
export async function showMainMenu(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const buttons: InlineButton[] = itemsFor(scope).map((item) => ({
    text: item.text,
    data: callback(COMMAND_ACTION, item.command),
  }));

  // Bosh menyuda "Bosh menyu" tugmasi keraksiz — shuning uchun `withNavigation` ishlatilmaydi
  await context.render(greeting(scope), grid(buttons));
  return { action: MAIN_MENU };
}

/**
 * Matnli buyruq yoki menyu tugmasi.
 *
 * Ikkalasi bitta joyda ishlanadi: tugma `cmd:/qarz` yuboradi, ya'ni buyruqning o'zi.
 * Shu tufayli matndan yozgan ham, tugma bosgan ham bir xil javob oladi.
 */
export async function runCommand(context: BotContext, scope: CommandScope, command: string): Promise<HandlerResult> {
  if (command === '/start' || command === '/menu') {
    return showMainMenu(context, scope);
  }

  // `/uzish` bu yergacha yetib kelmaydi — uni router ushlaydi (bog'lanishni o'chirish kerak)
  const { reply } = await buildCommandReply(scope, command);

  const back: InlineButton[] = [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
  await context.render(reply, [back]);
  return { action: command };
}
