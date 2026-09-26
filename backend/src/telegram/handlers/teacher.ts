import { attendanceService } from '../../services/attendance.service.js';
import { attendanceAnalyticsService } from '../../services/attendanceAnalytics.service.js';
import { groupService } from '../../services/group.service.js';
import { homeworkService } from '../../services/homework.service.js';
import { escapeHtml, telegramService, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import { env } from '../../config/env.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { businessDateString } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { GroupListQuery } from '../../validators/group.validator.js';
import { fmtDate, fmtDateTime, parseLocalDateTime } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, paginationRow } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { PreparedAttachment } from '../../services/homework.service.js';
import { BOT_FORBIDDEN_TEXT, botCan } from '../permissions.js';

/**
 * O'qituvchi bo'limlari: guruhlar, bugungi darslar, tezkor davomat, vazifa berish.
 *
 * Bot xodim nomidan **mavjud CRM servislarini** chaqiradi — `scope.actor` haqiqiy `AuthUser`.
 * Shuning uchun ruxsat (`attendance.mark`, `homework.manage`) va "faqat o'z guruhlari" qoidasi
 * CRM'dagi bilan **aynan bir xil**: bu yerda alohida tekshiruv yozilmagan (TZ §5).
 *
 * Davomat saqlanganda XP, seriya, ota-onaga xabar va audit — hammasi `attendanceService.mark`
 * ichida. Bot faqat ro'yxatni ko'rsatadi va natijani uzatadi (TZ §18).
 */

export const TEACHER_ACTIONS = {
  groups: 'tc_groups',
  today: 'tc_today',
  group: 'tc_group',
  students: 'tc_students',
  attendance: 'tc_att',
  toggle: 'tc_tog',
  save: 'tc_save',
  homework: 'tc_hw',
  /** Fayl bosqichidan tasdiqqa o'tish ("Faylsiz davom etish" / "Davom etish") */
  homeworkNext: 'tc_hwnext',
  homeworkConfirm: 'tc_hwok',
} as const;

export const ATTENDANCE_FLOW = 'attendance';
export const HOMEWORK_CREATE_FLOW = 'homework';

/** Shu tugmalar oqim ichida bosiladi — ular sessiyani yopmasligi kerak */
export const TEACHER_FLOW_ACTIONS: ReadonlySet<string> = new Set([TEACHER_ACTIONS.toggle, TEACHER_ACTIONS.save, TEACHER_ACTIONS.homeworkNext, TEACHER_ACTIONS.homeworkConfirm]);

/** Bot orqali qilingan amal auditda shunday ko'rinadi */
const BOT_CLIENT: ClientInfo = { ip: null, userAgent: 'telegram-bot' };

