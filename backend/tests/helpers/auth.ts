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

/** Xodim yaratib, uning access tokenini qaytaradi. */
export async function createUserWithToken(app: Express, options: TestUserOptions = {}) {
  const user = await createTestUser(options);
  const token = await loginAs(app, user.email, options.password);
  return { user, token };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
