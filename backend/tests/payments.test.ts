import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

let phoneCounter = 0;

interface EnrollOptions {
  courseId: string;
  groupId?: string;
  contractPrice?: number;
  leadId?: string;
  firstName?: string;
}

async function enroll(options: EnrollOptions) {
  phoneCounter += 1;
  const price = options.contractPrice ?? 1_000_000;
  return prisma.student.create({
    data: {
      firstName: options.firstName ?? 'Ali',
      lastName: 'Valiyev',
      phone: `+99890${String(2_000_000 + phoneCounter)}`,
      courseId: options.courseId,
      groupId: options.groupId ?? null,
      leadId: options.leadId ?? null,
      contractPrice: price,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Payments API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('to‘lov qabul qiladi va qarzdorlikni kamaytiradi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id, contractPrice: 2_000_000 });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    const created = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 500_000, method: 'CASH', comment: 'Birinchi to‘lov' });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      amount: 500_000,
      method: 'CASH',
      comment: 'Birinchi to‘lov',
      isDeleted: false,
      student: { firstName: 'Ali' },
      course: { name: course.name },
    });
    expect(created.body.data.code).toMatch(/^PM-\d{6}$/);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.paidAmount.toNumber()).toBe(500_000);
    expect(debt.remainingAmount.toNumber()).toBe(1_500_000);
    expect(debt.status).toBe('PARTIAL');
  });

  it('to‘liq to‘langanda qarz PAID bo‘ladi, ortiqcha to‘lov 422 qaytaradi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id, contractPrice: 1_000_000 });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    const first = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 1_000_000, method: 'CARD' });
    const overpay = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 10_000, method: 'CASH' });

    expect(first.status).toBe(201);
    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.status).toBe('PAID');
    expect(debt.remainingAmount.toNumber()).toBe(0);
    expect(overpay.status).toBe(422);
    expect(overpay.body.errors[0].field).toBe('amount');
  });

  it('to‘lovni bekor qiladi: sabab saqlanadi va qarz qayta hisoblanadi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id, contractPrice: 1_000_000 });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const created = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 400_000, method: 'CASH' });
    const paymentId = created.body.data.id as string;

    const noReason = await request(app).delete(`/api/payments/${paymentId}`).set(bearer(token)).send({ reason: 'xato' });
    const removed = await request(app)
      .delete(`/api/payments/${paymentId}`)
      .set(bearer(token))
      .send({ reason: 'Ikki marta kiritilgan' });
    const again = await request(app)
      .delete(`/api/payments/${paymentId}`)
      .set(bearer(token))
      .send({ reason: 'Ikki marta kiritilgan' });

    expect(noReason.status).toBe(422);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ isDeleted: true, deleteReason: 'Ikki marta kiritilgan' });
    expect(removed.body.data.deletedBy).not.toBeNull();
    expect(again.status).toBe(409);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.paidAmount.toNumber()).toBe(0);
    expect(debt.remainingAmount.toNumber()).toBe(1_000_000);
    expect(debt.status).toBe('UNPAID');
  });

  it('bekor qilingan to‘lov ro‘yxatda ko‘rinmaydi, includeDeleted bilan ko‘rinadi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const first = await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 100_000, method: 'CASH' });
    await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 200_000, method: 'PAYME' });
    await request(app).delete(`/api/payments/${first.body.data.id}`).set(bearer(token)).send({ reason: 'Test uchun bekor' });

    const list = await request(app).get('/api/payments').set(bearer(token));
    const withDeleted = await request(app).get('/api/payments?includeDeleted=true').set(bearer(token));
    const stats = await request(app).get('/api/payments/stats').set(bearer(token));

    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
    expect(withDeleted.body.data).toHaveLength(2);
    expect(stats.body.data).toMatchObject({ total: 200_000, count: 1 });
    expect(stats.body.data.byMethod).toEqual([{ method: 'PAYME', total: 200_000, count: 1 }]);
  });

  it('filtrlaydi: usul, sana oralig‘i, guruh va kvitansiya raqami', async () => {
    const course = await createCourse();
    const otherCourse = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const inGroup = await enroll({ courseId: course.id, groupId: group.id, firstName: 'Guruhli' });
    const outsideGroup = await enroll({ courseId: otherCourse.id, firstName: 'Guruhsiz' });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    const first = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: inGroup.id, amount: 300_000, method: 'CASH', paidAt: '2026-09-10T10:00:00.000Z' });
    await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: outsideGroup.id, amount: 150_000, method: 'CLICK', paidAt: '2026-09-20T10:00:00.000Z' });

    const byMethod = await request(app).get('/api/payments?method=CLICK').set(bearer(token));
    const byRange = await request(app).get('/api/payments?from=2026-09-01&to=2026-09-15').set(bearer(token));
    const byGroup = await request(app).get(`/api/payments?groupId=${group.id}`).set(bearer(token));
    const byReceipt = await request(app).get(`/api/payments?search=${first.body.data.code}`).set(bearer(token));

    expect(byMethod.body.data.map((item: { amount: number }) => item.amount)).toEqual([150_000]);
    expect(byRange.body.data.map((item: { amount: number }) => item.amount)).toEqual([300_000]);
    expect(byGroup.body.data.map((item: { amount: number }) => item.amount)).toEqual([300_000]);
    expect(byReceipt.body.data).toHaveLength(1);
    expect(byReceipt.body.data[0].id).toBe(first.body.data.id);
  });

  it('to‘lov lead egasiga (manager) bog‘lanadi va unga bildirishnoma yuboriladi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, courseId: course.id, assignedToId: manager.id });
    const student = await enroll({ courseId: course.id, leadId: lead.id });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    const created = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 250_000, method: 'UZUM' });

    expect(created.status).toBe(201);
    expect(created.body.data.manager).toMatchObject({ id: manager.id });
    expect(created.body.data.accountant).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { userId: manager.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('NEW_PAYMENT');

    const byManager = await request(app).get(`/api/payments?managerId=${manager.id}`).set(bearer(token));
    expect(byManager.body.data).toHaveLength(1);
  });

  it('ruxsatlarni tekshiradi: manager to‘lov qabul qila olmaydi, buxgalter bekor qila oladi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id });
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });

    const managerCreate = await request(app)
      .post('/api/payments')
      .set(bearer(managerToken))
      .send({ studentId: student.id, amount: 100_000, method: 'CASH' });
    const teacherList = await request(app).get('/api/payments').set(bearer(teacherToken));
    const accountantCreate = await request(app)
      .post('/api/payments')
      .set(bearer(accountantToken))
      .send({ studentId: student.id, amount: 100_000, method: 'CASH' });

    expect(managerCreate.status).toBe(403);
    expect(teacherList.status).toBe(403);
    expect(accountantCreate.status).toBe(201);
  });

  it('o‘chirilgan o‘quvchiga yoki noto‘g‘ri summaga to‘lov qabul qilmaydi', async () => {
    const course = await createCourse();
    const student = await enroll({ courseId: course.id });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    await prisma.student.update({ where: { id: student.id }, data: { deletedAt: new Date() } });

    const deletedStudent = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 100_000, method: 'CASH' });
    const tooSmall = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 500, method: 'CASH' });

    expect(deletedStudent.status).toBe(422);
    expect(tooSmall.status).toBe(422);
  });
});

