import { readFile } from 'node:fs/promises';
import { prisma } from '../../config/database.js';
import { primaryClientUrl } from '../../config/env.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY, NOTIFICATION_CATEGORY_LABELS, isMutableNotificationType, isNotificationCategory } from '../../config/notificationTypes.js';
import { canViewReport } from '../../config/reportPermissions.js';
import type { NotificationType } from '../../generated/prisma/client.js';
import { academicAnalyticsService } from '../../services/academicAnalytics.service.js';
import { academyOverviewService } from '../../services/academyOverview.service.js';
import { aiAcademicService } from '../../services/ai/academic.service.js';
import { analyticsExport, analyticsService } from '../../services/analytics.service.js';
import { executiveService } from '../../services/executive.service.js';
import { homeworkService } from '../../services/homework.service.js';
import { notificationService } from '../../services/notification.service.js';
import { permissionService } from '../../services/permission.service.js';
import { reportService, reportToTable } from '../../services/report.service.js';
import { searchService, type SearchResultDto } from '../../services/search.service.js';
import { escapeHtml, telegramService, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import { teachingService } from '../../services/teaching.service.js';
import { getTeachingAccess } from '../../services/teachingAccess.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { addDays, businessDateString, startOfBusinessDay, startOfBusinessMonth } from '../../utils/dates.js';
import { tableToCsv } from '../../utils/tableExport.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { ReportType } from '../../validators/report.validator.js';
import { moneyUz } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Telegram 2.0 (TZ 3.0 §43): qidiruv, sozlamalar, o'qituvchi KPI, marketing, hisobotlar va
 * topshiriqlarni botdan tekshirish. **Yangi mantiq yo'q** — hammasi CRM servislari orqali
 * `scope.actor` nomidan: ruxsat, doira (o'qituvchi — o'z guruhi, filial) va audit web bilan bir xil.
 */

export const WORKSPACE_ACTIONS = {
  search: 'ws_sr',
  settings: 'ws_set',
  toggleType: 'ws_st',
  /** `ws_sc:<toifa>` — toifa bo'yicha yoqish/o'chirish (TZ 3.1 GAP-13) */
  toggleCategory: 'ws_sc',
  toggleMute: 'ws_mute',
  kpi: 'ws_kpi',
  /** Rahbar: bitta o'qituvchi KPI tafsiloti (TZ 3.1 GAP-10) */
  teacherKpi: 'ws_kt',
  /** `ws_mkt[:month|last|d30]` — davr (TZ 3.1 GAP-11) */
  marketing: 'ws_mkt',
  /** Marketing CSV — hujjat sifatida chatga (`report.export`) */
  marketingCsv: 'ws_mcsv',
  reports: 'ws_rep',
  /** `ws_r:<tur>[:davr]` */
  report: 'ws_r',
  /** `ws_rcsv:<tur>:<davr>` — hisobot CSV hujjat bo'lib chatga (TZ 3.1 GAP-12) */
  reportCsv: 'ws_rcsv',
  /** Kunlik qisqa hisobot (TZ 3.1 GAP-12) */
  daily: 'ws_day',
  review: 'ws_rv',
  reviewOne: 'ws_ro',
  grade: 'ws_rg',
  giveBack: 'ws_rb',
  ai: 'ws_ai',
  aiAccept: 'ws_aia',
} as const;

export const SEARCH_FLOW = 'search';
export const GRADE_FLOW = 'grade';

const BOT_CLIENT: ClientInfo = { ip: null, userAgent: 'telegram-bot' };
const REVIEW_LIMIT = 10;

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

async function requireActor(context: BotContext, scope: CommandScope): Promise<AuthUser | null> {
  if (scope.actor) return scope.actor;
  await context.render('Bu bo‘lim xodimlar uchun.', [menuRow()]);
  return null;
}

async function permissionsOf(actor: AuthUser): Promise<ReadonlySet<string>> {
  return permissionService.getRolePermissions(actor.roleId);
}

async function requirePermission(context: BotContext, actor: AuthUser, permission: string): Promise<boolean> {
  if ((await permissionsOf(actor)).has(permission)) return true;
  await context.render('❌ Bu bo‘limga ruxsatingiz yo‘q.', [menuRow()]);
  return false;
}

async function safely(context: BotContext, work: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      await context.render(`❌ ${escapeHtml(error.message)}`, [menuRow()]);
      return { action: 'workspace_error' };
    }
    throw error;
  }
}

const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

// ---------------------------------------------------------------------
// Qidiruv (global search — ruxsatga qarab)
// ---------------------------------------------------------------------

/**
 * Qidiruv (TZ 3.1 GAP-14) — mavjud qidiruv servislari:
 *  - xodim: `searchService.search` (web global qidiruv bilan bir xil RBAC: o'qituvchi — o'z guruhlari va o'quvchilari,
 *    sotuv — ruxsatidagi leadlar/o'quvchilar, rahbar — ruxsatiga qarab; filial doirasi);
 *  - o'quvchi/ota-ona: `searchService.portal` — faqat o'z (tanlangan farzand) ma'lumoti, web kabinet bilan bir xil.
 */
export async function startSearch(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  if (scope.kind === 'STAFF') {
    const actor = await requireActor(context, scope);
    if (!actor) return { action: WORKSPACE_ACTIONS.search };
    await telegramSessionService.set(context.chatId, { flow: SEARCH_FLOW, step: 'query', data: {} });
    await context.render('🔎 Qidirish uchun ism, telefon yoki kod yozing (masalan: <code>Ali</code>, <code>90 123</code>, <code>ST-45</code>, <code>L-12</code>, <code>PM-7</code>, guruh yoki kurs nomi).', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.search };
  }
  // Tanlangan farzand oqim davomida saqlanadi (clearFlow uni o'chirmaydi)
  const session = await telegramSessionService.get(context.chatId);
  const active = session?.data.activeStudentId;
  await telegramSessionService.set(context.chatId, { flow: SEARCH_FLOW, step: 'query', data: typeof active === 'string' ? { activeStudentId: active } : {} });
  await context.render('🔎 O‘z ma’lumotingizdan qidiring: vazifa, imtihon, dars, sertifikat nomi yoki kvitansiya raqami (<code>PM-7</code>).', [menuRow()]);
  return { action: WORKSPACE_ACTIONS.search };
}

