import { z } from 'zod';

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email kiriting')
  .max(255, 'Email juda uzun')
  .pipe(z.email('Email noto‘g‘ri formatda'));

/** O'quvchi ID raqami: ST-000045, st45 */
export const STUDENT_LOGIN_PATTERN = /^st-?\d{1,9}$/i;

/** Ota-ona telefon raqami: +998 90 123 45 67, 901234567 */
export function isPhoneLogin(value: string): boolean {
  return /^\+?[\d\s()-]{9,20}$/.test(value) && value.replace(/\D/g, '').length >= 9;
}

/** Kirish: xodim — email, o'quvchi — ID raqami, ota-ona — telefon (yoki email) */
export const loginIdentifierField = z
  .string()
  .trim()
  .min(1, 'Login kiriting')
  .max(255, 'Juda uzun')
  .refine(
    (value) => STUDENT_LOGIN_PATTERN.test(value) || isPhoneLogin(value) || z.email().safeParse(value).success,
    'Email, telefon raqami yoki o‘quvchi ID (ST-000045) kiriting',
  );

export function nameField(label: string) {
  return z
    .string()
    .trim()
    .min(2, `${label} kamida 2 belgidan iborat bo‘lishi kerak`)
    .max(100, `${label} 100 belgidan oshmasligi kerak`);
}

/** Ixtiyoriy telefon: bo‘sh qoldirish mumkin, to‘ldirilsa server +998XXXXXXXXX ko‘rinishiga keltiradi. */
export const optionalPhoneField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\+?[\d\s()-]{9,20}$/.test(value), 'Telefon raqam noto‘g‘ri');

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

/** Backend’dagi parol qoidalari bilan bir xil (backend/src/validators/auth.validator.ts). */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: 'Kamida 8 ta belgi', test: (value) => value.length >= 8 },
  { label: 'Kichik harf (a–z)', test: (value) => /[a-z]/.test(value) },
  { label: 'Katta harf (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { label: 'Raqam (0–9)', test: (value) => /\d/.test(value) },
];

export const newPasswordField = z
  .string()
  .min(1, 'Parol kiriting')
  .refine((value) => PASSWORD_RULES.every((rule) => rule.test(value)), 'Parol barcha talablarga javob berishi kerak')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Parol juda uzun');
