import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const COURSE_CATEGORIES = [
  'PROGRAMMING',
  'LANGUAGE',
  'DESIGN',
  'COMPUTER_LITERACY',
  'SCHOOL_PREPARATION',
  'OTHER',
] as const;

export const COURSE_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

const idSchema = z.string().trim().min(1).max(50);

/** So‘m: butun son, 0 dan 999 999 999 gacha */
const moneySchema = z.coerce
  .number('Narx raqam bo‘lishi kerak')
  .int('Narx butun son bo‘lishi kerak')
  .min(0, 'Narx manfiy bo‘lishi mumkin emas')
  .max(999_999_999, 'Narx juda katta');

export const courseListQuerySchema = paginationQuerySchema.extend({
  category: z.enum(COURSE_CATEGORIES, 'Yo‘nalish noto‘g‘ri').optional(),
  status: z.enum(COURSE_STATUSES, 'Holat noto‘g‘ri').optional(),
  teacherId: idSchema.optional(),
  sortBy: z.enum(['name', 'price', 'createdAt']).default('name'),
});

const courseFieldsSchema = z.object({
  name: z.string('Kurs nomini kiriting').trim().min(2, 'Kamida 2 belgi').max(150, 'Nom 150 belgidan oshmasligi kerak'),
  category: z.enum(COURSE_CATEGORIES, 'Yo‘nalish noto‘g‘ri').default('OTHER'),
  description: optionalField(z.string().trim().max(2000, 'Tavsif 2000 belgidan oshmasligi kerak')),
  durationMonths: z.coerce
    .number('Davomiylik raqam bo‘lishi kerak')
    .int()
    .min(1, 'Kamida 1 oy')
    .max(60, 'Davomiylik 60 oydan oshmasligi kerak'),
  price: moneySchema,
  discountAmount: moneySchema.default(0),
  teacherId: optionalField(idSchema),
  status: z.enum(COURSE_STATUSES, 'Holat noto‘g‘ri').default('ACTIVE'),
});

export const createCourseSchema = courseFieldsSchema.refine((values) => values.discountAmount <= values.price, {
  path: ['discountAmount'],
  message: 'Chegirma kurs narxidan katta bo‘lmasligi kerak',
});

export const updateCourseSchema = createCourseSchema;

export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
