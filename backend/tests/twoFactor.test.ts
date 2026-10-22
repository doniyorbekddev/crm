import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { base32Encode, decryptTotpSecret, encryptTotpSecret, totpCode, totpStep, verifyTotp } from '../src/utils/totp.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { DEFAULT_PASSWORD, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 ilova B: sir "12345678901234567890", SHA1; 8 xonali kodning oxirgi 6 tasi
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('test vektorlari va ±1 qadam oynasi; qayta ishlatish rad etiladi', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totpCode(secret, 1)).toBe('287082');
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(secret, Math.floor(2000000000 / 30))).toBe('279037');

    const now = new Date(1111111109 * 1000);
    const step = totpStep(now);
    expect(verifyTotp(secret, '081804', now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, '081804', now, step)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('sir shifrlanadi; buzilgan shifr — null', () => {
    const stored = encryptTotpSecret(secret);
    expect(stored).not.toContain(secret);
    expect(decryptTotpSecret(stored)).toBe(secret);
    const parts = stored.split(':');
    parts[3] = `${parts[3]!.slice(0, -2)}AA`;
    expect(decryptTotpSecret(parts.join(':'))).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)('Ikki bosqichli kirish (integratsion)', () => {
  let token: string;
  let email: string;
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    const created = await createUserWithToken(app, { role: 'OWNER', email: 'owner-2fa@test.uz' });
    ({ token } = created);
    email = created.user.email;
    userId = created.user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Yoqadi; sir va tiklash kodlarini qaytaradi */
  async function enable(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(token)).send({ password: DEFAULT_PASSWORD });
    expect(setup.status).toBe(200);
    const secret = setup.body.data.secret as string;
    // Hozirgi qadamdan bittasi oldingisi bilan — keyingi testlarda hozirgi va keyingi kodlar bo'sh qoladi
    const enabled = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: totpCode(secret, totpStep() - 1) });
    expect(enabled.status).toBe(200);
    return { secret, recoveryCodes: enabled.body.data.recoveryCodes as string[] };
  }
  const login = () => request(app).post('/api/auth/login').send({ email, password: DEFAULT_PASSWORD });

  it('sozlash: parol shart, QR havolasi; noto‘g‘ri kod — yoqilmaydi; to‘g‘ri kod — 10 ta tiklash kodi', async () => {
    expect((await request(app).post('/api/auth/2fa/setup').set(bearer(token)).send({ password: 'notogri' })).status).toBe(422);
    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(token)).send({ password: DEFAULT_PASSWORD }).expect(200);
    expect(setup.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpPendingSecret: true, totpEnabledAt: true } });
    expect(stored.totpPendingSecret).not.toContain(setup.body.data.secret);
    expect(stored.totpEnabledAt).toBeNull();

    expect((await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: '000000' })).status).toBe(422);
    const enabled = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: totpCode(setup.body.data.secret, totpStep()) }).expect(200);
    expect(enabled.body.data.recoveryCodes).toHaveLength(10);
    expect(enabled.body.data.recoveryCodes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await request(app).get('/api/auth/2fa').set(bearer(token))).body.data).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.data.twoFactorEnabled).toBe(true);
    // Tiklash kodlari bazada ochiq holda yo'q
    const hashes = await prisma.userRecoveryCode.findMany({ where: { userId }, select: { codeHash: true } });
    expect(hashes.some((row) => enabled.body.data.recoveryCodes.includes(row.codeHash))).toBe(false);
  });

  it('kirish: paroldan keyin sessiya va cookie yo‘q, tasdiqlash tokeni access token emas; kod bilan — sessiya; kod qayta ishlamaydi', async () => {
    const { secret } = await enable();
    const first = await login().expect(200);
    expect(first.body.data).toMatchObject({ twoFactorRequired: true });
    expect(first.body.data.accessToken).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();
    expect((await request(app).get('/api/auth/me').set(bearer(first.body.data.challengeToken))).status).toBe(401);

    const code = totpCode(secret, totpStep());
    const done = await request(app).post('/api/auth/login/2fa').send({ challengeToken: first.body.data.challengeToken, code }).expect(200);
    expect(done.body.data.accessToken).toEqual(expect.any(String));
    expect(String(done.headers['set-cookie'])).toContain('HttpOnly');

    const again = await login().expect(200);
    expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: again.body.data.challengeToken, code })).status).toBe(422);
    expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: 'x'.repeat(40), code })).status).toBe(401);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.login', userId }, orderBy: { createdAt: 'desc' } });
    expect(audit?.metadata).toMatchObject({ twoFactor: 'totp' });
  });

  it('tiklash kodi bir marta ishlaydi', async () => {
    const { recoveryCodes } = await enable();
    const challenge = (await login()).body.data.challengeToken;
    await request(app).post('/api/auth/login/2fa').send({ challengeToken: challenge, code: recoveryCodes[0]!.toLowerCase() }).expect(200);
    const challenge2 = (await login()).body.data.challengeToken;
    expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: challenge2, code: recoveryCodes[0] })).status).toBe(422);
    expect((await request(app).get('/api/auth/2fa').set(bearer(token))).body.data.recoveryCodesLeft).toBe(9);
  });

  it('5 ta noto‘g‘ri koddan keyin to‘g‘ri kod ham 15 daqiqa qabul qilinmaydi; parol almashsa tasdiqlash tokeni yaroqsiz', async () => {
    const { secret } = await enable();
    const challenge = (await login()).body.data.challengeToken;
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: challenge, code: '000000' })).status).toBe(422);
    }
    expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: challenge, code: totpCode(secret, totpStep()) })).status).toBe(429);

    await prisma.auditLog.deleteMany({ where: { action: 'auth.2fa_failed' } });
    const stale = (await login()).body.data.challengeToken;
    await prisma.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date(Date.now() + 5_000) } });
    expect((await request(app).post('/api/auth/login/2fa').send({ challengeToken: stale, code: totpCode(secret, totpStep()) })).status).toBe(401);
  });

  it('o‘chirish: parol + kod; admin boshqa xodimning 2FA sini tiklaydi (sessiyalari yopiladi)', async () => {
    const { secret } = await enable();
    expect((await request(app).post('/api/auth/2fa/disable').set(bearer(token)).send({ password: DEFAULT_PASSWORD, code: '000000' })).status).toBe(422);
    await request(app).post('/api/auth/2fa/disable').set(bearer(token)).send({ password: DEFAULT_PASSWORD, code: totpCode(secret, totpStep()) }).expect(200);
    expect((await login()).body.data.accessToken).toEqual(expect.any(String));
    expect(await prisma.userRecoveryCode.count({ where: { userId } })).toBe(0);

    await enable();
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'super-2fa@test.uz' });
    const reset = await request(app).post(`/api/users/${userId}/2fa/reset`).set(bearer(admin));
    expect(reset.status).toBe(200);
    expect(reset.body.data.twoFactorEnabled).toBe(false);
    // Refresh sessiyalar yopiladi (access token o'z muddatigacha — parolni admin tiklagandagidek)
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    expect((await login()).body.data.accessToken).toEqual(expect.any(String));
    expect(await prisma.auditLog.count({ where: { action: 'user.2fa_reset_by_admin' } })).toBe(1);
    // O'zinikini admin sahifasidan emas
    expect((await request(app).post(`/api/users/${adminUser.id}/2fa/reset`).set(bearer(admin))).status).toBe(403);
  });
});
