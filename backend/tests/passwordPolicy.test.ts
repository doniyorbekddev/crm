import { describe, expect, it } from 'vitest';
import { passwordSchema } from '../src/validators/auth.validator.js';

/**
 * Parol siyosati. Murakkablik talabi o'z-o'zidan yetarli emas: "Password1" ham katta harf,
 * kichik harf va raqamdan iborat, lekin birinchi navbatda sinab ko'riladigan parol.
 */
describe('Parol siyosati', () => {
  const accepts = (value: string) => passwordSchema.safeParse(value).success;
  const reason = (value: string) => passwordSchema.safeParse(value).error?.issues[0]?.message ?? '';

  it('kuchli parolni qabul qiladi', () => {
    expect(accepts('Markaz2026yil')).toBe(true);
    expect(accepts('QoraQush7Tepa')).toBe(true);
  });

  it('qisqa yoki murakkabligi yetmagan parolni rad etadi', () => {
    expect(accepts('Qisqa1')).toBe(false);
    expect(accepts('hammasikichik1')).toBe(false);
    expect(accepts('HAMMASIKATTA1')).toBe(false);
    expect(accepts('RaqamsizParol')).toBe(false);
  });

  it('mashhur parollarni rad etadi', () => {
    expect(accepts('Password1')).toBe(false);
    expect(reason('Password1')).toContain('mashhur');
    expect(accepts('Admin123')).toBe(false);
    expect(accepts('Parol123')).toBe(false);
  });

  it('ketma-ketlik va takrorlanuvchi belgilarni rad etadi', () => {
    expect(accepts('Aaaa1234')).toBe(false);
    expect(accepts('Qwerty12Zx')).toBe(false);
    expect(accepts('Abcd1234Xy')).toBe(false);
  });

  it('bcrypt chegarasidan uzun parolni rad etadi', () => {
    expect(accepts(`A1${'z'.repeat(80)}`)).toBe(false);
  });
});
