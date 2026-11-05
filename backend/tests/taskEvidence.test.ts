import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** ORG roadmap §5: vazifada bajarilganlik dalili — kerak bo'lganda ijrochi topshirishda yozadi */
const app = createApp();

describe.skipIf(!hasTestDatabase)('Vazifa — bajarilganlik dalili', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dalil majburiy: dalilsiz topshirib bo‘lmaydi; dalil saqlanadi, izohga va auditga yoziladi; qabul qiluvchidan talab qilinmaydi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: creator } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'creator@test.uz' });
    const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });

    const created = await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Video montaj', assigneeId: teacherUser.id, evidenceRequired: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ evidenceRequired: true, completionEvidence: null, needsReview: true });
    const id = created.body.data.id as string;

    const missing = await request(app).patch(`/api/tasks/${id}`).set(bearer(teacher)).send({ status: 'DONE' });
    expect(missing.status).toBe(422);
    expect(missing.body.errors[0].field).toBe('evidence');
    expect((await request(app).patch(`/api/tasks/${id}`).set(bearer(teacher)).send({ status: 'REVIEW', evidence: 'ok' })).status).toBe(422);

    const submitted = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(bearer(teacher))
      .send({ status: 'DONE', evidence: 'Video tayyor: https://drive.example/video-1' });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: 'REVIEW', completionEvidence: 'Video tayyor: https://drive.example/video-1' });
    expect(await prisma.taskComment.count({ where: { taskId: id, content: { startsWith: '📎 Dalil:' } } })).toBe(1);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'task.status_changed', entityId: id } })).metadata).toMatchObject({ to: 'REVIEW', evidence: 'Video tayyor: https://drive.example/video-1' });

    // Qabul qiluvchi dalilsiz yopadi
    const accepted = await request(app).patch(`/api/tasks/${id}`).set(bearer(admin)).send({ status: 'DONE' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('DONE');

    // Talab bo'lmagan vazifa avvalgidek dalilsiz topshiriladi; ijrochi talabni o'zgartira olmaydi
    const plain = await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Oddiy', assigneeId: teacherUser.id });
    expect(plain.body.data.evidenceRequired).toBe(false);
    expect((await request(app).patch(`/api/tasks/${plain.body.data.id}`).set(bearer(teacher)).send({ evidenceRequired: true })).status).toBe(403);
    expect((await request(app).patch(`/api/tasks/${plain.body.data.id}`).set(bearer(teacher)).send({ status: 'DONE' })).body.data.status).toBe('REVIEW');

    // O'zi uchun dalil majburiy vazifa: o'zi yopganda ham dalil kerak
    const own = await request(app).post('/api/tasks').set(bearer(creator)).send({ title: 'O‘z hisobotim', evidenceRequired: true });
    expect((await request(app).patch(`/api/tasks/${own.body.data.id}`).set(bearer(creator)).send({ status: 'DONE' })).status).toBe(422);
    expect((await request(app).patch(`/api/tasks/${own.body.data.id}`).set(bearer(creator)).send({ status: 'DONE', evidence: 'Hisobot yuborildi' })).body.data.status).toBe('DONE');
  });
});