describe.skipIf(!hasTestDatabase)('Debts API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('qarzdorlarni oraliqlar bo‘yicha filtrlaydi va umumiy hisobni qaytaradi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const big = await enroll({ courseId: course.id, contractPrice: 3_000_000, firstName: 'Katta' });
    const small = await enroll({ courseId: course.id, contractPrice: 400_000, firstName: 'Kichik' });
    const paid = await enroll({ courseId: course.id, contractPrice: 500_000, firstName: 'Tolagan' });
    await request(app).post('/api/payments').set(bearer(token)).send({ studentId: paid.id, amount: 500_000, method: 'CASH' });

    const all = await request(app).get('/api/debts').set(bearer(token));
    const bigRange = await request(app).get('/api/debts?range=1m-plus').set(bearer(token));
    const zeroRange = await request(app).get('/api/debts?range=zero').set(bearer(token));
    const summary = await request(app).get('/api/debts/summary').set(bearer(token));

    expect(all.body.data).toHaveLength(3);
    // Standart tartib: eng katta qarz birinchi
    expect(all.body.data[0]).toMatchObject({ studentId: big.id, remaining: 3_000_000, status: 'UNPAID' });
    expect(bigRange.body.data.map((item: { studentId: string }) => item.studentId)).toEqual([big.id]);
    expect(zeroRange.body.data.map((item: { studentId: string }) => item.studentId)).toEqual([paid.id]);
    expect(zeroRange.body.data[0]).toMatchObject({ status: 'PAID', paid: 500_000 });
    expect(zeroRange.body.data[0].lastPayment).toMatchObject({ amount: 500_000 });
    expect(summary.body.data).toMatchObject({
      totalRemaining: 3_400_000,
      totalPaid: 500_000,
      totalContracts: 3_900_000,
      students: 3,
    });
    expect(summary.body.data.byRange['1m-plus']).toMatchObject({ students: 1, remaining: 3_000_000 });
    expect(summary.body.data.byRange.upto500k).toMatchObject({ students: 1, remaining: 400_000 });
    expect(summary.body.data.byRange.zero.students).toBe(1);
    expect(small.id).toBeTruthy();
  });

  it('qidiradi, kurs bo‘yicha filtrlaydi va ruxsatni tekshiradi', async () => {
    const course = await createCourse();
    const otherCourse = await createCourse();
    await enroll({ courseId: course.id, firstName: 'Nodira' });
    await enroll({ courseId: otherCourse.id, firstName: 'Sardor' });
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });

    const byName = await request(app).get('/api/debts?search=Nodira').set(bearer(token));
    const byCourse = await request(app).get(`/api/debts?courseId=${otherCourse.id}`).set(bearer(token));
    const forbidden = await request(app).get('/api/debts').set(bearer(teacherToken));

    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0].firstName).toBe('Nodira');
    expect(byCourse.body.data).toHaveLength(1);
    expect(byCourse.body.data[0].firstName).toBe('Sardor');
    expect(forbidden.status).toBe(403);
  });
});
