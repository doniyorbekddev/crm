import { z } from 'zod';

export const SESSION_STATUSES = ['PLANNED', 'HELD', 'CANCELLED'] as const;

const dateOnlyString = z
  .string('Sanani kiriting')
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

const dateOnlySchema = dateOnlyString.transform((value) => new Date(`${value}T00:00:00.000Z`));

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Vaqt formati: 09:00');

const optionalTime = z.preprocess((value) => (value === '' || value === null ? undefined : value), timeSchema.optional());

export const sessionListQuerySchema = z
  .object({
    groupId: z.string().trim().min(1).max(50).optional(),
    teacherId: z.string().trim().min(1).max(50).optional(),
    from: dateOnlyString.optional(),
    to: dateOnlyString.optional(),
    status: z.enum(SESSION_STATUSES, 'Holat noto‘g‘ri').optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((values) => !values.from || !values.to || values.from <= values.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

const sessionFieldsSchema = z.object({
  groupId: z.string('Guruhni tanlang').trim().min(1, 'Guruhni tanlang').max(50),
  date: dateOnlySchema,
  startTime: optionalTime,
  endTime: optionalTime,
  topic: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(200, 'Mavzu juda uzun').optional(),
  ),
  note: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(500, 'Izoh juda uzun').optional(),
  ),
  /** Kurs dasturidagi mavzu (LMS) — o'tilgan dars bo'lsa kelganlar progressi yangilanadi */
  topicId: z.string().trim().min(1).max(50).nullable().optional(),
  status: z.enum(SESSION_STATUSES, 'Holat noto‘g‘ri'),
});

export const createSessionSchema = sessionFieldsSchema.extend({ status: sessionFieldsSchema.shape.status.default('HELD') });
// Standart qiymat faqat yaratishda — `.partial()` ichida ham `.default()` ishlab, yuborilmagan maydonni qaytarib yozardi
export const updateSessionSchema = sessionFieldsSchema.omit({ groupId: true, date: true }).partial();

export const attendanceStatsQuerySchema = z
  .object({
    from: dateOnlyString.optional(),
    to: dateOnlyString.optional(),
    courseId: z.string().trim().min(1).max(50).optional(),
    groupId: z.string().trim().min(1).max(50).optional(),
    teacherId: z.string().trim().min(1).max(50).optional(),
    studentId: z.string().trim().min(1).max(50).optional(),
  })
  .refine((values) => !values.from || !values.to || values.from <= values.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

export const attendanceRankingQuerySchema = attendanceStatsQuerySchema.safeExtend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Kamida shuncha dars belgilangan bo‘lsa reytingga kiradi */
  minLessons: z.coerce.number().int().min(1).max(100).default(3),
});

export const attendanceCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type AttendanceStatsQuery = z.infer<typeof attendanceStatsQuerySchema>;
export type AttendanceRankingQuery = z.infer<typeof attendanceRankingQuerySchema>;
export type AttendanceCalendarQuery = z.infer<typeof attendanceCalendarQuerySchema>;
