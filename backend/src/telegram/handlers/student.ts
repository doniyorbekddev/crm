import { prisma } from '../../config/database.js';
import { env, primaryClientUrl } from '../../config/env.js';
import { PAYMENT_METHOD_LABELS } from '../../config/paymentLabels.js';
import { STUDENT_STATUS_LABELS, formatStudentNumber } from '../../config/studentLabels.js';
import { buildAttendanceCalendar } from '../../services/attendanceAnalytics.service.js';
import { certificateService } from '../../services/certificate.service.js';
import { gamificationService } from '../../services/gamification.service.js';
import { homeworkService } from '../../services/homework.service.js';
import { buildStudentExamRows, buildStudentHomeworkRows, type StudentHomeworkRowDto } from '../../services/studentProgress.service.js';
import { escapeHtml, telegramService, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import { debtText, type CommandScope } from '../../services/telegramCommand.service.js';
import { AppError } from '../../utils/AppError.js';
import { detectFileType, saveFile } from '../../utils/fileStorage.js';
import { fmtDate, fmtDateTime, monthTitle } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback, paginationRow } from '../keyboards.js';
import { IDLE_FLOW, telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * O'quvchi (va ota-ona) bo'limlari.
 *
 * Har bo'lim **mavjud CRM servisini** chaqiradi — davomat foizi, XP, qarz bu yerda
 * hisoblanmaydi (TZ §18, §58). Bot faqat ko'rsatadi va topshirishni CRM'ga uzatadi.
 *
 * Egalik: `studentId` faqat `scope.studentIds` dan olinadi. Callback ichida o'quvchi id
 * **yuborilmaydi** — foydalanuvchi tugma ma'lumotini o'zgartirib begona o'quvchini so'ray
 * olmasin (TZ §32).
 */

export const STUDENT_ACTIONS = {
  profile: 'st_profile',
  attendance: 'st_att',
  calendar: 'st_cal',
  homework: 'st_hw',
  homeworkDetail: 'st_hwd',
  homeworkSubmit: 'st_hws',
  exams: 'st_ex',
  xp: 'st_xp',
  certificates: 'st_cert',
  payments: 'st_pay',
  /** Ota-ona: farzandni tanlash */
  child: 'st_child',
} as const;

/** Vazifa topshirish oqimi — sessiyada saqlanadi */
export const HOMEWORK_FLOW = 'hw_submit';

const HOMEWORK_PAGE_SIZE = 5;
const EXAMS_LIMIT = 10;
const PAYMENTS_LIMIT = 5;
const MB = 1024 * 1024;

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

function backRow(action: string, text = '⬅️ Orqaga'): InlineButton[] {
  return [{ text, data: callback(action) }, ...menuRow()];
}

/**
 * Qaysi o'quvchi haqida gap ketyapti.
 *
 * Ota-onada bir nechta farzand bo'lishi mumkin — tanlangani sessiyada turadi (PHASE 4),
 * tanlanmagan bo'lsa birinchisi. Sessiyadagi id doiradan tashqarida bo'lsa e'tiborsiz
 * qoldiriladi: sessiya ham foydalanuvchi ta'sirida bo'lgan ma'lumot.
 */
export async function resolveStudentId(context: BotContext, scope: CommandScope): Promise<string | null> {
  if (scope.studentIds.length === 0) return null;
  if (scope.studentIds.length === 1) return scope.studentIds[0]!;
  const session = await telegramSessionService.get(context.chatId);
  const chosen = session?.data.activeStudentId;
  if (typeof chosen === 'string' && scope.studentIds.includes(chosen)) return chosen;
  return scope.studentIds[0]!;
}

/** Ota-ona hali farzandni tanlamagan bo'lsa — tanlov so'raladi */
async function hasChosenChild(context: BotContext, scope: CommandScope): Promise<boolean> {
  if (scope.studentIds.length <= 1) return true;
  const session = await telegramSessionService.get(context.chatId);
  const chosen = session?.data.activeStudentId;
  return typeof chosen === 'string' && scope.studentIds.includes(chosen);
}

/** Farzandlar ro'yxati — tanlash uchun */
export async function showChildChooser(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const children = await prisma.student.findMany({
    where: { id: { in: scope.studentIds }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, group: { select: { name: true } } },
    orderBy: { firstName: 'asc' },
  });
  const keyboard: InlineKeyboard = children.map((child) => [
    { text: `👤 ${child.firstName} ${child.lastName}${child.group ? ` · ${child.group.name}` : ''}`, data: callback(STUDENT_ACTIONS.child, child.id) },
  ]);
  keyboard.push(menuRow());
  await context.render('<b>👨‍👩‍👧 Qaysi farzand haqida?</b>', keyboard);
  return { action: STUDENT_ACTIONS.child };
}

/** Tanlov saqlanadi (faqat doiradagi id qabul qilinadi — callback ma'lumotiga ishonilmaydi) */
export async function chooseChild(context: BotContext, scope: CommandScope, studentId: string | null): Promise<HandlerResult> {
  if (!studentId || !scope.studentIds.includes(studentId)) return showChildChooser(context, scope);
  await telegramSessionService.set(context.chatId, { flow: IDLE_FLOW, step: '-', data: { activeStudentId: studentId } });
  return showProfile(context, scope);
}

/** Tanlangan farzand ismi — menyu sarlavhasi uchun */
export async function activeChildName(context: BotContext, scope: CommandScope): Promise<string | null> {
  if (scope.kind !== 'PARENT' || scope.studentIds.length <= 1) return null;
  if (!(await hasChosenChild(context, scope))) return null;
  const id = await resolveStudentId(context, scope);
  const child = await prisma.student.findFirst({ where: { id: id ?? '' }, select: { firstName: true, lastName: true } });
  return child ? `${child.firstName} ${child.lastName}` : null;
}

async function requireStudent(context: BotContext, scope: CommandScope): Promise<string | null> {
  if (scope.studentIds.length === 0) {
    await context.render('Bu bo‘lim o‘quvchi va ota-onalar uchun.', [menuRow()]);
    return null;
  }
  if (!(await hasChosenChild(context, scope))) {
    await showChildChooser(context, scope);
    return null;
  }
  return resolveStudentId(context, scope);
}

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------

export async function showProfile(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.profile };

  const [student, gamification] = await Promise.all([
    prisma.student.findFirstOrThrow({
      where: { id: studentId, deletedAt: null },
      select: {
        number: true,
        firstName: true,
        lastName: true,
        phone: true,
        startDate: true,
        status: true,
        course: { select: { name: true } },
        group: { select: { name: true, teacher: { select: { firstName: true, lastName: true } } } },
      },
    }),
    gamificationService.profile(studentId),
  ]);

  const teacher = student.group?.teacher ? `${student.group.teacher.firstName} ${student.group.teacher.lastName}` : '—';
  const lines = [
    `<b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b>`,
    `🆔 ${formatStudentNumber(student.number)}`,
    `📱 ${escapeHtml(student.phone)}`,
    '',
    `📚 Kurs: ${escapeHtml(student.course.name)}`,
    `👥 Guruh: ${student.group ? escapeHtml(student.group.name) : '—'}`,
    `👨‍🏫 O‘qituvchi: ${escapeHtml(teacher)}`,
    `📅 Boshlagan: ${fmtDate(student.startDate)}`,
    `📌 Holat: ${STUDENT_STATUS_LABELS[student.status]}`,
    '',
    `⭐ XP: <b>${gamification.totalXp}</b> · ${gamification.level.icon ?? ''} ${gamification.level.number}-daraja «${escapeHtml(gamification.level.name)}»`,
  ];

  await context.render(lines.join('\n'), [
    [
      { text: '⭐ XP & Reyting', data: callback(STUDENT_ACTIONS.xp) },
      { text: '✅ Davomat', data: callback(STUDENT_ACTIONS.attendance) },
    ],
    menuRow(),
  ]);
  return { action: STUDENT_ACTIONS.profile };
}

