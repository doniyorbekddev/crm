import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function seedReference() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 50_000_000, sortOrder: 1 } });
  await prisma.expenseCategory.createMany({
    data: [
      { key: 'RENT', name: 'Ijara', sortOrder: 1 },
      { key: 'INTERNET', name: 'Internet', sortOrder: 2 },
    ],
  });
}

const cashBalance = async () => (await prisma.financialAccount.findFirstOrThrow({ where: { key: 'CASH' } })).balance.toNumber();
const categoryId = async (key: string) => (await prisma.expenseCategory.findFirstOrThrow({ where: { key } })).id;

describe.skipIf(!hasTestDatabase)('Xarajat tasdig‘i va takroriy xarajatlar (integratsion)', () => {
  let owner: string;
  let ownerId: string;
  let accountant: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    const ownerUser = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    owner = ownerUser.token;
    ownerId = ownerUser.user.id;
    ({ token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const setThreshold = (token: string, approvalThreshold: number) =>
    request(app).put('/api/expenses/settings/approval').set(bearer(token)).send({ approvalThreshold });

  it('chegaradan katta xarajat tasdiqlanmaguncha kassaga tushmaydi: PENDING → APPROVED → PAID', async () => {
    expect((await setThreshold(accountant, 5_000_000)).status).toBe(403);
    const saved = await setThreshold(owner, 5_000_000);
    expect(saved.body.data.approvalThreshold).toBe(5_000_000);

    const rent = await categoryId('RENT');
    const big = await request(app)
      .post('/api/expenses')
      .set(bearer(accountant))
      .send({ categoryId: rent, amount: 10_000_000, method: 'CASH', vendor: 'Oqtepa Plaza MChJ', description: 'Yillik ijara' });
    expect(big.status).toBe(201);
    expect(big.body.data).toMatchObject({ status: 'PENDING', transactionId: null, vendor: 'Oqtepa Plaza MChJ', isVoided: false });
    expect(await cashBalance()).toBe(50_000_000);
    expect(await prisma.transaction.count()).toBe(0);
    const stats = await request(app).get('/api/expenses/stats').set(bearer(accountant));
    expect(stats.body.data.total).toBe(0);
    expect(await prisma.notification.count({ where: { userId: ownerId, type: 'EXPENSE_APPROVAL' } })).toBe(1);

    // Kichik xarajat — darhol to'lanadi
    const small = await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rent, amount: 1_000_000, method: 'CASH' });
    expect(small.body.data).toMatchObject({ status: 'PAID' });

    const id = big.body.data.id as string;
    expect((await request(app).post(`/api/expenses/${id}/pay`).set(bearer(accountant)).send({})).status).toBe(409);
    expect((await request(app).post(`/api/expenses/${id}/approve`).set(bearer(accountant))).status).toBe(403);
    const approved = await request(app).post(`/api/expenses/${id}/approve`).set(bearer(owner));
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', approvedBy: { id: ownerId } });

    const paid = await request(app).post(`/api/expenses/${id}/pay`).set(bearer(accountant)).send({ method: 'CASH' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.transactionId).not.toBeNull();
    expect(await cashBalance()).toBe(39_000_000);
    expect(await prisma.auditLog.count({ where: { action: { in: ['expense.requested', 'expense.approved', 'expense.paid'] } } })).toBe(3);

    // To'langandan keyin oddiy bekor qilish ishlaydi
    const voided = await request(app).post(`/api/expenses/${id}/void`).set(bearer(accountant)).send({ reason: 'Shartnoma bekor qilindi' });
    expect(voided.body.data.isVoided).toBe(true);
    expect(await cashBalance()).toBe(49_000_000);

    // Rahbar o'zi kiritgan katta xarajat darhol to'lanadi va tasdiqlagan sifatida yoziladi
    const byOwner = await request(app).post('/api/expenses').set(bearer(owner)).send({ categoryId: rent, amount: 6_000_000, method: 'CASH' });
    expect(byOwner.body.data).toMatchObject({ status: 'PAID', approvedBy: { id: ownerId } });
  });

  it('rad etish: faqat rahbar; rad etilgan xarajat to‘lanmaydi va bekor qilinmaydi', async () => {
    await setThreshold(owner, 2_000_000).expect(200);
    const pending = await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: await categoryId('RENT'), amount: 3_000_000, method: 'CASH' });
    const id = pending.body.data.id as string;

    expect((await request(app).post(`/api/expenses/${id}/reject`).set(bearer(accountant)).send({ reason: 'Kerak emas' })).status).toBe(403);
    expect((await request(app).post(`/api/expenses/${id}/void`).set(bearer(accountant)).send({ reason: 'To‘lanmagan' })).status).toBe(422);
    const rejected = await request(app).post(`/api/expenses/${id}/reject`).set(bearer(owner)).send({ reason: 'Budjetda yo‘q' });
    expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectReason: 'Budjetda yo‘q' });
    expect((await request(app).post(`/api/expenses/${id}/pay`).set(bearer(accountant)).send({})).status).toBe(409);

    const list = await request(app).get('/api/expenses').query({ status: 'REJECTED' }).set(bearer(accountant));
    expect(list.body.meta.total).toBe(1);
  });

  it('takroriy xarajat oy uchun bir marta kutilayotgan xarajat yaratadi, pul yechilmaydi', async () => {
    await setThreshold(owner, 1_000_000).expect(200);
    const rent = await request(app)
      .post('/api/recurring-expenses')
      .set(bearer(accountant))
      .send({ name: 'Ofis ijarasi', categoryId: await categoryId('RENT'), amount: 5_000_000, dayOfMonth: 5, startDate: '2026-01-01', vendor: 'Oqtepa Plaza' });
    expect(rent.status).toBe(201);
    await request(app)
      .post('/api/recurring-expenses')
      .set(bearer(accountant))
      .send({ name: 'Internet', categoryId: await categoryId('INTERNET'), amount: 300_000, dayOfMonth: 28, startDate: '2026-01-01' })
      .expect(201);
    expect(
      (await request(app).post('/api/recurring-expenses').set(bearer(accountant)).send({ name: 'Xato kun', categoryId: await categoryId('RENT'), amount: 300_000, dayOfMonth: 31, startDate: '2026-01-01' })).status,
    ).toBe(422);

    const generated = await request(app).post('/api/recurring-expenses/generate').set(bearer(accountant));
    expect(generated.body.data.created).toBe(2);
    expect((await request(app).post('/api/recurring-expenses/generate').set(bearer(accountant))).body.data.created).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);

    const { year, month } = currentBusinessMonth();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const expenses = await prisma.expense.findMany({ where: { recurringPeriod: period }, orderBy: { amount: 'desc' } });
    expect(expenses.map((expense) => [expense.description, expense.status])).toEqual([
      ['Ofis ijarasi', 'PENDING'],
      ['Internet', 'UPCOMING'],
    ]);
    expect(expenses[0]!.dueDate?.toISOString().slice(0, 10)).toBe(`${period}-05`);

    const list = await request(app).get('/api/recurring-expenses').set(bearer(accountant));
    expect(list.body.data.find((row: { name: string }) => row.name === 'Internet').currentMonth).toMatchObject({ status: 'UPCOMING' });

    // Kutilayotgan kichik xarajat to'lanadi; katta — avval tasdiq
    const internet = expenses[1]!;
    const paid = await request(app).post(`/api/expenses/${internet.id}/pay`).set(bearer(accountant)).send({});
    expect(paid.body.data).toMatchObject({ status: 'PAID', recurring: { name: 'Internet' } });
    expect(await cashBalance()).toBe(49_700_000);

    // Chegara pasaysa — kutilayotgan yozuvni ham tasdiqsiz to'lab bo'lmaydi
    const deactivated = await request(app).put(`/api/recurring-expenses/${rent.body.data.id}`).set(bearer(accountant)).send({ isActive: false });
    expect(deactivated.body.data.isActive).toBe(false);
  });
});