function renderHits(query: string, result: SearchResultDto, linkBase: string): string {
  const lines = [`<b>🔎 «${escapeHtml(query)}»</b> · ${result.total} ta`, ''];
  for (const group of result.groups) {
    lines.push(`<b>${escapeHtml(group.label)}</b>`);
    for (const hit of group.hits.slice(0, 5)) {
      const title = `${hit.code ? `${escapeHtml(hit.code)} · ` : ''}${escapeHtml(hit.title)}`;
      lines.push(`• <a href="${linkBase}${hit.url}">${title}</a>${hit.subtitle ? ` — ${escapeHtml(hit.subtitle)}` : ''}`);
    }
    lines.push('');
  }
  lines.push('Yana qidirish uchun yozing.');
  return lines.join('\n');
}

/** `studentId` — o'quvchi/ota-ona uchun router `resolveStudentId` bilan beradi (doira `scope.studentIds` dan) */
export async function handleSearchFlow(context: BotContext, scope: CommandScope, studentId: string | null = null): Promise<HandlerResult> {
  const query = (context.text ?? '').trim();
  if (scope.kind === 'STAFF' && !scope.actor) return { action: 'search_denied' };
  if (scope.kind !== 'STAFF' && (!studentId || !scope.studentIds.includes(studentId))) return { action: 'search_denied' };
  if (query.length < 2) {
    await context.reply('Kamida 2 belgi yozing.', [menuRow()]);
    return { action: 'search_short' };
  }
  return safely(context, async () => {
    const result = scope.actor
      ? await searchService.search(scope.actor, query)
      : await searchService.portal(query, { studentIds: scope.studentIds, activeStudentId: studentId!, includeChildren: scope.kind === 'PARENT' });
    // Oqim ochiq qoladi — keyingi so'rovni darhol yozish mumkin
    if (result.total === 0) {
      await context.reply(`🔎 «${escapeHtml(query)}» bo‘yicha hech narsa topilmadi. Boshqacha yozib ko‘ring.`, [menuRow()]);
      return { action: 'search_empty' };
    }
    await context.reply(renderHits(query, result, primaryClientUrl), [menuRow()]);
    return { action: 'search_result' };
  });
}

// ---------------------------------------------------------------------
// Sozlamalar: bildirishnomalar (xodim — tur bo'yicha), ovozsiz rejim (hamma)
// ---------------------------------------------------------------------

/** Botda boshqariladigan turlar (ruxsat bo'yicha ko'rsatiladi) */
const STAFF_TYPES: ReadonlyArray<{ type: NotificationType; label: string; permission: string | null }> = [
  { type: 'NEW_LEAD', label: 'Yangi lead', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'LEAD_ASSIGNED', label: 'Lead biriktirildi', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'FOLLOW_UP_REMINDER', label: 'Follow-up eslatmasi', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'FOLLOW_UP_OVERDUE', label: 'Kechikkan follow-up', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'TRIAL_LESSON_REMINDER', label: 'Sinov darsi eslatmasi', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'NEW_STUDENT', label: 'Lead o‘quvchi bo‘ldi', permission: PERMISSIONS.LEAD_VIEW },
  { type: 'NEW_PAYMENT', label: 'Yangi to‘lov', permission: PERMISSIONS.PAYMENT_VIEW },
  { type: 'DEBT_REMINDER', label: 'Qarzdorlik', permission: PERMISSIONS.DEBT_VIEW },
  { type: 'RISK_INCREASED', label: 'O‘quvchi xavfi oshdi', permission: PERMISSIONS.ATTENDANCE_MARK },
  { type: 'NEGATIVE_FEEDBACK', label: 'Past baholi fikr', permission: PERMISSIONS.FEEDBACK_VIEW },
  { type: 'EXPENSE_APPROVAL', label: 'Xarajat tasdig‘i', permission: PERMISSIONS.EXPENSE_APPROVE },
  { type: 'DAILY_DIGEST', label: 'Kunlik xulosa', permission: PERMISSIONS.DASHBOARD_VIEW },
];

/** O'quvchi/ota-onaga (oilaviy yo'l) keladigan turlar — `studentNotify` va davomat */
const FAMILY_TYPES: readonly NotificationType[] = [
  'CHILD_ABSENT',
  'ATTENDANCE_LATE',
  'PAYMENT_DUE_SOON',
  'DEBT_REMINDER',
  'HOMEWORK_CREATED',
  'HOMEWORK_GRADED',
  'HOMEWORK_DEADLINE',
  'HOMEWORK_RETURNED',
  'EXAM_SCHEDULED',
  'EXAM_RESULT',
  'LOW_SCORE',
  'LEVEL_UP',
  'CERTIFICATE_ISSUED',
  'WEEKLY_REPORT',
];

async function linkOf(context: BotContext) {
  return prisma.telegramLink.findFirst({ where: { chatId: context.chatId, isActive: true }, select: { id: true, muted: true, studentId: true, parentId: true } });
}

/**
 * Sozlama kimga yoziladi va qaysi turlar: xodim — o'zi (ruxsatidagi turlar); o'quvchi/ota-ona — chat
 * bog'langan yozuvning **kabinet hisobi** (bazadan, callback'dan emas). Hisob bo'lmasa — null
 * (yangi saqlash tizimi yaratilmaydi, faqat umumiy "ovozsiz").
 */
async function settingsOwner(context: BotContext, scope: CommandScope): Promise<{ userId: string; types: NotificationType[]; staff: boolean } | null> {
  if (scope.actor) {
    const permissions = await permissionsOf(scope.actor);
    return { userId: scope.actor.id, types: STAFF_TYPES.filter((item) => !item.permission || permissions.has(item.permission)).map((item) => item.type), staff: true };
  }
  const link = await linkOf(context);
  const owner = link?.studentId
    ? await prisma.student.findFirst({ where: { id: link.studentId, deletedAt: null }, select: { userId: true } })
    : link?.parentId
      ? await prisma.parent.findUnique({ where: { id: link.parentId }, select: { userId: true } })
      : null;
  return owner?.userId ? { userId: owner.userId, types: [...FAMILY_TYPES], staff: false } : null;
}

const TYPE_LABELS = new Map<NotificationType, string>(STAFF_TYPES.map((item) => [item.type, item.label]));