// ---------------------------------------------------------------------
// Davomat + kalendar
// ---------------------------------------------------------------------

const ATTENDANCE_MARK = { PRESENT: '✅', ABSENT: '❌', LATE: '⏰', EXCUSED: '📝' } as const;

/** `YYYY-MM` → {year, month}; noto'g'ri bo'lsa null (callback ma'lumotiga ishonilmaydi) */
function parseMonthArg(arg: string | null): { year: number; month: number } | null {
  if (!arg) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(arg);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function showAttendance(context: BotContext, scope: CommandScope, monthArg: string | null): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.attendance };

  const student = await prisma.student.findFirstOrThrow({
    where: { id: studentId, deletedAt: null },
    select: { id: true, number: true, firstName: true, lastName: true },
  });

  const now = new Date();
  const requested = parseMonthArg(monthArg);
  const year = requested?.year ?? now.getUTCFullYear();
  const month = requested?.month ?? now.getUTCMonth() + 1;

  const calendar = await buildAttendanceCalendar(student, year, month);
  const marked = calendar.days.filter((day) => day.status !== null);

  const lines = [
    `<b>✅ Davomat — ${monthTitle(year, month)}</b>`,
    '',
    `Jami: ${calendar.overall.total} dars · ✅ ${calendar.overall.PRESENT} · ❌ ${calendar.overall.ABSENT} · ⏰ ${calendar.overall.LATE} · 📝 ${calendar.overall.EXCUSED}`,
    `Davomat: <b>${calendar.overall.rate}%</b>`,
    '',
  ];
  if (marked.length === 0) {
    lines.push('📅 Bu oyda davomat yozuvi yo‘q.');
  } else {
    lines.push(`Bu oy: ${calendar.month_.rate}% (${calendar.month_.total} dars)`);
    for (const day of marked) {
      const mark = day.status ? ATTENDANCE_MARK[day.status] : '·';
      lines.push(`${day.date.slice(8, 10)}.${day.date.slice(5, 7)}  ${mark} ${day.statusLabel ?? ''}${day.note ? ` — ${escapeHtml(day.note)}` : ''}`);
    }
  }

  const nav: InlineButton[] = [
    { text: '⬅️', data: callback(STUDENT_ACTIONS.calendar, shiftMonth(year, month, -1)) },
    { text: monthTitle(year, month), data: callback('noop') },
  ];
  // Kelajak oyga o'tish ma'nosiz — u yerda davomat bo'lmaydi
  const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
  if (!isCurrent) nav.push({ text: '➡️', data: callback(STUDENT_ACTIONS.calendar, shiftMonth(year, month, 1)) });

  await context.render(lines.join('\n'), [nav, menuRow()]);
  return { action: STUDENT_ACTIONS.attendance };
}

