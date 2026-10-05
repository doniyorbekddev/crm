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
      firstName: 'Aziz',
      lastName: 'Karimov',
      phone: `+99890${String(7_100_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('O‘quvchiga xabar yuborish (integratsion)', () => {
  let admin: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: admin } = await createUserWithToken(app, { role: 'ADMIN' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const send = (token: string, studentId: string, body: Record<string, unknown>) =>
    request(app).post(`/api/students/${studentId}/message`).set(bearer(token)).send(body);

  it('kabinet hisobi bor o‘quvchiga ilova ichida yetadi; amal auditga yoziladi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id);
    const account = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({ email: 'aziz@test.uz' });
    expect(account.status).toBe(201);
    const userId = (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { userId: true } })).userId!;

    const response = await send(admin, student.id, { title: 'Dars ko‘chirildi', message: 'Ertangi dars 16:00 ga ko‘chirildi.' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ recipients: 1 });

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'SYSTEM', title: 'Dars ko‘chirildi', message: 'Ertangi dars 16:00 ga ko‘chirildi.', entityType: 'student', entityId: student.id });

    // Ikkinchi marta yuborilsa — yangi xabar (takror emas deb yutib yuborilmaydi)
    expect((await send(admin, student.id, { title: 'Dars ko‘chirildi', message: 'Ertangi dars 16:00 ga ko‘chirildi.' })).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId } })).toBe(2);

    const audit = await prisma.auditLog.findMany({ where: { action: 'student.message_sent', entityId: student.id } });
    expect(audit).toHaveLength(2);
    expect(audit[0]!.metadata).toMatchObject({ audience: 'STUDENT', recipients: 1 });
  });

  it('kanali yo‘q qabul qiluvchi — 409, hech narsa yozilmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id);

    for (const audience of ['STUDENT', 'PARENT', 'BOTH']) {
      const response = await send(admin, student.id, { audience, title: 'Salom', message: 'Sinov xabari' });
      expect(response.status).toBe(409);
    }
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'student.message_sent' } })).toBe(0);
  });

  it('validatsiya, ruxsat va o‘qituvchi doirasi', async () => {
    const course = await createCourse();
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const own = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const foreign = await createGroup({ courseId: course.id });
    const mine = await enroll(course.id, own.id);
    const other = await enroll(course.id, foreign.id);
    await request(app).post(`/api/students/${mine.id}/portal-account`).set(bearer(admin)).send({ email: 'mine@test.uz' });
    await request(app).post(`/api/students/${other.id}/portal-account`).set(bearer(admin)).send({ email: 'other@test.uz' });
    const body = { title: 'Eslatma', message: 'Uy vazifasini topshiring' };

    expect((await send(admin, mine.id, { title: 'A', message: 'Uy vazifasi' })).status).toBe(422);
    expect((await send(admin, mine.id, { title: 'Eslatma', message: 'x' })).status).toBe(422);
    expect((await send(admin, mine.id, { ...body, audience: 'TEACHER' })).status).toBe(422);
    expect((await send(salesToken, mine.id, body)).status).toBe(403);
    expect((await request(app).post(`/api/students/${mine.id}/message`).send(body)).status).toBe(401);

    // O'qituvchi: o'z guruhidagi o'quvchiga — ha; begona guruhdagi o'quvchi unga "mavjud emas"
    expect((await send(teacherToken, mine.id, body)).status).toBe(200);
    expect((await send(teacherToken, other.id, body)).status).toBe(404);
  });
});
