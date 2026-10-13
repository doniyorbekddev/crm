import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { resolveStoredPath } from '../src/utils/fileStorage.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** Profil rasmi: faqat o'ziniki, faqat rasm, hajm chegarasi, almashtirishda eski fayl o'chadi, ochiq manzil faqat avatar fayllarini beradi */
const app = createApp();

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
const PDF = Buffer.from('%PDF-1.4\n%fake');

const upload = (token: string, body: Buffer, type = 'image/png') => request(app).post('/api/auth/me/avatar').set(bearer(token)).set('Content-Type', type).send(body);
const publicPath = (avatarUrl: string) => `/api${avatarUrl}`;
const storedPath = (avatarUrl: string) => avatarUrl.replace('/public/avatars/', '');

describe.skipIf(!hasTestDatabase)('Profil rasmi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('yuklash: rasm saqlanadi, profilda va xodimlar ro‘yxatida manzili chiqadi, tokensiz ochiladi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'ADMIN' });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.data.avatarUrl).toBeNull();

    const response = await upload(token, PNG);
    expect(response.status).toBe(200);
    const avatarUrl = response.body.data.avatarUrl as string;
    expect(avatarUrl).toMatch(/^\/public\/avatars\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.data.avatarUrl).toBe(avatarUrl);
    const list = await request(app).get('/api/users').set(bearer(token));
    expect(list.body.data.find((row: { id: string }) => row.id === user.id).avatarUrl).toBe(avatarUrl);

    const image = await request(app).get(publicPath(avatarUrl));
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'user.avatar_updated', userId: user.id } })).toBe(1);
  });

  it('almashtirish va o‘chirish: eski fayl diskdan o‘chadi va eski manzil ishlamaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    const first = (await upload(token, PNG)).body.data.avatarUrl as string;
    const second = (await upload(token, JPEG, 'image/jpeg')).body.data.avatarUrl as string;
    expect(second).not.toBe(first);
    expect(second).toMatch(/\.jpg$/);
    expect(existsSync(resolveStoredPath(storedPath(first)))).toBe(false);
    expect((await request(app).get(publicPath(first))).status).toBe(404);
    expect((await request(app).get(publicPath(second))).status).toBe(200);

    const removed = await request(app).delete('/api/auth/me/avatar').set(bearer(token));
    expect(removed.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).body.data.avatarUrl).toBeNull();
    expect((await request(app).get(publicPath(second))).status).toBe(404);
    expect(existsSync(resolveStoredPath(storedPath(second)))).toBe(false);
    // Takroriy o'chirish — xato emas
    expect((await request(app).delete('/api/auth/me/avatar').set(bearer(token))).status).toBe(200);
  });

  it('rad etiladi: rasm bo‘lmagan fayl (Content-Type soxta bo‘lsa ham), bo‘sh tana, 1 MB dan katta, tokensiz', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await upload(token, PDF, 'image/png')).status).toBe(422);
    expect((await upload(token, Buffer.from('<script>alert(1)</script>'), 'image/jpeg')).status).toBe(422);
    expect((await upload(token, Buffer.alloc(0))).status).toBe(422);
    expect((await upload(token, Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]))).status).toBe(422);
    expect((await request(app).post('/api/auth/me/avatar').set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
    expect((await request(app).delete('/api/auth/me/avatar')).status).toBe(401);
    expect(await prisma.user.count({ where: { avatarPath: { not: null } } })).toBe(0);
  });

  it('har kim faqat o‘z rasmini o‘zgartiradi; kabinet foydalanuvchisi ham rasm qo‘ya oladi', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: student, user: studentUser } = await createUserWithToken(app, { role: 'STUDENT' });
    const adminUrl = (await upload(admin, PNG)).body.data.avatarUrl as string;
    const studentUrl = (await upload(student, PNG)).body.data.avatarUrl as string;
    expect(studentUrl).not.toBe(adminUrl);

    await request(app).delete('/api/auth/me/avatar').set(bearer(student));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: adminUser.id } })).avatarPath).toBe(storedPath(adminUrl));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: studentUser.id } })).avatarPath).toBeNull();
  });

  it('ochiq manzil faqat avatar fayllarini beradi: boshqa saqlangan fayl, yo‘ldan chiqish va noto‘g‘ri shakl — 404', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const avatarUrl = (await upload(token, PNG)).body.data.avatarUrl as string;
    const [, year, month, file] = /avatars\/(\d{4})\/(\d{2})\/(.+)$/.exec(avatarUrl)!;

    // Saqlash papkasida turgan, lekin hech kimning avatari bo'lmagan fayl (masalan chek) — berilmaydi
    await prisma.user.updateMany({ data: { avatarPath: null } });
    expect(existsSync(resolveStoredPath(`${year}/${month}/${file}`))).toBe(true);
    expect((await request(app).get(publicPath(avatarUrl))).status).toBe(404);

    for (const path of [`/api/public/avatars/${year}/${month}/..%2F..%2F.env`, `/api/public/avatars/${year}/${month}/passwd`, `/api/public/avatars/..%2F${year}/${month}/${file}`, `/api/public/avatars/${year}/${month}/${file}.exe`]) {
      expect((await request(app).get(path)).status, path).toBe(404);
    }
  });

  it('o‘chirilgan (arxivlangan) xodimning rasmi berilmaydi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'TEACHER' });
    const avatarUrl = (await upload(token, PNG)).body.data.avatarUrl as string;
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect((await request(app).get(publicPath(avatarUrl))).status).toBe(404);
  });
});
