import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();

function groupPayload(courseId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'FE-01',
    courseId,
    startDate: '2026-10-01',
    scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    startTime: '14:00',
    endTime: '16:00',
    capacity: 12,
    status: 'ACTIVE',
    ...overrides,
  };
}

async function enrollStudent(courseId: string, groupId: string, firstName = 'Ali') {
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Valiyev',
      phone: `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-10-01'),
    },
  });
}

describe.skipIf(!hasTestDatabase)('Groups API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('guruh yaratadi, bo‘sh joylarni hisoblaydi; boshqarish faqat group.manage bilan', async () => {
    const course = await createCourse('Frontend');
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

    const created = await request(app)
      .post('/api/groups')
      .set(bearer(adminToken))
      .send(groupPayload(course.id, { teacherId: teacher.id, room: '101' }));
    const salesCreate = await request(app).post('/api/groups').set(bearer(salesToken)).send(groupPayload(course.id, { name: 'FE-02' }));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'FE-01',
      room: '101',
      startDate: '2026-10-01',
      scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
      capacity: 12,
      studentCount: 0,
      freeSeats: 12,
      course: { name: 'Frontend' },
      teacher: { id: teacher.id },
    });
    expect(salesCreate.status).toBe(403);
  });

  it('vaqt, sana va kurs bo‘yicha validatsiya qiladi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const badTime = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload(course.id, { endTime: '13:00' }));
    const badDate = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupPayload(course.id, { name: 'FE-03', endDate: '2026-09-01' }));
    const badCourse = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload('mavjud-emas', { name: 'FE-04' }));
    const noDays = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload(course.id, { name: 'FE-05', scheduleDays: [] }));

    expect(badTime.status).toBe(422);
    expect(badTime.body.errors[0].field).toBe('endTime');
    expect(badDate.status).toBe(422);
    expect(badDate.body.errors[0].field).toBe('endDate');
    expect(badCourse.status).toBe(422);
    expect(badCourse.body.errors).toEqual([{ field: 'courseId', message: 'Kurs topilmadi' }]);
    expect(noDays.status).toBe(422);
    expect(noDays.body.errors[0].field).toBe('scheduleDays');
  });

  it('o‘qituvchi faqat o‘z guruhlarini ko‘radi, boshqalari esa hammasini', async () => {
    const course = await createCourse();
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

    const own = await request(app).post('/api/groups').set(bearer(adminToken)).send(groupPayload(course.id, { teacherId: teacher.id }));
    const foreign = await request(app).post('/api/groups').set(bearer(adminToken)).send(groupPayload(course.id, { name: 'EN-01' }));

    const teacherList = await request(app).get('/api/groups').set(bearer(teacherToken));
    const salesList = await request(app).get('/api/groups').set(bearer(salesToken));
    const foreignDetail = await request(app).get(`/api/groups/${foreign.body.data.id}`).set(bearer(teacherToken));

    expect(teacherList.body.data.map((group: { id: string }) => group.id)).toEqual([own.body.data.id]);
    expect(salesList.body.meta.total).toBe(2);
    expect(foreignDetail.status).toBe(404);
  });

  it('o‘quvchilar soni sig‘imdan katta bo‘lishiga yo‘l qo‘ymaydi va to‘la guruhni o‘chirmaydi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const created = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload(course.id));
    const groupId = created.body.data.id as string;
    await enrollStudent(course.id, groupId, 'Ali');
    await enrollStudent(course.id, groupId, 'Vali');

    const list = await request(app).get('/api/groups').set(bearer(token));
    const shrink = await request(app).put(`/api/groups/${groupId}`).set(bearer(token)).send(groupPayload(course.id, { capacity: 1 }));
    const blockedDelete = await request(app).delete(`/api/groups/${groupId}`).set(bearer(token));

    expect(list.body.data[0]).toMatchObject({ studentCount: 2, freeSeats: 10 });
    expect(shrink.status).toBe(422);
    expect(shrink.body.errors[0].field).toBe('capacity');
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.message).toContain('2 ta o‘quvchi');
  });

  it('bo‘sh guruhni o‘chiradi va band nomni rad etadi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const created = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload(course.id));

    const duplicate = await request(app).post('/api/groups').set(bearer(token)).send(groupPayload(course.id));
    const removed = await request(app).delete(`/api/groups/${created.body.data.id}`).set(bearer(token));

    expect(duplicate.status).toBe(409);
    expect(removed.status).toBe(200);
    expect(await prisma.group.count()).toBe(0);
  });
});
