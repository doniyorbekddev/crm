import { LEAD_STATUS_LABELS } from '../../config/leadLabels.js';
import { callService } from '../../services/call.service.js';
import { followUpService } from '../../services/followUp.service.js';
import { leadService, type LeadDetailDto, type LeadListItemDto } from '../../services/lead.service.js';
import { escapeHtml, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { FollowUpListQuery } from '../../validators/followUp.validator.js';
import type { LeadListQuery } from '../../validators/lead.validator.js';
import { fmtDate, fmtDateTime, localDayAt, parseLocalDateTime } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, paginationRow } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Sotuv bo'limlari: leadlar, qizigan leadlar, follow-uplar, lead statusini o'zgartirish.
 *
 * Hammasi `scope.actor` nomidan mavjud `leadService` / `followUpService` orqali — "faqat menga
 * biriktirilgan leadlar" qoidasi (`leadAccess.ts`) CRM'dagi bilan bir xil, botda takrorlanmagan.
 *
 * Statusni o'zgartirish CRM servisida: u yerda audit, faollik tarixi va tekshiruvlar bor
 * (masalan, o'quvchiga aylantirilgan leadga tegib bo'lmaydi). `WON` bot orqali qo'yilmaydi —
 * u kurs/guruh tanlab o'quvchiga aylantirish, CRM sahifasida qilinadi.
 */

export const SALES_ACTIONS = {
  leads: 'sl_leads',
  hot: 'sl_hot',
  lead: 'sl_lead',
  status: 'sl_st',
  followUps: 'sl_fu',
  followUp: 'sl_fud',
  followUpDone: 'sl_fuok',
  /** TZ §43 "Call logging": natija tanlash → izoh (ixtiyoriy) */
  call: 'sl_call',
  callResult: 'sl_cr',
  callSave: 'sl_cs',
  /** TZ §43 "Follow-up creation": tezkor muddat yoki o'z sanasi */
  followUpNew: 'sl_fn',
  followUpWhen: 'sl_fw',
} as const;

/** Qo'ng'iroq izohini kutish va follow-up sanasini kutish oqimlari */
export const CALL_NOTE_FLOW = 'call_note';
export const FOLLOWUP_DATE_FLOW = 'followup_date';
/** Oqim ichidagi tugmalar — sessiyani yopmaydi */
export const SALES_FLOW_ACTIONS: ReadonlySet<string> = new Set([SALES_ACTIONS.callSave]);

const CALL_RESULT_LABELS = {
  ANSWERED: '✅ Gaplashdik',
  INTERESTED: '🔥 Qiziqdi',
  CALLBACK: '🔁 Qayta qo‘ng‘iroq',
  NO_ANSWER: '📵 Javob bermadi',
  BUSY: '⏳ Band',
  NOT_INTERESTED: '👎 Qiziqmadi',
  WRONG_NUMBER: '❌ Noto‘g‘ri raqam',
} as const;
type CallResult = keyof typeof CALL_RESULT_LABELS;

/** Tezkor follow-up muddatlari (o'quv markaz vaqti bilan) */
const FOLLOWUP_PRESETS = {
  h1: { label: '⏱ 1 soatdan keyin', at: (now: Date) => new Date(now.getTime() + 3_600_000) },
  e18: { label: '🌆 Bugun 18:00', at: (now: Date) => localDayAt(0, 18, 0, now) },
  t10: { label: '🌅 Ertaga 10:00', at: (now: Date) => localDayAt(1, 10, 0, now) },
  d3: { label: '📅 3 kundan keyin', at: (now: Date) => localDayAt(3, 10, 0, now) },
} as const;
type FollowUpPreset = keyof typeof FOLLOWUP_PRESETS;

/** Yo'qotilgan lead uchun sabab so'raladi (matnli oqim) */
export const LEAD_LOST_FLOW = 'lead_lost';

const BOT_CLIENT: ClientInfo = { ip: null, userAgent: 'telegram-bot' };
const PAGE_SIZE = 8;