export async function showSettings(context: BotContext, scope: CommandScope, note = ''): Promise<HandlerResult> {
  const link = await linkOf(context);
  const lines = ['<b>⚙️ Sozlamalar</b>', ''];
  const keyboard: InlineKeyboard = [];
  lines.push(link?.muted ? '🔕 Avtomatik eslatmalar <b>to‘xtatilgan</b> (markaz e’lonlari baribir keladi).' : '🔔 Avtomatik eslatmalar yoqilgan.');
  keyboard.push([{ text: link?.muted ? '🔔 Eslatmalarni yoqish' : '🔕 Eslatmalarni to‘xtatish', data: callback(WORKSPACE_ACTIONS.toggleMute) }]);

  const owner = await settingsOwner(context, scope);
  if (owner && owner.types.length > 0) {
    const settings = new Map((await notificationService.settingsFor(owner.userId)).map((row) => [row.type, row]));
    lines.push('', 'Telegramga keladigan xabarlar — toifa bo‘yicha (✅ yoqilgan, ◐ qisman, ⬜️ o‘chirilgan):');
    for (const category of NOTIFICATION_CATEGORIES) {
      const types = owner.types.filter((type) => NOTIFICATION_CATEGORY[type] === category);
      if (types.length === 0) continue;
      const on = types.filter((type) => settings.get(type)?.telegram ?? true).length;
      const mark = on === types.length ? '✅' : on === 0 ? '⬜️' : '◐';
      keyboard.push([{ text: `${mark} ${NOTIFICATION_CATEGORY_LABELS[category]}`, data: callback(WORKSPACE_ACTIONS.toggleCategory, category) }]);
      // Xodim — toifa ichida turlar ham (avvalgidek bittalab)
      if (owner.staff) {
        const buttons = types.map((type) => ({ text: `${(settings.get(type)?.telegram ?? true) ? '✅' : '⬜️'} ${TYPE_LABELS.get(type) ?? type}`, data: callback(WORKSPACE_ACTIONS.toggleType, type) }));
        for (let index = 0; index < buttons.length; index += 2) keyboard.push(buttons.slice(index, index + 2));
      }
    }
    lines.push('Hisob va xavfsizlik (tizim) xabarlari doim keladi.');
  } else if (!scope.actor) {
    lines.push('', 'Toifalar bo‘yicha sozlash (davomat, to‘lov, vazifa, imtihon, yutuqlar) — kabinet hisobi bilan ishlaydi; hisob ochish uchun markazga murojaat qiling.');
  }
  if (scope.kind === 'PARENT' && scope.studentIds.length > 1) keyboard.push([{ text: '👨‍👩‍👧 Farzandni tanlash', data: callback('st_child') }]);
  lines.push('', 'Til: o‘zbekcha (lotin).');
  if (note) lines.push('', note);
  keyboard.push([{ text: '🚫 Bog‘lanishni uzish', data: callback('cmd', '/uzish') }], menuRow());
  await context.render(lines.join('\n'), keyboard);
  return { action: WORKSPACE_ACTIONS.settings };
}

export async function toggleMute(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const link = await linkOf(context);
  if (link) await prisma.telegramLink.update({ where: { id: link.id }, data: { muted: !link.muted } });
  return showSettings(context, scope, link ? (link.muted ? '✅ Eslatmalar yoqildi.' : '✅ Eslatmalar to‘xtatildi.') : '');
}

export async function toggleType(context: BotContext, scope: CommandScope, type: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: WORKSPACE_ACTIONS.toggleType };
  const owner = await settingsOwner(context, scope);
  // Faqat ruxsatidagi tur (callback'ga ishonilmaydi)
  const item = owner?.types.find((row) => row === type);
  if (!owner || !item) return showSettings(context, scope);
  const current = (await notificationService.settingsFor(owner.userId)).find((row) => row.type === item);
  await notificationService.saveSettingsFor(owner.userId, [{ type: item, inApp: current?.inApp ?? true, telegram: !(current?.telegram ?? true) }]);
  return showSettings(context, scope);
}

/** Toifa: hammasi yoqilgan bo'lsa — hammasini o'chiradi, aks holda hammasini yoqadi. Ilova ichidagi sozlama o'zgarmaydi. */
export async function toggleCategory(context: BotContext, scope: CommandScope, category: string | null): Promise<HandlerResult> {
  if (!isNotificationCategory(category)) return showSettings(context, scope);
  const owner = await settingsOwner(context, scope);
  if (!owner) return showSettings(context, scope);
  const types = owner.types.filter((type) => NOTIFICATION_CATEGORY[type] === category && isMutableNotificationType(type));
  if (types.length === 0) return showSettings(context, scope);
  const current = new Map((await notificationService.settingsFor(owner.userId)).map((row) => [row.type, row]));
  const allOn = types.every((type) => current.get(type)?.telegram ?? true);
  await notificationService.saveSettingsFor(
    owner.userId,
    types.map((type) => ({ type, inApp: current.get(type)?.inApp ?? true, telegram: !allOn })),
  );
  return showSettings(context, scope, `${NOTIFICATION_CATEGORY_LABELS[category]}: ${allOn ? 'o‘chirildi' : 'yoqildi'}.`);
}

// ---------------------------------------------------------------------
// O'qituvchi KPI (TZ 3.1 GAP-10). Hisob-kitob botda yo'q — mavjud servislar:
//  • rahbar (analytics.view): o'qituvchilar kesimi — `academicAnalyticsService.build(dimension: 'teacher')`
//    (web "Akademik analitika" bilan bir xil raqamlar) va tafsilotda o'qituvchi guruhlari — `teachingService`;
//  • o'qituvchi: o'z guruhlari — `teachingService.overview` (o'qituvchi markazi bilan bir xil).
// ---------------------------------------------------------------------

const KPI_PAGE = 12;

/** Boshqa o'qituvchilar KPI: analytics.view + barcha guruhlar (group.manage) — aks holda servis o'z guruhlariga cheklaydi */
function canViewTeacherKpi(permissions: ReadonlySet<string>): boolean {
  return permissions.has(PERMISSIONS.ANALYTICS_VIEW) && permissions.has(PERMISSIONS.GROUP_MANAGE);
}

