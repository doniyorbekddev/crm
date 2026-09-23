import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const FEEDBACK_TYPES = ['TEACHER', 'COURSE', 'ACADEMY', 'NPS'] as const;

const feedbackBodySchema = z.object({
  type: z.enum(FEEDBACK_TYPES, 'Fikr turi noto‘g‘ri'),
  teacherId: optionalField(idSchema),
  courseId: optionalField(idSchema),
  groupId: optionalField(idSchema),
  /** 1–5 yulduz (NPS dan tashqari barcha turlar uchun) */
  rating: z.coerce.number().int().min(1, 'Baho 1 dan kam bo‘lmaydi').max(5, 'Baho 5 dan oshmaydi').optional(),
  /** 0–10 tavsiya ehtimoli */
  npsScore: z.coerce.number().int().min(0).max(10, 'Baho 10 dan oshmaydi').optional(),
  comment: optionalField(z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasligi kerak')),
  isAnonymous: z.boolean().default(false),
});

/** Xodim boshqa o‘quvchi nomidan yozadi */
export const createFeedbackSchema = feedbackBodySchema.extend({ studentId: idSchema });

/** Kabinetdan: o‘quvchi o‘zi yozadi, studentId so‘rovdan olinmaydi */
export const portalFeedbackSchema = feedbackBodySchema;

export const handleFeedbackSchema = z.object({
  note: z.string('Izoh kiritilishi shart').trim().min(3, 'Izoh juda qisqa').max(500, 'Izoh juda uzun'),
});

export const feedbackListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  type: z.enum(FEEDBACK_TYPES).optional(),
  teacherId: optionalField(idSchema),
  studentId: optionalField(idSchema),
  onlyNegative: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  onlyOpen: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const feedbackStatsQuerySchema = z.object({
  teacherId: optionalField(idSchema),
  /** Necha oylik oraliq (ko‘rsatilmasa — butun tarix) */
  months: z.coerce.number().int().min(1).max(60).optional(),
});

export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>;
export type PortalFeedbackBody = z.infer<typeof portalFeedbackSchema>;
export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;
