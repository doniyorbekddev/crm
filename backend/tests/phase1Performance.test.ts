import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database.js';
import { withJobLease } from '../src/jobs/jobLease.js';
import { leadScoreService } from '../src/services/leadScore.service.js';
import { cleanupRetention, RETENTION_DAYS } from '../src/services/retention.service.js';
import { studentRiskService } from '../src/services/studentRisk.service.js';
import { businessDateString } from '../src/utils/dates.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

/**
 * CRM 4.0, 1-faza (unumdorlik poydevori): to'plamli hisob eski natijani o'zgartirmasligi,
 * kunlik tarix, fon vazifasi ijarasi va saqlash muddati.
 */
const DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(new Date().setHours(0, 0, 0, 0) - days * DAY);
}

async function seedStudent(courseId: string, groupId: string, name: string, attendance: Array<'PRESENT' | 'ABSENT'>, paid = 0) {
  const student = await prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: daysAgo(120),
      debt: { create: { totalAmount: 1_000_000, paidAmount: paid, remainingAmount: 1_000_000 - paid } },
    },
  });
  for (const [index, status] of attendance.entries()) {
    const date = daysAgo(attendance.length - index);
    await prisma.attendanceSession.upsert({
      where: { groupId_date: { groupId, date } },
      update: {},
      create: { groupId, date, status: 'HELD' },
    });
    await prisma.attendance.create({ data: { studentId: student.id, groupId, date, status } });
  }
  return student;
}

