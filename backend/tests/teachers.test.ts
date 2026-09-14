import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Hisob-kitoblar 2026-yil sentabr oyi bo‘yicha tekshiriladi */
const YEAR = 2026;
const MONTH = 9;

let phoneCounter = 0;

async function enroll(courseId: string, groupId: string) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${phoneCounter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(7_000_000 + phoneCounter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      status: 'ACTIVE',
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

/** Guruhda o‘tkazilgan darslar (HELD seanslar) */
async function holdLessons(groupId: string, teacherId: string, days: number[]) {
  for (const day of days) {
    await prisma.attendanceSession.create({
      data: {
        groupId,
        teacherId,
        date: new Date(Date.UTC(YEAR, MONTH - 1, day)),
        status: 'HELD',
      },
    });
  }
}

async function addPayment(studentId: string, courseId: string, amount: number, day = 10) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { groupId: true, group: { select: { teacherId: true } } },
  });
  return prisma.payment.create({
    data: {
      studentId,
      courseId,
      groupId: student.groupId,
      teacherId: student.group?.teacherId ?? null,
      amount,
      method: 'CASH',
      paidAt: new Date(Date.UTC(YEAR, MONTH - 1, day, 9)),
    },
  });
}

interface Fixture {
  adminToken: string;
  teacherId: string;
  profileId: string;
  courseId: string;
  groupId: string;
  studentIds: string[];
}

/** Bitta o‘qituvchi + guruh + 3 o‘quvchi + 4 dars + 2 000 000 so‘m tushum */
async function setupTeacher(options: { lessons?: number[]; students?: number; payments?: number[] } = {}): Promise<Fixture> {
  const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' });
  const { user: teacher } = await createUserWithToken(app, {
    role: 'TEACHER',
    email: 'teacher@test.uz',
    firstName: 'Aziz',
    lastName: 'Karimov',
  });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });

  const studentIds: string[] = [];
  for (let index = 0; index < (options.students ?? 3); index += 1) {
    const student = await enroll(course.id, group.id);
    studentIds.push(student.id);
  }
  await holdLessons(group.id, teacher.id, options.lessons ?? [1, 3, 5, 8]);
  for (const [index, amount] of (options.payments ?? [1_200_000, 800_000]).entries()) {
    const studentId = studentIds[index % studentIds.length];
    if (studentId) await addPayment(studentId, course.id, amount);
  }

  const profileResponse = await request(app)
    .post('/api/teachers')
    .set(bearer(adminToken))
    .send({ userId: teacher.id, specialization: 'Frontend', experienceYears: 4, hireDate: '2025-01-15' });
  expect(profileResponse.status).toBe(201);

  return {
    adminToken,
    teacherId: teacher.id,
    profileId: profileResponse.body.data.id as string,
    courseId: course.id,
    groupId: group.id,
    studentIds,
  };
}

async function setRule(
  token: string,
  profileId: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .post(`/api/teachers/${profileId}/salary-rules`)
    .set(bearer(token))
    .send({ effectiveFrom: '2026-01-01', ...body });
}

async function calculate(token: string, profileId?: string): Promise<request.Response> {
  return request(app)
    .post('/api/salaries/calculate')
    .set(bearer(token))
    .send({ year: YEAR, month: MONTH, ...(profileId ? { teacherProfileId: profileId } : {}) });
}

async function loadPeriod(token: string, profileId: string) {
  const response = await request(app)
    .get('/api/salaries/periods')
    .query({ year: YEAR, month: MONTH, teacherProfileId: profileId })
    .set(bearer(token));
  expect(response.status).toBe(200);
  return response.body.data[0];
}

