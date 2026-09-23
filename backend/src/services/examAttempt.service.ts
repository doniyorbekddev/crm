import { prisma } from '../config/database.js';
import type { AttemptStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { AttachQuestionsInput, GradeAttemptInput, SubmitAttemptInput } from '../validators/question.validator.js';
import { auditService } from './audit.service.js';
import { gamificationHooks } from './gamification.service.js';

/**
 * Imtihon urinishi: savollarni biriktirish, javoblarni qabul qilish, avtomatik baholash
 * va mavzular kesimida tahlil.
 *
 * Muhim integratsiya: urinish yakunlanib baholangach natija **baribir `ExamResult` ga**
 * yoziladi. Shuning uchun mavjud hisobotlar, XP berish va analitika o'zgarishsiz ishlaydi —
 * yangi dvigatel ularning ustiga qurildi, o'rniga emas.
 */

export interface AttemptAnswerDto {
  id: string;
  examQuestionId: string;
  questionId: string;
  questionText: string;
  topicTitle: string | null;
  /** Savol bali */
  points: number;
  score: number;
  isCorrect: boolean | null;
  optionIds: string[];
  text: string | null;
  feedback: string | null;
  /** Matnli javob — qo'lda baholanadi */
  needsReview: boolean;
}

export interface TopicBreakdownDto {
  topicId: string | null;
  topicTitle: string;
  score: number;
  maxScore: number;
  percent: number;
}

export interface AttemptDto {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  attemptNo: number;
  status: AttemptStatus;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string | null;
  answers: AttemptAnswerDto[];
  /** Mavzular kesimi — kuchli va zaif tomonlarni ko'rsatadi */
  topics: TopicBreakdownDto[];
  strongTopics: string[];
  weakTopics: string[];
}

/** Zaif mavzu chegarasi: shu foizdan past bo'lsa "takrorlash kerak" */
const WEAK_THRESHOLD = 60;
const STRONG_THRESHOLD = 85;

const attemptSelect = {
  id: true,
  examId: true,
  studentId: true,
  attemptNo: true,
  status: true,
  score: true,
  maxScore: true,
  percentage: true,
  passed: true,
  startedAt: true,
  submittedAt: true,
  exam: { select: { title: true, passScore: true, maxScore: true, xpReward: true } },
  student: { select: { firstName: true, lastName: true } },
  answers: {
    select: {
      id: true,
      examQuestionId: true,
      questionId: true,
      optionIds: true,
      text: true,
      score: true,
      isCorrect: true,
      feedback: true,
      examQuestion: { select: { points: true } },
      question: { select: { text: true, type: true, topicId: true, topic: { select: { title: true } } } },
    },
  },
} satisfies Prisma.ExamAttemptSelect;

type AttemptRecord = Prisma.ExamAttemptGetPayload<{ select: typeof attemptSelect }>;

function buildTopics(record: AttemptRecord): { topics: TopicBreakdownDto[]; strong: string[]; weak: string[] } {
  const buckets = new Map<string, TopicBreakdownDto>();
  for (const answer of record.answers) {
    const key = answer.question.topicId ?? 'other';
    const entry = buckets.get(key) ?? {
      topicId: answer.question.topicId,
      topicTitle: answer.question.topic?.title ?? 'Mavzusiz savollar',
      score: 0,
      maxScore: 0,
      percent: 0,
    };
    entry.score += answer.score;
    entry.maxScore += answer.examQuestion.points;
    buckets.set(key, entry);
  }

  const topics = [...buckets.values()].map((topic) => ({
    ...topic,
    percent: topic.maxScore === 0 ? 0 : Math.round((topic.score / topic.maxScore) * 100),
  }));
  return {
    topics,
    strong: topics.filter((topic) => topic.percent >= STRONG_THRESHOLD).map((topic) => topic.topicTitle),
    weak: topics.filter((topic) => topic.percent < WEAK_THRESHOLD).map((topic) => topic.topicTitle),
  };
}

function toAttemptDto(record: AttemptRecord): AttemptDto {
  const { topics, strong, weak } = buildTopics(record);
  return {
    id: record.id,
    examId: record.examId,
    examTitle: record.exam.title,
    studentId: record.studentId,
    studentName: `${record.student.firstName} ${record.student.lastName}`,
    attemptNo: record.attemptNo,
    status: record.status,
    score: record.score,
    maxScore: record.maxScore,
    percentage: record.percentage,
    passed: record.passed,
    startedAt: record.startedAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    answers: record.answers.map((answer) => ({
      id: answer.id,
      examQuestionId: answer.examQuestionId,
      questionId: answer.questionId,
      questionText: answer.question.text,
      topicTitle: answer.question.topic?.title ?? null,
      points: answer.examQuestion.points,
      score: answer.score,
      isCorrect: answer.isCorrect,
      optionIds: answer.optionIds,
      text: answer.text,
      feedback: answer.feedback,
      needsReview: answer.question.type === 'TEXT' && answer.isCorrect === null,
    })),
    topics,
    strongTopics: strong,
    weakTopics: weak,
  };
}

/** Variantli savolni avtomatik baholaydi: to'plam aynan mos kelishi kerak */
function gradeChoice(selected: string[], correct: string[], points: number): { score: number; isCorrect: boolean } {
  const selectedSet = new Set(selected);
  const correctSet = new Set(correct);
  const exact = selectedSet.size === correctSet.size && [...correctSet].every((id) => selectedSet.has(id));
  return { score: exact ? points : 0, isCorrect: exact };
}

export const examAttemptService = {
  /** Imtihonga savollarni biriktirish: qo'lda tanlash yoki tasodifiy */
  async attachQuestions(actor: AuthUser, examId: string, input: AttachQuestionsInput, client: ClientInfo): Promise<{ attached: number }> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, courseId: true, group: { select: { courseId: true } }, _count: { select: { attempts: true } } },
    });
    if (!exam) throw AppError.notFound('Imtihon topilmadi');
    if (exam._count.attempts > 0) {
      throw AppError.unprocessable('Imtihon boshlangan — savollar tarkibini o‘zgartirib bo‘lmaydi');
    }

    const courseId = exam.courseId ?? exam.group.courseId;
    let questionIds = input.questionIds ?? [];

    if (input.random) {
      // Tasodifiy tanlash: shart bo'yicha nomzodlar olinadi va aralashtiriladi
      const candidates = await prisma.question.findMany({
        where: {
          courseId,
          isActive: true,
          ...(input.random.topicId ? { topicId: input.random.topicId } : {}),
          ...(input.random.difficulty ? { difficulty: input.random.difficulty } : {}),
          ...(questionIds.length > 0 ? { id: { notIn: questionIds } } : {}),
        },
        select: { id: true },
      });
      if (candidates.length < input.random.count) {
        throw AppError.unprocessable(
          `Shartga mos savollar yetarli emas: ${candidates.length} ta topildi, ${input.random.count} ta kerak`,
        );
      }
      const shuffled = candidates.map((item) => item.id).sort(() => Math.random() - 0.5);
      questionIds = [...questionIds, ...shuffled.slice(0, input.random.count)];
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, courseId },
      select: { id: true, points: true },
    });
    if (questions.length !== questionIds.length) {
      throw AppError.unprocessable('Ba’zi savollar topilmadi yoki boshqa kursga tegishli');
    }

    const existing = await prisma.examQuestion.count({ where: { examId } });
    await prisma.$transaction(async (tx) => {
      await tx.examQuestion.createMany({
        data: questions.map((question, index) => ({
          examId,
          questionId: question.id,
          // Ball shu yerda muzlatiladi: savollar bazasidagi ball keyin o'zgarsa ham imtihon o'zgarmaydi
          points: question.points,
          sortOrder: existing + index,
        })),
        skipDuplicates: true,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'exam.questions_attached',
        entityType: 'exam',
        entityId: examId,
        metadata: { count: questions.length, random: Boolean(input.random) },
        ...client,
      });
    });

    return { attached: questions.length };
  },

  /** O'quvchi uchun savollar ro'yxati — to'g'ri javoblarsiz */
  async questionsForStudent(examId: string): Promise<
    Array<{ examQuestionId: string; text: string; type: string; points: number; options: Array<{ id: string; text: string }> }>
  > {
    const rows = await prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        points: true,
        question: {
          select: { text: true, type: true, options: { orderBy: { sortOrder: 'asc' }, select: { id: true, text: true } } },
        },
      },
    });
    return rows.map((row) => ({
      examQuestionId: row.id,
      text: row.question.text,
      type: row.question.type,
      points: row.points,
      options: row.question.options,
    }));
  },

  /**
   * Javoblarni qabul qiladi va avtomatik baholaydi.
   * Matnli savollar `NEEDS_REVIEW` holatida qoladi — ularni o'qituvchi baholaydi.
   */
  async submit(actor: AuthUser, examId: string, studentId: string, input: SubmitAttemptInput, client: ClientInfo): Promise<AttemptDto> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, passScore: true, questions: { select: { id: true, points: true, questionId: true } } },
    });
    if (!exam) throw AppError.notFound('Imtihon topilmadi');
    if (exam.questions.length === 0) {
      throw AppError.unprocessable('Imtihonga savollar biriktirilmagan');
    }

    const questionIds = exam.questions.map((item) => item.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, type: true, options: { where: { isCorrect: true }, select: { id: true } } },
    });
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const examQuestionById = new Map(exam.questions.map((item) => [item.id, item]));

    const lastAttempt = await prisma.examAttempt.findFirst({
      where: { examId, studentId },
      orderBy: { attemptNo: 'desc' },
      select: { attemptNo: true },
    });
    const attemptNo = (lastAttempt?.attemptNo ?? 0) + 1;
    const maxScore = exam.questions.reduce((sum, item) => sum + item.points, 0);

    let score = 0;
    let needsReview = false;
    const answerRows = input.answers.map((answer) => {
      const examQuestion = examQuestionById.get(answer.examQuestionId);
      if (!examQuestion) {
        throw AppError.unprocessable('Javob noma’lum savolga tegishli');
      }
      const question = questionById.get(examQuestion.questionId)!;

      if (question.type === 'TEXT') {
        needsReview = true;
        return {
          examQuestionId: examQuestion.id,
          questionId: question.id,
          optionIds: [],
          text: answer.text ?? null,
          score: 0,
          isCorrect: null,
        };
      }

      const result = gradeChoice(
        answer.optionIds ?? [],
        question.options.map((option) => option.id),
        examQuestion.points,
      );
      score += result.score;
      return {
        examQuestionId: examQuestion.id,
        questionId: question.id,
        optionIds: answer.optionIds ?? [],
        text: null,
        score: result.score,
        isCorrect: result.isCorrect,
      };
    });

    const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
    const status: AttemptStatus = needsReview ? 'NEEDS_REVIEW' : 'GRADED';

    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.examAttempt.create({
        data: {
          examId,
          studentId,
          attemptNo,
          status,
          submittedAt: new Date(),
          gradedAt: needsReview ? null : new Date(),
          gradedById: needsReview ? null : actor.id,
          score,
          maxScore,
          percentage,
          passed: exam.passScore === null ? percentage >= 60 : score >= exam.passScore,
          answers: { create: answerRows },
        },
        select: attemptSelect,
      });

      // Matnli savol bo'lmasa natija darhol yakuniy hisobotga yoziladi
      if (!needsReview) {
        await syncExamResult(tx, created, actor.id);
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'exam.attempt_submitted',
        entityType: 'exam',
        entityId: examId,
        metadata: { studentId, attemptNo, score, maxScore, percentage, needsReview },
        ...client,
      });
      return created;
    });

    return toAttemptDto(attempt);
  },

  /** Matnli javoblarni qo'lda baholash — shundan keyin urinish yakunlanadi */
  async grade(actor: AuthUser, attemptId: string, input: GradeAttemptInput, client: ClientInfo): Promise<AttemptDto> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, examId: true, status: true, answers: { select: { id: true, examQuestion: { select: { points: true } } } } },
    });
    if (!attempt) throw AppError.notFound('Urinish topilmadi');
    if (attempt.status === 'GRADED') {
      throw AppError.unprocessable('Bu urinish allaqachon baholangan');
    }

    const pointsById = new Map(attempt.answers.map((answer) => [answer.id, answer.examQuestion.points]));
    for (const grade of input.grades) {
      const points = pointsById.get(grade.answerId);
      if (points === undefined) throw AppError.unprocessable('Javob shu urinishga tegishli emas');
      if (grade.score > points) {
        throw AppError.unprocessable(`Ball savol balidan oshmasligi kerak (${points})`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const grade of input.grades) {
        await tx.examAnswer.update({
          where: { id: grade.answerId },
          data: {
            score: grade.score,
            isCorrect: grade.score > 0,
            feedback: grade.feedback ?? null,
          },
        });
      }

      const answers = await tx.examAnswer.findMany({ where: { attemptId }, select: { score: true, isCorrect: true } });
      const score = answers.reduce((sum, answer) => sum + answer.score, 0);
      const pending = answers.some((answer) => answer.isCorrect === null);

      const record = await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          score,
          status: pending ? 'NEEDS_REVIEW' : 'GRADED',
          gradedAt: pending ? null : new Date(),
          gradedById: actor.id,
        },
        select: attemptSelect,
      });

      const percentage = record.maxScore === 0 ? 0 : Math.round((score / record.maxScore) * 100);
      const passed = record.exam.passScore === null ? percentage >= 60 : score >= record.exam.passScore;
      const finalRecord = await tx.examAttempt.update({
        where: { id: attemptId },
        data: { percentage, passed },
        select: attemptSelect,
      });

      if (!pending) {
        await syncExamResult(tx, finalRecord, actor.id);
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'exam.attempt_graded',
        entityType: 'exam',
        entityId: attempt.examId,
        metadata: { attemptId, score, percentage, pending },
        ...client,
      });
      return finalRecord;
    });

    return toAttemptDto(updated);
  },

  async getById(attemptId: string): Promise<AttemptDto> {
    const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, select: attemptSelect });
    if (!attempt) throw AppError.notFound('Urinish topilmadi');
    return toAttemptDto(attempt);
  },

  async listForExam(examId: string): Promise<AttemptDto[]> {
    const rows = await prisma.examAttempt.findMany({
      where: { examId },
      orderBy: [{ studentId: 'asc' }, { attemptNo: 'desc' }],
      select: attemptSelect,
    });
    return rows.map(toAttemptDto);
  },
};

/**
 * Urinish natijasini `ExamResult` ga yozadi — mavjud hisobotlar, XP va analitika
 * shu jadvalga tayanadi, shuning uchun yangi dvigatel ularni buzmaydi.
 */
async function syncExamResult(tx: Prisma.TransactionClient, attempt: AttemptRecord, actorId: string): Promise<void> {
  const grade = attempt.percentage >= 90 ? '5' : attempt.percentage >= 75 ? '4' : attempt.percentage >= 60 ? '3' : '2';
  const result = await tx.examResult.upsert({
    where: { examId_studentId: { examId: attempt.examId, studentId: attempt.studentId } },
    update: { score: attempt.score, percentage: attempt.percentage, grade, gradedById: actorId, gradedAt: new Date() },
    create: {
      examId: attempt.examId,
      studentId: attempt.studentId,
      score: attempt.score,
      percentage: attempt.percentage,
      grade,
      gradedById: actorId,
    },
    select: { id: true, xpAwarded: true },
  });

  // XP mavjud gamifikatsiya qoidalari bo'yicha beriladi (dedupe hooki ichida)
  await gamificationHooks.onExamGraded(tx, {
    studentId: attempt.studentId,
    resultId: result.id,
    percentage: attempt.percentage,
  });
}