// ---------------------------------------------------------------------
// Uy vazifalari
// ---------------------------------------------------------------------

const SUBMISSION_ICON = { PENDING: '🟡', SUBMITTED: '🟢', LATE: '🟢', GRADED: '✅', MISSED: '⚫' } as const;

function homeworkIcon(row: StudentHomeworkRowDto, now: Date): string {
  if (row.status === 'PENDING') {
    const left = new Date(row.deadline).getTime() - now.getTime();
    // Muddatiga 2 kundan kam qolgan yoki o'tib ketgan — qizil
    if (left < 2 * 86_400_000) return '🔴';
  }
  return SUBMISSION_ICON[row.status];
}

/** Avval topshirilmaganlar (muddati yaqini birinchi), keyin qolganlari (yangisi birinchi) */
function sortHomework(rows: StudentHomeworkRowDto[]): StudentHomeworkRowDto[] {
  const pending = rows.filter((row) => row.status === 'PENDING').sort((a, b) => a.deadline.localeCompare(b.deadline));
  const rest = rows.filter((row) => row.status !== 'PENDING').sort((a, b) => b.deadline.localeCompare(a.deadline));
  return [...pending, ...rest];
}

export async function showHomeworkList(context: BotContext, scope: CommandScope, pageArg: string | null): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.homework };

  const rows = sortHomework(await buildStudentHomeworkRows(studentId));
  if (rows.length === 0) {
    await context.render('📝 Hozircha uy vazifasi yo‘q.', [menuRow()]);
    return { action: STUDENT_ACTIONS.homework };
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / HOMEWORK_PAGE_SIZE));
  const requested = Number(pageArg ?? '1');
  const page = Number.isInteger(requested) && requested >= 1 && requested <= totalPages ? requested : 1;
  const slice = rows.slice((page - 1) * HOMEWORK_PAGE_SIZE, page * HOMEWORK_PAGE_SIZE);
  const now = new Date();

  const pending = rows.filter((row) => row.status === 'PENDING').length;
  const lines = [
    '<b>📝 Uy vazifalari</b>',
    pending > 0 ? `Topshirilmagan: <b>${pending}</b> ta` : 'Hammasi topshirilgan ✅',
    '',
    '🔴 muddati yaqin · 🟡 kutilmoqda · 🟢 topshirilgan · ✅ baholangan · ⚫ o‘tkazib yuborilgan',
  ];

  const keyboard: InlineKeyboard = slice.map((row) => [
    { text: `${homeworkIcon(row, now)} ${row.title.slice(0, 40)} · ${fmtDate(row.deadline)}`, data: callback(STUDENT_ACTIONS.homeworkDetail, row.homeworkId) },
  ]);
  const pager = paginationRow(STUDENT_ACTIONS.homework, { page, totalPages });
  if (pager.length > 0) keyboard.push(pager);
  keyboard.push(menuRow());

  await context.render(lines.join('\n'), keyboard);
  return { action: STUDENT_ACTIONS.homework };
}

