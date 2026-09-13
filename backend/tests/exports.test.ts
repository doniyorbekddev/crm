import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';
import { binaryParser, readZip } from './helpers/zip.js';

const app = createApp();
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let counter = 0;
async function enroll(courseId: string, firstName: string, groupId?: string) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Eksportov',
      phone: `+99891${String(7_000_000 + counter)}`,
      courseId,
      groupId: groupId ?? null,
      contractPrice: 1_200_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_200_000, remainingAmount: 1_200_000 } },
    },
  });
}

const sheetOf = (body: Buffer) => readZip(body).get('xl/worksheets/sheet1.xml') ?? '';

describe.skipIf(!hasTestDatabase)('Eksport — CSV va Excel (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘quvchilar ro‘yxati filtr bilan CSV va XLSX ga chiqadi', async () => {
    const course = await createCourse();
    await enroll(course.id, 'Aziza');
    const frozen = await enroll(course.id, 'Bekzod');
    await prisma.student.update({ where: { id: frozen.id }, data: { status: 'FROZEN' } });

    const csv = await request(app).get('/api/students/export?status=ACTIVE').set(bearer(token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/filename="oquvchilar-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(csv.text).toContain('Aziza Eksportov');
    expect(csv.text).not.toContain('Bekzod');
    expect(csv.text).toContain('"Jami"');

    const xlsx = await request(app).get('/api/students/export?format=xlsx').set(bearer(token)).buffer(true).parse(binaryParser);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain(XLSX_TYPE);
    const sheet = sheetOf(xlsx.body as Buffer);
    expect(sheet).toContain('Aziza Eksportov');
    expect(sheet).toContain('Bekzod Eksportov');
    expect(sheet).toContain('<v>2400000</v>'); // ikkala o‘quvchi qarzi jami

    expect((await request(app).get('/api/students/export?format=pdf').set(bearer(token))).status).toBe(422);
  });

  it('leadlar va to‘lovlar eksporti; bekor qilingan to‘lov jamiga qo‘shilmaydi', async () => {
    const source = await createSource();
    await createLead({ sourceId: source.id, firstName: 'Nodira', lastName: 'Leadova' });
    const leads = await request(app).get('/api/leads/export').set(bearer(token));
    expect(leads.status).toBe(200);
    expect(leads.text).toContain('Nodira Leadova');
    expect(leads.text).toContain('Instagram');

    const course = await createCourse();
    const student = await enroll(course.id, 'Sardor');
    const first = await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 300_000, method: 'CASH' });
    const second = await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 200_000, method: 'CARD' });
    expect(first.status).toBe(201);
    const cancelled = await request(app)
      .delete(`/api/payments/${second.body.data.id}`)
      .set(bearer(token))
      .send({ reason: 'Xato kiritilgan to‘lov' });
    expect(cancelled.status).toBe(200);

    const payments = await request(app)
      .get('/api/payments/export?format=xlsx&includeDeleted=true')
      .set(bearer(token))
      .buffer(true)
      .parse(binaryParser);
    expect(payments.status).toBe(200);
    const sheet = sheetOf(payments.body as Buffer);
    expect(sheet).toContain(first.body.data.code);
    expect(sheet).toContain('Bekor qilingan');
    expect(sheet).toMatch(/Jami<\/t><\/is><\/c>.*<v>300000<\/v>/);
  });

  it('hisobot XLSX formatida; eksport ruxsati bo‘lmasa 403', async () => {
    const report = await request(app).get('/api/reports/payments/export?format=xlsx').set(bearer(token)).buffer(true).parse(binaryParser);
    expect(report.status).toBe(200);
    expect(report.headers['content-disposition']).toMatch(/\.xlsx"$/);
    expect((report.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    expect((await request(app).get('/api/leads/export').set(bearer(salesToken))).status).toBe(403);

    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    await createGroup({ courseId: course.id, teacherId: teacher.id });
    expect((await request(app).get('/api/students/export').set(bearer(teacherToken))).status).toBe(403);
  });
});
