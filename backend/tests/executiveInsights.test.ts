import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

/** Barcha hisob-kitoblar shu kunga nisbatan (o‘quv markaz vaqti bilan 15-sentabr 14:00) */
const NOW = new Date('2026-09-15T09:00:00.000Z');

async function seedReference() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 10_000_000 } });
  await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 1 } });
  await prisma.incomeCategory.create({ data: { key: 'BOOKS', name: 'Kitob', sortOrder: 1 } });
}

describe.skipIf(!hasTestDatabase)('Direktor paneli: davr, solishtirish, sog‘lomlik va prognoz (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    ({ token } = await createUserWithToken(app, { role: 'OWNER' }));

    const books = await prisma.incomeCategory.findFirstOrThrow();
    const rent = await prisma.expenseCategory.findFirstOrThrow();
    const income = (amount: number, date: string) =>
      request(app).post('/api/incomes').set(bearer(token)).send({ categoryId: books.id, amount, method: 'CASH', date }).expect(201);
    const expense = (amount: number, date: string) =>
      request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: rent.id, amount, method: 'CASH', date }).expect(201);

    await income(1_000_000, '2026-08-10');
    await expense(500_000, '2026-08-12');
    // O'tgan oyning 15-sanasidan keyin — joriy oy bilan solishtirishga kirmaydi
    await income(700_000, '2026-08-25');
    await income(900_000, '2026-09-05');
    await expense(300_000, '2026-09-06');
    await prisma.expense.create({ data: { categoryId: rent.id, amount: 200_000, spentAt: new Date('2026-09-25T00:00:00.000Z'), status: 'UPCOMING' } });
    await prisma.salesTarget.create({ data: { year: 2026, month: 9, type: 'REVENUE', targetValue: 2_000_000 } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('joriy oy o‘tgan oyning shu kunigacha solishtiriladi; oy oxiri prognozi va xulosalar', async () => {
    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    expect(response.status).toBe(200);
    const data = response.body.data;

    expect(data.period).toMatchObject({ kind: 'current-month', from: '2026-09-01', to: '2026-09-15', previousFrom: '2026-08-01', previousTo: '2026-08-15' });
    expect(data.month).toMatchObject({ revenue: 900_000, expense: 300_000, netProfit: 600_000, margin: 67 });
    expect(data.previous).toMatchObject({ revenue: 1_000_000, expense: 500_000, netProfit: 500_000 });
    expect(data.changes).toMatchObject({ revenue: -10, expense: -40, netProfit: 20, margin: 17, conversionRate: null, attendanceRate: null });

    expect(data.forecast).toEqual({
      daysElapsed: 15,
      daysInMonth: 30,
      projectedRevenue: 1_800_000,
      projectedExpense: 500_000,
      upcomingExpenses: 200_000,
      projectedProfit: 1_300_000,
      revenueTarget: 2_000_000,
      targetProgress: 90,
    });

    // Faqat moliya ma'lumoti bor — boshqa yo'nalishlar bahoga kirmaydi
    expect(data.health.score).toBe(100);
    expect(data.health.status).toBe('GOOD');
    expect(data.health.components.find((row: { key: string }) => row.key === 'attendance').score).toBeNull();

    const keys = data.insights.map((row: { key: string }) => row.key);
    expect(keys).toEqual(expect.arrayContaining(['revenue_down', 'expense_down', 'target_risk']));
    expect(data.insights[0].tone).toBe('negative');
  });

  it('tanlangan oy to‘liq oldingi oy bilan, oraliq esa teng uzunlikdagi oldingi oraliq bilan solishtiriladi', async () => {
    const august = await request(app).get('/api/dashboard/executive').query({ year: 2026, month: 8 }).set(bearer(token));
    expect(august.status).toBe(200);
    expect(august.body.data.period).toMatchObject({ kind: 'month', from: '2026-08-01', to: '2026-08-31', label: '2026-yil avgust', previousFrom: '2026-07-01', previousTo: '2026-07-31' });
    expect(august.body.data.month).toMatchObject({ revenue: 1_700_000, expense: 500_000 });
    expect(august.body.data.changes.revenue).toBeNull();
    expect(august.body.data.forecast).toBeNull();
    expect(august.body.data.trend.at(-1)).toMatchObject({ label: 'Avg', revenue: 1_700_000 });

    const range = await request(app).get('/api/dashboard/executive').query({ from: '2026-09-01', to: '2026-09-10' }).set(bearer(token));
    expect(range.body.data.period).toMatchObject({ kind: 'range', label: '01.09.2026 — 10.09.2026', previousFrom: '2026-08-22', previousTo: '2026-08-31' });
    expect(range.body.data.month.revenue).toBe(900_000);
    expect(range.body.data.previous.revenue).toBe(700_000);
    expect(range.body.data.changes.revenue).toBe(29);

    expect((await request(app).get('/api/dashboard/executive').query({ from: '2026-09-10' }).set(bearer(token))).status).toBe(422);
    expect((await request(app).get('/api/dashboard/executive').query({ from: '2026-09-10', to: '2026-09-01' }).set(bearer(token))).status).toBe(422);
    expect((await request(app).get('/api/dashboard/executive').query({ year: 2026 }).set(bearer(token))).status).toBe(422);
  });
});
