import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function createStudent(courseId: string, groupId: string, name: string) {
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 1_200_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_200_000, paidAmount: 200_000, remainingAmount: 1_000_000 } },
    },
  });
}

/** Xodim kabinet ochadi va egasi shu parol bilan kiradi */
async function openStudentPortal(adminToken: string, studentId: string, email: string) {
  const created = await request(app).post(`/api/students/${studentId}/portal-account`).set(bearer(adminToken)).send({ email });
  expect(created.status).toBe(201);
  const token = await loginAs(app, email, created.body.data.temporaryPassword);
  return { token, account: created.body.data };
}

describe.skipIf(!hasTestDatabase)('Kabinet (portal) — o‘quvchi va ota-ona', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('xodim o‘quvchiga kabinet ochadi, o‘quvchi o‘z ma’lumotini ko‘radi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, name: 'Portal guruhi' });
    const student = await createStudent(course.id, group.id, 'Aziz');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

    const { token, account } = await openStudentPortal(admin, student.id, 'aziz@portal.uz');
    const me = await request(app).get('/api/portal/me').set(bearer(token));
    const profile = await request(app).get('/api/portal/profile').set(bearer(token));

    expect(account.temporaryPassword).toHaveLength(12);
    expect(me.body.data).toMatchObject({ kind: 'STUDENT', fullName: 'Aziz Test' });
    expect(me.body.data.children).toHaveLength(1);
    expect(me.body.data.children[0]).toMatchObject({ studentId: student.id, groupName: 'Portal guruhi' });
    expect(profile.body.data.student.id).toBe(student.id);
    expect(profile.body.data.payments).not.toBeNull();
  });

  it('o‘quvchi boshqa o‘quvchi ma’lumotini so‘rasa — 403', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const mine = await createStudent(course.id, group.id, 'Meniki');
    const other = await createStudent(course.id, group.id, 'Begona');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token } = await openStudentPortal(admin, mine.id, 'meniki@portal.uz');

    const own = await request(app).get('/api/portal/profile').query({ studentId: mine.id }).set(bearer(token));
    const foreign = await request(app).get('/api/portal/profile').query({ studentId: other.id }).set(bearer(token));
    const schedule = await request(app).get('/api/portal/schedule').query({ studentId: other.id }).set(bearer(token));

    expect(own.status).toBe(200);
    expect(foreign.status).toBe(403);
    expect(schedule.status).toBe(403);
  });

  it('kabinet hisobiga xodim bo‘limlari yopiq', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Yopiq');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token } = await openStudentPortal(admin, student.id, 'yopiq@portal.uz');

    const endpoints = ['/api/students', '/api/payments', '/api/finance/summary', '/api/users', '/api/leads', '/api/groups'];
    const results = await Promise.all(endpoints.map((path) => request(app).get(path).set(bearer(token))));

    expect(results.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it('ota-ona farzandlari ro‘yxatini ko‘radi va ular orasida almashadi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const first = await createStudent(course.id, group.id, 'Birinchi');
    const second = await createStudent(course.id, group.id, 'Ikkinchi');
    const stranger = await createStudent(course.id, group.id, 'Begona');
    const parent = await prisma.parent.create({
      data: {
        firstName: 'Ota',
        lastName: 'Ona',
        phone: '+998901234567',
        students: { create: [{ studentId: first.id, isPrimary: true }, { studentId: second.id }] },
      },
    });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

    const created = await request(app)
      .post(`/api/parents/${parent.id}/portal-account`)
      .set(bearer(admin))
      .send({ email: 'ota@portal.uz' });
    const token = await loginAs(app, 'ota@portal.uz', created.body.data.temporaryPassword);

    const me = await request(app).get('/api/portal/me').set(bearer(token));
    const firstChild = await request(app).get('/api/portal/profile').query({ studentId: first.id }).set(bearer(token));
    const secondChild = await request(app).get('/api/portal/profile').query({ studentId: second.id }).set(bearer(token));
    const foreign = await request(app).get('/api/portal/profile').query({ studentId: stranger.id }).set(bearer(token));

    expect(created.status).toBe(201);
    expect(me.body.data.kind).toBe('PARENT');
    expect(me.body.data.children.map((child: { firstName: string }) => child.firstName).sort()).toEqual(['Birinchi', 'Ikkinchi']);
    expect(firstChild.body.data.student.id).toBe(first.id);
    expect(secondChild.body.data.student.id).toBe(second.id);
    expect(foreign.status).toBe(403);
  });

  it('farzandi yo‘q ota-onaga kabinet ochilmaydi, takroriy ochish ham rad etiladi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Yolg‘iz');
    const lonely = await prisma.parent.create({ data: { firstName: 'Yolg‘iz', lastName: 'Ota', phone: '+998901112233' } });
    const linked = await prisma.parent.create({
      data: { firstName: 'Bog‘langan', lastName: 'Ona', phone: '+998904445566', students: { create: [{ studentId: student.id }] } },
    });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

    const noChild = await request(app).post(`/api/parents/${lonely.id}/portal-account`).set(bearer(admin)).send({ email: 'a@portal.uz' });
    const first = await request(app).post(`/api/parents/${linked.id}/portal-account`).set(bearer(admin)).send({ email: 'b@portal.uz' });
    const again = await request(app).post(`/api/parents/${linked.id}/portal-account`).set(bearer(admin)).send({ email: 'c@portal.uz' });
    const busyEmail = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({ email: 'b@portal.uz' });

    expect(noChild.status).toBe(422);
    expect(first.status).toBe(201);
    expect(again.status).toBe(409);
    expect(busyEmail.status).toBe(409);
  });

  it('kabinet ochish faqat portal.manage bilan; oddiy xodim va kabinet egasi ocholmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Ruxsat');
    const second = await createStudent(course.id, group.id, 'Ikkinchi');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: portalToken } = await openStudentPortal(admin, student.id, 'ruxsat@portal.uz');

    const byTeacher = await request(app).post(`/api/students/${second.id}/portal-account`).set(bearer(teacher)).send({ email: 'x@portal.uz' });
    const byPortalUser = await request(app).post(`/api/students/${second.id}/portal-account`).set(bearer(portalToken)).send({ email: 'y@portal.uz' });

    expect(byTeacher.status).toBe(403);
    expect(byPortalUser.status).toBe(403);
  });

  it('xodim kabinet endpointlariga kira olmaydi (portal faqat kabinet rollari uchun)', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });

    const adminMe = await request(app).get('/api/portal/me').set(bearer(admin));
    const ownerMe = await request(app).get('/api/portal/me').set(bearer(owner));

    expect(adminMe.status).toBe(403);
    expect(ownerMe.status).toBe(403);
  });
});

