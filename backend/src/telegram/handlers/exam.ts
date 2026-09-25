import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { examTakingService } from '../../services/examTaking.service.js';
import type { AttemptViewDto } from '../../services/examTaking.service.js';
import { escapeHtml, telegramService, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import { AppError } from '../../utils/AppError.js';
import { fmtDateTime } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback } from '../keyboards.js';
import { telegramSessionService, type SessionState } from '../session.service.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Onlayn imtihon botda (TZ 3.0 §43 "Online Exam", §44 izchillik).
 *
 * Web kabinet bilan **bitta servis** — `examTakingService`: variant, snapshot, oyna, urinish
 * chegarasi, avtosaqlash va baholash bir xil. Botda boshlangan urinish kabinetda davom etadi va
 * aksincha. Faqat o'quvchining o'zi topshiradi (ota-ona ro'yxatni ko'radi).
 *
 * Callback'da savol va variant **indeksi** (id emas — 64 bayt chegarasi); urinish id sessiyada.
 * Indeks har safar serverdagi joriy urinishdan o'qiladi — callback'ga ishonilmaydi.
 */

export const EXAM_ACTIONS = {
  list: 'ex_list',
  start: 'ex_start',
  question: 'ex_q',
  answer: 'ex_a',
  submit: 'ex_sub',
  submitConfirm: 'ex_subok',
} as const;

export const EXAM_FLOW = 'exam';

export const EXAM_COMMANDS: Readonly<Record<string, string>> = { '/onlayn': EXAM_ACTIONS.list };
/** Oqim ichidagi tugmalar — sessiyani yopmaydi */
export const EXAM_FLOW_ACTIONS: ReadonlySet<string> = new Set([EXAM_ACTIONS.question, EXAM_ACTIONS.answer, EXAM_ACTIONS.submit, EXAM_ACTIONS.submitConfirm]);

const CHOICE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);
const MB = 1024 * 1024;

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

async function safely(context: BotContext, work: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      await context.render(`❌ ${escapeHtml(error.message)}`, [[{ text: '🖥 Onlayn imtihonlar', data: callback(EXAM_ACTIONS.list) }, ...menuRow()]]);
      return { action: 'exam_error' };
    }
    throw error;
  }
}

function remaining(deadline: string | null): string {
  if (!deadline) return '';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return ' · ⏱ vaqt tugadi';
  const minutes = Math.floor(ms / 60_000);
  return ` · ⏱ ${Math.floor(minutes / 60) > 0 ? `${Math.floor(minutes / 60)} soat ` : ''}${minutes % 60} daqiqa qoldi`;
}

/** Faqat o'quvchi hisobi topshiradi — ota-ona uchun null */
async function takingStudent(scope: CommandScope): Promise<{ id: string; userId: string | null } | null> {
  if (scope.kind !== 'STUDENT' || !scope.studentIds[0]) return null;
  const student = await prisma.student.findFirst({ where: { id: scope.studentIds[0], deletedAt: null }, select: { id: true, userId: true } });
  return student;
}

