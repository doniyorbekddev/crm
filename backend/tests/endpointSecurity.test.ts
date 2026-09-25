import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { aiAcademicRouter } from '../src/routes/aiAcademic.routes.js';
import { apiRouter } from '../src/routes/index.js';
import { hashPassword } from '../src/utils/password.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { hasTestDatabase } from './helpers/db.js';

/**
 * TZ 3.0 §57 "API SECURITY": har endpoint autentifikatsiya va ruxsatdan o'tsin.
 *
 * Qo'lda ro'yxat emas — **barcha ro'yxatdan o'tgan marshrutlar** avtomatik yig'iladi, shuning uchun
 * yangi endpoint qo'shilsa-yu, himoya unutilsa, bu test yiqiladi:
 *  1. token yo'q → 401 (faqat {@link PUBLIC} ro'yxatidagilar ochiq);
 *  2. **hech qanday ruxsati yo'q** rol → 403 (faqat {@link AUTH_ONLY} — o'z profili/xabarlari kabi).
 */

type RouterLike = { stack: Array<{ route?: { path: string; methods: Record<string, boolean> }; handle: RouterLike & ((...args: unknown[]) => unknown) }> };

/** Ichma-ich routerlar (Express 5 mount yo'lini saqlamaydi) */
const NESTED = new Map<unknown, string>([[aiAcademicRouter, '/academic']]);

function mountPaths(): string[] {
  const source = readFileSync(new URL('../src/routes/index.ts', import.meta.url), 'utf8');
  return [...source.matchAll(/apiRouter\.use\('([^']+)',/g)].map((match) => match[1]!);
}

function collect(router: RouterLike, prefix: string, out: Array<{ method: string; path: string }>): void {
  for (const layer of router.stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push({ method, path: `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/' });
    } else if (layer.handle && Array.isArray((layer.handle as RouterLike).stack)) {
      const nested = NESTED.get(layer.handle);
      if (nested === undefined) throw new Error(`${prefix} ichida noma'lum ichki router — NESTED ga qo'shing`);
      collect(layer.handle, `${prefix}${nested}`, out);
    }
  }
}

function allRoutes(): Array<{ method: string; path: string }> {
  const mounts = mountPaths();
  const layers = (apiRouter as unknown as RouterLike).stack;
  expect(layers.length).toBe(mounts.length);
  const out: Array<{ method: string; path: string }> = [];
  layers.forEach((layer, index) => collect(layer.handle, `/api${mounts[index]}`, out));
  return out;
}

const key = (route: { method: string; path: string }) => `${route.method.toUpperCase()} ${route.path}`;

/** Tokensiz ochiq marshrutlar — har biri o'z himoyasiga ega (imzo, limit, bir martalik token) */
const PUBLIC = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/telegram/webhook',
  'POST /api/payments/webhook/:provider',
  // Sertifikatni QR orqali tekshirish — tasodifiy token, faqat ism/kurs/sana, heavyLimiter
  'GET /api/certificates/verify/:token',
]);

/** Kirgan har bir foydalanuvchi uchun (ruxsatsiz) — faqat o'ziga tegishli ma'lumot */
const AUTH_ONLY = new Set([
  'GET /api/auth/me',
  'PATCH /api/auth/change-password',
  'POST /api/auth/logout-all',
  'GET /api/auth/me/preferences',
  'PUT /api/auth/me/preferences/:key',
  'GET /api/telegram/me',
  'DELETE /api/telegram/me',
  'GET /api/teachers/me',
  // O'z bildirishnomalari (userId = actor.id)
  'GET /api/notifications',
  'GET /api/notifications/summary',
  'GET /api/notifications/settings',
  'PUT /api/notifications/settings',
  'PATCH /api/notifications/read-all',
  'PATCH /api/notifications/:id/read',
  'DELETE /api/notifications/read',
  'DELETE /api/notifications/:id',
  // Xodim ishlari: requireStaff (kabinet 403), faqat o'ziga biriktirilgan/yaratgan ishlar
  'GET /api/tasks',
  'PATCH /api/tasks/:id',
  // Filial tanlash paneli: branch.view_all bo'lmasa — faqat o'z filiali
  'GET /api/branches',
  // Ruxsat hujjat bog'langan yozuvga qarab servisda (begona/yo'q hujjat — 404)
  'GET /api/documents/:id/download',
  'PATCH /api/documents/:id',
  'DELETE /api/documents/:id',
  // Natijalar ruxsatlar bo'yicha filtrlanadi — ruxsatsiz rolga bo'sh (pastdagi test)
  'GET /api/search',
]);

function concrete(path: string): string {
  return path.replace(/:(\w+)/g, (_match, name: string) => (name === 'provider' ? 'sandbox' : '00000000-0000-4000-8000-000000000000'));
}

describe('§57 endpoint xavfsizligi (barcha marshrutlar)', () => {
  const app = createApp();
  const routes = allRoutes();

  it('marshrutlar to‘liq yig‘iladi', () => {
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.map(key)).toContain('GET /api/students/:id');
    expect(routes.map(key)).toContain('POST /api/ai/academic/submissions/:homeworkId/:studentId');
  });

  it('ochiq ro‘yxatdagi har bir marshrut haqiqatan mavjud (eskirgan istisno qolmasin)', () => {
    const existing = new Set(routes.map(key));
    for (const entry of [...PUBLIC, ...AUTH_ONLY]) expect(existing, entry).toContain(entry);
  });

  it('token yo‘q → 401 (ochiq ro‘yxatdan tashqari)', async () => {
    const leaks: string[] = [];
    for (const route of routes) {
      if (PUBLIC.has(key(route))) continue;
      const response = await request(app)[route.method as 'get'](concrete(route.path));
      if (response.status !== 401) leaks.push(`${key(route)} → ${response.status}`);
    }
    expect(leaks).toEqual([]);
  }, 120_000);

  describe.skipIf(!hasTestDatabase)('ruxsatsiz rol', () => {
    let token = '';
    let roleId = '';
    let userId = '';

    beforeAll(async () => {
      const role = await prisma.role.create({ data: { key: `NOPERM_${Date.now()}`, name: 'Ruxsatsiz (test)', isSystem: false } });
      roleId = role.id;
      const user = await prisma.user.create({
        data: { email: `noperm-${Date.now()}@example.com`, firstName: 'Ruxsat', lastName: 'Yoq', passwordHash: await hashPassword('Secret123!'), roleId, status: 'ACTIVE' },
      });
      userId = user.id;
      token = signAccessToken({ id: user.id, roleKey: role.key });
    });

    afterAll(async () => {
      if (userId) await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), status: 'BLOCKED' } });
    });

    it('hech qanday ruxsatsiz rol → 403 (faqat o‘z profili ochiq)', async () => {
      const leaks: string[] = [];
      for (const route of routes) {
        const name = key(route);
        if (PUBLIC.has(name) || AUTH_ONLY.has(name)) continue;
        const response = await request(app)[route.method as 'get'](concrete(route.path)).set('Authorization', `Bearer ${token}`);
        if (response.status !== 403) leaks.push(`${name} → ${response.status}`);
      }
      expect(leaks).toEqual([]);
    }, 180_000);

    it('qidiruv ruxsatsiz rolga hech narsa qaytarmaydi (bazada ma’lumot bo‘lsa ham)', async () => {
      for (const q of ['a', 'ali', 'test', '99']) {
        const response = await request(app).get('/api/search').query({ q }).set('Authorization', `Bearer ${token}`);
        if (response.status === 422) continue;
        expect(response.status).toBe(200);
        expect(response.body.data.total).toBe(0);
      }
    });
  });
});
