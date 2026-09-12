import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

let phoneCounter = 0;

async function enroll(options: { courseId: string; groupId?: string; contractPrice?: number; status?: 'ACTIVE' | 'FROZEN' }) {
  phoneCounter += 1;
  const price = options.contractPrice ?? 1_000_000;
  return prisma.student.create({
    data: {
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: `+99890${String(6_000_000 + phoneCounter)}`,
      courseId: options.courseId,
      groupId: options.groupId ?? null,
      status: options.status ?? 'ACTIVE',
      contractPrice: price,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Chekka holatlar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('mavjud bo‘lmagan ID uchun 404, noto‘g‘ri ID formati uchun 422 qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const missingLead = await request(app).get('/api/leads/cmtwra20w0073x0irf70zp63q').set(bearer(token));
    const missingStudent = await request(app).get('/api/students/cmtwra20w0073x0irf70zp63q').set(bearer(token));
    // ID uzunligi chegarasidan oshsa — 422 (bazagacha bormaydi)
    const badId = await request(app).get(`/api/leads/${'x'.repeat(80)}`).set(bearer(token));

    expect(missingLead.status).toBe(404);
    expect(missingStudent.status).toBe(404);
    expect(badId.status).toBe(422);
  });

  it('bir xil nomdagi kurs va guruh yaratib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Yagona kurs');
    await createGroup({ courseId: course.id, name: 'YG-01' });

    const duplicateCourse = await request(app)
      .post('/api/courses')
      .set(bearer(token))
      .send({ name: 'Yagona kurs', durationMonths: 6, price: 1_000_000 });
    const duplicateGroup = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send({
        name: 'YG-01',
        courseId: course.id,
        startDate: '2026-10-01',
        scheduleDays: ['MONDAY'],
        startTime: '14:00',
        endTime: '16:00',
        capacity: 10,
        status: 'ACTIVE',
      });

    expect(duplicateCourse.status).toBe(409);
    expect(duplicateGroup.status).toBe(409);
  });

  it('guruh sig‘imini o‘quvchilar sonidan past qilib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, capacity: 5 });
    await enroll({ courseId: course.id, groupId: group.id });
    await enroll({ courseId: course.id, groupId: group.id });

    const response = await request(app)
      .put(`/api/groups/${group.id}`)
      .set(bearer(token))
      .send({
        name: group.name,
        courseId: course.id,
        startDate: '2026-09-01',
        scheduleDays: ['MONDAY'],
        startTime: '14:00',
        endTime: '16:00',
        capacity: 1,
        status: 'ACTIVE',
      });

    expect(response.status).toBe(422);
  });

  it('o‘quvchisi bor kurs va guruhni o‘chirib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await enroll({ courseId: course.id, groupId: group.id });

    const courseDelete = await request(app).delete(`/api/courses/${course.id}`).set(bearer(token));
    const groupDelete = await request(app).delete(`/api/groups/${group.id}`).set(bearer(token));

    expect(courseDelete.status).toBe(409);
    expect(groupDelete.status).toBe(409);
  });

  it('muzlatilgan o‘quvchi davomat jurnalida ko‘rinmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await enroll({ courseId: course.id, groupId: group.id });
    const frozen = await enroll({ courseId: course.id, groupId: group.id, status: 'FROZEN' });

    const sheet = await request(app).get(`/api/groups/${group.id}/attendance?date=2026-09-14`).set(bearer(token));
    const markFrozen = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-14', records: [{ studentId: frozen.id, status: 'PRESENT' }] });

    expect(sheet.body.data.students).toHaveLength(1);
    expect(markFrozen.status).toBe(422);
  });

  it('o‘chirilgan lead ro‘yxatda ham, profilda ham ko‘rinmaydi', async () => {
    const source = await createSource();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const lead = await createLead({ sourceId: source.id });

    const removed = await request(app).delete(`/api/leads/${lead.id}`).set(bearer(token));
    const list = await request(app).get('/api/leads').set(bearer(token));
    const detail = await request(app).get(`/api/leads/${lead.id}`).set(bearer(token));

    expect(removed.status).toBe(200);
    expect(list.body.meta.total).toBe(0);
    expect(detail.status).toBe(404);
  });

  it('sahifalash chegaradan tashqarida bo‘sh ro‘yxat qaytaradi', async () => {
    const source = await createSource();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    await createLead({ sourceId: source.id });

    const farPage = await request(app).get('/api/leads?page=99&limit=20').set(bearer(token));
    const tooBigLimit = await request(app).get('/api/leads?limit=500').set(bearer(token));

    expect(farPage.status).toBe(200);
    expect(farPage.body.data).toHaveLength(0);
    expect(farPage.body.meta).toMatchObject({ page: 99, total: 1 });
    expect(tooBigLimit.status).toBe(422);
  });

  it('tizim rolini o‘chirib bo‘lmaydi, xodimi bor maxsus rol ham o‘chmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const systemRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
    const customRole = await prisma.role.create({ data: { key: 'CUSTOM_ROLE', name: 'Maxsus rol', isSystem: false } });
    await createUserWithToken(app, { role: 'CUSTOM_ROLE' });

    const systemDelete = await request(app).delete(`/api/roles/${systemRole.id}`).set(bearer(token));
    const busyDelete = await request(app).delete(`/api/roles/${customRole.id}`).set(bearer(token));

    // Tizim roli — taqiqlangan, xodimi bor rol — konflikt
    expect(systemDelete.status).toBe(403);
    expect(busyDelete.status).toBe(409);
  });

  it('xodim o‘zini o‘chira olmaydi va o‘z rolini o‘zgartira olmaydi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const otherRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SALES_MANAGER' } });

    const selfDelete = await request(app).delete(`/api/users/${user.id}`).set(bearer(token));
    const selfRoleChange = await request(app)
      .put(`/api/users/${user.id}`)
      .set(bearer(token))
      .send({ firstName: user.firstName, lastName: user.lastName, email: user.email, roleId: otherRole.id });

    expect(selfDelete.status).toBe(403);
    expect(selfRoleChange.status).toBe(403);
  });

  it('bo‘sh tanali so‘rovlarda tushunarli 422 qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const emptyLead = await request(app).post('/api/leads').set(bearer(token)).send({});
    const emptyStudent = await request(app).post('/api/students').set(bearer(token)).send({});

    expect(emptyLead.status).toBe(422);
    expect(emptyLead.body.errors.length).toBeGreaterThan(0);
    expect(emptyLead.body.errors[0]).toHaveProperty('field');
    expect(emptyStudent.status).toBe(422);
  });
});
