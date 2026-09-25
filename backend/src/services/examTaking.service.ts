import { prisma } from '../config/database.js';
import type { AttemptStatus, ExamType, Prisma, QuestionType } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, saveFile } from '../utils/fileStorage.js';
import { auditService } from './audit.service.js';
import { BlueprintShortageError, generateVariant, shuffle } from './examBlueprint.js';
import type { Blueprint } from './examBlueprint.js';
import { MANUAL_QUESTION_TYPES, attemptSelect, gradeAnswer, isAttemptPassed, syncExamResult } from './examAttempt.service.js';
import type { AnswerKey } from './examAttempt.service.js';
import { notifyExamResultForAttempt } from './studentNotify.service.js';
import { masteryService } from './mastery.service.js';

/**
 * O'quvchi imtihonni **o'zi** onlayn topshiradi (TZ 3.0 §21–25, §65).
 *
 * Oqim: mavjud imtihonlar → **boshlash** (variant + snapshot) → javoblarni avtosaqlash →
 * **topshirish** (avtomatik baholash; matn/kod/fayl — o'qituvchiga) → natija.
 *
 * - **Variant**: imtihonda blueprint bo'lsa — har o'quvchiga bankdan alohida tasodifiy to'plam;
 *   aks holda imtihonga biriktirilgan savollar.
 * - **Snapshot**: boshlanganda savol matni, variantlar tartibi va javob kaliti `AttemptQuestion`
 *   ga muzlatiladi — savol keyin tahrirlansa ham urinish va baho o'zgarmaydi.
 * - **Vaqt**: muddat = min(boshlangan + davomiylik, oyna oxiri). Muddat o'tsa saqlangan javoblar
 *   bilan **avtomatik yakunlanadi** (fon vazifasi ham tozalaydi).
 * - **Ruxsat**: egalik chaqiruvchida (`portal.service` → o'quvchining o'zi); bu yerda — imtihon
 *   o'quvchi guruhiniki, onlayn, bekor qilinmagan, oynada va urinish chegarasida.
 */

interface Snapshot {
  text: string;
  type: QuestionType;
  options: Array<{ id: string; text: string }>;
  topicTitle: string | null;
  explanation: string | null;
}

export interface AvailableExamDto {
  examId: string;
  title: string;
  type: ExamType;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number;
  attemptsUsed: number;
  openAttemptId: string | null;
  questionCount: number;
  /** Hozir boshlash mumkinmi va mumkin bo'lmasa — nega */
  canStart: boolean;
  reason: string | null;
  lastResult: { percentage: number; status: AttemptStatus } | null;
}

export interface AttemptQuestionView {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  points: number;
  options: Array<{ id: string; text: string }>;
  answer: { optionIds: string[]; text: string | null; hasFile: boolean };
  /** Natija (urinish yakunlangach) */
  result?: { score: number; isCorrect: boolean | null; correctOptionIds: string[]; explanation: string | null; feedback: string | null };
}

export interface AttemptViewDto {
  attemptId: string;
  examId: string;
  examTitle: string;
  examType: ExamType;
  status: AttemptStatus;
  startedAt: string;
  deadline: string | null;
  questions: AttemptQuestionView[];
  summary: { score: number; maxScore: number; percentage: number; passed: boolean } | null;
}

const OPEN_STATUSES = ['PLANNED', 'HELD'] as const;

function attemptDeadline(startedAt: Date, exam: { durationMinutes: number | null; endAt: Date | null }): Date | null {
  const byDuration = exam.durationMinutes ? new Date(startedAt.getTime() + exam.durationMinutes * 60_000) : null;
  if (byDuration && exam.endAt) return byDuration < exam.endAt ? byDuration : exam.endAt;
  return byDuration ?? exam.endAt;
}

/** Imtihon o'quvchi guruhiniki va onlaynmi */
async function examForStudent(studentId: string, examId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { groupId: true, status: true } });
  const exam = await prisma.exam.findFirst({
    where: { id: examId, isOnline: true, ...(student?.groupId ? { groupId: student.groupId } : { id: '__none__' }) },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      courseId: true,
      startAt: true,
      endAt: true,
      durationMinutes: true,
      maxAttempts: true,
      passScore: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      blueprint: true,
      group: { select: { courseId: true } },
      _count: { select: { questions: true } },
    },
  });
  if (!exam) throw AppError.notFound('Imtihon topilmadi');
  return { ...exam, studentActive: student?.status === 'ACTIVE' };
}

