import type { Express } from 'express';
import request from 'supertest';
import { bearer } from './auth.js';

/**
 * Maoshni tasdiqlashga yuboradi (Hisoblangan → Ko'rib chiqilmoqda) va id'ni qaytaradi — tasdiqlash shu holatdan
 * bo'ladi. Javob tekshirilmaydi: hisoblanmagan maoshda yuborish ham, tasdiqlash ham o'z xatosini qaytaradi.
 */
export async function submitted(app: Express, id: string, token: string): Promise<string> {
  await request(app).post(`/api/salaries/periods/${id}/submit`).set(bearer(token));
  return id;
}