const GROUPS_PAGE_SIZE = 8;
const ATTENDANCE_MARKS = { PRESENT: '✅', ABSENT: '❌', LATE: '⏰', EXCUSED: '📝' } as const;
type Mark = keyof typeof ATTENDANCE_MARKS;
/** Tugma bosilganda holat shu tartibda aylanadi */
const MARK_CYCLE: readonly Mark[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

function todayDate(now: Date = new Date()): Date {
  // Davomat sanasi bazada UTC yarim tun sifatida turadi; "bugun" — o'quv markaz vaqti bo'yicha
  return new Date(`${businessDateString(now)}T00:00:00.000Z`);
}

async function requireActor(context: BotContext, scope: CommandScope): Promise<AuthUser | null> {
  if (scope.actor) return scope.actor;
  await context.render('Bu bo‘lim xodimlar uchun.', [menuRow()]);
  return null;
}

/**
 * Servis xatosi (404 — guruh topilmadi, 403 — ruxsat yo'q) foydalanuvchiga **o'z matni** bilan
 * ko'rsatiladi: bu kutilgan holat, umumiy "Xatolik yuz berdi" emas. Boshqa xatolar routerga.
 */
async function safely(context: BotContext, backAction: string, work: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      await context.render(`❌ ${escapeHtml(error.message)}`, [[{ text: '⬅️ Orqaga', data: callback(backAction) }, ...menuRow()]]);
      return { action: 'teacher_error' };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------
// Guruhlar
// ---------------------------------------------------------------------

export async function showGroups(context: BotContext, scope: CommandScope, pageArg: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.groups };

  const requested = Number(pageArg ?? '1');
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const query = { page, limit: GROUPS_PAGE_SIZE, status: 'ACTIVE', sortBy: 'name' } as GroupListQuery;
  const { items, total } = await groupService.list(actor, query);

  if (items.length === 0) {
    await context.render('📚 Sizga biriktirilgan faol guruh yo‘q.', [menuRow()]);
    return { action: TEACHER_ACTIONS.groups };
  }

  const keyboard: InlineKeyboard = items.map((group) => [
    { text: `👥 ${group.name} · ${group.studentCount} o‘quvchi`, data: callback(TEACHER_ACTIONS.group, group.id) },
  ]);
  const totalPages = Math.max(1, Math.ceil(total / GROUPS_PAGE_SIZE));
  const pager = paginationRow(TEACHER_ACTIONS.groups, { page, totalPages });
  if (pager.length > 0) keyboard.push(pager);
  keyboard.push(menuRow());

  await context.render(`<b>📚 Guruhlarim</b> · ${total} ta`, keyboard);
  return { action: TEACHER_ACTIONS.groups };
}

const WEEKDAY_SHORT: Record<string, string> = {
  MONDAY: 'Du',
  TUESDAY: 'Se',
  WEDNESDAY: 'Ch',
  THURSDAY: 'Pa',
  FRIDAY: 'Ju',
  SATURDAY: 'Sh',
  SUNDAY: 'Ya',
};

export async function showGroup(context: BotContext, scope: CommandScope, groupId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !groupId) return { action: TEACHER_ACTIONS.group };

  return safely(context, TEACHER_ACTIONS.groups, async () => {
    const group = await groupService.getById(actor, groupId);
    const canGiveHomework = await botCan(actor, PERMISSIONS.HOMEWORK_MANAGE);
    const lines = [
      `<b>👥 ${escapeHtml(group.name)}</b>`,
      `📚 ${escapeHtml(group.course.name)}`,
      `🗓 ${group.scheduleDays.map((day) => WEEKDAY_SHORT[day] ?? day).join(', ')} · ${group.startTime}–${group.endTime}`,
      group.roomRef ? `🚪 ${escapeHtml(group.roomRef.name)}` : group.room ? `🚪 ${escapeHtml(group.room)}` : '',
      `🎓 ${group.studentCount} o‘quvchi (bo‘sh joy: ${group.freeSeats})`,
    ].filter(Boolean);

    await context.render(lines.join('\n'), [
      [
        { text: '✅ Davomat', data: callback(TEACHER_ACTIONS.attendance, group.id) },
        { text: '👨‍🎓 O‘quvchilar', data: callback(TEACHER_ACTIONS.students, group.id) },
      ],
      ...(canGiveHomework ? [[{ text: '📝 Vazifa berish', data: callback(TEACHER_ACTIONS.homework, group.id) }]] : []),
      [{ text: '⬅️ Guruhlar', data: callback(TEACHER_ACTIONS.groups) }, ...menuRow()],
    ]);
    return { action: TEACHER_ACTIONS.group };
  });
}

