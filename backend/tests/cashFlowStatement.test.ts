import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function seedReference() {
  await prisma.financialAccount.createMany({
    data: [
      { key: 'CASH', name: 'Naqd kassa', type: 'CASH', sortOrder: 1 },
      { key: 'BANK', name: 'Bank hisobi', type: 'BANK', sortOrder: 2 },
    ],
  });
  await prisma.incomeCategory.create({ data: { key: 'BOOKS', name: 'Kitoblar', sortOrder: 1 } });
  await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 1 } });
}

const account = (key: string) => prisma.financialAccount.findFirstOrThrow({ where: { key } });

describe.skipIf(!hasTestDatabase)('Pul oqimi hisoboti (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    ({ token } = await createUserWithToken(app, { role: 'ADMIN' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('boshlang‘ich va yakuniy qoldiq, kirim-chiqim tarkibi, kassalar kesimi va 30 kunlik prognoz', async () => {
    const books = await prisma.incomeCategory.findFirstOrThrow();
    const rent = await prisma.expenseCategory.findFirstOrThrow();
    const income = (amount: number, date: string) =>
      request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount, method: 'CASH', date });
    const expense = (amount: number, date: string) =>
      request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: rent.id, amount, method: 'CASH', date });

    // Davrdan oldin — boshlang'ich qoldiqni hosil qiladi
    expect((await income(2_000_000, '2026-07-20')).status).toBe(201);
    // Avgust harakatlari
    expect((await income(1_000_000, '2026-08-05')).status).toBe(201);
    expect((await expense(300_000, '2026-08-06')).status).toBe(201);
    const voided = await income(250_000, '2026-08-07');
    await request(app).post(`/api/incomes/${voided.body.data.id}/void`).set(bearer(token)).send({ reason: 'Xato kiritilgan' }).expect(200);
    const cash = await account('CASH');
    const bank = await account('BANK');
    await request(app)
      .post('/api/finance/transfers')
      .set(bearer(token))
      .send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 500_000, occurredAt: '2026-08-10' })
      .expect(201);

    // O'quv markaz vaqti bo'yicha 1-sentabr 01:00 — avgustga kirmaydi
    await prisma.transaction.create({
      data: { type: 'EXPENSE', amount: 100_000, accountId: cash.id, occurredAt: new Date('2026-08-31T20:00:00.000Z'), entityType: 'expense' },
    });
    await prisma.financialAccount.update({ where: { id: cash.id }, data: { balance: { decrement: 100_000 } } });
    expect((await expense(200_000, '2026-09-03')).status).toBe(201);

    const august = await request(app).get('/api/finance/cash-flow/statement').query({ from: '2026-08-01', to: '2026-08-31' }).set(bearer(token));
    expect(august.status).toBe(200);
    expect(august.body.data).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
      openingBalance: 2_000_000,
      closingBalance: 2_700_000,
      netChange: 700_000,
      operatingNet: 700_000,
      unassigned: 0,
      inflow: { studentPayments: 0, otherIncome: 1_000_000, transfers: 500_000, other: 0, total: 1_500_000 },
      outflow: { expenses: 300_000, salaries: 0, refunds: 0, transfers: 500_000, other: 0, total: 800_000 },
    });
    const byKey = (rows: Array<{ name: string }>, name: string) => rows.find((row) => row.name === name);
    expect(byKey(august.body.data.accounts, 'Naqd kassa')).toMatchObject({ opening: 2_000_000, inflow: 1_000_000, outflow: 800_000, closing: 2_200_000 });
    expect(byKey(august.body.data.accounts, 'Bank hisobi')).toMatchObject({ opening: 0, inflow: 500_000, outflow: 0, closing: 500_000 });

    const september = await request(app).get('/api/finance/cash-flow/statement').query({ from: '2026-09-01', to: '2026-09-30' }).set(bearer(token));
    expect(september.body.data).toMatchObject({ openingBalance: 2_700_000, closingBalance: 2_400_000, outflow: { expenses: 300_000 } });

    // Grafik nuqtasi haqiqiy kassa qoldig'ini ham beradi
    const monthly = await request(app).get('/api/finance/cash-flow').query({ period: 'month', from: '2026-08-01', to: '2026-08-31' }).set(bearer(token));
    expect(monthly.body.data).toEqual([expect.objectContaining({ label: 'Avg', income: 1_000_000, expense: 300_000, cashBalance: 2_700_000 })]);
  });

  it('prognoz: 30 kun ichidagi kutilayotgan xarajatlar va to‘lanmagan maoshlar hozirgi qoldiqdan ayriladi', async () => {
    const books = await prisma.incomeCategory.findFirstOrThrow();
    const rent = await prisma.expenseCategory.findFirstOrThrow();
    await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount: 3_000_000, method: 'CASH' }).expect(201);

    const day = 86_400_000;
    await prisma.expense.createMany({
      data: [
        { categoryId: rent.id, amount: 400_000, spentAt: new Date(Date.now() + 5 * day), status: 'UPCOMING' },
        { categoryId: rent.id, amount: 150_000, spentAt: new Date(Date.now() - 2 * day), status: 'APPROVED' },
        { categoryId: rent.id, amount: 999_000, spentAt: new Date(Date.now() + 60 * day), status: 'UPCOMING' },
        { categoryId: rent.id, amount: 777_000, spentAt: new Date(Date.now() + 3 * day), status: 'REJECTED' },
      ],
    });

    const response = await request(app).get('/api/finance/cash-flow/statement').set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.data.forecast).toMatchObject({
      days: 30,
      currentBalance: 3_000_000,
      upcomingExpenses: 550_000,
      upcomingExpenseCount: 2,
      unpaidSalaries: 0,
      receivables: 0,
      projectedBalance: 2_450_000,
    });

    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    expect((await request(app).get('/api/finance/cash-flow/statement').set(bearer(teacher))).status).toBe(403);
  });
});
