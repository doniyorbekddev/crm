import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WeekDay } from '../src/generated/prisma/client.js';
import { studentRiskService } from '../src/services/studentRisk.service.js';
import { businessDateString, dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 8 — o'qituvchi boshqaruv markazi (TZ 3.0 §28) va risk sabablari (§29):
 * guruh kartalari, o'quvchi jadvali, kutilayotgan ishlar, bugungi dars; yangi risk omillari —
 * imtihon pasaymoqda, ketma-ket topshirilmagan vazifa, faollik, kabinetga kirmagan.
 */
const app = createApp();
const DAY = 86_400_000;
const DAYS: WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
let phone = 0;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

async function createStudent(courseId: string, groupId: string, name: string, startedDaysAgo = 90) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99897${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: daysAgo(startedDaysAgo),
      debt: { create: { totalAmount: 1_000_000, paidAmount: 1_000_000, remainingAmount: 0 } },
    },
  });
}

async function examResult(groupId: string, studentId: string, daysBack: number, percentage: number) {
  const exam = await prisma.exam.create({
    data: { title: `Imtihon ${daysBack}`, groupId, date: dateColumn(daysAgo(daysBack)), maxScore: 100, status: 'GRADED' },
  });
  await prisma.examResult.create({ data: { examId: exam.id, studentId, score: percentage, percentage } });
}

async function homeworkFor(groupId: string, studentId: string, deadlineDaysAgo: number, status: 'MISSED' | 'GRADED' | 'SUBMITTED', score: number | null = null) {
  const homework = await prisma.homework.create({
    data: { title: `Vazifa ${deadlineDaysAgo}`, groupId, deadline: daysAgo(deadlineDaysAgo), assignedAt: daysAgo(deadlineDaysAgo + 3), maxPoints: 100, status: 'PUBLISHED' },
  });
  await prisma.homeworkSubmission.create({
    data: { homeworkId: homework.id, studentId, status, score, submittedAt: status === 'MISSED' ? null : daysAgo(deadlineDaysAgo + 1) },
  });
  return homework;
}

