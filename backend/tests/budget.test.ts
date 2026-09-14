import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function seedReference() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 100_000_000, sortOrder: 1 } });
  await prisma.expenseCategory.createMany({
    data: [
      { key: 'MARKETING', name: 'Marketing', sortOrder: 1 },
      { key: 'RENT', name: 'Ijara', sortOrder: 2 },
      { key: 'INTERNET', name: 'Internet', sortOrder: 3 },
    ],
  });
}

const categoryId = async (key: string) => (await prisma.expenseCategory.findFirstOrThrow({ where: { key } })).id;

type BudgetLine = {
  categoryName: string;
  planned: number;
  actual: number;
  committed: number;
  difference: number;
  usage: number;
  status: string;
};

describe.skipIf(!hasTestDatabase)('Budjet: reja va fakt (integratsion)', () => {
  let owner: string;
  let accountant: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));
    ({ token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const expense = (token: string, key: string, amount: number, date: string) =>
    categoryId(key).then((id) => request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: id, amount, method: 'CASH', date }));

  const budget = async (year: number, month: number) => {
    const response = await request(app).get('/api/finance/budget').query({ year, month }).set(bearer(owner));
    expect(response.status).toBe(200);
    return response.body.data as {
      totalPlanned: number;
      totalActual: number;
      totalCommitted: number;
      totalDifference: number;
      lines: BudgetLine[];
    };
  };

  it('har bir kategoriya uchun reja, fakt, farq, foiz, holat va kutilayotgan summa', async () => {
    await request(app)
      .put('/api/finance/budget')
      .set(bearer(owner))
      .send({
        year: 2026,
        month: 8,
        lines: [
          { categoryId: await categoryId('MARKETING'), plannedAmount: 5_000_000 },
          { categoryId: await categoryId('RENT'), plannedAmount: 3_000_000 },
        ],
      })
      .expect(200);

    expect((await expense(owner, 'MARKETING', 6_200_000, '2026-08-05')).status).toBe(201);
    expect((await expense(owner, 'RENT', 2_800_000, '2026-08-06')).status).toBe(201);
    expect((await expense(owner, 'INTERNET', 300_000, '2026-08-07')).status).toBe(201);

    // Tasdiq kutayotgan xarajat faktga emas, "kutilayotgan"ga kiradi
    await request(app).put('/api/expenses/settings/approval').set(bearer(owner)).send({ approvalThreshold: 1_000_000 }).expect(200);
    const pending = await expense(accountant, 'MARKETING', 2_000_000, '2026-08-20');
    expect(pending.body.data.status).toBe('PENDING');

    // O'quv markaz vaqti bo'yicha 1-sentabr 01:00 — avgust budjetiga kirmaydi
    const rentId = await categoryId('RENT');
    const late = await prisma.transaction.create({
      data: { type: 'EXPENSE', amount: 100_000, occurredAt: new Date('2026-08-31T20:00:00.000Z'), categoryName: 'Ijara', entityType: 'expense' },
    });
    await prisma.expense.create({
      data: { categoryId: rentId, amount: 100_000, spentAt: new Date('2026-08-31T20:00:00.000Z'), transactionId: late.id, status: 'PAID' },
    });

    const august = await budget(2026, 8);
    const line = (name: string) => august.lines.find((row) => row.categoryName === name)!;
    expect(line('Marketing')).toMatchObject({ planned: 5_000_000, actual: 6_200_000, difference: 1_200_000, usage: 124, status: 'OVER', committed: 2_000_000 });
    expect(line('Ijara')).toMatchObject({ planned: 3_000_000, actual: 2_800_000, difference: -200_000, usage: 93, status: 'WARNING', committed: 0 });
    expect(line('Internet')).toMatchObject({ planned: 0, actual: 300_000, status: 'UNPLANNED' });
    expect(august).toMatchObject({ totalPlanned: 8_000_000, totalActual: 9_300_000, totalDifference: 1_300_000, totalCommitted: 2_000_000 });

    const september = await budget(2026, 9);
    expect(september.lines.find((row) => row.categoryName === 'Ijara')).toMatchObject({ actual: 100_000, status: 'UNPLANNED' });
  });

  it('o‘tgan oy budjetidan nusxa olinadi; to‘ldirilgan oy qayta yozilmaydi', async () => {
    await request(app)
      .put('/api/finance/budget')
      .set(bearer(owner))
      .send({ year: 2026, month: 8, lines: [{ categoryId: await categoryId('RENT'), plannedAmount: 3_000_000 }] })
      .expect(200);

    const copied = await request(app).post('/api/finance/budget/copy').set(bearer(accountant)).send({ year: 2026, month: 9 });
    expect(copied.status).toBe(200);
    expect(copied.body.data.lines.find((row: BudgetLine) => row.categoryName === 'Ijara')).toMatchObject({ planned: 3_000_000 });

    expect((await request(app).post('/api/finance/budget/copy').set(bearer(accountant)).send({ year: 2026, month: 9 })).status).toBe(409);
    expect((await request(app).post('/api/finance/budget/copy').set(bearer(accountant)).send({ year: 2026, month: 11 })).status).toBe(422);

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await request(app).post('/api/finance/budget/copy').set(bearer(sales)).send({ year: 2026, month: 12 })).status).toBe(403);
  });
});