/** Bot orqali qo'yish mumkin bo'lgan statuslar (WON — CRM'da, o'quvchiga aylantirish bilan) */
const BOT_STATUSES = ['CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'CALLBACK', 'LOST'] as const;
type BotStatus = (typeof BOT_STATUSES)[number];

/** Ochiq (yopilmagan) leadlar */
const OPEN_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'CALLBACK'] as const;

const TEMPERATURE = { COLD: '🧊', WARM: '🌤', HOT: '🔥', VERY_HOT: '🔥🔥' } as const;

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

async function requireActor(context: BotContext, scope: CommandScope): Promise<AuthUser | null> {
  if (scope.actor) return scope.actor;
  await context.render('Bu bo‘lim xodimlar uchun.', [menuRow()]);
  return null;
}

async function safely(context: BotContext, backAction: string, work: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      await context.render(`❌ ${escapeHtml(error.message)}`, [[{ text: '⬅️ Orqaga', data: callback(backAction) }, ...menuRow()]]);
      return { action: 'sales_error' };
    }
    throw error;
  }
}

function leadName(lead: LeadListItemDto): string {
  return `${lead.firstName}${lead.lastName ? ` ${lead.lastName}` : ''}`;
}

function leadButton(lead: LeadListItemDto): InlineButton {
  const heat = lead.temperature ? TEMPERATURE[lead.temperature] : '';
  return { text: `${heat} ${leadName(lead)} · ${LEAD_STATUS_LABELS[lead.status]}`.trim(), data: callback(SALES_ACTIONS.lead, lead.id) };
}

// ---------------------------------------------------------------------
// Ro'yxatlar
// ---------------------------------------------------------------------

export async function showLeads(context: BotContext, scope: CommandScope, pageArg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: SALES_ACTIONS.leads };

  const requested = Number(pageArg ?? '1');
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const query = { page, limit: PAGE_SIZE, assignedTo: 'me', status: [...OPEN_STATUSES], sortBy: 'updatedAt' } as unknown as LeadListQuery;
  const { items, total } = await leadService.list(actor, query);

  if (items.length === 0) {
    await context.render('📞 Sizga biriktirilgan ochiq lead yo‘q.', [menuRow()]);
    return { action: SALES_ACTIONS.leads };
  }

  const keyboard: InlineKeyboard = items.map((lead) => [leadButton(lead)]);
  const pager = paginationRow(SALES_ACTIONS.leads, { page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  if (pager.length > 0) keyboard.push(pager);
  keyboard.push(menuRow());

  await context.render(`<b>📞 Leadlarim</b> · ${total} ta ochiq`, keyboard);
  return { action: SALES_ACTIONS.leads };
}

/** Eng qizigan leadlar — VERY_HOT, keyin HOT */
export async function showHotLeads(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: SALES_ACTIONS.hot };

  const load = (temperature: 'VERY_HOT' | 'HOT') =>
    leadService.list(actor, { page: 1, limit: PAGE_SIZE, assignedTo: 'me', status: [...OPEN_STATUSES], temperature, sortBy: 'score' } as unknown as LeadListQuery);
  const [veryHot, hot] = await Promise.all([load('VERY_HOT'), load('HOT')]);
  const items = [...veryHot.items, ...hot.items].slice(0, PAGE_SIZE);

  if (items.length === 0) {
    await context.render('🔥 Hozircha qizigan lead yo‘q.', [[{ text: '📞 Leadlarim', data: callback(SALES_ACTIONS.leads) }, ...menuRow()]]);
    return { action: SALES_ACTIONS.hot };
  }

  const keyboard: InlineKeyboard = items.map((lead) => [leadButton(lead)]);
  keyboard.push(menuRow());
  await context.render(`<b>🔥 Qizigan leadlar</b> · ${veryHot.total + hot.total} ta`, keyboard);
  return { action: SALES_ACTIONS.hot };
}