describe.skipIf(!hasTestDatabase)('O‘qituvchi boshqaruvi (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Profil', () => {
    it('profil yaratadi, yuklamani hisoblaydi va takrorlanishga yo‘l qo‘ymaydi', async () => {
      const fixture = await setupTeacher();

      const list = await request(app).get('/api/teachers').set(bearer(fixture.adminToken));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        specialization: 'Frontend',
        experienceYears: 4,
        hireDate: '2025-01-15',
        isActive: true,
        groups: 1,
        students: 3,
      });

      const duplicate = await request(app)
        .post('/api/teachers')
        .set(bearer(fixture.adminToken))
        .send({ userId: fixture.teacherId });
      expect(duplicate.status).toBe(409);
    });

    it('profil tafsilotida guruhlar va oylik ko‘rsatkichlar qaytadi', async () => {
      const fixture = await setupTeacher();
      await prisma.attendance.createMany({
        data: [
          { studentId: fixture.studentIds[0]!, groupId: fixture.groupId, date: new Date('2026-09-01'), status: 'PRESENT' },
          { studentId: fixture.studentIds[1]!, groupId: fixture.groupId, date: new Date('2026-09-01'), status: 'LATE' },
          { studentId: fixture.studentIds[2]!, groupId: fixture.groupId, date: new Date('2026-09-01'), status: 'ABSENT' },
        ],
      });

      const response = await request(app).get(`/api/teachers/${fixture.profileId}`).set(bearer(fixture.adminToken));
      expect(response.status).toBe(200);
      expect(response.body.data.groupList).toHaveLength(1);
      expect(response.body.data.groupList[0].students).toBe(3);
      expect(response.body.data.performance.attendance).toMatchObject({ present: 1, late: 1, absent: 1, total: 3 });
      expect(response.body.data.performance.attendanceRate).toBe(67);
      expect(response.body.data.performance.revenue).toBe(2_000_000);
    });

    it('profilni tahrirlaydi va faolsizlantiradi', async () => {
      const fixture = await setupTeacher();

      const response = await request(app)
        .put(`/api/teachers/${fixture.profileId}`)
        .set(bearer(fixture.adminToken))
        .send({ specialization: 'Backend', experienceYears: 6, isActive: false });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ specialization: 'Backend', experienceYears: 6, isActive: false });

      const audit = await prisma.auditLog.findFirst({ where: { action: 'teacher.deactivated' } });
      expect(audit).not.toBeNull();
    });

    it('profil ochish mumkin bo‘lgan xodimlar ro‘yxati profili borlarni chiqarmaydi', async () => {
      const fixture = await setupTeacher();

      const response = await request(app).get('/api/teachers/candidates').set(bearer(fixture.adminToken));
      expect(response.status).toBe(200);
      expect(response.body.data.map((user: { id: string }) => user.id)).not.toContain(fixture.teacherId);
    });

    it('o‘qituvchi ro‘yxatni ko‘rmaydi, lekin o‘z panelini ko‘radi', async () => {
      const fixture = await setupTeacher();
      const teacherToken = (
        await request(app).post('/api/auth/login').send({ email: 'teacher@test.uz', password: 'Password123' })
      ).body.data.accessToken as string;

      const forbidden = await request(app).get('/api/teachers').set(bearer(teacherToken));
      expect(forbidden.status).toBe(403);

      const own = await request(app).get('/api/teachers/me').set(bearer(teacherToken));
      expect(own.status).toBe(200);
      expect(own.body.data.profile.id).toBe(fixture.profileId);
      expect(own.body.data.groupList).toHaveLength(1);
    });
  });

  describe('Maosh modeli', () => {
    it('yangi model eskisini tarix uchun yopadi', async () => {
      const fixture = await setupTeacher();

      expect((await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 })).status).toBe(201);
      const second = await request(app)
        .post(`/api/teachers/${fixture.profileId}/salary-rules`)
        .set(bearer(fixture.adminToken))
        .send({ type: 'FIXED', baseSalary: 5_000_000, effectiveFrom: '2026-09-01' });
      expect(second.status).toBe(201);

      const rules = await request(app)
        .get(`/api/teachers/${fixture.profileId}/salary-rules`)
        .set(bearer(fixture.adminToken));
      expect(rules.body.data).toHaveLength(2);
      expect(rules.body.data[0]).toMatchObject({ type: 'FIXED', isActive: true, effectiveTo: null });
      expect(rules.body.data[1]).toMatchObject({ type: 'PER_LESSON', isActive: false, effectiveTo: '2026-08-31' });
    });

    it('model tarkibi bo‘sh bo‘lsa xatolik qaytaradi', async () => {
      const fixture = await setupTeacher();

      const response = await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 0 });
      expect(response.status).toBe(422);
      expect(response.body.errors[0].field).toBe('perLessonRate');
    });
  });

  describe('Hisoblash', () => {
    it('dars uchun to‘lov modelida o‘tkazilgan darslar bo‘yicha hisoblaydi', async () => {
      const fixture = await setupTeacher();
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 120_000 });

      const response = await calculate(fixture.adminToken, fixture.profileId);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ calculated: 1, total: 480_000 });

      const period = await loadPeriod(fixture.adminToken, fixture.profileId);
      expect(period).toMatchObject({
        salaryType: 'PER_LESSON',
        lessonsCount: 4,
        lessonAmount: 480_000,
        totalAmount: 480_000,
        remainingAmount: 480_000,
        status: 'CALCULATED',
      });
    });

    it('o‘quvchi, ulush va aralash modellarni hisoblaydi', async () => {
      const fixture = await setupTeacher();

      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_STUDENT', perStudentRate: 250_000 });
      await calculate(fixture.adminToken, fixture.profileId);
      expect(await loadPeriod(fixture.adminToken, fixture.profileId)).toMatchObject({
        studentsCount: 3,
        studentAmount: 750_000,
        totalAmount: 750_000,
      });

      await setRule(fixture.adminToken, fixture.profileId, { type: 'PERCENTAGE', percentage: 35 });
      await calculate(fixture.adminToken, fixture.profileId);
      expect(await loadPeriod(fixture.adminToken, fixture.profileId)).toMatchObject({
        groupRevenue: 2_000_000,
        percentageAmount: 700_000,
        totalAmount: 700_000,
      });

      await setRule(fixture.adminToken, fixture.profileId, {
        type: 'MIXED',
        baseSalary: 2_000_000,
        perStudentRate: 100_000,
        bonus: 300_000,
      });
      await calculate(fixture.adminToken, fixture.profileId);
      // 2 000 000 + 3 × 100 000 + bonus 300 000
      expect(await loadPeriod(fixture.adminToken, fixture.profileId)).toMatchObject({
        baseAmount: 2_000_000,
        studentAmount: 300_000,
        bonus: 300_000,
        totalAmount: 2_600_000,
      });
    });

    it('boshqa oyning darslari va to‘lovlari hisobga olinmaydi', async () => {
      const fixture = await setupTeacher();
      await holdLessons(fixture.groupId, fixture.teacherId, []);
      await prisma.attendanceSession.create({
        data: { groupId: fixture.groupId, teacherId: fixture.teacherId, date: new Date('2026-08-20'), status: 'HELD' },
      });
      await addPayment(fixture.studentIds[0]!, fixture.courseId, 5_000_000, 1);
      await prisma.payment.create({
        data: {
          studentId: fixture.studentIds[0]!,
          courseId: fixture.courseId,
          amount: 9_000_000,
          method: 'CASH',
          paidAt: new Date('2026-08-15T09:00:00.000Z'),
        },
      });
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 });

      await calculate(fixture.adminToken, fixture.profileId);
      const period = await loadPeriod(fixture.adminToken, fixture.profileId);
      expect(period.lessonsCount).toBe(4);
      expect(period.groupRevenue).toBe(7_000_000);
    });

    it('maosh modeli yo‘q o‘qituvchini o‘tkazib yuboradi', async () => {
      const fixture = await setupTeacher();

      const response = await calculate(fixture.adminToken);
      expect(response.status).toBe(200);
      expect(response.body.data.calculated).toBe(0);
      expect(response.body.data.skipped[0]).toMatchObject({ reason: 'Maosh modeli belgilanmagan' });
    });

    it('bonus va jarima yozuvlari qayta hisoblashda saqlanadi', async () => {
      const fixture = await setupTeacher();
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 });
      await calculate(fixture.adminToken, fixture.profileId);

      const adjustment = (body: Record<string, unknown>) =>
        request(app)
          .post('/api/salaries/adjustments')
          .set(bearer(fixture.adminToken))
          .send({ teacherProfileId: fixture.profileId, year: YEAR, month: MONTH, date: '2026-09-15', ...body });
      const bonus = await adjustment({ type: 'BONUS', category: 'PERFORMANCE', amount: 200_000, reason: 'Ochiq dars uchun bonus' });
      expect(bonus.status).toBe(201);
      const penalty = await adjustment({ type: 'PENALTY', category: 'LATENESS', amount: 50_000, reason: 'Darsga kechikish' });
      expect(penalty.body.data.totalAmount).toBe(550_000);

      // Eski usul (raqamni to'g'ridan-to'g'ri yozish) endi qabul qilinmaydi
      const legacy = await request(app)
        .patch(`/api/salaries/periods/${bonus.body.data.id}`)
        .set(bearer(fixture.adminToken))
        .send({ bonus: 999_000, note: 'Eski usul' });
      expect(legacy.status).toBe(422);

      await calculate(fixture.adminToken, fixture.profileId);
      expect(await loadPeriod(fixture.adminToken, fixture.profileId)).toMatchObject({ bonus: 200_000, penalty: 50_000, totalAmount: 550_000 });
    });
  });

  describe('Tasdiqlash va to‘lash', () => {
    async function approvedPeriod(): Promise<{ fixture: Fixture; periodId: string; total: number }> {
      const fixture = await setupTeacher();
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 });
      await calculate(fixture.adminToken, fixture.profileId);
      const period = await loadPeriod(fixture.adminToken, fixture.profileId);
      const approved = await request(app)
        .post(`/api/salaries/periods/${period.id}/approve`)
        .set(bearer(fixture.adminToken));
      expect(approved.status).toBe(200);
      expect(approved.body.data).toMatchObject({ status: 'APPROVED' });
      expect(approved.body.data.lockedAt).not.toBeNull();
      return { fixture, periodId: period.id as string, total: approved.body.data.totalAmount as number };
    }

    it('tasdiqlangan maosh qayta hisoblanmaydi va o‘qituvchi xabar oladi', async () => {
      const { fixture, periodId } = await approvedPeriod();

      const notification = await prisma.notification.findFirst({ where: { entityId: periodId, title: 'Maosh tasdiqlandi' } });
      expect(notification?.userId).toBe(fixture.teacherId);

      const recalculated = await calculate(fixture.adminToken, fixture.profileId);
      expect(recalculated.body.data.calculated).toBe(0);
      expect(recalculated.body.data.skipped[0].reason).toBe('Maosh tasdiqlangan — qayta hisoblanmaydi');

      const adjust = await request(app)
        .post('/api/salaries/adjustments')
        .set(bearer(fixture.adminToken))
        .send({ teacherProfileId: fixture.profileId, year: YEAR, month: MONTH, type: 'BONUS', category: 'SPECIAL', amount: 100_000, reason: 'Kech qo‘shilgan bonus', date: '2026-09-20' });
      expect(adjust.status).toBe(409);
    });

    it('tasdiqlanmagan maoshni to‘lab bo‘lmaydi', async () => {
      const fixture = await setupTeacher();
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 });
      await calculate(fixture.adminToken, fixture.profileId);
      const period = await loadPeriod(fixture.adminToken, fixture.profileId);

      const response = await request(app)
        .post(`/api/salaries/periods/${period.id}/payments`)
        .set(bearer(fixture.adminToken))
        .send({ amount: 100_000, method: 'CASH' });
      expect(response.status).toBe(422);
    });

    it('qismlab to‘laydi, xarajat yozadi va hisob qoldig‘ini kamaytiradi', async () => {
      const { fixture, periodId, total } = await approvedPeriod();
      const account = await prisma.financialAccount.create({
        data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 10_000_000 },
      });

      const partial = await request(app)
        .post(`/api/salaries/periods/${periodId}/payments`)
        .set(bearer(fixture.adminToken))
        .send({ amount: 150_000, method: 'CASH', accountId: account.id, note: 'Avans' });
      expect(partial.status).toBe(200);
      expect(partial.body.data).toMatchObject({ status: 'PARTIALLY_PAID', paidAmount: 150_000, remainingAmount: total - 150_000 });
      expect(partial.body.data.payments).toHaveLength(1);

      const expense = await prisma.expense.findFirst({ include: { category: true, transaction: true } });
      expect(expense?.amount.toNumber()).toBe(150_000);
      expect(expense?.category.key).toBe('TEACHER_SALARY');
      expect(expense?.transaction?.type).toBe('EXPENSE');
      expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance.toNumber()).toBe(9_850_000);

      const tooMuch = await request(app)
        .post(`/api/salaries/periods/${periodId}/payments`)
        .set(bearer(fixture.adminToken))
        .send({ amount: total, method: 'CASH' });
      expect(tooMuch.status).toBe(422);

      const rest = await request(app)
        .post(`/api/salaries/periods/${periodId}/payments`)
        .set(bearer(fixture.adminToken))
        .send({ amount: total - 150_000, method: 'CARD' });
      expect(rest.body.data).toMatchObject({ status: 'PAID', remainingAmount: 0 });

      const repeat = await request(app)
        .post(`/api/salaries/periods/${periodId}/payments`)
        .set(bearer(fixture.adminToken))
        .send({ amount: 10_000, method: 'CASH' });
      expect(repeat.status).toBe(409);
    });

    it('oylik yig‘ma ko‘rsatkichlarni qaytaradi', async () => {
      const { fixture, total } = await approvedPeriod();

      const response = await request(app)
        .get('/api/salaries/summary')
        .query({ year: YEAR, month: MONTH })
        .set(bearer(fixture.adminToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        periods: 1,
        awaitingApproval: 0,
        accrued: total,
        paid: 0,
        remaining: total,
        label: '2026-yil sentabr',
      });
    });
  });

  describe('Ruxsatlar', () => {
    it('buxgalter hisoblaydi va to‘laydi, lekin tasdiqlamaydi', async () => {
      const fixture = await setupTeacher();
      await setRule(fixture.adminToken, fixture.profileId, { type: 'PER_LESSON', perLessonRate: 100_000 });
      const { token: accountantToken } = await createUserWithToken(app, {
        role: 'ACCOUNTANT',
        email: 'accountant@test.uz',
      });

      expect((await calculate(accountantToken, fixture.profileId)).status).toBe(200);
      const period = await loadPeriod(accountantToken, fixture.profileId);

      const approve = await request(app).post(`/api/salaries/periods/${period.id}/approve`).set(bearer(accountantToken));
      expect(approve.status).toBe(403);

      const rule = await setRule(accountantToken, fixture.profileId, { type: 'FIXED', baseSalary: 1_000_000 });
      expect(rule.status).toBe(403);

      await request(app).post(`/api/salaries/periods/${period.id}/approve`).set(bearer(fixture.adminToken));
      const payment = await request(app)
        .post(`/api/salaries/periods/${period.id}/payments`)
        .set(bearer(accountantToken))
        .send({ amount: 100_000, method: 'CASH' });
      expect(payment.status).toBe(200);
    });
  });
});
