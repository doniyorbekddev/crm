import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-06 / §35 — Telegramdan onlayn imtihon: tafsilot, tasdiq, navigatsiya, server taymeri, har callbackda tekshiruv */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let phone = 0;

interface Sent {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function captureBot() {
  const shown: Sent[] = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  vi.spyOn(telegram.telegramService, 'downloadFile').mockResolvedValue({ buffer: PNG });
  return {
    last: () => shown.at(-1)!,
    buttons: () => (shown.at(-1)!.keyboard ?? []).flat(),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}
function message(chatId: number, text: string) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Test' }, from: { id: chatId }, text } });
}
function photo(chatId: number) {
  return post({ message: { message_id: 11, chat: { id: chatId }, from: { id: chatId }, photo: [{ file_id: 'PHOTO_FILE_ID', file_size: 100 }] } });
}
function press(chatId: number, data: string) {
  return post({ callback_query: { id: 'cb', data, from: { id: chatId }, message: { message_id: 10, chat: { id: chatId } } } });
}

async function createStudent(courseId: string, groupId: string, firstName: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Test',
      phone: `+99897${String(4_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function link(target: { studentId: string } | { parentId: string }, chatId: number) {
  const created = await telegramLinkService.ensureLink(target);
  await message(chatId, `/start ${created.linkCode}`);
}

async function setup() {
  const { token } = await createUserWithToken(app, { role: 'ADMIN' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  const student = await createStudent(course.id, group.id, 'Imtihonchi');
  const multi = (
    await request(app)
      .post('/api/questions')
      .set(bearer(token))
      .send({ courseId: course.id, type: 'MULTIPLE_CHOICE', text: 'Juft sonlar?', options: [{ text: 'Ikki', isCorrect: true }, { text: 'Tort', isCorrect: true }, { text: 'Uch' }] })
  ).body.data;
  const file = (await request(app).post('/api/questions').set(bearer(token)).send({ courseId: course.id, type: 'FILE_UPLOAD', text: 'Chizmani yuklang' })).body.data;
  const exam = (await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Bot imtihoni', groupId: group.id, date: '2026-10-01', isOnline: true, durationMinutes: 30, maxAttempts: 1 })).body.data;
  await request(app).post(`/api/exams/${exam.id}/questions`).set(bearer(token)).send({ questionIds: [multi.id, file.id] }).expect(200);
  return { token, course, group, student, exam: exam as { id: string } };
}

async function openExam(chatId: number, examId: string) {
  await press(chatId, `ex_info:${examId}`).expect(200);
  await press(chatId, `ex_start:${examId}`).expect(200);
  await press(chatId, `ex_go:${examId}`).expect(200);
}

describe.skipIf(!hasTestDatabase)('Telegram onlayn imtihon (GAP-06)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tafsilot → tasdiq → savol; ⬅️/➡️, 💾, 🏁; ko‘p javobli tanlov; fayl javob CRM xotirasiga; natija kabinetda ham', async () => {
    const { student, exam } = await setup();
    await link({ studentId: student.id }, 72_001);
    const bot = captureBot();

    await press(72_001, `ex_info:${exam.id}`).expect(200);
    expect(bot.last().text).toContain('Vaqt: <b>30 daqiqa</b>');
    expect(bot.last().text).toContain('Urinishlar: <b>0/1</b>');
    await press(72_001, `ex_start:${exam.id}`).expect(200);
    expect(bot.last().text).toContain('30 daqiqa</b> vaqt ketadi');
    await press(72_001, `ex_go:${exam.id}`).expect(200);
    expect(bot.last().text).toMatch(/daqiqa qoldi/);
    const labels = bot.buttons().map((button) => button.text);
    expect(labels).toEqual(expect.arrayContaining(['➡️ Keyingi', '💾 Saqlash', '🏁 Tugatish']));
    expect(labels).not.toContain('⬅️ Oldingi');

    // Ko'p javobli savol: ikki variant tanlanadi, sahifa shu savolda qoladi
    const questionIndex = bot.last().text.includes('Juft sonlar?') ? 0 : 1;
    if (questionIndex !== 0) await press(72_001, 'ex_q:1').expect(200);
    const optionIndex = (text: string) => bot.buttons().findIndex((button) => button.text.endsWith(` ${text}`));
    await press(72_001, `ex_a:${questionIndex}:${optionIndex('Ikki')}`).expect(200);
    await press(72_001, `ex_a:${questionIndex}:${optionIndex('Tort')}`).expect(200);
    expect(bot.buttons().filter((button) => button.text.startsWith('✅')).length).toBe(2);
    await press(72_001, 'ex_save').expect(200);
    expect(bot.last().text).toContain('💾 Saqlangan: 1/2 javob');

    // Fayl savoliga o'tib, rasm yuboriladi
    const fileIndex = questionIndex === 0 ? 1 : 0;
    await press(72_001, `ex_q:${fileIndex}`).expect(200);
    expect(bot.last().text).toContain('Chizmani yuklang');
    await photo(72_001).expect(200);
    const saved = await prisma.examAnswer.findFirstOrThrow({ where: { attempt: { examId: exam.id }, filePath: { not: null } } });
    expect(saved.filePath).toMatch(/\.png$/);

    await press(72_001, 'ex_sub').expect(200);
    await press(72_001, 'ex_subok').expect(200);
    expect(bot.last().text).toContain('topshirildi');

    // §35: CRM natija va web (kabinet) bitta urinish
    const attempt = await prisma.examAttempt.findFirstOrThrow({ where: { examId: exam.id, studentId: student.id } });
    expect(attempt.status).toBe('NEEDS_REVIEW');
    expect(await prisma.examAttempt.count({ where: { examId: exam.id } })).toBe(1);
  });

  it('taymer serverda: vaqt o‘tgan urinish keyingi callbackda avtomatik yakunlanadi, javob qabul qilinmaydi', async () => {
    const { student, exam } = await setup();
    await link({ studentId: student.id }, 72_002);
    const bot = captureBot();
    await openExam(72_002, exam.id);
    const attempt = await prisma.examAttempt.findFirstOrThrow({ where: { examId: exam.id } });
    // Mijoz vaqtiga ishonilmaydi — boshlanish 31 daqiqa oldinga suriladi (server holati)
    await prisma.examAttempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(Date.now() - 31 * 60_000) } });

    await press(72_002, 'ex_a:0:0').expect(200);
    expect(bot.last().text).toContain('topshirildi');
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).not.toBe('IN_PROGRESS');
    // Yakunlashda javobsiz savollar 0 ball bilan yoziladi — bosilgan variant saqlanmagan
    const answers = await prisma.examAnswer.findMany({ where: { attemptId: attempt.id }, select: { optionIds: true, score: true } });
    expect(answers.every((answer) => answer.optionIds.length === 0 && answer.score === 0)).toBe(true);
  });

  it('har callbackda qayta tekshiruv: imtihon bekor qilinsa yoki o‘quvchi faol bo‘lmasa javob va topshirish rad etiladi', async () => {
    const { student, exam } = await setup();
    await link({ studentId: student.id }, 72_003);
    const bot = captureBot();
    await openExam(72_003, exam.id);
    const attempt = await prisma.examAttempt.findFirstOrThrow({ where: { examId: exam.id } });

    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'CANCELLED' } });
    await press(72_003, 'ex_a:0:0').expect(200);
    expect(bot.last().text).toContain('Imtihon yopilgan yoki bekor qilingan');
    await press(72_003, 'ex_subok').expect(200);
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe('IN_PROGRESS');

    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'PLANNED' } });
    await prisma.student.update({ where: { id: student.id }, data: { status: 'FROZEN' } });
    await press(72_003, `ex_q:0`).expect(200);
    await press(72_003, 'ex_a:0:0').expect(200);
    expect(bot.last().text).toContain('O‘quvchi faol emas');
    expect(await prisma.examAnswer.count({ where: { attemptId: attempt.id } })).toBe(0);
  });

  it('begona guruh imtihoni va ota-ona: urinish ochilmaydi; soxta callback indeksi hech narsa saqlamaydi', async () => {
    const { token, course, student } = await setup();
    const otherGroup = await createGroup({ courseId: course.id });
    const foreign = (await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Begona', groupId: otherGroup.id, date: '2026-10-01', isOnline: true })).body.data as { id: string };
    await link({ studentId: student.id }, 72_004);
    const bot = captureBot();

    await press(72_004, `ex_info:${foreign.id}`).expect(200);
    expect(bot.last().text).toContain('topilmadi');
    await press(72_004, `ex_go:${foreign.id}`).expect(200);
    expect(await prisma.examAttempt.count({ where: { examId: foreign.id } })).toBe(0);

    // Sessiyasiz soxta javob — urinish yo'q, hech narsa yozilmaydi
    await press(72_004, 'ex_a:0:5').expect(200);
    expect(await prisma.examAnswer.count()).toBe(0);

    // Ota-ona farzand imtihonini boshlay olmaydi
    const parent = await prisma.parent.create({ data: { firstName: 'Ona', lastName: 'Test', phone: '+998977770001', students: { create: { studentId: student.id, relation: 'MOTHER' } } } });
    const exam = await prisma.exam.findFirstOrThrow({ where: { title: 'Bot imtihoni' } });
    await link({ parentId: parent.id }, 72_005);
    await press(72_005, `ex_go:${exam.id}`).expect(200);
    expect(await prisma.examAttempt.count({ where: { examId: exam.id } })).toBe(0);
  });
});
