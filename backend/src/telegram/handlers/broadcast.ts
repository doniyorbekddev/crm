import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { permissionService } from '../../services/permission.service.js';
import { AUDIENCE_LABELS, broadcastService } from '../../services/broadcast.service.js';
import { groupService } from '../../services/group.service.js';
import { escapeHtml, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { MAX_BROADCAST_BUTTONS, broadcastButtonSchema, type BroadcastButton, type BroadcastInput } from '../../validators/broadcast.validator.js';
import type { GroupListQuery } from '../../validators/group.validator.js';
import { fmtDateTime } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, paginationRow } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Ommaviy xabar oqimi: auditoriya → (guruh/kurs) → matn → oldindan ko'rish → yuborish.
 *
 * Yuborishning o'zi `broadcastService.send` — ruxsat, filial doirasi, navbat va audit o'sha
 * yerda. Bot faqat qadamlarni yig'adi va **oldindan ko'rishda nechta chatga ketishini** aytadi:
 * 500 kishiga tasodifan yuborib qo'yish oson, shuning uchun tasdiqsiz yuborilmaydi (TZ §34).
 */

export const BROADCAST_ACTIONS = {
  start: 'bc_start',
  audience: 'bc_aud',
  groups: 'bc_grp',
  courses: 'bc_crs',
  parents: 'bc_par',
  send: 'bc_send',
  list: 'bc_list',
  /** Havola tugmasi qo'shish (TZ 3.1 GAP-15) */
  addButton: 'bc_btn',
  clearButtons: 'bc_btnclr',
} as const;

export const BROADCAST_FLOW = 'broadcast';
/** Oqim ichidagi tugmalar — sessiyani yopmaydi */
export const BROADCAST_FLOW_ACTIONS: ReadonlySet<string> = new Set([BROADCAST_ACTIONS.send, BROADCAST_ACTIONS.parents, BROADCAST_ACTIONS.addButton, BROADCAST_ACTIONS.clearButtons]);

const BOT_CLIENT: ClientInfo = { ip: null, userAgent: 'telegram-bot' };
const PAGE_SIZE = 8;

interface Draft {
  audience: BroadcastInput['audience'];
  targetId?: string | null;
  includeParents?: boolean;
  message?: string;
  /** TZ §43 "Broadcast Media": rasm yoki hujjat (Telegram file_id) */
  media?: { kind: 'photo' | 'document'; fileId: string } | null;
  /** Havola tugmalari: [{ text, url }] (https, ko'pi bilan 3) */
  buttons?: BroadcastButton[];
}

function inputOf(draft: Draft, message: string): BroadcastInput {
  return { audience: draft.audience, targetId: draft.targetId ?? undefined, includeParents: draft.includeParents ?? false, message, buttons: draft.buttons ?? [] };
}

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

function cancelRow(): InlineKeyboard {
  return [[{ text: '❌ Bekor qilish', data: callback(MAIN_MENU) }]];
}

/** Xodim va `broadcast.send` ruxsati — servis ham tekshiradi, lekin oqim boshlanmasdan aytish to'g'riroq */
async function requireActor(context: BotContext, scope: CommandScope): Promise<AuthUser | null> {
  if (!scope.actor) {
    await context.render('Bu bo‘lim xodimlar uchun.', [menuRow()]);
    return null;
  }
  const permissions = await permissionService.getRolePermissions(scope.actor.roleId);
  if (!permissions.has(PERMISSIONS.BROADCAST_SEND)) {
    await context.render('❌ Ommaviy xabar yuborish huquqingiz yo‘q.', [menuRow()]);
    return null;
  }
  return scope.actor;
}

async function safely(context: BotContext, work: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      await context.render(`❌ ${escapeHtml(error.message)}`, [menuRow()]);
      return { action: 'broadcast_error' };
    }
    throw error;
  }
}

function draftOf(session: SessionState | null): Draft | null {
  if (!session || session.flow !== BROADCAST_FLOW) return null;
  const data = session.data as Partial<Draft>;
  return typeof data.audience === 'string' ? (data as Draft) : null;
}

async function saveDraft(chatId: string, step: string, draft: Draft): Promise<void> {
  await telegramSessionService.set(chatId, { flow: BROADCAST_FLOW, step, data: draft as never });
}

// ---------------------------------------------------------------------
// Auditoriya tanlash
// ---------------------------------------------------------------------

