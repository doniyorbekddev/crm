import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';
import { httpUrlSchema } from './lesson.validator.js';
import { blueprintSchema } from '../services/examBlueprint.js';

export const HOMEWORK_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export const SUBMISSION_STATUSES = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED', 'MISSED'] as const;
export const HOMEWORK_TARGETS = ['GROUP', 'SELECTED', 'INDIVIDUAL'] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const EXAM_STATUSES = ['PLANNED', 'HELD', 'GRADED', 'CANCELLED'] as const;
export const EXAM_TYPES = ['DAILY_QUIZ', 'WEEKLY_TEST', 'MONTHLY_EXAM', 'MIDTERM', 'FINAL', 'PRACTICE', 'DIAGNOSTIC'] as const;

/** ISO sana-vaqt (topshirish oynasi) */
const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Sana-vaqt noto‘g‘ri')
  .transform((value) => new Date(value));

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

// ---------------------------------------------------------------------
// Uy vazifasi
// ---------------------------------------------------------------------

export const homeworkListQuerySchema = paginationQuerySchema.extend({
  groupId: idSchema.optional(),
  courseId: idSchema.optional(),
  teacherId: idSchema.optional(),
  status: z.enum(HOMEWORK_STATUSES, 'Holat noto‘g‘ri').optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sortBy: z.enum(['deadline', 'assignedAt', 'title']).default('deadline'),
});

const homeworkFieldsSchema = z.object({
  title: z.string('Sarlavhani kiriting').trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
  description: optionalField(z.string().trim().max(2000, 'Tavsif juda uzun')),
  groupId: z.string('Guruhni tanlang').trim().min(1, 'Guruhni tanlang').max(50),
  deadline: z
    .string('Muddatni kiriting')
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Sana noto‘g‘ri')
    .transform((value) => new Date(value)),
  maxPoints: z.coerce
    .number('Ball raqam bo‘lishi kerak')
    .int('Ball butun son bo‘lishi kerak')
    .min(1, 'Ball kamida 1 bo‘lsin')
    .max(1000, 'Ball 1000 dan oshmasligi kerak'),
  xpReward: z.coerce.number('XP raqam bo‘lishi kerak').int().min(0).max(1000),
  status: z.enum(HOMEWORK_STATUSES, 'Holat noto‘g‘ri'),
  /** Kurs dasturi (LMS) — ixtiyoriy */
  topicId: idSchema.nullable().optional(),
  lessonId: idSchema.nullable().optional(),
  difficulty: z.enum(DIFFICULTIES, 'Qiyinlik noto‘g‘ri').nullable().optional(),
  rubricId: idSchema.nullable().optional(),
});

export const createHomeworkSchema = homeworkFieldsSchema
  .extend({
    maxPoints: homeworkFieldsSchema.shape.maxPoints.default(100),
    xpReward: homeworkFieldsSchema.shape.xpReward.default(20),
    status: homeworkFieldsSchema.shape.status.default('PUBLISHED'),
    targetType: z.enum(HOMEWORK_TARGETS, 'Kimga berilishi noto‘g‘ri').default('GROUP'),
    /** SELECTED/INDIVIDUAL uchun — guruhdagi faol o'quvchilar */
    studentIds: z.array(idSchema).max(100, 'Juda ko‘p o‘quvchi').optional(),
  })
  .superRefine((value, ctx) => {
    const count = value.studentIds?.length ?? 0;
    if (value.targetType === 'SELECTED' && count === 0) ctx.addIssue({ code: 'custom', path: ['studentIds'], message: 'Kamida bitta o‘quvchini tanlang' });
    if (value.targetType === 'INDIVIDUAL' && count !== 1) ctx.addIssue({ code: 'custom', path: ['studentIds'], message: 'Bitta o‘quvchini tanlang' });
    if (value.targetType === 'GROUP' && count > 0) ctx.addIssue({ code: 'custom', path: ['studentIds'], message: 'Butun guruhga berilganda o‘quvchi tanlanmaydi' });
  });
