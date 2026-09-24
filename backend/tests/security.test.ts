import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

describe('Xavfsizlik sozlamalari', () => {
  it('himoya sarlavhalarini qo‘yadi va serverni oshkor qilmaydi', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
    // HSTS faqat productionda qo‘yiladi
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('har bir javobga so‘rov ID beradi', async () => {
    // Bazaga tegmaydigan yo'l ishlatiladi: sarlavha marshrutdan oldin qo'yiladi, shuning uchun
    // 404 javob ham yetarli — va test to'liq to'plam bilan birga ishlaganda bazaga bog'liq bo'lmaydi.
    const generated = await request(app).get('/api/__no-such-route');
    const passed = await request(app).get('/api/__no-such-route').set('X-Request-Id', 'test-request-1234');

    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{8,100}$/);
    expect(passed.headers['x-request-id']).toBe('test-request-1234');
  });

  it('noto‘g‘ri formatdagi so‘rov ID ni qabul qilmaydi', async () => {
    const response = await request(app).get('/api/__no-such-route').set('X-Request-Id', 'bad id with spaces');

    expect(response.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('juda katta JSON tanasini rad etadi (256kb chegara)', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'a@b.uz', password: 'x'.repeat(300_000) });

    expect(response.status).toBe(413);
  });

  it('noto‘g‘ri JSON uchun 400 qaytaradi', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('mavjud bo‘lmagan endpoint uchun 404 JSON qaytaradi', async () => {
    const response = await request(app).get('/api/mavjud-emas');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false });
  });

  it('CORS faqat ruxsat etilgan manbaga ochiq', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const foreign = await request(app).get('/api/health').set('Origin', 'http://evil.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe.skipIf(!hasTestDatabase)('Autentifikatsiya himoyasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('token yo‘q, buzilgan yoki boshqa kalit bilan imzolangan bo‘lsa 401 qaytaradi', async () => {
    const missing = await request(app).get('/api/leads');
    const malformed = await request(app).get('/api/leads').set('Authorization', 'Bearer buzilgan.token.qiymati');
    const wrongScheme = await request(app).get('/api/leads').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(wrongScheme.status).toBe(401);
  });

  it('bloklangan xodimning tokeni darhol kuchini yo‘qotadi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
    const before = await request(app).get('/api/leads').set(bearer(token));
    await prisma.user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });
    const after = await request(app).get('/api/leads').set(bearer(token));

    expect(before.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it('parol o‘zgarganda eski access token ishlamaydi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date(Date.now() + 1000) } });

    const response = await request(app).get('/api/leads').set(bearer(token));

    expect(response.status).toBe(401);
  });

  it('refresh cookie’siz yangilanish so‘rovi rad etiladi', async () => {
    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
  });
});