function feedbackText(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}/5`;
}

async function showTeacherList(context: BotContext, actor: AuthUser): Promise<HandlerResult> {
  const [analytics, overview] = await Promise.all([academicAnalyticsService.build(actor, { dimension: 'teacher' }), teachingService.overview(actor)]);
  const groupCount = new Map<string, number>();
  for (const group of overview.groups) if (group.teacher) groupCount.set(group.teacher.id, (groupCount.get(group.teacher.id) ?? 0) + 1);
  const rows = analytics.rows.filter((row) => row.key !== 'none').sort((a, b) => (b.students ?? 0) - (a.students ?? 0));
  const lines = [`<b>📊 O‘qituvchilar KPI</b> · ${analytics.from} — ${analytics.to}`, ''];
  if (rows.length === 0) lines.push('Faol guruhli o‘qituvchi yo‘q.');
  const keyboard: InlineKeyboard = [];
  for (const row of rows.slice(0, KPI_PAGE)) {
    lines.push(`<b>${escapeHtml(row.label)}</b> · ${groupCount.get(row.key) ?? 0} guruh · ${row.students ?? 0} o‘quvchi`);
    lines.push(`   Davomat ${pct(row.attendanceRate)} · vazifa ${pct(row.homeworkRate)} · imtihon ${pct(row.examAverage)} · progress ${pct(row.progress)}`);
    keyboard.push([{ text: `👤 ${row.label.slice(0, 40)}`, data: callback(WORKSPACE_ACTIONS.teacherKpi, row.key) }]);
  }
  if (rows.length > KPI_PAGE) lines.push('', `… yana ${rows.length - KPI_PAGE} ta — to‘liq ro‘yxat CRM’da: ${primaryClientUrl}/academic-analytics`);
  lines.push('', `Umumiy: davomat ${pct(analytics.totals.attendanceRate)} · vazifa ${pct(analytics.totals.homeworkRate)} · imtihon ${pct(analytics.totals.examAverage)} · retention ${pct(analytics.totals.retention)}`);
  keyboard.push(menuRow());
  await context.render(lines.join('\n'), keyboard);
  return { action: WORKSPACE_ACTIONS.kpi };
}

/** Rahbar: tanlangan o'qituvchi — guruhlar, o'quvchilar, davomat, vazifa, imtihon, progress, retention, fikr */
export async function showTeacherKpi(context: BotContext, scope: CommandScope, teacherId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !teacherId) return { action: WORKSPACE_ACTIONS.teacherKpi };
  if (!canViewTeacherKpi(await permissionsOf(actor))) {
    await context.render('⛔ Bu amal uchun ruxsatingiz yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.teacherKpi };
  }
  return safely(context, async () => {
    const [analytics, overview] = await Promise.all([
      academicAnalyticsService.build(actor, { dimension: 'teacher' }),
      teachingService.overview(actor, { teacherId }),
    ]);
    const row = analytics.rows.find((item) => item.key === teacherId);
    if (!row) {
      await context.render('O‘qituvchi topilmadi yoki faol guruhi yo‘q.', [[{ text: '⬅️ O‘qituvchilar', data: callback(WORKSPACE_ACTIONS.kpi) }, ...menuRow()]]);
      return { action: WORKSPACE_ACTIONS.teacherKpi };
    }
    const lines = [
      `<b>👤 ${escapeHtml(row.label)}</b> · ${analytics.from} — ${analytics.to}`,
      '',
      `Guruhlar: <b>${overview.totals.groups}</b> · o‘quvchilar: <b>${row.students ?? 0}</b>`,
      `Davomat: <b>${pct(row.attendanceRate)}</b>`,
      `Vazifa bajarilishi: <b>${pct(row.homeworkRate)}</b>`,
      `Imtihon o‘rtachasi: <b>${pct(row.examAverage)}</b>`,
      `Progress: <b>${pct(row.progress)}</b>`,
      `Retention: <b>${pct(row.retention)}</b>`,
      `Fikr-mulohaza: <b>${feedbackText(row.feedback)}</b>`,
      `Xavf ostida: <b>${row.atRisk ?? 0}</b> · baholash kutmoqda: ${overview.totals.homeworkToGrade}`,
      '',
    ];
    for (const group of overview.groups.slice(0, 10)) {
      lines.push(`<b>${escapeHtml(group.name)}</b> (${group.students}) — davomat ${pct(group.attendanceRate)} · vazifa ${pct(group.homeworkRate)} · imtihon ${pct(group.examAverage)}`);
    }
    await context.render(lines.join('\n'), [[{ text: '⬅️ O‘qituvchilar', data: callback(WORKSPACE_ACTIONS.kpi) }, ...menuRow()]]);
    return { action: WORKSPACE_ACTIONS.teacherKpi };
  });
}

export async function showKpi(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: WORKSPACE_ACTIONS.kpi };
  const permissions = await permissionsOf(actor);
  // REST `/analytics/academic` bilan bir xil: analytics.view yoki attendance.mark
  if (!permissions.has(PERMISSIONS.ANALYTICS_VIEW) && !permissions.has(PERMISSIONS.ATTENDANCE_MARK)) {
    await context.render('⛔ Bu amal uchun ruxsatingiz yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.kpi };
  }
  return safely(context, async () => {
    if (canViewTeacherKpi(permissions)) return showTeacherList(context, actor);
    const { totals, groups } = await teachingService.overview(actor);
    const lines = [
      '<b>📈 KPI</b>',
      '',
      `Guruhlar: <b>${totals.groups}</b> · o‘quvchilar: <b>${totals.students}</b>`,
      `Xavf ostida: <b>${totals.atRisk}</b>`,
      `Baholash kutmoqda: <b>${totals.homeworkToGrade}</b> vazifa, <b>${totals.attemptsToReview}</b> imtihon`,
      `Bugun dars: ${totals.lessonsToday} · davomat belgilanmagan: <b>${totals.unmarkedToday}</b>`,
      '',
    ];
    for (const group of groups.slice(0, 10)) {
      lines.push(`<b>${escapeHtml(group.name)}</b> (${group.students})`);
      lines.push(`   Davomat ${pct(group.attendanceRate)} · vazifa ${pct(group.homeworkRate)} · imtihon ${pct(group.examAverage)} · progress ${pct(group.progress)}`);
    }
    const keyboard: InlineKeyboard = [];
    if (totals.homeworkToGrade > 0) keyboard.push([{ text: `✍️ Tekshirish (${totals.homeworkToGrade})`, data: callback(WORKSPACE_ACTIONS.review) }]);
    keyboard.push(menuRow());
    await context.render(lines.join('\n'), keyboard);
    return { action: WORKSPACE_ACTIONS.kpi };
  });
}

// ---------------------------------------------------------------------
// Marketing (kanallar bo'yicha — analytics.sources)
// ---------------------------------------------------------------------

function monthRange(now = new Date()): { from: string; to: string } {
  return { from: businessDateString(startOfBusinessMonth(now)), to: businessDateString(now) };
}

/** Bot davrlari (marketing va hisobotlar): joriy oy, o'tgan oy (to'liq), oxirgi 30 kun — biznes sana bo'yicha */
export const BOT_PERIODS = ['month', 'last', 'd30'] as const;
export type BotPeriod = (typeof BOT_PERIODS)[number];
const PERIOD_LABELS: Record<BotPeriod, string> = { month: 'Bu oy', last: 'O‘tgan oy', d30: '30 kun' };

export function periodRange(period: BotPeriod, now = new Date()): { from: string; to: string } {
  if (period === 'last') return { from: businessDateString(startOfBusinessMonth(now, 1)), to: businessDateString(addDays(startOfBusinessMonth(now), -1)) };
  if (period === 'd30') return { from: businessDateString(addDays(startOfBusinessDay(now), -29)), to: businessDateString(now) };
  return monthRange(now);
}

function parsePeriod(arg: string | null): BotPeriod {
  return BOT_PERIODS.includes(arg as BotPeriod) ? (arg as BotPeriod) : 'month';
}

const shortDate = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}`;
const signedMoney = (value: number) => (value < 0 ? `−${moneyUz(-value)}` : moneyUz(value));

