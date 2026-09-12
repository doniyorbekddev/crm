import { z } from 'zod';
import { emailSchema, nameSchema, optionalField, phoneSchema } from './common.validator.js';

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt faqat birinchi 72 baytni hisobga oladi */
const PASSWORD_MAX_BYTES = 72;

export const passwordSchema = z
  .string('Parol kiritilishi shart')
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo‘lishi kerak`)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, 'Parol juda uzun')
  .refine((value) => /[a-z]/.test(value), 'Parolda kamida bitta kichik harf bo‘lishi kerak')
  .refine((value) => /[A-Z]/.test(value), 'Parolda kamida bitta katta harf bo‘lishi kerak')
  .refine((value) => /\d/.test(value), 'Parolda kamida bitta raqam bo‘lishi kerak');

export const loginSchema = z.object({
  email: emailSchema,
  // Login paytida murakkablik tekshirilmaydi — faqat bo‘sh emasligi
  password: z.string('Parol kiritilishi shart').min(1, 'Parol kiritilishi shart').max(200, 'Parol juda uzun'),
});

export const registerSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  email: emailSchema,
  phone: optionalField(phoneSchema),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string('Token topilmadi').min(20, 'Havola noto‘g‘ri').max(200, 'Havola noto‘g‘ri'),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string('Joriy parolni kiriting').min(1, 'Joriy parolni kiriting').max(200),
    newPassword: passwordSchema,
  })
  .refine((values) => values.currentPassword !== values.newPassword, {
    path: ['newPassword'],
    message: 'Yangi parol joriy paroldan farq qilishi kerak',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
