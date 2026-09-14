import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';

const GENERIC_MESSAGE = 'Serverda kutilmagan xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring.';

function buildApp(handler: RequestHandler) {
  const log = { error: vi.fn(), warn: vi.fn() };
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { log });
    next();
  });
  app.get('/boom', handler);
  app.use(errorHandler);
  return { app, log };
}

function httpError(status: number, type?: string): Error {
  return Object.assign(new Error('http'), { status, type });
}

describe('errorHandler', () => {
  it('AppError: holat va xabar qaytadi, faqat 5xx logga yoziladi', async () => {
    const notFound = buildApp(() => {
      throw AppError.notFound('Guruh topilmadi');
    });
    const response = await request(notFound.app).get('/boom');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Guruh topilmadi', errors: [] });
    expect(notFound.log.error).not.toHaveBeenCalled();

    const unavailable = buildApp(() => {
      throw new AppError(503, 'Xizmat vaqtincha ishlamayapti');
    });
    expect((await request(unavailable.app).get('/boom')).status).toBe(503);
    expect(unavailable.log.error).toHaveBeenCalledTimes(1);
  });

  it('ZodError maydonlar ro‘yxati bilan 422 qaytaradi', async () => {
    const { app } = buildApp(() => {
      z.object({ name: z.string('Ismni kiriting'), items: z.array(z.number()) }).parse({ items: ['x'] });
    });
    const response = await request(app).get('/boom');
    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual([
      { field: 'name', message: 'Ismni kiriting' },
      { field: 'items.0', message: expect.any(String) },
    ]);
  });

  it('body-parser kabi 4xx xatolar tushunarli xabarga aylanadi', async () => {
    const cases: Array<[number, string | undefined, string]> = [
      [413, 'entity.too.large', 'So‘rov hajmi juda katta'],
      [415, 'charset.unsupported', 'So‘rov kodirovkasi qo‘llab-quvvatlanmaydi'],
      [415, 'encoding.unsupported', 'So‘rov kodirovkasi qo‘llab-quvvatlanmaydi'],
      [400, undefined, 'So‘rovni qayta ishlab bo‘lmadi'],
    ];
    for (const [status, type, message] of cases) {
      const { app } = buildApp(() => {
        throw httpError(status, type);
      });
      const response = await request(app).get('/boom');
      expect(response.status).toBe(status);
      expect(response.body.message).toBe(message);
    }
  });

  it('kutilmagan xato tafsiloti foydalanuvchiga chiqmaydi va logga yoziladi', async () => {
    const plain = buildApp(() => {
      throw new Error('connection string: postgres://secret');
    });
    const response = await request(plain.app).get('/boom');
    expect(response.status).toBe(500);
    expect(response.body.message).toBe(GENERIC_MESSAGE);
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(plain.log.error).toHaveBeenCalledTimes(1);

    // 5xx holatli "HTTP" xato ham umumiy xabar bilan
    const upstream = buildApp(() => {
      throw httpError(502);
    });
    const upstreamResponse = await request(upstream.app).get('/boom');
    expect(upstreamResponse.status).toBe(500);
    expect(upstreamResponse.body.message).toBe(GENERIC_MESSAGE);

    // Error bo'lmagan qiymat tashlansa ham
    const thrownString = buildApp(() => {
      throw 'kutilmagan';
    });
    expect((await request(thrownString.app).get('/boom')).status).toBe(500);
  });
});