export async function showOnlineExams(context: BotContext, scope: CommandScope, studentId: string): Promise<HandlerResult> {
  const exams = await examTakingService.available(studentId);
  const taker = await takingStudent(scope);
  if (exams.length === 0) {
    await context.render('🖥 Hozir onlayn topshiriladigan imtihon yo‘q.', [menuRow()]);
    return { action: EXAM_ACTIONS.list };
  }
  const lines = ['<b>🖥 Onlayn imtihonlar</b>', ''];
  const keyboard: InlineKeyboard = [];
  for (const exam of exams) {
    lines.push(`<b>${escapeHtml(exam.title)}</b> · ${exam.questionCount} savol${exam.durationMinutes ? ` · ${exam.durationMinutes} daqiqa` : ''}`);
    if (exam.startAt || exam.endAt) lines.push(`   🕐 ${exam.startAt ? fmtDateTime(exam.startAt) : '…'} — ${exam.endAt ? fmtDateTime(exam.endAt) : '…'}`);
    if (exam.lastResult) lines.push(`   Oxirgi natija: ${exam.lastResult.status === 'NEEDS_REVIEW' ? 'tekshirilmoqda' : `${exam.lastResult.percentage}%`}`);
    if (!exam.canStart) lines.push(`   ⛔ ${escapeHtml(exam.reason ?? 'hozir topshirib bo‘lmaydi')}`);
    else if (taker) keyboard.push([{ text: `${exam.openAttemptId ? '▶️ Davom ettirish' : '🚀 Boshlash'}: ${exam.title.slice(0, 30)}`, data: callback(EXAM_ACTIONS.start, exam.examId) }]);
  }
  if (!taker) lines.push('', 'Imtihonni o‘quvchining o‘zi topshiradi.');
  keyboard.push(menuRow());
  await context.render(lines.join('\n'), keyboard);
  return { action: EXAM_ACTIONS.list };
}

async function renderQuestion(context: BotContext, view: AttemptViewDto, index: number): Promise<HandlerResult> {
  if (view.status !== 'IN_PROGRESS') return renderResult(context, view);
  const safeIndex = Math.min(Math.max(index, 0), view.questions.length - 1);
  const question = view.questions[safeIndex]!;
  await telegramSessionService.set(context.chatId, { flow: EXAM_FLOW, step: 'q', data: { attemptId: view.attemptId, index: safeIndex } });

  const answered = view.questions.filter((item) => item.answer.optionIds.length > 0 || Boolean(item.answer.text?.trim()) || item.answer.hasFile).length;
  const lines = [
    `<b>${escapeHtml(view.examTitle)}</b> · ${safeIndex + 1}/${view.questions.length} · javob: ${answered}${remaining(view.deadline)}`,
    '',
    `<b>${question.order}.</b> ${escapeHtml(question.text)} <i>(${question.points} ball)</i>`,
  ];
  const keyboard: InlineKeyboard = [];
  if (CHOICE_TYPES.has(question.type)) {
    if (question.type === 'MULTIPLE_CHOICE') lines.push('', '<i>Bir nechta javob tanlash mumkin.</i>');
    question.options.forEach((option, optionIndex) => {
      const chosen = question.answer.optionIds.includes(option.id);
      keyboard.push([{ text: `${chosen ? '✅' : '▫️'} ${option.text.slice(0, 60)}`, data: callback(EXAM_ACTIONS.answer, `${safeIndex}:${optionIndex}`) }]);
    });
  } else if (question.type === 'FILE_UPLOAD') {
    lines.push('', question.answer.hasFile ? '📎 Fayl yuklangan. Almashtirish uchun yangisini yuboring.' : '📎 Javobni rasm yoki PDF sifatida shu chatga yuboring.');
  } else {
    lines.push('', question.answer.text ? `Sizning javobingiz:\n<code>${escapeHtml(question.answer.text.slice(0, 500))}</code>\n\nO‘zgartirish uchun yangi javob yozing.` : '✍️ Javobni xabar sifatida yozing.');
  }
  const nav: InlineButton[] = [];
  if (safeIndex > 0) nav.push({ text: '◀️', data: callback(EXAM_ACTIONS.question, String(safeIndex - 1)) });
  if (safeIndex < view.questions.length - 1) nav.push({ text: '▶️', data: callback(EXAM_ACTIONS.question, String(safeIndex + 1)) });
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '📝 Topshirish', data: callback(EXAM_ACTIONS.submit) }]);
  await context.render(lines.join('\n'), keyboard);
  return { action: EXAM_ACTIONS.question };
}

