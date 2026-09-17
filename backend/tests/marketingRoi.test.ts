import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

async function setup() {
  const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
  const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' });
  const marketing = await prisma.expenseCategory.create({ data: { key: 'ADVERTISEMENT', name: 'Reklama' } });
  const rent = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });
  const instagram = await createSource('Instagram');
  const telegram = await createSource('Telegram');
  const course = await createCourse('Frontend');
  return { owner, accountant, marketing, rent, instagram, telegram, course };
}

const addExpense = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/expenses').set(bearer(token)).send({ method: 'CASH', ...body });

describe.skipIf(!hasTestDatabase)('Marketing xarajati va manba bo‘yicha ROI (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('xarajat lead manbasiga bog‘lanadi, noto‘g‘ri manba rad etiladi', async () => {
    const { accountant, marketing, instagram } = await setup();

    const created = await addExpense(accountant, { categoryId: marketing.id, amount: 1_000_000, sourceId: instagram.id });
    expect(created.status).toBe(201);
    expect(created.body.data.source).toEqual({ id: instagram.id, name: 'Instagram' });

    const list = await request(app).get('/api/expenses').set(bearer(accountant));
    expect(list.body.data[0].source).toMatchObject({ name: 'Instagram' });

    const wrong = await addExpense(accountant, { categoryId: marketing.id, amount: 100_000, sourceId: 'clnotexistingsource000000' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.errors).toEqual([{ field: 'sourceId', message: 'Manba topilmadi' }]);

    const withoutSource = await addExpense(accountant, { categoryId: marketing.id, amount: 400_000 });
    expect(withoutSource.status).toBe(201);
    expect(withoutSource.body.data.source).toBeNull();

    // Manbalar ro'yxati xarajat ruxsati bilan ham ochiladi (lead ruxsati shart emas)
    const lookups = await request(app).get('/api/lookups/marketing-sources').set(bearer(accountant));
    expect(lookups.status).toBe(200);
    expect(lookups.body.data.sources.map((source: { name: string }) => source.name)).toEqual(['Instagram', 'Telegram']);
  });

  it('analitikada kanal bo‘yicha xarajat, lead narxi, o‘quvchi narxi va ROI hisoblanadi', async () => {
    const { owner, accountant, marketing, rent, instagram, telegram, course } = await setup();

    await addExpense(accountant, { categoryId: marketing.id, amount: 1_000_000, sourceId: instagram.id });
    await addExpense(accountant, { categoryId: marketing.id, amount: 400_000 });
    await addExpense(accountant, { categoryId: rent.id, amount: 5_000_000 });

    const leads = [];
    for (let index = 0; index < 3; index += 1) {
      leads.push(await createLead({ sourceId: instagram.id, courseId: course.id, phone: `+99893100000${index}` }));
    }
    await createLead({ sourceId: telegram.id, courseId: course.id, phone: '+998931000009' });

    const converted = await request(app)
      .post(`/api/leads/${leads[0]!.id}/convert`)
      .set(bearer(owner))
      .send({ contractPrice: 3_000_000 });
    expect(converted.status).toBe(201);
    expect(
      (await request(app).post('/api/payments').set(bearer(accountant)).send({ studentId: converted.body.data.id, amount: 2_000_000, method: 'CASH' })).status,
    ).toBe(201);

    const analytics = await request(app).get('/api/analytics/sources').set(bearer(owner));
    expect(analytics.status).toBe(200);
    const rows = analytics.body.data.rows as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.name === 'Instagram')).toMatchObject({
      leads: 3,
      students: 1,
      revenue: 2_000_000,
      spend: 1_000_000,
      costPerLead: 333_333,
      costPerStudent: 1_000_000,
      profit: 1_000_000,
      roi: 100,
    });
    expect(rows.find((row) => row.name === 'Telegram')).toMatchObject({ leads: 1, spend: 0, roi: null, profit: 0 });
    expect(analytics.body.data.totals).toMatchObject({
      spend: 1_000_000,
      revenue: 2_000_000,
      profit: 1_000_000,
      roi: 100,
      unattributedSpend: 400_000,
    });

    // Ijara xarajati kanalga bog'lanmagani uchun marketing xarajatiga kirmaydi
    expect(rows.every((row) => row.spend !== 5_000_000)).toBe(true);

    const report = await request(app).get('/api/reports/sources').set(bearer(owner));
    expect(report.status).toBe(200);
    expect(report.body.data.columns.map((column: { key: string }) => column.key)).toEqual(
      expect.arrayContaining(['spend', 'costPerLead', 'roi']),
    );
    expect(report.body.data.rows.find((row: { source: string }) => row.source === 'Instagram')).toMatchObject({
      spend: 1_000_000,
      costPerLead: 333_333,
      roi: 100,
    });
    expect(report.body.data.kpis.find((kpi: { label: string }) => kpi.label === 'ROI')).toMatchObject({ value: 100 });
  });
});
