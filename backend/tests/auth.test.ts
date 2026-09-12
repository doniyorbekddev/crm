import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { emailService } from '../src/services/email.service.js';
import { hashToken } from '../src/utils/tokens.js';
import { getRefreshSetCookie, getRefreshToken, refreshCookieHeader } from './helpers/cookies.js';
import { DEFAULT_PASSWORD, createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

function login(email: string, password = DEFAULT_PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

function refresh(token: string) {
  return request(app).post('/api/auth/refresh').set('Cookie', refreshCookieHeader(token));
}

async function loginAndGetTokens(email: string, password = DEFAULT_PASSWORD) {
  const response = await login(email, password);
  expect(response.status).toBe(200);
  const refreshToken = getRefreshToken(response);
  if (!refreshToken) throw new Error('Refresh cookie qaytmadi');
  return { accessToken: response.body.data.accessToken as string, refreshToken };
}

function captureResetEmails() {
  return vi.spyOn(emailService, 'sendPasswordReset').mockResolvedValue(undefined);
}

function tokenFromResetUrl(url: string | undefined): string {
  const token = url ? new URL(url).searchParams.get('token') : null;
  if (!token) throw new Error('Reset havolasida token yo‘q');
  return token;
}

describe.skipIf(!hasTestDatabase)('Auth API (integratsion)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('access token, foydalanuvchi, permissionlar va httpOnly refresh cookie qaytaradi', async () => {
      const user = await createTestUser({ email: 'ali@test.uz', role: 'SALES_MANAGER' });

      const response = await login('  ALI@Test.uz ');

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.expiresIn).toBe(900);
      expect(response.body.data.user).toMatchObject({ id: user.id, email: 'ali@test.uz', role: { key: 'SALES_MANAGER' } });
      expect(response.body.data.user.permissions).toContain('lead.create');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.headers['cache-control']).toBe('no-store');

      const cookie = getRefreshSetCookie(response);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/i);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.login', userId: user.id } });
      expect(audit).not.toBeNull();
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('noto‘g‘ri parol va mavjud bo‘lmagan email uchun bir xil 401 xabar qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });

      const wrongPassword = await login('ali@test.uz', 'Notogri123');
      const unknownEmail = await login('yoq@test.uz');

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
      expect(getRefreshSetCookie(wrongPassword)).toBeUndefined();
      expect(await prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBe(2);
    });

    it('tasdiqlanmagan va bloklangan hisoblarga 403 qaytaradi', async () => {
      await createTestUser({ email: 'pending@test.uz', status: 'PENDING' });
      await createTestUser({ email: 'blocked@test.uz', status: 'BLOCKED' });

      const pending = await login('pending@test.uz');
      const blocked = await login('blocked@test.uz');

      expect(pending.status).toBe(403);
      expect(pending.body.message).toMatch(/tasdiqlanmagan/);
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toMatch(/bloklangan/);
    });

    it('noto‘g‘ri formatdagi ma’lumotlar uchun 422 va maydon xatolarini qaytaradi', async () => {
      const response = await request(app).post('/api/auth/login').send({ email: 'email-emas', password: '' });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      const fields = (response.body.errors as Array<{ field: string }>).map((error) => error.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
    });
  });

  describe('GET /api/auth/me', () => {
    it('access token bilan joriy foydalanuvchini qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz', role: 'ACCOUNTANT' });
      const { accessToken } = await loginAndGetTokens('ali@test.uz');

      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ email: 'ali@test.uz', role: { key: 'ACCOUNTANT' } });
      expect(response.body.data.permissions).toContain('payment.create');
      expect(response.body.data.permissions).not.toContain('lead.create');
    });

    it('tokensiz yoki buzilgan token bilan 401 qaytaradi', async () => {
      const noToken = await request(app).get('/api/auth/me');
      const badToken = await request(app).get('/api/auth/me').set('Authorization', 'Bearer buzilgan.token.qiymat');

      expect(noToken.status).toBe(401);
      expect(badToken.status).toBe(401);
    });

    it('bloklangan xodimning tokeni muddati tugashini kutmasdan ishlamay qoladi', async () => {
      const user = await createTestUser({ email: 'ali@test.uz' });
      const { accessToken } = await loginAndGetTokens('ali@test.uz');
      await prisma.user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });

      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('refresh tokenni almashtiradi (rotation) va yangi access token beradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const { refreshToken } = await loginAndGetTokens('ali@test.uz');

      const response = await refresh(refreshToken);

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      const rotated = getRefreshToken(response);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(refreshToken);

      const old = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(refreshToken) } });
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).not.toBeNull();
    });

    it('parallel so‘rov (grace oralig‘i)da eski token 401 oladi, lekin yangi sessiya saqlanadi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const { refreshToken } = await loginAndGetTokens('ali@test.uz');
      const rotated = getRefreshToken(await refresh(refreshToken));
      if (!rotated) throw new Error('Rotatsiya bo‘lmadi');

      const reused = await refresh(refreshToken);
      const next = await refresh(rotated);

      expect(reused.status).toBe(401);
      expect(next.status).toBe(200);
    });

    it('bekor qilingan token keyinroq qayta ishlatilsa, butun sessiya oilasi bekor qilinadi', async () => {
      const user = await createTestUser({ email: 'ali@test.uz' });
      const { refreshToken } = await loginAndGetTokens('ali@test.uz');
      const rotated = getRefreshToken(await refresh(refreshToken));
      if (!rotated) throw new Error('Rotatsiya bo‘lmadi');
      await prisma.refreshToken.update({
        where: { tokenHash: hashToken(refreshToken) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      const reused = await refresh(refreshToken);
      const stolenSessionAttempt = await refresh(rotated);

      expect(reused.status).toBe(401);
      expect(stolenSessionAttempt.status).toBe(401);
      expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_token_reuse', userId: user.id } })).toBe(1);
    });

    it('cookie’siz so‘rovga 401 qaytaradi', async () => {
      const response = await request(app).post('/api/auth/refresh');
      expect(response.status).toBe(401);
    });
  });

  describe('Logout', () => {
    it('joriy sessiyani bekor qiladi va cookie’ni tozalaydi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const { refreshToken } = await loginAndGetTokens('ali@test.uz');

      const response = await request(app).post('/api/auth/logout').set('Cookie', refreshCookieHeader(refreshToken));

      expect(response.status).toBe(200);
      expect(getRefreshSetCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await refresh(refreshToken)).status).toBe(401);
    });

    it('logout-all barcha qurilmalardagi sessiyalarni yopadi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const first = await loginAndGetTokens('ali@test.uz');
      const second = await loginAndGetTokens('ali@test.uz');

      const response = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${first.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.revokedSessions).toBe(2);
      expect((await refresh(second.refreshToken)).status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('PENDING hisob yaratadi, adminga bildirishnoma yuboradi va tasdiqlanmaguncha kirishga ruxsat bermaydi', async () => {
      const admin = await createTestUser({ email: 'admin@test.uz', role: 'SUPER_ADMIN' });

      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Sardor',
        lastName: 'Aliyev',
        email: 'sardor@test.uz',
        phone: '90 123 45 67',
        password: 'Kuchli123',
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ email: 'sardor@test.uz', status: 'PENDING' });
      const created = await prisma.user.findUniqueOrThrow({ where: { email: 'sardor@test.uz' }, include: { role: true } });
      expect(created.phone).toBe('+998901234567');
      expect(created.role.key).toBe('CALL_CENTER');
      expect(await prisma.notification.count({ where: { userId: admin.id, entityId: created.id } })).toBe(1);
      expect((await login('sardor@test.uz', 'Kuchli123')).status).toBe(403);
    });

    it('band email uchun 409 qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ firstName: 'Ali', lastName: 'Valiyev', email: 'ali@test.uz', password: 'Kuchli123' });

      expect(response.status).toBe(409);
      expect(response.body.errors).toEqual([{ field: 'email', message: 'Bu email band' }]);
    });

    it('zaif parol uchun 422 qaytaradi', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ firstName: 'Ali', lastName: 'Valiyev', email: 'yangi@test.uz', password: 'zaifparol' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });
  });

  describe('Parolni tiklash', () => {
    it('forgot-password email mavjudligidan qat’i nazar bir xil javob qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const emails = captureResetEmails();

      const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'yoq@test.uz' });
      const known = await request(app).post('/api/auth/forgot-password').send({ email: 'ali@test.uz' });

      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
      expect(emails).toHaveBeenCalledTimes(1);
    });

    it('havola orqali parol yangilanadi, eski sessiyalar yopiladi va havola qayta ishlamaydi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const { refreshToken } = await loginAndGetTokens('ali@test.uz');
      const emails = captureResetEmails();
      await request(app).post('/api/auth/forgot-password').send({ email: 'ali@test.uz' });
      const token = tokenFromResetUrl(emails.mock.calls[0]?.[0].resetUrl);

      const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'YangiParol456' });
      const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'BoshqaParol789' });

      expect(reset.status).toBe(200);
      expect(reuse.status).toBe(400);
      expect((await login('ali@test.uz')).status).toBe(401);
      expect((await login('ali@test.uz', 'YangiParol456')).status).toBe(200);
      expect((await refresh(refreshToken)).status).toBe(401);
    });

    it('muddati o‘tgan havola uchun 400 qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const emails = captureResetEmails();
      await request(app).post('/api/auth/forgot-password').send({ email: 'ali@test.uz' });
      const token = tokenFromResetUrl(emails.mock.calls[0]?.[0].resetUrl);
      await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await request(app).post('/api/auth/reset-password').send({ token, password: 'YangiParol456' });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/auth/change-password', () => {
    it('joriy parol noto‘g‘ri bo‘lsa 400 qaytaradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const { accessToken } = await loginAndGetTokens('ali@test.uz');

      const response = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'Notogri123', newPassword: 'YangiParol456' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([{ field: 'currentPassword', message: 'Joriy parol noto‘g‘ri' }]);
    });

    it('parolni o‘zgartiradi, boshqa qurilmalarni chiqaradi va joriy qurilmaga yangi sessiya beradi', async () => {
      await createTestUser({ email: 'ali@test.uz' });
      const current = await loginAndGetTokens('ali@test.uz');
      const otherDevice = await loginAndGetTokens('ali@test.uz');

      const response = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${current.accessToken}`)
        .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'YangiParol456' });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      const newRefresh = getRefreshToken(response);
      if (!newRefresh) throw new Error('Yangi refresh cookie qaytmadi');

      expect((await refresh(otherDevice.refreshToken)).status).toBe(401);
      expect((await refresh(newRefresh)).status).toBe(200);
      expect((await login('ali@test.uz', 'YangiParol456')).status).toBe(200);
    });
  });
});
