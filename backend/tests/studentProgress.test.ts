import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function seedReference() {
  await prisma.level.createMany({
    data: [
      { number: 1, name: 'Yangi boshlovchi', minXp: 0 },
      { number: 2, name: 'Izlanuvchi', minXp: 30 },
    ],
  });
  await prisma.xpRule.createMany({
    data: [
      { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasi', source: 'HOMEWORK', points: 20 },
      { key: 'EXAM_EXCELLENT', name: 'Imtihon 90%+', source: 'EXAM', points: 50 },
    ],
  });
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH' } });
}

async function setup() {
  const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
  const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
  const student = await prisma.student.create({
    data: {
      firstName: 'Aziz',
      lastName: 'Karimov',
      phone: '+998901112233',
      courseId: course.id,
      groupId: group.id,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
  return { teacherToken, adminToken, group, student };
}

describe.skipIf(!hasTestDatabase)('O‘quvchi progressi (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('davomat, uy vazifasi, imtihon, XP va izohlarni bitta profilda qaytaradi', async () => {
    const { teacherToken, adminToken, group, student } = await setup();
    const today = new Date().toISOString().slice(0, 10);

    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(`${today}T00:00:00.000Z`), status: 'PRESENT' },
        { studentId: student.id, groupId: group.id, date: new Date(Date.now() - 86_400_000), status: 'ABSENT' },
      ],
    });

    // Progress uy vazifasini muddat oyiga bog'laydi — muddat joriy oyda, lekin hali o'tmagan
    const deadline = new Date(Date.now() + 10 * 60_000);
    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(teacherToken))
      .send({ title: 'React amaliyoti', groupId: group.id, deadline: deadline.toISOString(), maxPoints: 50 });
    await request(app)
      .patch(`/api/homework/${homework.body.data.id}/submissions/${student.id}`)
      .set(bearer(teacherToken))
      .send({ score: 40, feedback: 'Kod toza yozilgan' });

    const exam = await request(app)
      .post('/api/exams')
      .set(bearer(teacherToken))
      .send({ title: 'Oraliq imtihon', groupId: group.id, date: today, maxScore: 100 });
    await request(app)
      .put(`/api/exams/${exam.body.data.id}/results`)
      .set(bearer(teacherToken))
      .send({ records: [{ studentId: student.id, score: 92, comment: 'A’lo natija' }] });

    await request(app).post('/api/payments').set(bearer(adminToken)).send({ studentId: student.id, amount: 300_000, method: 'CASH' });

    const response = await request(app).get(`/api/students/${student.id}/profile`).set(bearer(adminToken));
    expect(response.status).toBe(200);
    const data = response.body.data;

    expect(data.attendance).toMatchObject({ total: 2, present: 1, absent: 1, rate: 50 });
    expect(data.homework).toMatchObject({ assigned: 1, submitted: 1, graded: 1, rate: 100, averagePercent: 80 });
    expect(data.exams).toMatchObject({ count: 1, averagePercent: 92, best: 92, lastGrade: 'A' });
    expect(data.payments).toMatchObject({ total: 300_000, count: 1 });
    expect(data.gamification.totalXp).toBe(70);

    expect(data.progress).toHaveLength(6);
    expect(data.progress.at(-1)).toMatchObject({ examAverage: 92, xp: 70 });
    const homeworkMonth = data.progress.find((point: { month: string }) => point.month === deadline.toISOString().slice(0, 7));
    expect(homeworkMonth).toMatchObject({ homeworkRate: 100 });

    expect(data.feedback.map((row: { text: string }) => row.text)).toEqual(
      expect.arrayContaining(['Kod toza yozilgan', 'A’lo natija']),
    );
    const payment = data.activity.find((row: { type: string }) => row.type === 'payment');
    expect(payment.description).toBe('Naqd');
  });

  it('o‘qituvchi uchun to‘lov bloki yashiriladi, begona o‘qituvchi profilni ko‘rmaydi', async () => {
    const { teacherToken, student } = await setup();

    const own = await request(app).get(`/api/students/${student.id}/profile`).set(bearer(teacherToken));
    expect(own.status).toBe(200);
    expect(own.body.data.payments).toBeNull();

    const { token: strangerToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const stranger = await request(app).get(`/api/students/${student.id}/profile`).set(bearer(strangerToken));
    expect(stranger.status).toBe(404);
  });

  it('uy vazifasi va imtihon tarixini alohida qaytaradi', async () => {
    const { teacherToken, group, student } = await setup();
    await request(app)
      .post('/api/homework')
      .set(bearer(teacherToken))
      .send({ title: 'Qoralama', groupId: group.id, deadline: '2030-01-01T18:00:00.000Z', status: 'DRAFT' });
    await request(app)
      .post('/api/homework')
      .set(bearer(teacherToken))
      .send({ title: 'E’lon qilingan', groupId: group.id, deadline: '2030-01-01T18:00:00.000Z' });

    const homework = await request(app).get(`/api/students/${student.id}/homework`).set(bearer(teacherToken));
    expect(homework.body.data).toHaveLength(1);
    expect(homework.body.data[0]).toMatchObject({ title: 'E’lon qilingan', status: 'PENDING' });

    const exams = await request(app).get(`/api/students/${student.id}/exams`).set(bearer(teacherToken));
    expect(exams.status).toBe(200);
    expect(exams.body.data).toHaveLength(0);
  });
});
