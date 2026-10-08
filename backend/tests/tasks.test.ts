import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * CRM 4.0 · 2-faza: Vazifa 2.0 — qo'lda yaratish, biriktirish, doira (o'ziniki / bergan / filial),
 * izohlar, biriktirish tarixi, sahifalash.
 */
const app = createApp();

async function otherBranch() {
  return prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
}

describe.skipIf(!hasTestDatabase)('Vazifa 2.0', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('xodim o‘zi uchun vazifa yaratadi; boshqaga berish uchun `task.assign` kerak', async () => {
    const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });

    const own = await request(app).post('/api/tasks').set(bearer(sales)).send({ title: 'Hisobot tayyorlash', priority: 'HIGH' });
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ title: 'Hisobot tayyorlash', priority: 'HIGH', source: 'MANUAL', status: 'OPEN', assignee: { id: salesUser.id }, createdBy: { id: salesUser.id } });

    const toOther = await request(app).post('/api/tasks').set(bearer(sales)).send({ title: 'Boshqaga', assigneeId: teacher.id });
    expect(toOther.status).toBe(403);
    expect(await prisma.task.count()).toBe(1);

    // O'ziga bergani uchun bildirishnoma ketmaydi
    expect(await prisma.notification.count({ where: { type: 'TASK_UPDATE' } })).toBe(0);
  });

  it('noto‘g‘ri kiritish rad etiladi: bo‘sh sarlavha, tashqi havola, mavjud bo‘lmagan yoki kabinet ijrochisi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: student } = await createUserWithToken(app, { role: 'STUDENT' });

    expect((await request(app).post('/api/tasks').set(bearer(admin)).send({ title: ' ' })).status).toBe(422);
    expect((await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Havola', link: 'https://evil.example' })).status).toBe(422);
    expect((await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Havola', link: '//evil.example' })).status).toBe(422);
    expect((await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Yo‘q xodim', assigneeId: 'yoq' })).status).toBe(422);
    expect((await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'O‘quvchiga', assigneeId: student.id })).status).toBe(422);
    expect(await prisma.task.count()).toBe(0);
  });

  it('rahbar vazifa beradi: ijrochi xabar oladi, bajaradi — rahbar natijani biladi', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN', firstName: 'Rahbar', lastName: 'Admin' });
    const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });

    const created = await request(app)
      .post('/api/tasks')
      .set(bearer(admin))
      .send({ title: 'Ota-onaga qo‘ng‘iroq', assigneeId: teacherUser.id, priority: 'URGENT', dueAt: new Date(Date.now() - 3_600_000).toISOString(), link: '/students' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ overdue: true, assignee: { id: teacherUser.id }, createdBy: { id: adminUser.id } });

    const assigned = await prisma.notification.findMany({ where: { type: 'TASK_UPDATE' }, select: { userId: true, title: true, entityId: true } });
    expect(assigned).toEqual([{ userId: teacherUser.id, title: 'Sizga vazifa berildi', entityId: id }]);

    // Ijrochi matnni tahrirlay olmaydi, holatni o'zgartira oladi
    expect((await request(app).patch(`/api/tasks/${id}`).set(bearer(teacher)).send({ title: 'Boshqa nom' })).status).toBe(403);
    const done = await request(app).patch(`/api/tasks/${id}`).set(bearer(teacher)).send({ status: 'DONE' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'DONE', overdue: false });
    expect(done.body.data.completedAt).not.toBeNull();

    const toCreator = await prisma.notification.findMany({ where: { userId: adminUser.id, type: 'TASK_UPDATE' }, select: { title: true } });
    expect(toCreator).toEqual([{ title: 'Vazifa bajarildi' }]);
  });

  it('doira: begona xodim ko‘rmaydi (404); `task.view_all` faqat o‘z filiali xodimlarinikini ko‘radi', async () => {
    const branch = await otherBranch();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: otherAdmin } = await createUserWithToken(app, { role: 'ADMIN', branchId: branch.id });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: farTeacher } = await createUserWithToken(app, { role: 'TEACHER', branchId: branch.id });

    const mine = (await request(app).post('/api/tasks').set(bearer(teacher)).send({ title: 'Shaxsiy ish' })).body.data;

    // Begona o'qituvchi: ko'rmaydi, o'zgartira olmaydi, izoh yoza olmaydi
    expect((await request(app).get(`/api/tasks/${mine.id}`).set(bearer(stranger))).status).toBe(404);
    expect((await request(app).patch(`/api/tasks/${mine.id}`).set(bearer(stranger)).send({ status: 'DONE' })).status).toBe(404);
    expect((await request(app).post(`/api/tasks/${mine.id}/comments`).set(bearer(stranger)).send({ content: 'salom' })).status).toBe(404);
    // `scope=all` ruxsatsiz — faqat o'ziniki
    expect((await request(app).get('/api/tasks').query({ scope: 'all' }).set(bearer(stranger))).body.data.items).toHaveLength(0);

    // Shu filial admini ko'radi; boshqa filial admini ko'rmaydi; owner (barcha filiallar) ko'radi
    expect((await request(app).get(`/api/tasks/${mine.id}`).set(bearer(admin))).status).toBe(200);
    expect((await request(app).get(`/api/tasks/${mine.id}`).set(bearer(otherAdmin))).status).toBe(404);
    expect((await request(app).get(`/api/tasks/${mine.id}`).set(bearer(owner))).status).toBe(200);
    expect((await request(app).get('/api/tasks').query({ scope: 'all' }).set(bearer(otherAdmin))).body.data.items).toHaveLength(0);
    expect((await request(app).get('/api/tasks').query({ scope: 'all' }).set(bearer(admin))).body.data.items).toHaveLength(1);

    // Admin boshqa filial xodimiga vazifa bera olmaydi
    const cross = await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Filiallararo', assigneeId: farTeacher.id });
    expect(cross.status).toBe(422);
    expect((await request(app).post(`/api/tasks/${mine.id}/assign`).set(bearer(admin)).send({ assigneeId: farTeacher.id })).status).toBe(422);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })).assigneeId).toBe(teacherUser.id);
  });

  it('qayta biriktirish tarixga yoziladi; ruxsatsiz xodim biriktira olmaydi; yopilgan vazifa biriktirilmaydi', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: first, user: firstUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Birinchi' });
    const { user: secondUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Ikkinchi' });
    const id = (await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Guruh hisobotlari', assigneeId: firstUser.id })).body.data.id as string;

    expect((await request(app).post(`/api/tasks/${id}/assign`).set(bearer(first)).send({ assigneeId: secondUser.id })).status).toBe(403);
    expect((await request(app).post(`/api/tasks/${id}/assign`).set(bearer(admin)).send({ assigneeId: firstUser.id })).status).toBe(422);

    const moved = await request(app).post(`/api/tasks/${id}/assign`).set(bearer(admin)).send({ assigneeId: secondUser.id, note: 'Birinchi ta’tilda' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.assignee.id).toBe(secondUser.id);

    const detail = await request(app).get(`/api/tasks/${id}`).set(bearer(admin));
    expect(detail.body.data.assignments).toEqual([
      expect.objectContaining({ from: null, to: expect.objectContaining({ id: firstUser.id }), changedBy: expect.objectContaining({ id: adminUser.id }) }),
      expect.objectContaining({ from: expect.objectContaining({ id: firstUser.id }), to: expect.objectContaining({ id: secondUser.id }), note: 'Birinchi ta’tilda' }),
    ]);
    expect(detail.body.data.can).toEqual({ edit: true, assign: true, changeStatus: true });
    // Avvalgi ijrochi endi ko'rmaydi
    expect((await request(app).get(`/api/tasks/${id}`).set(bearer(first))).status).toBe(404);
    expect(await prisma.notification.count({ where: { userId: secondUser.id, title: 'Sizga vazifa biriktirildi' } })).toBe(1);

    await request(app).patch(`/api/tasks/${id}`).set(bearer(admin)).send({ status: 'CANCELLED' });
    expect((await request(app).post(`/api/tasks/${id}/assign`).set(bearer(admin)).send({ assigneeId: firstUser.id })).status).toBe(422);
  });

  it('izoh: ikkinchi tomon xabar oladi, muallifning o‘ziga xabar ketmaydi', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });
    const id = (await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Savol', assigneeId: teacherUser.id })).body.data.id as string;

    const comment = await request(app).post(`/api/tasks/${id}/comments`).set(bearer(teacher)).send({ content: 'Qaysi guruh uchun?' });
    expect(comment.status).toBe(201);
    expect((await request(app).post(`/api/tasks/${id}/comments`).set(bearer(teacher)).send({ content: '   ' })).status).toBe(422);

    const detail = await request(app).get(`/api/tasks/${id}`).set(bearer(admin));
    expect(detail.body.data.comments).toEqual([expect.objectContaining({ content: 'Qaysi guruh uchun?', author: expect.objectContaining({ id: teacherUser.id }) })]);
    expect(detail.body.data.commentCount).toBe(1);

    const notes = await prisma.notification.findMany({ where: { title: 'Vazifaga izoh qoldirildi' }, select: { userId: true } });
    expect(notes).toEqual([{ userId: adminUser.id }]);
  });

  it('ro‘yxat: sahifalash, filtrlar va ochiq vazifalar soni', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    await prisma.task.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        title: `Ish ${String(index + 1).padStart(2, '0')}`,
        assigneeId: adminUser.id,
        createdById: adminUser.id,
        priority: index < 3 ? ('URGENT' as const) : ('NORMAL' as const),
        status: index >= 20 ? ('DONE' as const) : ('OPEN' as const),
        dueAt: index < 5 ? new Date(Date.now() - 86_400_000) : null,
      })),
    });

    const first = await request(app).get('/api/tasks').query({ limit: 10 }).set(bearer(admin));
    expect(first.body.data).toMatchObject({ total: 25, openCount: 20, page: 1, limit: 10 });
    expect(first.body.data.items).toHaveLength(10);
    // Ochiqlar ichida muddati borlar birinchi
    expect(first.body.data.items[0].dueAt).not.toBeNull();

    const third = await request(app).get('/api/tasks').query({ limit: 10, page: 3 }).set(bearer(admin));
    expect(third.body.data.items).toHaveLength(5);
    const ids = new Set([...first.body.data.items, ...(await request(app).get('/api/tasks').query({ limit: 10, page: 2 }).set(bearer(admin))).body.data.items, ...third.body.data.items].map((item: { id: string }) => item.id));
    expect(ids.size).toBe(25);

    expect((await request(app).get('/api/tasks').query({ priority: 'URGENT' }).set(bearer(admin))).body.data.total).toBe(3);
    expect((await request(app).get('/api/tasks').query({ overdue: 'true' }).set(bearer(admin))).body.data.total).toBe(5);
    expect((await request(app).get('/api/tasks').query({ status: 'DONE' }).set(bearer(admin))).body.data.total).toBe(5);
    expect((await request(app).get('/api/tasks').query({ search: 'ish 07' }).set(bearer(admin))).body.data.total).toBe(1);
    expect((await request(app).get('/api/tasks').query({ scope: 'created' }).set(bearer(admin))).body.data.total).toBe(25);
    expect((await request(app).get('/api/tasks').query({ limit: 500 }).set(bearer(admin))).status).toBe(422);
  });

  it('kabinet hisobi (o‘quvchi) vazifalarga kira olmaydi', async () => {
    const { token: student } = await createUserWithToken(app, { role: 'STUDENT' });
    expect((await request(app).get('/api/tasks').set(bearer(student))).status).toBe(403);
    expect((await request(app).post('/api/tasks').set(bearer(student)).send({ title: 'Urinish' })).status).toBe(403);
  });
});
