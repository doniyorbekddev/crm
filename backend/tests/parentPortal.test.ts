import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { isWeeklyReportTime, sendWeeklyReports } from '../src/jobs/weeklyReport.job.js';
import { automationService } from '../src/services/automation.service.js';
import { weeklyReportService } from '../src/services/weeklyReport.service.js';
import { addDays, businessDateString, startOfBusinessWeek } from '../src/utils/dates.js';
import { PORTAL_NEW_PASSWORD, bearer, createUserWithToken, loginAs, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 3 — ota-ona kabineti (TZ 3.0 §10–11):
 * telefon bilan kirish, ommaviy ochish, majburiy parol almashtirish, "Farzandlarim",
 * haftalik hisobot (web, xodim, Telegram/in-app job), ota-onaga avtomatik eslatmalar.
 */
const app = createApp();
const DAY_MS = 86_400_000;
let phoneCounter = 0;

async function createStudent(courseId: string, groupId: string | null, name: string) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99891${String(1_000_000 + phoneCounter).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_200_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_200_000, paidAmount: 200_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function createParent(phone: string, studentIds: string[], name = 'Ota') {
  return prisma.parent.create({
    data: {
      firstName: name,
      lastName: 'Ona',
      phone,
      students: { create: studentIds.map((studentId, index) => ({ studentId, isPrimary: index === 0 })) },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Ota-ona kabineti va haftalik hisobot (PHASE 3)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Kirish va hisoblar', () => {
    it('vaqtinchalik parol bilan faqat parolni almashtirish ochiq; almashtirilgach hammasi ishlaydi', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await createStudent(course.id, group.id, 'Vaqtinchalik');
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const created = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({});
      const { login, temporaryPassword } = created.body.data as { login: string; temporaryPassword: string };

      const session = await request(app).post('/api/auth/login').send({ email: login, password: temporaryPassword });
      expect(session.body.data.user.mustChangePassword).toBe(true);
      const token = session.body.data.accessToken as string;

      const blocked = await request(app).get('/api/portal/me').set(bearer(token));
      const notifications = await request(app).get('/api/notifications').set(bearer(token));
      const me = await request(app).get('/api/auth/me').set(bearer(token));
      expect([blocked.status, notifications.status, me.status]).toEqual([403, 403, 200]);
      expect(blocked.body.errors).toEqual([{ field: 'code', message: 'PASSWORD_CHANGE_REQUIRED' }]);
      expect(me.body.data.mustChangePassword).toBe(true);

      const changed = await request(app)
        .patch('/api/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: temporaryPassword, newPassword: PORTAL_NEW_PASSWORD });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user.mustChangePassword).toBe(false);
      const open = await request(app).get('/api/portal/me').set(bearer(changed.body.data.accessToken));
      expect(open.status).toBe(200);

      // Xodim parolni tiklasa — yana vaqtinchalik
      const reset = await request(app).post(`/api/students/${student.id}/portal-account/reset-password`).set(bearer(admin));
      const again = await request(app).post('/api/auth/login').send({ email: login, password: reset.body.data.temporaryPassword });
      expect(again.body.data.user.mustChangePassword).toBe(true);
    });

    it('xodim hisoblari vaqtinchalik parol talabisiz ishlaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const me = await request(app).get('/api/auth/me').set(bearer(token));
      const students = await request(app).get('/api/students').set(bearer(token));
      expect(me.body.data.mustChangePassword).toBe(false);
      expect(students.status).toBe(200);
    });

    it('ota-onaga emailsiz kabinet: telefon raqami bilan (turli yozuvda) kiradi', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const child = await createStudent(course.id, group.id, 'Farzand');
      const parent = await createParent('+998901234567', [child.id]);
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

      const created = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ login: '+998901234567', email: 'p998901234567@kabinet.invalid' });
      const temporary = created.body.data.temporaryPassword as string;

      for (const identifier of ['+998901234567', '998901234567', '90 123 45 67', '+998 (90) 123-45-67']) {
        const login = await request(app).post('/api/auth/login').send({ email: identifier, password: temporary });
        expect(login.status, identifier).toBe(200);
      }
      const token = await loginWithTemporaryPassword(app, '901234567', temporary);
      const me = await request(app).get('/api/portal/me').set(bearer(token));
      expect(me.body.data).toMatchObject({ kind: 'PARENT', children: [{ studentId: child.id }] });

      // Xuddi shu telefonli ikkinchi ota-onaga emailsiz ochilmaydi — email bilan ochiladi
      const twin = await createParent('+998901234567', [child.id], 'Ikkinchi');
      const conflict = await request(app).post(`/api/parents/${twin.id}/portal-account`).set(bearer(admin)).send({});
      const withEmail = await request(app).post(`/api/parents/${twin.id}/portal-account`).set(bearer(admin)).send({ email: 'ikkinchi@portal.uz' });
      expect([conflict.status, withEmail.status]).toEqual([409, 201]);
      expect(withEmail.body.data.login).toBe('ikkinchi@portal.uz');
    });

    it('ota-onalarga ommaviy ochish: faqat faol farzandi borlarga, takror telefon o‘tkazib yuboriladi; parol tiklanadi', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const active = await createStudent(course.id, group.id, 'Faol');
      const other = await createStudent(course.id, group.id, 'Boshqa');
      const dropped = await createStudent(course.id, group.id, 'Ketgan');
      await prisma.student.update({ where: { id: dropped.id }, data: { status: 'DROPPED' } });
      const first = await createParent('+998901110001', [active.id], 'Birinchi');
      const duplicate = await createParent('+998901110001', [other.id], 'Takror');
      const droppedParent = await createParent('+998901110002', [dropped.id], 'Ketganning');
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });

      expect((await request(app).post('/api/parents/portal-accounts/bulk').set(bearer(teacher)).send({})).status).toBe(403);
      const bulk = await request(app).post('/api/parents/portal-accounts/bulk').set(bearer(admin)).send({});
      expect(bulk.status).toBe(201);
      expect(bulk.body.data.created).toHaveLength(1);
      expect(bulk.body.data.created[0]).toMatchObject({ parentId: first.id, login: '+998901110001', children: 'Faol Test' });
      expect(bulk.body.data.duplicatePhones).toEqual(['Takror Ona (+998901110001)']);
      expect((await prisma.parent.findUniqueOrThrow({ where: { id: droppedParent.id } })).userId).toBeNull();
      expect((await prisma.parent.findUniqueOrThrow({ where: { id: duplicate.id } })).userId).toBeNull();

      const token = await loginWithTemporaryPassword(app, '+998901110001', bulk.body.data.created[0].temporaryPassword);
      expect((await request(app).get('/api/portal/me').set(bearer(token))).body.data.kind).toBe('PARENT');

      const reset = await request(app).post(`/api/parents/${first.id}/portal-account/reset-password`).set(bearer(admin));
      expect(reset.status).toBe(200);
      expect(reset.body.data.login).toBe('+998901110001');
      const relogin = await request(app).post('/api/auth/login').send({ email: '+998901110001', password: reset.body.data.temporaryPassword });
      expect(relogin.body.data.user.mustChangePassword).toBe(true);
    });
  });

  describe('Farzandlarim', () => {
    it('ota-ona har farzand kartasini ko‘radi, begona o‘quvchi kirmaydi', async () => {
      const course = await createCourse('Frontend');
      const group = await createGroup({ courseId: course.id, name: 'F-12' });
      const first = await createStudent(course.id, group.id, 'Anvar');
      const second = await createStudent(course.id, group.id, 'Barno');
      await createStudent(course.id, group.id, 'Begona');
      await prisma.student.update({ where: { id: second.id }, data: { riskLevel: 'ATTENTION' } });
      const parent = await createParent('+998907770000', [first.id, second.id]);
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const created = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
      const token = await loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);

      const children = await request(app).get('/api/portal/children').set(bearer(token));
      expect(children.status).toBe(200);
      expect(children.body.data.map((child: { fullName: string }) => child.fullName)).toEqual(['Anvar Test', 'Barno Test']);
      expect(children.body.data[0]).toMatchObject({ groupName: 'F-12', courseName: 'Frontend', debt: { remaining: 1_000_000 } });
      expect(children.body.data[1].risk).toBe('ATTENTION');
    });
  });

  describe('Haftalik hisobot', () => {
    async function seedWeek() {
      const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Bobur', lastName: 'Ustoz' });
      const course = await createCourse('JavaScript');
      const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'JS-1' });
      const student = await createStudent(course.id, group.id, 'Hisobotli');
      const weekStart = startOfBusinessWeek(new Date());
      const monday = new Date(`${businessDateString(weekStart)}T00:00:00Z`);
      const inWeek = new Date(weekStart.getTime() + 60 * 60_000); // dushanba 01:00

      await prisma.attendance.createMany({
        data: [
          { studentId: student.id, groupId: group.id, date: monday, status: 'PRESENT' },
          { studentId: student.id, groupId: group.id, date: new Date(monday.getTime() + DAY_MS), status: 'LATE' },
          { studentId: student.id, groupId: group.id, date: new Date(monday.getTime() + 2 * DAY_MS), status: 'ABSENT' },
          // o'tgan hafta — hisobotga kirmaydi
          { studentId: student.id, groupId: group.id, date: new Date(monday.getTime() - 3 * DAY_MS), status: 'ABSENT' },
        ],
      });
      const graded = await prisma.homework.create({
        data: { title: 'Massivlar', groupId: group.id, deadline: inWeek, maxPoints: 100, status: 'PUBLISHED' },
      });
      const pending = await prisma.homework.create({
        data: { title: 'Obyektlar', groupId: group.id, deadline: new Date(inWeek.getTime() + DAY_MS), status: 'PUBLISHED' },
      });
      await prisma.homeworkSubmission.createMany({
        data: [
          { homeworkId: graded.id, studentId: student.id, status: 'GRADED', score: 80, feedback: 'filter sharti xato', gradedById: teacher.id, gradedAt: inWeek },
          { homeworkId: pending.id, studentId: student.id, status: 'PENDING' },
        ],
      });
      const exam = await prisma.exam.create({ data: { title: 'Oylik test', groupId: group.id, date: monday, maxScore: 100, passScore: 60 } });
      await prisma.examResult.create({
        data: { examId: exam.id, studentId: student.id, score: 72, percentage: 72, grade: '4', comment: 'yaxshi', gradedById: teacher.id, gradedAt: inWeek },
      });
      await prisma.xpTransaction.createMany({
        data: [
          { studentId: student.id, points: 30, source: 'HOMEWORK', description: 'Vazifa', createdAt: inWeek },
          { studentId: student.id, points: 99, source: 'MANUAL', description: 'O‘tgan hafta', createdAt: addDays(weekStart, -2) },
        ],
      });

      // Mavzu kesimi: "Massivlar" 100%, "Async" 0%
      const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'JS' } });
      const strong = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Massivlar mavzusi' } });
      const weak = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Async' } });
      const q1 = await prisma.question.create({ data: { courseId: course.id, topicId: strong.id, text: 'Massiv savoli', points: 5 } });
      const q2 = await prisma.question.create({ data: { courseId: course.id, topicId: weak.id, text: 'Async savoli', points: 5 } });
      const eq1 = await prisma.examQuestion.create({ data: { examId: exam.id, questionId: q1.id, points: 5 } });
      const eq2 = await prisma.examQuestion.create({ data: { examId: exam.id, questionId: q2.id, points: 5, sortOrder: 1 } });
      await prisma.examAttempt.create({
        data: {
          examId: exam.id,
          studentId: student.id,
          status: 'GRADED',
          submittedAt: inWeek,
          answers: {
            create: [
              { examQuestionId: eq1.id, questionId: q1.id, score: 5, isCorrect: true },
              { examQuestionId: eq2.id, questionId: q2.id, score: 0, isCorrect: false },
            ],
          },
        },
      });
      return { teacher, course, group, student, weekStart };
    }

    it('hafta ma’lumotlari to‘g‘ri yig‘iladi, xulosa yumshoq ohangda', async () => {
      const { student, weekStart } = await seedWeek();
      const report = await weeklyReportService.build(student.id, weekStart);

      expect(report.week.start).toBe(businessDateString(weekStart));
      expect(report.attendance).toMatchObject({ present: 1, late: 1, absent: 1, total: 3, rate: 67 });
      expect(report.homework).toMatchObject({ total: 2, submitted: 1, pending: 1, averagePercent: 80 });
      expect(report.exams).toEqual([expect.objectContaining({ title: 'Oylik test', percentage: 72, grade: '4', passed: true })]);
      expect(report.xp.earned).toBe(30);
      expect(report.topics).toEqual({ strong: ['Massivlar mavzusi'], weak: ['Async'] });
      expect(report.feedback.map((item) => item.text)).toEqual(expect.arrayContaining(['filter sharti xato', 'yaxshi']));
      expect(report.feedback[0]!.author).toBe('Bobur Ustoz');
      expect(report.summary.join(' ')).toContain('3 ta darsdan 2 tasida qatnashdi');
      expect(report.summary.join(' ')).toContain('Qo‘shimcha mashq tavsiya etiladi: Async');
    });

    it('kabinetda o‘z hisoboti; begona va kelajak hafta rad etiladi; xodim — faqat o‘z guruhi', async () => {
      const { student, teacher } = await seedWeek();
      const other = await createStudent(student.courseId, null, 'Boshqa');
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const created = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({});
      const token = await loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);

      const own = await request(app).get('/api/portal/weekly-report').set(bearer(token));
      const foreign = await request(app).get('/api/portal/weekly-report').query({ studentId: other.id }).set(bearer(token));
      const future = await request(app).get('/api/portal/weekly-report').query({ week: businessDateString(addDays(new Date(), 14)) }).set(bearer(token));
      const badDate = await request(app).get('/api/portal/weekly-report').query({ week: '25.09.2026' }).set(bearer(token));
      expect([own.status, foreign.status, future.status, badDate.status]).toEqual([200, 403, 422, 422]);
      expect(own.body.data.attendance.total).toBe(3);

      // Xodim: o'z guruhining o'qituvchisi va admin ko'radi, begona o'qituvchi — 404
      const { token: strangerToken } = await createUserWithToken(app, { role: 'TEACHER' });
      const teacherToken = await loginAs(app, teacher.email);
      const byOwnTeacher = await request(app).get(`/api/students/${student.id}/weekly-report`).set(bearer(teacherToken));
      const byAdmin = await request(app).get(`/api/students/${student.id}/weekly-report`).set(bearer(admin));
      const byStranger = await request(app).get(`/api/students/${student.id}/weekly-report`).set(bearer(strangerToken));
      expect([byOwnTeacher.status, byAdmin.status, byStranger.status]).toEqual([200, 200, 404]);
      expect(byOwnTeacher.body.data.homework.total).toBe(2);
    });

    it('job: yakshanba 18:00 dan keyin; o‘quvchi va ota-onaga ilova ichida va Telegramda, bir marta', async () => {
      const { student } = await seedWeek();
      const parent = await createParent('+998905550000', [student.id]);
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({});
      await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
      await prisma.telegramLink.create({ data: { parentId: parent.id, linkCode: 'weekly-parent', chatId: '777', verifiedAt: new Date() } });
      // Qabul qiluvchisi yo'q o'quvchi — hisoblanmaydi
      await createStudent(student.courseId, null, 'Hech kimsiz');

      // 2026-09-27 — yakshanba; Toshkent 18:30 = 13:30 UTC
      expect(isWeeklyReportTime(new Date('2026-09-27T13:30:00Z'))).toBe(true);
      expect(isWeeklyReportTime(new Date('2026-09-27T12:30:00Z'))).toBe(false);
      expect(isWeeklyReportTime(new Date('2026-09-26T15:00:00Z'))).toBe(false);

      const first = await sendWeeklyReports();
      const second = await sendWeeklyReports();
      expect(first.students).toBe(1);
      expect(second.students).toBe(1);

      const notifications = await prisma.notification.findMany({ where: { type: 'WEEKLY_REPORT' }, select: { userId: true, message: true } });
      expect(notifications).toHaveLength(2);
      expect(notifications[0]!.message).toContain('darsdan');
      const deliveries = await prisma.notificationDelivery.count({ where: { title: { startsWith: 'Haftalik hisobot' }, channel: 'TELEGRAM' } });
      expect(deliveries).toBe(1);
    });
  });

  it('avtomatlashtirish: "ota-onaga" qoidasi ota-onaga yetadi, o‘quvchining o‘ziga emas', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Kelmagan');
    const parent = await createParent('+998906660000', [student.id]);
    await prisma.telegramLink.createMany({
      data: [
        { studentId: student.id, linkCode: 'auto-student', chatId: '901', verifiedAt: new Date() },
        { parentId: parent.id, linkCode: 'auto-parent', chatId: '902', verifiedAt: new Date() },
      ],
    });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
    await prisma.automationRule.create({
      data: { key: 'absent_parent', name: 'Ota-onaga', trigger: 'STUDENT_ABSENT_STREAK', audience: 'PARENT', params: { absences: 2 } },
    });
    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
      ],
    });

    await automationService.runAll(now);

    const deliveries = await prisma.notificationDelivery.findMany({ select: { telegramLink: { select: { chatId: true } } } });
    expect(deliveries.map((row) => row.telegramLink?.chatId)).toEqual(['902']);
    const parentUser = (await prisma.parent.findUniqueOrThrow({ where: { id: parent.id }, select: { userId: true } })).userId!;
    const inApp = await prisma.notification.findMany({ where: { type: 'CHILD_ABSENT' }, select: { userId: true } });
    expect(inApp).toEqual([{ userId: parentUser }]);
  });
});
