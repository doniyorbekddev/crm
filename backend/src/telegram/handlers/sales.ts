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
import { PERMISSIONS } from '../../config/permissions.js';
import type { PermissionKey } from '../../config/permissions.js';
import { BOT_FORBIDDEN_TEXT, scopeCan } from '../permissions.js';

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
  /** Qo'ng'iroq turi: OUT (chiquvchi) / IN (kiruvchi) */
  callType: 'sl_ct',
  callResult: 'sl_cr',
  /** Davomiylik (soniya) */
  callDuration: 'sl_cd',
  /** Izohsiz davom etish */
  callSave: 'sl_cs',
  /** Keyingi qadam va saqlash */
  callNext: 'sl_cn',
  /** TZ §43 "Follow-up creation": tezkor muddat yoki o'z sanasi */
  followUpNew: 'sl_fn',
  followUpWhen: 'sl_fw',
} as const;

/** Qo'ng'iroq izohini kutish va follow-up sanasini kutish oqimlari */
export const CALL_NOTE_FLOW = 'call_note';
export const FOLLOWUP_DATE_FLOW = 'followup_date';
/** Oqim ichidagi tugmalar — sessiyani yopmaydi */
export const SALES_FLOW_ACTIONS: ReadonlySet<string> = new Set([SALES_ACTIONS.callType, SALES_ACTIONS.callResult, SALES_ACTIONS.callDuration, SALES_ACTIONS.callSave, SALES_ACTIONS.callNext]);

/**
 * Har sotuv amali uchun ruxsat — REST marshrutlari bilan bir xil kalitlar (TZ 3.1 §28, audit S1).
 * Servis faqat ma'lumot doirasini (o'z/biriktirilmagan lead) tekshiradi; amalning o'zi shu yerda.
 */
const SALES_ACTION_PERMISSIONS: Readonly<Record<string, PermissionKey[]>> = {
  sl_leads: [PERMISSIONS.LEAD_VIEW],
  sl_hot: [PERMISSIONS.LEAD_VIEW],
  sl_lead: [PERMISSIONS.LEAD_VIEW],
  sl_st: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_UPDATE],
  sl_fu: [PERMISSIONS.FOLLOWUP_VIEW],
  sl_fud: [PERMISSIONS.FOLLOWUP_VIEW],
  sl_fuok: [PERMISSIONS.FOLLOWUP_UPDATE],
  sl_call: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_ct: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_cr: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_cd: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_cs: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_cn: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  sl_fn: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.FOLLOWUP_CREATE],
  sl_fw: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.FOLLOWUP_CREATE],
};

/** Matnli oqimlar uchun ruxsat (oqim davomida ruxsat olinib qo'yilishi mumkin) */
const SALES_FLOW_PERMISSIONS: Readonly<Record<string, PermissionKey[]>> = {
  call_note: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.CALL_CREATE],
  followup_date: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.FOLLOWUP_CREATE],
  lead_lost: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_UPDATE],
};

async function denySales(context: BotContext): Promise<HandlerResult> {
  await telegramSessionService.clearFlow(context.chatId);
  await context.render(BOT_FORBIDDEN_TEXT, [menuRow()]);
  return { action: 'sales_forbidden' };
}

/** Oqim matni kelganda (router) — ruxsat yo'q bo'lsa null o'rniga rad javobi */
export async function salesFlowForbidden(context: BotContext, scope: CommandScope, flow: string): Promise<HandlerResult | null> {
  const required = SALES_FLOW_PERMISSIONS[flow];
  if (!required || (await scopeCan(scope, ...required))) return null;
  return denySales(context);
}

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

