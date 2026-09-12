import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

async function seedNotifications(userId: string, count: number, readCount = 0) {
  // Har biriga alohida vaqt beriladi: bir xil millisekundda tartib tasodifiy bo'lib qolmasin
  const base = Date.now() - count * 60_000;
  for (let index = 0; index < count; index += 1) {
    await prisma.notification.create({
      data: {
        userId,
        type: index % 2 === 0 ? 'SYSTEM' : 'NEW_LEAD',
        title: `Bildirishnoma ${index + 1}`,
        message: `Matn ${index + 1}`,
        createdAt: new Date(base + index * 60_000),
        readAt: index < readCount ? new Date() : null,
      },
    });
  }
}

describe.skipIf(!hasTestDatabase)('Notifications API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('faqat o‘z bildirishnomalarini qaytaradi va sahifalaydi', async () => {
    const { user: owner, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await seedNotifications(owner.id, 3);
    await seedNotifications(other.id, 2);

    const list = await request(app).get('/api/notifications?page=1&limit=2').set(bearer(token));

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    // Eng yangilari birinchi
    expect(list.body.data[0].title).toBe('Bildirishnoma 3');
    expect(list.body.data[0].isRead).toBe(false);
  });

  it('o‘qilmaganlar sonini turlari bilan qaytaradi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await seedNotifications(user.id, 5, 2);

    const summary = await request(app).get('/api/notifications/summary').set(bearer(token));

    expect(summary.body.data).toMatchObject({ total: 5, unread: 3 });
    expect(summary.body.data.byType.reduce((sum: number, row: { unread: number }) => sum + row.unread, 0)).toBe(3);
  });

  it('bittasini va hammasini o‘qilgan deb belgilaydi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await seedNotifications(user.id, 3);
    const first = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });

    const markOne = await request(app).patch(`/api/notifications/${first.id}/read`).set(bearer(token));
    const afterOne = await request(app).get('/api/notifications/summary').set(bearer(token));
    const markAll = await request(app).patch('/api/notifications/read-all').set(bearer(token));
    const afterAll = await request(app).get('/api/notifications/summary').set(bearer(token));
    const markAllAgain = await request(app).patch('/api/notifications/read-all').set(bearer(token));

    expect(markOne.status).toBe(200);
    expect(markOne.body.data.isRead).toBe(true);
    expect(afterOne.body.data.unread).toBe(2);
    expect(markAll.body.data.count).toBe(2);
    expect(afterAll.body.data.unread).toBe(0);
    expect(markAllAgain.body.data.count).toBe(0);
  });

  it('unreadOnly va tur bo‘yicha filtrlaydi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await seedNotifications(user.id, 4, 2);

    const unread = await request(app).get('/api/notifications?unreadOnly=true').set(bearer(token));
    const byType = await request(app).get('/api/notifications?type=NEW_LEAD').set(bearer(token));
    const badType = await request(app).get('/api/notifications?type=UNKNOWN').set(bearer(token));

    expect(unread.body.data).toHaveLength(2);
    expect(unread.body.data.every((item: { isRead: boolean }) => !item.isRead)).toBe(true);
    expect(byType.body.data).toHaveLength(2);
    expect(badType.status).toBe(422);
  });

  it('begona bildirishnomaga tegib bo‘lmaydi, o‘chirish va tozalash ishlaydi', async () => {
    const { user: owner, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await seedNotifications(owner.id, 3, 2);
    await seedNotifications(other.id, 1);
    const foreign = await prisma.notification.findFirstOrThrow({ where: { userId: other.id } });
    const own = await prisma.notification.findFirstOrThrow({ where: { userId: owner.id, readAt: null } });

    const foreignRead = await request(app).patch(`/api/notifications/${foreign.id}/read`).set(bearer(token));
    const foreignDelete = await request(app).delete(`/api/notifications/${foreign.id}`).set(bearer(token));
    const removed = await request(app).delete(`/api/notifications/${own.id}`).set(bearer(token));
    const cleared = await request(app).delete('/api/notifications/read').set(bearer(token));
    const rest = await request(app).get('/api/notifications').set(bearer(token));

    expect(foreignRead.status).toBe(404);
    expect(foreignDelete.status).toBe(404);
    expect(removed.status).toBe(200);
    expect(cleared.body.data.count).toBe(2);
    expect(rest.body.data).toHaveLength(0);
    // Begonaniki joyida qoldi
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(1);
  });

  it('lead biriktirilganda va o‘quvchiga aylantirilganda bildirishnoma tushadi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: manager, token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const lead = await createLead({ sourceId: source.id, courseId: course.id, firstName: 'Nodira' });

    const assigned = await request(app)
      .patch(`/api/leads/${lead.id}/assign`)
      .set(bearer(adminToken))
      .send({ assignedToId: manager.id });
    const converted = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(adminToken)).send({});

    expect(assigned.status).toBe(200);
    expect(converted.status).toBe(201);

    const list = await request(app).get('/api/notifications').set(bearer(managerToken));
    const types = list.body.data.map((item: { type: string }) => item.type);
    expect(types).toContain('LEAD_ASSIGNED');
    expect(types).toContain('NEW_STUDENT');

    const studentNotification = list.body.data.find((item: { type: string }) => item.type === 'NEW_STUDENT');
    expect(studentNotification).toMatchObject({ entityType: 'student', isRead: false });
    expect(studentNotification.message).toContain('Nodira');
  });

  it('tizimga kirmagan foydalanuvchi bildirishnomalarni ko‘ra olmaydi', async () => {
    const list = await request(app).get('/api/notifications');
    const summary = await request(app).get('/api/notifications/summary');

    expect(list.status).toBe(401);
    expect(summary.status).toBe(401);
  });
});
