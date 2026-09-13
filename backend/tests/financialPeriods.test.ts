import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Yopiladigan (tugagan) oy */
const AUGUST = { year: 2026, month: 8 };

async function seedFinanceReference() {
  await prisma.financialAccount.createMany({
    data: [
      { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 5_000_000, sortOrder: 1 },
      { key: 'BANK', name: 'Bank hisobi', type: 'BANK', balance: 10_000_000, sortOrder: 2 },
    ],
  });
  await prisma.incomeCategory.create({ data: { key: 'BOOKS', name: 'Kitob va qo‘llanma', sortOrder: 2 } });
  await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 3 } });
}

async function enroll() {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  return prisma.student.create({
    data: {
      firstName: 'Avgust',
      lastName: 'To‘lovchi',
      phone: '+998971234567',
      courseId: course.id,
      groupId: group.id,
      contractPrice: 2_000_000,
      startDate: new Date('2026-08-01'),
      debt: { create: { totalAmount: 2_000_000, remainingAmount: 2_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Moliyaviy oyni yopish (integratsion)', () => {
  let accountant: string;
  let rentId: string;
  let booksId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedFinanceReference();
    ({ token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
    rentId = (await prisma.expenseCategory.findFirstOrThrow({ where: { key: 'RENT' } })).id;
    booksId = (await prisma.incomeCategory.findFirstOrThrow({ where: { key: 'BOOKS' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const close = (token: string, body: Record<string, unknown>) => request(app).post('/api/finance/periods/close').set(bearer(token)).send(body);

  it('tugagan oy yopiladi; yopilgan oyga yozuv qo‘shilmaydi va bekor qilinmaydi, tuzatish ochiq oyda', async () => {
    const rent = await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rentId, amount: 500_000, method: 'CASH', date: '2026-08-05' });
    expect(rent.status).toBe(201);
    await request(app).post('/api/incomes').set(bearer(accountant)).send({ categoryId: booksId, amount: 200_000, method: 'CASH', date: '2026-08-06' }).expect(201);
    const student = await enroll();
    const payment = await request(app)
      .post('/api/payments')
      .set(bearer(accountant))
      .send({ studentId: student.id, amount: 300_000, method: 'CASH', paidAt: '2026-08-10T09:00:00.000Z' });
    expect(payment.status).toBe(201);

    expect((await close(accountant, currentBusinessMonth())).status).toBe(422);

    const closed = await close(accountant, AUGUST);
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'CLOSED', canClose: false, totals: { income: 500_000, expense: 500_000, refunds: 0, net: 0 } });
    expect((await close(accountant, AUGUST)).status).toBe(409);

    const stored = await prisma.financialPeriod.findUniqueOrThrow({ where: { year_month: AUGUST } });
    expect(stored.summary).toMatchObject({ income: 500_000, expense: 500_000 });
    expect((stored.summary as { balances: unknown[] }).balances).toHaveLength(2);

    // Yopilgan oy sanasi bilan hech narsa qo'shilmaydi va bekor qilinmaydi
    expect((await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rentId, amount: 100_000, method: 'CASH', date: '2026-08-20' })).status).toBe(409);
    expect(
      (await request(app).post('/api/payments').set(bearer(accountant)).send({ studentId: student.id, amount: 100_000, method: 'CASH', paidAt: '2026-08-15T09:00:00.000Z' })).status,
    ).toBe(409);
    expect((await request(app).post(`/api/expenses/${rent.body.data.id}/void`).set(bearer(accountant)).send({ reason: 'Xato kiritilgan' })).status).toBe(409);
    const cancel = await request(app).delete(`/api/payments/${payment.body.data.id}`).set(bearer(accountant)).send({ reason: 'Xato kiritilgan' });
    expect(cancel.status).toBe(409);
    expect(cancel.body.message).toContain('yopilgan');
    const cash = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'CASH' } });
    const bank = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'BANK' } });
    expect(
      (await request(app).post('/api/finance/transfers').set(bearer(accountant)).send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 1_000, occurredAt: '2026-08-25' })).status,
    ).toBe(409);

    // Tuzatish ochiq oyda: yangi xarajat va avgust to'lovini qaytarish
    expect((await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rentId, amount: 100_000, method: 'CASH' })).status).toBe(201);
    expect(
      (await request(app).post(`/api/payments/${payment.body.data.id}/refunds`).set(bearer(accountant)).send({ amount: 100_000, method: 'CASH', reason: 'Avgust to‘lovidan qaytarish' })).status,
    ).toBe(200);

    const list = await request(app).get('/api/finance/periods').query({ year: 2026 }).set(bearer(accountant));
    expect(list.body.data).toHaveLength(12);
    expect(list.body.data[7]).toMatchObject({ month: 8, status: 'CLOSED', closedBy: { firstName: expect.any(String) } });
    expect(list.body.data[6]).toMatchObject({ month: 7, status: 'OPEN', canClose: true });
    const now = currentBusinessMonth();
    if (now.year === 2026) {
      expect(list.body.data[now.month - 1]).toMatchObject({ isCurrent: true, canClose: false });
    }
  });

  it('qayta ochish faqat rahbar ruxsati va sabab bilan; audit yoziladi', async () => {
    await close(accountant, AUGUST).expect(200);
    const reopenUrl = '/api/finance/periods/reopen';

    expect((await request(app).post(reopenUrl).set(bearer(accountant)).send({ ...AUGUST, reason: 'Hujjat kech keldi' })).status).toBe(403);
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    expect((await request(app).post(reopenUrl).set(bearer(owner)).send(AUGUST)).status).toBe(422);

    const reopened = await request(app).post(reopenUrl).set(bearer(owner)).send({ ...AUGUST, reason: 'Avgust ijara hujjati kech keldi' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toMatchObject({ status: 'OPEN', reopenReason: 'Avgust ijara hujjati kech keldi', canClose: true });
    expect(await prisma.auditLog.count({ where: { action: 'finance.period_closed' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'finance.period_reopened' } })).toBe(1);

    expect((await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rentId, amount: 100_000, method: 'CASH', date: '2026-08-20' })).status).toBe(201);

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await close(sales, { year: 2026, month: 7 })).status).toBe(403);
  });
});
