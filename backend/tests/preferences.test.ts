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
});