/** Vazifa + shu o'quvchining topshirig'i. Egalik: topshiriq yozuvi faqat guruh a'zosida bo'ladi */
async function loadHomeworkFor(studentId: string, homeworkId: string) {
  return prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: {
      status: true,
      submittedAt: true,
      score: true,
      feedback: true,
      answerText: true,
      attachmentPath: true,
      homework: {
        select: {
          id: true,
          title: true,
          description: true,
          deadline: true,
          maxPoints: true,
          xpReward: true,
          status: true,
          attachmentPath: true,
          teacher: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
}

const SUBMISSION_LABEL = {
  PENDING: 'Kutilmoqda',
  SUBMITTED: 'Topshirilgan',
  LATE: 'Kech topshirilgan',
  GRADED: 'Baholangan',
  MISSED: 'O‘tkazib yuborilgan',
} as const;

export async function showHomeworkDetail(context: BotContext, scope: CommandScope, homeworkId: string | null): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.homeworkDetail };

  const row = homeworkId ? await loadHomeworkFor(studentId, homeworkId) : null;
  if (!row) {
    await context.render('Vazifa topilmadi.', [backRow(STUDENT_ACTIONS.homework)]);
    return { action: STUDENT_ACTIONS.homeworkDetail };
  }

  const hw = row.homework;
  const teacher = hw.teacher ? `${hw.teacher.firstName} ${hw.teacher.lastName}` : '—';
  const lines = [
    `<b>📝 ${escapeHtml(hw.title)}</b>`,
    '',
    hw.description ? escapeHtml(hw.description.slice(0, 1500)) : '<i>Tavsif yo‘q</i>',
    '',
    `👨‍🏫 ${escapeHtml(teacher)}`,
    `⏰ Muddat: <b>${fmtDateTime(hw.deadline)}</b>`,
    `🎯 Maksimal ball: ${hw.maxPoints} · XP: ${hw.xpReward}`,
    hw.attachmentPath ? '📎 Vazifaga fayl biriktirilgan (kabinetda ochiladi)' : '',
    '',
    `📌 Holat: <b>${SUBMISSION_LABEL[row.status]}</b>${row.submittedAt ? ` · ${fmtDateTime(row.submittedAt)}` : ''}`,
  ];
  if (row.score !== null) lines.push(`🏅 Ball: <b>${row.score}/${hw.maxPoints}</b>`);
  if (row.feedback) lines.push(`💬 Izoh: ${escapeHtml(row.feedback)}`);
  if (row.answerText) lines.push('', `📤 Javobingiz: ${escapeHtml(row.answerText.slice(0, 500))}`);
  if (row.attachmentPath) lines.push('📎 Fayl biriktirilgan');

  const keyboard: InlineKeyboard = [];
  const canSubmit = hw.status === 'PUBLISHED' && row.status !== 'GRADED';
  if (canSubmit) {
    keyboard.push([{ text: row.status === 'PENDING' ? '📤 Topshirish' : '🔁 Qayta topshirish', data: callback(STUDENT_ACTIONS.homeworkSubmit, hw.id) }]);
  }
  keyboard.push(backRow(STUDENT_ACTIONS.homework));

  await context.render(lines.filter((line) => line !== '').join('\n'), keyboard);
  return { action: STUDENT_ACTIONS.homeworkDetail };
}

/** Topshirish oqimini boshlaydi: keyingi xabar javob sifatida qabul qilinadi */
export async function startHomeworkSubmit(context: BotContext, scope: CommandScope, homeworkId: string | null): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.homeworkSubmit };

  const row = homeworkId ? await loadHomeworkFor(studentId, homeworkId) : null;
  if (!row || row.homework.status !== 'PUBLISHED' || row.status === 'GRADED') {
    await context.render('Bu vazifani topshirib bo‘lmaydi.', [backRow(STUDENT_ACTIONS.homework)]);
    return { action: STUDENT_ACTIONS.homeworkSubmit };
  }

  // Ota-onaning farzand tanlovi oqim davomida yo'qolmasin — aks holda javob birinchi
  // farzand nomidan ketib qolardi. Tanlov bo'lmasa (bitta o'quvchi) hech nima qo'shilmaydi.
  const current = await telegramSessionService.get(context.chatId);
  const active = current?.data.activeStudentId;
  await telegramSessionService.set(context.chatId, {
    flow: HOMEWORK_FLOW,
    step: 'await',
    data: { homeworkId: row.homework.id, ...(typeof active === 'string' ? { activeStudentId: active } : {}) },
  });

  await context.render(
    [
      `<b>📤 ${escapeHtml(row.homework.title)}</b>`,
      '',
      'Javobingizni <b>matn</b>, <b>rasm</b> yoki <b>PDF</b> sifatida yuboring.',
      `Fayl hajmi ${env.MAX_UPLOAD_MB} MB gacha. Rasmga izoh yozsangiz, u ham saqlanadi.`,
      '',
      'Bekor qilish uchun pastdagi tugmani bosing.',
    ].join('\n'),
    [[{ text: '❌ Bekor qilish', data: callback(STUDENT_ACTIONS.homeworkDetail, row.homework.id) }]],
  );
  return { action: STUDENT_ACTIONS.homeworkSubmit };
}