/**
 * Manbalar kesimi (TZ 3.1 GAP-11): lead, o'quvchi bo'lgan, konversiya, tushum, xarajat, foyda, ROI —
 * hammasi web "Analitika → Lead manbalari" bilan bitta servisdan (`analyticsService.sources`).
 * Campaign modeli tizimda yo'q — kesim manba (Source) bo'yicha (audit qarori #4).
 */
export async function showMarketing(context: BotContext, scope: CommandScope, arg: string | null = null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !(await requirePermission(context, actor, PERMISSIONS.ANALYTICS_VIEW))) return { action: WORKSPACE_ACTIONS.marketing };
  const period = parsePeriod(arg);
  return safely(context, async () => {
    const range = periodRange(period);
    const data = await analyticsService.sources(range);
    const { totals } = data;
    const lines = [
      `<b>📣 Marketing</b> · ${PERIOD_LABELS[period]} (${shortDate(data.from)} — ${shortDate(data.to)})`,
      '',
      `Leadlar: <b>${totals.leads}</b> · o‘quvchi bo‘ldi: <b>${totals.won}</b> (${totals.conversion}%)`,
      `Tushum: <b>${moneyUz(totals.revenue)}</b> · xarajat: ${moneyUz(totals.spend)}`,
      `Foyda: <b>${signedMoney(totals.profit)}</b>${totals.roi === null ? '' : ` · ROI <b>${totals.roi}%</b>`}`,
    ];
    if (totals.unattributedSpend > 0) lines.push(`<i>Manbaga bog‘lanmagan reklama xarajati: ${moneyUz(totals.unattributedSpend)}</i>`);
    lines.push('');
    const rows = [...data.rows].sort((a, b) => b.leads - a.leads || b.revenue - a.revenue);
    for (const row of rows.slice(0, 8)) {
      lines.push(`<b>${escapeHtml(row.name)}</b>: ${row.leads} lead → ${row.won} (${row.conversion}%)`);
      lines.push(`   tushum ${moneyUz(row.revenue)} · xarajat ${moneyUz(row.spend)} · foyda ${signedMoney(row.profit)} · ROI ${row.roi === null ? '—' : `${row.roi}%`}`);
    }
    if (rows.length === 0) lines.push('Bu davrda lead yo‘q.');
    if (rows.length > 8) lines.push(`… yana ${rows.length - 8} ta manba — CSV yoki CRM’da: ${primaryClientUrl}/analytics`);

    const keyboard: InlineKeyboard = [
      BOT_PERIODS.map((item) => ({ text: item === period ? `• ${PERIOD_LABELS[item]}` : PERIOD_LABELS[item], data: callback(WORKSPACE_ACTIONS.marketing, item) })),
    ];
    if ((await permissionsOf(actor)).has(PERMISSIONS.REPORT_EXPORT)) keyboard.push([{ text: '📄 CSV', data: callback(WORKSPACE_ACTIONS.marketingCsv, period) }]);
    keyboard.push(menuRow());
    await context.render(lines.join('\n'), keyboard);
    return { action: WORKSPACE_ACTIONS.marketing };
  });
}

/** Manbalar jadvali CSV — REST `/analytics/sources/export` bilan bir xil fayl (analytics.view + report.export) */
export async function sendMarketingCsv(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: WORKSPACE_ACTIONS.marketingCsv };
  const permissions = await permissionsOf(actor);
  if (!permissions.has(PERMISSIONS.ANALYTICS_VIEW) || !permissions.has(PERMISSIONS.REPORT_EXPORT)) {
    await context.render('⛔ Bu amal uchun ruxsatingiz yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.marketingCsv };
  }
  const period = parsePeriod(arg);
  return safely(context, async () => {
    const range = periodRange(period);
    const table = await analyticsExport.sources(range);
    const sent = await telegramService.sendMedia(
      context.chatId,
      { kind: 'document', buffer: Buffer.from(tableToCsv(table), 'utf8'), fileName: `lead-manbalari-${range.from}_${range.to}.csv`, mimeType: 'text/csv' },
      `📄 Lead manbalari · ${shortDate(range.from)} — ${shortDate(range.to)}`,
    );
    if (!sent.ok) await context.reply('Faylni yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring yoki CRM’dan yuklab oling.');
    return { action: WORKSPACE_ACTIONS.marketingCsv };
  });
}

// ---------------------------------------------------------------------
// Hisobotlar (report.service — ruxsat web bilan bir xil)
// ---------------------------------------------------------------------

/** Web "Hisobotlar" dagi barcha turlar — ruxsat `canViewReport` (web bilan bitta ro'yxat) */
const BOT_REPORTS: ReadonlyArray<{ type: ReportType; label: string }> = [
  { type: 'sales', label: '💼 Sotuv' },
  { type: 'managers', label: '👔 Menejerlar' },
  { type: 'payments', label: '💳 To‘lovlar' },
  { type: 'debts', label: '⚠️ Qarzdorlik' },
  { type: 'incomes', label: '📈 Kirimlar' },
  { type: 'expenses', label: '📉 Xarajatlar' },
  { type: 'profit', label: '💰 Foyda' },
  { type: 'salaries', label: '🧾 Maoshlar' },
  { type: 'attendance', label: '✅ Davomat' },
  { type: 'retention', label: '🔁 O‘quvchilar oqimi' },
  { type: 'courses', label: '📚 Kurslar' },
  { type: 'groups', label: '👥 Guruhlar' },
  { type: 'teachers', label: '👨‍🏫 O‘qituvchilar' },
  { type: 'sources', label: '📣 Manbalar' },
  { type: 'gamification', label: '🏆 Reyting' },
];

const REPORT_ROW_PREVIEW = 5;

function parseReportArg(arg: string | null): { item: (typeof BOT_REPORTS)[number] | undefined; period: BotPeriod } {
  const [type, period] = (arg ?? '').split(':');
  return { item: BOT_REPORTS.find((row) => row.type === type), period: parsePeriod(period ?? null) };
}

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return type === 'money' ? moneyUz(value) : type === 'percent' ? `${value}%` : new Intl.NumberFormat('uz-UZ').format(value);
  return escapeHtml(String(value).slice(0, 40));
}

