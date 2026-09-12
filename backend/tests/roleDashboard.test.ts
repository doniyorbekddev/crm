import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Chorshanba, o'quv markaz vaqti bilan 12:00 — guruh jadvali (Du/Ch/Ju) bo'yicha bugun dars bor */
const NOW = new Date('2026-09-16T07:00:00.000Z');

let counter = 0;
async function enroll(courseId: string, groupId: string) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(6_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Rol bo‘yicha dashboard (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi o‘z darslari, davomati va baholash navbatini ko‘radi', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const [present, absent] = [await enroll(course.id, group.id), await enroll(course.id, group.id)];

    await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-16', records: [{ studentId: present.id, status: 'PRESENT' }, { studentId: absent.id, status: 'ABSENT' }] });

    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Amaliyot', groupId: group.id, deadline: '2026-09-30T18:00:00.000Z' });
    await request(app)
      .put(`/api/homework/${homework.body.data.id}/submissions`)
      .set(bearer(token))
      .send({ records: [{ studentId: present.id, status: 'SUBMITTED' }] });
    await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Oraliq', groupId: group.id, date: '2026-09-19' });

    const response = await request(app).get('/api/dashboard/summary').set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.data.teaching).toEqual({
      groups: 1,
      students: 2,
      todayLessons: 1,
      markedLessons: 1,
      todayAbsent: 1,
      monthAttendanceRate: 50,
      pendingGrading: 1,
      upcomingExams: 1,
    });
    expect(response.body.data.money).toBeNull();
  });

  it('buxgalter oylik natija, kassalar va maosh navbatini ko‘radi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    await prisma.financialAccount.createMany({
      data: [
        { key: 'CASH', name: 'Naqd', type: 'CASH', balance: 5_000_000 },
        { key: 'BANK', name: 'Bank', type: 'BANK', balance: 1_000_000, isActive: false },
      ],
    });
    const at = (type: 'INCOME' | 'EXPENSE', amount: number, date: string, entityType: string) =>
      prisma.transaction.create({ data: { type, amount, entityType, occurredAt: new Date(`${date}T09:00:00.000Z`) } });
    await at('INCOME', 2_000_000, '2026-09-05', 'income');
    await at('EXPENSE', 700_000, '2026-09-06', 'expense');
    await at('INCOME', 10_000_000, '2026-09-01', 'opening-balance');
    await at('INCOME', 900_000, '2026-08-30', 'income'); // o'tgan oy

    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const profile = await prisma.teacherProfile.create({ data: { userId: teacher.id } });
    const period = (month: number, status: 'CALCULATED' | 'APPROVED' | 'PAID', remaining: number) =>
      prisma.teacherSalaryPeriod.create({
        data: { teacherProfileId: profile.id, year: 2026, month, salaryType: 'FIXED', totalAmount: 2_000_000, remainingAmount: remaining, status },
      });
    await period(9, 'CALCULATED', 1_200_000);
    await period(8, 'APPROVED', 800_000);
    await period(7, 'PAID', 0);

    const response = await request(app).get('/api/dashboard/summary').set(bearer(token));
    expect(response.body.data.money).toEqual({
      monthIncome: 2_000_000,
      monthExpense: 700_000,
      monthNetProfit: 1_300_000,
      cashBalance: 5_000_000,
      salaryDue: 2_000_000,
      salaryAwaitingApproval: 1,
    });
    expect(response.body.data.teaching).toBeNull();
  });

  it('admin o‘qituvchi bloki o‘rniga boshqaruv ko‘rsatkichlarini ko‘radi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const response = await request(app).get('/api/dashboard/summary').set(bearer(token));
    expect(response.body.data.teaching).toBeNull();
    expect(response.body.data.money).not.toBeNull();
  });
});
