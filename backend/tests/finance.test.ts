import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

let counter = 0;

/** Seedda bo‘ladigan kassalar va kategoriyalar testda ham kerak */
async function seedFinanceReference() {
  await prisma.financialAccount.createMany({
    data: [
      { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 5_000_000, sortOrder: 1 },
      { key: 'BANK', name: 'Bank hisobi', type: 'BANK', balance: 10_000_000, sortOrder: 2 },
      { key: 'CLICK', name: 'Click', type: 'CLICK', balance: 0, sortOrder: 3 },
    ],
  });
  await prisma.incomeCategory.createMany({
    data: [
      { key: 'STUDENT_PAYMENT', name: 'O‘quvchi to‘lovi', isSystem: true, sortOrder: 1 },
      { key: 'BOOKS', name: 'Kitob va qo‘llanma', sortOrder: 2 },
    ],
  });
  await prisma.expenseCategory.createMany({
    data: [
      { key: 'TEACHER_SALARY', name: 'O‘qituvchi maoshi', isSystem: true, sortOrder: 1 },
      { key: 'ADVERTISEMENT', name: 'Reklama', sortOrder: 2 },
      { key: 'RENT', name: 'Ijara', sortOrder: 3 },
    ],
  });
}

async function accountByKey(key: string) {
  return prisma.financialAccount.findFirstOrThrow({ where: { key }, select: { id: true, balance: true } });
}

async function categoryId(kind: 'income' | 'expense', key: string): Promise<string> {
  const category =
    kind === 'income'
      ? await prisma.incomeCategory.findFirstOrThrow({ where: { key }, select: { id: true } })
      : await prisma.expenseCategory.findFirstOrThrow({ where: { key }, select: { id: true } });
  return category.id;
}