export async function startBroadcast(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.start };

  await telegramSessionService.clearFlow(context.chatId);
  await context.render('<b>📢 Xabar yuborish</b>\n\nKimga yuboramiz?', [
    [
      { text: '👨‍🎓 Barcha o‘quvchilar', data: callback(BROADCAST_ACTIONS.audience, 'STUDENTS') },
      { text: '👨‍👩‍👧 Barcha ota-onalar', data: callback(BROADCAST_ACTIONS.audience, 'PARENTS') },
    ],
    [
      { text: '👥 Guruh', data: callback(BROADCAST_ACTIONS.groups) },
      { text: '📚 Kurs', data: callback(BROADCAST_ACTIONS.courses) },
    ],
    [
      { text: '👨‍🏫 O‘qituvchilar', data: callback(BROADCAST_ACTIONS.audience, 'TEACHERS') },
      { text: '🧑‍💼 Barcha xodimlar', data: callback(BROADCAST_ACTIONS.audience, 'STAFF') },
    ],
    [{ text: '📋 Oxirgi xabarlar', data: callback(BROADCAST_ACTIONS.list) }, ...menuRow()],
  ]);
  return { action: BROADCAST_ACTIONS.start };
}

export async function chooseGroup(context: BotContext, scope: CommandScope, pageArg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.groups };

  const requested = Number(pageArg ?? '1');
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const { items, total } = await groupService.list(actor, { page, limit: PAGE_SIZE, status: 'ACTIVE', sortBy: 'name' } as GroupListQuery);
  if (items.length === 0) {
    await context.render('Faol guruh yo‘q.', [menuRow()]);
    return { action: BROADCAST_ACTIONS.groups };
  }
  const keyboard: InlineKeyboard = items.map((group) => [
    { text: `👥 ${group.name} · ${group.studentCount}`, data: callback(BROADCAST_ACTIONS.audience, `GROUP:${group.id}`) },
  ]);
  const pager = paginationRow(BROADCAST_ACTIONS.groups, { page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  if (pager.length > 0) keyboard.push(pager);
  keyboard.push([{ text: '⬅️ Orqaga', data: callback(BROADCAST_ACTIONS.start) }, ...menuRow()]);
  await context.render('<b>📢 Qaysi guruhga?</b>', keyboard);
  return { action: BROADCAST_ACTIONS.groups };
}

export async function chooseCourse(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.courses };

  const courses = await prisma.course.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 30 });
  if (courses.length === 0) {
    await context.render('Faol kurs yo‘q.', [menuRow()]);
    return { action: BROADCAST_ACTIONS.courses };
  }
  const keyboard: InlineKeyboard = courses.map((course) => [{ text: `📚 ${course.name}`, data: callback(BROADCAST_ACTIONS.audience, `COURSE:${course.id}`) }]);
  keyboard.push([{ text: '⬅️ Orqaga', data: callback(BROADCAST_ACTIONS.start) }, ...menuRow()]);
  await context.render('<b>📢 Qaysi kursga?</b>', keyboard);
  return { action: BROADCAST_ACTIONS.courses };
}

/** `bc_aud:STUDENTS` yoki `bc_aud:GROUP:<id>` — auditoriya tanlandi, endi matn kutiladi */
export async function chooseAudience(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !arg) return { action: BROADCAST_ACTIONS.audience };
  const [audience, targetId] = arg.split(':') as [string, string | undefined];
  if (!(audience in AUDIENCE_LABELS)) return startBroadcast(context, scope);

  const draft: Draft = { audience: audience as Draft['audience'], targetId: targetId ?? null, includeParents: false };

  // Guruh/kurs uchun: ota-onalar ham olsinmi? Shu yerda so'raladi, matndan oldin
  if ((audience === 'GROUP' || audience === 'COURSE') && targetId) {
    await saveDraft(context.chatId, 'parents', draft);
    await context.render('Ota-onalarga ham yuborilsinmi?', [
      [
        { text: '👨‍🎓 Faqat o‘quvchilarga', data: callback(BROADCAST_ACTIONS.parents, 'no') },
        { text: '👨‍👩‍👧 O‘quvchi + ota-ona', data: callback(BROADCAST_ACTIONS.parents, 'yes') },
      ],
      ...cancelRow(),
    ]);
    return { action: BROADCAST_ACTIONS.audience };
  }

  await saveDraft(context.chatId, 'text', draft);
  await context.render(`<b>📢 ${AUDIENCE_LABELS[draft.audience]}</b>\n\nXabar matnini yozing (2000 belgigacha) yoki izoh bilan rasm/hujjat yuboring.`, cancelRow());
  return { action: BROADCAST_ACTIONS.audience };
}

export async function chooseParents(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.parents };
  const draft = draftOf(await telegramSessionService.get(context.chatId));
  if (!draft) return startBroadcast(context, scope);

  draft.includeParents = arg === 'yes';
  await saveDraft(context.chatId, 'text', draft);
  await context.render(`<b>📢 ${AUDIENCE_LABELS[draft.audience]}${draft.includeParents ? ' + ota-onalar' : ''}</b>\n\nXabar matnini yozing (2000 belgigacha).`, cancelRow());
  return { action: BROADCAST_ACTIONS.parents };
}