/** Qo'ng'iroq davomiyligi — tez tanlov (soniya); "Kiritmaslik" — 0 */
const CALL_DURATIONS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 30, label: '< 1 daq' },
  { seconds: 120, label: '1–3 daq' },
  { seconds: 240, label: '3–5 daq' },
  { seconds: 450, label: '5–10 daq' },
  { seconds: 900, label: '10+ daq' },
];
/** Javob bo'lmagan qo'ng'iroqda davomiylik so'ralmaydi */
const NO_CONVERSATION: ReadonlySet<string> = new Set(['NO_ANSWER', 'BUSY', 'WRONG_NUMBER']);
const CALL_DIRECTIONS = { OUT: 'OUTGOING', IN: 'INCOMING' } as const;
const DIRECTION_LABELS = { OUTGOING: '📤 Chiquvchi', INCOMING: '📥 Kiruvchi' } as const;

/** Keyingi qadam: qayta qo'ng'iroq vaqti (`Call.nextCallAt`) yoki follow-up */
const CALL_NEXT = {
  none: { label: '✅ Saqlash', at: (): Date | undefined => undefined },
  t10: { label: '📞 Ertaga 10:00 qayta', at: (now: Date) => localDayAt(1, 10, 0, now) },
  d3: { label: '📞 3 kundan keyin', at: (now: Date) => localDayAt(3, 10, 0, now) },
  fu: { label: '⏰ Saqlash va follow-up', at: (): Date | undefined => undefined },
} as const;
type CallNext = keyof typeof CALL_NEXT;

interface CallDraft {
  leadId: string;
  direction?: 'OUTGOING' | 'INCOMING';
  result?: CallResult;
  durationSec?: number;
  notes?: string | null;
}

async function callDraft(context: BotContext): Promise<CallDraft | null> {
  const session = await telegramSessionService.get(context.chatId);
  if (session?.flow !== CALL_NOTE_FLOW || typeof session.data.leadId !== 'string') return null;
  return session.data as unknown as CallDraft;
}

async function saveDraft(context: BotContext, step: string, draft: CallDraft): Promise<void> {
  await telegramSessionService.set(context.chatId, { flow: CALL_NOTE_FLOW, step, data: draft as never });
}

async function lostCall(context: BotContext): Promise<HandlerResult> {
  await context.render('Qo‘ng‘iroq ma’lumoti topilmadi. Lead kartasidan qaytadan boshlang.', [menuRow()]);
  return { action: 'call_lost' };
}

function cancelCallRow(leadId: string): InlineButton[] {
  return [{ text: '❌ Bekor qilish', data: callback(SALES_ACTIONS.lead, leadId) }];
}

/** 1/5 — qo'ng'iroq turi (TZ 3.1 GAP-08) */
export async function askCallResult(context: BotContext, scope: CommandScope, leadId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !leadId) return { action: SALES_ACTIONS.call };
  return safely(context, SALES_ACTIONS.leads, async () => {
    const lead = await leadService.getById(actor, leadId);
    await saveDraft(context, 'type', { leadId: lead.id });
    await context.render(`<b>📞 ${escapeHtml(leadName(lead))}</b> · ${escapeHtml(lead.phone)}\n\n1/5. Qo‘ng‘iroq turi?`, [
      [
        { text: DIRECTION_LABELS.OUTGOING, data: callback(SALES_ACTIONS.callType, 'OUT') },
        { text: DIRECTION_LABELS.INCOMING, data: callback(SALES_ACTIONS.callType, 'IN') },
      ],
      [{ text: '⬅️ Lead', data: callback(SALES_ACTIONS.lead, lead.id) }, ...menuRow()],
    ]);
    return { action: SALES_ACTIONS.call };
  });
}

