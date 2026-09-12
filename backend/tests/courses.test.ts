import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();

const basePayload = {
  name: 'Frontend',
  category: 'PROGRAMMING',
  durationMonths: 6,
  price: 7_200_000,
  discountAmount: 200_000,
};

describe.skipIf(!hasTestDatabase)('Courses API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ko‘rish hammaga ochiq, boshqarish faqat course.manage bilan', async () => {
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });

    const salesList = await request(app).get('/api/courses').set(bearer(salesToken));
    const salesCreate = await request(app).post('/api/courses').set(bearer(salesToken)).send(basePayload);
    const adminCreate = await request(app).post('/api/courses').set(bearer(adminToken)).send(basePayload);

    expect(salesList.status).toBe(200);
    expect(salesCreate.status).toBe(403);
    expect(adminCreate.status).toBe(201);
  });

  it('yakuniy narxni serverda hisoblaydi va chegirma narxdan katta bo‘lsa rad etadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const created = await request(app).post('/api/courses').set(bearer(token)).send(basePayload);
    const tooBigDiscount = await request(app)
      .post('/api/courses')
      .set(bearer(token))
      .send({ ...basePayload, name: 'Backend', discountAmount: 9_000_000 });
    const duplicate = await request(app).post('/api/courses').set(bearer(token)).send(basePayload);

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ price: 7_200_000, discountAmount: 200_000, finalPrice: 7_000_000, status: 'ACTIVE' });
    expect(tooBigDiscount.status).toBe(422);
    expect(tooBigDiscount.body.errors[0].field).toBe('discountAmount');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.errors).toEqual([{ field: 'name', message: 'Bu nom band' }]);
  });

  it('narx o‘zgarganda yakuniy narx qayta hisoblanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const created = await request(app).post('/api/courses').set(bearer(token)).send(basePayload);

    const updated = await request(app)
      .put(`/api/courses/${created.body.data.id}`)
      .set(bearer(token))
      .send({ ...basePayload, price: 8_000_000, discountAmount: 0, status: 'ARCHIVED' });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ price: 8_000_000, finalPrice: 8_000_000, status: 'ARCHIVED' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'course.updated' } });
    expect(audit.metadata).toMatchObject({ priceFrom: 7_000_000, priceTo: 8_000_000 });
  });

  it('qidiruv, yo‘nalish filtri va bog‘liqliklar sonini qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const frontend = await createCourse('Frontend');
    await createCourse('Ingliz tili');
    await prisma.group.create({
      data: {
        name: 'FE-01',
        courseId: frontend.id,
        startDate: new Date('2026-09-01'),
        scheduleDays: ['MONDAY', 'WEDNESDAY'],
        startTime: '14:00',
        endTime: '16:00',
        capacity: 12,
      },
    });

    const search = await request(app).get('/api/courses').query({ search: 'ingliz' }).set(bearer(token));
    const byCategory = await request(app).get('/api/courses').query({ category: 'OTHER' }).set(bearer(token));
    const all = await request(app).get('/api/courses').set(bearer(token));

    expect(search.body.data.map((course: { name: string }) => course.name)).toEqual(['Ingliz tili']);
    expect(byCategory.body.meta.total).toBe(2);
    const frontendDto = (all.body.data as Array<{ name: string; counts: { groups: number } }>).find((c) => c.name === 'Frontend');
    expect(frontendDto?.counts.groups).toBe(1);
  });

  it('ishlatilayotgan kursni o‘chirmaydi, bo‘shini o‘chiradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const used = await createCourse('Backend');
    const empty = await createCourse('Koreys tili');
    await prisma.student.create({
      data: {
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '+998901234567',
        courseId: used.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-09-01'),
      },
    });

    const blocked = await request(app).delete(`/api/courses/${used.id}`).set(bearer(token));
    const removed = await request(app).delete(`/api/courses/${empty.id}`).set(bearer(token));

    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('1 ta o‘quvchi');
    expect(removed.status).toBe(200);
    expect(await prisma.course.findUnique({ where: { id: empty.id } })).toBeNull();
  });
});
