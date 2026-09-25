import type { Express } from 'express';
import request from 'supertest';
import { DEFAULT_PASSWORD, createTestUser } from './db.js';
import type { TestUserOptions } from './db.js';

export async function loginAs(app: Express, email: string, password = DEFAULT_PASSWORD): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login muvaffaqiyatsiz (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return response.body.data.accessToken as string;
}

/** Kabinet hisobi uchun yangi parol (vaqtinchalik parol almashtirilganda) */
export const PORTAL_NEW_PASSWORD = 'KabinetYangi2026';

/**
 * Kabinet hisobiga vaqtinchalik parol bilan kiradi va parolni almashtiradi — tizim shuni
 * talab qiladi (`mustChangePassword`). Yangi sessiyaning access tokenini qaytaradi.
 */
export async function loginWithTemporaryPassword(app: Express, login: string, temporaryPassword: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email: login, password: temporaryPassword });
  if (response.status !== 200) {
    throw new Error(`Login muvaffaqiyatsiz (${response.status}): ${JSON.stringify(response.body)}`);
  }
  if (response.body.data.user.mustChangePassword !== true) {
    throw new Error('Vaqtinchalik parol bilan kirilganda mustChangePassword = true bo‘lishi kerak');
  }
  const changed = await request(app)
    .patch('/api/auth/change-password')
    .set(bearer(response.body.data.accessToken as string))
    .send({ currentPassword: temporaryPassword, newPassword: PORTAL_NEW_PASSWORD });
  if (changed.status !== 200) {
    throw new Error(`Parol almashtirilmadi (${changed.status}): ${JSON.stringify(changed.body)}`);
  }
  return changed.body.data.accessToken as string;
}

/** Xodim yaratib, uning access tokenini qaytaradi. */
export async function createUserWithToken(app: Express, options: TestUserOptions = {}) {
  const user = await createTestUser(options);
  const token = await loginAs(app, user.email, options.password);
  return { user, token };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