export async function showStudents(context: BotContext, scope: CommandScope, groupId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !groupId) return { action: TEACHER_ACTIONS.students };

  return safely(context, TEACHER_ACTIONS.groups, async () => {
    const sheet = await attendanceService.getSheet(actor, groupId, todayDate());
    const lines = [`<b>👨‍🎓 ${escapeHtml(sheet.group.name)}</b> · ${sheet.students.length} o‘quvchi`, ''];
    for (const row of sheet.students) {
      lines.push(`• ${escapeHtml(row.firstName)} ${escapeHtml(row.lastName)} · ${escapeHtml(row.phone)}`);
    }
    if (sheet.students.length === 0) lines.push('Faol o‘quvchi yo‘q.');

    await context.render(lines.join('\n'), [[{ text: '⬅️ Guruh', data: callback(TEACHER_ACTIONS.group, groupId) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.students };
  });
}

// ---------------------------------------------------------------------
// Bugungi darslar
// ---------------------------------------------------------------------

export async function showToday(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.today };

  const overview = await attendanceAnalyticsService.teacherOverview(actor);
  const scheduled = overview.groups.filter((group) => group.isScheduledToday).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (scheduled.length === 0) {
    await context.render('📅 Bugun dars rejalashtirilmagan.', [[{ text: '📚 Guruhlarim', data: callback(TEACHER_ACTIONS.groups) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.today };
  }

  const lines = [`<b>📅 Bugungi darslar</b> · ${fmtDate(new Date())}`, ''];
  for (const group of scheduled) {
    const done = group.markedToday >= group.students && group.students > 0;
    lines.push(`${done ? '✅' : '⬜'} ${group.startTime}–${group.endTime} · <b>${escapeHtml(group.name)}</b> · davomat ${group.markedToday}/${group.students}`);
  }
  if (overview.todayAbsent.length > 0) {
    lines.push('', `<b>❌ Bugun kelmaganlar (${overview.todayAbsent.length}):</b>`);
    for (const absent of overview.todayAbsent.slice(0, 10)) {
      lines.push(`• ${escapeHtml(absent.firstName)} ${escapeHtml(absent.lastName)} — ${escapeHtml(absent.groupName)}`);
    }
  }

  const keyboard: InlineKeyboard = scheduled.map((group) => [
    { text: `${group.markedToday >= group.students && group.students > 0 ? '✅' : '📋'} ${group.name} — davomat`, data: callback(TEACHER_ACTIONS.attendance, group.id) },
  ]);
  keyboard.push(menuRow());
  await context.render(lines.join('\n'), keyboard);
  return { action: TEACHER_ACTIONS.today };
}

// ---------------------------------------------------------------------
// Tezkor davomat (oqim)
// ---------------------------------------------------------------------

interface AttendanceDraft {
  groupId: string;
  groupName: string;
  date: string;
  students: Array<{ id: string; name: string }>;
  marks: Record<string, Mark>;
}

function draftOf(session: SessionState): AttendanceDraft | null {
  const data = session.data as Partial<AttendanceDraft>;
  if (session.flow !== ATTENDANCE_FLOW || typeof data.groupId !== 'string' || !Array.isArray(data.students)) return null;
  return data as AttendanceDraft;
}

async function renderAttendanceDraft(context: BotContext, draft: AttendanceDraft, note: string): Promise<void> {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const mark of Object.values(draft.marks)) counts[mark] += 1;

  const lines = [
    `<b>✅ Davomat — ${escapeHtml(draft.groupName)}</b> · ${fmtDate(draft.date)}`,
    note,
    '',
    `✅ ${counts.PRESENT} · ❌ ${counts.ABSENT} · ⏰ ${counts.LATE} · 📝 ${counts.EXCUSED}`,
    'Tugmani bosib holatni almashtiring: ✅ keldi → ❌ kelmadi → ⏰ kechikdi → 📝 sababli',
  ].filter(Boolean);

  const keyboard: InlineKeyboard = draft.students.map((student) => [
    { text: `${ATTENDANCE_MARKS[draft.marks[student.id] ?? 'PRESENT']} ${student.name}`, data: callback(TEACHER_ACTIONS.toggle, student.id) },
  ]);
  keyboard.push([
    { text: '💾 Saqlash', data: callback(TEACHER_ACTIONS.save) },
    { text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, draft.groupId) },
  ]);
  await context.render(lines.join('\n'), keyboard);
}

/**
 * Davomat varag'ini ochadi. Belgilanmaganlar **"keldi"** deb boshlanadi: o'qituvchi faqat
 * kelmaganlarni bosadi — 30 kishilik guruhda 30 emas, 2–3 ta bosish.
 */
export async function startAttendance(context: BotContext, scope: CommandScope, groupId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !groupId) return { action: TEACHER_ACTIONS.attendance };

  return safely(context, TEACHER_ACTIONS.today, async () => {
    const date = todayDate();
    const sheet = await attendanceService.getSheet(actor, groupId, date);
    if (!sheet.canMark) throw AppError.forbidden('Bu guruhda davomat olish huquqingiz yo‘q');
    if (sheet.students.length === 0) {
      await context.render('Guruhda faol o‘quvchi yo‘q.', [[{ text: '⬅️ Guruh', data: callback(TEACHER_ACTIONS.group, groupId) }, ...menuRow()]]);
      return { action: TEACHER_ACTIONS.attendance };
    }

    const draft: AttendanceDraft = {
      groupId,
      groupName: sheet.group.name,
      date: date.toISOString(),
      students: sheet.students.map((row) => ({ id: row.studentId, name: `${row.firstName} ${row.lastName}` })),
      marks: Object.fromEntries(sheet.students.map((row) => [row.studentId, row.status ?? 'PRESENT'])),
    };
    await telegramSessionService.set(context.chatId, { flow: ATTENDANCE_FLOW, step: 'mark', data: draft as never });

    const note = sheet.isScheduledDay ? '' : '⚠️ Bugun bu guruhning dars kuni emas — baribir saqlash mumkin.';
    await renderAttendanceDraft(context, draft, note);
    return { action: TEACHER_ACTIONS.attendance };
  });
}

export async function toggleAttendance(context: BotContext, scope: CommandScope, studentId: string | null): Promise<HandlerResult> {
  if (!scope.actor) return { action: TEACHER_ACTIONS.toggle };
  const session = await telegramSessionService.get(context.chatId);
  const draft = session ? draftOf(session) : null;
  if (!draft) {
    await context.render('Davomat varag‘i yopilgan. Qaytadan oching.', [[{ text: '📅 Bugungi darslar', data: callback(TEACHER_ACTIONS.today) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.toggle };
  }

  // Callback ichidagi id faqat varaqdagi o'quvchi bo'lsa qabul qilinadi
  if (studentId && draft.students.some((student) => student.id === studentId)) {
    const current = draft.marks[studentId] ?? 'PRESENT';
    const next = MARK_CYCLE[(MARK_CYCLE.indexOf(current) + 1) % MARK_CYCLE.length]!;
    draft.marks[studentId] = next;
    await telegramSessionService.set(context.chatId, { flow: ATTENDANCE_FLOW, step: 'mark', data: draft as never });
  }
  await renderAttendanceDraft(context, draft, '');
  return { action: TEACHER_ACTIONS.toggle };
}

export async function saveAttendance(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.save };
  const session = await telegramSessionService.get(context.chatId);
  const draft = session ? draftOf(session) : null;
  if (!draft) {
    await context.render('Davomat varag‘i yopilgan. Qaytadan oching.', [[{ text: '📅 Bugungi darslar', data: callback(TEACHER_ACTIONS.today) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.save };
  }

  return safely(context, TEACHER_ACTIONS.today, async () => {
    // XP, seriya, ota-onaga xabar, audit — hammasi servis ichida
    const sheet = await attendanceService.mark(
      actor,
      draft.groupId,
      { date: new Date(draft.date), records: draft.students.map((student) => ({ studentId: student.id, status: draft.marks[student.id] ?? 'PRESENT', note: undefined })) },
      BOT_CLIENT,
    );
    await telegramSessionService.clearFlow(context.chatId);

    const s = sheet.summary;
    await context.render(
      [
        `✅ <b>Davomat saqlandi</b> — ${escapeHtml(sheet.group.name)}, ${fmtDate(sheet.date)}`,
        '',
        `✅ Keldi: ${s.PRESENT} · ❌ Kelmadi: ${s.ABSENT} · ⏰ Kechikdi: ${s.LATE} · 📝 Sababli: ${s.EXCUSED}`,
        s.ABSENT > 0 ? 'Kelmaganlarning ota-onasiga xabar yuborildi.' : '',
      ].filter(Boolean).join('\n'),
      [[{ text: '📅 Bugungi darslar', data: callback(TEACHER_ACTIONS.today) }, ...menuRow()]],
    );
    return { action: 'attendance_saved' };
  });
}

// ---------------------------------------------------------------------
// Vazifa berish (TZ 3.1 GAP-07: guruh → sarlavha → tavsif → muddat → fayl → tasdiq → yaratish)
// ---------------------------------------------------------------------

interface HomeworkDraft {
  groupId: string;
  groupName: string;
  title?: string;
  description?: string | null;
  deadline?: string;
  /**
   * Qabul qilingan zahoti Telegram'dan yuklab olinib, tekshirilib **CRM xotirasiga** saqlangan fayllar
   * (Telegram `file_id` doimiy saqlash emas — TZ §13 "Storage").
   */
  files?: PreparedAttachment[];
}

const MAX_HOMEWORK_FILES = 5;

/** `homework.manage` — REST'dagi `POST /homework` bilan bir xil (audit S1) */
async function requireHomeworkPermission(context: BotContext, actor: AuthUser, groupId?: string): Promise<boolean> {
  if (await botCan(actor, PERMISSIONS.HOMEWORK_MANAGE)) return true;
  await telegramSessionService.clearFlow(context.chatId);
  await context.render(BOT_FORBIDDEN_TEXT, [[...(groupId ? [{ text: '⬅️ Guruh', data: callback(TEACHER_ACTIONS.group, groupId) }] : []), ...menuRow()]]);
  return false;
}

export async function startHomeworkCreate(context: BotContext, scope: CommandScope, groupId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !groupId) return { action: TEACHER_ACTIONS.homework };
  if (!(await requireHomeworkPermission(context, actor, groupId))) return { action: 'hw_forbidden' };

  return safely(context, TEACHER_ACTIONS.groups, async () => {
    const group = await groupService.getById(actor, groupId);
    const draft: HomeworkDraft = { groupId: group.id, groupName: group.name };
    await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'title', data: draft as never });
    await context.render(
      `<b>📝 Yangi vazifa — ${escapeHtml(group.name)}</b>\n\n1/4. Vazifa <b>sarlavhasini</b> yozing (masalan: «5-mashq, 12-bet»).`,
      [[{ text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, group.id) }]],
    );
    return { action: TEACHER_ACTIONS.homework };
  });
}

function cancelRow(groupId: string): InlineKeyboard {
  return [[{ text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, groupId) }]];
}

function filesKeyboard(draft: HomeworkDraft): InlineKeyboard {
  const count = draft.files?.length ?? 0;
  return [
    [{ text: count > 0 ? `➡️ Davom etish (${count} fayl)` : '➡️ Faylsiz davom etish', data: callback(TEACHER_ACTIONS.homeworkNext) }],
    [{ text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, draft.groupId) }],
  ];
}

