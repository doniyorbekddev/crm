import { prisma } from '../config/database.js';
import { telegramService } from '../services/telegram.service.js';
import { resolveCommandScope } from '../services/telegramCommand.service.js';
import { auditService } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';
import { MAIN_MENU, callback, parseCallback } from './keyboards.js';
import { runCommand, showMainMenu } from './handlers/menu.js';
import { allowChat } from './rateLimit.js';
import type { BotContext, TelegramUpdate } from './types.js';

/**
 * Telegram update'ini kerakli handlerga yo'naltiradi.
 *
 * Tartib **ataylab shunday**:
 *   1. chat chegarasi — flood qilayotgan chatga umuman javob yozilmaydi;
 *   2. bog'lanish — tasdiqlanmagan chatga hech qanday ma'lumot va hatto buyruqlar
 *      ro'yxati ham berilmaydi (begona odam bot nima qila olishini bilmasin);
 *   3. handler — ma'lumot doirasi `scope` bilan chegaralangan.
 *
 * Bog'lash (`/start <kod>`) bu yerda emas: u **tasdiqlanmagan** chatdan keladi va
 * `telegramLink.service.ts` da ishlanadi.
 */

/** Tasdiqlanmagan chatga beriladigan yagona javob */
const NOT_LINKED_REPLY = 'Bog‘lash uchun CRM’dagi havoladan foydalaning.';

const UNLINK_COMMAND = '/uzish';
/** Tasdiqlangan uzish — faqat shu tugma haqiqatan o'chiradi */
const UNLINK_CONFIRM = 'unlink_yes';

export interface RouteResult {
  handled: boolean;
  action: string | null;
}

/** Update'dan kontekst quradi. Chat aniqlanmasa — null (bunday update e'tiborsiz qoldiriladi). */
function buildContext(update: TelegramUpdate): Omit<BotContext, 'scope' | 'reply' | 'render'> | null {
  const callbackQuery = update.callback_query;
  if (callbackQuery?.data && callbackQuery.message?.chat?.id !== undefined) {
    return {
      chatId: String(callbackQuery.message.chat.id),
      telegramUserId: callbackQuery.from?.id === undefined ? null : String(callbackQuery.from.id),
      text: null,
      callbackData: callbackQuery.data,
      callbackQueryId: callbackQuery.id ?? null,
      messageId: callbackQuery.message.message_id ?? null,
    };
  }

  const message = update.message;
  const text = message?.text?.trim();
  if (message?.chat?.id !== undefined && text) {
    return {
      chatId: String(message.chat.id),
      telegramUserId: message.from?.id === undefined ? null : String(message.from.id),
      text,
      callbackData: null,
      callbackQueryId: null,
      messageId: message.message_id ?? null,
    };
  }

  return null;
}

/** Javob yuborish usullari — handler Telegram API ni bilmaydi */
function attachReplies(base: Omit<BotContext, 'scope' | 'reply' | 'render'>, scope: BotContext['scope']): BotContext {
  const reply: BotContext['reply'] = async (text, keyboard) => {
    await telegramService.sendMessage(base.chatId, text, keyboard);
  };

  return {
    ...base,
    scope,
    reply,
    // Tugma bosilgan bo'lsa — o'sha xabarni yangilaymiz; bo'lmasa yangi xabar.
    // Tahrirlash muvaffaqiyatsiz bo'lsa (xabar eski yoki o'chirilgan) baribir javob boradi.
    render: async (text, keyboard) => {
      if (base.messageId !== null && base.callbackQueryId !== null) {
        const result = await telegramService.editMessageText(base.chatId, base.messageId, text, keyboard);
        if (result.ok) return;
      }
      await reply(text, keyboard);
    },
  };
}

/** Kiruvchi hodisani jurnalga yozadi. Foydalanuvchi matni **saqlanmaydi**. */
async function logEvent(input: {
  chatId: string | null;
  telegramUserId: string | null;
  kind: string;
  action: string | null;
  status: 'OK' | 'IGNORED' | 'THROTTLED' | 'FAILED';
  error?: string;
  durationMs: number;
}): Promise<void> {
  try {
    await prisma.telegramEvent.create({
      data: {
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        kind: input.kind,
        action: input.action,
        status: input.status,
        error: input.error?.slice(0, 500) ?? null,
        durationMs: input.durationMs,
      },
    });
  } catch (error) {
    // Jurnal yozilmagani uchun bot ishlamay qolmasligi kerak
    logger.warn({ err: error }, 'Telegram hodisa jurnaliga yozilmadi');
  }
}

/** Buyruq nomini ajratadi: `/qarz@bot arg` → `/qarz` */
function commandOf(text: string): string {
  const first = text.split(/\s+/)[0] ?? '';
  const withoutMention = first.split('@')[0] ?? first;
  return withoutMention.toLowerCase();
}

