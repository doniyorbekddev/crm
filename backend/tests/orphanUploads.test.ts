import { access } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { homeworkService } from '../src/services/homework.service.js';
import { PENDING_UPLOAD_KIND, pendingUploadService } from '../src/services/pendingUpload.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { AuthUser } from '../src/types/auth.js';
import { resolveStoredPath, saveFile } from '../src/utils/fileStorage.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 PHASE 21 — yetim fayllar: bog'lanmagan yuklama kuzatiladi, bog'langanda kuzatuvdan chiqadi,
 * 24 soatdan keyin ham bog'lanmagani diskdan o'chiriladi; ishlatilayotgan fayl hech qachon o'chirilmaydi.
 */
const app = createApp();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const LATER = () => new Date(Date.now() + 25 * 60 * 60_000);
const CLIENT = { ip: null, userAgent: null };

const exists = async (relative: string) =>
  access(resolveStoredPath(relative)).then(
    () => true,
    () => false,
  );

const upload = (token: string) =>
  request(app).post('/api/telegram/broadcasts/media').set(bearer(token)).set('Content-Type', 'application/octet-stream').set('X-File-Name', 'afisha.png').send(PNG);

async function pathOfLatestPending(): Promise<string> {
  return (await prisma.pendingUpload.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).path;
}

async function authUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roleId: user.roleId, roleKey: user.role.key, branchId: user.branchId };
}

describe.skipIf(!hasTestDatabase)('Yetim fayllarni tozalash (PHASE 21)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('broadcast media: yuklanganda kuzatiladi, yuborilganda chiqadi; yuborilmagani 24 soatdan keyin o‘chadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    vi.spyOn(telegram.telegramService, 'sendMessage').mockResolvedValue({ ok: true, retryable: false });

    // 1) Yuborilgan media
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, name: 'Yetim guruh' });
    const student = await prisma.student.create({
      data: { firstName: 'Olim', lastName: 'Y', phone: '+998917770001', courseId: course.id, groupId: group.id, contractPrice: 1, startDate: new Date('2026-06-01') },
    });
    await prisma.telegramLink.create({ data: { studentId: student.id, linkCode: `orph-${Date.now()}`, chatId: '77001', verifiedAt: new Date() } });
    const used = await upload(token).expect(201);
    const usedPath = await pathOfLatestPending();
    expect((await prisma.pendingUpload.findUniqueOrThrow({ where: { path: usedPath } })).kind).toBe(PENDING_UPLOAD_KIND.BROADCAST_MEDIA);
    await request(app)
      .post('/api/telegram/broadcasts')
      .set(bearer(token))
      .send({ audience: 'GROUP', targetId: group.id, message: 'Salom', mediaToken: used.body.data.token })
      .expect(200);
    expect(await prisma.pendingUpload.count({ where: { path: usedPath } })).toBe(0);

    // 2) Yuklangan, lekin yuborilmagan media
    await upload(token).expect(201);
    const abandoned = await pathOfLatestPending();
    expect(abandoned).not.toBe(usedPath);
    expect(await exists(abandoned)).toBe(true);

    // Hali 24 soat o'tmagan — tegilmaydi
    expect(await pendingUploadService.sweep(new Date())).toEqual({ removed: 0, kept: 0, failed: 0 });
    expect(await exists(abandoned)).toBe(true);

    const result = await pendingUploadService.sweep(LATER());
    expect(result).toEqual({ removed: 1, kept: 0, failed: 0 });
    expect(await exists(abandoned)).toBe(false);
    expect(await exists(usedPath)).toBe(true);
    expect(await prisma.pendingUpload.count()).toBe(0);
  });

  it('bot vazifa fayli: oldindan saqlanganda kuzatiladi, biriktirilganda chiqadi; tashlab ketilgani o‘chadi', async () => {
    const { user } = await createUserWithToken(app, { role: 'OWNER' });
    const actor = await authUser(user.id);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, name: 'Vazifa guruh' });
    const homework = await prisma.homework.create({ data: { title: 'Grid', groupId: group.id, deadline: new Date('2030-01-10'), status: 'DRAFT' } });

    const attached = await homeworkService.prepareAttachment({ buffer: PNG, fileName: 'topshiriq.png' });
    const dropped = await homeworkService.prepareAttachment({ buffer: PNG, fileName: 'qoralama.png' });
    expect(await prisma.pendingUpload.count({ where: { kind: PENDING_UPLOAD_KIND.HOMEWORK_ATTACHMENT } })).toBe(2);

    await homeworkService.attachStoredFile(actor, homework.id, attached, undefined, CLIENT);
    expect(await prisma.pendingUpload.findUnique({ where: { path: attached.storagePath } })).toBeNull();

    expect(await pendingUploadService.sweep(LATER())).toEqual({ removed: 1, kept: 0, failed: 0 });
    expect(await exists(dropped.storagePath)).toBe(false);
    expect(await exists(attached.storagePath)).toBe(true);
  });

  it('ishlatilayotgan fayl eskirgan yozuvga qaramay o‘chirilmaydi (faqat yozuv)', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, name: 'Himoya guruh' });
    const homework = await prisma.homework.create({ data: { title: 'Flex', groupId: group.id, deadline: new Date('2030-01-10') } });
    const path = await saveFile(PNG, 'png');
    await prisma.homeworkAttachment.create({ data: { homeworkId: homework.id, kind: 'FILE', title: 'fayl', storagePath: path } });
    // Masalan, jarayon bog'lash va chiqarish orasida to'xtagan
    await pendingUploadService.track(path, PENDING_UPLOAD_KIND.HOMEWORK_ATTACHMENT);

    expect(await pendingUploadService.sweep(LATER())).toEqual({ removed: 0, kept: 1, failed: 0 });
    expect(await exists(path)).toBe(true);
    expect(await prisma.pendingUpload.count()).toBe(0);
  });

  it('boshqa tur ustunidagi moslik hisobga olinmaydi; noma’lum tur — o‘chirilmaydi', async () => {
    const broadcastPath = await saveFile(PNG, 'png');
    await pendingUploadService.track(broadcastPath, PENDING_UPLOAD_KIND.BROADCAST_MEDIA);
    const unknownPath = await saveFile(PNG, 'png');
    await prisma.pendingUpload.create({ data: { path: unknownPath, kind: 'legacy' } });

    expect(await pendingUploadService.sweep(LATER())).toEqual({ removed: 1, kept: 1, failed: 0 });
    expect(await exists(broadcastPath)).toBe(false);
    expect(await exists(unknownPath)).toBe(true);
  });
});