async function renderResult(context: BotContext, view: AttemptViewDto): Promise<HandlerResult> {
  await telegramSessionService.clearFlow(context.chatId);
  const summary = view.summary;
  const lines = [`<b>${escapeHtml(view.examTitle)}</b> — topshirildi`];
  if (summary) {
    lines.push(`Natija: <b>${summary.score}/${summary.maxScore}</b> (${summary.percentage}%)`);
    lines.push(view.status === 'NEEDS_REVIEW' ? '🕐 Ayrim javoblarni o‘qituvchi tekshiradi — yakuniy ball keyin keladi.' : summary.passed ? '✅ O‘tdi' : '❌ O‘tmadi');
  }
  lines.push('', 'To‘g‘ri javoblar va tushuntirishlar kabinetda ko‘rinadi.');
  await context.render(lines.join('\n'), [[{ text: '🖥 Onlayn imtihonlar', data: callback(EXAM_ACTIONS.list) }, ...menuRow()]]);
  return { action: 'exam_result' };
}

async function currentAttempt(context: BotContext, scope: CommandScope): Promise<{ studentId: string; attemptId: string; index: number; userId: string | null } | null> {
  const taker = await takingStudent(scope);
  const session = await telegramSessionService.get(context.chatId);
  const attemptId = typeof session?.data.attemptId === 'string' ? session.data.attemptId : null;
  if (!taker || session?.flow !== EXAM_FLOW || !attemptId) return null;
  return { studentId: taker.id, attemptId, index: typeof session.data.index === 'number' ? session.data.index : 0, userId: taker.userId };
}

async function lost(context: BotContext): Promise<HandlerResult> {
  await context.render('Imtihon sahifasi topilmadi — ro‘yxatdan qaytadan oching.', [[{ text: '🖥 Onlayn imtihonlar', data: callback(EXAM_ACTIONS.list) }, ...menuRow()]]);
  return { action: 'exam_lost' };
}

export async function startExam(context: BotContext, scope: CommandScope, examId: string | null): Promise<HandlerResult> {
  const taker = await takingStudent(scope);
  if (!taker || !examId) {
    await context.render('Imtihonni o‘quvchining o‘zi topshiradi.', [menuRow()]);
    return { action: EXAM_ACTIONS.start };
  }
  return safely(context, async () => renderQuestion(context, await examTakingService.start(taker.id, examId, taker.userId), 0));
}

export async function showQuestion(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const current = await currentAttempt(context, scope);
  if (!current) return lost(context);
  return safely(context, async () => renderQuestion(context, await examTakingService.view(current.studentId, current.attemptId), Number(arg ?? current.index) || 0));
}

/** Variant tanlash: bitta javobli — almashtiriladi, ko'p javobli — qo'shiladi/olinadi */
export async function answerOption(context: BotContext, scope: CommandScope, arg: string | null): Promise<HandlerResult> {
  const current = await currentAttempt(context, scope);
  if (!current || !arg) return lost(context);
  const [questionIndex, optionIndex] = arg.split(':').map(Number) as [number, number];
  return safely(context, async () => {
    const view = await examTakingService.view(current.studentId, current.attemptId);
    const question = view.questions[questionIndex];
    const option = question?.options[optionIndex];
    if (!question || !option || view.status !== 'IN_PROGRESS') return renderQuestion(context, view, questionIndex);
    const optionIds =
      question.type === 'MULTIPLE_CHOICE'
        ? question.answer.optionIds.includes(option.id)
          ? question.answer.optionIds.filter((id) => id !== option.id)
          : [...question.answer.optionIds, option.id]
        : [option.id];
    await examTakingService.saveAnswer(current.studentId, current.attemptId, question.id, { optionIds });
    const next = await examTakingService.view(current.studentId, current.attemptId);
    // Bitta javobli savolda keyingisiga avtomatik o'tiladi — tugma bosishlar kamroq
    const goNext = question.type !== 'MULTIPLE_CHOICE' && questionIndex < next.questions.length - 1;
    return renderQuestion(context, next, goNext ? questionIndex + 1 : questionIndex);
  });
}

