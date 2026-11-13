import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { businessDateString } from '../src/utils/dates.js';
import { addMonthsClamped } from '../src/utils/paymentSchedule.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();
const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

describe.skipIf(!hasTestDatabase)('O‘quvchi qarzi — faqat to‘lov kuni o‘tgan oylar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ro‘yxat va profil: kelgusi oylar qarz emas; to‘lov kunidan keyingi kundan oy to‘liq qarz, kechikkan kunlar bilan', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@due.uz' });
    const course = await createCourse('Frontend');
    const today = businessDateString(new Date());
    const current = today.slice(0, 7);
    const previous = addMonthsClamped(`${current}-01`, -1).slice(0, 7);
    const dueToday = today === `${current}-01`;

    const create = (phone: string, firstName: string) =>
      request(app)
        .post('/api/students')
        .set(bearer(token))
        .send({ firstName, lastName: 'Test', phone, courseId: course.id, contractPrice: 500_000, startDate: `${previous}-01` });
    const paidOne = await create('+998901110001', 'Tolagan');
    const unpaid = await create('+998901110002', 'Tolamagan');
    expect([paidOne.status, unpaid.status]).toEqual([201, 201]);

    // O'tgan oy to'langan: joriy oy (1-sanasi o'tgan bo'lsa) qarz, qolgan 4 oy — shartnoma qoldig'i, qarz emas
    const payment = await request(app).post('/api/payments').set(bearer(token)).send({ studentId: paidOne.body.data.id, amount: 500_000, method: 'CASH' });
    expect(payment.status).toBe(201);

    const list = await request(app).get('/api/students').set(bearer(token)).query({ limit: 50 });
    expect(list.status).toBe(200);
    const byName = new Map((list.body.data as Array<{ firstName: string; debt: Record<string, number> }>).map((row) => [row.firstName, row.debt]));

    expect(byName.get('Tolagan')).toMatchObject({
      total: 3_000_000,
      paid: 500_000,
      remaining: 2_500_000,
      due: dueToday ? 0 : 500_000,
      overdueDays: dueToday ? 0 : daysBetween(`${current}-01`, today),
    });
    expect(byName.get('Tolamagan')).toMatchObject({
      remaining: 3_000_000,
      due: dueToday ? 500_000 : 1_000_000,
      overdueDays: daysBetween(`${previous}-01`, today),
    });

    const profile = await request(app).get(`/api/students/${unpaid.body.data.id}`).set(bearer(token));
    expect(profile.body.data.debt.due).toBe(dueToday ? 500_000 : 1_000_000);
  });
});
