import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { certificateService } from '../src/services/certificate.service.js';
import { examService } from '../src/services/exam.service.js';
import { homeworkService } from '../src/services/homework.service.js';
import type { AuthUser } from '../src/types/auth.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const CLIENT = { ip: null, userAgent: 'test' };

/**
 * PHASE 8: o'quvchi va ota-onaga hodisa xabarlari.
 *
 * Telegram yetkazish navbati (`NotificationDelivery`) bog'langan chat bo'yicha to'ladi —
 * shuning uchun chatlar to'g'ridan-to'g'ri bazada tasdiqlangan holda yaratiladi.
 * Ilova ichidagi xabar (`Notification`) — kabinet hisobi bo'lganda.
 */
async function setup() {
  const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
  const actor: AuthUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    roleKey: 'ADMIN',
    branchId: user.branchId,
  };
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: user.id });
  const student = await prisma.student.create({
    data: {
      firstName: 'Sardor',
      lastName: 'Test',
      phone: '+998901112200',
      courseId: course.id,
      groupId: group.id,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
    },
  });
  const parent = await prisma.parent.create({
    data: { firstName: 'Ota', lastName: 'Ona', phone: '+998901112201', students: { create: [{ studentId: student.id }] } },
  });
  // Ikkala chat ham bog'langan
  await prisma.telegramLink.create({ data: { studentId: student.id, linkCode: 'code-student-1', chatId: '111', verifiedAt: new Date() } });
  await prisma.telegramLink.create({ data: { parentId: parent.id, linkCode: 'code-parent-1', chatId: '222', verifiedAt: new Date() } });
  // O'quvchida kabinet hisobi ham bor — ilova ichida ham olishi kerak
  const account = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(token)).send({ email: 'sardor@portal.uz' });
  const studentUserId = (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { userId: true } })).userId!;
  expect(account.status).toBe(201);
  return { actor, course, group, student, parent, studentUserId };
}

async function deliveriesTitled(title: string) {
  return prisma.notificationDelivery.findMany({ where: { title }, select: { telegramLinkId: true, body: true, status: true } });
}

