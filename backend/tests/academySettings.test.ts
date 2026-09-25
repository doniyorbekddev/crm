import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { resolveStoredPath } from '../src/utils/fileStorage.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** TZ 3.1 GAP-01 — umumiy "Markaz ma'lumotlari" */
const app = createApp();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 3)]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

const WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => ({
  day,
  isOpen: day !== 'SUNDAY',
  from: '09:00',
  to: day === 'SATURDAY' ? '14:00' : '19:00',
}));

function valid(overrides: Record<string, unknown> = {}) {
  return {
    name: 'IT-Academy Chilonzor',
    phone: '+998 90 123 45 67',
    email: 'Info@IT-Academy.uz',
    address: 'Toshkent, Chilonzor 9',
    workingHours: WEEK,
    currency: 'UZS',
    academicYear: { start: '2026-09-01', end: '2027-06-30' },
    timezone: 'Asia/Tashkent',
    defaultLanguage: 'uz',
    ...overrides,
  };
}

function uploadLogo(token: string, body: Buffer) {
  return request(app).post('/api/settings/academy/logo').set(bearer(token)).set('Content-Type', 'application/octet-stream').send(body);
}

describe.skipIf(!hasTestDatabase)('Markaz ma’lumotlari (GAP-01)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('faqat OWNER va SUPER_ADMIN; ADMIN, o‘qituvchi, sotuv, call-center, buxgalter — 403; tokensiz — 401', async () => {
    expect((await request(app).get('/api/settings/academy')).status).toBe(401);
    for (const role of ['ADMIN', 'TEACHER', 'SALES_MANAGER', 'CALL_CENTER', 'ACCOUNTANT'] as const) {
      const { token } = await createUserWithToken(app, { role });
      expect((await request(app).get('/api/settings/academy').set(bearer(token))).status, role).toBe(403);
      expect((await request(app).put('/api/settings/academy').set(bearer(token)).send(valid())).status, role).toBe(403);
      expect((await uploadLogo(token, PNG)).status, role).toBe(403);
    }
    for (const role of ['OWNER', 'SUPER_ADMIN'] as const) {
      const { token } = await createUserWithToken(app, { role });
      expect((await request(app).put('/api/settings/academy').set(bearer(token)).send(valid({ name: `Markaz ${role}` }))).status, role).toBe(200);
    }
  });

  it('saqlanmagan bo‘lsa standart qiymatlar; saqlangach qiymatlar normallashtiriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const initial = await request(app).get('/api/settings/academy').set(bearer(token));
    expect(initial.status).toBe(200);
    expect(initial.body.data).toMatchObject({ configured: false, currency: 'UZS', timezone: 'Asia/Tashkent', defaultLanguage: 'uz', logoUrl: null });
    expect(initial.body.data.workingHours).toHaveLength(7);

    const saved = await request(app).put('/api/settings/academy').set(bearer(token)).send(valid());
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ configured: true, name: 'IT-Academy Chilonzor', phone: '+998901234567', email: 'info@it-academy.uz' });
    expect(saved.body.data.updatedBy).toMatchObject({ firstName: expect.any(String) });
  });

  it('har o‘zgarish auditda: kim, oldingi va yangi qiymat, IP, brauzer; muhim amal sifatida', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'OWNER' });
    await request(app).put('/api/settings/academy').set(bearer(token)).set('User-Agent', 'vitest-agent').send(valid());
    await request(app).put('/api/settings/academy').set(bearer(token)).set('User-Agent', 'vitest-agent').send(valid({ name: 'Yangi nom', address: 'Yunusobod 4' }));

    const logs = await prisma.auditLog.findMany({ where: { action: 'settings.academy_updated' }, orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ userId: user.id, entityType: 'settings', entityId: 'academy.profile', before: null, userAgent: 'vitest-agent' });
    expect(logs[1]!.before).toMatchObject({ name: 'IT-Academy Chilonzor', address: 'Toshkent, Chilonzor 9' });
    expect(logs[1]!.after).toMatchObject({ name: 'Yangi nom', address: 'Yunusobod 4' });
    expect(logs[1]!.ip).toBeTruthy();
    const { AUDIT_CRITICAL_ACTIONS } = await import('../src/config/auditLabels.js');
    expect(AUDIT_CRITICAL_ACTIONS).toContain('settings.academy_updated');
  });

  it('validatsiya: vaqt, kunlar, o‘quv yili, vaqt mintaqasi, valyuta, noma’lum maydon — 422; hech narsa yozilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const invalid = [
      valid({ name: 'A' }),
      valid({ workingHours: WEEK.slice(0, 6) }),
      valid({ workingHours: [...WEEK.slice(0, 6), { ...WEEK[0]! }] }),
      valid({ workingHours: WEEK.map((row) => (row.day === 'MONDAY' ? { ...row, from: '18:00', to: '09:00' } : row)) }),
      valid({ workingHours: WEEK.map((row) => (row.day === 'MONDAY' ? { ...row, from: '25:00' } : row)) }),
      valid({ academicYear: { start: '2027-06-30', end: '2026-09-01' } }),
      valid({ timezone: 'Mars/Olympus' }),
      // Qo'llab-quvvatlanmaydigan valyuta/til yoqilgan deb ko'rsatilmaydi
      valid({ currency: 'USD' }),
      valid({ defaultLanguage: 'ru' }),
      valid({ email: 'emas' }),
      valid({ logo: { path: '../../etc/passwd' } }),
    ];
    for (const body of invalid) {
      const response = await request(app).put('/api/settings/academy').set(bearer(token)).send(body);
      expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(422);
    }
    // Yopiq kunda vaqt tartibi tekshirilmaydi
    const closedDay = WEEK.map((row) => (row.day === 'SUNDAY' ? { ...row, from: '18:00', to: '09:00' } : row));
    expect((await request(app).put('/api/settings/academy').set(bearer(token)).send(valid({ workingHours: closedDay }))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'settings.academy_updated' } })).toBe(1);
  });

  it('logo: PNG/JPG qabul, PDF va matn rad; almashtirilganda eski fayl o‘chadi; ochiq brend endpointi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    await request(app).put('/api/settings/academy').set(bearer(token)).send(valid());

    expect((await uploadLogo(token, PDF)).status).toBe(422);
    expect((await uploadLogo(token, Buffer.from('oddiy matn'))).status).toBe(422);
    expect((await uploadLogo(token, Buffer.alloc(0))).status).toBe(422);

    const first = await uploadLogo(token, PNG);
    expect(first.status).toBe(200);
    expect(first.body.data.logoUrl).toMatch(/^\/public\/branding\/logo\?v=/);
    const firstPath = ((await prisma.setting.findUniqueOrThrow({ where: { key: 'academy.profile' } })).value as { logo: { path: string } }).logo.path;
    expect(existsSync(resolveStoredPath(firstPath))).toBe(true);

    // Brend — tokensiz; telefon, manzil, email qaytarilmaydi
    const branding = await request(app).get('/api/public/branding');
    expect(branding.status).toBe(200);
    expect(branding.body.data).toEqual({ name: 'IT-Academy Chilonzor', logoUrl: first.body.data.logoUrl, currency: 'UZS', defaultLanguage: 'uz' });
    const image = await request(app).get('/api/public/branding/logo');
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('public');

    // Almashtirish: saqlashda logo yo'qolmaydi, eski fayl o'chiriladi
    const second = await uploadLogo(token, JPG);
    expect(second.body.data.logoUrl).not.toBe(first.body.data.logoUrl);
    expect(existsSync(resolveStoredPath(firstPath))).toBe(false);
    const resaved = await request(app).put('/api/settings/academy').set(bearer(token)).send(valid({ name: 'Boshqa' }));
    expect(resaved.body.data.logoUrl).toBe(second.body.data.logoUrl);
    expect((await request(app).get('/api/public/branding/logo')).headers['content-type']).toBe('image/jpeg');

    const removed = await request(app).delete('/api/settings/academy/logo').set(bearer(token));
    expect(removed.body.data.logoUrl).toBeNull();
    expect((await request(app).get('/api/public/branding/logo')).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: { in: ['settings.academy_logo_updated', 'settings.academy_logo_removed'] } } })).toBe(3);
  });

  it('bazadagi buzilgan qiymat ilovani yiqitmaydi — faqat to‘g‘ri maydonlar olinadi', async () => {
    const { user } = await createUserWithToken(app, { role: 'OWNER' });
    await prisma.setting.create({ data: { key: 'academy.profile', value: { name: 'Saqlangan', currency: 'EUR', workingHours: 'buzuq' }, updatedById: user.id } });
    const branding = await request(app).get('/api/public/branding');
    expect(branding.body.data).toMatchObject({ name: 'Saqlangan', currency: 'UZS' });
  });
});