export async function routeUpdate(update: TelegramUpdate): Promise<RouteResult> {
  const started = Date.now();
  const base = buildContext(update);
  if (!base) return { handled: false, action: null };

  const kind = base.callbackData === null ? 'message' : 'callback_query';

  if (!allowChat(base.chatId)) {
    await logEvent({ ...base, kind, action: null, status: 'THROTTLED', durationMs: Date.now() - started });
    return { handled: false, action: null };
  }

  const link = await prisma.telegramLink.findFirst({
    where: { chatId: base.chatId, isActive: true, verifiedAt: { not: null } },
    select: { id: true, userId: true, studentId: true, parentId: true },
  });

  if (!link) {
    const context = attachReplies(base, null);
    await context.reply(NOT_LINKED_REPLY);
    await logEvent({ ...base, kind, action: null, status: 'IGNORED', durationMs: Date.now() - started });
    return { handled: true, action: null };
  }

  const scope = await resolveCommandScope(link);
  if (!scope) {
    // Egasi o'chirilgan (masalan, o'quvchi arxivlangan) — bog'lanish ham yopiladi
    await prisma.telegramLink.update({ where: { id: link.id }, data: { isActive: false } });
    const context = attachReplies(base, null);
    await context.reply('Bog‘lanish egasi topilmadi. CRM’dan yangi havola oling.');
    await logEvent({ ...base, kind, action: 'owner_missing', status: 'IGNORED', durationMs: Date.now() - started });
    return { handled: true, action: 'owner_missing' };
  }

  const context = attachReplies(base, scope);

  try {
    // Tugma bosilgani darrov tasdiqlanadi — Telegramda "soat" aylanib qolmasin
    if (context.callbackQueryId) await telegramService.answerCallbackQuery(context.callbackQueryId);

    const parsed = base.callbackData === null ? null : parseCallback(base.callbackData);
    const action = parsed === null ? commandOf(base.text ?? '') : parsed.action;
    // Menyu tugmasi buyruqni `cmd:/uzish` ko'rinishida yuboradi — ikkala yo'l ham bir xil amalga olib borsin
    const command = parsed === null ? action : parsed.action === 'cmd' ? commandOf(parsed.arg ?? '') : null;

    // Uzish — yagona buzuvchi amal, shuning uchun routerda va **ikki qadamda**.
    // Telegram `/uzish` matnini bosiladigan havola qilib ko'rsatadi, ya'ni uni tasodifan
    // bosish juda oson. Shuning uchun avval tasdiq so'raladi (TZ §47).
    if (command === UNLINK_COMMAND) {
      await context.render('Bog‘lanishni uzasizmi?\n\nEslatmalar bu chatga kelmay qoladi.', [
        [
          { text: '✅ Ha, uzilsin', data: callback(UNLINK_CONFIRM) },
          { text: '❌ Bekor qilish', data: callback(MAIN_MENU) },
        ],
      ]);
      await logEvent({ ...base, kind, action: 'unlink_ask', status: 'OK', durationMs: Date.now() - started });
      return { handled: true, action: 'unlink_ask' };
    }

    if (action === UNLINK_CONFIRM) {
      await prisma.telegramLink.delete({ where: { id: link.id } });
      // TZ §33: uzish ham audit qilinadi — bog'lash bilan bir xil darajada muhim
      await auditService.record({
        userId: link.userId,
        action: 'telegram.unlinked',
        entityType: 'telegram_link',
        entityId: link.id,
        metadata: { chatId: base.chatId, source: 'bot' },
        ip: null,
        userAgent: null,
      });
      await context.render(
        'Bog‘lanish uzildi. Eslatmalar endi bu chatga kelmaydi.\nQayta ulash uchun CRM’dan yangi havola oling.',
      );
      await logEvent({ ...base, kind, action: 'unlink', status: 'OK', durationMs: Date.now() - started });
      return { handled: true, action: 'unlink' };
    }

    const result =
      base.callbackData === null
        ? await runCommand(context, scope, base.text ?? '')
        : await handleCallback(context, scope, base.callbackData);

    await logEvent({ ...base, kind, action: result?.action ?? action, status: 'OK', durationMs: Date.now() - started });
    return { handled: true, action: result?.action ?? action };
  } catch (error) {
    // Foydalanuvchiga hech qachon texnik xato ko'rsatilmaydi (TZ §46)
    logger.error({ err: error, chatId: base.chatId }, 'Telegram handler xatosi');
    await context.reply('❌ Xatolik yuz berdi.\n\nIltimos, birozdan keyin qayta urinib ko‘ring.');
    await logEvent({
      ...base,
      kind,
      action: null,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'noma’lum xato',
      durationMs: Date.now() - started,
    });
    return { handled: true, action: null };
  }
}

/** Tugma bosilganda. Callback ichidagi ma'lumotga ishonilmaydi — doira `scope` dan olinadi. */
async function handleCallback(context: BotContext, scope: NonNullable<BotContext['scope']>, data: string) {
  const { action, arg } = parseCallback(data);

  switch (action) {
    case MAIN_MENU:
      return showMainMenu(context, scope);
    case 'cmd':
      return runCommand(context, scope, arg ?? '');
    case 'noop':
      // Sahifa raqami tugmasi — hech nima qilmaydi
      return { action: 'noop' };
    default:
      return showMainMenu(context, scope);
  }
}
