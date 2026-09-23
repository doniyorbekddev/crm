import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TEXT'] as const;
export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

const idSchema = z.string().trim().min(1).max(50);

const optionSchema = z.object({
  text: z.string('Variant matni kiritilishi shart').trim().min(1, 'Bo‘sh variant').max(500, 'Variant juda uzun'),
  isCorrect: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(99).optional(),
});

const questionFieldsSchema = z.object({
  courseId: idSchema,
  topicId: optionalField(idSchema),
  text: z.string('Savol matni kiritilishi shart').trim().min(5, 'Savol juda qisqa').max(1000, 'Savol juda uzun'),
  type: z.enum(QUESTION_TYPES, 'Savol turi noto‘g‘ri').default('SINGLE_CHOICE'),
  difficulty: z.enum(QUESTION_DIFFICULTIES, 'Murakkablik noto‘g‘ri').default('MEDIUM'),
  points: z.coerce.number().int().min(1, 'Ball kamida 1').max(100, 'Ball juda katta').default(1),
  answerHint: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  isActive: z.boolean().default(true),
  options: z.array(optionSchema).max(10, 'Variantlar juda ko‘p').default([]),
});

/**
 * Variantli savolda kamida 2 variant va kamida bitta to‘g‘ri javob bo‘lishi shart;
 * bitta javobli savolda esa aynan bitta to‘g‘ri variant bo‘ladi.
 */
function validateOptions(value: z.infer<typeof questionFieldsSchema>, ctx: z.RefinementCtx): void {
  if (value.type === 'TEXT') {
    if (value.options.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Matnli savolda variant bo‘lmaydi' });
    }
    return;
  }
  const correct = value.options.filter((option) => option.isCorrect).length;
  if (value.options.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Kamida 2 ta variant kerak' });
  }
  if (correct === 0) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Kamida bitta to‘g‘ri variant belgilang' });
  }
  if (value.type === 'SINGLE_CHOICE' && correct > 1) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Bitta javobli savolda faqat bitta to‘g‘ri variant bo‘ladi' });
  }
}

export const createQuestionSchema = questionFieldsSchema.superRefine(validateOptions);
export const updateQuestionSchema = questionFieldsSchema.omit({ courseId: true }).superRefine((value, ctx) => {
  validateOptions({ ...value, courseId: 'x' }, ctx);
});

export const questionListQuerySchema = paginationQuerySchema.extend({
  courseId: optionalField(idSchema),
  topicId: optionalField(idSchema),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/** Imtihonga savol biriktirish yoki tasodifiy tanlash */
export const attachQuestionsSchema = z
  .object({
    questionIds: z.array(idSchema).max(100, 'Juda ko‘p savol').optional(),
    /** Tasodifiy tanlash: nechta savol, qaysi mavzu va murakkablikdan */
    random: z
      .object({
        count: z.coerce.number().int().min(1).max(100),
        topicId: optionalField(idSchema),
        difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
      })
      .optional(),
  })
  .refine((value) => (value.questionIds?.length ?? 0) > 0 || value.random, {
    message: 'Savollarni tanlang yoki tasodifiy tanlash sozlamasini bering',
    path: ['questionIds'],
  });

/** O‘quvchining javoblari */
export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        examQuestionId: idSchema,
        optionIds: z.array(idSchema).max(10).optional(),
        text: optionalField(z.string().trim().max(2000, 'Javob juda uzun')),
      }),
    )
    .min(1, 'Kamida bitta javob kerak'),
});

/** Matnli javoblarni qo‘lda baholash */
export const gradeAttemptSchema = z.object({
  grades: z
    .array(
      z.object({
        answerId: idSchema,
        score: z.coerce.number().int().min(0).max(100),
        feedback: optionalField(z.string().trim().max(500)),
      }),
    )
    .min(1, 'Kamida bitta baho kerak'),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;
export type AttachQuestionsInput = z.infer<typeof attachQuestionsSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type GradeAttemptInput = z.infer<typeof gradeAttemptSchema>;
