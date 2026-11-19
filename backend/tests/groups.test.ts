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

  it('o‘qituvchi almashinuvi tarixda saqlanadi: eski davr yopiladi, yangisi ochiladi; o‘zgarmasa yozuv qo‘shilmaydi', async () => {
    const course = await createCourse();
    const { user: first, token: firstToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: second } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: admin, token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });

    const created = await request(app).post('/api/groups').set(bearer(adminToken)).send(groupPayload(course.id, { teacherId: first.id }));
    const id = created.body.data.id as string;
    // Faqat sig'im o'zgardi — o'qituvchi o'sha, tarixga yozuv qo'shilmaydi
    await request(app).put(`/api/groups/${id}`).set(bearer(adminToken)).send(groupPayload(course.id, { teacherId: first.id, capacity: 14 }));
    expect(await prisma.groupTeacherHistory.count({ where: { groupId: id } })).toBe(1);

    const changed = await request(app).put(`/api/groups/${id}`).set(bearer(adminToken)).send(groupPayload(course.id, { teacherId: second.id }));
    expect(changed.status).toBe(200);

    const history = await request(app).get(`/api/groups/${id}/teacher-history`).set(bearer(adminToken));
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    // Yangisi birinchi: ochiq davr — hozirgi o'qituvchi; eskisi yopilgan va o'zgartirgan xodim yozilgan
    expect(history.body.data[0]).toMatchObject({ teacher: { id: second.id }, endedAt: null, changedBy: { id: admin.id } });
    expect(history.body.data[1].teacher.id).toBe(first.id);
    expect(history.body.data[1].endedAt).not.toBeNull();
    // Ochiq yozuv har doim guruhdagi o'qituvchi bilan bir xil
    const open = await prisma.groupTeacherHistory.findMany({ where: { groupId: id, endedAt: null } });
    expect(open.map((row) => row.teacherId)).toEqual([second.id]);

    // Audit: kimdan kimga
    const audit = await prisma.auditLog.findFirst({ where: { entityId: id, action: 'group.updated' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.metadata).toMatchObject({ teacherFrom: first.id, teacherTo: second.id });

    // O'qituvchini olib tashlash — ochiq davr yopiladi, yangi yozuv yo'q
    await request(app).put(`/api/groups/${id}`).set(bearer(adminToken)).send(groupPayload(course.id, { teacherId: undefined }));
    expect(await prisma.groupTeacherHistory.count({ where: { groupId: id, endedAt: null } })).toBe(0);

    // Endi guruh boshqa o'qituvchiniki emas — sobiq o'qituvchi uni (va tarixini) ko'rmaydi
    expect((await request(app).get(`/api/groups/${id}/teacher-history`).set(bearer(firstToken))).status).toBe(404);
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