// Standart qiymat faqat yaratishda — `.partial()` ichida ham `.default()` ishlab, yuborilmagan maydonni qaytarib yozardi
export const updateHomeworkSchema = homeworkFieldsSchema.omit({ groupId: true }).partial();

/** Rubrika bo'yicha ball: mezon kaliti → 0–100 (%) */
const rubricScoresSchema = z.record(z.string().trim().min(1).max(40), z.coerce.number().int().min(0).max(100));

/** Bitta o‘quvchining topshirig‘i: holat, ball va izoh */
export const gradeSubmissionSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES, 'Holat noto‘g‘ri').optional(),
    score: optionalField(z.coerce.number('Ball raqam bo‘lishi kerak').int().min(0).max(1000)),
    feedback: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
    /** Rubrika bo'lsa — ball shu yerdan hisoblanadi (score yuborilmaydi) */
    rubricScores: rubricScoresSchema.optional(),
  })
  .refine(
    (values) => values.status !== undefined || values.score !== undefined || values.feedback !== undefined || values.rubricScores !== undefined,
    'Kamida bitta maydonni kiriting',
  );

/** Qayta ishlashga qaytarish — izoh majburiy (o'quvchi nimani tuzatishini bilsin) */
export const returnSubmissionSchema = z.object({
  feedback: z.string('Izoh kiriting').trim().min(3, 'Nimani tuzatish kerakligini yozing').max(500, 'Izoh juda uzun'),
});

/** O'qituvchi vazifaga havola biriktiradi */
export const homeworkLinkSchema = z.object({
  title: z.string('Nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(200, 'Nom juda uzun'),
  url: httpUrlSchema,
});

// ---------------------------------------------------------------------
// Rubrika (TZ §20)
// ---------------------------------------------------------------------

const criterionSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, 'Kalit: kichik lotin harf, raqam, _'),
  title: z.string('Mezon nomi').trim().min(2, 'Kamida 2 belgi').max(100, 'Nom juda uzun'),
  weight: z.coerce.number().int().min(1, 'Og‘irlik kamida 1%').max(100),
});

const criteriaSchema = z
  .array(criterionSchema)
  .min(1, 'Kamida bitta mezon')
  .max(10, 'Ko‘pi bilan 10 ta mezon')
  .superRefine((items, ctx) => {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (total !== 100) ctx.addIssue({ code: 'custom', message: `Og‘irliklar yig‘indisi 100% bo‘lishi kerak (hozir ${total}%)` });
    if (new Set(items.map((item) => item.key)).size !== items.length) ctx.addIssue({ code: 'custom', message: 'Mezon kalitlari takrorlanmasin' });
  });

export const rubricSchema = z.object({
  name: z.string('Nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(150, 'Nom juda uzun'),
  description: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  criteria: criteriaSchema,
});
export const updateRubricSchema = rubricSchema.partial().extend({ isActive: z.boolean().optional() });

export type RubricCriterion = z.infer<typeof criterionSchema>;
export type RubricInput = z.infer<typeof rubricSchema>;
export type UpdateRubricInput = z.infer<typeof updateRubricSchema>;
export type ReturnSubmissionInput = z.infer<typeof returnSubmissionSchema>;
export type HomeworkLinkInput = z.infer<typeof homeworkLinkSchema>;

/** Butun guruhni bir marta baholash */
export const bulkGradeSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: idSchema,
        status: z.enum(SUBMISSION_STATUSES, 'Holat noto‘g‘ri').optional(),
        score: optionalField(z.coerce.number().int().min(0).max(1000)),
        feedback: optionalField(z.string().trim().max(500)),
        rubricScores: rubricScoresSchema.optional(),
      }),
      'Ro‘yxatni kiriting',
    )
    .min(1, 'Kamida bitta o‘quvchi')
    .max(100, 'Juda ko‘p yozuv'),
});

// ---------------------------------------------------------------------
// Imtihon
// ---------------------------------------------------------------------

export const examListQuerySchema = paginationQuerySchema.extend({
  groupId: idSchema.optional(),
  courseId: idSchema.optional(),
  teacherId: idSchema.optional(),
  status: z.enum(EXAM_STATUSES, 'Holat noto‘g‘ri').optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sortBy: z.enum(['date', 'title']).default('date'),
});

