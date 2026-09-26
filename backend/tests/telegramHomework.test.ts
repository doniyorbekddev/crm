import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { homeworkService } from '../src/services/homework.service.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { AppError } from '../src/utils/AppError.js';
import { resolveStoredPath } from '../src/utils/fileStorage.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-07 / §36 va audit S1 — o'qituvchi botdan faylli vazifa beradi */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const CHAT = 73_001;
let phone = 0;

function captureBot() {
  const shown: Array<{ text: string; keyboard: InlineKeyboard | undefined }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  const download = vi.spyOn(telegram.telegramService, 'downloadFile').mockResolvedValue({ buffer: PNG });
  return {
    download,
    last: () => shown.at(-1)!,
    data: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data),
  };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (text: string, chat = CHAT) => post({ message: { message_id: 10, chat: { id: chat, first_name: 'T' }, from: { id: chat }, text } });
const photo = (chat = CHAT) => post({ message: { message_id: 11, chat: { id: chat }, from: { id: chat }, photo: [{ file_id: 'PHOTO', file_size: 100 }] } });
const document = (name: string, chat = CHAT) => post({ message: { message_id: 12, chat: { id: chat }, from: { id: chat }, document: { file_id: 'DOC', file_name: name, file_size: 100 } } });
const press = (data: string, chat = CHAT) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function student(courseId: string, groupId: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: `Oquvchi${phone}`,
      lastName: 'Test',
      phone: `+99899${String(5_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function linkedTeacher(role = 'TEACHER', chat = CHAT) {
  const { user } = await createUserWithToken(app, { role });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: user.id, name: 'Web-7' });
  await student(course.id, group.id);
  await student(course.id, group.id);
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chat);
  return { user, course, group };
}

async function fillUntilFiles(groupId: string) {
  await press(`tc_hw:${groupId}`).expect(200);
  await message('Chizma mashqi').expect(200);
  await message('Rasmdagini chizing').expect(200);
  await message('31.12.2030').expect(200);
}

describe.skipIf(!hasTestDatabase)('Telegram: o‘qituvchi faylli vazifa beradi (GAP-07)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    permissionService.invalidate();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('fayl qabul qilingan zahoti tekshiriladi va CRM xotirasiga saqlanadi; noto‘g‘ri tur rad, 5 ta chegara; e’londa biriktiriladi', async () => {
    const { group } = await linkedTeacher();
    const bot = captureBot();
    await fillUntilFiles(group.id);
    expect(bot.last().text).toContain('fayl yoki rasm');

    // Matn fayli (tur baytlar bo'yicha) — qabul paytida rad
    bot.download.mockResolvedValueOnce({ buffer: Buffer.from('oddiy matn fayli') });
    await document('javob.docx').expect(200);
    expect(bot.last().text).toContain('Faqat rasm (JPG, PNG, WEBP) yoki PDF');

    for (let index = 1; index <= 5; index += 1) {
      await photo().expect(200);
      expect(bot.last().text).toContain(`Fayl qabul qilindi (${index}/5)`);
    }
    await photo().expect(200);
    expect(bot.last().text).toContain('Ko‘pi bilan 5 ta');

    // Sessiyada Telegram file_id emas — CRM xotirasidagi yo'l
    const session = await prisma.telegramSession.findFirstOrThrow({ where: { chatId: String(CHAT) } });
    const files = (session.data as { files: Array<{ storagePath: string }> }).files;
    expect(files).toHaveLength(5);
    expect(JSON.stringify(session.data)).not.toContain('PHOTO');
    for (const file of files) expect(existsSync(resolveStoredPath(file.storagePath))).toBe(true);

    await press('tc_hwnext').expect(200);
    expect(bot.last().text).toContain('E’lon qilinsinmi');
    await press('tc_hwok').expect(200);
    expect(bot.last().text).toContain('5 ta fayl biriktirildi');

    const homework = await prisma.homework.findFirstOrThrow({ include: { attachments: true, submissions: true } });
    expect(homework).toMatchObject({ status: 'PUBLISHED', title: 'Chizma mashqi', description: 'Rasmdagini chizing' });
    expect(homework.attachments).toHaveLength(5);
    expect(homework.attachments.every((row) => row.kind === 'FILE' && row.mimeType === 'image/png')).toBe(true);
    expect(homework.submissions).toHaveLength(2);
  });

  it('fayl biriktirishda xato — vazifa qoralamada qoladi, o‘quvchilarga ochilmaydi', async () => {
    const { group } = await linkedTeacher();
    const bot = captureBot();
    await fillUntilFiles(group.id);
    await photo().expect(200);
    await press('tc_hwnext').expect(200);
    vi.spyOn(homeworkService, 'attachStoredFile').mockRejectedValueOnce(AppError.unprocessable('Fayl topilmadi'));
    await press('tc_hwok').expect(200);
    expect(bot.last().text).toContain('qoralama');

    const homework = await prisma.homework.findFirstOrThrow({ include: { submissions: true } });
    expect(homework.status).toBe('DRAFT');
    expect(homework.submissions).toHaveLength(0);
  });

  it('S1: homework.manage yo‘q xodim (guruhga biriktirilgan bo‘lsa ham) vazifa bera olmaydi, tugma ham ko‘rinmaydi', async () => {
    // Faqat davomat va guruhni ko'radigan rol — REST'da POST /homework 403
    const role = await prisma.role.create({ data: { key: 'ASSISTANT_T', name: 'Yordamchi', isSystem: false } });
    const permissions = await prisma.permission.findMany({ where: { key: { in: [PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.GROUP_VIEW, PERMISSIONS.STUDENT_VIEW] } } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    const { group } = await linkedTeacher('ASSISTANT_T');
    const bot = captureBot();

    await press(`tc_group:${group.id}`).expect(200);
    expect(bot.data().some((data) => data.startsWith('tc_hw:'))).toBe(false);

    await press(`tc_hw:${group.id}`).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    await press('tc_hwok').expect(200);
    expect(await prisma.homework.count()).toBe(0);
  });

  it('ruxsat oqim davomida olib qo‘yilsa — keyingi qadamda to‘xtaydi; begona guruhga vazifa berib bo‘lmaydi', async () => {
    const { user, group, course } = await linkedTeacher();
    const bot = captureBot();
    await fillUntilFiles(group.id);

    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { key: 'TEACHER' } });
    const manage = await prisma.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.HOMEWORK_MANAGE } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: manage.id } } });
    permissionService.invalidate();
    await press('tc_hwnext').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    expect(await prisma.homework.count()).toBe(0);

    // Ruxsat qaytariladi — boshqa o'qituvchining guruhi
    await prisma.rolePermission.create({ data: { roleId: teacherRole.id, permissionId: manage.id } });
    permissionService.invalidate();
    const { user: other } = await createUserWithToken(app, { role: 'TEACHER' });
    const foreign = await createGroup({ courseId: course.id, teacherId: other.id, name: 'Begona' });
    expect(user.id).not.toBe(other.id);
    await press(`tc_hw:${foreign.id}`).expect(200);
    expect(bot.last().text).toContain('topilmadi');
    expect(await prisma.homework.count()).toBe(0);
  });
});