/** 2/5 — natija (mavjud `CallResult` enum) */
export async function chooseCallType(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const draft = await callDraft(context);
  if (!actor || !draft || !arg || !(arg in CALL_DIRECTIONS)) return lostCall(context);
  return safely(context, SALES_ACTIONS.leads, async () => {
    await leadService.getById(actor, draft.leadId);
    draft.direction = CALL_DIRECTIONS[arg as keyof typeof CALL_DIRECTIONS];
    await saveDraft(context, 'result', draft);
    const buttons = (Object.keys(CALL_RESULT_LABELS) as CallResult[]).map((result) => ({ text: CALL_RESULT_LABELS[result], data: callback(SALES_ACTIONS.callResult, `${draft.leadId}:${result}`) }));
    const keyboard: InlineKeyboard = [];
    for (let index = 0; index < buttons.length; index += 2) keyboard.push(buttons.slice(index, index + 2));
    keyboard.push(cancelCallRow(draft.leadId));
    await context.render(`${DIRECTION_LABELS[draft.direction]}\n\n2/5. Qo‘ng‘iroq natijasi?`, keyboard);
    return { action: SALES_ACTIONS.callType };
  });
}

function noteKeyboard(leadId: string): InlineKeyboard {
  return [[{ text: '➡️ Izohsiz davom etish', data: callback(SALES_ACTIONS.callSave) }], cancelCallRow(leadId)];
}

async function askNote(context: BotContext, draft: CallDraft): Promise<HandlerResult> {
  await saveDraft(context, 'note', draft);
  await context.render('4/5. Qisqa izoh yozing (nima kelishildi) yoki izohsiz davom eting.', noteKeyboard(draft.leadId));
  return { action: 'call_ask_note' };
}

/** 3/5 — davomiylik (javob bo'lmagan natijada o'tkazib yuboriladi) */
export async function chooseCallResult(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !arg) return { action: SALES_ACTIONS.callResult };
  const [leadId, result] = arg.split(':') as [string, string | undefined];
  if (!leadId || !result || !(result in CALL_RESULT_LABELS)) return showLead(context, scope, leadId || null);
  return safely(context, SALES_ACTIONS.leads, async () => {
    await leadService.getById(actor, leadId);
    const existing = await callDraft(context);
    // Callback'dagi lead sessiyadagisi bilan mos bo'lishi kerak; aks holda yangi qo'ng'iroq (chiquvchi)
    const draft: CallDraft = existing && existing.leadId === leadId ? existing : { leadId, direction: 'OUTGOING' };
    draft.direction ??= 'OUTGOING';
    draft.result = result as CallResult;
    if (NO_CONVERSATION.has(result)) {
      draft.durationSec = 0;
      return askNote(context, draft);
    }
    await saveDraft(context, 'duration', draft);
    const buttons = CALL_DURATIONS.map((option) => ({ text: option.label, data: callback(SALES_ACTIONS.callDuration, String(option.seconds)) }));
    await context.render(`${CALL_RESULT_LABELS[draft.result]}\n\n3/5. Qancha gaplashildi? Tugmani tanlang yoki daqiqani yozing (masalan: <code>7</code>).`, [
      buttons.slice(0, 3),
      buttons.slice(3),
      cancelCallRow(leadId),
    ]);
    return { action: SALES_ACTIONS.callResult };
  });
}

export async function chooseCallDuration(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const draft = await callDraft(context);
  const seconds = Number(arg);
  if (!actor || !draft?.result || !Number.isInteger(seconds) || seconds < 0 || seconds > 86_400) return lostCall(context);
  draft.durationSec = seconds;
  return askNote(context, draft);
}

