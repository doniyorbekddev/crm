import { z } from 'zod';
import { emailSchema, nameSchema, optionalField, paginationQuerySchema, phoneSchema } from './common.validator.js';

export const PARENT_RELATIONS = ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'] as const;

const idSchema = z.string().trim().min(1).max(50);

const studentLinkSchema = z.object({
  studentId: z.string('O‘quvchini tanlang').trim().min(1, 'O‘quvchini tanlang').max(50),
  relation: z.enum(PARENT_RELATIONS, 'Qarindoshlikni tanlang').default('GUARDIAN'),
  isPrimary: z.boolean().default(false),
});

export const parentListQuerySchema = paginationQuerySchema.extend({
  studentId: idSchema.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
});

const parentFieldsSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  phone: phoneSchema,
  telegram: optionalField(z.string().trim().max(64, 'Telegram juda uzun')),
  email: optionalField(emailSchema),
  notes: optionalField(z.string().trim().max(1000, 'Izoh juda uzun')),
});

export const createParentSchema = parentFieldsSchema.extend({
  /** Yaratish bilan birga farzand(lar)ni biriktirish */
  students: z.array(studentLinkSchema).max(10, 'Juda ko‘p farzand').default([]),
});

export const updateParentSchema = parentFieldsSchema.partial();

export const linkStudentSchema = studentLinkSchema;

export const updateLinkSchema = z
  .object({
    relation: z.enum(PARENT_RELATIONS, 'Qarindoshlik noto‘g‘ri').optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((values) => values.relation !== undefined || values.isPrimary !== undefined, 'Kamida bitta maydonni o‘zgartiring');

export type ParentListQuery = z.infer<typeof parentListQuerySchema>;
export type CreateParentInput = z.infer<typeof createParentSchema>;
export type UpdateParentInput = z.infer<typeof updateParentSchema>;
export type LinkStudentInput = z.infer<typeof linkStudentSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