/**
 * Oqimdagi keyingi xabar — javobning o'zi.
 *
 * Fayl avval Telegramdan yuklab olinadi, turi **baytlar bo'yicha** aniqlanadi (nom va
 * mime ga ishonilmaydi), keyin hujjatlar bilan bir xil papkaga saqlanadi.
 * Topshirishning o'zi `homeworkService.submitByStudent` — XP, holat va audit o'sha yerda.
 */
export async function handleHomeworkFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const homeworkId = typeof session.data.homeworkId === 'string' ? session.data.homeworkId : null;
  // Sessiya ham foydalanuvchi ta'siridagi ma'lumot — o'quvchi doiradan qayta olinadi
  const studentId = await resolveStudentId(context, scope);
  if (!homeworkId || !studentId) {
    await telegramSessionService.clearFlow(context.chatId);
    await context.reply('Topshirish bekor qilindi.', [menuRow()]);
    return { action: 'hw_flow_cancel' };
  }

  let attachmentPath: string | null = null;
  if (context.attachment) {
    const downloaded = await telegramService.downloadFile(context.attachment.fileId, env.MAX_UPLOAD_MB * MB);
    if ('error' in downloaded) {
      await context.reply(`❌ ${downloaded.error}. Qaytadan yuboring yoki matn yozing.`);
      return { action: 'hw_flow_file_error' };
    }
    const type = detectFileType(downloaded.buffer);
    if (!type) {
      await context.reply('❌ Faqat rasm (JPG, PNG, WEBP) yoki PDF qabul qilinadi. Qaytadan yuboring.');
      return { action: 'hw_flow_file_type' };
    }
    attachmentPath = await saveFile(downloaded.buffer, type.ext);
  }

  try {
    const result = await homeworkService.submitByStudent(studentId, homeworkId, {
      answerText: context.text,
      attachmentPath,
      source: 'telegram',
    });
    await telegramSessionService.clearFlow(context.chatId);

    const lines = ['✅ <b>Vazifa topshirildi!</b>'];
    if (result.late) lines.push('⏰ Muddatdan keyin topshirildi — o‘qituvchi buni ko‘radi.');
    if (result.xpAwarded > 0) lines.push(`⭐ +${result.xpAwarded} XP`);
    lines.push('', 'O‘qituvchi tekshirgach, ball va izoh shu yerda ko‘rinadi.');

    await context.reply(lines.join('\n'), [
      [{ text: '📝 Vazifaga qaytish', data: callback(STUDENT_ACTIONS.homeworkDetail, homeworkId) }],
      menuRow(),
    ]);
    return { action: 'hw_submitted' };
  } catch (error) {
    if (error instanceof AppError) {
      // Servis xabari foydalanuvchiga mo'ljallangan ("Vazifa allaqachon baholangan" kabi)
      await telegramSessionService.clearFlow(context.chatId);
      await context.reply(`❌ ${escapeHtml(error.message)}`, [backRow(STUDENT_ACTIONS.homework)]);
      return { action: 'hw_flow_rejected' };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------
// Imtihonlar
// ---------------------------------------------------------------------

export async function showExams(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.exams };

  const rows = await buildStudentExamRows(studentId);
  if (rows.length === 0) {
    await context.render('🎯 Hozircha imtihon natijasi yo‘q.', [menuRow()]);
    return { action: STUDENT_ACTIONS.exams };
  }

  const average = Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length);
  const lines = [`<b>🎯 Imtihonlar</b> · ${rows.length} ta · o‘rtacha <b>${average}%</b>`, ''];
  for (const row of rows.slice(0, EXAMS_LIMIT)) {
    const mark = row.passed === null ? '' : row.passed ? ' ✅' : ' ❌';
    lines.push(`${fmtDate(row.date)} · <b>${escapeHtml(row.title)}</b>`);
    lines.push(`   ${row.score}/${row.maxScore} (${row.percentage}%)${row.grade ? ` · ${escapeHtml(row.grade)}` : ''}${mark}${row.comment ? `\n   💬 ${escapeHtml(row.comment)}` : ''}`);
  }
  if (rows.length > EXAMS_LIMIT) lines.push('', `… va yana ${rows.length - EXAMS_LIMIT} ta (kabinetda to‘liq)`);

  await context.render(lines.join('\n'), [menuRow()]);
  return { action: STUDENT_ACTIONS.exams };
}

