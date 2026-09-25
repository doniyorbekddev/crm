import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { homeworkService } from '../src/services/homework.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { removeStoredFile } from '../src/utils/fileStorage.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT_ID = 808_001;

/** PNG faylning boshlang'ich baytlari — tur baytlar bo'yicha aniqlanadi */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
/** DOCX (zip) — qo'llanmaydigan tur */
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 2)]);

interface Sent {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function captureBot() {
  const shown: Sent[] = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_chat: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(
    async (_chat: string, _id: number, text: string, keyboard?: InlineKeyboard) => {
      shown.push({ text, keyboard });
      return { ok: true, retryable: false };
    },
  );
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return {
    shown,
    last: () => shown.at(-1)!,
    lastData: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}

function message(text: string, extra: Record<string, unknown> = {}, chatId = CHAT_ID) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Test' }, from: { id: 900 }, text, ...extra } });
}

function press(data: string, chatId = CHAT_ID) {
  return post({ callback_query: { id: 'cb', data, from: { id: 900 }, message: { message_id: 10, chat: { id: chatId } } } });
}

async function seedGamification() {
  await prisma.level.createMany({
    data: [
      { number: 1, name: 'Yangi boshlovchi', minXp: 0 },
      { number: 2, name: 'Izlanuvchi', minXp: 30 },
    ],
  });
  await prisma.xpRule.create({ data: { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasi', source: 'HOMEWORK', points: 20 } });
}

async function createStudent(courseId: string, groupId: string, firstName: string) {
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

/** Vazifa + shu o'quvchi uchun bo'sh topshiriq (CRM'da e'lon qilinganda shunday ochiladi) */
async function createHomework(groupId: string, studentId: string, overrides: { title?: string; deadline?: Date; status?: 'PENDING' | 'GRADED' } = {}) {
  const homework = await prisma.homework.create({
    data: {
      title: overrides.title ?? 'Uy vazifasi 1',
      description: 'Mashqlarni bajaring',
      groupId,
      deadline: overrides.deadline ?? new Date(Date.now() + 3 * 86_400_000),
      status: 'PUBLISHED',
    },
  });
  await prisma.homeworkSubmission.create({
    data: {
      homeworkId: homework.id,
      studentId,
      ...(overrides.status === 'GRADED' ? { status: 'GRADED', score: 90, feedback: 'Yaxshi', submittedAt: new Date(), gradedAt: new Date() } : {}),
    },
  });
  return homework;
}

async function linkedStudent(chatId = CHAT_ID) {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  const student = await createStudent(course.id, group.id, 'Sardor');
  const link = await telegramLinkService.ensureLink({ studentId: student.id });
  await message(`/start ${link.linkCode}`, {}, chatId);
  return { course, group, student };
}

describe.skipIf(!hasTestDatabase)('Telegram — o‘quvchi bo‘limlari', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedGamification();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('profil: ism, kurs, guruh va daraja', async () => {
    const { student, course, group } = await linkedStudent();
    const bot = captureBot();

    await press('st_profile').expect(200);

    const text = bot.last().text;
    expect(text).toContain(student.firstName);
    expect(text).toContain(course.name);
    expect(text).toContain(group.name);
    expect(text).toContain('daraja');
  });

  it('haftalik hisobot: /hisobot joriy haftani ko‘rsatadi, oldingi haftaga o‘tadi, kelajak sanasi qabul qilinmaydi', async () => {
    const { student, group } = await linkedStudent();
    const now = new Date();
    await prisma.attendance.create({
      data: { studentId: student.id, groupId: group.id, date: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`), status: 'PRESENT' },
    });
    const bot = captureBot();

    await message('/hisobot').expect(200);
    expect(bot.last().text).toContain('Haftalik hisobot');
    expect(bot.last().text).toContain(student.firstName);
    const previous = bot.lastData().find((data) => data?.startsWith('st_week:'));
    expect(previous).toMatch(/^st_week:\d{4}-\d{2}-\d{2}$/);

    await press(previous!).expect(200);
    expect(bot.last().text).toContain('Haftalik hisobot');
    // O'tgan haftada "Joriy hafta" tugmasi bor
    expect(bot.lastData()).toContain('st_week');

    // Kelajakdagi yoki buzilgan sana — joriy hafta ko'rsatiladi, xato emas
    await press('st_week:2099-01-05').expect(200);
    await press('st_week:yomon').expect(200);
    expect(bot.last().text).toContain('Haftalik hisobot');
  });

  it('davomat: joriy oy kalendari va oldingi oyga o‘tish', async () => {
    const { student, group } = await linkedStudent();
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3));
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, date: thisMonth, status: 'PRESENT' },
        { studentId: student.id, groupId: group.id, date: new Date(thisMonth.getTime() + 86_400_000), status: 'ABSENT' },
      ],
    });
    const bot = captureBot();

    await message('/davomat').expect(200);
    expect(bot.last().text).toContain('Davomat');
    expect(bot.last().text).toContain('✅');
    expect(bot.last().text).toContain('❌');
    // Kelajak oyga o'tish tugmasi yo'q, orqaga bor
    const nav = bot.lastData();
    expect(nav.some((data) => data.startsWith('st_cal:'))).toBe(true);
    expect(nav.filter((data) => data.startsWith('st_cal:'))).toHaveLength(1);

    const prev = nav.find((data) => data.startsWith('st_cal:'))!;
    await press(prev).expect(200);
    expect(bot.last().text).toContain('Bu oyda davomat yozuvi yo‘q');
  });

  it('vazifalar ro‘yxati: tugmalar va bo‘sh holat', async () => {
    const { student, group } = await linkedStudent();
    const bot = captureBot();

    await press('st_hw').expect(200);
    expect(bot.last().text).toContain('Hozircha uy vazifasi yo‘q');

    const pending = await createHomework(group.id, student.id, { title: 'Algebra' });
    const graded = await createHomework(group.id, student.id, { title: 'Geometriya', status: 'GRADED' });
    await press('st_hw').expect(200);

    expect(bot.last().text).toContain('Topshirilmagan: <b>1</b>');
    const data = bot.lastData();
    expect(data).toContain(`st_hwd:${pending.id}`);
    expect(data).toContain(`st_hwd:${graded.id}`);
    // Topshirilmagani birinchi
    expect(data.indexOf(`st_hwd:${pending.id}`)).toBeLessThan(data.indexOf(`st_hwd:${graded.id}`));
  });

  it('vazifa tafsiloti: topshirish tugmasi faqat baholanmaganda', async () => {
    const { student, group } = await linkedStudent();
    const pending = await createHomework(group.id, student.id, { title: 'Algebra' });
    const graded = await createHomework(group.id, student.id, { title: 'Geometriya', status: 'GRADED' });
    const bot = captureBot();

    await press(`st_hwd:${pending.id}`).expect(200);
    expect(bot.last().text).toContain('Algebra');
    expect(bot.last().text).toContain('Kutilmoqda');
    expect(bot.lastData()).toContain(`st_hws:${pending.id}`);

    await press(`st_hwd:${graded.id}`).expect(200);
    expect(bot.last().text).toContain('90/100');
    expect(bot.last().text).toContain('Yaxshi');
    expect(bot.lastData().some((data) => data.startsWith('st_hws:'))).toBe(false);
  });

  it('matnli javob bilan topshirish: holat, XP va audit', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id);
    const bot = captureBot();

    await press(`st_hws:${homework.id}`).expect(200);
    expect(bot.last().text).toContain('Javobingizni');
    expect(await telegramSessionService.get(String(CHAT_ID))).toMatchObject({ flow: 'hw_submit' });

    await message('Mening javobim: x = 5').expect(200);

    expect(bot.last().text).toContain('Vazifa topshirildi');
    expect(bot.last().text).toContain('+20 XP');
    const saved = await prisma.homeworkSubmission.findUniqueOrThrow({
      where: { homeworkId_studentId: { homeworkId: homework.id, studentId: student.id } },
    });
    expect(saved).toMatchObject({ status: 'SUBMITTED', answerText: 'Mening javobim: x = 5', xpAwarded: 20 });
    expect(saved.submittedAt).not.toBeNull();
    // Oqim yopildi — keyingi matn javob sifatida qabul qilinmaydi
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: 'homework.submitted' } });
    expect(audit?.metadata).toMatchObject({ source: 'telegram', late: false });
  });

  it('muddatdan keyin topshirilsa — LATE va ogohlantirish', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id, { deadline: new Date(Date.now() - 86_400_000) });
    const bot = captureBot();

    await press(`st_hws:${homework.id}`).expect(200);
    await message('Kechikkan javob').expect(200);

    expect(bot.last().text).toContain('Muddatdan keyin');
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(saved.status).toBe('LATE');
  });

  it('rasm bilan topshirish: fayl yuklab olinadi, turi baytlar bo‘yicha tekshiriladi', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id);
    const bot = captureBot();
    const download = vi.spyOn(telegram.telegramService, 'downloadFile').mockResolvedValue({ buffer: PNG });

    await press(`st_hws:${homework.id}`).expect(200);
    await message('', { text: undefined, caption: 'Daftar surati', photo: [{ file_id: 'small', file_size: 10 }, { file_id: 'big', file_size: 900 }] }).expect(200);

    // Eng katta o'lcham olinadi
    expect(download).toHaveBeenCalledWith('big', expect.any(Number));
    expect(bot.last().text).toContain('Vazifa topshirildi');
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(saved.attachmentPath).toMatch(/\.png$/);
    expect(saved.answerText).toBe('Daftar surati');
    await removeStoredFile(saved.attachmentPath!);
  });

  it('qo‘llanmaydigan fayl turi rad etiladi, oqim ochiq qoladi', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id);
    const bot = captureBot();
    vi.spyOn(telegram.telegramService, 'downloadFile').mockResolvedValue({ buffer: DOCX });

    await press(`st_hws:${homework.id}`).expect(200);
    await message('', { text: undefined, document: { file_id: 'doc1', file_name: 'javob.docx', mime_type: 'application/msword' } }).expect(200);

    expect(bot.last().text).toContain('Faqat rasm');
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(saved.status).toBe('PENDING');
    // Foydalanuvchi qaytadan yuborishi mumkin — oqim yopilmagan
    expect(await telegramSessionService.get(String(CHAT_ID))).toMatchObject({ flow: 'hw_submit' });
  });

  it('baholangan vazifa qayta topshirilmaydi', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id, { status: 'GRADED' });
    const bot = captureBot();

    await press(`st_hws:${homework.id}`).expect(200);
    expect(bot.last().text).toContain('topshirib bo‘lmaydi');

    await expect(homeworkService.submitByStudent(student.id, homework.id, { answerText: 'x', source: 'portal' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('begona o‘quvchining vazifasiga yetib bo‘lmaydi', async () => {
    const { student, group } = await linkedStudent();
    const other = await createStudent(student.courseId, group.id, 'Begona');
    const foreign = await createHomework(group.id, other.id, { title: 'Begona vazifa' });
    const bot = captureBot();

    // Callback ichida vazifa id bor, lekin topshiriq yozuvi begona o'quvchiniki
    await press(`st_hwd:${foreign.id}`).expect(200);
    expect(bot.last().text).toContain('Vazifa topilmadi');

    await expect(homeworkService.submitByStudent(student.id, foreign.id, { answerText: 'x', source: 'telegram' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: foreign.id } })).status).toBe('PENDING');
  });

  it('boshqa bo‘limga o‘tilsa topshirish oqimi bekor bo‘ladi', async () => {
    const { student, group } = await linkedStudent();
    const homework = await createHomework(group.id, student.id);
    captureBot();

    await press(`st_hws:${homework.id}`).expect(200);
    await press('st_hw').expect(200);
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();

    // Endi matn javob sifatida emas, oddiy xabar sifatida ishlanadi
    await message('Bu javob emas').expect(200);
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(saved.status).toBe('PENDING');
    expect(saved.answerText).toBeNull();
  });

  it('imtihonlar, XP, sertifikat va to‘lovlar bo‘limlari', async () => {
    const { student, group } = await linkedStudent();
    const exam = await prisma.exam.create({
      data: { title: 'Oraliq', groupId: group.id, date: new Date('2026-09-10'), maxScore: 100, passScore: 60 },
    });
    await prisma.examResult.create({ data: { examId: exam.id, studentId: student.id, score: 85, percentage: 85, grade: 'B' } });
    const bot = captureBot();

    await press('st_ex').expect(200);
    expect(bot.last().text).toContain('Oraliq');
    expect(bot.last().text).toContain('85/100');
    expect(bot.last().text).toContain('✅');

    await message('/xp').expect(200);
    expect(bot.last().text).toContain('XP: 0');
    expect(bot.last().text).toContain('Yangi boshlovchi');

    await press('st_cert').expect(200);
    expect(bot.last().text).toContain('Hozircha sertifikat yo‘q');

    await message('/qarz').expect(200);
    expect(bot.last().text).toContain('Shartnoma');
  });

  it('xodim chatida o‘quvchi bo‘limlari ochilmaydi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(`/start ${link.linkCode}`);
    const bot = captureBot();

    await press('st_hw').expect(200);
    // Bosh menyuga qaytariladi, ma'lumot yo'q
    expect(bot.last().text).toContain('xodim hisobiga');
  });
});

describe.skipIf(!hasTestDatabase)('Kabinet API — vazifa topshirish', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedGamification();
    vi.restoreAllMocks();
  });

  async function studentPortal() {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Kabinet');
    const created = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({ email: 'kabinet@portal.uz' });
    const token = await loginWithTemporaryPassword(app, 'kabinet@portal.uz', created.body.data.temporaryPassword);
    return { token, student, group, admin };
  }

  it('ro‘yxat, matn bilan va fayl bilan topshirish', async () => {
    const { token, student, group } = await studentPortal();
    const homework = await createHomework(group.id, student.id);

    const list = await request(app).get('/api/portal/homework').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ homeworkId: homework.id, status: 'PENDING' });

    const text = await request(app).post(`/api/portal/homework/${homework.id}/submit`).set(bearer(token)).send({ answerText: 'Javob' });
    expect(text.status).toBe(201);
    expect(text.body.data).toMatchObject({ status: 'SUBMITTED', late: false, xpAwarded: 20 });

    const file = await request(app)
      .post(`/api/portal/homework/${homework.id}/attachment`)
      .set(bearer(token))
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', 'daftar.png')
      .send(PNG);
    expect(file.status).toBe(201);
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } });
    expect(saved.attachmentPath).toMatch(/\.png$/);
    expect(saved.answerText).toBe('Javob');
    await removeStoredFile(saved.attachmentPath!);

    const bad = await request(app)
      .post(`/api/portal/homework/${homework.id}/attachment`)
      .set(bearer(token))
      .set('Content-Type', 'application/octet-stream')
      .send(DOCX);
    expect(bad.status).toBe(422);
  });

  it('kalendar, imtihon, XP va to‘lov endpointlari egalik bilan', async () => {
    const { token, student, group, admin } = await studentPortal();
    await prisma.attendance.create({ data: { studentId: student.id, groupId: group.id, date: new Date(), status: 'PRESENT' } });

    const calendar = await request(app).get('/api/portal/attendance/calendar').set(bearer(token));
    expect(calendar.status).toBe(200);
    expect(calendar.body.data.overall.PRESENT).toBe(1);

    expect((await request(app).get('/api/portal/exams').set(bearer(token))).status).toBe(200);
    expect((await request(app).get('/api/portal/gamification').set(bearer(token))).body.data.totalXp).toBe(0);
    const payments = await request(app).get('/api/portal/payments').set(bearer(token));
    expect(payments.body.data.schedule.contractTotal).toBe(1_000_000);

    // Begona o'quvchi so'ralsa — 403; xodim kabinet endpointiga kira olmaydi
    const other = await createStudent(student.courseId, group.id, 'Boshqa');
    expect((await request(app).get(`/api/portal/homework?studentId=${other.id}`).set(bearer(token))).status).toBe(403);
    expect((await request(app).get('/api/portal/homework').set(bearer(admin))).status).toBe(403);
  });
});
