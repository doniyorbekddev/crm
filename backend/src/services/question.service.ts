import { prisma } from '../config/database.js';
import type { Prisma, QuestionDifficulty, QuestionType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CreateQuestionInput, QuestionListQuery, UpdateQuestionInput } from '../validators/question.validator.js';
import { auditService } from './audit.service.js';

/**
 * Savollar bazasi. Savol kursga va (ixtiyoriy) mavzuga bog'lanadi — shunda imtihon
 * natijasini mavzular kesimida tahlil qilish mumkin ("Formalar mavzusida 40%").
 *
 * To'g'ri javob (`isCorrect`) o'quvchiga qaytariladigan javobga **hech qachon** kirmaydi;
 * uni faqat baholash mantig'i va savolni tahrirlash huquqi bor xodim ko'radi.
 */

const questionSelect = {
  id: true,
  courseId: true,
  topicId: true,
  text: true,
  type: true,
  difficulty: true,
  points: true,
  answerHint: true,
  explanation: true,
  tags: true,
  acceptedAnswers: true,
  isActive: true,
  createdAt: true,
  topic: { select: { id: true, title: true } },
  options: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, text: true, isCorrect: true, sortOrder: true } },
  _count: { select: { examQuestions: true } },
} satisfies Prisma.QuestionSelect;

type QuestionRecord = Prisma.QuestionGetPayload<{ select: typeof questionSelect }>;

export interface QuestionOptionDto {
  id: string;
  text: string;
  /** Faqat xodimga qaytariladi */
  isCorrect?: boolean;
  sortOrder: number;
}

export interface QuestionDto {
  id: string;
  courseId: string;
  topicId: string | null;
  topicTitle: string | null;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  points: number;
  answerHint: string | null;
  /** Natijadan keyin ko'rsatiladigan tushuntirish */
  explanation: string | null;
  tags: string[];
  /** SHORT_TEXT javob kaliti — faqat xodimga */
  acceptedAnswers: string[];
  isActive: boolean;
  createdAt: string;
  /** Nechta imtihonda ishlatilgan */
  usedInExams: number;
  options: QuestionOptionDto[];
}

export function toQuestionDto(record: QuestionRecord, includeAnswers = true): QuestionDto {
  return {
    id: record.id,
    courseId: record.courseId,
    topicId: record.topicId,
    topicTitle: record.topic?.title ?? null,
    text: record.text,
    type: record.type,
    difficulty: record.difficulty,
    points: record.points,
    answerHint: includeAnswers ? record.answerHint : null,
    explanation: includeAnswers ? record.explanation : null,
    tags: record.tags,
    acceptedAnswers: includeAnswers ? record.acceptedAnswers : [],
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    usedInExams: record._count.examQuestions,
    options: record.options.map((option) => ({
      id: option.id,
      text: option.text,
      sortOrder: option.sortOrder,
      ...(includeAnswers ? { isCorrect: option.isCorrect } : {}),
    })),
  };
}

function buildWhere(query: Partial<QuestionListQuery>): Prisma.QuestionWhereInput {
  return {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.search ? { text: { contains: query.search, mode: 'insensitive' } } : {}),
  };
}

export const questionService = {
  async list(query: QuestionListQuery): Promise<{ items: QuestionDto[]; total: number }> {
    const where = buildWhere(query);
    const items = await prisma.question.findMany({
      where,
      select: questionSelect,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.question.count({ where });
    return { items: items.map((item) => toQuestionDto(item)), total };
  },

  async create(actor: AuthUser, input: CreateQuestionInput, client: ClientInfo): Promise<QuestionDto> {
    const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } });
    if (!course) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'courseId', message: 'Kurs topilmadi' }]);

    if (input.topicId) {
      const topic = await prisma.courseTopic.findFirst({
        where: { id: input.topicId, module: { courseId: input.courseId } },
        select: { id: true },
      });
      if (!topic) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'topicId', message: 'Mavzu shu kursga tegishli emas' },
        ]);
      }
    }

    const question = await prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          courseId: input.courseId,
          topicId: input.topicId ?? null,
          text: input.text,
          type: input.type,
          difficulty: input.difficulty,
          points: input.points,
          answerHint: input.answerHint ?? null,
          explanation: input.explanation ?? null,
          tags: input.tags,
          acceptedAnswers: input.acceptedAnswers,
          isActive: input.isActive,
          createdById: actor.id,
          options: {
            create: input.options.map((option, index) => ({
              text: option.text,
              isCorrect: option.isCorrect ?? false,
              sortOrder: option.sortOrder ?? index,
            })),
          },
        },
        select: questionSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'question.created',
        entityType: 'course',
        entityId: input.courseId,
        metadata: { questionId: created.id, type: created.type, difficulty: created.difficulty },
        ...client,
      });
      return created;
    });

    return toQuestionDto(question);
  },

  async update(actor: AuthUser, id: string, input: UpdateQuestionInput, client: ClientInfo): Promise<QuestionDto> {
    const current = await prisma.question.findUnique({ where: { id }, select: { id: true, courseId: true } });
    if (!current) throw AppError.notFound('Savol topilmadi');

    const question = await prisma.$transaction(async (tx) => {
      // Variantlar to'liq almashtiriladi — tahrirlashda eskilarini kuzatib borish shart emas.
      // O'tkazilgan imtihonlar javoblariga ta'sir qilmaydi: ular `optionIds` ni nusxa sifatida saqlaydi.
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      const saved = await tx.question.update({
        where: { id },
        data: {
          topicId: input.topicId ?? null,
          text: input.text,
          type: input.type,
          difficulty: input.difficulty,
          points: input.points,
          answerHint: input.answerHint ?? null,
          explanation: input.explanation ?? null,
          tags: input.tags,
          acceptedAnswers: input.acceptedAnswers,
          isActive: input.isActive,
          options: {
            create: input.options.map((option, index) => ({
              text: option.text,
              isCorrect: option.isCorrect ?? false,
              sortOrder: option.sortOrder ?? index,
            })),
          },
        },
        select: questionSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'question.updated',
        entityType: 'course',
        entityId: current.courseId,
        metadata: { questionId: id },
        ...client,
      });
      return saved;
    });

    return toQuestionDto(question);
  },
};
