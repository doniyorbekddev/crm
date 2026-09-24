import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const HOMEWORK_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export const SUBMISSION_STATUSES = ['PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'MISSED'] as const;
export const EXAM_STATUSES = ['PLANNED', 'HELD', 'GRADED', 'CANCELLED'] as const;

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
});

export const createHomeworkSchema = homeworkFieldsSchema.extend({
  maxPoints: homeworkFieldsSchema.shape.maxPoints.default(100),
  xpReward: homeworkFieldsSchema.shape.xpReward.default(20),
  status: homeworkFieldsSchema.shape.status.default('PUBLISHED'),
});
// Standart qiymat faqat yaratishda — `.partial()` ichida ham `.default()` ishlab, yuborilmagan maydonni qaytarib yozardi
export const updateHomeworkSchema = homeworkFieldsSchema.omit({ groupId: true }).partial();

/** Bitta o‘quvchining topshirig‘i: holat, ball va izoh */
export const gradeSubmissionSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES, 'Holat noto‘g‘ri').optional(),
    score: optionalField(z.coerce.number('Ball raqam bo‘lishi kerak').int().min(0).max(1000)),
    feedback: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  })
  .refine(
    (values) => values.status !== undefined || values.score !== undefined || values.feedback !== undefined,
    'Kamida bitta maydonni kiriting',
  );

/** Butun guruhni bir marta baholash */
export const bulkGradeSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: idSchema,
        status: z.enum(SUBMISSION_STATUSES, 'Holat noto‘g‘ri').optional(),
        score: optionalField(z.coerce.number().int().min(0).max(1000)),
        feedback: optionalField(z.string().trim().max(500)),
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
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type BulkGradeInput = z.infer<typeof bulkGradeSchema>;
export type ExamListQuery = z.infer<typeof examListQuerySchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type SaveExamResultsInput = z.infer<typeof saveExamResultsSchema>;
