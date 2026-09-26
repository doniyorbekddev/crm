import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { aiAssistantService } from '../../services/ai/assistant.service.js';
import { onlinePaymentService } from '../../services/payments/onlinePayment.service.js';
import { paymentScheduleService } from '../../services/paymentSchedule.service.js';
import { permissionService } from '../../services/permission.service.js';
import { referralService } from '../../services/referral.service.js';
import { escapeHtml, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { fmtDate, moneyUz } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';
import { STUDENT_ACTIONS, resolveStudentId } from './student.js';

/**
 * PHASE 10–12: to'lov tugmasi, do'st taklifi (referral), AI yordamchi.
 *
 * Uchalasi ham mavjud CRM servislariga tayanadi; bot hech qanday hisob yoki mantiq
 * qo'shmaydi — faqat ko'rsatadi va so'rovni uzatadi.
 */

export const EXTRA_ACTIONS = {
  /** O'quvchi: onlayn to'lov holati */
  payNow: 'st_paynow',
  /** O'quvchi: do'st taklifi kodi va natijalari */
  referral: 'st_ref',
  /** Xodim: AI yordamchi oqimini boshlash */
  aiStart: 'ai_start',
  /** Xodim: taklif qilingan savolni yuborish (indeks sessiyadan) */
  aiSuggest: 'ai_s',
} as const;

export const AI_FLOW = 'ai';
/** Oqim ichidagi tugma — sessiyani yopmaydi */
export const EXTRA_FLOW_ACTIONS: ReadonlySet<string> = new Set([EXTRA_ACTIONS.aiSuggest]);

const BOT_CLIENT: ClientInfo = { ip: null, userAgent: 'telegram-bot' };

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

// ---------------------------------------------------------------------
// 10. To'lov tugmasi
// ---------------------------------------------------------------------

/**
 * TZ §36: bot to'lovni **o'zi tasdiqlamaydi** — faqat provayder webhook'i orqali CRM tasdiqlaydi.
 * Provayder (Click/Payme) hali ulanmagan bo'lsa, o'quvchi buni aniq ko'radi va qarzini
 * qayerda to'lashni biladi. Provayder ulangach, shu tugma to'lov havolasini beradi.
 */
export async function showPayNow(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await resolveStudentId(context, scope);
  if (!studentId) {
    await context.render('Bu bo‘lim o‘quvchi va ota-onalar uchun.', [menuRow()]);
    return { action: EXTRA_ACTIONS.payNow };
  }

  const [schedule, providers] = await Promise.all([paymentScheduleService.get(studentId), Promise.resolve(onlinePaymentService.providers())]);
  const remaining = Math.max(0, schedule.contractTotal - schedule.paid);
  // Ichki sinov provayderi haqiqiy to'lov emas — o'quvchiga ko'rsatilmaydi; Click/Payme sinov kassasi — "sinov" belgisi bilan
  const configured = providers.filter((provider) => provider.configured && (provider.key === 'CLICK' || provider.key === 'PAYME'));

  const lines = ['<b>💳 Onlayn to‘lov</b>', ''];
  const keyboard: InlineKeyboard = [];
  if (remaining <= 0) {
    lines.push('✅ Qarzingiz yo‘q — to‘lash shart emas.');
  } else {
    lines.push(`Qoldiq: <b>${moneyUz(remaining)}</b>`);
    if (schedule.nextDue) lines.push(`Keyingi muddat: ${fmtDate(schedule.nextDue.dueDate)} — ${moneyUz(schedule.nextDue.amount)}`);
    lines.push('');
    if (configured.length === 0) {
      lines.push('Onlayn to‘lov (Click/Payme) hali ulanmagan.', 'To‘lovni markaz kassasida yoki administrator bilan kelishib o‘tkazma orqali qiling.');
    } else {
      // Summa — keyingi muddatdagi (bo'lmasa qoldiq), qoldiqdan oshmaydi; so'm butun
      const amount = Math.round(Math.min(remaining, schedule.nextDue?.amount ?? remaining));
      lines.push(`To‘lanadigan summa: <b>${moneyUz(amount)}</b>`, 'To‘lov tasdiqlangach kvitansiya CRM’da avtomatik yoziladi va shu yerga xabar keladi.');
      for (const provider of configured) {
        try {
          const intent = await onlinePaymentService.intentForFamily(studentId, provider.key, amount);
          if (intent.checkoutUrl) {
            const label = provider.key === 'PAYME' ? 'Payme' : 'Click';
            keyboard.push([{ text: `💳 ${label} orqali to‘lash${provider.mode === 'production' ? '' : ' (sinov)'}`, data: '', url: intent.checkoutUrl }]);
          }
        } catch {
          // Summa juda kichik va h.k. — tugma chiqmaydi, kassaga yo'naltiriladi
        }
      }
      if (configured.some((provider) => provider.mode !== 'production')) lines.push('', '⚠️ Sinov rejimi — haqiqiy pul yechilmaydi.');
      if (keyboard.length === 0) lines.push('To‘lov havolasini yaratib bo‘lmadi — kassaga murojaat qiling.');
    }
  }

  keyboard.push([{ text: '⬅️ To‘lovlar', data: callback(STUDENT_ACTIONS.payments) }, ...menuRow()]);
  await context.render(lines.join('\n'), keyboard);
  return { action: EXTRA_ACTIONS.payNow };
}

// ---------------------------------------------------------------------
// 11. Do'st taklifi
// ---------------------------------------------------------------------

const REFERRAL_STATUS = { PENDING: '🕐 kutilmoqda', CONVERTED: '✅ o‘qishni boshladi', REWARDED: '🎁 bonus berildi', CANCELLED: '🚫 bekor' } as const;

/**
 * Havola emas, **kod**: markazda ro'yxatdan o'tish jonli suhbatda bo'ladi, manager kodni lead
 * kartasiga yozadi — mavjud referral tizimi shunday ishlaydi. Bot faqat kodni va natijani ko'rsatadi.
 */
export async function showReferral(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await resolveStudentId(context, scope);
  if (!studentId) {
    await context.render('Bu bo‘lim o‘quvchi va ota-onalar uchun.', [menuRow()]);
    return { action: EXTRA_ACTIONS.referral };
  }

  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { referralCode: true, firstName: true } });
  if (!student?.referralCode) {
    await context.render('🎁 Taklif kodi hali berilmagan — administratorga murojaat qiling.', [menuRow()]);
    return { action: EXTRA_ACTIONS.referral };
  }

  const { items } = await referralService.list({ page: 1, limit: 10, studentId });
  const rewarded = items.filter((item) => item.status === 'REWARDED').reduce((sum, item) => sum + item.bonusAmount, 0);

  const lines = [
    '<b>🎁 Do‘stingizni taklif qiling</b>',
    '',
    `Sizning kodingiz: <code>${escapeHtml(student.referralCode)}</code>`,
    'Do‘stingiz ro‘yxatdan o‘tayotganda shu kodni aytsin — u o‘qishni boshlagach sizga bonus beriladi.',
    '',
    `Takliflar: <b>${items.length}</b>${rewarded > 0 ? ` · olingan bonus: <b>${moneyUz(rewarded)}</b>` : ''}`,
  ];
  for (const item of items.slice(0, 5)) {
    const who = item.referred?.name ?? item.lead?.name ?? '—';
    lines.push(`• ${escapeHtml(who)} — ${REFERRAL_STATUS[item.status]}`);
  }

  const share = encodeURIComponent(`Men IT-Academy'da o'qiyapman. Ro'yxatdan o'tganda mening taklif kodimni ayting: ${student.referralCode}`);
  await context.render(lines.join('\n'), [
    [{ text: '📤 Do‘stga ulashish', data: callback('noop') }],
    [{ text: '🏠 Bosh menyu', data: callback(MAIN_MENU) }],
  ]);
  // Ulashish — Telegram share havolasi alohida xabar sifatida (inline tugmada URL emas, matn)
  await context.reply(`Ulashish uchun: https://t.me/share/url?url=${share}`);
  return { action: EXTRA_ACTIONS.referral };
}