describe.skipIf(!hasTestDatabase)('CRM 4.0 · 1-faza: unumdorlik poydevori', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('xavf bahosi — to‘plamli hisob', () => {
    it('saqlangan natija bitta o‘quvchi uchun yangidan hisoblangan natija bilan bir xil', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const students = [
        await seedStudent(course.id, group.id, 'Yaxshi', ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'], 1_000_000),
        await seedStudent(course.id, group.id, 'O‘rta', ['PRESENT', 'ABSENT', 'PRESENT', 'ABSENT'], 500_000),
        await seedStudent(course.id, group.id, 'Yomon', ['ABSENT', 'ABSENT', 'ABSENT', 'ABSENT']),
      ];
      const now = new Date();

      const result = await studentRiskService.recalculateAll(now);
      expect(result.updated).toBe(3);

      const levels = new Set<string | null>();
      for (const student of students) {
        const expected = await studentRiskService.forStudent(student.id, now);
        const stored = await prisma.student.findUniqueOrThrow({
          where: { id: student.id },
          select: { healthScore: true, riskLevel: true, riskFactors: true, riskUpdatedAt: true },
        });
        expect(stored.healthScore).toBe(expected.healthScore);
        expect(stored.riskLevel).toBe(expected.riskLevel);
        expect(stored.riskFactors).toEqual(JSON.parse(JSON.stringify(expected.factors)));
        expect(stored.riskUpdatedAt).not.toBeNull();
        levels.add(stored.riskLevel);
      }
      // Test ma'nosiz bo'lib qolmasin: o'quvchilar haqiqatan turli darajada
      expect(levels.size).toBeGreaterThan(1);
    });

    it('fon hisobi o‘quvchi kartasining `updatedAt` vaqtini o‘zgartirmaydi', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await seedStudent(course.id, group.id, 'Tegilmagan', ['PRESENT', 'PRESENT', 'PRESENT']);
      const edited = new Date('2026-01-15T10:00:00Z');
      await prisma.$executeRaw`UPDATE "students" SET "updatedAt" = ${edited} WHERE "id" = ${student.id}`;

      await studentRiskService.recalculateAll();

      const stored = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { updatedAt: true, riskUpdatedAt: true } });
      expect(stored.updatedAt.toISOString()).toBe(edited.toISOString());
      expect(stored.riskUpdatedAt).not.toBeNull();
    });

    it('kunlik tarix: kuniga bitta qator, qiymat o‘zgarsa shu qator yangilanadi, yangi kunda yangi qator', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await seedStudent(course.id, group.id, 'Tarix', ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'], 1_000_000);
      const now = new Date();

      await studentRiskService.recalculateAll(now);
      await studentRiskService.recalculateAll(now);

      const first = await prisma.riskSnapshot.findMany({ where: { studentId: student.id } });
      const stored = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { healthScore: true, riskLevel: true } });
      expect(first).toHaveLength(1);
      expect(first[0]!.date.toISOString().slice(0, 10)).toBe(businessDateString(now));
      expect(first[0]).toMatchObject({ healthScore: stored.healthScore, riskLevel: stored.riskLevel });

      // Shu kuni ahvol yomonlashdi — o'sha kunning qatori yangi qiymatni ko'rsatadi
      for (let index = 1; index <= 6; index += 1) {
        await prisma.attendance.upsert({
          where: { studentId_groupId_date: { studentId: student.id, groupId: group.id, date: daysAgo(index) } },
          update: { status: 'ABSENT' },
          create: { studentId: student.id, groupId: group.id, date: daysAgo(index), status: 'ABSENT' },
        });
      }
      await studentRiskService.recalculateAll(now);
      const sameDay = await prisma.riskSnapshot.findMany({ where: { studentId: student.id } });
      const worse = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { healthScore: true } });
      expect(sameDay).toHaveLength(1);
      expect(worse.healthScore).toBeLessThan(stored.healthScore!);
      expect(sameDay[0]!.healthScore).toBe(worse.healthScore);

      // Ertasi kuni — alohida qator, kechagisi o'zgarmaydi
      await studentRiskService.recalculateAll(new Date(now.getTime() + DAY));
      const nextDay = await prisma.riskSnapshot.findMany({ where: { studentId: student.id }, orderBy: { date: 'asc' } });
      expect(nextDay).toHaveLength(2);
      expect(nextDay[0]!.healthScore).toBe(worse.healthScore);
    });
  });

  describe('lead scoring — to‘plamli hisob', () => {
    it('saqlangan ball bitta lead uchun hisoblangan ball bilan bir xil, `updatedAt` o‘zgarmaydi, yopilgan leadga tegilmaydi', async () => {
      const source = await createSource();
      const course = await createCourse();
      const fresh = await createLead({ sourceId: source.id });
      const engaged = await createLead({ sourceId: source.id });
      const closed = await createLead({ sourceId: source.id });
      await prisma.lead.update({
        where: { id: engaged.id },
        data: { status: 'TRIAL_ATTENDED', courseId: course.id, lastContactedAt: new Date(), nextFollowUpAt: new Date(Date.now() + DAY) },
      });
      await prisma.lead.update({ where: { id: closed.id }, data: { status: 'LOST' } });
      const edited = new Date('2026-01-15T10:00:00Z');
      await prisma.$executeRaw`UPDATE "leads" SET "updatedAt" = ${edited}`;
      const now = new Date();

      const result = await leadScoreService.recalculateAll(now);
      expect(result.updated).toBe(2);

      for (const lead of [fresh, engaged]) {
        const expected = await leadScoreService.forLead(lead.id, now);
        const stored = await prisma.lead.findUniqueOrThrow({
          where: { id: lead.id },
          select: { score: true, temperature: true, scoreFactors: true, scoreUpdatedAt: true, updatedAt: true },
        });
        expect(stored.score).toBe(expected!.score);
        expect(stored.temperature).toBe(expected!.temperature);
        expect(stored.scoreFactors).toEqual(JSON.parse(JSON.stringify(expected!.factors)));
        expect(stored.scoreUpdatedAt).not.toBeNull();
        expect(stored.updatedAt.toISOString()).toBe(edited.toISOString());
      }
      const scores = await prisma.lead.findMany({ where: { id: { in: [fresh.id, engaged.id] } }, select: { score: true } });
      expect(new Set(scores.map((row) => row.score)).size).toBe(2);

      const untouched = await prisma.lead.findUniqueOrThrow({ where: { id: closed.id }, select: { score: true, scoreUpdatedAt: true } });
      expect(untouched).toEqual({ score: null, scoreUpdatedAt: null });
    });
  });

  describe('fon vazifasi ijarasi', () => {
    it('bir vaqtda faqat bitta bajaruvchi; tugagach keyingisi oladi', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let runs = 0;

      const first = withJobLease('test-job', async () => {
        runs += 1;
        await gate;
      });
      // Birinchisi ijarani olib, ichida kutib turibdi
      await expect.poll(() => prisma.jobLease.count({ where: { name: 'test-job', lockedUntil: { gt: new Date() } } })).toBe(1);

      const second = await withJobLease('test-job', async () => {
        runs += 1;
      });
      const other = await withJobLease('other-job', async () => {
        runs += 1;
      });
      expect(second).toBe(false);
      // Boshqa nomdagi vazifaga ta'sir qilmaydi
      expect(other).toBe(true);
      expect(runs).toBe(2);

      release();
      expect(await first).toBe(true);
      expect(await withJobLease('test-job', async () => { runs += 1; })).toBe(true);
      expect(runs).toBe(3);
    });

    it('boshqa jarayonning amaldagi ijarasi hurmat qilinadi, muddati o‘tgani esa olinadi', async () => {
      let ran = false;
      await prisma.jobLease.create({ data: { name: 'crashed-job', owner: 'boshqa-jarayon', lockedUntil: new Date(Date.now() + 60_000) } });
      expect(await withJobLease('crashed-job', async () => { ran = true; })).toBe(false);
      expect(ran).toBe(false);

      // Egasi qulagan: uzaytirish to'xtagan, muddat o'tgan
      await prisma.jobLease.update({ where: { name: 'crashed-job' }, data: { lockedUntil: new Date(Date.now() - 1_000) } });
      expect(await withJobLease('crashed-job', async () => { ran = true; })).toBe(true);
      expect(ran).toBe(true);
    });

    it('vazifa xato bilan tugasa ham ijara bo‘shatiladi', async () => {
      await expect(
        withJobLease('failing-job', async () => {
          throw new Error('ichki xato');
        }),
      ).rejects.toThrow('ichki xato');
      expect(await withJobLease('failing-job', async () => undefined)).toBe(true);
    });
  });

  describe('saqlash muddati', () => {
    it('faqat muddati o‘tgan xizmat yozuvlari o‘chadi; navbatdagi va yangi yozuvlar qoladi', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'retention@test.uz',
          passwordHash: 'x',
          firstName: 'Saqlash',
          lastName: 'Muddati',
          role: { connect: { key: 'ADMIN' } },
        },
      });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await seedStudent(course.id, group.id, 'Tarixli', []);
      const now = new Date();
      const before = (days: number) => new Date(now.getTime() - days * DAY);
      const older = (days: number) => before(days + 2);
      const newer = (days: number) => before(days - 2);

      await prisma.refreshToken.createMany({
        data: [
          { userId: user.id, tokenHash: 'old', familyId: 'f1', expiresAt: older(RETENTION_DAYS.refreshTokens) },
          { userId: user.id, tokenHash: 'recently-expired', familyId: 'f2', expiresAt: newer(RETENTION_DAYS.refreshTokens) },
          { userId: user.id, tokenHash: 'valid', familyId: 'f3', expiresAt: new Date(now.getTime() + 7 * DAY) },
        ],
      });
      await prisma.telegramEvent.createMany({
        data: [
          { kind: 'message', createdAt: older(RETENTION_DAYS.telegramEvents) },
          { kind: 'message', createdAt: newer(RETENTION_DAYS.telegramEvents) },
        ],
      });
      await prisma.aiQuery.createMany({
        data: [
          { question: 'eski', createdAt: older(RETENTION_DAYS.aiQueries) },
          { question: 'yangi', createdAt: newer(RETENTION_DAYS.aiQueries) },
        ],
      });
      await prisma.notification.createMany({
        data: [
          { userId: user.id, type: 'SYSTEM', title: 'o‘qilgan eski', message: '-', readAt: before(1), createdAt: older(RETENTION_DAYS.notificationsRead) },
          { userId: user.id, type: 'SYSTEM', title: 'o‘qilgan yangi', message: '-', readAt: before(1), createdAt: newer(RETENTION_DAYS.notificationsRead) },
          { userId: user.id, type: 'SYSTEM', title: 'o‘qilmagan', message: '-', createdAt: older(RETENTION_DAYS.notificationsRead) },
          { userId: user.id, type: 'SYSTEM', title: 'o‘qilmagan juda eski', message: '-', createdAt: older(RETENTION_DAYS.notificationsUnread) },
        ],
      });
      await prisma.notificationDelivery.createMany({
        data: [
          { channel: 'TELEGRAM', status: 'SENT', title: 'yuborilgan eski', body: '-', createdAt: older(RETENTION_DAYS.notificationDeliveries) },
          { channel: 'TELEGRAM', status: 'FAILED', title: 'xato eski', body: '-', createdAt: older(RETENTION_DAYS.notificationDeliveries) },
          { channel: 'TELEGRAM', status: 'PENDING', title: 'navbatda eski', body: '-', createdAt: older(RETENTION_DAYS.notificationDeliveries) },
          { channel: 'TELEGRAM', status: 'SENT', title: 'yuborilgan yangi', body: '-', createdAt: newer(RETENTION_DAYS.notificationDeliveries) },
        ],
      });
      await prisma.riskSnapshot.createMany({
        data: [
          { studentId: student.id, date: older(RETENTION_DAYS.riskSnapshots), healthScore: 50 },
          { studentId: student.id, date: newer(RETENTION_DAYS.riskSnapshots), healthScore: 60 },
        ],
      });

      const result = await cleanupRetention(now);

      expect(result).toEqual({
        refreshTokens: 1,
        telegramEvents: 1,
        aiQueries: 1,
        automationRuns: 0,
        notificationDeliveries: 2,
        notifications: 2,
        riskSnapshots: 1,
      });
      expect((await prisma.refreshToken.findMany({ select: { tokenHash: true }, orderBy: { tokenHash: 'asc' } })).map((row) => row.tokenHash)).toEqual([
        'recently-expired',
        'valid',
      ]);
      expect((await prisma.notification.findMany({ select: { title: true }, orderBy: { title: 'asc' } })).map((row) => row.title)).toEqual([
        'o‘qilgan yangi',
        'o‘qilmagan',
      ]);
      expect((await prisma.notificationDelivery.findMany({ select: { title: true }, orderBy: { title: 'asc' } })).map((row) => row.title)).toEqual([
        'navbatda eski',
        'yuborilgan yangi',
      ]);
      expect((await prisma.aiQuery.findMany({ select: { question: true } })).map((row) => row.question)).toEqual(['yangi']);
      expect(await prisma.telegramEvent.count()).toBe(1);
      expect((await prisma.riskSnapshot.findMany({ select: { healthScore: true } })).map((row) => row.healthScore)).toEqual([60]);

      // Ikkinchi yurish — o'chiradigan narsa qolmagan
      const again = await cleanupRetention(now);
      expect(Object.values(again).every((count) => count === 0)).toBe(true);
    });
  });
});
