import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isDatabaseReachable } = vi.hoisted(() => ({
  isDatabaseReachable: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('../src/config/database.js', () => ({
  prisma: {},
  isDatabaseReachable,
  disconnectDatabase: vi.fn(),
}));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  isDatabaseReachable.mockReset();
});

describe('GET /api/health', () => {
  it('baza ishlayotganda 200 va bir xil formatdagi javob qaytaradi', async () => {
    isDatabaseReachable.mockResolvedValue(true);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'API ishlayapti',
      data: { status: 'ok', service: 'crm-backend', database: 'up' },
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('baza ishlamasa 503 va degraded holat qaytaradi', async () => {
    isDatabaseReachable.mockResolvedValue(false);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'degraded', database: 'down' },
    });
  });
});

describe('Xatoliklar formati', () => {
  it('mavjud bo‘lmagan route uchun 404 qaytaradi', async () => {
    const response = await request(app).get('/api/mavjud-emas');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'So‘ralgan manzil topilmadi: GET /api/mavjud-emas',
      errors: [],
    });
  });

  it('noto‘g‘ri JSON uchun 400 qaytaradi', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"buzilgan": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'So‘rov tanasi (JSON) noto‘g‘ri formatda',
      errors: [],
    });
  });

  it('helmet xavfsizlik headerlarini qo‘shadi', async () => {
    isDatabaseReachable.mockResolvedValue(true);

    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
