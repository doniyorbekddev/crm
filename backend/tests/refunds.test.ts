import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

let counter = 0;

async function seedAccounts() {
  await prisma.financialAccount.createMany({
    data: [
      { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 1_000_000, sortOrder: 1 },
      { key: 'UZCARD', name: 'Uzcard', type: 'UZCARD', balance: 0, sortOrder: 2 },
    ],
  });
}

async function enroll(courseId: string, groupId: string, contract: number) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Qaytaruvchi',
      phone: `+99895${String(1_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: contract,
      startDate: new Date('2026-01-10'),
      debt: { create: { totalAmount: contract, remainingAmount: contract } },
    },
  });
}

async function pay(token: string, studentId: string, amount: number, paidAt?: string) {
  const response = await request(app)
    .post('/api/payments')
    .set(bearer(token))
    .send({ studentId, amount, method: 'CASH', ...(paidAt ? { paidAt } : {}) });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

const refundUrl = (paymentId: string) => `/api/payments/${paymentId}/refunds`;

describe.skipIf(!hasTestDatabase)('To‘lovni qaytarish (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedAccounts();
    ({ token } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('qisman qaytarish: qarz, kassa va daftar mos o‘zgaradi; ortiqcha qaytarish va bekor qilish rad etiladi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id, 600_000);
    const payment = await pay(token, student.id, 600_000);
    const cash = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'CASH' } });
    expect(cash.balance.toNumber()).toBe(1_600_000);

    const refund = await request(app).post(refundUrl(payment.id)).set(bearer(token)).send({ amount: 200_000, method: 'CASH', reason: 'Kursni erta tugatdi' });
    expect(refund.status).toBe(200);
    expect(refund.body.data).toMatchObject({ amount: 600_000, refundedAmount: 200_000 });
    expect(refund.body.data.refunds[0]).toMatchObject({ amount: 200_000, method: 'CASH', reason: 'Kursni erta tugatdi' });
    expect(refund.body.data.refunds[0].code).toMatch(/^QT-\d{6}$/);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt).toMatchObject({ status: 'PARTIAL' });
    expect(debt.paidAmount.toNumber()).toBe(400_000);
    expect(debt.remainingAmount.toNumber()).toBe(200_000);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: cash.id } })).balance.toNumber()).toBe(1_400_000);

    const ledger = await prisma.transaction.findFirstOrThrow({ where: { type: 'REFUND' } });
    expect(ledger).toMatchObject({ entityType: 'paymentRefund', status: 'COMPLETED' });
    expect(ledger.amount.toNumber()).toBe(200_000);
    expect(await prisma.auditLog.count({ where: { action: 'payment.refunded' } })).toBe(1);

    const tooMuch = await request(app).post(refundUrl(payment.id)).set(bearer(token)).send({ amount: 450_000, method: 'CASH', reason: 'Ortiqcha summa' });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.errors[0].field).toBe('amount');

    const uzcard = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'UZCARD' } });
    const empty = await request(app)
      .post(refundUrl(payment.id))
      .set(bearer(token))
      .send({ amount: 400_000, method: 'CARD', accountId: uzcard.id, reason: 'Kartaga qaytarish' });
    expect(empty.status).toBe(422);

    const rest = await request(app).post(refundUrl(payment.id)).set(bearer(token)).send({ amount: 400_000, method: 'CASH', reason: 'Qolgan summa' });
    expect(rest.body.data.refundedAmount).toBe(600_000);
    const unpaid = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(unpaid.status).toBe('UNPAID');
    expect(unpaid.remainingAmount.toNumber()).toBe(600_000);

    expect((await request(app).post(refundUrl(payment.id)).set(bearer(token)).send({ amount: 1_000, method: 'CASH', reason: 'Yana bir marta' })).status).toBe(409);
    expect((await request(app).delete(`/api/payments/${payment.id}`).set(bearer(token)).send({ reason: 'Bekor qilish' })).status).toBe(409);
    // Qaytarilgan pul daftardan bekor qilinmaydi
    expect((await request(app).post(`/api/finance/transactions/${ledger.id}/void`).set(bearer(token)).send({ reason: 'Daftardan olib tashlash' })).status).toBe(422);
  });

  it('qaytarish o‘qituvchi foizini proporsional kamaytiradi; tasdiqlangan oyda — keyingi ochiq oyga', async () => {
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const profile = await request(app).post('/api/teachers').set(bearer(adminToken)).send({ userId: teacher.id });
    await request(app)
      .post(`/api/teachers/${profile.body.data.id}/salary-rules`)
      .set(bearer(adminToken))
      .send({ type: 'PERCENTAGE', percentage: 30, effectiveFrom: '2026-01-01' })
      .expect(201);

    // Mart: 1 000 000 × 30% = 300 000, maosh tasdiqlanadi
    const first = await enroll(course.id, group.id, 1_000_000);
    const marchPayment = await pay(adminToken, first.id, 1_000_000, '2026-03-10T09:00:00.000Z');
    await request(app).post('/api/salaries/calculate').set(bearer(adminToken)).send({ year: 2026, month: 3 }).expect(200);
    const periods = await request(app).get('/api/salaries/periods').query({ year: 2026, month: 3 }).set(bearer(adminToken));
    await request(app).post(`/api/salaries/periods/${periods.body.data[0].id}/approve`).set(bearer(adminToken)).expect(200);

    await request(app).post(refundUrl(marchPayment.id)).set(bearer(token)).send({ amount: 200_000, method: 'CASH', reason: 'Qisman qaytarish' }).expect(200);
    const current = currentBusinessMonth();
    const marchReversal = await prisma.commissionEntry.findFirstOrThrow({ where: { paymentId: marchPayment.id, kind: 'REVERSAL' } });
    expect(marchReversal).toMatchObject({ year: current.year, month: current.month });
    expect(marchReversal.amount.toNumber()).toBe(-60_000);
    expect(marchReversal.baseAmount.toNumber()).toBe(-200_000);

    // Joriy (tasdiqlanmagan) oy: teskari yozuv shu oyning o'zida
    const second = await enroll(course.id, group.id, 500_000);
    const currentPayment = await pay(adminToken, second.id, 500_000);
    await request(app).post(refundUrl(currentPayment.id)).set(bearer(token)).send({ amount: 100_000, method: 'CASH', reason: 'Qisman qaytarish' }).expect(200);

    const detail = await request(app).get(`/api/teacher-commissions/${profile.body.data.id}`).query(current).set(bearer(adminToken));
    // 150 000 (joriy oy) − 30 000 (joriy qaytarish) − 60 000 (mart qaytarishi)
    expect(detail.body.data.month.commission).toBe(60_000);

    // Qayta hisoblash qisman teskari yozuvni to'liq summaga aylantirib yubormaydi
    await request(app).post('/api/salaries/calculate').set(bearer(adminToken)).send(current).expect(200);
    const again = await prisma.commissionEntry.findFirstOrThrow({ where: { paymentId: currentPayment.id, kind: 'REVERSAL' } });
    expect(again.amount.toNumber()).toBe(-30_000);
  });

  it('sotuv menejeri va o‘qituvchi pulni qaytara olmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id, 300_000);
    const payment = await pay(token, student.id, 300_000);

    for (const role of ['SALES_MANAGER', 'TEACHER'] as const) {
      const { token: other } = await createUserWithToken(app, { role, email: `${role.toLowerCase()}@test.uz` });
      expect((await request(app).post(refundUrl(payment.id)).set(bearer(other)).send({ amount: 1_000, method: 'CASH', reason: 'Ruxsatsiz urinish' })).status).toBe(403);
    }
  });
});
