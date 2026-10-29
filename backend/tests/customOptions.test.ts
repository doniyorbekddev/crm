import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { uniqueDictionaryKey } from '../src/utils/dictionaryName.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

describe('uniqueDictionaryKey', () => {
  it('nomdan kalit yasaydi, band bo‘lsa raqam qo‘shadi', () => {
    expect(uniqueDictionaryKey('Ofis ta’miri', new Set())).toBe('OFIS_TAMIRI');
    expect(uniqueDictionaryKey('Ofis ta’miri', new Set(['OFIS_TAMIRI', 'OFIS_TAMIRI_2']))).toBe('OFIS_TAMIRI_3');
    expect(uniqueDictionaryKey('Kantselyariya tovarlari', new Set(), { lowercase: true })).toBe('kantselyariya_tovarlari');
    expect(uniqueDictionaryKey('—', new Set(), { fallback: 'ROOM' })).toBe('ROOM');
  });
});

describe.skipIf(!hasTestDatabase)('Selectlarga o‘z qiymatini qo‘shish (integratsion)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'ADMIN' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lead manbasini faqat nom bilan qo‘shadi: takror nom — 409, yashirilgani qayta yoqiladi', async () => {
    await createSource('Instagram');
    const hidden = await createSource('Gazeta');
    await prisma.source.update({ where: { id: hidden.id }, data: { isActive: false } });

    const created = await request(app).post('/api/lookups/sources').set(bearer(token)).send({ name: '  Ko‘cha   banneri ' }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Ko‘cha banneri' });
    const row = await prisma.source.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(row.key).toBe('KOCHA_BANNERI');

    const duplicate = await request(app).post('/api/lookups/sources').set(bearer(token)).send({ name: 'instagram' }).expect(409);
    expect(duplicate.body.errors?.[0]?.field).toBe('name');

    const revived = await request(app).post('/api/lookups/sources').set(bearer(token)).send({ name: 'GAZETA' }).expect(201);
    expect(revived.body.data.id).toBe(hidden.id);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: hidden.id } })).isActive).toBe(true);

    const lookups = await request(app).get('/api/lookups/lead-form').set(bearer(token)).expect(200);
    expect(lookups.body.data.sources.map((source: { name: string }) => source.name)).toEqual(expect.arrayContaining(['Ko‘cha banneri', 'Gazeta']));
  });

  it('manba qo‘shish va takliflar ruxsat bilan', async () => {
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    await request(app).post('/api/lookups/sources').set(bearer(teacher)).send({ name: 'Radio' }).expect(403);
    await request(app).get('/api/lookups/custom-labels/employee-position').set(bearer(teacher)).expect(403);
    await request(app).get('/api/lookups/custom-labels/unknown').set(bearer(token)).expect(422);
  });

  it('kurs yo‘nalishi: "Boshqa" bilan o‘z nomi saqlanadi, boshqa yo‘nalishda tozalanadi; takliflarda chiqadi', async () => {
    const payload = { name: 'Robototexnika 1', durationMonths: 4, price: 1_000_000, category: 'OTHER', categoryLabel: ' Robototexnika ' };
    const created = await request(app).post('/api/courses').set(bearer(token)).send(payload).expect(201);
    expect(created.body.data).toMatchObject({ category: 'OTHER', categoryLabel: 'Robototexnika' });
    await request(app).post('/api/courses').set(bearer(token)).send({ ...payload, name: 'Robototexnika 2', categoryLabel: 'robototexnika' }).expect(201);
    await request(app).post('/api/courses').set(bearer(token)).send({ ...payload, name: 'Shaxmat', categoryLabel: 'Shaxmat' }).expect(201);

    const labels = await request(app).get('/api/lookups/custom-labels/course-category').set(bearer(token)).expect(200);
    // Ko'p ishlatilgani birinchi, yozilish farqi bitta taklif
    expect(labels.body.data).toEqual(['Robototexnika', 'Shaxmat']);

    const updated = await request(app)
      .put(`/api/courses/${created.body.data.id}`)
      .set(bearer(token))
      .send({ ...payload, category: 'PROGRAMMING' })
      .expect(200);
    expect(updated.body.data.categoryLabel).toBeNull();
  });

  it('ota-ona qarindoshligi: "Boshqa" + o‘z nomi, qarindoshlik almashsa nom tozalanadi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await prisma.student.create({
      data: {
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '+998908500001',
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-09-01'),
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
      },
    });

    const parent = await request(app)
      .post('/api/parents')
      .set(bearer(token))
      .send({ firstName: 'Zuhra', lastName: 'Karimova', phone: '+998901234500', students: [{ studentId: student.id, relation: 'OTHER', relationLabel: 'Buvi' }] })
      .expect(201);
    const link = parent.body.data.students[0];
    expect(link).toMatchObject({ relation: 'OTHER', relationLabel: 'Buvi' });

    const labels = await request(app).get('/api/lookups/custom-labels/parent-relation').set(bearer(token)).expect(200);
    expect(labels.body.data).toEqual(['Buvi']);

    const updated = await request(app).patch(`/api/parents/links/${link.linkId}`).set(bearer(token)).send({ relation: 'MOTHER' }).expect(200);
    expect(updated.body.data[0]).toMatchObject({ relation: 'MOTHER', relationLabel: null });
  });

  it('xodim lavozimi va bo‘limi: o‘z nomi saqlanadi, takliflarda chiqadi, lavozim almashsa nom tozalanadi', async () => {
    const created = await request(app)
      .post('/api/employees')
      .set(bearer(token))
      .send({ firstName: 'Dilnoza', lastName: 'Karimova', position: 'OTHER', positionTitle: 'Metodist', department: 'O‘quv bo‘limi', baseSalary: 4_000_000, hireDate: '2025-06-01' })
      .expect(201);
    expect(created.body.data).toMatchObject({ position: 'OTHER', positionTitle: 'Metodist' });

    const positions = await request(app).get('/api/lookups/custom-labels/employee-position').set(bearer(token)).expect(200);
    expect(positions.body.data).toEqual(['Metodist']);
    const departments = await request(app).get('/api/lookups/custom-labels/employee-department').set(bearer(token)).expect(200);
    expect(departments.body.data).toEqual(['O‘quv bo‘limi']);

    const search = await request(app).get('/api/employees').query({ search: 'metod' }).set(bearer(token)).expect(200);
    expect(search.body.data).toHaveLength(1);

    const updated = await request(app).put(`/api/employees/${created.body.data.id}`).set(bearer(token)).send({ position: 'MANAGER' }).expect(200);
    expect(updated.body.data).toMatchObject({ position: 'MANAGER', positionTitle: null });
  });

  it('xona faqat nom bilan qo‘shiladi: kalit nomdan, bir xil nom — 409', async () => {
    const created = await request(app).post('/api/rooms').set(bearer(token)).send({ name: 'Katta zal' }).expect(201);
    expect(created.body.data).toMatchObject({ key: 'KATTA_ZAL', name: 'Katta zal', capacity: 15 });
    const duplicate = await request(app).post('/api/rooms').set(bearer(token)).send({ name: 'katta  zal' }).expect(409);
    expect(duplicate.body.errors?.[0]?.field).toBe('name');
  });

  it('ombor turkumi faqat nom bilan qo‘shiladi, takror nom — 409', async () => {
    const created = await request(app).put('/api/products/categories').set(bearer(token)).send({ name: 'Kantselyariya' }).expect(200);
    expect(created.body.data).toMatchObject({ key: 'kantselyariya', name: 'Kantselyariya', isActive: true });
    await request(app).put('/api/products/categories').set(bearer(token)).send({ name: 'KANTSELYARIYA' }).expect(409);
    // Kalit bilan tahrirlash avvalgidek ishlaydi
    await request(app).put('/api/products/categories').set(bearer(token)).send({ key: 'kantselyariya', name: 'Kanselyariya' }).expect(200);
  });
});