export async function showReports(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !(await requirePermission(context, actor, PERMISSIONS.REPORT_VIEW))) return { action: WORKSPACE_ACTIONS.reports };
  const permissions = await permissionsOf(actor);
  const allowed = BOT_REPORTS.filter((item) => canViewReport(permissions, item.type));
  const keyboard: InlineKeyboard = [];
  if (permissions.has(PERMISSIONS.ANALYTICS_VIEW)) keyboard.push([{ text: '📊 Kunlik hisobot', data: callback(WORKSPACE_ACTIONS.daily) }]);
  for (let index = 0; index < allowed.length; index += 2) keyboard.push(allowed.slice(index, index + 2).map((item) => ({ text: item.label, data: callback(WORKSPACE_ACTIONS.report, item.type) })));
  keyboard.push(menuRow());
  await context.render('<b>📑 Hisobotlar</b>\n\nQaysi hisobot? (davrni hisobot ichida tanlaysiz)', keyboard);
  return { action: WORKSPACE_ACTIONS.reports };
}

export async function showReport(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: WORKSPACE_ACTIONS.report };
  const { item, period } = parseReportArg(arg);
  const permissions = await permissionsOf(actor);
  // Callback'ga ishonilmaydi: tur ro'yxatda bo'lishi va ruxsat yetishi shart
  if (!item || !canViewReport(permissions, item.type)) {
    await context.render('❌ Bu hisobotga ruxsatingiz yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.report };
  }
  return safely(context, async () => {
    const range = periodRange(period);
    const report = await reportService.build(item.type, { ...range, groupBy: 'day' });
    const lines = [`<b>${escapeHtml(report.title)}</b> · ${PERIOD_LABELS[period]} (${shortDate(report.from)} — ${shortDate(report.to)})`, ''];
    for (const kpi of report.kpis) lines.push(`${escapeHtml(kpi.label)}: <b>${formatCell(kpi.value, kpi.type)}</b>`);
    // Qisqa ko'rinish: birinchi qatorlar (dastlabki 3 ustun) — to'liq jadval CSV yoki CRM'da
    if (report.rows.length > 0) {
      const columns = report.columns.slice(0, 3);
      if (report.kpis.length > 0) lines.push('');
      for (const row of report.rows.slice(0, REPORT_ROW_PREVIEW)) {
        const record = row as Record<string, unknown>;
        lines.push(`• ${columns.map((column) => formatCell(record[column.key], column.type)).join(' · ')}`);
      }
    }
    lines.push('', `Jami ${report.truncatedFrom ?? report.rows.length} ta qator. To‘liq: <a href="${primaryClientUrl}/reports">CRM → Hisobotlar</a>`);
    const keyboard: InlineKeyboard = [
      BOT_PERIODS.map((value) => ({ text: value === period ? `• ${PERIOD_LABELS[value]}` : PERIOD_LABELS[value], data: callback(WORKSPACE_ACTIONS.report, `${item.type}:${value}`) })),
    ];
    if (permissions.has(PERMISSIONS.REPORT_EXPORT)) keyboard.push([{ text: '📄 CSV', data: callback(WORKSPACE_ACTIONS.reportCsv, `${item.type}:${period}`) }]);
    keyboard.push([{ text: '⬅️ Hisobotlar', data: callback(WORKSPACE_ACTIONS.reports) }, ...menuRow()]);
    await context.render(lines.join('\n'), keyboard);
    return { action: WORKSPACE_ACTIONS.report };
  });
}

/** Hisobot CSV — REST `/api/reports/:type/export?format=csv` bilan bir xil fayl (report.export + tur ruxsati) */
export async function sendReportCsv(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: WORKSPACE_ACTIONS.reportCsv };
  const { item, period } = parseReportArg(arg);
  const permissions = await permissionsOf(actor);
  if (!item || !canViewReport(permissions, item.type) || !permissions.has(PERMISSIONS.REPORT_EXPORT)) {
    await context.render('⛔ Bu amal uchun ruxsatingiz yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.reportCsv };
  }
  return safely(context, async () => {
    const report = await reportService.build(item.type, { ...periodRange(period), groupBy: 'day' });
    const sent = await telegramService.sendMedia(
      context.chatId,
      { kind: 'document', buffer: Buffer.from(tableToCsv(reportToTable(report)), 'utf8'), fileName: `${item.type}-${report.from}_${report.to}.csv`, mimeType: 'text/csv' },
      `📄 ${escapeHtml(report.title)} · ${shortDate(report.from)} — ${shortDate(report.to)}`,
    );
    if (!sent.ok) await context.reply('Faylni yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring yoki CRM’dan yuklab oling.');
    return { action: WORKSPACE_ACTIONS.reportCsv };
  });
}

/**
 * Kunlik qisqa hisobot (TZ 3.1 GAP-12). Hisob-kitob botda yo'q: web rahbar paneli bilan bir xil
 * `executiveService.summary` (o'quvchi, lead, tushum, qarz, bugungi davomat) va
 * `academyOverviewService.overview` (30 kunlik davomat, vazifa, imtihon, xavf). Ruxsat — REST
 * `/dashboard/executive` kabi `analytics.view`.
 */
export async function showDailyReport(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !(await requirePermission(context, actor, PERMISSIONS.ANALYTICS_VIEW))) return { action: WORKSPACE_ACTIONS.daily };
  return safely(context, async () => {
    const [executive, academy] = await Promise.all([executiveService.summary({}), academyOverviewService.overview()]);
    const { kpi, today } = executive;
    const days = academy.windowDays;
    const todayAttendance = today.markedLessons > 0 ? `${today.attendanceRate}% (${today.markedLessons}/${today.lessons} dars)` : 'hali belgilanmagan';
    const lines = [
      `<b>📊 Kunlik hisobot</b> · ${today.date.slice(8, 10)}.${today.date.slice(5, 7)}.${today.date.slice(0, 4)}`,
      '',
      `👨‍🎓 O‘quvchilar: <b>${kpi.activeStudents}</b> faol${today.newStudents ? ` (+${today.newStudents} bugun)` : ''}`,
      `📞 Leadlar: <b>${today.newLeads}</b> bugun · sinov darsi ${today.trialLessons}`,
      `💰 Tushum: <b>${moneyUz(today.netRevenue)}</b> bugun · oy ${moneyUz(kpi.monthRevenue)}`,
      `💳 Qarz: <b>${moneyUz(kpi.totalDebt)}</b>`,
      `📚 Davomat: bugun <b>${todayAttendance}</b> · ${days} kun ${pct(academy.attendance.rate)}`,
      `📝 Vazifa: <b>${pct(academy.homework.submissionRate)}</b> (${days} kun) · baholash kutmoqda ${academy.homework.toGrade}`,
      `🎯 Imtihon o‘rtachasi: <b>${pct(academy.exams.averagePercentage)}</b> (${days} kun)`,
      `⚠️ Xavf ostida: <b>${academy.risk.atRisk + academy.risk.critical}</b> (kritik ${academy.risk.critical})`,
      '',
      `To‘liq: <a href="${primaryClientUrl}/executive">CRM → Direktor paneli</a>`,
    ];
    const keyboard: InlineKeyboard = [];
    if ((await permissionsOf(actor)).has(PERMISSIONS.REPORT_VIEW)) keyboard.push([{ text: '📑 Hisobotlar', data: callback(WORKSPACE_ACTIONS.reports) }]);
    keyboard.push(menuRow());
    await context.render(lines.join('\n'), keyboard);
    return { action: WORKSPACE_ACTIONS.daily };
  });
}

