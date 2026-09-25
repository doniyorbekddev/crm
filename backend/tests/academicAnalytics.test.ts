import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { businessDateString, dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 12 — akademik analitika (TZ 3.0 §46–49): kurs (zaif mavzular bilan), guruh taqqoslash,
 * o'qituvchi (faqat raqamli kuzatuv), mavzu, vazifa, imtihon, o'quvchi kesimlari; doira va ruxsat.
 */
const app = createApp();
const DAY = 86_400_000;
let phone = 0;

const ago = (days: number) => new Date(Date.now() - days * DAY);

async function student(courseId: string, groupId: string, name: string, risk: 'HEALTHY' | 'CRITICAL' = 'HEALTHY') {
  phone += 1;
  return prisma.student.create({
    data: { firstName: name, lastName: 'Analitik', phone: `+99887${String(1_000_000 + phone).slice(-7)}`, courseId, groupId, contractPrice: 1_000_000, startDate: new Date('2026-01-01'), riskLevel: risk },
  });
}

async function mark(groupId: string, studentId: string, daysAgo: number, status: 'PRESENT' | 'ABSENT') {
  await prisma.attendance.create({ data: { studentId, groupId, date: dateColumn(ago(daysAgo)), status } });
}

describe.skipIf(!hasTestDatabase)('Akademik analitika (PHASE 12)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setup() {
    const { user: teacherA, token: tokenA } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: teacherB } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const course = await createCourse('Frontend');
    const groupA = await createGroup({ courseId: course.id, teacherId: teacherA.id, name: 'Front-A' });
    const groupB = await createGroup({ courseId: course.id, teacherId: teacherB.id, name: 'Front-B' });
    const a1 = await student(course.id, groupA.id, 'Ali');
    const a2 = await student(course.id, groupA.id, 'Vali', 'CRITICAL');
    const b1 = await student(course.id, groupB.id, 'Sami');
    // Davomat: Front-A oldingi oyda 4/4, joriy oyda 2/4; Front-B joriy oyda 2/2
    for (const days of [40, 45]) {
      await mark(groupA.id, a1.id, days, 'PRESENT');
      await mark(groupA.id, a2.id, days, 'PRESENT');
    }
    for (const days of [5, 10]) {
      await mark(groupA.id, a1.id, days, 'PRESENT');
      await mark(groupA.id, a2.id, days, 'ABSENT');
      await mark(groupB.id, b1.id, days, 'PRESENT');
    }
    // Vazifa: Front-A — 1/2 topshirgan (80 ball), Front-B — 1/1 (60 ball)
    const hwA = await prisma.homework.create({ data: { title: 'Grid', groupId: groupA.id, deadline: ago(3), maxPoints: 100, status: 'PUBLISHED' } });
    await prisma.homeworkSubmission.createMany({ data: [{ homeworkId: hwA.id, studentId: a1.id, status: 'GRADED', score: 80 }, { homeworkId: hwA.id, studentId: a2.id, status: 'MISSED' }] });
    const hwB = await prisma.homework.create({ data: { title: 'Flex', groupId: groupB.id, deadline: ago(3), maxPoints: 100, status: 'PUBLISHED' } });
    await prisma.homeworkSubmission.create({ data: { homeworkId: hwB.id, studentId: b1.id, status: 'LATE', score: 60 } });
    // Imtihon: Front-A 90 va 40 (o'tish 60)
    const exam = await prisma.exam.create({ data: { title: 'Oylik', groupId: groupA.id, date: dateColumn(ago(2)), maxScore: 100, passScore: 60, status: 'GRADED' } });
    await prisma.examResult.createMany({ data: [{ examId: exam.id, studentId: a1.id, score: 90, percentage: 90 }, { examId: exam.id, studentId: a2.id, score: 40, percentage: 40 }] });
    // Mavzular: 2 ta; Ali 1 tasini tugatgan; o'zlashtirish Async — past
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'JS' } });
    const async = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Async' } });
    const dom = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'DOM' } });
    await prisma.studentTopicProgress.create({ data: { studentId: a1.id, topicId: dom.id, status: 'COMPLETED' } });
    await prisma.topicMastery.createMany({
      data: [
        { studentId: a1.id, topicId: async.id, score: 40, status: 'LEARNING', calculatedAt: new Date() },
        { studentId: a2.id, topicId: async.id, score: 30, status: 'LEARNING', calculatedAt: new Date() },
        { studentId: a1.id, topicId: dom.id, score: 90, status: 'MASTERED', calculatedAt: new Date() },
      ],
    });
    // Retention: Front-A dan bitta o'quvchi davrda ketgan
    const left = await prisma.student.create({ data: { firstName: 'Ketgan', lastName: 'Analitik', phone: '+998870000999', courseId: course.id, groupId: groupA.id, contractPrice: 1, startDate: new Date('2026-01-01'), status: 'DROPPED' } });
    await prisma.studentStatusChange.create({ data: { studentId: left.id, fromStatus: 'ACTIVE', toStatus: 'DROPPED', changedAt: ago(4) } });
    await prisma.feedback.create({ data: { studentId: a1.id, teacherId: teacherA.id, groupId: groupA.id, rating: 4, type: 'TEACHER' } });
    return { tokenA, owner, course, groupA, groupB, teacherA, a1 };
  }

  it('kurs kesimi: yig‘ma foizlar, progress, retention, xavf va zaif mavzular', async () => {
    const { owner, course } = await setup();
    const response = await request(app).get('/api/analytics/academic').query({ dimension: 'course' }).set(bearer(owner));
    expect(response.status).toBe(200);
    const [row] = response.body.data.rows;
    expect(row).toMatchObject({
      key: course.id,
      label: 'Frontend',
      sublabel: '2 guruh',
      students: 3,
      attendanceRate: 67, // 4 ta keldi / 6 ta belgi (joriy 30 kun)
      homeworkRate: 67, // 2/3
      averageScore: 70, // (80 + 60) / 2
      examAverage: 65,
      passRate: 50,
      retention: 75, // 3 / (3 + 1)
      atRisk: 1,
      progress: 17, // Ali 50%, qolganlar 0% → o'rtacha 17
    });
    expect(row.weakTopics).toEqual([{ id: expect.any(String), title: 'Async', mastery: 35 }]);
    expect(response.body.data.totals).toMatchObject({ students: 3, attendanceRate: 67 });
  });

  it('guruh taqqoslash va o‘qituvchi: faqat raqamli kuzatuv; o‘qituvchi faqat o‘z guruhini ko‘radi', async () => {
    const { owner, tokenA, teacherA } = await setup();
    const groups = (await request(app).get('/api/analytics/academic').query({ dimension: 'group' }).set(bearer(owner))).body.data;
    const byName = Object.fromEntries(groups.rows.map((row: { label: string }) => [row.label, row]));
    expect(byName['Front-A']).toMatchObject({ attendanceRate: 50, homeworkRate: 50, examAverage: 65, retention: 67 });
    expect(byName['Front-B']).toMatchObject({ attendanceRate: 100, homeworkRate: 100, retention: 100 });
    expect(groups.observations).toContain('Front-A: davomat 100% → 50% (pasaydi).');
    expect(groups.observations.join(' ')).not.toMatch(/yomon|zaif o‘qituvchi|samarasiz/i);

    const teachers = (await request(app).get('/api/analytics/academic').query({ dimension: 'teacher' }).set(bearer(owner))).body.data;
    expect(teachers.rows).toHaveLength(2);
    // O'quvchi fikri o'rtachasi — o'qituvchi qatorida (§49 "Student feedback")
    expect(teachers.rows.find((row: { key: string }) => row.key === teacherA.id)).toMatchObject({ feedback: 4, students: 2 });

    const own = (await request(app).get('/api/analytics/academic').query({ dimension: 'group' }).set(bearer(tokenA))).body.data;
    expect(own.rows.map((row: { label: string }) => row.label)).toEqual(['Front-A']);
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    expect((await request(app).get('/api/analytics/academic').set(bearer(accountant))).status).toBe(403);
  });

  it('mavzu, vazifa, imtihon va o‘quvchi kesimlari; noto‘g‘ri davr 422', async () => {
    const { owner } = await setup();
    const topics = (await request(app).get('/api/analytics/academic').query({ dimension: 'topic' }).set(bearer(owner))).body.data.rows;
    expect(topics.find((row: { label: string }) => row.label === 'Async')).toMatchObject({ mastery: 35, students: 2, masteredShare: 0 });
    expect(topics.find((row: { label: string }) => row.label === 'DOM')).toMatchObject({ mastery: 90, masteredShare: 100 });

    const homework = (await request(app).get('/api/analytics/academic').query({ dimension: 'homework' }).set(bearer(owner))).body.data.rows;
    expect(homework.find((row: { label: string }) => row.label === 'Grid')).toMatchObject({ homeworkRate: 50, averageScore: 80, missedRate: 50, lateRate: 0 });
    expect(homework.find((row: { label: string }) => row.label === 'Flex')).toMatchObject({ lateRate: 100 });

    const exams = (await request(app).get('/api/analytics/academic').query({ dimension: 'exam' }).set(bearer(owner))).body.data.rows;
    expect(exams).toEqual([expect.objectContaining({ label: 'Oylik', students: 2, examAverage: 65, passRate: 50 })]);

    const students = (await request(app).get('/api/analytics/academic').query({ dimension: 'student' }).set(bearer(owner))).body.data.rows;
    expect(students.find((row: { label: string }) => row.label === 'Analitik Ali')).toMatchObject({ attendanceRate: 100, mastery: 65, progress: 50 });

    const to = businessDateString(new Date());
    expect((await request(app).get('/api/analytics/academic').query({ from: to, to: '2020-01-01' }).set(bearer(owner))).status).toBe(422);
    expect((await request(app).get('/api/analytics/academic').query({ dimension: 'nima' }).set(bearer(owner))).status).toBe(422);
  });
});
