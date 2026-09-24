import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { matchTool, normalizeQuestion } from '../src/services/ai/assistant.service.js';
import { AI_TOOLS } from '../src/services/ai/tools.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { DEFAULT_PASSWORD, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { hashPassword } from '../src/utils/password.js';

const app = createApp();

/**
 * Yordamchi faqat rahbar roliga bog'langan emas — ruxsat har bir tool darajasida tekshiriladi.
 * Shuning uchun testda cheklangan rol yaratamiz: AI ruxsati bor, lekin moliya ruxsati yo'q.
 */
async function createRestrictedUser(email: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  const role = await prisma.role.create({
    data: {
      key: `CUSTOM_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: 'Cheklangan rol',
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Cheklangan',
      lastName: 'Xodim',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      roleId: role.id,
      status: 'ACTIVE',
    },
  });
  return { user, token: await loginAs(app, email) };
}

describe('Savolni tanib olish', () => {
  it('apostrof va katta harf javobga ta’sir qilmaydi', () => {
    expect(normalizeQuestion('Bu oy O‘TGAN OYga qaraganda qanday?')).toBe("bu oy o'tgan oyga qaraganda qanday");
  });

  it('spec’dagi savollarni to‘g‘ri toolga yo‘naltiradi', () => {
    const cases: Array<[string, string]> = [
      ['Bugun qancha pul tushdi?', 'revenue_today'],
      ['Qancha qarzdor bor?', 'debt_summary'],
      ['Qaysi kurs eng ko‘p daromad keltiryapti?', 'top_courses_revenue'],
      ['Qaysi o‘quvchilar ketib qolish xavfida?', 'at_risk_students'],
      ['Qaysi manager eng ko‘p leadni studentga aylantirdi?', 'manager_conversion'],
      ['Marketing qaysi kanalda yaxshi ishlayapti?', 'marketing_channels'],
      ['Bu oy o‘tgan oyga qaraganda qanday?', 'period_comparison'],
      ['Omborda nima kam qoldi?', 'low_stock'],
      ['NPS qanday?', 'nps_summary'],
    ];
    for (const [question, expected] of cases) {
      expect(matchTool(question)?.tool.key, question).toBe(expected);
    }
  });

  it('bog‘liqsiz savolda tool tanlanmaydi', () => {
    expect(matchTool('Ob-havo qanday bugun ertaga')).toBeNull();
    expect(matchTool('a')).toBeNull();
  });

  it('har bir tool o‘z ruxsatini e’lon qiladi', () => {
    for (const tool of AI_TOOLS) {
      expect(tool.permission, tool.key).toBeTruthy();
      expect(tool.samples.length, tool.key).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasTestDatabase)('AI yordamchi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('savolga javob beradi va so‘rovni yozib qo‘yadi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

    const response = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Qancha qarzdor bor?' });

    expect(response.status).toBe(200);
    expect(response.body.data.answered).toBe(true);
    expect(response.body.data.tool.key).toBe('debt_summary');
    expect(response.body.data.answer).toContain('qarz');
    expect(response.body.data.link).toBe('/debts');

    const logged = await prisma.aiQuery.findMany({ where: { userId: user.id } });
    expect(logged).toHaveLength(1);
    expect(logged[0]!.toolKey).toBe('debt_summary');
  });

  it('ruxsati yetmasa ma’lumot oshkor qilinmaydi', async () => {
    // AI ruxsati bor, moliya ruxsati yo'q
    const { token } = await createRestrictedUser('cheklangan@local.uz', ['ai.assistant', 'attendance.view']);

    const response = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Bugun qancha pul tushdi?' });

    expect(response.status).toBe(200);
    expect(response.body.data.answered).toBe(false);
    expect(response.body.data.failure).toBe('Ruxsat yetarli emas');
    expect(response.body.data.answer).toContain('ruxsat');
    // Javobda hech qanday summa bo'lmasligi kerak
    expect(response.body.data.answer).not.toMatch(/\d{4,}/);
  });

  it('tushunilmagan savol taklif bilan qaytadi va yoziladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

    const response = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Ertaga ob-havo qanday bo‘ladi' });

    expect(response.body.data.answered).toBe(false);
    expect(response.body.data.failure).toBe('Savol tushunilmadi');
    expect(response.body.data.suggestions.length).toBeGreaterThan(0);

    const logged = await prisma.aiQuery.findFirstOrThrow({});
    expect(logged.toolKey).toBeNull();
    expect(logged.failure).toBe('Savol tushunilmadi');
  });

  it('takliflar faqat ruxsat doirasida ko‘rinadi', async () => {
    const { token } = await createRestrictedUser('cheklangan2@local.uz', ['ai.assistant', 'attendance.view']);

    const tools = await request(app).get('/api/ai/tools').set(bearer(token));

    expect(tools.status).toBe(200);
    const allowed = tools.body.data.filter((tool: { allowed: boolean }) => tool.allowed).map((tool: { key: string }) => tool.key);
    expect(allowed).toContain('attendance_summary');
    expect(allowed).not.toContain('revenue_today');
    expect(allowed).not.toContain('debt_summary');
  });

  it('AI ruxsati yo‘q xodim savol bera olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'CALL_CENTER' });
    await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Qancha qarzdor bor?' }).expect(403);
  });

  it('tarix faqat o‘z savollarini ko‘rsatadi', async () => {
    const first = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const second = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'ikkinchi@local.uz' });

    await request(app).post('/api/ai/ask').set(bearer(first.token)).send({ question: 'Qancha qarzdor bor?' }).expect(200);
    await request(app).post('/api/ai/ask').set(bearer(second.token)).send({ question: 'Davomat qanday?' }).expect(200);

    const history = await request(app).get('/api/ai/history').set(bearer(second.token));
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].question).toBe('Davomat qanday?');
  });
});
