import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

let counter = 0;

async function enroll(courseId: string, groupId: string) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `Imtihonchi${counter}`,
      lastName: 'Rahimov',
      phone: `+99893${String(5_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
    },
  });
}

async function setup() {
  const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher1@test.uz' });
  const { token: otherTeacherToken } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher2@test.uz' });
  const { token: adminToken } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'admin@test.uz' });
  const course = await createCourse('Frontend');
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'FE-01' });
  const students = [await enroll(course.id, group.id), await enroll(course.id, group.id)] as const;
  return { teacher, teacherToken, otherTeacherToken, adminToken, course, group, students };
}

function createExam(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/exams').set(bearer(token)).send(body);
}

describe.skipIf(!hasTestDatabase)('Imtihonlar: kirish, validatsiya, filtrlar (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('boshqa o‘qituvchi imtihonni ko‘rmaydi, o‘zgartirmaydi va baholay olmaydi', async () => {
    const { teacherToken, otherTeacherToken, group, students } = await setup();
    const exam = await createExam(teacherToken, { title: 'Oraliq imtihon', groupId: group.id, date: '2026-09-20', maxScore: 100 });
    expect(exam.status).toBe(201);
    const id = exam.body.data.id as string;

    const list = await request(app).get('/api/exams').set(bearer(otherTeacherToken));
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(0);
    expect((await request(app).get(`/api/exams/${id}`).set(bearer(otherTeacherToken))).status).toBe(404);
    expect((await request(app).put(`/api/exams/${id}`).set(bearer(otherTeacherToken)).send({ title: 'Buzilgan' })).status).toBe(404);
    expect(
      (await request(app).put(`/api/exams/${id}/results`).set(bearer(otherTeacherToken)).send({ records: [{ studentId: students[0].id, score: 1 }] })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/exams/${id}`).set(bearer(otherTeacherToken))).status).toBe(404);
    expect((await createExam(otherTeacherToken, { title: 'Begona guruh', groupId: group.id, date: '2026-09-21', maxScore: 10 })).status).not.toBe(201);

    expect((await request(app).get(`/api/exams/${id}`).set(bearer(teacherToken))).body.data.title).toBe('Oraliq imtihon');
  });

  it('o‘tish bali maksimal balldan katta bo‘lsa va o‘quvchi guruhda bo‘lmasa rad etiladi', async () => {
    const { teacherToken, course, group } = await setup();
    const invalid = await createExam(teacherToken, { title: 'Nazorat', groupId: group.id, date: '2026-09-20', maxScore: 50, passScore: 60 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.errors).toEqual([expect.objectContaining({ field: 'passScore' })]);

    const exam = await createExam(teacherToken, { title: 'Nazorat', groupId: group.id, date: '2026-09-20', maxScore: 50, passScore: 30 });
    const tooHighPass = await request(app).put(`/api/exams/${exam.body.data.id}`).set(bearer(teacherToken)).send({ passScore: 70 });
    expect(tooHighPass.status).toBe(422);

    const otherGroup = await createGroup({ courseId: course.id, name: 'FE-02' });
    const outsider = await enroll(course.id, otherGroup.id);
    const wrongStudent = await request(app)
      .put(`/api/exams/${exam.body.data.id}/results`)
      .set(bearer(teacherToken))
      .send({ records: [{ studentId: outsider.id, score: 40 }] });
    expect(wrongStudent.status).toBe(422);
    expect(wrongStudent.body.errors).toEqual([{ field: 'studentId', message: 'O‘quvchi bu guruhda emas' }]);
  });

  it('natijasiz imtihon o‘chiriladi va auditga yoziladi', async () => {
    const { teacherToken, group } = await setup();
    const exam = await createExam(teacherToken, { title: 'Bekor bo‘ladigan', groupId: group.id, date: '2026-09-20', maxScore: 10 });
    const removed = await request(app).delete(`/api/exams/${exam.body.data.id}`).set(bearer(teacherToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ id: exam.body.data.id });
    expect((await request(app).get(`/api/exams/${exam.body.data.id}`).set(bearer(teacherToken))).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'exam.deleted', entityId: exam.body.data.id } })).toBe(1);
  });

  it('ro‘yxat guruh, kurs, o‘qituvchi, holat, sana va qidiruv bo‘yicha filtrlanadi', async () => {
    const { teacher, teacherToken, adminToken, course, group } = await setup();
    const otherGroup = await createGroup({ courseId: course.id, name: 'BE-07' });
    await createExam(teacherToken, { title: 'Oraliq imtihon', groupId: group.id, date: '2026-09-10', maxScore: 100 });
    const final = await createExam(adminToken, { title: 'Yakuniy nazorat', groupId: otherGroup.id, date: '2026-10-05', maxScore: 100 });
    await request(app).put(`/api/exams/${final.body.data.id}`).set(bearer(adminToken)).send({ status: 'CANCELLED' });

    const total = async (query: Record<string, string>) => {
      const response = await request(app).get('/api/exams').query(query).set(bearer(adminToken));
      expect(response.status).toBe(200);
      return response.body.meta.total as number;
    };

    expect(await total({})).toBe(2);
    expect(await total({ courseId: course.id })).toBe(2);
    expect(await total({ groupId: otherGroup.id })).toBe(1);
    expect(await total({ teacherId: teacher.id })).toBe(1);
    expect(await total({ status: 'CANCELLED' })).toBe(1);
    expect(await total({ from: '2026-10-01' })).toBe(1);
    expect(await total({ to: '2026-09-30' })).toBe(1);
    expect(await total({ search: 'yakuniy' })).toBe(1);
    expect(await total({ search: 'FE-01' })).toBe(1);
  });

  it('tahrirlash, o‘tish balisiz statistika va guruhdan chiqqan o‘quvchi natijasi', async () => {
    const { teacherToken, group, students } = await setup();
    const exam = await createExam(teacherToken, { title: 'Test ishi', groupId: group.id, date: '2026-09-20', maxScore: 20 });
    const id = exam.body.data.id as string;

    const updated = await request(app)
      .put(`/api/exams/${id}`)
      .set(bearer(teacherToken))
      .send({ title: 'Nazorat ishi', date: '2026-09-25', xpReward: 15 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ title: 'Nazorat ishi', date: '2026-09-25', xpReward: 15 });

    const graded = await request(app)
      .put(`/api/exams/${id}/results`)
      .set(bearer(teacherToken))
      .send({ records: [{ studentId: students[0].id, score: 18 }, { studentId: students[1].id, score: 10 }] });
    expect(graded.status).toBe(200);
    expect(graded.body.data.status).toBe('GRADED');
    expect(graded.body.data.stats).toMatchObject({ passRate: 0, averagePercentage: 70, highest: 18, lowest: 10 });
    expect(graded.body.data.results.every((row: { passed: boolean | null }) => row.passed === null)).toBe(true);

    // O'quvchi guruhdan chiqsa ham natijasi imtihon tafsilotida qoladi
    await prisma.student.update({ where: { id: students[0].id }, data: { groupId: null } });
    const detail = await request(app).get(`/api/exams/${id}`).set(bearer(teacherToken));
    expect(detail.body.data.stats.students).toBe(1);
    expect(detail.body.data.results).toHaveLength(2);
    expect(detail.body.data.results.find((row: { studentId: string }) => row.studentId === students[0].id)).toMatchObject({ score: 18, grade: 'A' });
  });
});