// ---------------------------------------------------------------------
// 12. AI yordamchi
// ---------------------------------------------------------------------

async function canUseAi(scope: CommandScope): Promise<boolean> {
  if (!scope.actor) return false;
  const permissions = await permissionService.getRolePermissions(scope.actor.roleId);
  // Web bilan bir xil: biznes yoki akademik yordamchi ruxsati (har tool o'z ruxsatini tekshiradi)
  return permissions.has(PERMISSIONS.AI_ASSISTANT) || permissions.has(PERMISSIONS.AI_ACADEMIC);
}

function suggestionKeyboard(suggestions: string[]): InlineKeyboard {
  const rows: InlineKeyboard = suggestions.slice(0, 4).map((question, index) => [{ text: `💬 ${question.slice(0, 50)}`, data: callback(EXTRA_ACTIONS.aiSuggest, String(index)) }]);
  rows.push([{ text: '❌ Yakunlash', data: callback(MAIN_MENU) }]);
  return rows;
}

/** Oqimni ochadi: keyingi har bir matn — savol. Takliflar sessiyada saqlanadi (callback 64 baytga sig'maydi) */
export async function startAi(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  if (!(await canUseAi(scope))) {
    await context.render('❌ AI yordamchidan foydalanish huquqingiz yo‘q.', [menuRow()]);
    return { action: EXTRA_ACTIONS.aiStart };
  }
  const tools = await aiAssistantService.tools(scope.actor!);
  const suggestions = tools.filter((tool) => tool.allowed).flatMap((tool) => tool.samples.slice(0, 1)).slice(0, 4);
  await telegramSessionService.set(context.chatId, { flow: AI_FLOW, step: 'ask', data: { suggestions } });
  await context.render(
    '<b>🤖 AI yordamchi</b>\n\nSavolingizni oddiy tilda yozing — javob CRM ma’lumotlaridan olinadi. Masalan, pastdagi savollardan birini bosing.',
    suggestionKeyboard(suggestions),
  );
  return { action: EXTRA_ACTIONS.aiStart };
}

