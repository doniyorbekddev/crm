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

async function monthsOf(studentId: string) {
  const rows = await prisma.paymentInstallment.findMany({ where: { studentId, cancelledAt: null }, orderBy: { dueDate: 'asc' } });
  return rows.map((row) => [row.dueDate.toISOString().slice(0, 7), row.amount.toNumber()]);
}

describe.skipIf(!hasTestDatabase)('Chegirma — oy to‘langandan keyin ham beriladi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('joriy oy eski narxda to‘liq to‘langan: chegirma rad etilmaydi, to‘langan oy eski narxda qoladi, keyingi oylar arzonlashadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@discount.uz' });
    const course = await createCourse('PMT Matematika');
    const current = businessDateString(new Date()).slice(0, 7);
    const next = addMonthsClamped(`${current}-01`, 1).slice(0, 7);
    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send({ firstName: 'MuhammadIso', lastName: 'Sinov', phone: '+998901112221', courseId: course.id, contractPrice: 345_000, startDate: `${current}-01` });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const paid = await request(app).post('/api/payments').set(bearer(token)).send({ studentId: id, amount: 345_000, method: 'CASH' });
    expect(paid.status).toBe(201);

    const granted = await request(app).post(`/api/discounts/students/${id}`).set(bearer(token)).send({ valueType: 'AMOUNT', value: 34_500, note: 'Ikkinchi farzand' });
    expect(granted.status).toBe(200);

    const months = await monthsOf(id);
    expect(months[0]).toEqual([current, 345_000]);
    expect(months[1]).toEqual([next, 310_500]);
    expect(months.slice(1).every(([, amount]) => amount === 310_500)).toBe(true);
    const student = await prisma.student.findUniqueOrThrow({ where: { id }, include: { debt: true } });
    expect(student.contractPrice.toNumber()).toBe(310_500);
    expect(student.debt!.totalAmount.toNumber()).toBe(345_000 + 310_500 * (months.length - 1));
  });

  it('joriy oy to‘lanmagan bo‘lsa — u ham yangi narxga o‘tadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER', email: 'owner2@discount.uz' });
    const course = await createCourse('PMT Ingliz tili');
    const current = businessDateString(new Date()).slice(0, 7);
    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send({ firstName: 'Tolamagan', lastName: 'Sinov', phone: '+998901112222', courseId: course.id, contractPrice: 345_000, startDate: `${current}-01` });
    const id = created.body.data.id as string;
    expect((await request(app).post(`/api/discounts/students/${id}`).set(bearer(token)).send({ valueType: 'AMOUNT', value: 34_500, note: 'Ikkinchi farzand' })).status).toBe(200);
    const months = await monthsOf(id);
    expect(months.every(([, amount]) => amount === 310_500)).toBe(true);
  });
});