async function showHomeworkConfirm(context: BotContext, draft: HomeworkDraft): Promise<HandlerResult> {
  await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'confirm', data: draft as never });
  const files = draft.files ?? [];
  await context.render(
    [
      `<b>📝 ${escapeHtml(draft.title ?? '')}</b>`,
      `👥 ${escapeHtml(draft.groupName)}`,
      `⏰ Muddat: ${fmtDateTime(draft.deadline ?? new Date())}`,
      draft.description ? `📄 ${escapeHtml(draft.description)}` : '📄 Tavsif yo‘q',
      files.length ? `📎 ${files.map((file) => escapeHtml(file.originalName)).join(', ')}` : '📎 Fayl yo‘q',
      '',
      'E’lon qilinsinmi? Guruhdagi barcha faol o‘quvchiga topshiriq ochiladi.',
    ].join('\n'),
    [
      [
        { text: '✅ E’lon qilish', data: callback(TEACHER_ACTIONS.homeworkConfirm) },
        { text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, draft.groupId) },
      ],
    ],
  );
  return { action: 'hw_create_confirm' };
}

export async function handleHomeworkCreateFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const draft = session.data as unknown as HomeworkDraft;
  if (!scope.actor || typeof draft.groupId !== 'string') {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Vazifa yaratish bekor qilindi.', [menuRow()]);
    return { action: 'hw_create_cancel' };
  }
  // Ruxsat oqim davomida olib qo'yilgan bo'lishi mumkin — har qadamda qayta
  if (!(await requireHomeworkPermission(context, scope.actor, draft.groupId))) return { action: 'hw_forbidden' };
  const text = (context.text ?? '').trim();

  switch (session.step) {
    case 'title': {
      if (text.length < 3 || text.length > 200) {
        await context.reply('Sarlavha 3 dan 200 belgigacha bo‘lsin. Qaytadan yozing.', cancelRow(draft.groupId));
        return { action: 'hw_create_title_invalid' };
      }
      draft.title = text;
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'description', data: draft as never });
      await context.reply('2/4. <b>Tavsif</b> yozing (nima qilish kerak). Tavsif kerak bo‘lmasa «-» yuboring.', cancelRow(draft.groupId));
      return { action: 'hw_create_title' };
    }
    case 'description': {
      if (text.length > 2000) {
        await context.reply('Tavsif 2000 belgidan oshmasin. Qisqartirib yozing.', cancelRow(draft.groupId));
        return { action: 'hw_create_description_invalid' };
      }
      draft.description = text === '-' || text === '' ? null : text;
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'deadline', data: draft as never });
      await context.reply(
        '3/4. <b>Muddatni</b> yozing: <code>25.12.2026</code> yoki <code>25.12.2026 18:00</code>\n(vaqt yozilmasa — kun oxiri 23:59)',
        cancelRow(draft.groupId),
      );
      return { action: 'hw_create_description' };
    }
    case 'deadline': {
      const deadline = parseLocalDateTime(text);
      if (!deadline) {
        await context.reply('Sana tushunarsiz. Masalan: <code>25.12.2026</code> yoki <code>25.12.2026 18:00</code>', cancelRow(draft.groupId));
        return { action: 'hw_create_deadline_invalid' };
      }
      if (deadline.getTime() < Date.now()) {
        await context.reply('Muddat o‘tib ketgan sana bo‘lmasin. Qaytadan yozing.', cancelRow(draft.groupId));
        return { action: 'hw_create_deadline_past' };
      }
      draft.deadline = deadline.toISOString();
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'files', data: draft as never });
      await context.reply(
        `4/4. 📎 Kerak bo‘lsa <b>fayl yoki rasm</b> yuboring (PDF, JPG, PNG, WEBP — ${MAX_HOMEWORK_FILES} tagacha). Fayl kerak bo‘lmasa — «Faylsiz davom etish».`,
        filesKeyboard(draft),
      );
      return { action: 'hw_create_deadline' };
    }
    case 'files': {
      if (!context.attachment) {
        await context.reply('Fayl yoki rasm yuboring yoki «Davom etish» ni bosing.', filesKeyboard(draft));
        return { action: 'hw_create_file_expected' };
      }
      const files = draft.files ?? [];
      if (files.length >= MAX_HOMEWORK_FILES) {
        await context.reply(`Ko‘pi bilan ${MAX_HOMEWORK_FILES} ta fayl. «Davom etish» ni bosing.`, filesKeyboard(draft));
        return { action: 'hw_create_file_limit' };
      }
      // Qabul qilingan zahoti: yuklab olish (hajm chegarasi) → tur baytlar bo'yicha → CRM xotirasi
      const downloaded = await telegramService.downloadFile(context.attachment.fileId, env.MAX_UPLOAD_MB * 1024 * 1024);
      if ('error' in downloaded) {
        await context.reply(`❌ ${escapeHtml(downloaded.error)}`, filesKeyboard(draft));
        return { action: 'hw_create_file_failed' };
      }
      try {
        files.push(await homeworkService.prepareAttachment({ buffer: downloaded.buffer, fileName: context.attachment.fileName ?? undefined }));
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        await context.reply(`❌ ${escapeHtml(error.message)}`, filesKeyboard(draft));
        return { action: 'hw_create_file_rejected' };
      }
      draft.files = files;
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'files', data: draft as never });
      await context.reply(`📎 Fayl qabul qilindi (${files.length}/${MAX_HOMEWORK_FILES}).`, filesKeyboard(draft));
      return { action: 'hw_create_file' };
    }
    default: {
      await context.reply('Tasdiqlash uchun «✅ E’lon qilish» tugmasini bosing.', cancelRow(draft.groupId));
      return { action: 'hw_create_wait_confirm' };
    }
  }
}