async function enrollStudent() {
  counter += 1;
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(5_000_000 + counter)}`,
      courseId: course.id,
      groupId: group.id,
      contractPrice: 2_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 2_000_000, remainingAmount: 2_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Moliya (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedFinanceReference();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Tushum va xarajat', () => {
    it('tushum daftarga tushadi va kassa qoldig‘ini oshiradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const cash = await accountByKey('CASH');

      const response = await request(app)
        .post('/api/incomes')
        .set(bearer(token))
        .send({ categoryId: await categoryId('income', 'BOOKS'), amount: 400_000, method: 'CASH', description: 'Darslik' });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ amount: 400_000, isVoided: false });

      expect((await accountByKey('CASH')).balance.toNumber()).toBe(cash.balance.toNumber() + 400_000);
      const transaction = await prisma.transaction.findFirstOrThrow({ where: { entityType: 'income' } });
      expect(transaction.type).toBe('INCOME');
      expect(transaction.categoryName).toBe('Kitob va qo‘llanma');
    });

    it('xarajat kassadan yechiladi, bekor qilinganda qaytariladi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const before = (await accountByKey('CASH')).balance.toNumber();

      const created = await request(app)
        .post('/api/expenses')
        .set(bearer(token))
        .send({ categoryId: await categoryId('expense', 'RENT'), amount: 1_500_000, method: 'CASH' });
      expect(created.status).toBe(201);
      expect((await accountByKey('CASH')).balance.toNumber()).toBe(before - 1_500_000);

      const voided = await request(app)
        .post(`/api/expenses/${created.body.data.id}/void`)
        .set(bearer(token))
        .send({ reason: 'Ikki marta kiritilgan' });
      expect(voided.status).toBe(200);
      expect(voided.body.data).toMatchObject({ isVoided: true, voidReason: 'Ikki marta kiritilgan' });
      expect((await accountByKey('CASH')).balance.toNumber()).toBe(before);

      const repeat = await request(app)
        .post(`/api/expenses/${created.body.data.id}/void`)
        .set(bearer(token))
        .send({ reason: 'Yana bekor qilish' });
      expect(repeat.status).toBe(409);
    });

    it('bekor qilingan yozuv hisobotga kirmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const category = await categoryId('expense', 'ADVERTISEMENT');

      await request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: category, amount: 2_000_000, method: 'CASH' });
      const second = await request(app)
        .post('/api/expenses')
        .set(bearer(token))
        .send({ categoryId: category, amount: 3_000_000, method: 'CASH' });
      await request(app).post(`/api/expenses/${second.body.data.id}/void`).set(bearer(token)).send({ reason: 'Xato summa' });

      const stats = await request(app).get('/api/expenses/stats').set(bearer(token));
      expect(stats.body.data.total).toBe(2_000_000);
      expect(stats.body.data.count).toBe(1);

      const summary = await request(app).get('/api/finance/summary').set(bearer(token));
      expect(summary.body.data.expense).toBe(2_000_000);
      expect(summary.body.data.marketing).toBe(2_000_000);
    });

    it('noto‘g‘ri kategoriya va kichik summa qabul qilinmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });

      const wrongCategory = await request(app)
        .post('/api/incomes')
        .set(bearer(token))
        .send({ categoryId: 'yoq', amount: 50_000, method: 'CASH' });
      expect(wrongCategory.status).toBe(422);

      const tooSmall = await request(app)
        .post('/api/incomes')
        .set(bearer(token))
        .send({ categoryId: await categoryId('income', 'BOOKS'), amount: 100, method: 'CASH' });
      expect(tooSmall.status).toBe(422);
    });
  });

  describe('O‘quvchi to‘lovi daftarda', () => {
    it('to‘lov tushum sifatida yoziladi, bekor qilinsa qaytariladi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const student = await enrollStudent();
      const before = (await accountByKey('CLICK')).balance.toNumber();

      const payment = await request(app)
        .post('/api/payments')
        .set(bearer(token))
        .send({ studentId: student.id, amount: 700_000, method: 'CLICK' });
      expect(payment.status).toBe(201);

      const transaction = await prisma.transaction.findFirstOrThrow({ where: { entityType: 'payment' } });
      expect(transaction.amount.toNumber()).toBe(700_000);
      expect(transaction.categoryName).toBe('O‘quvchi to‘lovi');
      expect((await accountByKey('CLICK')).balance.toNumber()).toBe(before + 700_000);

      const summary = await request(app).get('/api/finance/summary').set(bearer(token));
      expect(summary.body.data.studentPayments).toBe(700_000);

      await request(app)
        .delete(`/api/payments/${payment.body.data.id}`)
        .set(bearer(token))
        .send({ reason: 'Xato kiritilgan to‘lov' });

      expect((await accountByKey('CLICK')).balance.toNumber()).toBe(before);
      const after = await request(app).get('/api/finance/summary').set(bearer(token));
      expect(after.body.data.income).toBe(0);
    });

    it('daftardagi to‘lov yozuvi moliya bo‘limidan bekor qilinmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const student = await enrollStudent();
      await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 500_000, method: 'CASH' });
      const transaction = await prisma.transaction.findFirstOrThrow({ where: { entityType: 'payment' } });

      const response = await request(app)
        .post(`/api/finance/transactions/${transaction.id}/void`)
        .set(bearer(token))
        .send({ reason: 'Sinov uchun bekor qilish' });
      expect(response.status).toBe(422);
    });
  });

  describe('Kassalar', () => {
    it('o‘tkazma ikkala kassani o‘zgartiradi, foydaga ta’sir qilmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const cash = await accountByKey('CASH');
      const bank = await accountByKey('BANK');

      const response = await request(app)
        .post('/api/finance/transfers')
        .set(bearer(token))
        .send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 1_000_000 });
      expect(response.status).toBe(201);

      expect((await accountByKey('CASH')).balance.toNumber()).toBe(cash.balance.toNumber() - 1_000_000);
      expect((await accountByKey('BANK')).balance.toNumber()).toBe(bank.balance.toNumber() + 1_000_000);

      const summary = await request(app).get('/api/finance/summary').set(bearer(token));
      expect(summary.body.data).toMatchObject({ income: 0, expense: 0, netProfit: 0 });
    });

    it('mablag‘ yetmasa va bir xil kassa tanlansa o‘tkazma bo‘lmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const cash = await accountByKey('CASH');
      const bank = await accountByKey('BANK');

      const tooMuch = await request(app)
        .post('/api/finance/transfers')
        .set(bearer(token))
        .send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 99_000_000 });
      expect(tooMuch.status).toBe(422);

      const same = await request(app)
        .post('/api/finance/transfers')
        .set(bearer(token))
        .send({ fromAccountId: cash.id, toAccountId: cash.id, amount: 100_000 });
      expect(same.status).toBe(422);
    });
  });

  describe('Panel va budjet', () => {
    it('sof foyda tushum va xarajat farqi sifatida hisoblanadi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const student = await enrollStudent();

      await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 2_000_000, method: 'CASH' });
      await request(app)
        .post('/api/expenses')
        .set(bearer(token))
        .send({ categoryId: await categoryId('expense', 'RENT'), amount: 800_000, method: 'CASH' });

      const summary = await request(app).get('/api/finance/summary').set(bearer(token));
      expect(summary.body.data).toMatchObject({ income: 2_000_000, expense: 800_000, netProfit: 1_200_000, margin: 60 });

      const cashFlow = await request(app).get('/api/finance/cash-flow?period=day').set(bearer(token));
      const last = cashFlow.body.data.at(-1);
      expect(last).toMatchObject({ income: 2_000_000, expense: 800_000, net: 1_200_000 });
    });

    it('budjet rejasi va haqiqiy xarajatni solishtiradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const rent = await categoryId('expense', 'RENT');
      const now = new Date();

      const saved = await request(app)
        .put('/api/finance/budget')
        .set(bearer(token))
        .send({
          year: now.getUTCFullYear(),
          month: now.getUTCMonth() + 1,
          lines: [{ categoryId: rent, plannedAmount: 4_000_000 }],
        });
      expect(saved.status).toBe(200);

      await request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: rent, amount: 3_000_000, method: 'CASH' });

      const budget = await request(app)
        .get(`/api/finance/budget?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`)
        .set(bearer(token));
      const line = budget.body.data.lines.find((row: { categoryId: string }) => row.categoryId === rent);
      expect(line).toMatchObject({ planned: 4_000_000, actual: 3_000_000, usage: 75, remaining: 1_000_000 });
      expect(budget.body.data.totalPlanned).toBe(4_000_000);
    });
  });

  describe('Ruxsatlar', () => {
    it('sotuv manageri moliyaviy ma’lumotni ko‘rmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

      expect((await request(app).get('/api/finance/summary').set(bearer(token))).status).toBe(403);
      expect((await request(app).get('/api/expenses').set(bearer(token))).status).toBe(403);
      expect((await request(app).get('/api/incomes').set(bearer(token))).status).toBe(403);
    });

    it('buxgalter tushum va xarajat kirita oladi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

      const income = await request(app)
        .post('/api/incomes')
        .set(bearer(token))
        .send({ categoryId: await categoryId('income', 'BOOKS'), amount: 200_000, method: 'CASH' });
      expect(income.status).toBe(201);
      expect((await request(app).get('/api/finance/summary').set(bearer(token))).status).toBe(200);
    });
  });
});
