import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { addDays, businessDateString, startOfBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function seedReference() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 5_000_000, sortOrder: 1 } });
  await prisma.incomeCategory.createMany({
    data: [
      { key: 'STUDENT_PAYMENT', name: 'O‘quvchi to‘lovi', isSystem: true },
      { key: 'BOOKS', name: 'Kitoblar' },
    ],
  });
  await prisma.expenseCategory.createMany({
    data: [
      { key: 'TEACHER_SALARY', name: 'O‘qituvchi maoshi', isSystem: true },
      { key: 'RENT', name: 'Ijara' },
    ],
  });
}

describe.skipIf(!hasTestDatabase)('Foyda va zarar hisoboti (integratsion)', () => {
  let accountant: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    ({ token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sof tushum qaytarishni ayiradi; yalpi va sof foyda, marja va oldingi davr bilan solishtirish', async () => {
    const monthStart = startOfBusinessMonth();
    const from = businessDateString(monthStart);
    const to = businessDateString(new Date());
    const previousDay = businessDateString(addDays(monthStart, -1));

    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await prisma.student.create({
      data: {
        firstName: 'Aziza',
        lastName: 'Foydali',
        phone: '+998951112233',
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-01-10'),
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
      },
    });
    const payment = await request(app).post('/api/payments').set(bearer(accountant)).send({ studentId: student.id, amount: 1_000_000, method: 'CASH' });
    expect(payment.status).toBe(201);
    await request(app)
      .post(`/api/payments/${payment.body.data.id}/refunds`)
      .set(bearer(accountant))
      .send({ amount: 200_000, method: 'CASH', reason: 'Kursni erta tugatdi' })
      .expect(200);

    const category = async (model: 'income' | 'expense', key: string) =>
      model === 'income'
        ? (await prisma.incomeCategory.findFirstOrThrow({ where: { key } })).id
        : (await prisma.expenseCategory.findFirstOrThrow({ where: { key } })).id;
    const books = await category('income', 'BOOKS');
    await request(app).post('/api/incomes').set(bearer(accountant)).send({ categoryId: books, amount: 300_000, method: 'CASH' }).expect(201);
    await request(app).post('/api/incomes').set(bearer(accountant)).send({ categoryId: books, amount: 500_000, method: 'CASH', date: previousDay }).expect(201);
    await request(app)
      .post('/api/expenses')
      .set(bearer(accountant))
      .send({ categoryId: await category('expense', 'TEACHER_SALARY'), amount: 400_000, method: 'CASH' })
      .expect(201);
    await request(app)
      .post('/api/expenses')
      .set(bearer(accountant))
      .send({ categoryId: await category('expense', 'RENT'), amount: 150_000, method: 'CASH' })
      .expect(201);

    const response = await request(app).get('/api/finance/profit-loss').query({ from, to }).set(bearer(accountant));
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.revenue).toMatchObject({
      studentPayments: 1_000_000,
      refunds: 200_000,
      netStudentRevenue: 800_000,
      otherIncomeTotal: 300_000,
      netRevenue: 1_100_000,
    });
    expect(data.revenue.otherIncome).toEqual([{ name: 'Kitoblar', amount: 300_000, share: 27 }]);
    expect(data).toMatchObject({
      directCosts: { teacherSalaries: 400_000, total: 400_000 },
      grossProfit: 700_000,
      grossMargin: 64,
      operatingExpenses: { lines: [{ name: 'Ijara', amount: 150_000, share: 14 }], total: 150_000 },
      netProfit: 550_000,
      netMargin: 50,
      previous: { to: previousDay, netRevenue: 500_000, netProfit: 500_000 },
      change: { netRevenue: 120, netProfit: 10 },
    });
    expect(data.months).toHaveLength(1);
    expect(data.months[0]).toMatchObject({ netRevenue: 1_100_000, directCosts: 400_000, operatingExpenses: 150_000, netProfit: 550_000 });

    // Moliya paneli va dashboard ham sof tushumni ko'rsatadi
    const summary = await request(app).get('/api/finance/summary').query({ from, to }).set(bearer(accountant));
    expect(summary.body.data).toMatchObject({ income: 1_100_000, refunds: 200_000, expense: 550_000, netProfit: 550_000, studentPayments: 800_000 });

    const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    const dashboard = await request(app).get('/api/dashboard/summary').set(bearer(owner));
    expect(dashboard.body.data.finance).toMatchObject({ todayRevenue: 800_000, monthRevenue: 800_000 });

    const profitReport = await request(app).get('/api/reports/profit').query({ from, to, groupBy: 'month' }).set(bearer(owner));
    expect(profitReport.status).toBe(200);
    expect(profitReport.body.data.rows[0]).toMatchObject({ grossIncome: 1_300_000, refunds: 200_000, income: 1_100_000, expense: 550_000, profit: 550_000 });

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await request(app).get('/api/finance/profit-loss').set(bearer(sales))).status).toBe(403);
  });
});
