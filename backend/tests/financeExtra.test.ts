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
  await prisma.incomeCategory.createMany({
    data: [
      { key: 'STUDENT_PAYMENT', name: 'O‘quvchi to‘lovi', isSystem: true },
      { key: 'BOOKS', name: 'Kitob' },
    ],
  });
  await prisma.expenseCategory.createMany({
    data: [
      { key: 'TEACHER_SALARY', name: 'O‘qituvchi maoshi', isSystem: true },
      { key: 'RENT', name: 'Ijara' },
    ],
  });
}

const incomeCategory = (key: string) => prisma.incomeCategory.findFirstOrThrow({ where: { key } });
const expenseCategory = (key: string) => prisma.expenseCategory.findFirstOrThrow({ where: { key } });
const account = (key: string) => prisma.financialAccount.findFirstOrThrow({ where: { key } });

describe.skipIf(!hasTestDatabase)('Moliya — qo‘shimcha holatlar (integratsion)', () => {
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

  describe('Kassalar', () => {
    it('kassa qo‘shadi, takroriy kalitni rad etadi, tahrirlaydi va faolsizini qoldiqdan chiqaradi', async () => {
      const created = await request(app).post('/api/finance/accounts').set(bearer(token)).send({ key: 'SAFE', name: 'Seyf', type: 'CASH' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ key: 'SAFE', balance: 0, isActive: true });

      const duplicate = await request(app).post('/api/finance/accounts').set(bearer(token)).send({ key: 'SAFE', name: 'Boshqa', type: 'CASH' });
      expect(duplicate.status).toBe(409);

      // Qoldiq hosil qilamiz, keyin kassani faolsizlantiramiz
      await request(app)
        .post('/api/incomes')
        .set(bearer(token))
        .send({ categoryId: (await incomeCategory('BOOKS')).id, amount: 500_000, method: 'CASH', accountId: created.body.data.id });

      const updated = await request(app)
        .put(`/api/finance/accounts/${created.body.data.id}`)
        .set(bearer(token))
        .send({ name: 'Asosiy seyf', isActive: false });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({ name: 'Asosiy seyf', isActive: false, balance: 500_000 });

      const accounts = await request(app).get('/api/finance/accounts').set(bearer(token));
      expect(accounts.body.data.totalBalance).toBe(0);

      expect((await request(app).put(`/api/finance/accounts/${created.body.data.id}`).set(bearer(token)).send({ key: 'CASH' })).status).toBe(409);
      expect((await request(app).put('/api/finance/accounts/yoq').set(bearer(token)).send({ name: 'Yangi nom' })).status).toBe(404);
    });

    it('faolsiz yoki noma’lum kassaga o‘tkazma va yozuv qilinmaydi', async () => {
      const cash = await account('CASH');
      await prisma.financialAccount.update({ where: { id: cash.id }, data: { balance: 1_000_000 } });
      const bank = await account('BANK');
      await prisma.financialAccount.update({ where: { id: bank.id }, data: { isActive: false } });

      const transfer = await request(app)
        .post('/api/finance/transfers')
        .set(bearer(token))
        .send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 100_000 });
      expect(transfer.status).toBe(422);

      const expense = await request(app)
        .post('/api/expenses')
        .set(bearer(token))
        .send({ categoryId: (await expenseCategory('RENT')).id, amount: 100_000, method: 'CASH', accountId: bank.id });
      expect(expense.status).toBe(422);
    });
  });

  describe('Moliyaviy daftar', () => {
    it('tur, kassa va raqam bo‘yicha filtrlaydi hamda saralaydi', async () => {
      await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: (await incomeCategory('BOOKS')).id, amount: 200_000, method: 'CASH' });
      await request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: (await expenseCategory('RENT')).id, amount: 300_000, method: 'CASH' });

      const incomes = await request(app).get('/api/finance/transactions?type=INCOME').set(bearer(token));
      expect(incomes.body.data.every((row: { type: string }) => row.type === 'INCOME')).toBe(true);

      const sorted = await request(app).get('/api/finance/transactions?sortBy=amount&sortOrder=desc').set(bearer(token));
      expect(sorted.body.data[0].amount).toBe(300_000);

      const number = sorted.body.data[0].number as number;
      const byNumber = await request(app).get(`/api/finance/transactions?search=%23${number}`).set(bearer(token));
      expect(byNumber.body.data.map((row: { number: number }) => row.number)).toEqual([number]);

      const bank = await account('BANK');
      const byAccount = await request(app).get(`/api/finance/transactions?accountId=${bank.id}`).set(bearer(token));
      expect(byAccount.body.meta.total).toBe(0);
    });

    it('daftardan tushumni bekor qiladi; maosh yozuvini bekor qilmaydi', async () => {
      await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: (await incomeCategory('BOOKS')).id, amount: 150_000, method: 'CASH' });
      const transaction = await prisma.transaction.findFirstOrThrow({ where: { entityType: 'income' } });

      const voided = await request(app)
        .post(`/api/finance/transactions/${transaction.id}/void`)
        .set(bearer(token))
        .send({ reason: 'Noto‘g‘ri kiritilgan' });
      expect(voided.status).toBe(200);
      expect(voided.body.data).toMatchObject({ status: 'VOID', voidReason: 'Noto‘g‘ri kiritilgan' });
      expect((await account('CASH')).balance.toNumber()).toBe(0);

      expect((await request(app).post(`/api/finance/transactions/${transaction.id}/void`).set(bearer(token)).send({ reason: 'Yana bir marta' })).status).toBe(409);
      expect((await request(app).post('/api/finance/transactions/yoq/void').set(bearer(token)).send({ reason: 'Topilmaydi' })).status).toBe(404);

      const salary = await prisma.transaction.create({ data: { type: 'EXPENSE', amount: 100_000, entityType: 'teacherSalaryPayment' } });
      expect((await request(app).post(`/api/finance/transactions/${salary.id}/void`).set(bearer(token)).send({ reason: 'Maoshni bekor qilish' })).status).toBe(422);
    });

    it('pul oqimi haftalik va oylik davrlarga bo‘linadi', async () => {
      const at = (date: string, amount: number, type: 'INCOME' | 'EXPENSE') =>
        prisma.transaction.create({ data: { type, amount, entityType: type === 'INCOME' ? 'income' : 'expense', occurredAt: new Date(`${date}T09:00:00.000Z`) } });
      await at('2026-08-03', 1_000_000, 'INCOME');
      await at('2026-08-04', 400_000, 'EXPENSE');
      await at('2026-08-20', 600_000, 'INCOME');

      const weekly = await request(app).get('/api/finance/cash-flow?period=week&from=2026-08-01&to=2026-08-31').set(bearer(token));
      expect(weekly.body.data).toHaveLength(2);
      expect(weekly.body.data[0]).toMatchObject({ income: 1_000_000, expense: 400_000, net: 600_000, balance: 600_000 });
      expect(weekly.body.data[1]).toMatchObject({ income: 600_000, balance: 1_200_000 });

      const monthly = await request(app).get('/api/finance/cash-flow?period=month&from=2026-08-01&to=2026-08-31').set(bearer(token));
      expect(monthly.body.data).toEqual([expect.objectContaining({ label: 'Avg', income: 1_600_000, expense: 400_000 })]);
    });
  });

  describe('Kategoriyalar, tushum va budjet', () => {
    it('kategoriya qo‘shadi va tahrirlaydi; tizim kategoriyasini o‘chirib bo‘lmaydi', async () => {
      const created = await request(app).post('/api/incomes/categories').set(bearer(token)).send({ key: 'EVENTS', name: 'Tadbirlar' });
      expect(created.status).toBe(201);
      expect(created.body.data.map((row: { key: string }) => row.key)).toContain('EVENTS');
      expect((await request(app).post('/api/incomes/categories').set(bearer(token)).send({ key: 'EVENTS', name: 'Takror' })).status).toBe(409);

      const system = await expenseCategory('TEACHER_SALARY');
      expect((await request(app).put(`/api/expenses/categories/${system.id}`).set(bearer(token)).send({ isActive: false })).status).toBe(422);

      const rent = await expenseCategory('RENT');
      const renamed = await request(app).put(`/api/expenses/categories/${rent.id}`).set(bearer(token)).send({ name: 'Ofis ijarasi', sortOrder: 5 });
      expect(renamed.body.data.find((row: { id: string }) => row.id === rent.id)).toMatchObject({ name: 'Ofis ijarasi', sortOrder: 5 });
      expect((await request(app).put('/api/expenses/categories/yoq').set(bearer(token)).send({ name: 'Yangi nom' })).status).toBe(404);

      // Faolsiz kategoriyaga yozuv qilinmaydi
      const events = await incomeCategory('EVENTS');
      await request(app).put(`/api/incomes/categories/${events.id}`).set(bearer(token)).send({ isActive: false });
      expect((await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: events.id, amount: 100_000, method: 'CASH' })).status).toBe(422);
    });

    it('tushumni bekor qiladi, usul va matn bo‘yicha filtrlaydi, noma’lum o‘quvchini rad etadi', async () => {
      const books = await incomeCategory('BOOKS');
      const cashIncome = await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount: 100_000, method: 'CASH', description: 'Darslik' });
      await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount: 250_000, method: 'CLICK', description: 'Qo‘llanma' });

      const clickStats = await request(app).get('/api/incomes/stats?method=CLICK').set(bearer(token));
      expect(clickStats.body.data).toMatchObject({ total: 250_000, count: 1 });

      const search = await request(app).get('/api/incomes?search=Darslik').set(bearer(token));
      expect(search.body.data).toHaveLength(1);

      const voided = await request(app).post(`/api/incomes/${cashIncome.body.data.id}/void`).set(bearer(token)).send({ reason: 'Qaytarib berildi' });
      expect(voided.body.data).toMatchObject({ isVoided: true });
      expect((await request(app).post(`/api/incomes/${cashIncome.body.data.id}/void`).set(bearer(token)).send({ reason: 'Yana bir marta' })).status).toBe(409);
      expect((await request(app).post('/api/incomes/yoq/void').set(bearer(token)).send({ reason: 'Topilmaydi' })).status).toBe(404);

      const stats = await request(app).get('/api/incomes/stats').set(bearer(token));
      expect(stats.body.data.total).toBe(250_000);

      const unknownStudent = await request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount: 100_000, method: 'CASH', studentId: 'yoq' });
      expect(unknownStudent.status).toBe(422);
    });

    it('budjet noma’lum kategoriyani rad etadi, nol reja saqlanmaydi', async () => {
      const wrong = await request(app)
        .put('/api/finance/budget')
        .set(bearer(token))
        .send({ year: 2026, month: 9, lines: [{ categoryId: 'yoq', plannedAmount: 1_000_000 }] });
      expect(wrong.status).toBe(422);

      const rent = await expenseCategory('RENT');
      const saved = await request(app)
        .put('/api/finance/budget')
        .set(bearer(token))
        .send({ year: 2026, month: 9, note: 'Sentabr', lines: [{ categoryId: rent.id, plannedAmount: 0 }] });
      expect(saved.status).toBe(200);
      expect(saved.body.data.totalPlanned).toBe(0);
      expect(await prisma.budgetLine.count()).toBe(0);
    });
  });
});
