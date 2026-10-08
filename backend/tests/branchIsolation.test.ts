import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { MAIN_BRANCH_ID } from '../src/config/branch.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();

async function createSecondBranch() {
  return prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
}

async function createStudentIn(branchId: string, courseId: string, name: string) {
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Filialov',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      branchId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Filial izolyatsiyasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('boshqa filial o‘quvchilari ko‘rinmaydi', async () => {
    const other = await createSecondBranch();
    const course = await createCourse('Frontend');
    await createStudentIn(MAIN_BRANCH_ID, course.id, 'Asosiy');
    await createStudentIn(other.id, course.id, 'Chilonzor');

    // ADMIN da branch.view_all yo'q — faqat o'z filiali
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const response = await request(app).get('/api/students').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { firstName: string }) => item.firstName)).toEqual(['Asosiy']);
  });

  it('barcha filialni ko‘ra oladigan xodim filial bo‘yicha filtrlaydi', async () => {
    const other = await createSecondBranch();
    const course = await createCourse('Backend');
    await createStudentIn(MAIN_BRANCH_ID, course.id, 'Asosiy');
    await createStudentIn(other.id, course.id, 'Chilonzor');

    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

    const all = await request(app).get('/api/students').set(bearer(token));
    expect(all.body.data).toHaveLength(2);

    const filtered = await request(app).get('/api/students').query({ branchId: other.id }).set(bearer(token));
    expect(filtered.body.data.map((item: { firstName: string }) => item.firstName)).toEqual(['Chilonzor']);
  });

  it('o‘z filialidan boshqasini so‘rash rad etiladi', async () => {
    const other = await createSecondBranch();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const response = await request(app).get('/api/students').query({ branchId: other.id }).set(bearer(token));

    expect(response.status).toBe(403);
  });

  it('moliya (tushum, xarajat) filial bo‘yicha ajratiladi', async () => {
    const other = await createSecondBranch();
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const category = await prisma.incomeCategory.create({ data: { key: 'other', name: 'Boshqa', sortOrder: 10 } });
    const account = await prisma.financialAccount.create({ data: { key: 'cash', name: 'Naqd kassa', type: 'CASH', balance: 0 } });

    // Ikkita filialda bittadan tushum
    for (const [branchId, amount] of [
      [MAIN_BRANCH_ID, 100_000],
      [other.id, 250_000],
    ] as const) {
      const transaction = await prisma.transaction.create({
        data: {
          type: 'INCOME',
          amount,
          accountId: account.id,
          occurredAt: new Date(),
          description: 'Test',
          createdById: user.id,
          branchId,
          entityType: 'income',
        },
      });
      await prisma.income.create({
        data: { categoryId: category.id, amount, method: 'CASH', accountId: account.id, transactionId: transaction.id, branchId },
      });
    }

    const all = await request(app).get('/api/incomes').set(bearer(token));
    expect(all.body.data).toHaveLength(2);

    const filtered = await request(app).get('/api/incomes').query({ branchId: other.id }).set(bearer(token));
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].amount).toBe(250_000);

    const stats = await request(app).get('/api/incomes/stats').query({ branchId: other.id }).set(bearer(token));
    expect(stats.body.data.total).toBe(250_000);
  });

  it('to‘lovlar: eksport, bitta to‘lov, bekor qilish va qaytarish ham filial doirasida', async () => {
    const other = await createSecondBranch();
    const course = await createCourse('Frontend');
    const mine = await createStudentIn(MAIN_BRANCH_ID, course.id, 'Oybek');
    const foreign = await createStudentIn(other.id, course.id, 'Begona');
    const pay = (studentId: string, branchId: string) =>
      prisma.payment.create({ data: { studentId, courseId: course.id, branchId, amount: 300_000, method: 'CASH', paidAt: new Date() } });
    const ownPayment = await pay(mine.id, MAIN_BRANCH_ID);
    const foreignPayment = await pay(foreign.id, other.id);
    // ADMIN — faqat o'z filiali (branch.view_all yo'q); OWNER — barcha filial
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: ownerToken } = await createUserWithToken(app, { role: 'OWNER' });

    // Ro'yxat va eksport bir xil doirada
    const list = await request(app).get('/api/payments').set(bearer(adminToken));
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([ownPayment.id]);
    const exported = await request(app).get('/api/payments/export').query({ format: 'csv' }).set(bearer(adminToken));
    expect(exported.status).toBe(200);
    expect(exported.text).toContain('Oybek');
    expect(exported.text).not.toContain('Begona');
    // Boshqa filialni so'rab eksport qilish ham rad etiladi (ro'yxatdagi kabi)
    expect((await request(app).get('/api/payments/export').query({ format: 'csv', branchId: other.id }).set(bearer(adminToken))).status).toBe(403);

    const ownerExport = await request(app).get('/api/payments/export').query({ format: 'csv' }).set(bearer(ownerToken));
    expect(ownerExport.text).toContain('Oybek');
    expect(ownerExport.text).toContain('Begona');

    // Bitta to'lov: begona filialniki "topilmadi"
    expect((await request(app).get(`/api/payments/${ownPayment.id}`).set(bearer(adminToken))).status).toBe(200);
    expect((await request(app).get(`/api/payments/${foreignPayment.id}`).set(bearer(adminToken))).status).toBe(404);
    expect((await request(app).get(`/api/payments/${foreignPayment.id}`).set(bearer(ownerToken))).status).toBe(200);

    // Yozuvchi amallar: begona filial to'lovini bekor qilib ham, qaytarib ham bo'lmaydi
    const voided = await request(app).delete(`/api/payments/${foreignPayment.id}`).set(bearer(adminToken)).send({ reason: 'Xato kiritilgan to‘lov' });
    expect(voided.status).toBe(403);
    const refunded = await request(app)
      .post(`/api/payments/${foreignPayment.id}/refunds`)
      .set(bearer(adminToken))
      .send({ amount: 100_000, method: 'CASH', reason: 'O‘quvchi ketdi' });
    expect(refunded.status).toBe(403);
    const untouched = await prisma.payment.findUniqueOrThrow({ where: { id: foreignPayment.id }, select: { deletedAt: true, _count: { select: { refunds: true } } } });
    expect(untouched).toEqual({ deletedAt: null, _count: { refunds: 0 } });
  });

  it('xodimlar ro‘yxati ham filial bo‘yicha ajratiladi', async () => {
    const other = await createSecondBranch();
    await prisma.employee.createMany({
      data: [
        { firstName: 'Asosiy', lastName: 'Xodim', position: 'ADMINISTRATOR', hireDate: new Date('2026-01-01'), branchId: MAIN_BRANCH_ID },
        { firstName: 'Chilonzor', lastName: 'Xodim', position: 'ADMINISTRATOR', hireDate: new Date('2026-01-01'), branchId: other.id },
      ],
    });

    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const response = await request(app).get('/api/employees').set(bearer(token));

    expect(response.body.data.map((item: { firstName: string }) => item.firstName)).toEqual(['Asosiy']);
  });
});
