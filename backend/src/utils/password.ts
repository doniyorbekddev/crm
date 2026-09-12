import { compare, hash } from 'bcryptjs';
import { isTest } from '../config/env.js';

/** Testlarda tezlik uchun kichikroq cost; production’da 12 (~250 ms). */
const BCRYPT_ROUNDS = isTest ? 4 : 12;

let dummyHash: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/**
 * Foydalanuvchi topilmaganda ham bcrypt tekshiruvi bajariladi —
 * javob vaqtiga qarab qaysi email ro‘yxatdan o‘tganini aniqlab bo‘lmasligi uchun.
 */
export async function simulatePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash('timing-attack-protection-dummy-password', BCRYPT_ROUNDS);
  await compare(password, await dummyHash);
}
