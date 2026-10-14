import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();
const REQUIRED = 'Iltimos, o‘quvchi yoki ota-onaning telefon raqamidan kamida bittasini kiriting.';

function payload(courseId: string, phones: { phone?: string | null; parentPhone?: string | null }) {
  return { firstName: 'Ali', lastName: 'Valiyev', courseId, startDate: '2026-10-01', ...phones };
}

/** O'quvchi va ota-ona telefoni: ikkalasi ixtiyoriy, lekin kamida bittasi shart — backendda ham, bazada ham */
describe.skipIf(!hasTestDatabase)('O‘quvchi telefonlari (integratsion)', () => {
  let token: string;
  let courseId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'ADMIN' }));
    courseId = (await createCourse()).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const create = (phones: { phone?: string | null; parentPhone?: string | null }) =>
    request(app).post('/api/students').set(bearer(token)).send(payload(courseId, phones));

  it('faqat o‘quvchi, faqat ota-ona va ikkala telefon bilan yaratiladi', async () => {
    const own = await create({ phone: '+998901110001' });
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ phone: '+998901110001', parentPhone: null });

    const parentOnly = await create({ parentPhone: '+998901110002' });
    expect(parentOnly.status).toBe(201);
    expect(parentOnly.body.data).toMatchObject({ phone: null, parentPhone: '+998901110002' });

    const both = await create({ phone: '+998901110003', parentPhone: '+998901110004' });
    expect(both.status).toBe(201);
    expect(both.body.data).toMatchObject({ phone: '+998901110003', parentPhone: '+998901110004' });
  });

  it('ikkala telefon bo‘sh — 422, xabar ikkala maydonga; frontend tekshiruvisiz ham (bo‘sh qator, null, umuman yo‘q)', async () => {
    for (const phones of [{}, { phone: '', parentPhone: '' }, { phone: null, parentPhone: null }]) {
      const response = await create(phones);
      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'phone', message: REQUIRED },
          { field: 'parentPhone', message: REQUIRED },
        ]),
      );
    }
    expect(await prisma.student.count()).toBe(0);
  });

  it('tahrirlash: telefonlarni almashtirish mumkin, ikkalasini o‘chirib bo‘lmaydi; o‘chirilgan raqam null bo‘ladi', async () => {
    const { body } = await create({ phone: '+998901110005' });
    const id = body.data.id as string;
    const update = (phones: { phone?: string | null; parentPhone?: string | null }) =>
      request(app).put(`/api/students/${id}`).set(bearer(token)).send(payload(courseId, phones));

    const swapped = await update({ phone: '', parentPhone: '+998901110006' });
    expect(swapped.status).toBe(200);
    expect(swapped.body.data).toMatchObject({ phone: null, parentPhone: '+998901110006' });

    const cleared = await update({ phone: '', parentPhone: '' });
    expect(cleared.status).toBe(422);
    expect(cleared.body.errors[0].message).toBe(REQUIRED);
    const stored = await prisma.student.findUniqueOrThrow({ where: { id }, select: { phone: true, parentPhone: true } });
    expect(stored).toEqual({ phone: null, parentPhone: '+998901110006' });
  });

  it('bazadagi CHECK cheklovi qoidani API dan tashqari yozuvda ham ushlaydi', async () => {
    const { body } = await create({ phone: '+998901110007' });
    await expect(prisma.student.update({ where: { id: body.data.id }, data: { phone: null, parentPhone: null } })).rejects.toThrow();
  });

  it('qidiruv ota-ona raqami bo‘yicha topadi; ota-ona olib tashlansa yagona raqam saqlanadi', async () => {
    const { body } = await create({ parentPhone: '+998935557788' });
    const id = body.data.id as string;

    const list = await request(app).get('/api/students').query({ search: '5557788' }).set(bearer(token));
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([id]);
    const global = await request(app).get('/api/search').query({ q: '5557788' }).set(bearer(token));
    const hit = global.body.data.groups.find((group: { key: string }) => group.key === 'students').hits[0];
    expect(hit).toMatchObject({ id, subtitle: expect.stringContaining('ota-ona: +998935557788') });

    // Ota-ona yozuvi biriktirilib, keyin olib tashlanadi — o'quvchining o'z raqami yo'q, shuning uchun parentPhone qoladi
    const parent = await request(app)
      .post('/api/parents')
      .set(bearer(token))
      .send({ firstName: 'Vali', lastName: 'Valiyev', phone: '+998935557799', students: [{ studentId: id }] });
    expect(parent.status).toBe(201);
    expect((await prisma.student.findUniqueOrThrow({ where: { id } })).parentPhone).toBe('+998935557799');
    const link = await prisma.studentParent.findFirstOrThrow({ where: { studentId: id } });
    const detached = await request(app).delete(`/api/parents/links/${link.id}`).set(bearer(token));
    expect(detached.status).toBeLessThan(300);
    expect((await prisma.student.findUniqueOrThrow({ where: { id } })).parentPhone).toBe('+998935557799');
  });

  it('eski yozuv (faqat o‘quvchi telefoni) o‘zgarishsiz o‘qiladi va tahrirlanadi', async () => {
    const legacy = await prisma.student.create({
      data: {
        firstName: 'Eski',
        lastName: 'Yozuv',
        phone: '+998901110009',
        courseId,
        contractPrice: 1_000_000,
        startDate: new Date('2025-01-10'),
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
      },
    });
    const profile = await request(app).get(`/api/students/${legacy.id}`).set(bearer(token));
    expect(profile.body.data).toMatchObject({ phone: '+998901110009', parentPhone: null });
    const edited = await request(app)
      .put(`/api/students/${legacy.id}`)
      .set(bearer(token))
      .send({ ...payload(courseId, { phone: '+998901110009' }), firstName: 'Yangi' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ firstName: 'Yangi', phone: '+998901110009' });
  });
});