// ---------------------------------------------------------------------
// XP va reyting
// ---------------------------------------------------------------------

export async function showXp(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.xp };

  const g = await gamificationService.profile(studentId);
  const bar = '█'.repeat(Math.round(g.progress / 10)) + '░'.repeat(10 - Math.round(g.progress / 10));
  const lines = [
    `<b>⭐ XP: ${g.totalXp}</b>`,
    `${g.level.icon ?? '🏅'} ${g.level.number}-daraja «${escapeHtml(g.level.name)}»`,
    g.nextLevel ? `${bar} ${g.progress}% · keyingi darajaga ${g.nextLevel.xpLeft} XP` : `${bar} eng yuqori daraja!`,
    '',
    `🔥 Seriya: ${g.streak.current} kun (rekord ${g.streak.longest})`,
    g.rank ? `🏆 Reyting: <b>#${g.rank}</b>` : '🏆 Reyting: hali yo‘q',
  ];
  if (g.badges.length > 0) {
    lines.push('', `<b>Nishonlar (${g.badges.length}):</b>`);
    for (const badge of g.badges.slice(0, 8)) lines.push(`${badge.icon} ${escapeHtml(badge.name)}`);
  }
  if (g.recentXp.length > 0) {
    lines.push('', '<b>So‘nggi XP:</b>');
    for (const entry of g.recentXp.slice(0, 5)) {
      lines.push(`${entry.points > 0 ? '+' : ''}${entry.points} · ${escapeHtml(entry.description)} · ${fmtDate(entry.createdAt)}`);
    }
  }

  await context.render(lines.join('\n'), [menuRow()]);
  return { action: STUDENT_ACTIONS.xp };
}

// ---------------------------------------------------------------------
// Sertifikatlar
// ---------------------------------------------------------------------

