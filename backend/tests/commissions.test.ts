import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { nextMonth } from '../src/services/commission.service.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Tasdiqlash va qaytarish ssenariylari o‘tgan oy bo‘yicha: 2026-yil mart */
const MARCH = { year: 2026, month: 3 };
const APRIL = { year: 2026, month: 4 };
const inMonth = (value: { year: number; month: number }, day = 10) =>
  new Date(Date.UTC(value.year, value.month - 1, day, 9)).toISOString();

let counter = 0;

interface TeacherFixture {
  userId: string;
  token: string;
  profileId: string;
  groupId: string;
}

async function createTeacher(adminToken: string, courseId: string, percentage: number, name: string): Promise<TeacherFixture> {
  counter += 1;
  const { user, token } = await createUserWithToken(app, {
    role: 'TEACHER',
    email: `teacher${counter}@test.uz`,
    firstName: name,
    lastName: 'Rafiq',
  });
  const group = await createGroup({ courseId, teacherId: user.id });
  const profile = await request(app).post('/api/teachers').set(bearer(adminToken)).send({ userId: user.id });
  expect(profile.status).toBe(201);
  const rule = await request(app)
    .post(`/api/teachers/${profile.body.data.id}/salary-rules`)
    .set(bearer(adminToken))
    .send({ type: 'PERCENTAGE', percentage, effectiveFrom: '2026-01-01' });
  expect(rule.status).toBe(201);
  return { userId: user.id, token, profileId: profile.body.data.id as string, groupId: group.id };
}

