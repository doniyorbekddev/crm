import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-10 — rahbar botda o'qituvchilar KPI ni ko'radi (raqamlar web akademik analitika bilan bir xil) */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT = 75_001;
const DAY = 86_400_000;
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
  return { last: () => shown.at(-1)!, data: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data) };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (text: string, chat = CHAT) => post({ message: { message_id: 10, chat: { id: chat, first_name: 'S' }, from: { id: chat }, text } });
const press = (data: string, chat = CHAT) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function linkChat(userId: string, chat = CHAT) {
  const link = await telegramLinkService.ensureLink({ userId });
  await message(`/start ${link.linkCode}`, chat);
}

async function student(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({
    data: { firstName: name, lastName: 'Kpi', phone: `+99888${String(1_000_000 + phone).slice(-7)}`, courseId, groupId, contractPrice: 1_000_000, startDate: new Date('2026-01-01') },
  });
}

async function mark(groupId: string, studentId: string, daysAgo: number, status: 'PRESENT' | 'ABSENT') {
  await prisma.attendance.create({ data: { studentId, groupId, date: dateColumn(new Date(Date.now() - daysAgo * DAY)), status } });
}

describe.skipIf(!hasTestDatabase)('Telegram: o‘qituvchi KPI (GAP-10)', () => {
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

  async function setup() {
    const { user: teacherA } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Aziz', lastName: 'Karimov' });
    const { user: teacherB } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Bobur', lastName: 'Rahimov' });
    const course = await createCourse('Frontend');
    const groupA = await createGroup({ courseId: course.id, teacherId: teacherA.id, name: 'Front-A' });
    const groupB = await createGroup({ courseId: course.id, teacherId: teacherB.id, name: 'Front-B' });
    const a1 = await student(course.id, groupA.id, 'Ali');
    const a2 = await student(course.id, groupA.id, 'Vali');
    const b1 = await student(course.id, groupB.id, 'Sami');
    for (const days of [2, 4]) {
      await mark(groupA.id, a1.id, days, 'PRESENT');
      await mark(groupA.id, a2.id, days, days === 2 ? 'ABSENT' : 'PRESENT');
      await mark(groupB.id, b1.id, days, 'PRESENT');
    }
    const homework = await prisma.homework.create({ data: { title: 'Grid', groupId: groupA.id, deadline: new Date(Date.now() - DAY), maxPoints: 100, status: 'PUBLISHED' } });
    await prisma.homeworkSubmission.createMany({ data: [{ homeworkId: homework.id, studentId: a1.id, status: 'GRADED', score: 80 }, { homeworkId: homework.id, studentId: a2.id, status: 'MISSED' }] });
    await prisma.feedback.create({ data: { studentId: a1.id, teacherId: teacherA.id, groupId: groupA.id, rating: 4, type: 'TEACHER' } });
    return { teacherA, teacherB };
  }

  it('rahbar: o‘qituvchilar ro‘yxati va tafsilot — raqamlar REST akademik analitika bilan bir xil', async () => {
    const { teacherA, teacherB } = await setup();
    const { user: owner, token } = await createUserWithToken(app, { role: 'OWNER' });
    await linkChat(owner.id);
    const bot = captureBot();
    const rest = (await request(app).get('/api/analytics/academic').query({ dimension: 'teacher' }).set(bearer(token)).expect(200)).body.data;
    const restA = rest.rows.find((row: { key: string }) => row.key === teacherA.id);
    expect(restA).toMatchObject({ students: 2, attendanceRate: 75, homeworkRate: 50 });

    await press('ws_kpi').expect(200);
    expect(bot.last().text).toContain('O‘qituvchilar KPI');
    expect(bot.last().text).toContain('Aziz');
    expect(bot.last().text).toContain('Bobur');
    expect(bot.last().text).toContain('1 guruh · 2 o‘quvchi');
    expect(bot.last().text).toContain(`Davomat ${restA.attendanceRate}%`);
    expect(bot.data()).toEqual(expect.arrayContaining([`ws_kt:${teacherA.id}`, `ws_kt:${teacherB.id}`]));

    await press(`ws_kt:${teacherA.id}`).expect(200);
    const detail = bot.last().text;
    expect(detail).toContain('Aziz');
    expect(detail).toContain('Guruhlar: <b>1</b> · o‘quvchilar: <b>2</b>');
    expect(detail).toContain(`Davomat: <b>${restA.attendanceRate}%</b>`);
    expect(detail).toContain(`Vazifa bajarilishi: <b>${restA.homeworkRate}%</b>`);
    expect(detail).toContain('Fikr-mulohaza: <b>4.0/5</b>');
    expect(detail).toContain('Front-A');
    expect(detail).not.toContain('Front-B');
    expect(bot.data()).toContain('ws_kpi');
  });

  it('o‘qituvchi: faqat o‘z guruhlari, boshqa o‘qituvchi KPI si — rad', async () => {
    const { teacherA, teacherB } = await setup();
    await linkChat(teacherA.id);
    const bot = captureBot();

    await press('ws_kpi').expect(200);
    expect(bot.last().text).toContain('Front-A');
    expect(bot.last().text).not.toContain('Front-B');
    expect(bot.data().some((data) => data?.startsWith('ws_kt:'))).toBe(false);

    await press(`ws_kt:${teacherB.id}`).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    expect(bot.last().text).not.toContain('Front-B');
  });

  it('buxgalter va sotuv: KPI ham, o‘qituvchi tafsiloti ham — rad', async () => {
    const { teacherA } = await setup();
    for (const [index, role] of ['ACCOUNTANT', 'SALES_MANAGER'].entries()) {
      const chat = CHAT + 10 + index;
      const { user } = await createUserWithToken(app, { role });
      await linkChat(user.id, chat);
      const bot = captureBot();
      await press('ws_kpi', chat).expect(200);
      expect(bot.last().text).toContain('ruxsatingiz yo‘q');
      await press(`ws_kt:${teacherA.id}`, chat).expect(200);
      expect(bot.last().text).toContain('ruxsatingiz yo‘q');
      expect(bot.last().text).not.toContain('Front-A');
    }
  });
});
