import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { DEFAULT_PASSWORD, createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * Production'da backend oldida bitta ishonchli proxy turadi (frontend konteyneridagi Nginx) va u
 * `X-Forwarded-For` da bitta, o'zi aniqlagan manzilni yuboradi (frontend/nginx/app.conf) —
 * shuning uchun `trust proxy = 1`. Bu testlar shu shartnomani va u buzilganda nima bo'lishini qotiradi.
 */
const behindProxy = createApp({ trustProxy: 1 });
const direct = createApp({ trustProxy: 0 });

const WRONG = 'NotoGriParol1';
const login = (app: ReturnType<typeof createApp>, email: string, password: string, forwardedFor?: string) => {
  const call = request(app).post('/api/auth/login');
  if (forwardedFor) void call.set('X-Forwarded-For', forwardedFor);
  return call.send({ email, password });
};
const lastFailureIp = async (email: string) =>
  (await prisma.auditLog.findFirstOrThrow({ where: { action: 'auth.login_failed', metadata: { path: ['email'], equals: email } }, orderBy: { createdAt: 'desc' } })).ip;

describe.skipIf(!hasTestDatabase)('Mijoz IP manzili, rate limit va login bloklash', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_TEST;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('IP ni aniqlash', () => {
    it('proxy bitta manzil yuborsa — audit aynan shu mijoz IP sini yozadi', async () => {
      await login(behindProxy, 'yoq-1@test.uz', WRONG, '203.0.113.7');
      expect(await lastFailureIp('yoq-1@test.uz')).toBe('203.0.113.7');
    });

    it('zanjir normallashtirilmasa (ikki proxy, trust proxy = 1) — mijoz emas, oxirgi proxy manzili olinadi', async () => {
      // Aynan shu holat tuzatilgan nuqson: Nginx zanjirni bitta manzilga keltirmasa, hamma foydalanuvchi "172.18.0.1" bo'lib qoladi
      await login(behindProxy, 'yoq-2@test.uz', WRONG, '203.0.113.7, 172.18.0.1');
      expect(await lastFailureIp('yoq-2@test.uz')).toBe('172.18.0.1');
      await login(behindProxy, 'yoq-3@test.uz', WRONG, '198.51.100.9, 172.18.0.1');
      expect(await lastFailureIp('yoq-3@test.uz')).toBe('172.18.0.1');
    });

    it('proxy’siz rejimda mijoz yuborgan X-Forwarded-For e’tiborga olinmaydi (IP soxtalashtirilmaydi)', async () => {
      await login(direct, 'yoq-4@test.uz', WRONG, '203.0.113.7');
      const ip = await lastFailureIp('yoq-4@test.uz');
      expect(ip).not.toBe('203.0.113.7');
      expect(ip).toMatch(/127\.0\.0\.1|::1/);
    });
  });

  describe('Rate limit mijoz bo‘yicha', () => {
    it('bir mijozning xato urinishlari boshqa mijozni bloklamaydi', async () => {
      process.env.RATE_LIMIT_TEST = 'on';
      const victim = await createTestUser({ email: 'halol@test.uz' });
      // Hujumchi: 12 ta xato urinish (har safar boshqa email — hisob darajasidagi blok aralashmasin)
      let blocked = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await login(behindProxy, `hujum-${attempt}@test.uz`, WRONG, '203.0.113.50');
        if (response.status === 429) blocked = true;
      }
      expect(blocked).toBe(true);
      expect((await login(behindProxy, 'yana@test.uz', WRONG, '203.0.113.50')).status).toBe(429);

      // Boshqa IP dagi foydalanuvchi bemalol kiradi
      const ok = await login(behindProxy, victim.email, DEFAULT_PASSWORD, '198.51.100.20');
      expect(ok.status).toBe(200);
    });

    it('zanjir normallashtirilmasa, bitta mijoz hammani bloklaydi (nega Nginx sozlamasi shart)', async () => {
      process.env.RATE_LIMIT_TEST = 'on';
      const victim = await createTestUser({ email: 'jabrlanuvchi@test.uz' });
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await login(behindProxy, `hujum2-${attempt}@test.uz`, WRONG, '203.0.113.60, 172.18.0.2');
      }
      // Jabrlanuvchi boshqa manzildan, to'g'ri parol bilan — lekin oxirgi proxy bir xil, shuning uchun u ham bloklangan
      const collateral = await login(behindProxy, victim.email, DEFAULT_PASSWORD, '198.51.100.30, 172.18.0.2');
      expect(collateral.status).toBe(429);
    });
  });

  describe('Hisob darajasidagi blok (IP ga bog‘liq emas)', () => {
    it('8 ta xato paroldan keyin hisob boshqa IP dan ham, to‘g‘ri parol bilan ham vaqtincha yopiq', async () => {
      const user = await createTestUser({ email: 'nishon@test.uz' });
      for (let attempt = 0; attempt < 8; attempt += 1) {
        // Har urinish boshqa IP dan — IP limiti emas, aynan hisob bloki tekshiriladi
        expect((await login(behindProxy, user.email, WRONG, `203.0.113.${100 + attempt}`)).status).toBe(401);
      }
      const locked = await login(behindProxy, user.email, DEFAULT_PASSWORD, '198.51.100.40');
      expect(locked.status).toBe(429);
      expect(locked.body.message).toContain('bloklandi');
      expect(await prisma.auditLog.count({ where: { action: 'auth.login_locked', userId: user.id, ip: '198.51.100.40' } })).toBe(1);

      // Boshqa hisobga bu blok ta'sir qilmaydi
      const other = await createTestUser({ email: 'boshqa@test.uz' });
      expect((await login(behindProxy, other.email, DEFAULT_PASSWORD, '198.51.100.40')).status).toBe(200);
    });
  });
});