type StudentExam = Awaited<ReturnType<typeof examForStudent>>;

function startBlocker(exam: StudentExam, now: Date): string | null {
  if (!OPEN_STATUSES.includes(exam.status as (typeof OPEN_STATUSES)[number])) return 'Imtihon yopilgan';
  if (!exam.studentActive) return 'O‘quvchi faol emas — imtihon topshirib bo‘lmaydi';
  if (exam.startAt && now < exam.startAt) return 'Imtihon hali boshlanmagan';
  if (exam.endAt && now >= exam.endAt) return 'Imtihon vaqti tugagan';
  if (!exam.blueprint && exam._count.questions === 0) return 'Imtihonga savollar biriktirilmagan';
  return null;
}

/** Urinish uchun savollar: blueprint → yangi variant; aks holda imtihon savollari */
async function pickExamQuestions(exam: StudentExam) {
  if (exam.blueprint) {
    const courseId = exam.courseId ?? exam.group.courseId;
    const pool = await prisma.question.findMany({ where: { courseId, isActive: true }, select: { id: true, topicId: true, difficulty: true, points: true } });
    let ids: string[];
    try {
      ids = generateVariant(pool, exam.blueprint as Blueprint);
    } catch (error) {
      if (error instanceof BlueprintShortageError) {
        throw AppError.unprocessable(`Imtihonni boshlab bo‘lmaydi: ${error.message}. O‘qituvchiga murojaat qiling`);
      }
      throw error;
    }
    const points = new Map(pool.map((question) => [question.id, question.points]));
    // Variant savollari imtihon savollari jadvaliga qo'shiladi (javoblar shunga bog'lanadi)
    await prisma.examQuestion.createMany({
      data: ids.map((questionId, index) => ({ examId: exam.id, questionId, points: points.get(questionId) ?? 1, sortOrder: 1000 + index })),
      skipDuplicates: true,
    });
    const rows = await prisma.examQuestion.findMany({ where: { examId: exam.id, questionId: { in: ids } }, select: examQuestionSelect });
    return shuffle(rows);
  }
  const rows = await prisma.examQuestion.findMany({ where: { examId: exam.id }, orderBy: { sortOrder: 'asc' }, select: examQuestionSelect });
  return exam.shuffleQuestions ? shuffle(rows) : rows;
}

const examQuestionSelect = {
  id: true,
  points: true,
  question: {
    select: {
      text: true,
      type: true,
      explanation: true,
      acceptedAnswers: true,
      topic: { select: { title: true } },
      options: { orderBy: { sortOrder: 'asc' }, select: { id: true, text: true, isCorrect: true } },
    },
  },
} satisfies Prisma.ExamQuestionSelect;

async function loadAttempt(studentId: string, attemptId: string) {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      id: true,
      examId: true,
      status: true,
      startedAt: true,
      score: true,
      maxScore: true,
      percentage: true,
      passed: true,
      exam: { select: { title: true, type: true, durationMinutes: true, endAt: true, status: true, groupId: true } },
      student: { select: { status: true, deletedAt: true, groupId: true } },
      questions: { orderBy: { sortOrder: 'asc' }, select: { id: true, examQuestionId: true, sortOrder: true, points: true, snapshot: true, answerKey: true } },
      answers: { select: { id: true, examQuestionId: true, optionIds: true, text: true, filePath: true, score: true, isCorrect: true, feedback: true } },
    },
  });
  // Snapshot'siz urinish (xodim kiritgan) — kabinetdan davom ettirilmaydi
  if (!attempt || attempt.questions.length === 0) throw AppError.notFound('Urinish topilmadi');
  return attempt;
}

type LoadedAttempt = Awaited<ReturnType<typeof loadAttempt>>;

/**
 * Javob yozish va topshirishdan oldin **har safar** (kabinet ham, bot ham — TZ 3.1 GAP-06, §29):
 * imtihon hali ochiq (bekor qilinmagan/yopilmagan), o'quvchi faol va shu imtihon guruhida.
 * Boshlash paytidagi tekshiruvga tayanilmaydi — urinish davomida holat o'zgarishi mumkin.
 */
