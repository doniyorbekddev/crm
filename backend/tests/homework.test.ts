import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

const FUTURE = '2030-01-01T18:00:00.000Z';
const PAST = '2020-01-01T18:00:00.000Z';

let counter = 0;

async function enroll(courseId: string, groupId: string) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(3_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

/** Seedda bo‘ladigan XP qoidalari */
async function seedXpRules() {
  await prisma.xpRule.createMany({
    data: [
      { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasi', source: 'HOMEWORK', points: 20 },
      { key: 'EXAM_EXCELLENT', name: 'Imtihon 90%+', source: 'EXAM', points: 50 },
      { key: 'EXAM_GOOD', name: 'Imtihon 75%+', source: 'EXAM', points: 30 },
    ],
  });
}

async function setupClass() {
  const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
  const students = [await enroll(course.id, group.id), await enroll(course.id, group.id), await enroll(course.id, group.id)];
  return { teacher, teacherToken, course, group, students };
}

async function totalXp(studentId: string): Promise<number> {
  const profile = await prisma.gamificationProfile.findUnique({ where: { studentId }, select: { totalXp: true } });
  return profile?.totalXp ?? 0;
}

describe.skipIf(!hasTestDatabase)('Uy vazifasi va imtihonlar (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedXpRules();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Uy vazifasi', () => {
    it('e’lon qilinganda guruhdagi har bir o‘quvchiga topshiriq ochiladi', async () => {
      const { teacherToken, group } = await setupClass();

      const response = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'React hooks', groupId: group.id, deadline: FUTURE, maxPoints: 50 });
      expect(response.status).toBe(201);
      expect(response.body.data.submissions).toHaveLength(3);
      expect(response.body.data.stats).toMatchObject({ students: 3, submitted: 0, pending: 3 });
    });

    it('qoralamada topshiriq ochilmaydi, e’lon qilinganda ochiladi', async () => {
      const { teacherToken, group } = await setupClass();

      const draft = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Qoralama vazifa', groupId: group.id, deadline: FUTURE, status: 'DRAFT' });
      expect(draft.body.data.submissions).toHaveLength(0);

      const published = await request(app)
        .put(`/api/homework/${draft.body.data.id}`)
        .set(bearer(teacherToken))
        .send({ status: 'PUBLISHED' });
      expect(published.body.data.submissions).toHaveLength(3);
    });

    it('baholash XP beradi, qayta baholash XP ni takrorlamaydi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const student = students[0]!;
      const homework = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Amaliyot', groupId: group.id, deadline: FUTURE, maxPoints: 50 });

      const graded = await request(app)
        .patch(`/api/homework/${homework.body.data.id}/submissions/${student.id}`)
        .set(bearer(teacherToken))
        .send({ score: 45, feedback: 'Yaxshi' });
      expect(graded.status).toBe(200);
      const submission = graded.body.data.submissions.find((row: { studentId: string }) => row.studentId === student.id);
      expect(submission).toMatchObject({ status: 'GRADED', score: 45, feedback: 'Yaxshi', xpAwarded: 20 });
      expect(await totalXp(student.id)).toBe(20);

      await request(app)
        .patch(`/api/homework/${homework.body.data.id}/submissions/${student.id}`)
        .set(bearer(teacherToken))
        .send({ score: 48 });
      expect(await totalXp(student.id)).toBe(20);
    });

    it('kechikkan topshiriqqa XP berilmaydi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const student = students[0]!;
      const homework = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Eski vazifa', groupId: group.id, deadline: PAST });

      const response = await request(app)
        .put(`/api/homework/${homework.body.data.id}/submissions`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: student.id }] });
      const submission = response.body.data.submissions.find((row: { studentId: string }) => row.studentId === student.id);
      expect(submission).toMatchObject({ status: 'LATE', xpAwarded: 0 });
      expect(await totalXp(student.id)).toBe(0);
    });

    it('butun guruhni bir so‘rovda belgilaydi va ortiqcha ballni rad etadi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const homework = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Guruh vazifasi', groupId: group.id, deadline: FUTURE, maxPoints: 10 });

      const bulk = await request(app)
        .put(`/api/homework/${homework.body.data.id}/submissions`)
        .set(bearer(teacherToken))
        .send({ records: students.map((student) => ({ studentId: student.id, status: 'SUBMITTED' })) });
      expect(bulk.body.data.stats).toMatchObject({ submitted: 3, submissionRate: 100 });

      const tooHigh = await request(app)
        .put(`/api/homework/${homework.body.data.id}/submissions`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: students[0]!.id, score: 11 }] });
      expect(tooHigh.status).toBe(422);
    });

    it('baholangan vazifa o‘chirilmaydi, baholanmagani o‘chiriladi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const graded = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Baholangan', groupId: group.id, deadline: FUTURE });
      await request(app)
        .patch(`/api/homework/${graded.body.data.id}/submissions/${students[0]!.id}`)
        .set(bearer(teacherToken))
        .send({ score: 90 });
      expect((await request(app).delete(`/api/homework/${graded.body.data.id}`).set(bearer(teacherToken))).status).toBe(409);

      const fresh = await request(app)
        .post('/api/homework')
        .set(bearer(teacherToken))
        .send({ title: 'Yangi', groupId: group.id, deadline: FUTURE });
      expect((await request(app).delete(`/api/homework/${fresh.body.data.id}`).set(bearer(teacherToken))).status).toBe(200);
    });

    it('o‘qituvchi faqat o‘z guruhlari bilan ishlaydi', async () => {
      const own = await setupClass();
      const other = await setupClass();
      await request(app)
        .post('/api/homework')
        .set(bearer(other.teacherToken))
        .send({ title: 'Boshqa guruh vazifasi', groupId: other.group.id, deadline: FUTURE });

      const forbiddenGroup = await request(app)
        .post('/api/homework')
        .set(bearer(own.teacherToken))
        .send({ title: 'Begona guruhga', groupId: other.group.id, deadline: FUTURE });
      expect(forbiddenGroup.status).toBe(422);

      const list = await request(app).get('/api/homework').set(bearer(own.teacherToken));
      expect(list.body.meta.total).toBe(0);

      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const adminList = await request(app).get('/api/homework').set(bearer(adminToken));
      expect(adminList.body.meta.total).toBe(1);
    });
  });

  describe('Imtihon', () => {
    it('foiz, baho, o‘tish va XP ni hisoblaydi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const [excellent, good, weak] = students as [(typeof students)[0], (typeof students)[0], (typeof students)[0]];
      const exam = await request(app)
        .post('/api/exams')
        .set(bearer(teacherToken))
        .send({ title: 'Oraliq imtihon', groupId: group.id, date: '2026-09-18', maxScore: 50, passScore: 30 });
      expect(exam.status).toBe(201);
      expect(exam.body.data.results).toHaveLength(3);

      const partial = await request(app)
        .put(`/api/exams/${exam.body.data.id}/results`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: excellent.id, score: 47 }] });
      expect(partial.body.data.status).toBe('HELD');

      const response = await request(app)
        .put(`/api/exams/${exam.body.data.id}/results`)
        .set(bearer(teacherToken))
        .send({
          records: [
            { studentId: good.id, score: 40 },
            { studentId: weak.id, score: 20, comment: 'Takrorlash kerak' },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('GRADED');

      const byStudent = new Map(
        response.body.data.results.map((row: { studentId: string }) => [row.studentId, row] as const),
      );
      expect(byStudent.get(excellent.id)).toMatchObject({ percentage: 94, grade: 'A', passed: true, xpAwarded: 50 });
      expect(byStudent.get(good.id)).toMatchObject({ percentage: 80, grade: 'B', passed: true, xpAwarded: 30 });
      expect(byStudent.get(weak.id)).toMatchObject({ percentage: 40, grade: 'F', passed: false, xpAwarded: 0 });
      expect(response.body.data.stats).toMatchObject({ graded: 3, highest: 47, lowest: 20, passRate: 67 });

      expect(await totalXp(excellent.id)).toBe(50);
    });

    it('maksimal balldan katta natija va bekor qilingan imtihon rad etiladi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const exam = await request(app)
        .post('/api/exams')
        .set(bearer(teacherToken))
        .send({ title: 'Test', groupId: group.id, date: '2026-09-18', maxScore: 20 });

      const tooHigh = await request(app)
        .put(`/api/exams/${exam.body.data.id}/results`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: students[0]!.id, score: 21 }] });
      expect(tooHigh.status).toBe(422);

      await request(app).put(`/api/exams/${exam.body.data.id}`).set(bearer(teacherToken)).send({ status: 'CANCELLED' });
      const cancelled = await request(app)
        .put(`/api/exams/${exam.body.data.id}/results`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: students[0]!.id, score: 10 }] });
      expect(cancelled.status).toBe(422);
    });

    it('natijasi bor imtihon o‘chirilmaydi va maksimal bali o‘zgarmaydi', async () => {
      const { teacherToken, group, students } = await setupClass();
      const exam = await request(app)
        .post('/api/exams')
        .set(bearer(teacherToken))
        .send({ title: 'Yakuniy', groupId: group.id, date: '2026-09-18', maxScore: 100 });
      await request(app)
        .put(`/api/exams/${exam.body.data.id}/results`)
        .set(bearer(teacherToken))
        .send({ records: [{ studentId: students[0]!.id, score: 70 }] });

      expect((await request(app).delete(`/api/exams/${exam.body.data.id}`).set(bearer(teacherToken))).status).toBe(409);
      const changeMax = await request(app)
        .put(`/api/exams/${exam.body.data.id}`)
        .set(bearer(teacherToken))
        .send({ maxScore: 50 });
      expect(changeMax.status).toBe(409);
    });

    it('sotuv manageri uy vazifasi va imtihonlarni ko‘rmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      expect((await request(app).get('/api/homework').set(bearer(token))).status).toBe(403);
      expect((await request(app).get('/api/exams').set(bearer(token))).status).toBe(403);
    });
  });
});
