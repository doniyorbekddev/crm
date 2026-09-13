import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Payroll ssenariylari 2026-yil mart oyi bo‘yicha */
const MARCH = { year: 2026, month: 3 };

let counter = 0;

async function teacherWithRule(adminToken: string, rule: Record<string, unknown>) {
  counter += 1;
  const { user, token } = await createUserWithToken(app, {
    role: 'TEACHER',
    email: `payroll${counter}@test.uz`,
    firstName: 'Muhammad',
    lastName: 'Rafiq',
  });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: user.id });
  const profile = await request(app).post('/api/teachers').set(bearer(adminToken)).send({ userId: user.id });
  expect(profile.status).toBe(201);
  const saved = await request(app)
    .post(`/api/teachers/${profile.body.data.id}/salary-rules`)
    .set(bearer(adminToken))
    .send({ effectiveFrom: '2026-01-01', ...rule });
  expect(saved.status).toBe(201);
  return { userId: user.id, token, profileId: profile.body.data.id as string, courseId: course.id, groupId: group.id };
}

async function calculate(token: string, teacherProfileId: string) {
  const response = await request(app).post('/api/salaries/calculate').set(bearer(token)).send({ ...MARCH, teacherProfileId });
  expect(response.status).toBe(200);
}

async function period(token: string, teacherProfileId: string) {
  const response = await request(app).get('/api/salaries/periods').query({ ...MARCH, teacherProfileId }).set(bearer(token));
  return response.body.data[0];
}

function adjust(token: string, teacherProfileId: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/salaries/adjustments')
    .set(bearer(token))
    .send({ teacherProfileId, ...MARCH, date: '2026-03-15', ...body });
}

