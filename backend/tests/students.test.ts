import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

function studentPayload(courseId: string, overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '+998901112233',
    courseId,
    startDate: '2026-10-01',
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('Students API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘quvchi yaratadi, shartnoma narxi kurs narxidan olinadi va qarzdorlik ochiladi', async () => {
    const course = await prisma.course.create({
      data: { name: 'Frontend', durationMonths: 6, price: 3_000_000, discountAmount: 500_000, finalPrice: 2_500_000 },
    });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const created = await request(app).post('/api/students').set(bearer(token)).send(studentPayload(course.id));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      firstName: 'Ali',
      status: 'ACTIVE',
      contractPrice: 2_500_000,
      startDate: '2026-10-01',
      course: { name: 'Frontend' },
      group: null,
      debt: { total: 2_500_000, paid: 0, remaining: 2_500_000, status: 'UNPAID' },
    });
    expect(created.body.data.code).toMatch(/^ST-\d{6}$/);
  });

  it('shartnoma narxini qo‘lda kiritish mumkin; takroriy shartnoma raqami 409 qaytaradi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const first = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { contractNumber: 'SH-001', contractPrice: 800_000 }));
    const duplicate = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { firstName: 'Vali', phone: '+998901112244', contractNumber: 'SH-001' }));

    expect(first.status).toBe(201);
    expect(first.body.data.contractPrice).toBe(800_000);
    expect(duplicate.status).toBe(409);
  });

  it('guruh to‘lgan bo‘lsa yoki boshqa kursga tegishli bo‘lsa 422 qaytaradi', async () => {
    const course = await createCourse('Backend');
    const otherCourse = await createCourse('Dizayn');
    const fullGroup = await createGroup({ courseId: course.id, capacity: 1 });
    const otherGroup = await createGroup({ courseId: otherCourse.id });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const first = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { groupId: fullGroup.id }));
    const overflow = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { firstName: 'Bek', phone: '+998901112255', groupId: fullGroup.id }));
    const wrongCourse = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { firstName: 'Olim', phone: '+998901112266', groupId: otherGroup.id }));

    expect(first.status).toBe(201);
    expect(overflow.status).toBe(422);
    expect(overflow.body.errors[0].message).toContain('bo‘sh o‘rin yo‘q');
    expect(wrongCourse.status).toBe(422);
    expect(wrongCourse.body.errors[0].message).toContain('kursga tegishli emas');
  });

  it('shartnoma narxi o‘zgarsa qarzdorlik qayta hisoblanadi, to‘langan summa saqlanadi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { contractPrice: 1_000_000 }));
    const studentId = created.body.data.id as string;
    await prisma.debt.update({
      where: { studentId },
      data: { paidAmount: 400_000, remainingAmount: 600_000, status: 'PARTIAL' },
    });

    const updated = await request(app)
      .put(`/api/students/${studentId}`)
      .set(bearer(token))
      .send(studentPayload(course.id, { contractPrice: 1_500_000 }));

    expect(updated.status).toBe(200);
    expect(updated.body.data.debt).toMatchObject({ total: 1_500_000, paid: 400_000, remaining: 1_100_000, status: 'PARTIAL' });
  });

  it('holatni o‘zgartiradi va soft delete qiladi; summary sonlarni qaytaradi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const first = await request(app).post('/api/students').set(bearer(token)).send(studentPayload(course.id));
    const second = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { firstName: 'Vali', phone: '+998901112277' }));

    const frozen = await request(app)
      .patch(`/api/students/${first.body.data.id}/status`)
      .set(bearer(token))
      .send({ status: 'FROZEN' });
    const summary = await request(app).get('/api/students/summary').set(bearer(token));
    const removed = await request(app).delete(`/api/students/${second.body.data.id}`).set(bearer(token));
    const list = await request(app).get('/api/students').set(bearer(token));

    expect(frozen.status).toBe(200);
    expect(frozen.body.data.status).toBe('FROZEN');
    expect(summary.body.data).toMatchObject({ ALL: 2, ACTIVE: 1, FROZEN: 1 });
    expect(removed.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
  });

  it('o‘qituvchi faqat o‘z guruhidagi o‘quvchilarni ko‘radi va yarata olmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const ownGroup = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const otherGroup = await createGroup({ courseId: course.id });
    await request(app)
      .post('/api/students')
      .set(bearer(adminToken))
      .send(studentPayload(course.id, { firstName: 'Meniki', groupId: ownGroup.id }));
    const foreign = await request(app)
      .post('/api/students')
      .set(bearer(adminToken))
      .send(studentPayload(course.id, { firstName: 'Begona', phone: '+998901112288', groupId: otherGroup.id }));

    const teacherList = await request(app).get('/api/students').set(bearer(teacherToken));
    const foreignRead = await request(app).get(`/api/students/${foreign.body.data.id}`).set(bearer(teacherToken));
    const teacherCreate = await request(app).post('/api/students').set(bearer(teacherToken)).send(studentPayload(course.id));

    expect(teacherList.body.data).toHaveLength(1);
    expect(teacherList.body.data[0].firstName).toBe('Meniki');
    expect(foreignRead.status).toBe(404);
    expect(teacherCreate.status).toBe(403);
  });

  it('raqam, telefon va shartnoma bo‘yicha qidiradi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { contractNumber: 'SH-777' }));
    await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send(studentPayload(course.id, { firstName: 'Vali', phone: '+998935556677' }));

    const byCode = await request(app).get(`/api/students?search=${created.body.data.code}`).set(bearer(token));
    const byPhone = await request(app).get('/api/students?search=935556677').set(bearer(token));
    const byContract = await request(app).get('/api/students?search=SH-777').set(bearer(token));

    expect(byCode.body.data).toHaveLength(1);
    expect(byCode.body.data[0].id).toBe(created.body.data.id);
    expect(byPhone.body.data).toHaveLength(1);
    expect(byPhone.body.data[0].firstName).toBe('Vali');
    expect(byContract.body.data).toHaveLength(1);
  });

  it('leadni o‘quvchiga aylantiradi: lead WON bo‘ladi, tarixga yozuv tushadi, takror aylantirib bo‘lmaydi', async () => {
    const source = await createSource();
    const course = await prisma.course.create({
      data: { name: 'SMM', durationMonths: 3, price: 2_000_000, finalPrice: 2_000_000 },
    });
    const { user: manager, token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, courseId: course.id, assignedToId: manager.id, firstName: 'Nodira' });
    const group = await createGroup({ courseId: course.id });

    const converted = await request(app)
      .post(`/api/leads/${lead.id}/convert`)
      .set(bearer(managerToken))
      .send({ groupId: group.id, startDate: '2026-10-05', parentPhone: '+998901234567' });
    const again = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(managerToken)).send({});

    expect(converted.status).toBe(201);
    expect(converted.body.data).toMatchObject({
      firstName: 'Nodira',
      leadId: lead.id,
      contractPrice: 2_000_000,
      startDate: '2026-10-05',
      parentPhone: '+998901234567',
      group: { name: group.name },
      debt: { total: 2_000_000, remaining: 2_000_000, status: 'UNPAID' },
    });

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.status).toBe('WON');
    expect(updatedLead.convertedAt).not.toBeNull();

    const activity = await prisma.leadActivity.findFirst({ where: { leadId: lead.id, type: 'CONVERTED_TO_STUDENT' } });
    expect(activity).not.toBeNull();
    expect(again.status).toBe(409);
  });

  it('kursi ko‘rsatilmagan leadni aylantirishda kurs talab qilinadi; ruxsatsiz rol 403 oladi', async () => {
    const source = await createSource();
    const { user: manager, token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: manager.id });

    const noCourse = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(managerToken)).send({});
    const forbidden = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(teacherToken)).send({});

    expect(noCourse.status).toBe(422);
    expect(noCourse.body.errors[0].field).toBe('courseId');
    expect(forbidden.status).toBe(403);
  });

  it('boshqa managerga biriktirilgan leadni aylantirib bo‘lmaydi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: owner } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: otherToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, courseId: course.id, assignedToId: owner.id });

    const response = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(otherToken)).send({});

    expect(response.status).toBe(404);
  });
});
