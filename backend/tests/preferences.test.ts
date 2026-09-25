import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('Shaxsiy sozlamalar: dashboard vidjetlari (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('har bir xodim o‘z tartibini saqlaydi; kalit va qiymat qat’iy tekshiriladi', async () => {
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    const { token: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });

    const empty = await request(app).get('/api/auth/me/preferences').set(bearer(owner));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({});

    const layout = { order: ['charts', 'kpis', 'activity'], hidden: ['managers'] };
    const saved = await request(app).put('/api/auth/me/preferences/dashboard.layout').set(bearer(owner)).send(layout);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual(layout);

    // Qayta saqlash — yangilanadi, yangi yozuv qo'shilmaydi
    await request(app).put('/api/auth/me/preferences/dashboard.layout').set(bearer(owner)).send({ order: ['kpis'], hidden: [] }).expect(200);
    expect(await prisma.userPreference.count()).toBe(1);
    expect((await request(app).get('/api/auth/me/preferences').set(bearer(owner))).body.data).toEqual({ 'dashboard.layout': { order: ['kpis'], hidden: [] } });

    // Boshqa xodim ko'rmaydi
    expect((await request(app).get('/api/auth/me/preferences').set(bearer(manager))).body.data).toEqual({});

    expect((await request(app).put('/api/auth/me/preferences/theme.secret').set(bearer(owner)).send(layout)).status).toBe(422);
    expect((await request(app).put('/api/auth/me/preferences/dashboard.layout').set(bearer(owner)).send({ order: ['kpis', 'kpis'], hidden: [] })).status).toBe(422);
    expect((await request(app).put('/api/auth/me/preferences/dashboard.layout').set(bearer(owner)).send({ order: [], hidden: [], extra: 1 })).status).toBe(422);
    expect((await request(app).get('/api/auth/me/preferences')).status).toBe(401);
  });

  it('jadval ustunlari (GAP-03): har xodimga alohida, qat’iy tekshiruv; faqat ko‘rinish — API javobi o‘zgarmaydi', async () => {
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner2@test.uz' });
    const { token: other } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin2@test.uz' });
    const layout = { columns: [{ key: 'name', visible: true, width: 240 }, { key: 'phone', visible: false }, { key: 'status', visible: true, width: null }] };

    const saved = await request(app).put('/api/auth/me/preferences/table.students.columns').set(bearer(owner)).send(layout);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual(layout);
    expect((await request(app).get('/api/auth/me/preferences').set(bearer(owner))).body.data['table.students.columns']).toEqual(layout);
    expect((await request(app).get('/api/auth/me/preferences').set(bearer(other))).body.data).toEqual({});

    const invalid = [
      { columns: [{ key: 'name', visible: true }, { key: 'name', visible: false }] },
      { columns: [{ key: 'name', visible: true, width: 10 }] },
      { columns: [{ key: 'name', visible: true, width: 5000 }] },
      { columns: [{ key: '../x', visible: true }] },
      { columns: [{ key: 'name', visible: 'ha' }] },
      { columns: [{ key: 'name', visible: true, secret: 1 }] },
      { columns: [], extra: true },
      { columns: Array.from({ length: 41 }, (_, index) => ({ key: `c${index}`, visible: true })) },
    ];
    for (const body of invalid) {
      expect((await request(app).put('/api/auth/me/preferences/table.students.columns').set(bearer(owner)).send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(422);
    }
    // Ro'yxatda yo'q jadval kaliti
    expect((await request(app).put('/api/auth/me/preferences/table.salaries.columns').set(bearer(owner)).send(layout)).status).toBe(422);

    // Xavfsizlik: ustun yashirilgani ma'lumotni yashirmaydi va ochmaydi — javob sozlamaga bog'liq emas
    const students = await request(app).get('/api/students').set(bearer(owner));
    expect(students.status).toBe(200);
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher2@test.uz' });
    await request(app).put('/api/auth/me/preferences/table.payments.columns').set(bearer(teacher)).send({ columns: [{ key: 'amount', visible: true }] }).expect(200);
    // Sozlama saqlash ruxsat bermaydi: o'qituvchi to'lovlarni ko'ra olmaydi
    expect((await request(app).get('/api/payments').set(bearer(teacher))).status).toBe(403);
  });
});
