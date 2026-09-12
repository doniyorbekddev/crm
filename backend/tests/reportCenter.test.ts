import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Barcha ma'lumotlar aniq sanalar bilan yoziladi — hisobot davri so'rovda beriladi */
const AUGUST = { from: '2026-08-01', to: '2026-08-31' };

let counter = 0;

async function enroll(courseId: string, groupId: string, extra: { createdAt?: Date; status?: 'ACTIVE' | 'DROPPED'; statusChangedAt?: Date } = {}) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(2_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      status: extra.status ?? 'ACTIVE',
      statusChangedAt: extra.statusChangedAt ?? null,
      ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function report(token: string, type: string, params: Record<string, string> = {}) {
  return request(app).get(`/api/reports/${type}`).query({ ...AUGUST, ...params }).set(bearer(token));
}

async function ledger(type: 'INCOME' | 'EXPENSE' | 'TRANSFER', amount: number, date: string, extra: { entityType?: string | null; categoryName?: string } = {}) {
  return prisma.transaction.create({
    data: {
      type,
      amount,
      occurredAt: new Date(`${date}T09:00:00.000Z`),
      categoryName: extra.categoryName ?? null,
      entityType: extra.entityType === undefined ? (type === 'INCOME' ? 'income' : 'expense') : extra.entityType,
    },
  });
}

describe.skipIf(!hasTestDatabase)('Hisobotlar markazi — yangi hisobotlar (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Moliya', () => {
    it('foyda hisoboti o‘tkazma va boshlang‘ich qoldiqni hisobga olmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'OWNER' });
      await ledger('INCOME', 50_000_000, '2026-08-01', { entityType: 'opening-balance', categoryName: 'Boshlang‘ich qoldiq' });
      await ledger('INCOME', 2_000_000, '2026-08-05', { categoryName: 'Kitob' });
      await ledger('EXPENSE', 500_000, '2026-08-10', { categoryName: 'Ijara' });
      await ledger('EXPENSE', 1_000_000, '2026-08-12', { entityType: 'transfer', categoryName: 'O‘tkazma' });
      await ledger('TRANSFER', 1_000_000, '2026-08-12', { entityType: 'transfer', categoryName: 'O‘tkazma' });
      // entityType bo'lmagan eski yozuv ham hisobga olinishi kerak
      await ledger('INCOME', 300_000, '2026-08-20', { entityType: null, categoryName: 'Boshqa' });

      const response = await report(token, 'profit', { groupBy: 'month' });
      expect(response.status).toBe(200);
      expect(response.body.data.rows).toEqual([
        expect.objectContaining({ period: 'Avgust 2026', income: 2_300_000, expense: 500_000, profit: 1_800_000, margin: 78 }),
      ]);
      expect(response.body.data.totals).toMatchObject({ income: 2_300_000, expense: 500_000, profit: 1_800_000 });

      const incomes = await report(token, 'incomes');
      expect(incomes.body.data.rows.map((row: { category: string }) => row.category)).toEqual(['Kitob', 'Boshqa']);
      expect(incomes.body.data.kpis[0]).toMatchObject({ value: 2_300_000 });
    });

    it('xarajatlar hisoboti budjet rejasi bilan solishtiradi', async () => {
      const { token, user } = await createUserWithToken(app, { role: 'OWNER' });
      const rent = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });
      await prisma.budget.create({
        data: { year: 2026, month: 8, createdById: user.id, lines: { create: [{ categoryId: rent.id, plannedAmount: 1_000_000 }] } },
      });
      await ledger('EXPENSE', 500_000, '2026-08-10', { categoryName: 'Ijara' });

      const response = await report(token, 'expenses');
      expect(response.body.data.rows[0]).toMatchObject({ category: 'Ijara', total: 500_000, planned: 1_000_000, usage: 50 });
    });

    it('maosh hisoboti oylar bo‘yicha va "Jami"da darslarni qo‘shmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
      const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
      const profile = await prisma.teacherProfile.create({ data: { userId: teacher.id } });
      await prisma.teacherSalaryPeriod.create({
        data: {
          teacherProfileId: profile.id,
          year: 2026,
          month: 8,
          salaryType: 'PER_LESSON',
          lessonsCount: 12,
          studentsCount: 8,
          totalAmount: 2_000_000,
          paidAmount: 500_000,
          remainingAmount: 1_500_000,
          status: 'PARTIALLY_PAID',
        },
      });
      await prisma.teacherSalaryPeriod.create({
        data: { teacherProfileId: profile.id, year: 2026, month: 6, salaryType: 'PER_LESSON', totalAmount: 9_000_000 },
      });

      const response = await report(token, 'salaries');
      expect(response.status).toBe(200);
      expect(response.body.data.rows).toHaveLength(1);
      expect(response.body.data.rows[0]).toMatchObject({ period: '2026-yil avgust', salaryType: 'Dars uchun', status: 'Qisman to‘langan' });
      expect(response.body.data.totals).toEqual({ total: 2_000_000, paid: 500_000, remaining: 1_500_000 });
      expect(response.body.data.kpis[3]).toMatchObject({ value: 25 });
    });
  });

  describe('Ta’lim', () => {
    it('retention hisoboti ketgan va yangi o‘quvchilarni oylar bo‘yicha hisoblaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      await enroll(course.id, group.id, { createdAt: new Date('2026-06-10T09:00:00.000Z') });
      await enroll(course.id, group.id, {
        createdAt: new Date('2026-06-15T09:00:00.000Z'),
        status: 'DROPPED',
        statusChangedAt: new Date('2026-08-20T09:00:00.000Z'),
      });
      await enroll(course.id, group.id, { createdAt: new Date('2026-08-05T09:00:00.000Z') });

      const response = await report(token, 'retention', { from: '2026-07-01', to: '2026-08-31', groupBy: 'month' });
      expect(response.body.data.rows).toEqual([
        expect.objectContaining({ period: 'Iyul 2026', activeAtStart: 2, newStudents: 0, dropped: 0, retention: 100 }),
        expect.objectContaining({ period: 'Avgust 2026', activeAtStart: 2, newStudents: 1, dropped: 1, retention: 50 }),
      ]);
      expect(response.body.data.totals).not.toHaveProperty('activeAtStart');
    });

    it('gamification hisoboti davrdagi XP bo‘yicha saralaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const [first, second, outside] = [await enroll(course.id, group.id), await enroll(course.id, group.id), await enroll(course.id, group.id)];
      const xp = (studentId: string, points: number, date: string) =>
        prisma.xpTransaction.create({
          data: { studentId, points, source: 'MANUAL', description: 'Sinov', createdAt: new Date(`${date}T09:00:00.000Z`) },
        });
      await xp(first.id, 100, '2026-08-02');
      await xp(first.id, 50, '2026-08-03');
      await xp(second.id, 30, '2026-08-04');
      await xp(outside.id, 500, '2026-07-01');

      const response = await report(token, 'gamification');
      expect(response.body.data.rows.map((row: { xp: number; rank: number }) => [row.rank, row.xp])).toEqual([
        [1, 150],
        [2, 30],
      ]);
      expect(response.body.data.totals).toEqual({ xp: 180, badges: 0 });
    });

    it('o‘qituvchilar hisoboti darslar, davomat, tushum va maoshni jamlaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'OWNER' });
      const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Aziz', lastName: 'Karimov' });
      const profile = await prisma.teacherProfile.create({ data: { userId: teacher.id, specialization: 'Frontend' } });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
      const [present, absent] = [await enroll(course.id, group.id), await enroll(course.id, group.id)];

      await prisma.attendanceSession.create({ data: { groupId: group.id, teacherId: teacher.id, date: new Date('2026-08-10'), status: 'HELD' } });
      await prisma.attendance.createMany({
        data: [
          { studentId: present.id, groupId: group.id, date: new Date('2026-08-10'), status: 'PRESENT' },
          { studentId: absent.id, groupId: group.id, date: new Date('2026-08-10'), status: 'ABSENT' },
        ],
      });
      await prisma.payment.create({
        data: { studentId: present.id, courseId: course.id, amount: 700_000, method: 'CASH', paidAt: new Date('2026-08-11T09:00:00.000Z') },
      });
      await prisma.teacherSalaryPeriod.create({
        data: { teacherProfileId: profile.id, year: 2026, month: 8, salaryType: 'FIXED', totalAmount: 1_200_000 },
      });

      const response = await report(token, 'teachers');
      expect(response.body.data.rows[0]).toMatchObject({
        teacher: 'Aziz Karimov',
        groups: 1,
        students: 2,
        lessons: 1,
        attendance: 50,
        retention: 100,
        revenue: 700_000,
        salary: 1_200_000,
      });
    });
  });

  describe('Ruxsatlar', () => {
    it('modul ruxsati bo‘lmasa hisobot va eksport yopiq', async () => {
      // Buxgalterda report.view va salary.view bor, gamification.view yo'q
      const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

      expect((await report(token, 'salaries')).status).toBe(200);
      expect((await report(token, 'gamification')).status).toBe(403);
      const exported = await request(app).get('/api/reports/gamification/export').query(AUGUST).set(bearer(token));
      expect(exported.status).toBe(403);
    });
  });
});
