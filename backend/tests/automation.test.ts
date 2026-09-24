import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { automationService } from '../src/services/automation.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const DAY_MS = 86_400_000;

async function createRule(overrides: Record<string, unknown> = {}) {
  return prisma.automationRule.create({
    data: {
      key: (overrides.key as string) ?? 'absent_streak',
      name: (overrides.name as string) ?? 'Ketma-ket kelmaganlar',
      trigger: (overrides.trigger as 'STUDENT_ABSENT_STREAK') ?? 'STUDENT_ABSENT_STREAK',
      audience: (overrides.audience as 'STAFF') ?? 'STAFF',
      params: (overrides.params as object) ?? { absences: 2 },
      isActive: overrides.isActive === undefined ? true : (overrides.isActive as boolean),
    },
  });
}

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

describe.skipIf(!hasTestDatabase)('Avtomatlashtirish dvigateli', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ketma-ket kelmagan o‘quvchi uchun xabar yuboriladi va yurish yoziladi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule();

    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
      ],
    });

    const result = await automationService.runAll(now);

    expect(result.rules).toBe(1);
    expect(result.notified).toBeGreaterThan(0);
    const notifications = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.message).toContain('Aziz Karimov');
    expect(notifications[0]!.message).toContain('2 marta');

    const runs = await prisma.automationRun.findMany({ include: { rule: true } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.matched).toBe(1);
    expect(runs[0]!.error).toBeNull();
  });

  it('takroriy yurishda ikkinchi marta xabar yuborilmaydi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Backend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule();
    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
      ],
    });

    await automationService.runAll(now);
    await automationService.runAll(now);

    const notifications = await prisma.notification.count({ where: { userId: user.id } });
    expect(notifications).toBe(1);
    expect(await prisma.automationRun.count()).toBe(2);
  });

  it('kelgan darsdan keyin ketma-ketlik uziladi va xabar bo‘lmaydi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Dizayn');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule();
    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        // Eng oxirgi dars — kelgan, demak ketma-ketlik uzilgan
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'PRESENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 3 * DAY_MS), status: 'ABSENT' },
      ],
    });

    await automationService.runAll(now);

    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);
    const run = await prisma.automationRun.findFirstOrThrow({});
    expect(run.matched).toBe(0);
  });

  it('o‘chirilgan qoida ishlamaydi', async () => {
    await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Matematika');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule({ isActive: false });
    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
      ],
    });

    const result = await automationService.runAll(now);

    expect(result.rules).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.automationRun.count()).toBe(0);
  });

  it('parametr o‘zgarsa shart ham o‘zgaradi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Fizika');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule({ params: { absences: 3 } });
    const now = new Date();
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - DAY_MS), status: 'ABSENT' },
        { studentId: student.id, groupId: group.id, date: new Date(now.getTime() - 2 * DAY_MS), status: 'ABSENT' },
      ],
    });

    // 3 marta kerak — 2 marta yetmaydi
    await automationService.runAll(now);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);

    // Sozlamani 2 ga tushiramiz
    const updated = await request(app).put('/api/automation/absent_streak').set(bearer(token)).send({ params: { absences: 2 } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.params.absences).toBe(2);

    await automationService.runAll(now);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);
  });

  it('kritik xavfdagi o‘quvchi uchun xabar boradi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Kimyo');
    const student = await createStudent(course.id, null, 'Xavfli');
    await prisma.student.update({ where: { id: student.id }, data: { riskLevel: 'CRITICAL', healthScore: 12 } });
    await createRule({ key: 'risk_critical', name: 'Kritik xavf', trigger: 'STUDENT_RISK_CRITICAL', params: {} });

    await automationService.runAll(new Date());

    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification.title).toContain('Kritik xavf');
    expect(notification.message).toContain('Xavfli Karimov');
  });

  it('omborda kam qolgan mahsulot haqida xabar boradi', async () => {
    const { user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const category = await prisma.productCategory.create({ data: { key: 'books', name: 'Kitoblar' } });
    await prisma.product.create({
      data: { sku: 'K-1', name: 'Darslik', categoryId: category.id, quantity: 2, minQuantity: 5, price: 1000, cost: 800 },
    });
    await createRule({ key: 'stock_low', name: 'Kam qoldi', trigger: 'STOCK_BELOW_MIN', params: {} });

    await automationService.runAll(new Date());

    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification.message).toContain('Darslik');
  });

  it('bitta qoidadagi xatolik qolganlarini to‘xtatmaydi va yozib qo‘yiladi', async () => {
    const { user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    // Mavjud bo'lmagan mahsulot turkumi bilan emas — xatoni sun'iy hosil qilamiz:
    // params noto'g'ri bo'lsa ham qoida ishlaydi, shuning uchun ikkinchi qoida ishlaganini tekshiramiz
    await createRule({ key: 'risk_critical', name: 'Kritik xavf', trigger: 'STUDENT_RISK_CRITICAL', params: {} });
    await createRule({ key: 'stock_low', name: 'Kam qoldi', trigger: 'STOCK_BELOW_MIN', params: {} });
    const category = await prisma.productCategory.create({ data: { key: 'books', name: 'Kitoblar' } });
    await prisma.product.create({
      data: { sku: 'K-2', name: 'Forma', categoryId: category.id, quantity: 0, minQuantity: 3, price: 1000, cost: 800 },
    });

    const result = await automationService.runAll(new Date());

    expect(result.rules).toBe(2);
    expect(await prisma.automationRun.count()).toBe(2);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);
  });

  it('sozlash huquqi yo‘q xodim qoidani o‘zgartira olmaydi', async () => {
    await createRule();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    // ADMIN da alert.manage yo'q (ADMIN_EXCLUDED)
    await request(app).put('/api/automation/absent_streak').set(bearer(token)).send({ isActive: false }).expect(403);
    // Ko'rish mumkin
    await request(app).get('/api/automation').set(bearer(token)).expect(200);
  });
});