// ---------------------------------------------------------------------
// Topshiriqlarni tekshirish: javob, fayllar, baho, qaytarish, AI taklifi (TZ §43 + §34)
// ---------------------------------------------------------------------

export async function showReviewQueue(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !(await requirePermission(context, actor, PERMISSIONS.HOMEWORK_GRADE))) return { action: WORKSPACE_ACTIONS.review };
  const access = await getTeachingAccess(actor);
  const rows = await prisma.homeworkSubmission.findMany({
    where: {
      status: { in: ['SUBMITTED', 'LATE'] },
      score: null,
      homework: { status: { not: 'DRAFT' }, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    },
    orderBy: { submittedAt: 'asc' },
    take: REVIEW_LIMIT,
    select: { homeworkId: true, studentId: true, status: true, student: { select: { firstName: true, lastName: true } }, homework: { select: { title: true } } },
  });
  if (rows.length === 0) {
    await context.render('✍️ Baholash kutayotgan topshiriq yo‘q.', [menuRow()]);
    return { action: WORKSPACE_ACTIONS.review };
  }
  const keyboard: InlineKeyboard = rows.map((row) => [
    {
      text: `${row.status === 'LATE' ? '⏰' : '📝'} ${row.student.firstName} ${row.student.lastName.slice(0, 1)}. · ${row.homework.title.slice(0, 28)}`,
      data: callback(WORKSPACE_ACTIONS.reviewOne, `${row.homeworkId}:${row.studentId}`),
    },
  ]);
  keyboard.push(menuRow());
  await context.render(`<b>✍️ Tekshirish</b> · eng eskisidan boshlab (${rows.length})`, keyboard);
  return { action: WORKSPACE_ACTIONS.review };
}

function splitPair(arg: string | null): { homeworkId: string; studentId: string } | null {
  const [homeworkId, studentId] = (arg ?? '').split(':');
  return homeworkId && studentId ? { homeworkId, studentId } : null;
}

export async function showSubmission(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const pair = splitPair(arg);
  if (!actor || !pair) return { action: WORKSPACE_ACTIONS.reviewOne };
  return safely(context, async () => {
    // Doira: o'qituvchi faqat o'z guruhi (homeworkService ichida)
    const detail = await homeworkService.submissionDetail(actor, pair.homeworkId, pair.studentId);
    const homework = await prisma.homework.findUniqueOrThrow({ where: { id: pair.homeworkId }, select: { title: true, maxPoints: true } });
    const lines = [
      `<b>${escapeHtml(detail.firstName)} ${escapeHtml(detail.lastName)}</b> · ${escapeHtml(homework.title)}`,
      `${detail.late ? '⏰ Kech topshirilgan' : '📝 Topshirilgan'} · maksimal ${homework.maxPoints} ball`,
      '',
    ];
    if (detail.answerText) lines.push(`<b>Javob:</b>\n${escapeHtml(detail.answerText.slice(0, 1500))}`);
    if (detail.linkUrl) lines.push(`<b>Havola:</b> ${escapeHtml(detail.linkUrl)}`);
    if (detail.codeText) lines.push(`<b>Kod</b>${detail.codeLanguage ? ` (${escapeHtml(detail.codeLanguage)})` : ''}:\n<pre>${escapeHtml(detail.codeText.slice(0, 1500))}</pre>`);
    if (detail.files.length) lines.push(`📎 Fayllar: ${detail.files.length} ta (quyida)`);
    const keyboard: InlineKeyboard = [
      [
        { text: '✍️ Baho qo‘yish', data: callback(WORKSPACE_ACTIONS.grade, arg!) },
        { text: '↩️ Qaytarish', data: callback(WORKSPACE_ACTIONS.giveBack, arg!) },
      ],
    ];
    if ((await permissionsOf(actor)).has(PERMISSIONS.AI_ACADEMIC)) keyboard.push([{ text: '🤖 AI tekshiruv', data: callback(WORKSPACE_ACTIONS.ai, arg!) }]);
    keyboard.push([{ text: '⬅️ Ro‘yxat', data: callback(WORKSPACE_ACTIONS.review) }, ...menuRow()]);
    await context.render(lines.join('\n'), keyboard);
    // O'quvchi fayllari — CRM'dagi saqlangan faylning o'zi (Telegramga qayta yuklanadi)
    for (const file of detail.files.slice(0, 5)) {
      const stored = await homeworkService.submissionFile(actor, pair.homeworkId, pair.studentId, file.id);
      const buffer = await readFile(stored.absolutePath).catch(() => null);
      if (buffer) await telegramService.sendMedia(context.chatId, { kind: 'document', buffer, fileName: stored.fileName, mimeType: stored.mimeType });
    }
    return { action: WORKSPACE_ACTIONS.reviewOne };
  });
}

export async function askGrade(context: BotContext, scope: CommandScope, arg: string | null, mode: 'grade' | 'return'): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const pair = splitPair(arg);
  if (!actor || !pair) return { action: WORKSPACE_ACTIONS.grade };
  await telegramSessionService.set(context.chatId, { flow: GRADE_FLOW, step: mode, data: pair });
  await context.render(
    mode === 'grade'
      ? '✍️ Ballni yozing, xohlasangiz izoh bilan: <code>85 Yaxshi, validatsiya qo‘shing</code>'
      : '↩️ Nimani tuzatish kerakligini yozing — o‘quvchi va ota-onaga boradi.',
    [[{ text: '❌ Bekor qilish', data: callback(WORKSPACE_ACTIONS.reviewOne, arg!) }]],
  );
  return { action: mode === 'grade' ? WORKSPACE_ACTIONS.grade : WORKSPACE_ACTIONS.giveBack };
}