function assertAttemptWritable(attempt: LoadedAttempt): void {
  if (!OPEN_STATUSES.includes(attempt.exam.status as (typeof OPEN_STATUSES)[number])) {
    throw AppError.unprocessable('Imtihon yopilgan yoki bekor qilingan — javob qabul qilinmaydi');
  }
  if (attempt.student.deletedAt || attempt.student.status !== 'ACTIVE') throw AppError.unprocessable('O‘quvchi faol emas — imtihon topshirib bo‘lmaydi');
  if (attempt.student.groupId !== attempt.exam.groupId) throw AppError.unprocessable('Bu imtihon endi sizning guruhingizga tegishli emas');
}

function toView(attempt: LoadedAttempt): AttemptViewDto {
  const finished = attempt.status !== 'IN_PROGRESS';
  const graded = attempt.status === 'GRADED';
  const answers = new Map(attempt.answers.map((answer) => [answer.examQuestionId, answer]));
  const deadline = attemptDeadline(attempt.startedAt, attempt.exam);
  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    examType: attempt.exam.type,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    deadline: deadline?.toISOString() ?? null,
    questions: attempt.questions.map((row, index) => {
      const snapshot = row.snapshot as unknown as Snapshot;
      const key = row.answerKey as unknown as AnswerKey;
      const answer = answers.get(row.examQuestionId);
      return {
        id: row.id,
        order: index + 1,
        text: snapshot.text,
        type: snapshot.type,
        points: row.points,
        options: snapshot.options,
        answer: { optionIds: answer?.optionIds ?? [], text: answer?.text ?? null, hasFile: Boolean(answer?.filePath) },
        // To'g'ri javob va tushuntirish faqat yakuniy baholangandan keyin
        ...(finished
          ? {
              result: {
                score: answer?.score ?? 0,
                isCorrect: answer?.isCorrect ?? null,
                correctOptionIds: graded ? key.correctOptionIds : [],
                explanation: graded ? snapshot.explanation : null,
                feedback: answer?.feedback ?? null,
              },
            }
          : {}),
      };
    }),
    summary: finished ? { score: attempt.score, maxScore: attempt.maxScore, percentage: attempt.percentage, passed: attempt.passed } : null,
  };
}

/**
 * Urinishni yakunlaydi: har savol snapshot kaliti bo'yicha baholanadi, javobsiz savollar 0.
 * Matn/kod/fayl yoki mos kelmagan qisqa javob bo'lsa — `NEEDS_REVIEW` (o'qituvchi baholaydi).
 */
async function finalize(attemptId: string, actorUserId: string | null, reason: 'submitted' | 'timeout'): Promise<void> {
  const attempt = await prisma.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      examId: true,
      studentId: true,
      exam: { select: { passScore: true, maxScore: true } },
      questions: { select: { examQuestionId: true, points: true, snapshot: true, answerKey: true, examQuestion: { select: { questionId: true } } } },
      answers: { select: { examQuestionId: true, optionIds: true, text: true, filePath: true } },
    },
  });
  if (attempt.status !== 'IN_PROGRESS') return;
  const answers = new Map(attempt.answers.map((answer) => [answer.examQuestionId, answer]));

  let score = 0;
  let needsReview = false;
  const graded = attempt.questions.map((row) => {
    const snapshot = row.snapshot as unknown as Snapshot;
    const result = gradeAnswer(snapshot.type, row.answerKey as unknown as AnswerKey, answers.get(row.examQuestionId), row.points);
    score += result.score;
    if (result.isCorrect === null) needsReview = true;
    return { row, result };
  });
  const maxScore = attempt.questions.reduce((sum, row) => sum + row.points, 0);
  const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
  const passed = isAttemptPassed(score, maxScore, attempt.exam);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const { row, result } of graded) {
      await tx.examAnswer.upsert({
        where: { attemptId_examQuestionId: { attemptId, examQuestionId: row.examQuestionId } },
        create: { attemptId, examQuestionId: row.examQuestionId, questionId: row.examQuestion.questionId, optionIds: [], score: result.score, isCorrect: result.isCorrect },
        update: { score: result.score, isCorrect: result.isCorrect },
      });
    }
    const record = await tx.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: needsReview ? 'NEEDS_REVIEW' : 'GRADED',
        submittedAt: now,
        gradedAt: needsReview ? null : now,
        score,
        maxScore,
        percentage,
        passed,
      },
      select: attemptSelect,
    });
    if (!needsReview) {
      await syncExamResult(tx, record, null);
      await notifyExamResultForAttempt(tx, attemptId);
    }
    await auditService.recordInTransaction(tx, {
      userId: actorUserId,
      action: 'exam.attempt_submitted',
      entityType: 'exam',
      entityId: attempt.examId,
      metadata: { attemptId, studentId: attempt.studentId, score, maxScore, percentage, needsReview, source: 'portal', reason },
      ip: null,
      userAgent: null,
    });
  });
  // Mavzu kesimi — o'zlashtirish manbasi (qo'lda baholanadigan bo'lsa, baholangach yangilanadi)
  if (!needsReview) await masteryService.refresh([attempt.studentId]);
}