/** Fayl bosqichidan tasdiqqa */
export async function homeworkFilesDone(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.homeworkNext };
  const session = await telegramSessionService.get(context.chatId);
  const draft = session?.flow === HOMEWORK_CREATE_FLOW && session.step === 'files' ? (session.data as unknown as HomeworkDraft) : null;
  if (!draft?.title || !draft.deadline) {
    await context.render('Vazifa ma’lumoti topilmadi. Qaytadan boshlang.', [[{ text: '📚 Guruhlarim', data: callback(TEACHER_ACTIONS.groups) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.homeworkNext };
  }
  if (!(await requireHomeworkPermission(context, actor, draft.groupId))) return { action: 'hw_forbidden' };
  return showHomeworkConfirm(context, draft);
}

/**
 * Yaratish **atomik ko'rinishda**: avval qoralama (o'quvchilarga ko'rinmaydi, xabar ketmaydi) → fayllar
 * biriktiriladi → faqat hammasi muvaffaqiyatli bo'lsa e'lon (topshiriqlar + bildirishnoma). Xato bo'lsa
 * vazifa qoralamada qoladi — o'qituvchi web'da tekshiradi.
 */
export async function confirmHomeworkCreate(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.homeworkConfirm };
  const session = await telegramSessionService.get(context.chatId);
  const draft = session?.flow === HOMEWORK_CREATE_FLOW && session.step === 'confirm' ? (session.data as unknown as HomeworkDraft) : null;
  if (!draft?.title || !draft.deadline) {
    await context.render('Vazifa ma’lumoti topilmadi. Qaytadan boshlang.', [[{ text: '📚 Guruhlarim', data: callback(TEACHER_ACTIONS.groups) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.homeworkConfirm };
  }
  if (!(await requireHomeworkPermission(context, actor, draft.groupId))) return { action: 'hw_forbidden' };

  return safely(context, TEACHER_ACTIONS.groups, async () => {
    const created = await homeworkService.create(
      actor,
      {
        title: draft.title!,
        description: draft.description ?? undefined,
        groupId: draft.groupId,
        deadline: new Date(draft.deadline!),
        maxPoints: 100,
        xpReward: 20,
        status: 'DRAFT',
      },
      BOT_CLIENT,
    );
    await telegramSessionService.clearFlow(context.chatId);
    try {
      for (const file of draft.files ?? []) await homeworkService.attachStoredFile(actor, created.id, file, undefined, BOT_CLIENT);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await context.render(
        `⚠️ Vazifa <b>qoralama</b> sifatida saqlandi, lekin fayl biriktirilmadi: ${escapeHtml(error.message)}\nO‘quvchilarga hali ko‘rinmaydi — CRM’da tekshirib e’lon qiling.`,
        [[{ text: '⬅️ Guruh', data: callback(TEACHER_ACTIONS.group, draft.groupId) }, ...menuRow()]],
      );
      return { action: 'hw_created_draft' };
    }
    const published = await homeworkService.update(actor, created.id, { status: 'PUBLISHED' }, BOT_CLIENT);
    const filesLine = draft.files?.length ? `\n📎 ${draft.files.length} ta fayl biriktirildi` : '';
    await context.render(
      `✅ <b>Vazifa e’lon qilindi</b>\n📝 ${escapeHtml(published.title)}\n⏰ ${fmtDateTime(published.deadline)}${filesLine}\n\nO‘quvchilar botda va kabinetda ko‘radi.`,
      [[{ text: '⬅️ Guruh', data: callback(TEACHER_ACTIONS.group, draft.groupId) }, ...menuRow()]],
    );
    return { action: 'hw_created' };
  });
}

/** Matnli buyruq → bo'lim */
export const TEACHER_COMMANDS: Readonly<Record<string, string>> = {
  '/guruhlar': TEACHER_ACTIONS.groups,
  '/bugun': TEACHER_ACTIONS.today,
};

export async function handleTeacherAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case TEACHER_ACTIONS.groups:
      return showGroups(context, scope, arg);
    case TEACHER_ACTIONS.today:
      return showToday(context, scope);
    case TEACHER_ACTIONS.group:
      return showGroup(context, scope, arg);
    case TEACHER_ACTIONS.students:
      return showStudents(context, scope, arg);
    case TEACHER_ACTIONS.attendance:
      return startAttendance(context, scope, arg);
    case TEACHER_ACTIONS.toggle:
      return toggleAttendance(context, scope, arg);
    case TEACHER_ACTIONS.save:
      return saveAttendance(context, scope);
    case TEACHER_ACTIONS.homework:
      return startHomeworkCreate(context, scope, arg);
    case TEACHER_ACTIONS.homeworkNext:
      return homeworkFilesDone(context, scope);
    case TEACHER_ACTIONS.homeworkConfirm:
      return confirmHomeworkCreate(context, scope);
    default:
      return undefined;
  }
}
