import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.0 §76 — rahbar bitta dashboarddan akademiya holatini ko'radi */
const app = createApp();
let phone = 0;

async function student(courseId: string, groupId: string, riskLevel: 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | null) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: 'Oqim',
      lastName: `T${phone}`,
      phone: `+99894${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      riskLevel,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('GET /api/dashboard/executive/academy', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ota-ona, guruh, vazifa, xavf, Telegram va AI holati; ruxsatsiz — 403', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const healthy = await student(course.id, group.id, 'HEALTHY');
    const risky = await student(course.id, group.id, 'AT_RISK');
    await student(course.id, group.id, 'CRITICAL');
    await student(course.id, group.id, null);

    const parent = await prisma.parent.create({ data: { firstName: 'Ona', lastName: 'Test', phone: '+998941112233', students: { create: { studentId: risky.id, relation: 'MOTHER' } } } });
    await prisma.telegramLink.create({ data: { parentId: parent.id, chatId: '777', linkCode: 'ovw-1', verifiedAt: new Date() } });
    const homework = await prisma.homework.create({
      data: { title: 'Ochiq vazifa', groupId: group.id, deadline: new Date(Date.now() + 86_400_000), status: 'PUBLISHED', teacherId: teacher.id },
    });
    await prisma.homeworkSubmission.createMany({
      data: [
        { homeworkId: homework.id, studentId: healthy.id, status: 'SUBMITTED' },
        { homeworkId: homework.id, studentId: risky.id, status: 'PENDING' },
      ],
    });

    const response = await request(app).get('/api/dashboard/executive/academy').set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      windowDays: 30,
      parents: { total: 1, withPortal: 0, telegramLinked: 1 },
      courses: { active: 1 },
      groups: { active: 1 },
      homework: { open: 1, toGrade: 1 },
      risk: { healthy: 1, attention: 0, atRisk: 1, critical: 1 },
      telegram: { linkedChats: 1, queued: 0, failed: 0 },
      ai: { mode: 'RULES', analyses: 0, awaitingDecision: 0 },
      exams: { held: 0, averagePercentage: null, needsReview: 0 },
      progress: { averageMastery: null, tracked: 0 },
    });

    expect((await request(app).get('/api/dashboard/executive/academy').set(bearer(teacherToken))).status).toBe(403);
  });
});