export async function askSubmit(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const current = await currentAttempt(context, scope);
  if (!current) return lost(context);
  return safely(context, async () => {
    const view = await examTakingService.view(current.studentId, current.attemptId);
    if (view.status !== 'IN_PROGRESS') return renderResult(context, view);
    const unanswered = view.questions.filter((item) => item.answer.optionIds.length === 0 && !item.answer.text?.trim() && !item.answer.hasFile).length;
    await context.render(
      unanswered > 0 ? `⚠️ ${unanswered} ta savolga javob berilmagan — ular 0 ball bo‘ladi.\n\nTopshirasizmi? Keyin o‘zgartirib bo‘lmaydi.` : 'Topshirasizmi? Keyin javoblarni o‘zgartirib bo‘lmaydi.',
      [[{ text: '✅ Ha, topshirish', data: callback(EXAM_ACTIONS.submitConfirm) }, { text: '⬅️ Savollarga', data: callback(EXAM_ACTIONS.question, String(current.index)) }]],
    );
    return { action: EXAM_ACTIONS.submit };
  });
}

export async function submitExam(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const current = await currentAttempt(context, scope);
  if (!current) return lost(context);
  return safely(context, async () => renderResult(context, await examTakingService.submit(current.studentId, current.attemptId, current.userId)));
}

/** Oqimdagi xabar: matnli javob yoki FILE_UPLOAD uchun fayl */
export async function handleExamFlow(context: BotContext, scope: CommandScope, session: SessionState): Promise<HandlerResult> {
  const current = await currentAttempt(context, scope);
  if (!current || session.flow !== EXAM_FLOW) return lost(context);
  return safely(context, async () => {
    const view = await examTakingService.view(current.studentId, current.attemptId);
    const question = view.questions[current.index];
    if (!question || view.status !== 'IN_PROGRESS') return renderQuestion(context, view, current.index);
    if (question.type === 'FILE_UPLOAD') {
      if (!context.attachment) {
        await context.reply('📎 Bu savolga rasm yoki PDF yuboring.');
        return { action: 'exam_file_expected' };
      }
      const downloaded = await telegramService.downloadFile(context.attachment.fileId, env.MAX_UPLOAD_MB * MB);
      if ('error' in downloaded) {
        await context.reply(`❌ ${downloaded.error}`);
        return { action: 'exam_file_failed' };
      }
      await examTakingService.saveAnswerFile(current.studentId, current.attemptId, question.id, downloaded.buffer);
    } else if (CHOICE_TYPES.has(question.type)) {
      await context.reply('Bu savolda variant tugmasini bosing.');
      return { action: 'exam_choice_expected' };
    } else {
      const text = (context.text ?? '').trim();
      if (!text) {
        await context.reply('✍️ Javobni matn sifatida yozing.');
        return { action: 'exam_text_expected' };
      }
      await examTakingService.saveAnswer(current.studentId, current.attemptId, question.id, { text });
    }
    const next = await examTakingService.view(current.studentId, current.attemptId);
    return renderQuestion(context, next, Math.min(current.index + 1, next.questions.length - 1));
  });
}

export async function handleExamAction(context: BotContext, scope: CommandScope, action: string, arg: string | null, studentId: string | null): Promise<HandlerResult | undefined> {
  switch (action) {
    case EXAM_ACTIONS.list:
      if (!studentId) return undefined;
      return showOnlineExams(context, scope, studentId);
    case EXAM_ACTIONS.start:
      return startExam(context, scope, arg);
    case EXAM_ACTIONS.question:
      return showQuestion(context, scope, arg);
    case EXAM_ACTIONS.answer:
      return answerOption(context, scope, arg);
    case EXAM_ACTIONS.submit:
      return askSubmit(context, scope);
    case EXAM_ACTIONS.submitConfirm:
      return submitExam(context, scope);
    default:
      return undefined;
  }
}
