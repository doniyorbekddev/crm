import { z } from 'zod';
import { passwordSchema } from './auth.validator.js';
import { emailSchema, nameSchema, optionalField, paginationQuerySchema, phoneSchema } from './common.validator.js';

const roleIdSchema = z.string('Rolni tanlang').trim().min(1, 'Rolni tanlang').max(50);

export const userListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'PENDING', 'BLOCKED'], 'Holat noto‘g‘ri').optional(),
  roleId: z.string().trim().min(1).max(50).optional(),
  sortBy: z.enum(['createdAt', 'firstName', 'email', 'lastLoginAt']).default('createdAt'),
});

export const userSummaryQuerySchema = userListQuerySchema.pick({ search: true, roleId: true });

export const createUserSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  email: emailSchema,
  phone: optionalField(phoneSchema),
  roleId: roleIdSchema,
  password: passwordSchema,
});

/** PUT — to‘liq ma'lumot; telefon yuborilmasa o‘chiriladi. */
export const updateUserSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  email: emailSchema,
  phone: optionalField(phoneSchema),
  roleId: roleIdSchema,
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED'], 'Holat faqat ACTIVE yoki BLOCKED bo‘lishi mumkin'),
  /** Tasdiqlashda (PENDING → ACTIVE) rol ham berilishi mumkin */
  roleId: roleIdSchema.optional(),
});

export const resetUserPasswordSchema = z.object({
  password: passwordSchema,
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserSummaryQuery = z.infer<typeof userSummaryQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