describe.skipIf(!hasTestDatabase)('O‘qituvchi boshqaruv markazi (PHASE 8)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('yangi risk sabablari: imtihon pasaymoqda, ketma-ket topshirmagan, faolsiz, kabinetga kirmagan', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Pasaygan');
    await examResult(group.id, student.id, 60, 85);
    await examResult(group.id, student.id, 10, 55);
    await homeworkFor(group.id, student.id, 30, 'GRADED', 90);
    for (const offset of [9, 6, 3]) await homeworkFor(group.id, student.id, offset, 'MISSED');
    // Kabinet 10 kun oldin ochilgan, lekin hech kirmagan
    const user = await prisma.user.create({
      data: { email: `st${student.number}@kabinet.invalid`, passwordHash: 'x', firstName: 'Pasaygan', lastName: 'Test', roleId: (await prisma.role.findFirstOrThrow({ where: { key: 'STUDENT' } })).id, createdAt: daysAgo(10) },
    });
    await prisma.student.update({ where: { id: student.id }, data: { userId: user.id } });

    const risk = await studentRiskService.forStudent(student.id);
    const factor = (key: string) => risk.factors.find((row) => row.key === key)!;
    expect(factor('examTrend')).toMatchObject({ value: '85% → 55%', score: 0 });
    expect(factor('missedHomework')).toMatchObject({ value: '3 ta', score: 0 });
    // Oxirgi faollik — 31 kun oldingi topshiriq
    expect(factor('activity')).toMatchObject({ value: '31 kun oldin', score: 0 });
    expect(factor('login')).toMatchObject({ value: 'kirmagan', score: 0 });
    expect(risk.reasons).toEqual(
      expect.arrayContaining(['Imtihon natijasi pasaymoqda: 85% → 55%', 'Ketma-ket topshirilmagan vazifa: 3 ta', 'Kabinetga kirish: kirmagan']),
    );

    // Kirdi va vazifa topshirdi — signallar yaxshilanadi
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await homeworkFor(group.id, student.id, 1, 'SUBMITTED');
    const better = await studentRiskService.forStudent(student.id);
    const betterFactor = (key: string) => better.factors.find((row) => row.key === key)!;
    expect(betterFactor('login')).toMatchObject({ value: 'bugun', score: 100 });
    expect(betterFactor('missedHomework')).toMatchObject({ value: '0 ta', score: 100 });
    expect(betterFactor('activity').value).toBe('2 kun oldin');
  });

  it('yangi o‘quvchi va hisobsiz o‘quvchi faolsizlik/kirmaganlik uchun ayblanmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const fresh = await createStudent(course.id, group.id, 'Yangi', 5);
    const risk = await studentRiskService.forStudent(fresh.id);
    const factor = (key: string) => risk.factors.find((row) => row.key === key)!;
    expect(factor('activity').score).toBeNull();
    expect(factor('login')).toMatchObject({ score: null, value: 'hisob yo‘q' });
    expect(factor('examTrend').score).toBeNull();
    expect(factor('missedHomework').score).toBeNull();
  });

  it('overview: o‘qituvchi faqat o‘z guruhlarini, admin hammasini ko‘radi; kartalar va kutilayotgan ishlar', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: other } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const today = DAYS[new Date(`${businessDateString(new Date())}T00:00:00Z`).getUTCDay()]!;
    const tomorrow = DAYS[(DAYS.indexOf(today) + 1) % 7]!;
    const mine = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'A-guruh', scheduleDays: [today] });
    const mineOff = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'B-guruh', scheduleDays: [tomorrow] });
    const foreign = await createGroup({ courseId: course.id, teacherId: other.id, name: 'C-guruh' });
    const anvar = await createStudent(course.id, mine.id, 'Anvar');
    const barno = await createStudent(course.id, mine.id, 'Barno');
    await createStudent(course.id, mineOff.id, 'Sardor');
    await createStudent(course.id, foreign.id, 'Begona');

    // Davomat: Anvar 4/4, Barno 2/4 → guruh o'rtachasi 75%
    for (const [index, offset] of [8, 6, 4, 2].entries()) {
      const date = dateColumn(daysAgo(offset));
      await prisma.attendanceSession.create({ data: { groupId: mine.id, date, status: 'HELD' } });
      await prisma.attendance.create({ data: { studentId: anvar.id, groupId: mine.id, date, status: 'PRESENT' } });
      await prisma.attendance.create({ data: { studentId: barno.id, groupId: mine.id, date, status: index % 2 === 0 ? 'ABSENT' : 'PRESENT' } });
    }
    // Baholanishi kerak: 1 ta topshirilgan vazifa; 1 ta tekshiruvdagi urinish
    await homeworkFor(mine.id, anvar.id, 1, 'SUBMITTED');
    const exam = await prisma.exam.create({ data: { title: 'Esse', groupId: mine.id, date: dateColumn(new Date()), maxScore: 10 } });
    await prisma.examAttempt.create({ data: { examId: exam.id, studentId: barno.id, attemptNo: 1, status: 'NEEDS_REVIEW', maxScore: 10 } });
    // Progress: Anvar mavzu bahosi 80
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'M' } });
    const topic = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'T' } });
    await prisma.topicMastery.create({ data: { studentId: anvar.id, topicId: topic.id, score: 80, status: 'MASTERED', calculatedAt: new Date() } });

    const response = await request(app).get('/api/teaching/overview').set(bearer(token));
    expect(response.status).toBe(200);
    const { totals, groups } = response.body.data;
    expect(groups.map((group: { name: string }) => group.name)).toEqual(['A-guruh', 'B-guruh']);
    const card = groups[0];
    expect(card).toMatchObject({
      students: 2,
      attendanceRate: 75,
      progress: 80,
      pending: { homeworkToGrade: 1, attemptsToReview: 1 },
      today: { isLessonDay: true, attendanceMarked: false },
    });
    expect(groups[1].today.isLessonDay).toBe(false);
    expect(totals).toMatchObject({ groups: 2, students: 3, homeworkToGrade: 1, attemptsToReview: 1, lessonsToday: 1, unmarkedToday: 1 });

    const all = await request(app).get('/api/teaching/overview').set(bearer(admin));
    expect(all.body.data.totals.groups).toBe(3);
    const filtered = await request(app).get('/api/teaching/overview').query({ teacherId: other.id }).set(bearer(admin));
    expect(filtered.body.data.groups.map((group: { name: string }) => group.name)).toEqual(['C-guruh']);
    // O'qituvchi teacherId bilan begona guruhlarni ololmaydi — filtr e'tiborsiz, o'z doirasi
    const spoof = await request(app).get('/api/teaching/overview').query({ teacherId: other.id }).set(bearer(token));
    expect(spoof.body.data.groups.map((group: { name: string }) => group.name)).toEqual(['A-guruh', 'B-guruh']);
  });

  it('guruh jadvali: xavflisi tepada, ko‘rsatkichlar va sabablar; begona — 404, ruxsatsiz — 403', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const good = await createStudent(course.id, group.id, 'Yaxshi');
    const bad = await createStudent(course.id, group.id, 'Xavfli', 120);
    for (const offset of [10, 8, 6, 4]) {
      const date = dateColumn(daysAgo(offset));
      await prisma.attendanceSession.create({ data: { groupId: group.id, date, status: 'HELD' } });
      await prisma.attendance.create({ data: { studentId: good.id, groupId: group.id, date, status: 'PRESENT' } });
      await prisma.attendance.create({ data: { studentId: bad.id, groupId: group.id, date, status: 'ABSENT' } });
    }
    await prisma.debt.update({ where: { studentId: bad.id }, data: { paidAmount: 0, remainingAmount: 1_000_000 } });

    const response = await request(app).get(`/api/teaching/groups/${group.id}`).set(bearer(token));
    expect(response.status).toBe(200);
    const [first, second] = response.body.data.students;
    expect(first).toMatchObject({ firstName: 'Xavfli', riskLevel: 'CRITICAL', attendanceRate: 0 });
    expect(first.reasons.join(' ')).toContain('Davomat');
    expect(first.lastActivityAt).toBeNull();
    expect(second).toMatchObject({ firstName: 'Yaxshi', attendanceRate: 100, riskLevel: 'HEALTHY', hasPortalAccount: false });
    expect(new Date(second.lastActivityAt).getTime()).toBe(dateColumn(daysAgo(4)).getTime());
    expect(response.body.data.group).toMatchObject({ students: 2, attendanceRate: 50, risk: { CRITICAL: 1, HEALTHY: 1 } });

    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get(`/api/teaching/groups/${group.id}`).set(bearer(stranger))).status).toBe(404);
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    expect((await request(app).get('/api/teaching/overview').set(bearer(accountant))).status).toBe(403);
  });
});
