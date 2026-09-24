import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function createStudent(courseId: string, groupId: string, name = 'Aziz') {
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

describe.skipIf(!hasTestDatabase)('Sertifikatlar va ochiq tekshiruv', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sertifikat beriladi va ma’lumotlar nusxa sifatida saqlanadi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id, teacherId: user.id });
    const student = await createStudent(course.id, group.id);

    const issued = await request(app)
      .post('/api/certificates')
      .set(bearer(token))
      .send({ studentId: student.id, completionDate: '2026-09-20', percentage: 88 });

    expect(issued.status).toBe(201);
    expect(issued.body.data).toMatchObject({
      studentName: 'Aziz Karimov',
      courseName: 'Frontend',
      percentage: 88,
      grade: '4',
      completionDate: '2026-09-20',
      revokedAt: null,
    });
    expect(issued.body.data.code).toMatch(/^CRT-\d{4}-\d{6}$/);

    // O'quvchi ismi keyin o'zgarsa ham hujjat o'zgarmaydi
    await prisma.student.update({ where: { id: student.id }, data: { firstName: 'Yangi' } });
    const list = await request(app).get('/api/certificates').set(bearer(token));
    expect(list.body.data[0].studentName).toBe('Aziz Karimov');
  });

  it('natija ko‘rsatilmasa imtihonlardan o‘rtacha olinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const exam = await prisma.exam.create({
      data: { title: 'Oraliq', groupId: group.id, courseId: course.id, date: new Date('2026-08-01'), maxScore: 100 },
    });
    const second = await prisma.exam.create({
      data: { title: 'Yakuniy', groupId: group.id, courseId: course.id, date: new Date('2026-09-01'), maxScore: 100 },
    });
    await prisma.examResult.createMany({
      data: [
        { examId: exam.id, studentId: student.id, score: 80, percentage: 80 },
        { examId: second.id, studentId: student.id, score: 100, percentage: 100 },
      ],
    });

    const issued = await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id });

    expect(issued.body.data).toMatchObject({ percentage: 90, grade: '5' });
  });

  it('bitta kurs bo‘yicha ikkinchi sertifikat berilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id });

    const second = await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id });

    expect(second.status).toBe(409);
  });

  it('ochiq tekshiruv autentifikatsiyasiz ishlaydi va minimal ma’lumot qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Backend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const issued = await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id, percentage: 95 });

    const verified = await request(app).get(`/api/certificates/verify/${issued.body.data.verifyToken}`);

    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({
      valid: true,
      studentName: 'Aziz Karimov',
      courseName: 'Backend',
      grade: '5',
    });
    // Shaxsiy va ichki ma'lumot ochiq javobda bo'lmasligi shart
    const payload = JSON.stringify(verified.body.data);
    expect(payload).not.toContain(student.id);
    expect(payload).not.toContain('phone');
    expect(payload).not.toContain('percentage');
  });

  it('bekor qilingan sertifikat tekshiruvda "haqiqiy emas" deb ko‘rinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const issued = await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id });

    const revoked = await request(app)
      .post(`/api/certificates/${issued.body.data.id}/revoke`)
      .set(bearer(token))
      .send({ reason: 'Xato berilgan' });
    const verified = await request(app).get(`/api/certificates/verify/${issued.body.data.verifyToken}`);
    const again = await request(app)
      .post(`/api/certificates/${issued.body.data.id}/revoke`)
      .set(bearer(token))
      .send({ reason: 'Takror' });

    expect(revoked.status).toBe(200);
    expect(verified.body.data.valid).toBe(false);
    expect(verified.body.data.revokedAt).not.toBeNull();
    // Yozuv o'chirilmaydi — takroriy bekor qilish rad etiladi
    expect(again.status).toBe(422);
    expect(await prisma.certificate.count()).toBe(1);
  });

  it('noto‘g‘ri yoki mavjud bo‘lmagan kod rad etiladi', async () => {
    const badFormat = await request(app).get('/api/certificates/verify/qisqa-kod');
    const notFound = await request(app).get(`/api/certificates/verify/${'a'.repeat(32)}`);

    expect(badFormat.status).toBe(422);
    expect(notFound.status).toBe(404);
  });

  it('sertifikat berish faqat student.manage bilan', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);

    const byTeacher = await request(app).post('/api/certificates').set(bearer(teacher)).send({ studentId: student.id });
    const byAdmin = await request(app).post('/api/certificates').set(bearer(admin)).send({ studentId: student.id });
    const listByTeacher = await request(app).get('/api/certificates').set(bearer(teacher));

    expect(byTeacher.status).toBe(403);
    expect(byAdmin.status).toBe(201);
    // Ko'rish o'qituvchiga ochiq
    expect(listByTeacher.status).toBe(200);
  });
});

describe.skipIf(!hasTestDatabase)('Sertifikatni chop etish uchun olish', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('xodim istalgan sertifikatni oladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const issued = await request(app).post('/api/certificates').set(bearer(token)).send({ studentId: student.id, percentage: 88 });

    const response = await request(app).get(`/api/certificates/${issued.body.data.id}`).set(bearer(token));

    expect(response.status).toBe(200);
    // Chop etish uchun kerakli barcha maydonlar
    expect(response.body.data).toMatchObject({ studentName: 'Aziz Karimov', courseName: 'Frontend', percentage: 88 });
    expect(response.body.data.startDate).toBeTruthy();
    expect(response.body.data.verifyToken).toHaveLength(32);
  });

  it('kabinet foydalanuvchisi faqat o‘z sertifikatini oladi', async () => {
    const admin = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Backend');
    const group = await createGroup({ courseId: course.id });
    const mine = await createStudent(course.id, group.id, 'Meniki');
    const other = await createStudent(course.id, group.id, 'Begona');

    const myCertificate = await request(app).post('/api/certificates').set(bearer(admin.token)).send({ studentId: mine.id });
    const otherCertificate = await request(app).post('/api/certificates').set(bearer(admin.token)).send({ studentId: other.id });

    const account = await request(app)
      .post(`/api/students/${mine.id}/portal-account`)
      .set(bearer(admin.token))
      .send({ email: 'chop@portal.uz' });
    const studentToken = await loginAs(app, 'chop@portal.uz', account.body.data.temporaryPassword);

    const own = await request(app).get(`/api/certificates/${myCertificate.body.data.id}`).set(bearer(studentToken));
    expect(own.status).toBe(200);

    const foreign = await request(app).get(`/api/certificates/${otherCertificate.body.data.id}`).set(bearer(studentToken));
    expect(foreign.status).toBe(403);
  });
});
