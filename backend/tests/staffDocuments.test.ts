import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { alertService } from '../src/services/alert.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { binaryParser } from './helpers/zip.js';

const app = createApp();

/** 1×1 PNG va minimal PDF */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`);

const DAY = 86_400_000;
const dateOnly = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

function upload(token: string, url: string, body: Buffer, name: string, query: Record<string, string> = {}) {
  return request(app)
    .post(url)
    .query(query)
    .set(bearer(token))
    .set('Content-Type', 'application/octet-stream')
    .set('X-File-Name', encodeURIComponent(name))
    .send(body);
}

describe.skipIf(!hasTestDatabase)('Kadrlar: o‘qituvchi holati va xodim hujjatlari (integratsion)', () => {
  let owner: string;
  let teacherProfileId: string;
  let employeeId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    teacherProfileId = (await prisma.teacherProfile.create({ data: { userId: teacher.id, hireDate: new Date('2025-09-01') } })).id;
    employeeId = (
      await prisma.employee.create({
        data: { firstName: 'Dilnoza', lastName: 'Karimova', position: 'ACCOUNTANT', baseSalary: 4_000_000, hireDate: new Date('2025-01-10') },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi holati: ta’til faol hisoblanadi, ketishda sana shart, eski tugma ham ishlaydi', async () => {
    const url = `/api/teachers/${teacherProfileId}`;
    const onLeave = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', employmentStatus: 'ON_LEAVE' });
    expect(onLeave.status).toBe(200);
    expect(onLeave.body.data).toMatchObject({ employmentStatus: 'ON_LEAVE', isActive: true, terminationDate: null });

    const missingDate = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', employmentStatus: 'RESIGNED' });
    expect(missingDate.status).toBe(422);
    expect(missingDate.body.errors[0].field).toBe('terminationDate');

    const beforeHire = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', employmentStatus: 'RESIGNED', terminationDate: '2025-08-01' });
    expect(beforeHire.status).toBe(422);

    const resigned = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', employmentStatus: 'RESIGNED', terminationDate: '2026-08-31' });
    expect(resigned.body.data).toMatchObject({ employmentStatus: 'RESIGNED', isActive: false, terminationDate: '2026-08-31' });
    expect(await prisma.auditLog.count({ where: { action: 'teacher.deactivated', entityId: teacherProfileId } })).toBe(1);

    // Qayta faollashtirish — ketgan sana tozalanadi
    const back = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', isActive: true });
    expect(back.body.data).toMatchObject({ employmentStatus: 'ACTIVE', isActive: true, terminationDate: null });

    // Eski "faolsizlantirish" (faqat isActive) — ishdan ketgan, sana bugun
    const legacy = await request(app).put(url).set(bearer(owner)).send({ hireDate: '2025-09-01', isActive: false });
    expect(legacy.body.data).toMatchObject({ employmentStatus: 'RESIGNED', isActive: false });
    expect(legacy.body.data.terminationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const filtered = await request(app).get('/api/teachers').query({ employmentStatus: 'RESIGNED' }).set(bearer(owner));
    expect(filtered.body.data.map((row: { id: string }) => row.id)).toEqual([teacherProfileId]);
  });

  it('hujjatlar: turi, nomi va muddati bilan yuklanadi, tartiblanadi, tahrirlanadi va himoyalanadi', async () => {
    const teacherUrl = `/api/teachers/${teacherProfileId}/documents`;
    const certificate = await upload(owner, teacherUrl, PNG, 'IELTS.png', { category: 'CERTIFICATE', title: 'IELTS 8.0' });
    expect(certificate.status).toBe(201);
    expect(certificate.body.data).toMatchObject({ category: 'CERTIFICATE', title: 'IELTS 8.0', expiresAt: null, mimeType: 'image/png' });

    const contract = await upload(owner, teacherUrl, pdf('shartnoma'), 'shartnoma.pdf', { category: 'CONTRACT', title: 'Mehnat shartnomasi', expiresAt: dateOnly(10) });
    expect(contract.status).toBe(201);
    expect(contract.body.data.expiresAt).toBe(dateOnly(10));

    expect((await upload(owner, teacherUrl, pdf('x'), 'x.pdf', { category: 'RECEIPT' })).status).toBe(422);
    expect((await upload(owner, teacherUrl, pdf('y'), 'y.pdf', { expiresAt: '31.12.2027' })).status).toBe(422);

    const list = await request(app).get(teacherUrl).set(bearer(owner));
    expect(list.body.data.map((row: { category: string }) => row.category)).toEqual(['CONTRACT', 'CERTIFICATE']);
    expect((await request(app).get(`/api/teachers/${teacherProfileId}`).set(bearer(owner))).body.data.documents).toBe(2);

    const edited = await request(app)
      .patch(`/api/documents/${certificate.body.data.id}`)
      .set(bearer(owner))
      .send({ title: '', expiresAt: dateOnly(400), category: 'OTHER' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ title: null, expiresAt: dateOnly(400), category: 'OTHER' });
    expect(await prisma.auditLog.count({ where: { action: 'document.updated' } })).toBe(1);

    const download = await request(app).get(`/api/documents/${contract.body.data.id}/download`).set(bearer(owner)).buffer(true).parse(binaryParser);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');

    const employeeUrl = `/api/employees/${employeeId}/documents`;
    const passport = await upload(owner, employeeUrl, pdf('pasport'), 'pasport.pdf', { category: 'PASSPORT', expiresAt: dateOnly(-3) });
    expect(passport.status).toBe(201);

    // Admin ko'radi va yuklaydi; buxgalter va o'qituvchining o'zi ko'rmaydi
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' });
    expect((await request(app).get(employeeUrl).set(bearer(admin))).status).toBe(200);
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' });
    expect((await request(app).get(employeeUrl).set(bearer(accountant))).status).toBe(403);
    expect((await request(app).get(`/api/documents/${passport.body.data.id}/download`).set(bearer(accountant))).status).toBe(403);
    const teacherToken = (await request(app).post('/api/auth/login').send({ email: 'teacher@test.uz', password: 'Password123' })).body.data?.accessToken;
    if (teacherToken) {
      expect((await request(app).get(teacherUrl).set(bearer(teacherToken))).status).toBe(403);
    }
    // Chek emas — xarajat hujjati tahrirlanmaydi
    expect((await request(app).patch(`/api/documents/${passport.body.data.id}`).set(bearer(accountant)).send({ title: 'X' })).status).toBe(403);

    // Muddati tugayotgan va o'tgan hujjatlar ogohlantirishi; ishdan ketgan xodim hujjati hisobga olinmaydi
    await alertService.evaluate(new Date());
    const teacherAlert = await prisma.alert.findFirst({ where: { type: 'DOCUMENT_EXPIRING', entityId: teacherProfileId, resolvedAt: null } });
    expect(teacherAlert).toMatchObject({ severity: 'WARNING', entityType: 'teacher' });
    expect(teacherAlert!.message).toContain('10 kundan keyin tugaydi');
    const employeeAlert = await prisma.alert.findFirst({ where: { type: 'DOCUMENT_EXPIRING', entityId: employeeId, resolvedAt: null } });
    expect(employeeAlert).toMatchObject({ severity: 'CRITICAL', entityType: 'employee' });

    await prisma.employee.update({ where: { id: employeeId }, data: { status: 'RESIGNED', terminationDate: new Date() } });
    await alertService.evaluate(new Date());
    expect(await prisma.alert.findFirst({ where: { type: 'DOCUMENT_EXPIRING', entityId: employeeId, resolvedAt: null } })).toBeNull();

    // O'chirilgan hujjat ro'yxatdan yo'qoladi va ogohlantirish yopiladi
    expect((await request(app).delete(`/api/documents/${contract.body.data.id}`).set(bearer(owner))).status).toBe(200);
    await alertService.evaluate(new Date());
    expect(await prisma.alert.findFirst({ where: { type: 'DOCUMENT_EXPIRING', entityId: teacherProfileId, resolvedAt: null } })).toBeNull();
    expect((await request(app).get(teacherUrl).set(bearer(owner))).body.data).toHaveLength(1);
  });
});