export async function handleGradeFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const actor = scope.actor;
  const homeworkId = typeof session.data.homeworkId === 'string' ? session.data.homeworkId : null;
  const studentId = typeof session.data.studentId === 'string' ? session.data.studentId : null;
  if (!actor || !homeworkId || !studentId) {
    await telegramSessionService.clearFlow(context.chatId);
    return { action: 'grade_cancel' };
  }
  const text = (context.text ?? '').trim();
  const back: InlineKeyboard = [[{ text: '✍️ Keyingisi', data: callback(WORKSPACE_ACTIONS.review) }, ...menuRow()]];
  if (session.step === 'return') {
    if (text.length < 3) {
      await context.reply('Izoh kamida 3 belgi bo‘lsin.');
      return { action: 'return_invalid' };
    }
    await telegramSessionService.clearFlow(context.chatId);
    return safely(context, async () => {
      await homeworkService.returnSubmission(actor, homeworkId, studentId, { feedback: text.slice(0, 500) }, BOT_CLIENT);
      await context.reply('↩️ Qayta ishlashga qaytarildi.', back);
      return { action: 'homework_returned' };
    });
  }
  const match = /^(\d{1,4})(?:\s+([\s\S]+))?$/.exec(text);
  if (!match) {
    await context.reply('Ball raqam bilan boshlansin: <code>85</code> yoki <code>85 Izoh</code>');
    return { action: 'grade_invalid' };
  }
  await telegramSessionService.clearFlow(context.chatId);
  return safely(context, async () => {
    const score = Number(match[1]);
    const feedback = match[2]?.trim().slice(0, 500);
    await homeworkService.grade(actor, homeworkId, studentId, { status: 'GRADED', score, ...(feedback ? { feedback } : {}) }, BOT_CLIENT);
    await context.reply(`✅ Baholandi: <b>${score}</b> ball${feedback ? `\n💬 ${escapeHtml(feedback)}` : ''}`, back);
    return { action: 'homework_graded' };
  });
}

/** AI tekshiruv (§34): taklif — o'qituvchi qabul qiladi yoki o'zi baholaydi */
export async function runAiReview(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  const pair = splitPair(arg);
  if (!actor || !pair || !(await requirePermission(context, actor, PERMISSIONS.AI_ACADEMIC))) return { action: WORKSPACE_ACTIONS.ai };
  return safely(context, async () => {
    const analysis = await aiAcademicService.reviewSubmission(actor, pair.homeworkId, pair.studentId, BOT_CLIENT);
    const result = analysis.result as { suggestedScore: number | null; maxPoints: number; items: Array<{ type: string; text: string }> };
    const lines = [`<b>🤖 AI tekshiruv</b>${analysis.source === 'RULES' ? ' (qoidalar rejimi)' : ''}`, '', escapeHtml(analysis.summary), ''];
    for (const item of result.items.slice(0, 8)) lines.push(`${item.type === 'FACT' ? '📌' : item.type === 'OBSERVATION' ? '🔍' : '💡'} ${escapeHtml(item.text)}`);
    const keyboard: InlineKeyboard = [];
    if (result.suggestedScore !== null) keyboard.push([{ text: `✅ Qabul qilish (${result.suggestedScore}/${result.maxPoints})`, data: callback(WORKSPACE_ACTIONS.aiAccept, analysis.id) }]);
    keyboard.push([{ text: '✍️ O‘zim baholayman', data: callback(WORKSPACE_ACTIONS.grade, arg!) }, { text: '↩️ Qaytarish', data: callback(WORKSPACE_ACTIONS.giveBack, arg!) }]);
    keyboard.push(menuRow());
    await context.render(lines.join('\n'), keyboard);
    return { action: WORKSPACE_ACTIONS.ai };
  });
}

export async function acceptAi(context: BotContext, scope: CommandScope, analysisId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !analysisId) return { action: WORKSPACE_ACTIONS.aiAccept };
  return safely(context, async () => {
    const accepted = await aiAcademicService.accept(actor, analysisId, {}, BOT_CLIENT);
    await context.render(`✅ AI taklifi qabul qilindi: <b>${String(accepted.decision?.score ?? '')}</b> ball.`, [[{ text: '✍️ Keyingisi', data: callback(WORKSPACE_ACTIONS.review) }, ...menuRow()]]);
    return { action: 'ai_accepted' };
  });
}

export const WORKSPACE_COMMANDS: Readonly<Record<string, string>> = {
  '/qidir': WORKSPACE_ACTIONS.search,
  '/sozlamalar': WORKSPACE_ACTIONS.settings,
  '/kpi': WORKSPACE_ACTIONS.kpi,
  '/marketing': WORKSPACE_ACTIONS.marketing,
  '/hisobotlar': WORKSPACE_ACTIONS.reports,
  '/kunlik': WORKSPACE_ACTIONS.daily,
  '/tekshirish': WORKSPACE_ACTIONS.review,
};

export async function handleWorkspaceAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case WORKSPACE_ACTIONS.settings:
      return showSettings(context, scope);
    case WORKSPACE_ACTIONS.toggleMute:
      return toggleMute(context, scope);
    case WORKSPACE_ACTIONS.toggleType:
      return toggleType(context, scope, arg);
    case WORKSPACE_ACTIONS.toggleCategory:
      return toggleCategory(context, scope, arg);
    case WORKSPACE_ACTIONS.search:
      return startSearch(context, scope);
    case WORKSPACE_ACTIONS.kpi:
      return showKpi(context, scope);
    case WORKSPACE_ACTIONS.teacherKpi:
      return showTeacherKpi(context, scope, arg);
    case WORKSPACE_ACTIONS.marketing:
      return showMarketing(context, scope, arg);
    case WORKSPACE_ACTIONS.marketingCsv:
      return sendMarketingCsv(context, scope, arg);
    case WORKSPACE_ACTIONS.reports:
      return showReports(context, scope);
    case WORKSPACE_ACTIONS.report:
      return showReport(context, scope, arg);
    case WORKSPACE_ACTIONS.reportCsv:
      return sendReportCsv(context, scope, arg);
    case WORKSPACE_ACTIONS.daily:
      return showDailyReport(context, scope);
    case WORKSPACE_ACTIONS.review:
      return showReviewQueue(context, scope);
    case WORKSPACE_ACTIONS.reviewOne:
      return showSubmission(context, scope, arg);
    case WORKSPACE_ACTIONS.grade:
      return askGrade(context, scope, arg, 'grade');
    case WORKSPACE_ACTIONS.giveBack:
      return askGrade(context, scope, arg, 'return');
    case WORKSPACE_ACTIONS.ai:
      return runAiReview(context, scope, arg);
    case WORKSPACE_ACTIONS.aiAccept:
      return acceptAi(context, scope, arg);
    default:
      return undefined;
  }
}
