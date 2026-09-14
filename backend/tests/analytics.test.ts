import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

/** O‘quv markaz vaqti bilan 15-sentabr 14:00 */
const NOW = new Date('2026-09-15T09:00:00.000Z');
const RANGE = { from: '2026-09-01', to: '2026-09-15' };
const at = (value: string) => new Date(`${value}T09:00:00.000Z`);

describe.skipIf(!hasTestDatabase)('Analitika: unit economics, rentabellik, kohortlar, manbalar (integratsion)', () => {
  let owner: string;
  const ids = { teacher1: '', teacher2: '', teacher3: '', courseA: '', courseB: '', groupA: '', instagram: '', telegram: '' };

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));

    const teacher = async (email: string) => {
      await createUserWithToken(app, { role: 'TEACHER', email });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const profile = await prisma.teacherProfile.create({ data: { userId: user.id } });
      return { userId: user.id, profileId: profile.id };
    };
    const t1 = await teacher('t1@test.uz');
    const t2 = await teacher('t2@test.uz');
    const t3 = await teacher('t3@test.uz');
    Object.assign(ids, { teacher1: t1.userId, teacher2: t2.userId, teacher3: t3.userId });

    await prisma.expenseCategory.create({ data: { key: 'ADVERTISEMENT', name: 'Reklama' } });
    await prisma.transaction.create({ data: { type: 'EXPENSE', amount: 200_000, categoryName: 'Reklama', entityType: 'expense', occurredAt: at('2026-09-03') } });

    const instagram = await createSource('Instagram');
    const telegram = await createSource('Telegram');
    const courseA = await createCourse('Frontend');
    const courseB = await createCourse('Python');
    const groupA = await createGroup({ courseId: courseA.id, teacherId: t1.userId });
    const groupB = await createGroup({ courseId: courseB.id, teacherId: t2.userId });
    Object.assign(ids, { courseA: courseA.id, courseB: courseB.id, groupA: groupA.id, instagram: instagram.id, telegram: telegram.id });

    const leadA = await prisma.lead.create({
      data: { firstName: 'Ali', phone: '+998901000001', sourceId: instagram.id, status: 'WON', createdAt: at('2026-09-01'), convertedAt: at('2026-09-05') },
    });
    const leadB = await prisma.lead.create({
      data: { firstName: 'Vali', phone: '+998901000002', sourceId: telegram.id, status: 'WON', createdAt: at('2026-08-28'), convertedAt: at('2026-09-08') },
    });
    await prisma.lead.create({
      data: { firstName: 'Soli', phone: '+998901000003', sourceId: instagram.id, status: 'LOST', createdAt: at('2026-09-02'), updatedAt: at('2026-09-10') },
    });

    const student = (data: { phone: string; courseId: string; groupId: string; createdAt: Date; leadId?: string; status?: 'ACTIVE' | 'DROPPED'; statusChangedAt?: Date }) =>
      prisma.student.create({
        data: {
          firstName: 'O‘quvchi',
          lastName: 'Test',
          contractPrice: 1_000_000,
          startDate: data.createdAt,
          status: data.status ?? 'ACTIVE',
          statusChangedAt: data.statusChangedAt ?? null,
          phone: data.phone,
          courseId: data.courseId,
          groupId: data.groupId,
          createdAt: data.createdAt,
          leadId: data.leadId ?? null,
        },
      });
    const s1 = await student({ phone: '+998902000001', courseId: courseA.id, groupId: groupA.id, createdAt: at('2026-09-05'), leadId: leadA.id });
    const s2 = await student({ phone: '+998902000002', courseId: courseB.id, groupId: groupB.id, createdAt: at('2026-09-08'), leadId: leadB.id });
    const s3 = await student({
      phone: '+998902000003',
      courseId: courseA.id,
      groupId: groupA.id,
      createdAt: at('2026-07-10'),
      status: 'DROPPED',
      statusChangedAt: at('2026-08-20'),
    });

    const pay = (studentId: string, courseId: string, groupId: string, teacherId: string, amount: number, date: string) =>
      prisma.payment.create({ data: { studentId, courseId, groupId, teacherId, amount, method: 'CASH', paidAt: at(date) } });
    await pay(s1.id, courseA.id, groupA.id, t1.userId, 1_000_000, '2026-09-06');
    await pay(s2.id, courseB.id, groupB.id, t2.userId, 600_000, '2026-09-09');
    await pay(s3.id, courseA.id, groupA.id, t1.userId, 400_000, '2026-07-15');

    await prisma.teacherSalaryPeriod.createMany({
      data: [
        { teacherProfileId: t1.profileId, year: 2026, month: 9, salaryType: 'FIXED', totalAmount: 300_000 },
        { teacherProfileId: t2.profileId, year: 2026, month: 9, salaryType: 'FIXED', totalAmount: 150_000 },
        // Davrda tushum keltirmagan o'qituvchi — kursga taqsimlanmaydi
        { teacherProfileId: t3.profileId, year: 2026, month: 9, salaryType: 'FIXED', totalAmount: 90_000 },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('unit economics: CAC, lead narxi, haqiqiy LTV, o‘qish muddati, ARPU va qoplanish', async () => {
    const response = await request(app).get('/api/analytics/unit-economics').query(RANGE).set(bearer(owner));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
      newStudents: 2,
      leads: 2,
      wonLeads: 2,
      marketingSpend: 200_000,
      cac: 100_000,
      costPerLead: 100_000,
      ltv: 666_667,
      payingStudents: 3,
      avgLifetimeMonths: 1.4,
      monthlyArpu: 333_333,
      activeStudents: 2,
      ltvToCac: 6.7,
      paybackMonths: 0.3,
    });
  });

  it('rentabellik: maosh o‘qituvchi tushumi ulushida taqsimlanadi, tushumsiz maosh alohida', async () => {
    const courses = await request(app).get('/api/analytics/profitability').query(RANGE).set(bearer(owner));
    expect(courses.status).toBe(200);
    expect(courses.body.data.rows.map((row: { id: string }) => row.id)).toEqual([ids.courseA, ids.courseB]);
    expect(courses.body.data.rows[0]).toMatchObject({
      name: 'Frontend',
      revenue: 1_000_000,
      teacherCost: 300_000,
      contribution: 700_000,
      margin: 70,
      activeStudents: 1,
      revenuePerStudent: 1_000_000,
    });
    expect(courses.body.data.totals).toEqual({ revenue: 1_600_000, teacherCost: 450_000, unallocatedCost: 90_000, contribution: 1_060_000, margin: 66 });

    const teachers = await request(app).get('/api/analytics/profitability').query({ ...RANGE, dimension: 'teacher' }).set(bearer(owner));
    const idle = teachers.body.data.rows.find((row: { id: string }) => row.id === ids.teacher3);
    expect(idle).toMatchObject({ revenue: 0, teacherCost: 90_000, contribution: -90_000, margin: null });
    expect(teachers.body.data.totals).toMatchObject({ teacherCost: 540_000, unallocatedCost: 0, contribution: 1_060_000 });

    const groups = await request(app).get('/api/analytics/profitability').query({ ...RANGE, dimension: 'group' }).set(bearer(owner));
    expect(groups.body.data.rows.find((row: { id: string }) => row.id === ids.groupA)).toMatchObject({ revenue: 1_000_000, teacherCost: 300_000 });
  });

  it('kohortlar: qo‘shilgan oy bo‘yicha saqlanish va o‘quvchi boshiga tushum', async () => {
    const response = await request(app).get('/api/analytics/cohorts').query({ months: 3 }).set(bearer(owner));
    expect(response.status).toBe(200);
    expect(response.body.data.rows).toEqual([
      { key: '2026-07', label: 'Iyl 2026', size: 1, retention: [100, 0, 0], revenuePerStudent: 400_000, dropped: 1 },
      { key: '2026-08', label: 'Avg 2026', size: 0, retention: [null, null], revenuePerStudent: null, dropped: 0 },
      { key: '2026-09', label: 'Sen 2026', size: 2, retention: [100], revenuePerStudent: 800_000, dropped: 0 },
    ]);
    expect(response.body.data.average).toEqual([100, 0, 0]);
  });

  it('manbalar: konversiya, o‘quvchilar, sof tushum va sotuv tezligi; ruxsatsiz 403', async () => {
    const response = await request(app).get('/api/analytics/sources').query(RANGE).set(bearer(owner));
    expect(response.status).toBe(200);
    expect(response.body.data.rows).toEqual([
      { id: ids.instagram, name: 'Instagram', leads: 2, won: 1, lost: 1, conversion: 50, students: 1, revenue: 1_000_000, revenuePerLead: 500_000, avgDaysToConvert: 4 },
      { id: ids.telegram, name: 'Telegram', leads: 0, won: 1, lost: 0, conversion: 100, students: 1, revenue: 600_000, revenuePerLead: null, avgDaysToConvert: 11 },
    ]);
    expect(response.body.data.totals).toEqual({ leads: 2, won: 2, students: 2, revenue: 1_600_000, conversion: 67 });

    expect((await request(app).get('/api/analytics/profitability').query({ from: '2026-09-10', to: '2026-09-01' }).set(bearer(owner))).status).toBe(422);
    const csv = await request(app).get('/api/analytics/profitability/export').query({ ...RANGE, dimension: 'course', format: 'csv' }).set(bearer(owner));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Frontend');
    expect((await request(app).get('/api/analytics/cohorts/export').query({ months: 3, format: 'xlsx' }).set(bearer(owner))).status).toBe(200);
    expect((await request(app).get('/api/analytics/sources/export').query({ ...RANGE, format: 'csv' }).set(bearer(owner))).text).toContain('Instagram');

    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher-x@test.uz' });
    expect((await request(app).get('/api/analytics/sources').set(bearer(teacher))).status).toBe(403);
  });
});