export async function showCertificates(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.certificates };

  const { items } = await certificateService.list({ page: 1, limit: 10, studentId, includeRevoked: false } as never);
  if (items.length === 0) {
    await context.render('📜 Hozircha sertifikat yo‘q. Kursni tugatganingizda shu yerda ko‘rinadi.', [menuRow()]);
    return { action: STUDENT_ACTIONS.certificates };
  }

  const lines = ['<b>📜 Sertifikatlar</b>', ''];
  for (const cert of items) {
    lines.push(`🎓 <b>${escapeHtml(cert.courseName)}</b>`);
    lines.push(`   ${escapeHtml(cert.code)} · ${fmtDate(cert.issuedAt)}${cert.grade ? ` · ${escapeHtml(cert.grade)}` : ''}`);
    // Ochiq tekshiruv sahifasi — QR o'sha yerda; havola ish beruvchiga yuborilishi mumkin
    lines.push(`   🔗 ${primaryClientUrl}/verify/${cert.verifyToken}`);
  }

  await context.render(lines.join('\n'), [menuRow()]);
  return { action: STUDENT_ACTIONS.certificates };
}

// ---------------------------------------------------------------------
// To'lovlar
// ---------------------------------------------------------------------

export async function showPayments(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const studentId = await requireStudent(context, scope);
  if (!studentId) return { action: STUDENT_ACTIONS.payments };

  const [debt, payments] = await Promise.all([
    debtText(studentId),
    prisma.payment.findMany({
      where: { studentId, deletedAt: null },
      orderBy: { paidAt: 'desc' },
      take: PAYMENTS_LIMIT,
      select: { amount: true, method: true, paidAt: true },
    }),
  ]);

  const lines = ['<b>💳 To‘lovlar</b>', '', debt];
  if (payments.length > 0) {
    lines.push('', `<b>So‘nggi to‘lovlar:</b>`);
    for (const payment of payments) {
      lines.push(`${fmtDate(payment.paidAt)} · ${escapeHtml(String(payment.amount.toNumber().toLocaleString('uz-UZ')))} so‘m · ${PAYMENT_METHOD_LABELS[payment.method]}`);
    }
  }

  await context.render(lines.join('\n'), [[{ text: '💳 To‘lash', data: callback('st_paynow') }], menuRow()]);
  return { action: STUDENT_ACTIONS.payments };
}

/** Matnli buyruq → bo'lim (menyusiz ham ishlasin) */
export const STUDENT_COMMANDS: Readonly<Record<string, string>> = {
  '/profil': STUDENT_ACTIONS.profile,
  '/davomat': STUDENT_ACTIONS.attendance,
  '/vazifa': STUDENT_ACTIONS.homework,
  '/imtihon': STUDENT_ACTIONS.exams,
  '/xp': STUDENT_ACTIONS.xp,
  '/sertifikat': STUDENT_ACTIONS.certificates,
  '/qarz': STUDENT_ACTIONS.payments,
  '/farzand': STUDENT_ACTIONS.child,
};

/** Barcha `st_*` amallari bitta joydan yo'naltiriladi */
export async function handleStudentAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case STUDENT_ACTIONS.profile:
      return showProfile(context, scope);
    case STUDENT_ACTIONS.attendance:
      return showAttendance(context, scope, null);
    case STUDENT_ACTIONS.calendar:
      return showAttendance(context, scope, arg);
    case STUDENT_ACTIONS.homework:
      return showHomeworkList(context, scope, arg);
    case STUDENT_ACTIONS.homeworkDetail:
      return showHomeworkDetail(context, scope, arg);
    case STUDENT_ACTIONS.homeworkSubmit:
      return startHomeworkSubmit(context, scope, arg);
    case STUDENT_ACTIONS.exams:
      return showExams(context, scope);
    case STUDENT_ACTIONS.xp:
      return showXp(context, scope);
    case STUDENT_ACTIONS.certificates:
      return showCertificates(context, scope);
    case STUDENT_ACTIONS.payments:
      return showPayments(context, scope);
    case STUDENT_ACTIONS.child:
      return arg === null ? showChildChooser(context, scope) : chooseChild(context, scope, arg);
    default:
      return undefined;
  }
}
