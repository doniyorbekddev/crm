import { z } from 'zod';
import { optionalField } from './common.validator.js';

/** MAIN, CHILONZOR, YUNUSOBOD ... — katta harflar, raqam va pastki chiziq */
const branchKeySchema = z
  .string('Filial kaliti kiritilishi shart')
  .trim()
  .min(2, 'Kalit kamida 2 belgi bo‘lishi kerak')
  .max(50, 'Kalit juda uzun')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Kalit katta harf bilan boshlanib, faqat katta harf, raqam va _ dan iborat bo‘lishi kerak');

const branchFieldsSchema = z.object({
  key: branchKeySchema,
  name: z.string('Filial nomi kiritilishi shart').trim().min(2, 'Nom kamida 2 belgi').max(100, 'Nom juda uzun'),
  address: optionalField(z.string().trim().max(255, 'Manzil juda uzun')),
  phone: optionalField(z.string().trim().max(32, 'Telefon juda uzun')),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const createBranchSchema = branchFieldsSchema.extend({
  isActive: branchFieldsSchema.shape.isActive.default(true),
  sortOrder: branchFieldsSchema.shape.sortOrder.default(0),
});

/** Kalit yaratilgandan keyin o‘zgarmaydi — unga ma’lumotlar bog‘langan */
export const updateBranchSchema = branchFieldsSchema.omit({ key: true }).partial();

export const branchListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type BranchListQuery = z.infer<typeof branchListQuerySchema>;
