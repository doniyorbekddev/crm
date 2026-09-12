import { z } from 'zod';
import { emailSchema, nameSchema, optionalField, paginationQuerySchema, phoneSchema } from './common.validator.js';

export const STUDENT_STATUSES = ['ACTIVE', 'FROZEN', 'COMPLETED', 'DROPPED', 'GRADUATED'] as const;

const idSchema = z.string().trim().min(1).max(50);

const moneySchema = z.coerce
  .number('Summa raqam bo‘lishi kerak')
  .int('Summa butun son bo‘lishi kerak')
  .min(0, 'Summa manfiy bo‘lishi mumkin emas')
  .max(999_999_999, 'Summa juda katta');

/** "2026-10-01" ko‘rinishidagi sana */
const dateOnlySchema = z
  .string('Sanani kiriting')
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const studentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(STUDENT_STATUSES, 'Holat noto‘g‘ri').optional(),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  sortBy: z.enum(['createdAt', 'firstName', 'startDate', 'number']).default('createdAt'),
});

const studentFieldsSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  phone: phoneSchema,
  parentPhone: optionalField(phoneSchema),
  telegram: optionalField(z.string().trim().max(64)),
  email: optionalField(emailSchema),
  birthDate: optionalField(dateOnlySchema),
  gender: optionalField(z.enum(['MALE', 'FEMALE'], 'Jins noto‘g‘ri')),
  address: optionalField(z.string().trim().max(255, 'Manzil juda uzun')),
  courseId: z.string('Kursni tanlang').trim().min(1, 'Kursni tanlang').max(50),
  groupId: optionalField(idSchema),
  contractNumber: optionalField(z.string().trim().max(50, 'Shartnoma raqami juda uzun')),
  /** Bo‘sh bo‘lsa — kursning joriy yakuniy narxi olinadi */
  contractPrice: optionalField(moneySchema),
  startDate: dateOnlySchema,
  notes: optionalField(z.string().trim().max(2000, 'Izoh juda uzun')),
});

export const createStudentSchema = studentFieldsSchema;
export const updateStudentSchema = studentFieldsSchema;

export const updateStudentStatusSchema = z.object({
  status: z.enum(STUDENT_STATUSES, 'Holat noto‘g‘ri'),
});

/** Leadni o‘quvchiga aylantirish — ma'lumotlar leaddan olinadi, qolganini shu yerda to‘ldiriladi */
export const convertLeadSchema = z.object({
  courseId: optionalField(idSchema),
  groupId: optionalField(idSchema),
  contractNumber: optionalField(z.string().trim().max(50, 'Shartnoma raqami juda uzun')),
  contractPrice: optionalField(moneySchema),
  startDate: optionalField(dateOnlySchema),
  parentPhone: optionalField(phoneSchema),
});

export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type UpdateStudentStatusInput = z.infer<typeof updateStudentStatusSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
