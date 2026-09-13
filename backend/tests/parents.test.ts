import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

let counter = 0;
async function enroll(courseId: string, groupId: string, firstName = 'Aziz') {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Karimov',
      phone: `+99890${String(8_500_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

const parentPhoneOf = async (studentId: string) =>
  (await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { parentPhone: true } })).parentPhone;

describe.skipIf(!hasTestDatabase)('Ota-onalar (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'ADMIN' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('farzand bilan birga yaratadi, asosiy vakil telefonini o‘quvchiga yozadi va takroriy raqamni rad etadi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id);

    const created = await request(app)
      .post('/api/parents')
      .set(bearer(token))
      .send({
        firstName: 'Dilshod',
        lastName: 'Karimov',
        phone: '90 123 45 67',
        telegram: '@dilshod',
        students: [{ studentId: student.id, relation: 'FATHER', isPrimary: true }],
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ phone: '+998901234567', students: [{ studentId: student.id, relation: 'FATHER', isPrimary: true }] });
    expect(await parentPhoneOf(student.id)).toBe('+998901234567');

    const duplicate = await request(app)
      .post('/api/parents')
      .set(bearer(token))
      .send({ firstName: 'Boshqa', lastName: 'Odam', phone: '+998901234567' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.errors[0].field).toBe('phone');
  });

  it('asosiy vakil almashsa va ajratilsa o‘quvchi telefoni sinxronlanadi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id);

    const father = await request(app).post('/api/parents').set(bearer(token))
      .send({ firstName: 'Dilshod', lastName: 'Karimov', phone: '+998901111111', students: [{ studentId: student.id, relation: 'FATHER' }] });
    // Birinchi biriktirilgan ota-ona avtomatik asosiy bo'ladi
    expect(await parentPhoneOf(student.id)).toBe('+998901111111');

    const mother = await request(app).post('/api/parents').set(bearer(token))
      .send({ firstName: 'Nodira', lastName: 'Karimova', phone: '+998902222222' });
    const linked = await request(app).post(`/api/parents/${mother.body.data.id}/students`).set(bearer(token))
      .send({ studentId: student.id, relation: 'MOTHER', isPrimary: true });
    expect(linked.status).toBe(200);
    expect(await parentPhoneOf(student.id)).toBe('+998902222222');

    const parents = await request(app).get(`/api/students/${student.id}/parents`).set(bearer(token));
    expect(parents.body.data.map((row: { relation: string; isPrimary: boolean }) => [row.relation, row.isPrimary])).toEqual([
      ['MOTHER', true],
      ['FATHER', false],
    ]);

    // Asosiy vakil ajratildi — qolgan ota-ona asosiy bo'ladi
    const motherLink = parents.body.data.find((row: { relation: string }) => row.relation === 'MOTHER').linkId;
    const afterUnlink = await request(app).delete(`/api/parents/links/${motherLink}`).set(bearer(token));
    expect(afterUnlink.body.data).toEqual([expect.objectContaining({ relation: 'FATHER', isPrimary: true })]);
    expect(await parentPhoneOf(student.id)).toBe('+998901111111');

    // Telefon o'zgarsa — o'quvchidagi raqam ham yangilanadi
    await request(app).put(`/api/parents/${father.body.data.id}`).set(bearer(token)).send({ phone: '+998903333333' });
    expect(await parentPhoneOf(student.id)).toBe('+998903333333');

    // Oxirgi ota-ona o'chirildi — raqam tozalanadi
    const removed = await request(app).delete(`/api/parents/${father.body.data.id}`).set(bearer(token));
    expect(removed.status).toBe(200);
    expect(await parentPhoneOf(student.id)).toBeNull();
    expect(await prisma.studentParent.count()).toBe(0);
  });

  it('takroriy biriktirish, noma’lum o‘quvchi va qidiruv', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id, 'Madina');
    const parent = await request(app).post('/api/parents').set(bearer(token))
      .send({ firstName: 'Gulnora', lastName: 'Yusupova', phone: '+998904444444', students: [{ studentId: student.id, relation: 'MOTHER' }] });

    expect((await request(app).post(`/api/parents/${parent.body.data.id}/students`).set(bearer(token)).send({ studentId: student.id })).status).toBe(409);
    expect((await request(app).post(`/api/parents/${parent.body.data.id}/students`).set(bearer(token)).send({ studentId: 'yoq' })).status).toBe(422);

    const byPhone = await request(app).get('/api/parents?search=4444').set(bearer(token));
    const byChild = await request(app).get('/api/parents?search=Madina').set(bearer(token));
    const none = await request(app).get('/api/parents?search=Topilmaydi').set(bearer(token));
    expect(byPhone.body.meta.total).toBe(1);
    expect(byChild.body.meta.total).toBe(1);
    expect(none.body.meta.total).toBe(0);
  });

  it('o‘qituvchi faqat o‘z guruhi o‘quvchilarining ota-onasini ko‘radi va boshqara olmaydi', async () => {
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const ownGroup = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const otherGroup = await createGroup({ courseId: course.id });
    const own = await enroll(course.id, ownGroup.id);
    const other = await enroll(course.id, otherGroup.id);

    // Bir ota-onaning ikki farzandi: biri o'qituvchining guruhida, biri boshqa guruhda
    await request(app).post('/api/parents').set(bearer(token)).send({
      firstName: 'Rustam', lastName: 'Aliyev', phone: '+998905555555',
      students: [{ studentId: own.id, relation: 'FATHER' }, { studentId: other.id, relation: 'FATHER' }],
    });
    await request(app).post('/api/parents').set(bearer(token)).send({
      firstName: 'Begona', lastName: 'Ota', phone: '+998906666666', students: [{ studentId: other.id, relation: 'GUARDIAN' }],
    });

    const list = await request(app).get('/api/parents').set(bearer(teacherToken));
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].students.map((row: { studentId: string }) => row.studentId)).toEqual([own.id]);

    expect((await request(app).get(`/api/students/${other.id}/parents`).set(bearer(teacherToken))).status).toBe(404);
    expect((await request(app).post('/api/parents').set(bearer(teacherToken)).send({ firstName: 'Yangi', lastName: 'Ota', phone: '+998907777777' })).status).toBe(403);
  });
});