/** Muddat o'tgan ochiq urinish — yakunlanadi (true), aks holda false */
async function finalizeIfExpired(attempt: { id: string; status: AttemptStatus; startedAt: Date; exam: { durationMinutes: number | null; endAt: Date | null } }, now: Date): Promise<boolean> {
  if (attempt.status !== 'IN_PROGRESS') return false;
  const deadline = attemptDeadline(attempt.startedAt, attempt.exam);
  if (!deadline || now.getTime() <= deadline.getTime()) return false;
  await finalize(attempt.id, null, 'timeout');
  return true;
}

export const examTakingService = {
  /** O'quvchi guruhining onlayn imtihonlari va har biri bo'yicha holat */
  async available(studentId: string, now: Date = new Date()): Promise<AvailableExamDto[]> {
    const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { groupId: true, status: true } });
    if (!student?.groupId) return [];
    const exams = await prisma.exam.findMany({
      where: { groupId: student.groupId, isOnline: true, status: { in: [...OPEN_STATUSES] } },
      orderBy: [{ startAt: 'asc' }, { date: 'asc' }],
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        courseId: true,
        startAt: true,
        endAt: true,
        durationMinutes: true,
        maxAttempts: true,
        passScore: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        blueprint: true,
        group: { select: { courseId: true } },
        _count: { select: { questions: true } },
        attempts: { where: { studentId }, orderBy: { attemptNo: 'desc' }, select: { id: true, status: true, percentage: true } },
      },
    });
    return exams.map((exam) => {
      const used = exam.attempts.filter((attempt) => attempt.status !== 'EXPIRED' && attempt.status !== 'IN_PROGRESS').length;
      const open = exam.attempts.find((attempt) => attempt.status === 'IN_PROGRESS') ?? null;
      const last = exam.attempts.find((attempt) => attempt.status !== 'IN_PROGRESS' && attempt.status !== 'EXPIRED') ?? null;
      let reason = startBlocker({ ...exam, studentActive: student.status === 'ACTIVE' }, now);
      if (!reason && !open && exam.maxAttempts > 0 && used >= exam.maxAttempts) reason = 'Urinishlar tugagan';
      return {
        examId: exam.id,
        title: exam.title,
        type: exam.type,
        startAt: exam.startAt?.toISOString() ?? null,
        endAt: exam.endAt?.toISOString() ?? null,
        durationMinutes: exam.durationMinutes,
        maxAttempts: exam.maxAttempts,
        attemptsUsed: used,
        openAttemptId: open?.id ?? null,
        questionCount: exam.blueprint ? (exam.blueprint as Blueprint).total : exam._count.questions,
        canStart: open !== null || reason === null,
        reason: open ? null : reason,
        lastResult: last ? { percentage: last.percentage, status: last.status } : null,
      };
    });
  },

  /** Boshlash (yoki ochiq urinishni davom ettirish). Variant va snapshot shu yerda yaratiladi */
  async start(studentId: string, examId: string, actorUserId: string | null, now: Date = new Date()): Promise<AttemptViewDto> {
    const exam = await examForStudent(studentId, examId);
    const attempts = await prisma.examAttempt.findMany({
      where: { examId, studentId },
      orderBy: { attemptNo: 'desc' },
      select: { id: true, attemptNo: true, status: true, startedAt: true, _count: { select: { questions: true } } },
    });
    const open = attempts.find((attempt) => attempt.status === 'IN_PROGRESS');
    if (open) {
      const expired = await finalizeIfExpired({ ...open, exam }, now);
      if (!expired && open._count.questions > 0) return toView(await loadAttempt(studentId, open.id));
      if (!expired) throw AppError.unprocessable('Bu imtihon o‘qituvchi tomonidan ochilgan — kabinetdan davom ettirib bo‘lmaydi');
    }

    const blocker = startBlocker(exam, now);
    if (blocker) throw AppError.unprocessable(blocker);
    const used = attempts.filter((attempt) => attempt.status !== 'EXPIRED' && attempt.status !== 'IN_PROGRESS').length;
    if (exam.maxAttempts > 0 && used >= exam.maxAttempts) {
      throw AppError.unprocessable(`Urinishlar tugadi: ${exam.maxAttempts} tadan ortiq topshirib bo‘lmaydi`);
    }

    const rows = await pickExamQuestions(exam);
    const attemptNo = (attempts[0]?.attemptNo ?? 0) + 1;
    const created = await prisma.$transaction(async (tx) => {
      const attempt = await tx.examAttempt.create({
        data: { examId, studentId, attemptNo, status: 'IN_PROGRESS', startedAt: now, maxScore: rows.reduce((sum, row) => sum + row.points, 0) },
        select: { id: true },
      });
      await tx.attemptQuestion.createMany({
        data: rows.map((row, index) => {
          const options = row.question.options.map((option) => ({ id: option.id, text: option.text }));
          // To'g'ri/noto'g'ri tartibi o'zgarmaydi — "To'g'ri" doim birinchi
          const ordered = exam.shuffleOptions && row.question.type !== 'TRUE_FALSE' ? shuffle(options) : options;
          const snapshot: Snapshot = {
            text: row.question.text,
            type: row.question.type,
            options: ordered,
            topicTitle: row.question.topic?.title ?? null,
            explanation: row.question.explanation,
          };
          const key: AnswerKey = {
            correctOptionIds: row.question.options.filter((option) => option.isCorrect).map((option) => option.id),
            acceptedAnswers: row.question.acceptedAnswers,
          };
          return { attemptId: attempt.id, examQuestionId: row.id, sortOrder: index, points: row.points, snapshot: snapshot as unknown as Prisma.InputJsonValue, answerKey: key as unknown as Prisma.InputJsonValue };
        }),
      });
      await auditService.recordInTransaction(tx, {
        userId: actorUserId,
        action: 'exam.attempt_started',
        entityType: 'exam',
        entityId: examId,
        metadata: { attemptId: attempt.id, studentId, attemptNo, questions: rows.length, variant: Boolean(exam.blueprint), source: 'portal' },
        ip: null,
        userAgent: null,
      });
      return attempt;
    });
    return toView(await loadAttempt(studentId, created.id));
  },

  /** Urinishni ko'rish; muddat o'tgan bo'lsa — avval yakunlanadi */
  async view(studentId: string, attemptId: string, now: Date = new Date()): Promise<AttemptViewDto> {
    const attempt = await loadAttempt(studentId, attemptId);
    if (await finalizeIfExpired(attempt, now)) return toView(await loadAttempt(studentId, attemptId));
    return toView(attempt);
  },

  /** Javobni avtosaqlash (topshirilmaydi) */
  async saveAnswer(studentId: string, attemptId: string, attemptQuestionId: string, input: { optionIds?: string[]; text?: string | null }, now: Date = new Date()): Promise<{ saved: true }> {
    const attempt = await loadAttempt(studentId, attemptId);
    if (await finalizeIfExpired(attempt, now)) throw AppError.unprocessable('Imtihon vaqti tugadi — javoblar avtomatik topshirildi');
    if (attempt.status !== 'IN_PROGRESS') throw AppError.unprocessable('Urinish yakunlangan');
    assertAttemptWritable(attempt);
    const row = attempt.questions.find((item) => item.id === attemptQuestionId);
    if (!row) throw AppError.notFound('Savol topilmadi');
    const snapshot = row.snapshot as unknown as Snapshot;

    const choice = !MANUAL_QUESTION_TYPES.includes(snapshot.type) && snapshot.type !== 'SHORT_TEXT';
    let optionIds: string[] = [];
    let text: string | null = null;
    if (choice) {
      optionIds = [...new Set(input.optionIds ?? [])];
      const allowed = new Set(snapshot.options.map((option) => option.id));
      if (optionIds.some((id) => !allowed.has(id))) throw AppError.unprocessable('Variant bu savolga tegishli emas');
      if (snapshot.type !== 'MULTIPLE_CHOICE' && optionIds.length > 1) throw AppError.unprocessable('Bu savolda bitta variant tanlanadi');
    } else if (snapshot.type !== 'FILE_UPLOAD') {
      text = input.text?.trim() ? input.text : null;
    }

    const examQuestion = await prisma.examQuestion.findUniqueOrThrow({ where: { id: row.examQuestionId }, select: { questionId: true } });
    await prisma.examAnswer.upsert({
      where: { attemptId_examQuestionId: { attemptId, examQuestionId: row.examQuestionId } },
      create: { attemptId, examQuestionId: row.examQuestionId, questionId: examQuestion.questionId, optionIds, text, score: 0, isCorrect: null },
      update: { optionIds, text },
    });
    return { saved: true };
  },

  /** FILE_UPLOAD savoliga fayl (PDF/rasm — mavjud fayl siyosati) */
  async saveAnswerFile(studentId: string, attemptId: string, attemptQuestionId: string, buffer: unknown, now: Date = new Date()): Promise<{ saved: true }> {
    const attempt = await loadAttempt(studentId, attemptId);
    if (await finalizeIfExpired(attempt, now)) throw AppError.unprocessable('Imtihon vaqti tugadi — javoblar avtomatik topshirildi');
    if (attempt.status !== 'IN_PROGRESS') throw AppError.unprocessable('Urinish yakunlangan');
    assertAttemptWritable(attempt);
    const row = attempt.questions.find((item) => item.id === attemptQuestionId);
    if (!row) throw AppError.notFound('Savol topilmadi');
    if ((row.snapshot as unknown as Snapshot).type !== 'FILE_UPLOAD') throw AppError.unprocessable('Bu savolga fayl yuklanmaydi');
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Faylni tanlang' }]);
    const type = detectFileType(buffer);
    if (!type) throw AppError.unprocessable('Faqat rasm (JPG, PNG, WEBP) yoki PDF qabul qilinadi');
    const filePath = await saveFile(buffer, type.ext);
    const examQuestion = await prisma.examQuestion.findUniqueOrThrow({ where: { id: row.examQuestionId }, select: { questionId: true } });
    await prisma.examAnswer.upsert({
      where: { attemptId_examQuestionId: { attemptId, examQuestionId: row.examQuestionId } },
      create: { attemptId, examQuestionId: row.examQuestionId, questionId: examQuestion.questionId, optionIds: [], filePath, score: 0, isCorrect: null },
      update: { filePath },
    });
    return { saved: true };
  },

  /** Topshirish — avtomatik baholash; matn/kod/fayl bo'lsa o'qituvchiga */
  async submit(studentId: string, attemptId: string, actorUserId: string | null, now: Date = new Date()): Promise<AttemptViewDto> {
    const attempt = await loadAttempt(studentId, attemptId);
    if (!(await finalizeIfExpired(attempt, now))) {
      if (attempt.status !== 'IN_PROGRESS') throw AppError.unprocessable('Urinish allaqachon topshirilgan');
      assertAttemptWritable(attempt);
      await finalize(attemptId, actorUserId, 'submitted');
    }
    return toView(await loadAttempt(studentId, attemptId));
  },

  /** Fon vazifasi: muddati o'tgan ochiq (kabinet) urinishlarni yakunlaydi */
  async finalizeExpired(now: Date = new Date()): Promise<number> {
    const open = await prisma.examAttempt.findMany({
      where: { status: 'IN_PROGRESS', questions: { some: {} } },
      select: { id: true, status: true, startedAt: true, exam: { select: { durationMinutes: true, endAt: true } } },
      take: 500,
    });
    let done = 0;
    for (const attempt of open) {
      if (await finalizeIfExpired(attempt, now)) done += 1;
    }
    return done;
  },
};