describe.skipIf(!hasTestDatabase)('O‘quvchi/ota-ona bildirishnomalari (PHASE 8)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('vazifa e’lon qilinganda o‘quvchi va ota-onaga Telegram, o‘quvchiga ilovada ham', async () => {
    const { actor, group, studentUserId } = await setup();

    await homeworkService.create(
      actor,
      { title: 'Algebra 5-mashq', groupId: group.id, deadline: new Date('2030-01-15T10:00:00Z'), maxPoints: 100, xpReward: 20, status: 'PUBLISHED', description: undefined },
      CLIENT,
    );

    const telegram = await deliveriesTitled('Yangi uy vazifasi');
    expect(telegram).toHaveLength(2);
    expect(telegram[0]!.body).toContain('Algebra 5-mashq');
    expect(telegram[0]!.body).toContain('15.01.2030');

    const inApp = await prisma.notification.findMany({ where: { userId: studentUserId, type: 'HOMEWORK_CREATED' } });
    expect(inApp).toHaveLength(1);
    expect(inApp[0]!.priority).toBe('NORMAL');
  });

  it('qoralama (DRAFT) vazifa xabar yubormaydi', async () => {
    const { actor, group } = await setup();

    await homeworkService.create(
      actor,
      { title: 'Qoralama', groupId: group.id, deadline: new Date('2030-01-15T10:00:00Z'), maxPoints: 100, xpReward: 20, status: 'DRAFT', description: undefined },
      CLIENT,
    );

    expect(await deliveriesTitled('Yangi uy vazifasi')).toHaveLength(0);
  });

  it('baholanganda ball va izoh bilan xabar; bir xil ball takror yubormaydi', async () => {
    const { actor, group, student } = await setup();
    const homework = await homeworkService.create(
      actor,
      { title: 'Geometriya', groupId: group.id, deadline: new Date('2030-01-15T10:00:00Z'), maxPoints: 50, xpReward: 20, status: 'PUBLISHED', description: undefined },
      CLIENT,
    );

    await homeworkService.bulkGrade(actor, homework.id, { records: [{ studentId: student.id, score: 45, feedback: 'Zo‘r', status: undefined }] }, CLIENT);
    let graded = await deliveriesTitled('Vazifa baholandi');
    expect(graded).toHaveLength(2);
    expect(graded[0]!.body).toContain('45/50');
    expect(graded[0]!.body).toContain('Zo‘r');

    // Xuddi shu ball qayta saqlansa — yangi xabar yo'q (dedupeKey)
    await homeworkService.bulkGrade(actor, homework.id, { records: [{ studentId: student.id, score: 45, feedback: undefined, status: undefined }] }, CLIENT);
    graded = await deliveriesTitled('Vazifa baholandi');
    expect(graded).toHaveLength(2);

    // Ball o'zgarsa — yangi xabar
    await homeworkService.bulkGrade(actor, homework.id, { records: [{ studentId: student.id, score: 50, feedback: undefined, status: undefined }] }, CLIENT);
    expect(await deliveriesTitled('Vazifa baholandi')).toHaveLength(4);
  });

  it('imtihon natijasi kiritilganda xabar', async () => {
    const { actor, group, student } = await setup();
    const exam = await prisma.exam.create({ data: { title: 'Oraliq nazorat', groupId: group.id, date: new Date('2026-09-20'), maxScore: 100, passScore: 60 } });

    await examService.saveResults(actor, exam.id, { records: [{ studentId: student.id, score: 85, comment: undefined }] }, CLIENT);

    const results = await deliveriesTitled('Imtihon natijasi');
    expect(results).toHaveLength(2);
    expect(results[0]!.body).toContain('Oraliq nazorat');
    expect(results[0]!.body).toContain('85/100');
  });

  it('XP darajani oshirsa — faqat o‘quvchiga, bir marta', async () => {
    const { group, student } = await setup();
    await prisma.level.createMany({ data: [{ number: 1, name: 'Boshlovchi', minXp: 0 }, { number: 2, name: 'Izlanuvchi', minXp: 30 }] });
    await prisma.xpRule.create({ data: { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasi', source: 'HOMEWORK', points: 40 } });
    const homework = await prisma.homework.create({
      data: { title: 'XP vazifa', groupId: group.id, deadline: new Date('2030-01-01'), status: 'PUBLISHED' },
    });
    await prisma.homeworkSubmission.create({ data: { homeworkId: homework.id, studentId: student.id } });

    // 40 XP → 2-daraja
    await homeworkService.submitByStudent(student.id, homework.id, { answerText: 'javob', source: 'portal' });

    const levelUp = await deliveriesTitled('Yangi daraja!');
    // Ota-onaga ketmaydi — faqat o'quvchining chati
    expect(levelUp).toHaveLength(1);
    expect(levelUp[0]!.body).toContain('2-daraja');
    expect(levelUp[0]!.body).toContain('Izlanuvchi');

    // Qayta topshirish (dedupe bilan XP takrorlanmaydi) — yangi daraja xabari ham yo'q
    await homeworkService.submitByStudent(student.id, homework.id, { answerText: 'javob 2', source: 'portal' });
    expect(await deliveriesTitled('Yangi daraja!')).toHaveLength(1);
  });

  it('sertifikat berilganda tekshiruv havolasi bilan xabar', async () => {
    const { actor, student } = await setup();

    await certificateService.issue(actor, { studentId: student.id, percentage: 92, courseId: undefined, completionDate: undefined, note: undefined }, CLIENT);

    const issued = await deliveriesTitled('Sertifikat berildi');
    expect(issued).toHaveLength(2);
    expect(issued[0]!.body).toContain('/verify/');
  });
});