async function answer(context: BotContext, scope: CommandScope, question: string): Promise<HandlerResult> {
  const result = await aiAssistantService.ask(scope.actor!, { question }, BOT_CLIENT);
  const lines: string[] = [];
  if (result.answered) {
    lines.push(`<b>${escapeHtml(result.answer)}</b>`);
    for (const detail of result.details.slice(0, 8)) lines.push(`• ${escapeHtml(detail)}`);
    if (result.tool) lines.push('', `<i>${escapeHtml(result.tool.title)}</i>`);
  } else {
    lines.push(`🤔 ${escapeHtml(result.failure ?? 'Savol tushunilmadi.')}`);
    lines.push('', 'Quyidagilardan birini so‘rab ko‘ring:');
  }
  await telegramSessionService.set(context.chatId, { flow: AI_FLOW, step: 'ask', data: { suggestions: result.suggestions } });
  await context.reply(lines.join('\n'), suggestionKeyboard(result.suggestions));
  return { action: result.answered ? 'ai_answered' : 'ai_unanswered' };
}

export async function handleAiFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const question = (context.text ?? '').trim();
  if (!(await canUseAi(scope)) || session.flow !== AI_FLOW) {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('AI yordamchi yopildi.', [menuRow()]);
    return { action: 'ai_closed' };
  }
  if (question.length < 3 || question.length > 500) {
    await context.reply('Savol 3 dan 500 belgigacha bo‘lsin.', suggestionKeyboard((session.data.suggestions as string[] | undefined) ?? []));
    return { action: 'ai_invalid' };
  }
  return answer(context, scope, question);
}

/** Taklif tugmasi bosildi — savol matni sessiyadan olinadi (indeks tekshiriladi) */
export async function askSuggestion(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  if (!(await canUseAi(scope))) return startAi(context, scope);
  const session = await telegramSessionService.get(context.chatId);
  const suggestions = session?.flow === AI_FLOW && Array.isArray(session.data.suggestions) ? (session.data.suggestions as string[]) : [];
  const index = Number(arg);
  const question = Number.isInteger(index) ? suggestions[index] : undefined;
  if (!question) return startAi(context, scope);
  return answer(context, scope, question);
}

export const EXTRA_STUDENT_COMMANDS: Readonly<Record<string, string>> = { '/taklif': EXTRA_ACTIONS.referral };
export const EXTRA_STAFF_COMMANDS: Readonly<Record<string, string>> = { '/ai': EXTRA_ACTIONS.aiStart };

export async function handleExtraAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case EXTRA_ACTIONS.payNow:
      return showPayNow(context, scope);
    case EXTRA_ACTIONS.referral:
      return showReferral(context, scope);
    case EXTRA_ACTIONS.aiStart:
      return startAi(context, scope);
    case EXTRA_ACTIONS.aiSuggest:
      return askSuggestion(context, scope, arg);
    default:
      return undefined;
  }
}