// ---------------------------------------------------------------------
// Matn → oldindan ko'rish → yuborish
// ---------------------------------------------------------------------

/** Oldindan ko'rish: kimga, nechta chat, media, tugmalar, matn — va Yuborish / Tugma / Bekor */
async function renderPreview(context: BotContext, actor: AuthUser, draft: Draft): Promise<HandlerResult> {
  return safely(context, async () => {
    const preview = await broadcastService.preview(actor, inputOf(draft, draft.message!));
    await saveDraft(context.chatId, 'confirm', draft);

    if (preview.recipients === 0) {
      await telegramSessionService.clearFlow(context.chatId);
      await context.reply(`«${escapeHtml(preview.label)}» auditoriyasida Telegram ulagan hech kim yo‘q — yuborishga hojat yo‘q.`, [menuRow()]);
      return { action: 'broadcast_empty' };
    }

    const buttons = draft.buttons ?? [];
    const keyboard: InlineKeyboard = [[{ text: `✅ Yuborish (${preview.recipients})`, data: callback(BROADCAST_ACTIONS.send) }]];
    const extra: InlineButton[] = [];
    if (buttons.length < MAX_BROADCAST_BUTTONS) extra.push({ text: '🔗 Tugma qo‘shish', data: callback(BROADCAST_ACTIONS.addButton) });
    if (buttons.length > 0) extra.push({ text: '🧹 Tugmalarni olib tashlash', data: callback(BROADCAST_ACTIONS.clearButtons) });
    keyboard.push(extra, [{ text: '❌ Bekor qilish', data: callback(MAIN_MENU) }]);
    await context.reply(
      [
        '<b>📢 Oldindan ko‘rish</b>',
        `Kimga: <b>${escapeHtml(preview.label)}</b> — <b>${preview.recipients}</b> ta chat`,
        ...(draft.media ? [draft.media.kind === 'photo' ? '🖼 Rasm bilan' : '📎 Hujjat bilan'] : []),
        '',
        '— — —',
        escapeHtml(draft.message!),
        ...buttons.map((button) => `[🔗 ${escapeHtml(button.text)}] → ${escapeHtml(button.url)}`),
        '— — —',
        '',
        'Yuborilsinmi?',
      ].join('\n'),
      keyboard,
    );
    return { action: 'broadcast_preview' };
  });
}

export async function handleBroadcastFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const draft = draftOf(session);
  // Havola tugmasi: "Matn | https://..."
  if (scope.actor && draft?.message && session.step === 'button') {
    const [text, url] = (context.text ?? '').split('|').map((part) => part.trim());
    const parsed = broadcastButtonSchema.safeParse({ text: text ?? '', url: url ?? '' });
    if (!parsed.success) {
      await context.reply(`❌ ${escapeHtml(parsed.error.issues[0]?.message ?? 'Noto‘g‘ri')}\n\nFormat: <code>Tugma matni | https://manzil.uz</code>`, cancelRow());
      return { action: 'broadcast_button_invalid' };
    }
    draft.buttons = [...(draft.buttons ?? []), parsed.data].slice(0, MAX_BROADCAST_BUTTONS);
    return renderPreview(context, scope.actor, draft);
  }
  if (!scope.actor || !draft || session.step !== 'text') {
    if (session.step === 'confirm') {
      await context.reply('Yuborish uchun «✅ Yuborish» tugmasini bosing.', cancelRow());
      return { action: 'broadcast_wait_confirm' };
    }
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Xabar yuborish bekor qilindi.', [menuRow()]);
    return { action: 'broadcast_cancel' };
  }

  // Rasm yoki hujjat izoh bilan yuborilishi mumkin — fayl hamma chatga shu izoh bilan boradi
  const media = context.attachment ? { kind: context.attachment.kind === 'photo' ? ('photo' as const) : ('document' as const), fileId: context.attachment.fileId } : null;
  const text = (context.text ?? '').trim() || (media ? (media.kind === 'photo' ? '🖼 Rasm' : '📎 Hujjat') : '');
  if (text.length < 2 || text.length > 2000) {
    await context.reply('Xabar 2 dan 2000 belgigacha bo‘lsin. Qaytadan yozing.', cancelRow());
    return { action: 'broadcast_text_invalid' };
  }
  draft.message = text;
  draft.media = media;
  return renderPreview(context, scope.actor, draft);
}

