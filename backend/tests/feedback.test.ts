import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function createStudent(courseId: string, groupId: string | null, name = 'Aziz') {
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Karimov',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('O‘quvchi fikri va NPS', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi bahosi yoziladi va o‘qituvchi avtomatik aniqlanadi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'ADMIN' });
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz@local.uz' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id, teacherId: teacher.user.id });
    const student = await createStudent(course.id, group.id);

    const response = await request(app)
      .post('/api/feedback')
      .set(bearer(token))
      .send({ studentId: student.id, type: 'TEACHER', rating: 5, comment: 'Juda yaxshi tushuntiradi' });

    expect(response.status).toBe(201);
    expect(response.body.data.teacher.id).toBe(teacher.user.id);
    expect(response.body.data.isNegative).toBe(false);
    expect(response.body.data.student.name).toBe('Aziz Karimov');
    expect(user.id).toBeTruthy();
  });

  it('anonim fikrda o‘quvchi ismi qaytarilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Dizayn');
    const student = await createStudent(course.id, null, 'Maxfiy');

    const created = await request(app)
      .post('/api/feedback')
      .set(bearer(token))
      .send({ studentId: student.id, type: 'ACADEMY', rating: 4, isAnonymous: true, comment: 'Yaxshi' });
    expect(created.status).toBe(201);
    expect(created.body.data.student).toBeNull();

    const list = await request(app).get('/api/feedback').set(bearer(token));
    expect(list.body.data[0].student).toBeNull();
    // Yozuvda o'quvchi baribir bog'langan (statistika uchun), faqat DTO da ko'rinmaydi
    const stored = await prisma.feedback.findFirstOrThrow({ where: { id: created.body.data.id } });
    expect(stored.studentId).toBe(student.id);
  });

  it('past baho mas’ul xodimlarga bildirishnoma yuboradi va ochiq turadi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Matematika');
    const student = await createStudent(course.id, null);

    const created = await request(app)
      .post('/api/feedback')
      .set(bearer(token))
      .send({ studentId: student.id, type: 'ACADEMY', rating: 2, comment: 'Xona sovuq' });
    expect(created.body.data.isNegative).toBe(true);

    const notifications = await prisma.notification.findMany({ where: { userId: user.id, type: 'NEGATIVE_FEEDBACK' } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.message).toContain('2/5');

    const open = await request(app).get('/api/feedback').query({ onlyOpen: 'true' }).set(bearer(token));
    expect(open.body.data).toHaveLength(1);

    const handled = await request(app).post(`/api/feedback/${created.body.data.id}/handle`).set(bearer(token)).send({ note: 'Isitgich qo‘yildi' });
    expect(handled.status).toBe(200);
    expect(handled.body.data.handledAt).not.toBeNull();

    const afterOpen = await request(app).get('/api/feedback').query({ onlyOpen: 'true' }).set(bearer(token));
    expect(afterOpen.body.data).toHaveLength(0);
  });

  it('NPS hisobi tarafdor va tanqidchilardan chiqadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Ingliz tili');
    const scores = [10, 9, 8, 7, 3];
    for (const score of scores) {
      const student = await createStudent(course.id, null, `O${score}`);
      await prisma.feedback.create({ data: { studentId: student.id, type: 'NPS', npsScore: score } });
    }

    const response = await request(app).get('/api/feedback/stats').set(bearer(token));

    expect(response.status).toBe(200);
    // 2 tarafdor (10, 9), 2 passiv (8, 7), 1 tanqidchi (3) -> (40% - 20%) = 20
    expect(response.body.data.promoters).toBe(2);
    expect(response.body.data.passives).toBe(2);
    expect(response.body.data.detractors).toBe(1);
    expect(response.body.data.nps).toBe(20);
  });

  it('fikr bo‘lmasa NPS null bo‘ladi (nol emas)', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const response = await request(app).get('/api/feedback/stats').set(bearer(token));
    expect(response.body.data.nps).toBeNull();
    expect(response.body.data.teacherAverage).toBeNull();
  });

  it('bir kunda bir xil turdagi fikr ikki marta yozilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Fizika');
    const student = await createStudent(course.id, null);

    await request(app).post('/api/feedback').set(bearer(token)).send({ studentId: student.id, type: 'ACADEMY', rating: 5 }).expect(201);
    const again = await request(app).post('/api/feedback').set(bearer(token)).send({ studentId: student.id, type: 'ACADEMY', rating: 4 });
    expect(again.status).toBe(409);

    // Boshqa tur bo'lsa — mumkin
    await request(app).post('/api/feedback').set(bearer(token)).send({ studentId: student.id, type: 'NPS', npsScore: 9 }).expect(201);
  });

  it('o‘quvchi kabinetdan o‘zi uchun fikr qoldiradi, boshqa o‘quvchi uchun qoldira olmaydi', async () => {
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Kimyo');
    const student = await createStudent(course.id, null, 'Kabinetchi');
    const other = await createStudent(course.id, null, 'Begona');

    const account = await request(app)
      .post(`/api/students/${student.id}/portal-account`)
      .set(bearer(adminToken))
      .send({ email: 'kabinet-feedback@local.uz' });
    expect(account.status).toBe(201);

    const studentToken = await loginAs(app, 'kabinet-feedback@local.uz', account.body.data.temporaryPassword);

    const mine = await request(app).post('/api/portal/feedback').set(bearer(studentToken)).send({ type: 'ACADEMY', rating: 5, comment: 'Zo‘r' });
    expect(mine.status).toBe(201);

    // Boshqa o'quvchi ID si berilsa — rad etiladi
    const foreign = await request(app)
      .post('/api/portal/feedback')
      .query({ studentId: other.id })
      .set(bearer(studentToken))
      .send({ type: 'ACADEMY', rating: 1 });
    expect(foreign.status).toBe(403);

    const state = await request(app).get('/api/portal/feedback').set(bearer(studentToken));
    expect(state.body.data.answeredToday).toContain('ACADEMY');
  });

  it('fikr ko‘rish huquqi yo‘q xodim ro‘yxatni ocholmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'CALL_CENTER' });
    await request(app).get('/api/feedback').set(bearer(token)).expect(403);
  });

  it('o‘qituvchi samaradorligida qoniqish bahosi ko‘rinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz2@local.uz' });
    const course = await createCourse('Robototexnika');
    const group = await createGroup({ courseId: course.id, teacherId: teacher.user.id });
    const student = await createStudent(course.id, group.id);
    const profile = await prisma.teacherProfile.create({ data: { userId: teacher.user.id } });

    await prisma.feedback.createMany({
      data: [
        { studentId: student.id, type: 'TEACHER', teacherId: teacher.user.id, rating: 5 },
        { studentId: student.id, type: 'TEACHER', teacherId: teacher.user.id, rating: 4, createdAt: new Date(Date.now() - 86_400_000) },
      ],
    });

    const response = await request(app).get(`/api/teachers/${profile.id}`).set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.performance.satisfaction).toMatchObject({ average: 4.5, responses: 2 });
    expect(response.body.data.performance.studentCount).toBe(1);
    expect(response.body.data.performance.retentionRate).toBe(100);
  });
});