describe.skipIf(!hasTestDatabase)('Payroll — bonus, jarima, avans va qayta ochish (integratsion)', () => {
  let adminToken: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: adminToken } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('4 500 000 foiz + 500 000 bonus − 100 000 jarima = 4 900 000; kim kiritgani va tasdiqlagani saqlanadi', async () => {
    const teacher = await teacherWithRule(adminToken, { type: 'PERCENTAGE', percentage: 30 });
    for (let index = 0; index < 3; index += 1) {
      counter += 1;
      const student = await prisma.student.create({
        data: {
          firstName: `O‘quvchi${counter}`,
          lastName: 'Aliyev',
          phone: `+99894${String(1_000_000 + counter)}`,
          courseId: teacher.courseId,
          groupId: teacher.groupId,
          contractPrice: 5_000_000,
          startDate: new Date('2026-01-10'),
          debt: { create: { totalAmount: 5_000_000, remainingAmount: 5_000_000 } },
        },
      });
      const paid = await request(app)
        .post('/api/payments')
        .set(bearer(adminToken))
        .send({ studentId: student.id, amount: 5_000_000, method: 'CASH', paidAt: '2026-03-10T09:00:00.000Z' });
      expect(paid.status).toBe(201);
    }
    await calculate(adminToken, teacher.profileId);

    const bonus = await adjust(adminToken, teacher.profileId, { type: 'BONUS', category: 'PERFORMANCE', amount: 500_000, reason: 'Imtihon natijalari yuqori' });
    expect(bonus.status).toBe(201);
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' });
    const penalty = await adjust(accountantToken, teacher.profileId, {
      type: 'PENALTY',
      category: 'LATENESS',
      amount: 100_000,
      reason: 'Darsga 20 daqiqa kechikdi',
      date: '2026-03-18',
    });
    expect(penalty.status).toBe(201);
    expect(penalty.body.data).toMatchObject({ percentageAmount: 4_500_000, bonus: 500_000, penalty: 100_000, totalAmount: 4_900_000 });

    const [penaltyRow, bonusRow] = penalty.body.data.adjustments;
    expect(bonusRow).toMatchObject({ type: 'BONUS', category: 'PERFORMANCE', reason: 'Imtihon natijalari yuqori', date: '2026-03-15' });
    expect(bonusRow.approvedBy).not.toBeNull();
    // Buxgalterda tasdiqlash ruxsati yo'q — yozuv maosh tasdiqlanguncha kutadi
    expect(penaltyRow).toMatchObject({ type: 'PENALTY', category: 'LATENESS', approvedBy: null });
    expect(penaltyRow.createdBy).not.toBeNull();

    // Backend validatsiya: toifa turga mos, sana oy ichida, summa musbat
    expect((await adjust(adminToken, teacher.profileId, { type: 'BONUS', category: 'LATENESS', amount: 10_000, reason: 'Noto‘g‘ri toifa' })).status).toBe(422);
    expect((await adjust(adminToken, teacher.profileId, { type: 'BONUS', category: 'SPECIAL', amount: 10_000, reason: 'Boshqa oy', date: '2026-04-02' })).status).toBe(422);
    expect((await adjust(adminToken, teacher.profileId, { type: 'PENALTY', category: 'OTHER', amount: -5_000, reason: 'Manfiy summa' })).status).toBe(422);

    expect(await prisma.notification.count({ where: { userId: teacher.userId, title: 'Jarima qo‘shildi' } })).toBe(1);

    const current = await period(adminToken, teacher.profileId);
    const approved = await request(app).post(`/api/salaries/periods/${current.id}/approve`).set(bearer(adminToken));
    expect(approved.status).toBe(200);
    expect(approved.body.data.adjustments.every((row: { approvedBy: unknown }) => row.approvedBy !== null)).toBe(true);
    expect((await adjust(adminToken, teacher.profileId, { type: 'BONUS', category: 'SPECIAL', amount: 50_000, reason: 'Kech qo‘shildi' })).status).toBe(409);
  });

  it('avans: 5 000 000 maoshdan 2 000 000 avans → qolgan 3 000 000; jarimani bekor qilish tarixni saqlaydi', async () => {
    const teacher = await teacherWithRule(adminToken, { type: 'FIXED', baseSalary: 5_000_000 });
    await calculate(adminToken, teacher.profileId);
    const calculated = await period(adminToken, teacher.profileId);
    expect(calculated.totalAmount).toBe(5_000_000);

    const payUrl = `/api/salaries/periods/${calculated.id}/payments`;
    expect((await request(app).post(payUrl).set(bearer(adminToken)).send({ amount: 1_000_000, method: 'CASH' })).status).toBe(422);

    const advance = await request(app)
      .post(payUrl)
      .set(bearer(adminToken))
      .send({ kind: 'ADVANCE', amount: 2_000_000, method: 'CASH', note: 'Oy o‘rtasida avans' });
    expect(advance.status).toBe(200);
    expect(advance.body.data).toMatchObject({ status: 'CALCULATED', paidAmount: 2_000_000, remainingAmount: 3_000_000 });
    expect(advance.body.data.payments[0]).toMatchObject({ kind: 'ADVANCE', amount: 2_000_000 });
    expect(await prisma.expense.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'salary.advance_paid' } })).toBe(1);
    expect((await request(app).post(payUrl).set(bearer(adminToken)).send({ kind: 'ADVANCE', amount: 3_500_000, method: 'CASH' })).status).toBe(422);

    // Qayta hisoblash avansni saqlaydi
    await calculate(adminToken, teacher.profileId);
    expect(await period(adminToken, teacher.profileId)).toMatchObject({ status: 'CALCULATED', paidAmount: 2_000_000, remainingAmount: 3_000_000 });

    // Jarima avansdan keyin maoshni avansdan kichik qilsa — tasdiqlanmaydi
    const bigPenalty = await adjust(adminToken, teacher.profileId, { type: 'PENALTY', category: 'DISCIPLINE', amount: 3_500_000, reason: 'Katta jarima' });
    expect(bigPenalty.body.data).toMatchObject({ totalAmount: 1_500_000, remainingAmount: 0 });
    expect((await request(app).post(`/api/salaries/periods/${calculated.id}/approve`).set(bearer(adminToken))).status).toBe(422);

    const penaltyId = bigPenalty.body.data.adjustments[0].id as string;
    const voided = await request(app).post(`/api/salaries/adjustments/${penaltyId}/void`).set(bearer(adminToken)).send({ reason: 'Xato kiritilgan' });
    expect(voided.status).toBe(200);
    expect(voided.body.data).toMatchObject({ penalty: 0, totalAmount: 5_000_000, remainingAmount: 3_000_000 });
    expect(voided.body.data.adjustments[0]).toMatchObject({ id: penaltyId, voidReason: 'Xato kiritilgan', amount: 3_500_000 });
    expect((await request(app).post(`/api/salaries/adjustments/${penaltyId}/void`).set(bearer(adminToken)).send({ reason: 'Yana' })).status).toBe(409);

    const approved = await request(app).post(`/api/salaries/periods/${calculated.id}/approve`).set(bearer(adminToken));
    expect(approved.body.data).toMatchObject({ status: 'PARTIALLY_PAID', remainingAmount: 3_000_000 });
    expect((await request(app).post(payUrl).set(bearer(adminToken)).send({ kind: 'ADVANCE', amount: 1_000_000, method: 'CASH' })).status).toBe(422);

    const rest = await request(app).post(payUrl).set(bearer(adminToken)).send({ amount: 3_000_000, method: 'CARD' });
    expect(rest.body.data).toMatchObject({ status: 'PAID', paidAmount: 5_000_000, remainingAmount: 0 });
  });

  it('qayta ochish: faqat salary.unlock, sabab majburiy, audit; maosh to‘langan bo‘lsa ochilmaydi', async () => {
    const teacher = await teacherWithRule(adminToken, { type: 'FIXED', baseSalary: 1_000_000 });
    await calculate(adminToken, teacher.profileId);
    const current = await period(adminToken, teacher.profileId);
    await request(app).post(`/api/salaries/periods/${current.id}/approve`).set(bearer(adminToken)).expect(200);

    const unlockUrl = `/api/salaries/periods/${current.id}/unlock`;
    expect((await request(app).post(unlockUrl).set(bearer(adminToken)).send({ reason: 'Xato hisob' })).status).toBe(403);

    const { token: ownerToken } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    expect((await request(app).post(unlockUrl).set(bearer(ownerToken)).send({})).status).toBe(422);

    const unlocked = await request(app).post(unlockUrl).set(bearer(ownerToken)).send({ reason: 'Darslar soni noto‘g‘ri kiritilgan' });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data).toMatchObject({ status: 'CALCULATED', lockedAt: null, unlockReason: 'Darslar soni noto‘g‘ri kiritilgan' });
    expect(unlocked.body.data.unlockedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'salary.unlocked' } });
    expect(audit?.metadata).toMatchObject({ reason: 'Darslar soni noto‘g‘ri kiritilgan' });

    // Ochilgan maoshga tuzatish kiritiladi va qayta tasdiqlanadi
    expect((await adjust(adminToken, teacher.profileId, { type: 'BONUS', category: 'MONTHLY', amount: 100_000, reason: 'Tuzatish bonusi' })).status).toBe(201);
    await request(app).post(`/api/salaries/periods/${current.id}/approve`).set(bearer(adminToken)).expect(200);
    await request(app).post(`/api/salaries/periods/${current.id}/payments`).set(bearer(adminToken)).send({ amount: 100_000, method: 'CASH' }).expect(200);
    expect((await request(app).post(unlockUrl).set(bearer(ownerToken)).send({ reason: 'Yana ochish' })).status).toBe(409);
  });

  it('/api/payroll yo‘llari maosh API bilan bir xil ishlaydi', async () => {
    const teacher = await teacherWithRule(adminToken, { type: 'FIXED', baseSalary: 2_000_000 });
    expect((await request(app).post('/api/payroll/calculate').set(bearer(adminToken)).send(MARCH)).status).toBe(200);

    const list = await request(app).get('/api/payroll').query(MARCH).set(bearer(adminToken));
    expect(list.body.data).toHaveLength(1);
    const id = list.body.data[0].id as string;
    expect((await request(app).get(`/api/payroll/${id}`).set(bearer(adminToken))).body.data.totalAmount).toBe(2_000_000);
    expect((await request(app).post(`/api/payroll/${id}/approve`).set(bearer(adminToken))).status).toBe(200);
    const paid = await request(app).post(`/api/payroll/${id}/pay`).set(bearer(adminToken)).send({ amount: 2_000_000, method: 'CASH' });
    expect(paid.body.data.status).toBe('PAID');

    expect((await request(app).get('/api/payroll').set(bearer(teacher.token))).status).toBe(403);
  });
});
