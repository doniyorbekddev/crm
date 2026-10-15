import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createSource } from './helpers/fixtures.js';

const app = createApp();
const REQUIRED = 'Iltimos, lid yoki ota-onaning telefon raqamidan kamida bittasini kiriting.';

/** Lead: ikki telefon (kamida bittasi shart) va manba — ro'yxatdan yoki o'zi yozgan */
describe.skipIf(!hasTestDatabase)('Lead telefonlari va manbasi (integratsion)', () => {
  let token: string;
  let sourceId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'ADMIN' }));
    sourceId = (await createSource('Instagram')).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const create = (body: Record<string, unknown>) =>
    request(app).post('/api/leads').set(bearer(token)).send({ firstName: 'Ali', sourceId, ...body });

  it('faqat lid, faqat ota-ona va ikkala telefon bilan yaratiladi; ikkalasi bo‘sh — 422', async () => {
    expect((await create({ phone: '+998901110001' })).body.data).toMatchObject({ phone: '+998901110001', parentPhone: null });
    expect((await create({ parentPhone: '+998901110002' })).body.data).toMatchObject({ phone: null, parentPhone: '+998901110002' });
    expect((await create({ phone: '+998901110003', parentPhone: '+998901110004' })).body.data).toMatchObject({
      phone: '+998901110003',
      parentPhone: '+998901110004',
    });

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
    await expect(prisma.lead.update({ where: { id: (await prisma.lead.findFirstOrThrow()).id }, data: { phone: null, parentPhone: null } })).rejects.toThrow();
  });

  it('takror: yangi raqam mavjud leadning istalgan raqamiga mos kelsa 409', async () => {
    await create({ phone: '+998901110005', parentPhone: '+998901110006' });
    const byParent = await create({ phone: '+998901110006' });
    expect(byParent.status).toBe(409);
    expect(byParent.body.errors).toEqual([{ field: 'phone', message: 'Bu raqam bilan lead mavjud' }]);
    const parentMatch = await create({ parentPhone: '+998901110005' });
    expect(parentMatch.status).toBe(409);
    expect(parentMatch.body.errors).toEqual([{ field: 'parentPhone', message: 'Bu raqam bilan lead mavjud' }]);
  });

  it('o‘zi yozgan manba: yangisi yaratiladi, keyingi safar (katta-kichik harfsiz) qayta ishlatiladi va ro‘yxatda chiqadi', async () => {
    const first = await create({ phone: '+998901110007', sourceId: undefined, sourceName: '  Ko‘rgazma  2026 ' });
    expect(first.status).toBe(201);
    expect(first.body.data.source).toMatchObject({ name: 'Ko‘rgazma 2026' });

    const second = await create({ phone: '+998901110008', sourceId: undefined, sourceName: 'ko‘rgazma 2026' });
    expect(second.body.data.source.id).toBe(first.body.data.source.id);
    // Mavjud manba nomi yozilsa — o'sha manba, yangisi yaratilmaydi
    const existing = await create({ phone: '+998901110009', sourceId: undefined, sourceName: 'INSTAGRAM' });
    expect(existing.body.data.source.id).toBe(sourceId);
    expect(await prisma.source.count()).toBe(2);

    const lookups = await request(app).get('/api/lookups/lead-form').set(bearer(token));
    expect(lookups.body.data.sources.map((row: { name: string }) => row.name)).toContain('Ko‘rgazma 2026');

    const missing = await create({ phone: '+998901110010', sourceId: undefined });
    expect(missing.status).toBe(422);
    expect(missing.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sourceId' })]));
  });

  it('tahrirlash: lid raqamini o‘chirib ota-ona raqamini qoldirish va manbani o‘zi yozish mumkin', async () => {
    const { body } = await create({ phone: '+998901110011' });
    const updated = await request(app)
      .put(`/api/leads/${body.data.id}`)
      .set(bearer(token))
      .send({ firstName: 'Ali', phone: '', parentPhone: '+998901110012', sourceName: 'Flayer' });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ phone: null, parentPhone: '+998901110012', source: { name: 'Flayer' } });

    const cleared = await request(app)
      .put(`/api/leads/${body.data.id}`)
      .set(bearer(token))
      .send({ firstName: 'Ali', phone: '', parentPhone: '', sourceId });
    expect(cleared.status).toBe(422);
  });

  it('qidiruv ota-ona raqamini topadi; o‘quvchiga aylantirilganda ikkala raqam o‘tadi', async () => {
    const course = await createCourse();
    const { body } = await create({ parentPhone: '+998935551122', courseId: course.id });
    const id = body.data.id as string;

    const list = await request(app).get('/api/leads').query({ search: '5551122' }).set(bearer(token));
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([id]);

    const converted = await request(app).post(`/api/leads/${id}/convert`).set(bearer(token)).send({});
    expect(converted.status).toBe(201);
    expect(converted.body.data).toMatchObject({ phone: null, parentPhone: '+998935551122' });
  });
});