async function enroll(courseId: string, groupId: string, contract: number) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Aliyev',
      phone: `+99893${String(1_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: contract,
      startDate: new Date('2026-01-10'),
      debt: { create: { totalAmount: contract, remainingAmount: contract } },
    },
  });
}

async function pay(token: string, studentId: string, amount: number, paidAt: string) {
  const response = await request(app).post('/api/payments').set(bearer(token)).send({ studentId, amount, method: 'CASH', paidAt });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; code: string };
}

async function cancel(token: string, paymentId: string) {
  const response = await request(app).delete(`/api/payments/${paymentId}`).set(bearer(token)).send({ reason: 'To‘lov qaytarildi' });
  expect(response.status).toBe(200);
}

async function calculate(token: string, value: { year: number; month: number }, teacherProfileId?: string) {
  const response = await request(app)
    .post('/api/salaries/calculate')
    .set(bearer(token))
    .send({ ...value, ...(teacherProfileId ? { teacherProfileId } : {}) });
  expect(response.status).toBe(200);
  return response;
}

async function period(token: string, profileId: string, value: { year: number; month: number }) {
  const response = await request(app).get('/api/salaries/periods').query({ ...value, teacherProfileId: profileId }).set(bearer(token));
  return response.body.data[0];
}

async function detail(token: string, profileId: string, value: { year: number; month: number }) {
  const response = await request(app).get(`/api/teacher-commissions/${profileId}`).query(value).set(bearer(token));
  expect(response.status).toBe(200);
  return response.body.data;
}

describe.skipIf(!hasTestDatabase)('O‘qituvchi foizi — real to‘lovlardan (integratsion)', () => {
  let adminToken: string;
  let courseId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: adminToken } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'owner@test.uz' }));
    courseId = (await createCourse()).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('15 000 000 real tushumdan 30% = 4 500 000; to‘lanmagan qarz hisobga kirmaydi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 30, 'Muhammad');
    for (let index = 0; index < 3; index += 1) {
      // Shartnoma 6 mln, to'langani 5 mln — qolgan 1 mln qarz foizga kirmaydi
      const student = await enroll(courseId, teacher.groupId, 6_000_000);
      await pay(adminToken, student.id, 5_000_000, inMonth(MARCH));
    }

    const march = await detail(adminToken, teacher.profileId, MARCH);
    expect(march.month).toMatchObject({ students: 3, payments: 3, revenue: 15_000_000, percentage: 30, commission: 4_500_000 });
    expect(march.entries).toHaveLength(3);
    expect(march.entries.every((entry: { kind: string; amount: number }) => entry.kind === 'ACCRUAL' && entry.amount === 1_500_000)).toBe(true);

    await calculate(adminToken, MARCH);
    expect(await period(adminToken, teacher.profileId, MARCH)).toMatchObject({
      groupRevenue: 15_000_000,
      percentageAmount: 4_500_000,
      totalAmount: 4_500_000,
    });

    const list = await request(app).get('/api/teacher-commissions').query(MARCH).set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({
      teacher: { firstName: 'Muhammad' },
      revenue: 15_000_000,
      commission: 4_500_000,
      salary: { totalAmount: 4_500_000, status: 'CALCULATED' },
    });
  });

  it('qisman to‘lov: 600 000 lik kursdan 300 000 → 90 000; qolgani to‘langan oyga tushadi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 30, 'Aziz');
    const student = await enroll(courseId, teacher.groupId, 600_000);
    await pay(adminToken, student.id, 300_000, inMonth(MARCH));
    expect((await detail(adminToken, teacher.profileId, MARCH)).month.commission).toBe(90_000);

    await pay(adminToken, student.id, 300_000, inMonth(APRIL));
    const april = await detail(adminToken, teacher.profileId, APRIL);
    expect(april.month).toMatchObject({ revenue: 300_000, commission: 90_000 });
    // Tarix: yangisi birinchi — aprel, keyin mart
    expect(april.history.slice(0, 2).map((row: { month: number; commission: number }) => [row.month, row.commission])).toEqual([
      [4, 90_000],
      [3, 90_000],
    ]);
  });

  it('tasdiqlanmagan oyda bekor qilingan to‘lov: yozuvlar saqlanadi, qayta hisoblash talab qilinadi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 30, 'Bekzod');
    const student = await enroll(courseId, teacher.groupId, 600_000);
    const payment = await pay(adminToken, student.id, 600_000, inMonth(MARCH));
    await calculate(adminToken, MARCH);
    const calculated = await period(adminToken, teacher.profileId, MARCH);
    expect(calculated.percentageAmount).toBe(180_000);

    await cancel(adminToken, payment.id);
    const march = await detail(adminToken, teacher.profileId, MARCH);
    expect(march.entries.map((entry: { kind: string; amount: number }) => [entry.kind, entry.amount]).sort()).toEqual([
      ['ACCRUAL', 180_000],
      ['REVERSAL', -180_000],
    ]);
    expect(march.month.commission).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'commission.reversed' } })).toBe(1);

    // Hisob eskirgan — tasdiqlanmaydi
    const stale = await request(app).post(`/api/salaries/periods/${calculated.id}/approve`).set(bearer(adminToken));
    expect(stale.status).toBe(409);

    await calculate(adminToken, MARCH);
    expect(await period(adminToken, teacher.profileId, MARCH)).toMatchObject({ percentageAmount: 0, totalAmount: 0 });
  });

  it('tasdiqlangan oyda qaytarilgan to‘lov: −180 000 keyingi ochiq oyga, manfiy qoldiq ko‘chiriladi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 30, 'Sardor');
    const student = await enroll(courseId, teacher.groupId, 600_000);
    const payment = await pay(adminToken, student.id, 600_000, inMonth(MARCH));
    await calculate(adminToken, MARCH);
    const marchPeriod = await period(adminToken, teacher.profileId, MARCH);
    const approved = await request(app).post(`/api/salaries/periods/${marchPeriod.id}/approve`).set(bearer(adminToken));
    expect(approved.status).toBe(200);

    await cancel(adminToken, payment.id);

    // Mart tarixi o'zgarmaydi
    const march = await detail(adminToken, teacher.profileId, MARCH);
    expect(march.entries).toHaveLength(1);
    expect(march.entries[0]).toMatchObject({ kind: 'ACCRUAL', amount: 180_000, locked: true });
    expect(await period(adminToken, teacher.profileId, MARCH)).toMatchObject({ percentageAmount: 180_000, status: 'APPROVED' });

    // Teskari yozuv joriy (ochiq) oyda
    const current = currentBusinessMonth();
    const now = await detail(adminToken, teacher.profileId, current);
    expect(now.entries).toEqual([expect.objectContaining({ kind: 'REVERSAL', amount: -180_000, locked: false })]);

    await calculate(adminToken, current, teacher.profileId);
    const currentPeriod = await period(adminToken, teacher.profileId, current);
    expect(currentPeriod).toMatchObject({ percentageAmount: -180_000, totalAmount: 0 });

    const carried = await request(app).post(`/api/salaries/periods/${currentPeriod.id}/approve`).set(bearer(adminToken));
    expect(carried.status).toBe(200);
    expect(carried.body.data).toMatchObject({ status: 'APPROVED', percentageAmount: 0, totalAmount: 0 });

    const following = await detail(adminToken, teacher.profileId, nextMonth(current));
    expect(following.entries).toEqual([expect.objectContaining({ kind: 'CARRY_OVER', amount: -180_000 })]);
    expect(await prisma.auditLog.count({ where: { action: 'commission.carried_over' } })).toBe(1);
  }, 30_000);

  it('foiz to‘lov paytidagi o‘qituvchiga: o‘quvchi guruhini almashtirsa tarix o‘zgarmaydi', async () => {
    const first = await createTeacher(adminToken, courseId, 30, 'Birinchi');
    const second = await createTeacher(adminToken, courseId, 20, 'Ikkinchi');
    const student = await enroll(courseId, first.groupId, 3_000_000);

    await pay(adminToken, student.id, 1_000_000, inMonth(MARCH, 5));
    await prisma.student.update({ where: { id: student.id }, data: { groupId: second.groupId } });
    await pay(adminToken, student.id, 1_000_000, inMonth(MARCH, 20));

    await calculate(adminToken, MARCH);
    expect(await period(adminToken, first.profileId, MARCH)).toMatchObject({ groupRevenue: 1_000_000, percentageAmount: 300_000 });
    expect(await period(adminToken, second.profileId, MARCH)).toMatchObject({ groupRevenue: 1_000_000, percentageAmount: 200_000 });
  });

  it('hisoblangandan keyingi to‘lov va model o‘zgarishi qayta hisoblashda yangilanadi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 30, 'Dilshod');
    const student = await enroll(courseId, teacher.groupId, 2_000_000);
    await pay(adminToken, student.id, 1_000_000, inMonth(MARCH, 3));
    await calculate(adminToken, MARCH);
    const calculated = await period(adminToken, teacher.profileId, MARCH);
    expect(calculated.percentageAmount).toBe(300_000);

    await pay(adminToken, student.id, 500_000, inMonth(MARCH, 15));
    expect((await request(app).post(`/api/salaries/periods/${calculated.id}/approve`).set(bearer(adminToken))).status).toBe(409);

    // Martdan boshlab 40%
    const rule = await request(app)
      .post(`/api/teachers/${teacher.profileId}/salary-rules`)
      .set(bearer(adminToken))
      .send({ type: 'PERCENTAGE', percentage: 40, effectiveFrom: '2026-03-01' });
    expect(rule.status).toBe(201);
    await calculate(adminToken, MARCH);
    const recalculated = await period(adminToken, teacher.profileId, MARCH);
    expect(recalculated).toMatchObject({ groupRevenue: 1_500_000, percentageAmount: 600_000 });
    const entries = (await detail(adminToken, teacher.profileId, MARCH)).entries as Array<{ percentage: number }>;
    expect(entries.every((entry) => entry.percentage === 40)).toBe(true);

    expect((await request(app).post(`/api/salaries/periods/${recalculated.id}/approve`).set(bearer(adminToken))).status).toBe(200);
  });

  it('o‘qituvchi faqat o‘z daromadini ko‘radi', async () => {
    const teacher = await createTeacher(adminToken, courseId, 25, 'Zilola');
    const student = await enroll(courseId, teacher.groupId, 1_000_000);
    await pay(adminToken, student.id, 400_000, inMonth(MARCH));

    const own = await request(app).get('/api/teacher-commissions/me').query(MARCH).set(bearer(teacher.token));
    expect(own.status).toBe(200);
    expect(own.body.data.teacher.profileId).toBe(teacher.profileId);
    expect(own.body.data.month).toMatchObject({ revenue: 400_000, percentage: 25, commission: 100_000 });

    expect((await request(app).get('/api/teacher-commissions').set(bearer(teacher.token))).status).toBe(403);
    expect((await request(app).get(`/api/teacher-commissions/${teacher.profileId}`).set(bearer(teacher.token))).status).toBe(403);
    // Rahbar rolida shaxsiy sahifa ruxsati yo'q
    expect((await request(app).get('/api/teacher-commissions/me').set(bearer(adminToken))).status).toBe(403);
  });
});