const examFieldsSchema = z.object({
  title: z.string('Sarlavhani kiriting').trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
  description: optionalField(z.string().trim().max(2000, 'Tavsif juda uzun')),
  groupId: z.string('Guruhni tanlang').trim().min(1, 'Guruhni tanlang').max(50),
  date: dateOnlySchema,
  maxScore: z.coerce
    .number('Ball raqam bo‘lishi kerak')
    .int('Ball butun son bo‘lishi kerak')
    .min(1, 'Ball kamida 1 bo‘lsin')
    .max(1000, 'Ball 1000 dan oshmasligi kerak'),
  passScore: optionalField(z.coerce.number('Ball raqam bo‘lishi kerak').int().min(0).max(1000)),
  /** Imtihon davomiyligi (daqiqa). Bo‘sh — vaqt chegarasi yo‘q */
  durationMinutes: optionalField(z.coerce.number('Daqiqa raqam bo‘lishi kerak').int().min(1, 'Kamida 1 daqiqa').max(600, '10 soatdan oshmasin')),
  /** Ruxsat etilgan urinishlar (0 — cheklanmagan). Standart qiymat faqat yaratishda qo‘yiladi */
  maxAttempts: z.coerce.number('Urinishlar soni raqam bo‘lishi kerak').int().min(0).max(20, '20 tadan oshmasin'),
  xpReward: z.coerce.number('XP raqam bo‘lishi kerak').int().min(0).max(1000),
  status: z.enum(EXAM_STATUSES, 'Holat noto‘g‘ri'),
  /** Assessment 2.0 (TZ §21, §25) */
  type: z.enum(EXAM_TYPES, 'Imtihon turi noto‘g‘ri').optional(),
  isOnline: z.boolean().optional(),
  startAt: isoDateTime.nullable().optional(),
  endAt: isoDateTime.nullable().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  blueprint: blueprintSchema.nullable().optional(),
});

export const createExamSchema = examFieldsSchema.extend({
  maxScore: examFieldsSchema.shape.maxScore.default(100),
  maxAttempts: examFieldsSchema.shape.maxAttempts.default(0),
  xpReward: examFieldsSchema.shape.xpReward.default(50),
  status: examFieldsSchema.shape.status.default('PLANNED'),
});
// Standart qiymatlar faqat yaratishda: `.partial()` ichida ham `.default()` ishlaydi va
// yuborilmagan maydonni (masalan, maksimal ball) jimgina standart qiymatga qaytarardi
export const updateExamSchema = examFieldsSchema.omit({ groupId: true }).partial();

export const saveExamResultsSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: idSchema,
        score: z.coerce.number('Ball raqam bo‘lishi kerak').int('Ball butun son bo‘lishi kerak').min(0).max(1000),
        comment: optionalField(z.string().trim().max(500)),
      }),
      'Ro‘yxatni kiriting',
    )
    .min(1, 'Kamida bitta o‘quvchi')
    .max(100, 'Juda ko‘p yozuv'),
});

export type HomeworkListQuery = z.infer<typeof homeworkListQuerySchema>;
/** Servis chaqiruvchilari (Telegram, testlar) uchun `targetType` ixtiyoriy — standart GROUP */
export type CreateHomeworkInput = Omit<z.infer<typeof createHomeworkSchema>, 'targetType'> & {
  targetType?: z.infer<typeof createHomeworkSchema>['targetType'];
};
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type BulkGradeInput = z.infer<typeof bulkGradeSchema>;
export type ExamListQuery = z.infer<typeof examListQuerySchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type SaveExamResultsInput = z.infer<typeof saveExamResultsSchema>;

/** Blueprint oldindan ko'rish (imtihon hali saqlanmagan bo'lishi mumkin — guruh bo'yicha) */
export const blueprintPreviewSchema = z.object({
  groupId: z.string().trim().min(1, 'Guruhni tanlang').max(50),
  blueprint: blueprintSchema,
});
