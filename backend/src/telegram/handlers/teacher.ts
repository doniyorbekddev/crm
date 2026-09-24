import { attendanceService } from '../../services/attendance.service.js';
import { attendanceAnalyticsService } from '../../services/attendanceAnalytics.service.js';
import { groupService } from '../../services/group.service.js';
import { homeworkService } from '../../services/homework.service.js';
import { escapeHtml, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
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
  homeworkConfirm: 'tc_hwok',
} as const;

export const ATTENDANCE_FLOW = 'attendance';
export const HOMEWORK_CREATE_FLOW = 'homework';

/** Shu tugmalar oqim ichida bosiladi — ular sessiyani yopmasligi kerak */
export const TEACHER_FLOW_ACTIONS: ReadonlySet<string> = new Set([TEACHER_ACTIONS.toggle, TEACHER_ACTIONS.save, TEACHER_ACTIONS.homeworkConfirm]);

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
      [{ text: '📝 Vazifa berish', data: callback(TEACHER_ACTIONS.homework, group.id) }],
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
// Vazifa berish (oqim: sarlavha → muddat → tavsif → tasdiq)
// ---------------------------------------------------------------------

interface HomeworkDraft {
  groupId: string;
  groupName: string;
  title?: string;
  deadline?: string;
  description?: string | null;
}

export async function startHomeworkCreate(context: BotContext, scope: CommandScope, groupId: string | null): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor || !groupId) return { action: TEACHER_ACTIONS.homework };

  return safely(context, TEACHER_ACTIONS.groups, async () => {
    const group = await groupService.getById(actor, groupId);
    const draft: HomeworkDraft = { groupId: group.id, groupName: group.name };
    await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'title', data: draft as never });
    await context.render(
      `<b>📝 Yangi vazifa — ${escapeHtml(group.name)}</b>\n\n1/3. Vazifa <b>sarlavhasini</b> yozing (masalan: «5-mashq, 12-bet»).`,
      [[{ text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, group.id) }]],
    );
    return { action: TEACHER_ACTIONS.homework };
  });
}

function cancelRow(groupId: string): InlineKeyboard {
  return [[{ text: '❌ Bekor qilish', data: callback(TEACHER_ACTIONS.group, groupId) }]];
}

export async function handleHomeworkCreateFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const draft = session.data as unknown as HomeworkDraft;
  if (!scope.actor || typeof draft.groupId !== 'string') {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Vazifa yaratish bekor qilindi.', [menuRow()]);
    return { action: 'hw_create_cancel' };
  }
  const text = (context.text ?? '').trim();

  switch (session.step) {
    case 'title': {
      if (text.length < 3 || text.length > 200) {
        await context.reply('Sarlavha 3 dan 200 belgigacha bo‘lsin. Qaytadan yozing.', cancelRow(draft.groupId));
        return { action: 'hw_create_title_invalid' };
      }
      draft.title = text;
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'deadline', data: draft as never });
      await context.reply(
        '2/3. <b>Muddatni</b> yozing: <code>25.12.2026</code> yoki <code>25.12.2026 18:00</code>\n(vaqt yozilmasa — kun oxiri 23:59)',
        cancelRow(draft.groupId),
      );
      return { action: 'hw_create_title' };
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
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'description', data: draft as never });
      await context.reply('3/3. <b>Tavsif</b> yozing (nima qilish kerak). Tavsif kerak bo‘lmasa «-» yuboring.', cancelRow(draft.groupId));
      return { action: 'hw_create_deadline' };
    }
    case 'description': {
      if (text.length > 2000) {
        await context.reply('Tavsif 2000 belgidan oshmasin. Qisqartirib yozing.', cancelRow(draft.groupId));
        return { action: 'hw_create_description_invalid' };
      }
      draft.description = text === '-' || text === '' ? null : text;
      await telegramSessionService.set(context.chatId, { flow: HOMEWORK_CREATE_FLOW, step: 'confirm', data: draft as never });
      await context.reply(
        [
          `<b>📝 ${escapeHtml(draft.title ?? '')}</b>`,
          `👥 ${escapeHtml(draft.groupName)}`,
          `⏰ Muddat: ${fmtDateTime(draft.deadline ?? new Date())}`,
          draft.description ? `📄 ${escapeHtml(draft.description)}` : '📄 Tavsif yo‘q',
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
      return { action: 'hw_create_description' };
    }
    default:
      // Tasdiq bosqichida matn kutilmaydi — tugmani eslatamiz
      await context.reply('Tasdiqlash uchun «✅ E’lon qilish» tugmasini bosing.', cancelRow(draft.groupId));
      return { action: 'hw_create_wait_confirm' };
  }
}

export async function confirmHomeworkCreate(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: TEACHER_ACTIONS.homeworkConfirm };
  const session = await telegramSessionService.get(context.chatId);
  const draft = session?.flow === HOMEWORK_CREATE_FLOW && session.step === 'confirm' ? (session.data as unknown as HomeworkDraft) : null;
  if (!draft?.title || !draft.deadline) {
    await context.render('Vazifa ma’lumoti topilmadi. Qaytadan boshlang.', [[{ text: '📚 Guruhlarim', data: callback(TEACHER_ACTIONS.groups) }, ...menuRow()]]);
    return { action: TEACHER_ACTIONS.homeworkConfirm };
  }

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
        status: 'PUBLISHED',
      },
      BOT_CLIENT,
    );
    await telegramSessionService.clearFlow(context.chatId);
    await context.render(
      `✅ <b>Vazifa e’lon qilindi</b>\n📝 ${escapeHtml(created.title)}\n⏰ ${fmtDateTime(created.deadline)}\n\nO‘quvchilar botda va kabinetda ko‘radi.`,
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
    case TEACHER_ACTIONS.homeworkConfirm:
      return confirmHomeworkCreate(context, scope);
    default:
      return undefined;
  }
}
