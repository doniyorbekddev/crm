import { z } from 'zod';
import { emailSchema, nameSchema, optionalField, phoneSchema } from './common.validator.js';

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt faqat birinchi 72 baytni hisobga oladi */
const PASSWORD_MAX_BYTES = 72;

/**
 * Eng ko'p ishlatiladigan va shu sababli birinchi navbatda sinab ko'riladigan parollar.
 * Ro'yxat qisqa: maqsad — lug'atni to'liq qamrash emas (buni murakkablik talabi qiladi),
 * balki "Password1" kabi tekshiruvdan o'tib ketadigan mashhur parollarni to'sish.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'admin123',
  'welcome1',
  'iloveyou1',
  'abc12345',
  'parol123',
  'akademiya1',
  'student123',
  'teacher123',
  'crm12345',
  '12345678',
  'test1234',
]);

/** Ketma-ket takrorlanuvchi yoki oddiy ketma-ketlik (aaaa, 1234, abcd) */
function hasWeakPattern(value: string): boolean {
  const lower = value.toLowerCase();
  if (/(.)\1{3,}/.test(lower)) return true;
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop'];
  for (const sequence of sequences) {
    for (let index = 0; index + 4 <= sequence.length; index += 1) {
      const chunk = sequence.slice(index, index + 4);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(''))) return true;
    }
  }
  return false;
}

export const passwordSchema = z
  .string('Parol kiritilishi shart')
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo‘lishi kerak`)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, 'Parol juda uzun')
  .refine((value) => /[a-z]/.test(value), 'Parolda kamida bitta kichik harf bo‘lishi kerak')
  .refine((value) => /[A-Z]/.test(value), 'Parolda kamida bitta katta harf bo‘lishi kerak')
  .refine((value) => /\d/.test(value), 'Parolda kamida bitta raqam bo‘lishi kerak')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), 'Bu parol juda mashhur — boshqasini tanlang')
  .refine((value) => !hasWeakPattern(value), 'Parolda ketma-ket takrorlanuvchi belgilar yoki oddiy ketma-ketlik bo‘lmasin');

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