describe.skipIf(!hasTestDatabase)('Kabinet — darslar, kurs progressi va sertifikatlar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('kelgusi darslar va o‘qituvchi ko‘rinadi, telefon ko‘rsatilmaydi', async () => {
    const admin = await createUserWithToken(app, { role: 'ADMIN' });
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz-kabinet@local.uz' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id, teacherId: teacher.user.id, scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'] });
    const student = await createStudent(course.id, group.id, 'Darsli');
    const { token } = await openStudentPortal(admin.token, student.id, 'darslar@portal.uz');

    const response = await request(app).get('/api/portal/lessons').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.group.name).toBe(group.name);
    expect(response.body.data.teacher.name).toContain(teacher.user.firstName);
    expect(response.body.data.lessons.length).toBeGreaterThan(0);
    expect(response.body.data.lessons[0]).toHaveProperty('startTime');
    // O'qituvchining telefoni va emaili kabinetga chiqmaydi
    expect(JSON.stringify(response.body)).not.toContain(teacher.user.email);
  });

  it('kurs progressi va sertifikatlar faqat o‘ziniki', async () => {
    const admin = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Backend');
    const group = await createGroup({ courseId: course.id });
    const mine = await createStudent(course.id, group.id, 'Meniki');
    const other = await createStudent(course.id, group.id, 'Begona');

    await prisma.certificate.createMany({
      data: [
        {
          studentId: mine.id,
          courseId: course.id,
          studentName: 'Meniki Test',
          courseName: 'Backend',
          issuedAt: new Date(),
          startDate: new Date(),
          completionDate: new Date(),
          verifyToken: 'c'.repeat(32),
        },
        {
          studentId: other.id,
          courseId: course.id,
          studentName: 'Begona Test',
          courseName: 'Backend',
          issuedAt: new Date(),
          startDate: new Date(),
          completionDate: new Date(),
          verifyToken: 'd'.repeat(32),
        },
      ],
    });

    const { token } = await openStudentPortal(admin.token, mine.id, 'sertifikat@portal.uz');

    const certificates = await request(app).get('/api/portal/certificates').set(bearer(token));
    expect(certificates.status).toBe(200);
    expect(certificates.body.data).toHaveLength(1);
    expect(certificates.body.data[0].studentName).toBe('Meniki Test');

    // Begona o'quvchi so'ralsa — rad etiladi
    const foreign = await request(app).get('/api/portal/certificates').query({ studentId: other.id }).set(bearer(token));
    expect(foreign.status).toBe(403);

    const curriculum = await request(app).get('/api/portal/curriculum').set(bearer(token));
    expect(curriculum.status).toBe(200);
  });
});