/** "🔗 Tugma qo'shish" — keyingi xabar "Matn | https://..." */
export async function askButton(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.addButton };
  const draft = draftOf(await telegramSessionService.get(context.chatId));
  if (!draft?.message) return startBroadcast(context, scope);
  if ((draft.buttons ?? []).length >= MAX_BROADCAST_BUTTONS) return renderPreview(context, actor, draft);
  await saveDraft(context.chatId, 'button', draft);
  await context.render('🔗 Tugma matni va havolani yozing:\n<code>Ro‘yxatdan o‘tish | https://example.uz/kurs</code>\n\nFaqat https:// havolalar.', cancelRow());
  return { action: BROADCAST_ACTIONS.addButton };
}

export async function clearButtons(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.clearButtons };
  const draft = draftOf(await telegramSessionService.get(context.chatId));
  if (!draft?.message) return startBroadcast(context, scope);
  draft.buttons = [];
  return renderPreview(context, actor, draft);
}

export async function confirmBroadcast(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.send };
  const session = await telegramSessionService.get(context.chatId);
  const draft = draftOf(session);
  if (!draft?.message || session?.step !== 'confirm') {
    await context.render('Xabar ma’lumoti topilmadi. Qaytadan boshlang.', [[{ text: '📢 Xabar yuborish', data: callback(BROADCAST_ACTIONS.start) }, ...menuRow()]]);
    return { action: BROADCAST_ACTIONS.send };
  }

  return safely(context, async () => {
    const result = await broadcastService.send(
      actor,
      inputOf(draft, draft.message!),
      BOT_CLIENT,
      draft.media ?? null,
    );
    await telegramSessionService.clearFlow(context.chatId);
    await context.render(
      `✅ <b>Xabar navbatga qo‘yildi</b>\nKimga: ${escapeHtml(result.label)} — ${result.recipients} ta chat.\n\nYetkazilish holatini «📋 Oxirgi xabarlar»da ko‘rasiz.`,
      [[{ text: '📋 Oxirgi xabarlar', data: callback(BROADCAST_ACTIONS.list) }, ...menuRow()]],
    );
    return { action: 'broadcast_sent' };
  });
}

export async function listBroadcasts(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: BROADCAST_ACTIONS.list };

  return safely(context, async () => {
    const items = await broadcastService.list(actor, 5);
    if (items.length === 0) {
      await context.render('📋 Hali xabar yuborilmagan.', [[{ text: '📢 Xabar yuborish', data: callback(BROADCAST_ACTIONS.start) }, ...menuRow()]]);
      return { action: BROADCAST_ACTIONS.list };
    }
    const lines = ['<b>📋 Oxirgi xabarlar</b>', ''];
    for (const item of items) {
      lines.push(`📢 <b>${escapeHtml(item.label)}</b> · ${fmtDateTime(item.createdAt)}${item.createdBy ? ` · ${escapeHtml(item.createdBy)}` : ''}`);
      lines.push(`   🎯 ${item.recipients} mo‘ljal · ✅ ${item.sent} yuborildi · ⏳ ${item.pending} kutmoqda · ❌ ${item.failed} yetmadi${item.mediaKind ? (item.mediaKind === 'photo' ? ' · 🖼' : ' · 📎') : ''}${item.buttons.length ? ` · 🔗${item.buttons.length}` : ''}`);
      lines.push(`   <i>${escapeHtml(item.message.slice(0, 80))}${item.message.length > 80 ? '…' : ''}</i>`);
    }
    await context.render(lines.join('\n'), [[{ text: '📢 Yangi xabar', data: callback(BROADCAST_ACTIONS.start) }, ...menuRow()]]);
    return { action: BROADCAST_ACTIONS.list };
  });
}

export const BROADCAST_COMMANDS: Readonly<Record<string, string>> = { '/xabar': BROADCAST_ACTIONS.start };

export async function handleBroadcastAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case BROADCAST_ACTIONS.start:
      return startBroadcast(context, scope);
    case BROADCAST_ACTIONS.audience:
      return chooseAudience(context, scope, arg);
    case BROADCAST_ACTIONS.groups:
      return chooseGroup(context, scope, arg);
    case BROADCAST_ACTIONS.courses:
      return chooseCourse(context, scope);
    case BROADCAST_ACTIONS.parents:
      return chooseParents(context, scope, arg);
    case BROADCAST_ACTIONS.send:
      return confirmBroadcast(context, scope);
    case BROADCAST_ACTIONS.list:
      return listBroadcasts(context, scope);
    case BROADCAST_ACTIONS.addButton:
      return askButton(context, scope);
    case BROADCAST_ACTIONS.clearButtons:
      return clearButtons(context, scope);
    default:
      return undefined;
  }
}
