import { escapeHtml, type InlineButton } from '../../services/telegram.service.js';
import { buildCommandReply, type CommandScope } from '../../services/telegramCommand.service.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, grid } from '../keyboards.js';
import type { BotContext, HandlerResult } from '../types.js';
import { STUDENT_ACTIONS, activeChildName } from './student.js';
import { TEACHER_ACTIONS } from './teacher.js';
import { SALES_ACTIONS } from './sales.js';
import { OWNER_ACTIONS } from './owner.js';
import { BROADCAST_ACTIONS } from './broadcast.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { permissionService } from '../../services/permission.service.js';

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

/**
 * Menyu tugmasi: yo mavjud matnli buyruq (`cmd:/darslar`), yo bo'lim amali (`st_profile`).
 * Ikkalasi ham routerda bir xil yo'l bilan ishlanadi.
 */
interface MenuItem {
  text: string;
  data: string;
}

/** Buyruq matni → menyu tugmasi ma'lumoti (`cmd:/darslar`) */
const COMMAND_ACTION = 'cmd';

const STUDENT_ITEMS: readonly MenuItem[] = [
  { text: '📊 Profil', data: callback(STUDENT_ACTIONS.profile) },
  { text: '📅 Dars jadvali', data: callback(COMMAND_ACTION, '/darslar') },
  { text: '✅ Davomat', data: callback(STUDENT_ACTIONS.attendance) },
  { text: '📝 Uy vazifalari', data: callback(STUDENT_ACTIONS.homework) },
  { text: '🎯 Imtihonlar', data: callback(STUDENT_ACTIONS.exams) },
  { text: '⭐ XP & Reyting', data: callback(STUDENT_ACTIONS.xp) },
  { text: '💳 To‘lovlar', data: callback(STUDENT_ACTIONS.payments) },
  { text: '📜 Sertifikatlar', data: callback(STUDENT_ACTIONS.certificates) },
];

const COMMON_ITEMS: readonly MenuItem[] = [
  { text: '🔗 Bog‘lanish holati', data: callback(COMMAND_ACTION, '/holat') },
  { text: '🚫 Bog‘lanishni uzish', data: callback(COMMAND_ACTION, '/uzish') },
];

/** Davomat olish huquqi bo'lgan xodim (o'qituvchi, admin) uchun */
const TEACHER_ITEMS: readonly MenuItem[] = [
  { text: '📅 Bugungi darslar', data: callback(TEACHER_ACTIONS.today) },
  { text: '📚 Guruhlarim', data: callback(TEACHER_ACTIONS.groups) },
];

const SALES_ITEMS: readonly MenuItem[] = [
  { text: '📞 Leadlarim', data: callback(SALES_ACTIONS.leads) },
  { text: '🔥 Qizigan leadlar', data: callback(SALES_ACTIONS.hot) },
  { text: '⏰ Follow-uplar', data: callback(SALES_ACTIONS.followUps) },
];

/**
 * Menyu rolga qarab emas, **ruxsatga** qarab quriladi (TZ §5): `attendance.mark` bo'lsa
 * o'qituvchi, `lead.view` bo'lsa sotuv, `dashboard.view` bo'lsa rahbar bo'limlari —
 * rol nomi qanday bo'lishidan qat'i nazar. Ruxsat bo'lmasa tugma umuman chiqmaydi.
 */
async function itemsFor(scope: CommandScope): Promise<readonly MenuItem[]> {
  if (scope.kind !== 'STAFF') return [...STUDENT_ITEMS, ...COMMON_ITEMS];
  if (!scope.actor) return COMMON_ITEMS;
  const permissions = await permissionService.getRolePermissions(scope.actor.roleId);
  const items: MenuItem[] = [];
  if (permissions.has(PERMISSIONS.DASHBOARD_VIEW)) items.push({ text: '📊 Ko‘rsatkichlar', data: callback(OWNER_ACTIONS.dashboard) });
  if (permissions.has(PERMISSIONS.ATTENDANCE_MARK)) items.push(...TEACHER_ITEMS);
  if (permissions.has(PERMISSIONS.LEAD_VIEW)) items.push(...SALES_ITEMS);
  if (permissions.has(PERMISSIONS.DEBT_VIEW)) items.push({ text: '⚠️ Qarzdorlar', data: callback(OWNER_ACTIONS.debts) });
  if (permissions.has(PERMISSIONS.STUDENT_VIEW)) items.push({ text: '🔥 Xavf ostida', data: callback(OWNER_ACTIONS.risk) });
  if (permissions.has(PERMISSIONS.ALERT_VIEW)) items.push({ text: '🔔 Ogohlantirishlar', data: callback(OWNER_ACTIONS.alerts) });
  if (permissions.has(PERMISSIONS.BROADCAST_SEND)) items.push({ text: '📢 Xabar yuborish', data: callback(BROADCAST_ACTIONS.start) });
  return [...items, ...COMMON_ITEMS];
}

function greeting(scope: CommandScope, childName: string | null): string {
  const name = escapeHtml(scope.label);
  if (scope.kind === 'PARENT') {
    const child = childName ? `\n👤 Faol farzand: <b>${escapeHtml(childName)}</b>` : `\nFarzandlaringiz: ${scope.studentIds.length} ta.`;
    return `Assalomu alaykum, <b>${name}</b>!${child}\n\nKerakli bo‘limni tanlang:`;
  }
  if (scope.kind === 'STUDENT') {
    return `Assalomu alaykum, <b>${name}</b>!\n\nKerakli bo‘limni tanlang:`;
  }
  return `Assalomu alaykum, <b>${name}</b>!\nBu chat xodim hisobiga bog‘langan — eslatmalar shu yerga keladi.\n\nKerakli bo‘limni tanlang:`;
}

/** Bosh menyuni ko'rsatadi */
export async function showMainMenu(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const buttons: InlineButton[] = (await itemsFor(scope)).map((item) => ({ text: item.text, data: item.data }));
  // Bir nechta farzandli ota-ona — almashtirish tugmasi
  if (scope.kind === 'PARENT' && scope.studentIds.length > 1) {
    buttons.unshift({ text: '👨‍👩‍👧 Farzandni tanlash', data: callback(STUDENT_ACTIONS.child) });
  }
  const childName = await activeChildName(context, scope);

  // Bosh menyuda "Bosh menyu" tugmasi keraksiz — shuning uchun `withNavigation` ishlatilmaydi
  await context.render(greeting(scope, childName), grid(buttons));
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