// ---------------------------------------------------------------------
// Lead kartochkasi va status
// ---------------------------------------------------------------------

function leadCard(lead: LeadDetailDto): string {
  const heat = lead.temperature ? `${TEMPERATURE[lead.temperature]} ` : '';
  return [
    `<b>👤 ${escapeHtml(leadName(lead))}</b> · ${escapeHtml(lead.code)}`,
    `📱 ${escapeHtml(lead.phone)}${lead.telegram ? ` · ${escapeHtml(lead.telegram)}` : ''}`,
    `📚 ${lead.course ? escapeHtml(lead.course.name) : '—'}`,
    `📌 ${LEAD_STATUS_LABELS[lead.status]}`,
    lead.score === null ? '' : `${heat}Skor: <b>${lead.score}</b>/100`,
    `📥 Manba: ${escapeHtml(lead.source.name)}`,
    `🕐 Oxirgi aloqa: ${lead.lastContactedAt ? fmtDateTime(lead.lastContactedAt) : '—'}`,
    `⏰ Keyingi follow-up: ${lead.nextFollowUpAt ? fmtDateTime(lead.nextFollowUpAt) : '—'}`,
    lead.notes ? `📝 ${escapeHtml(lead.notes.slice(0, 300))}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function statusKeyboard(lead: LeadDetailDto): InlineKeyboard {
  // Joriy status va yopiq leadlar uchun almashtirish tugmalari ko'rsatilmaydi
  const closed = lead.status === 'WON' || lead.status === 'LOST' || lead.student !== null;
  const rows: InlineKeyboard = [];
  if (!closed) {
    const buttons = BOT_STATUSES.filter((status) => status !== lead.status).map((status) => ({
      text: status === 'LOST' ? '❌ Yo‘qotildi' : LEAD_STATUS_LABELS[status],
      data: callback(SALES_ACTIONS.status, `${lead.id}:${status}`),
    }));
    for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  }
  rows.push([
    { text: '📞 Qo‘ng‘iroq yozish', data: callback(SALES_ACTIONS.call, lead.id) },
    { text: '⏰ Follow-up', data: callback(SALES_ACTIONS.followUpNew, lead.id) },
  ]);
  rows.push([{ text: '⬅️ Leadlar', data: callback(SALES_ACTIONS.leads) }, ...menuRow()]);
  return rows;
}

export async function showLead(context: BotContext, scope: CommandScope, leadId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !leadId) return { action: SALES_ACTIONS.lead };
  return safely(context, SALES_ACTIONS.leads, async () => {
    const lead = await leadService.getById(actor, leadId);
    const hint = lead.student ? '\n\n✅ O‘quvchiga aylantirilgan.' : lead.status === 'NEGOTIATION' ? '\n\nSotilsa — CRM’da «O‘quvchiga aylantirish».' : '';
    await context.render(leadCard(lead) + hint, statusKeyboard(lead));
    return { action: SALES_ACTIONS.lead };
  });
}

/** `sl_st:<leadId>:<STATUS>` — LOST uchun avval sabab so'raladi */
export async function changeStatus(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !arg) return { action: SALES_ACTIONS.status };
  const [leadId, status] = arg.split(':') as [string, string | undefined];
  if (!leadId || !status || !(BOT_STATUSES as readonly string[]).includes(status)) {
    return showLead(context, scope, leadId || null);
  }

  if (status === 'LOST') {
    await telegramSessionService.set(context.chatId, { flow: LEAD_LOST_FLOW, step: 'reason', data: { leadId } });
    await context.render('Yo‘qotilish <b>sababini</b> yozing (masalan: «narx qimmat», «boshqa markazga ketdi»).', [
      [{ text: '❌ Bekor qilish', data: callback(SALES_ACTIONS.lead, leadId) }],
    ]);
    return { action: 'lead_lost_ask' };
  }

  return safely(context, SALES_ACTIONS.leads, async () => {
    await leadService.setStatus(actor, leadId, { status: status as Exclude<BotStatus, 'LOST'>, lostReason: undefined, comment: 'Telegram bot orqali' }, BOT_CLIENT);
    return showLead(context, scope, leadId);
  });
}

export async function handleLeadLostFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const leadId = typeof session.data.leadId === 'string' ? session.data.leadId : null;
  const reason = (context.text ?? '').trim();
  if (!scope.actor || !leadId) {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Bekor qilindi.', [menuRow()]);
    return { action: 'lead_lost_cancel' };
  }
  if (reason.length < 2 || reason.length > 255) {
    await context.reply('Sabab 2 dan 255 belgigacha bo‘lsin. Qaytadan yozing.', [[{ text: '❌ Bekor qilish', data: callback(SALES_ACTIONS.lead, leadId) }]]);
    return { action: 'lead_lost_invalid' };
  }
  const actor = scope.actor;
  await telegramSessionService.clearFlow(context.chatId);
  return safely(context, SALES_ACTIONS.leads, async () => {
    await leadService.setStatus(actor, leadId, { status: 'LOST', lostReason: reason, comment: 'Telegram bot orqali' }, BOT_CLIENT);
    await context.reply('❌ Lead yo‘qotilgan deb belgilandi.', [[{ text: '📞 Leadlar', data: callback(SALES_ACTIONS.leads) }, ...menuRow()]]);
    return { action: 'lead_lost' };
  });
}

// ---------------------------------------------------------------------
// Follow-uplar
// ---------------------------------------------------------------------

const FOLLOW_UP_STATE = { PENDING: '🕐', OVERDUE: '⏰', DONE: '✅', CANCELLED: '🚫' } as const;

export async function showFollowUps(context: BotContext, scope: CommandScope, scopeArg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: SALES_ACTIONS.followUps };

  const listScope = scopeArg === 'overdue' || scopeArg === 'upcoming' ? scopeArg : 'today';
  const query = { page: 1, limit: PAGE_SIZE, scope: listScope, assignedTo: 'me' } as unknown as FollowUpListQuery;
  const { items, total } = await followUpService.list(actor, query);

  const title = { today: 'Bugungi', overdue: 'Kechikkan', upcoming: 'Kelgusi' }[listScope];
  const switcher: InlineButton[] = (['today', 'overdue', 'upcoming'] as const)
    .filter((value) => value !== listScope)
    .map((value) => ({ text: { today: 'Bugun', overdue: '⏰ Kechikkan', upcoming: 'Kelgusi' }[value], data: callback(SALES_ACTIONS.followUps, value) }));

  if (items.length === 0) {
    await context.render(`⏰ ${title} follow-up yo‘q.`, [switcher, menuRow()]);
    return { action: SALES_ACTIONS.followUps };
  }

  const keyboard: InlineKeyboard = items.map((item) => [
    { text: `${FOLLOW_UP_STATE[item.state]} ${item.lead.firstName} · ${item.title.slice(0, 30)}`, data: callback(SALES_ACTIONS.followUp, item.id) },
  ]);
  keyboard.push(switcher, menuRow());
  await context.render(`<b>⏰ ${title} follow-uplar</b> · ${total} ta`, keyboard);
  return { action: SALES_ACTIONS.followUps };
}

export async function showFollowUp(context: BotContext, scope: CommandScope, id: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !id) return { action: SALES_ACTIONS.followUp };
  return safely(context, SALES_ACTIONS.followUps, async () => {
    // Alohida "getById" yo'q — ro'yxatdan topiladi (bitta id bo'yicha filtr)
    const { items } = await followUpService.list(actor, { page: 1, limit: 1, scope: 'all', assignedTo: undefined } as unknown as FollowUpListQuery);
    const item = items.find((row) => row.id === id) ?? (await findFollowUp(actor, id));
    if (!item) throw AppError.notFound('Follow-up topilmadi');

    const lines = [
      `<b>⏰ ${escapeHtml(item.title)}</b> ${FOLLOW_UP_STATE[item.state]}`,
      `👤 ${escapeHtml(item.lead.firstName)}${item.lead.lastName ? ` ${escapeHtml(item.lead.lastName)}` : ''} · ${escapeHtml(item.lead.phone)}`,
      `📅 Muddat: ${fmtDateTime(item.dueAt)}`,
      item.notes ? `📝 ${escapeHtml(item.notes)}` : '',
      item.completedAt ? `✅ Bajarildi: ${fmtDate(item.completedAt)}` : '',
    ].filter(Boolean);

    const keyboard: InlineKeyboard = [];
    if (item.state === 'PENDING' || item.state === 'OVERDUE') {
      keyboard.push([{ text: '✅ Bajarildi', data: callback(SALES_ACTIONS.followUpDone, item.id) }]);
    }
    keyboard.push([{ text: '👤 Lead', data: callback(SALES_ACTIONS.lead, item.leadId) }, { text: '⬅️ Follow-uplar', data: callback(SALES_ACTIONS.followUps) }], menuRow());
    await context.render(lines.join('\n'), keyboard);
    return { action: SALES_ACTIONS.followUp };
  });
}

/** Ro'yxat filtri id ni qo'llamaydi — barcha sahifalarni aylanib topish o'rniga lead bo'yicha qidiriladi */
async function findFollowUp(actor: AuthUser, id: string) {
  for (const scopeValue of ['overdue', 'today', 'upcoming', 'done'] as const) {
    const { items } = await followUpService.list(actor, { page: 1, limit: 50, scope: scopeValue } as unknown as FollowUpListQuery);
    const found = items.find((row) => row.id === id);
    if (found) return found;
  }
  return null;
}

export async function completeFollowUp(context: BotContext, scope: CommandScope, id: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !id) return { action: SALES_ACTIONS.followUpDone };
  return safely(context, SALES_ACTIONS.followUps, async () => {
    await followUpService.complete(actor, id, { comment: 'Telegram bot orqali', nextDueAt: undefined, nextTitle: undefined }, BOT_CLIENT);
    await context.render('✅ Follow-up bajarildi deb belgilandi.', [[{ text: '⏰ Follow-uplar', data: callback(SALES_ACTIONS.followUps) }, ...menuRow()]]);
    return { action: 'followup_done' };
  });
}

// ---------------------------------------------------------------------
// Qo'ng'iroq yozish (TZ §43 "Call logging") — CRM callService orqali (audit, faollik, lead holati)
// ---------------------------------------------------------------------

export async function askCallResult(context: BotContext, scope: CommandScope, leadId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !leadId) return { action: SALES_ACTIONS.call };
  return safely(context, SALES_ACTIONS.leads, async () => {
    const lead = await leadService.getById(actor, leadId);
    const buttons = (Object.keys(CALL_RESULT_LABELS) as CallResult[]).map((result) => ({ text: CALL_RESULT_LABELS[result], data: callback(SALES_ACTIONS.callResult, `${lead.id}:${result}`) }));
    const keyboard: InlineKeyboard = [];
    for (let index = 0; index < buttons.length; index += 2) keyboard.push(buttons.slice(index, index + 2));
    keyboard.push([{ text: '⬅️ Lead', data: callback(SALES_ACTIONS.lead, lead.id) }, ...menuRow()]);
    await context.render(`<b>📞 ${escapeHtml(leadName(lead))}</b> · ${escapeHtml(lead.phone)}\n\nQo‘ng‘iroq natijasi?`, keyboard);
    return { action: SALES_ACTIONS.call };
  });
}

export async function chooseCallResult(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !arg) return { action: SALES_ACTIONS.callResult };
  const [leadId, result] = arg.split(':') as [string, string | undefined];
  if (!leadId || !result || !(result in CALL_RESULT_LABELS)) return showLead(context, scope, leadId || null);
  return safely(context, SALES_ACTIONS.leads, async () => {
    await leadService.getById(actor, leadId);
    await telegramSessionService.set(context.chatId, { flow: CALL_NOTE_FLOW, step: 'note', data: { leadId, result } });
    await context.render(`${CALL_RESULT_LABELS[result as CallResult]}\n\nQisqa izoh yozing (nima kelishildi) yoki izohsiz saqlang.`, [
      [{ text: '💾 Izohsiz saqlash', data: callback(SALES_ACTIONS.callSave) }],
      [{ text: '❌ Bekor qilish', data: callback(SALES_ACTIONS.lead, leadId) }],
    ]);
    return { action: SALES_ACTIONS.callResult };
  });
}

async function saveCall(context: BotContext, actor: AuthUser, data: { leadId: string; result: CallResult }, notes: string | undefined): Promise<HandlerResult> {
  await telegramSessionService.clearFlow(context.chatId);
  return safely(context, SALES_ACTIONS.leads, async () => {
    await callService.create(
      actor,
      { leadId: data.leadId, direction: 'OUTGOING', status: 'COMPLETED', result: data.result, durationSec: 0, notes, calledAt: undefined, nextCallAt: undefined },
      BOT_CLIENT,
    );
    const next: InlineKeyboard = [
      [{ text: '⏰ Follow-up qo‘yish', data: callback(SALES_ACTIONS.followUpNew, data.leadId) }, { text: '👤 Lead', data: callback(SALES_ACTIONS.lead, data.leadId) }],
      menuRow(),
    ];
    await context.render(`✅ Qo‘ng‘iroq yozildi: ${CALL_RESULT_LABELS[data.result]}${notes ? `\n📝 ${escapeHtml(notes)}` : ''}`, next);
    return { action: 'call_logged' };
  });
}

export async function saveCallWithoutNote(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const session = await telegramSessionService.get(context.chatId);
  const leadId = typeof session?.data.leadId === 'string' ? session.data.leadId : null;
  const result = typeof session?.data.result === 'string' ? (session.data.result as CallResult) : null;
  if (!actor || session?.flow !== CALL_NOTE_FLOW || !leadId || !result) {
    await context.render('Qo‘ng‘iroq ma’lumoti topilmadi. Lead kartasidan qaytadan boshlang.', [menuRow()]);
    return { action: SALES_ACTIONS.callSave };
  }
  return saveCall(context, actor, { leadId, result }, undefined);
}

// ---------------------------------------------------------------------
// Follow-up yaratish (TZ §43 "Follow-up creation")
// ---------------------------------------------------------------------

export async function askFollowUpWhen(context: BotContext, scope: CommandScope, leadId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !leadId) return { action: SALES_ACTIONS.followUpNew };
  return safely(context, SALES_ACTIONS.leads, async () => {
    const lead = await leadService.getById(actor, leadId);
    await telegramSessionService.set(context.chatId, { flow: FOLLOWUP_DATE_FLOW, step: 'date', data: { leadId: lead.id } });
    const presets = (Object.keys(FOLLOWUP_PRESETS) as FollowUpPreset[]).map((key) => ({ text: FOLLOWUP_PRESETS[key].label, data: callback(SALES_ACTIONS.followUpWhen, `${lead.id}:${key}`) }));
    await context.render(
      `<b>⏰ Follow-up: ${escapeHtml(leadName(lead))}</b>\n\nMuddatni tanlang yoki o‘zingiz yozing: <code>25.12.2026 15:30</code>`,
      [presets.slice(0, 2), presets.slice(2, 4), [{ text: '⬅️ Lead', data: callback(SALES_ACTIONS.lead, lead.id) }, ...menuRow()]],
    );
    return { action: SALES_ACTIONS.followUpNew };
  });
}

async function createFollowUp(context: BotContext, actor: AuthUser, leadId: string, dueAt: Date): Promise<HandlerResult> {
  await telegramSessionService.clearFlow(context.chatId);
  return safely(context, SALES_ACTIONS.leads, async () => {
    const created = await followUpService.create(
      actor,
      { leadId, title: 'Qayta bog‘lanish', dueAt, remindAt: undefined, notes: 'Telegram bot orqali', assignedToId: undefined },
      BOT_CLIENT,
    );
    await context.render(`✅ Follow-up qo‘yildi: <b>${fmtDateTime(created.dueAt)}</b>\nEslatma muddatdan oldin shu chatga keladi.`, [
      [{ text: '👤 Lead', data: callback(SALES_ACTIONS.lead, leadId) }, { text: '⏰ Follow-uplar', data: callback(SALES_ACTIONS.followUps) }],
      menuRow(),
    ]);
    return { action: 'followup_created' };
  });
}

export async function chooseFollowUpPreset(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !arg) return { action: SALES_ACTIONS.followUpWhen };
  const [leadId, preset] = arg.split(':') as [string, string | undefined];
  if (!leadId || !preset || !(preset in FOLLOWUP_PRESETS)) return showLead(context, scope, leadId || null);
  return createFollowUp(context, actor, leadId, FOLLOWUP_PRESETS[preset as FollowUpPreset].at(new Date()));
}

/** Oqimlar: qo'ng'iroq izohi yoki follow-up sanasi matn bilan */
export async function handleSalesFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const leadId = typeof session.data.leadId === 'string' ? session.data.leadId : null;
  if (!scope.actor || !leadId) {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Bekor qilindi.', [menuRow()]);
    return { action: 'sales_flow_cancel' };
  }
  const text = (context.text ?? '').trim();
  if (session.flow === CALL_NOTE_FLOW) {
    const result = typeof session.data.result === 'string' ? (session.data.result as CallResult) : null;
    if (!result || text.length < 2 || text.length > 2000) {
      await context.reply('Izoh 2 dan 2000 belgigacha bo‘lsin yoki «Izohsiz saqlash» ni bosing.', [[{ text: '💾 Izohsiz saqlash', data: callback(SALES_ACTIONS.callSave) }]]);
      return { action: 'call_note_invalid' };
    }
    return saveCall(context, scope.actor, { leadId, result }, text);
  }
  const dueAt = parseLocalDateTime(text);
  if (!dueAt || dueAt.getTime() < Date.now()) {
    await context.reply('Sanani <code>25.12.2026 15:30</code> ko‘rinishida, kelajakdagi vaqt bilan yozing.', [[{ text: '⬅️ Lead', data: callback(SALES_ACTIONS.lead, leadId) }]]);
    return { action: 'followup_date_invalid' };
  }
  return createFollowUp(context, scope.actor, leadId, dueAt);
}

export const SALES_COMMANDS: Readonly<Record<string, string>> = {
  '/leadlar': SALES_ACTIONS.leads,
  '/followup': SALES_ACTIONS.followUps,
};

export async function handleSalesAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case SALES_ACTIONS.leads:
      return showLeads(context, scope, arg);
    case SALES_ACTIONS.hot:
      return showHotLeads(context, scope);
    case SALES_ACTIONS.lead:
      return showLead(context, scope, arg);
    case SALES_ACTIONS.status:
      return changeStatus(context, scope, arg);
    case SALES_ACTIONS.followUps:
      return showFollowUps(context, scope, arg);
    case SALES_ACTIONS.followUp:
      return showFollowUp(context, scope, arg);
    case SALES_ACTIONS.followUpDone:
      return completeFollowUp(context, scope, arg);
    case SALES_ACTIONS.call:
      return askCallResult(context, scope, arg);
    case SALES_ACTIONS.callResult:
      return chooseCallResult(context, scope, arg);
    case SALES_ACTIONS.callSave:
      return saveCallWithoutNote(context, scope);
    case SALES_ACTIONS.followUpNew:
      return askFollowUpWhen(context, scope, arg);
    case SALES_ACTIONS.followUpWhen:
      return chooseFollowUpPreset(context, scope, arg);
    default:
      return undefined;
  }
}