async function askNext(context: BotContext, draft: CallDraft): Promise<HandlerResult> {
  await saveDraft(context, 'next', draft);
  const options = (Object.keys(CALL_NEXT) as CallNext[]).map((key) => ({ text: CALL_NEXT[key].label, data: callback(SALES_ACTIONS.callNext, key) }));
  await context.render(
    [
      '5/5. <b>Keyingi qadam?</b>',
      '',
      `${draft.direction ? DIRECTION_LABELS[draft.direction] : ''} · ${draft.result ? CALL_RESULT_LABELS[draft.result] : ''}${draft.durationSec ? ` · ${Math.max(1, Math.round(draft.durationSec / 60))} daq` : ''}`,
      draft.notes ? `📝 ${escapeHtml(draft.notes)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    [options.slice(0, 2), options.slice(2), cancelCallRow(draft.leadId)],
  );
  return { action: 'call_ask_next' };
}

/** "Izohsiz davom etish" */
export async function saveCallWithoutNote(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const draft = await callDraft(context);
  if (!actor || !draft?.result) return lostCall(context);
  draft.notes = null;
  return askNext(context, draft);
}

/** Saqlash — CRM `callService.create` (lead doirasi, faollik, audit, oxirgi aloqa) */
export async function chooseCallNext(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const draft = await callDraft(context);
  if (!actor || !draft?.result || !arg || !(arg in CALL_NEXT)) return lostCall(context);
  const next = arg as CallNext;
  await telegramSessionService.clearFlow(context.chatId);
  return safely(context, SALES_ACTIONS.leads, async () => {
    const nextCallAt = CALL_NEXT[next].at(new Date());
    await callService.create(
      actor,
      {
        leadId: draft.leadId,
        direction: draft.direction ?? 'OUTGOING',
        status: 'COMPLETED',
        result: draft.result!,
        durationSec: draft.durationSec ?? 0,
        notes: draft.notes ?? undefined,
        calledAt: undefined,
        nextCallAt,
      },
      BOT_CLIENT,
    );
    if (next === 'fu') return askFollowUpWhen(context, scope, draft.leadId);
    const lines = [`✅ Qo‘ng‘iroq yozildi: ${CALL_RESULT_LABELS[draft.result!]}`];
    if (draft.notes) lines.push(`📝 ${escapeHtml(draft.notes)}`);
    if (nextCallAt) lines.push(`📞 Qayta qo‘ng‘iroq: ${fmtDateTime(nextCallAt)}`);
    await context.render(lines.join('\n'), [
      [{ text: '⏰ Follow-up qo‘yish', data: callback(SALES_ACTIONS.followUpNew, draft.leadId) }, { text: '👤 Lead', data: callback(SALES_ACTIONS.lead, draft.leadId) }],
      menuRow(),
    ]);
    return { action: 'call_logged' };
  });
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
    const draft = session.data as unknown as CallDraft;
    if (session.step === 'duration') {
      const minutes = Number(text.replace(',', '.'));
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) {
        await context.reply('Daqiqani raqam bilan yozing (0–600) yoki tugmani tanlang.', [cancelCallRow(leadId)]);
        return { action: 'call_duration_invalid' };
      }
      draft.durationSec = Math.round(minutes * 60);
      return askNote(context, draft);
    }
    if (session.step === 'note') {
      if (text.length < 2 || text.length > 2000) {
        await context.reply('Izoh 2 dan 2000 belgigacha bo‘lsin yoki «Izohsiz davom etish» ni bosing.', noteKeyboard(leadId));
        return { action: 'call_note_invalid' };
      }
      draft.notes = text;
      return askNext(context, draft);
    }
    await context.reply('Tugmalardan birini tanlang.', [cancelCallRow(leadId)]);
    return { action: 'call_wait_button' };
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
  const required = SALES_ACTION_PERMISSIONS[action];
  if (required && scope.actor && !(await scopeCan(scope, ...required))) return denySales(context);
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
    case SALES_ACTIONS.callType:
      return chooseCallType(context, scope, arg);
    case SALES_ACTIONS.callResult:
      return chooseCallResult(context, scope, arg);
    case SALES_ACTIONS.callDuration:
      return chooseCallDuration(context, scope, arg);
    case SALES_ACTIONS.callSave:
      return saveCallWithoutNote(context, scope);
    case SALES_ACTIONS.callNext:
      return chooseCallNext(context, scope, arg);
    case SALES_ACTIONS.followUpNew:
      return askFollowUpWhen(context, scope, arg);
    case SALES_ACTIONS.followUpWhen:
      return chooseFollowUpPreset(context, scope, arg);
    default:
      return undefined;
  }
}
