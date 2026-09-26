import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { formatPaymentNumber } from '../src/config/paymentLabels.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { moneyUz } from '../src/telegram/format.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-14 + audit S2/S3 — Telegram qidiruvi va §34 matritsasi:
 * Student A → Student B, Parent A → Child B, Teacher A → Group B, Manager A → Lead B, Branch A → Branch B — hammasi rad.
 */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
let phone = 0;
let chat = 82_000;

function captureBot() {
  const shown: string[] = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, _k?: InlineKeyboard) => {
    shown.push(text);
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string) => {
    shown.push(text);
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return { last: () => shown.at(-1)! };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (id: number, text: string) => post({ message: { message_id: 10, chat: { id, first_name: 'S' }, from: { id }, text } });
const press = (id: number, data: string) => post({ callback_query: { id: 'cb', data, from: { id }, message: { message_id: 10, chat: { id } } } });

async function link(target: { userId?: string; studentId?: string; parentId?: string }): Promise<number> {
  chat += 1;
  const row = await telegramLinkService.ensureLink(target);
  await message(chat, `/start ${row.linkCode}`);
  return chat;
}

/** Botda qidiradi: tugma → so'rov; oxirgi javob matni */
async function botSearch(bot: ReturnType<typeof captureBot>, id: number, query: string): Promise<string> {
  await press(id, 'ws_sr').expect(200);
  await message(id, query).expect(200);
  return bot.last();
}

async function student(courseId: string, groupId: string, firstName: string, branchId = 'branch_main') {
  phone += 1;
  return prisma.student.create({
    data: { firstName, lastName: 'Qidiruv', phone: `+99886${String(4_000_000 + phone).slice(-7)}`, courseId, groupId, contractPrice: 1_000_000, startDate: new Date('2026-06-01'), branchId },
  });
}

async function world() {
  const branchB = await prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor' } });
  const { user: teacherA, token: teacherAToken } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Ustoz', lastName: 'A' });
  const { user: teacherB } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Ustoz', lastName: 'B' });
  const course = await createCourse('Python');
  const groupA = await createGroup({ courseId: course.id, teacherId: teacherA.id, name: 'Alfa-Guruh' });
  const groupB = await createGroup({ courseId: course.id, teacherId: teacherB.id, name: 'Beta-Guruh' });
  await prisma.group.update({ where: { id: groupB.id }, data: { branchId: branchB.id } });
  const studentA = await student(course.id, groupA.id, 'Anvar');
  const studentB = await student(course.id, groupB.id, 'Botir', branchB.id);
  await prisma.homework.create({ data: { title: 'Alfa loyiha', groupId: groupA.id, deadline: new Date(Date.now() + 86_400_000), maxPoints: 100, status: 'PUBLISHED', submissions: { create: { studentId: studentA.id } } } });
  await prisma.homework.create({ data: { title: 'Beta loyiha', groupId: groupB.id, deadline: new Date(Date.now() + 86_400_000), maxPoints: 100, status: 'PUBLISHED', submissions: { create: { studentId: studentB.id } } } });
  const paymentA = await prisma.payment.create({ data: { studentId: studentA.id, courseId: course.id, amount: 500_000, method: 'CASH' } });
  const paymentB = await prisma.payment.create({ data: { studentId: studentB.id, courseId: course.id, amount: 700_000, method: 'CASH', branchId: branchB.id } });
  const certificate = (id: string, name: string, token: string) =>
    prisma.certificate.create({ data: { studentId: id, studentName: `${name} Qidiruv`, courseName: 'Python', verifyToken: token, startDate: new Date('2026-01-01'), completionDate: new Date('2026-06-01') } });
  await certificate(studentA.id, 'Anvar', 'tok-a-0000000000000000');
  await certificate(studentB.id, 'Botir', 'tok-b-0000000000000000');
  return { branchB, teacherA, teacherAToken, course, groupA, groupB, studentA, studentB, paymentA, paymentB };
}

describe.skipIf(!hasTestDatabase)('Telegram qidiruvi va §34 matritsasi (GAP-14, S2, S3)', () => {
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

  it('Student A → Student B: o‘quvchi faqat o‘z vazifasi va to‘lovini topadi', async () => {
    const { studentA, paymentA, paymentB } = await world();
    const id = await link({ studentId: studentA.id });
    const bot = captureBot();
    await message(id, '/start').expect(200);

    expect(await botSearch(bot, id, 'loyiha')).toContain('Alfa loyiha');
    expect(bot.last()).not.toContain('Beta loyiha');
    expect(await botSearch(bot, id, formatPaymentNumber(paymentA.number))).toContain(moneyUz(500_000));
    expect(await botSearch(bot, id, formatPaymentNumber(paymentB.number))).toContain('hech narsa topilmadi');
    expect(await botSearch(bot, id, 'Botir')).toContain('hech narsa topilmadi');
    // Oqim ochiq — keyingi so'rov darhol
    await message(id, 'Python').expect(200);
    expect(bot.last()).toContain('Sertifikatlar');
    expect(bot.last()).toContain('Python');
  });

  it('Parent A → Child B: ota-ona faqat o‘z farzandi ma’lumotini topadi', async () => {
    const { studentA, studentB } = await world();
    const parent = await prisma.parent.create({ data: { firstName: 'Ota', lastName: 'A', phone: '+998901234000' } });
    await prisma.studentParent.create({ data: { studentId: studentA.id, parentId: parent.id } });
    const id = await link({ parentId: parent.id });
    const bot = captureBot();
    const text = await botSearch(bot, id, 'loyiha');
    expect(text).toContain('Alfa loyiha');
    expect(text).not.toContain('Beta loyiha');
    expect(await botSearch(bot, id, 'Botir')).toContain('hech narsa topilmadi');
    expect(studentB.id).not.toBe(studentA.id);
  });

  it('Teacher A → Group B (S2): o‘qituvchi begona guruh, o‘quvchi va sertifikatni topmaydi — web qidiruvida ham', async () => {
    const { teacherA, teacherAToken } = await world();
    const id = await link({ userId: teacherA.id });
    const bot = captureBot();
    const own = await botSearch(bot, id, 'Guruh');
    expect(own).toContain('Alfa-Guruh');
    expect(own).not.toContain('Beta-Guruh');
    const certificates = await botSearch(bot, id, 'Qidiruv');
    expect(certificates).toContain('Anvar');
    expect(certificates).not.toContain('Botir');

    const web = (await request(app).get('/api/search').query({ q: 'Beta' }).set(bearer(teacherAToken)).expect(200)).body.data;
    expect(web.total).toBe(0);
  });

  it('Manager A → Lead B: sotuv menejeri boshqa menejerning leadini topmaydi; to‘lov bo‘limi yo‘q', async () => {
    await world();
    const { user: managerA } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: managerB } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const source = await createSource('Instagram');
    const own = await createLead({ sourceId: source.id, phone: '+998935550001' });
    await prisma.lead.update({ where: { id: own.id }, data: { firstName: 'Mijoz', lastName: 'Birinchi', assignedToId: managerA.id } });
    const foreign = await createLead({ sourceId: source.id, phone: '+998935550002' });
    await prisma.lead.update({ where: { id: foreign.id }, data: { firstName: 'Mijoz', lastName: 'Ikkinchi', assignedToId: managerB.id } });
    const id = await link({ userId: managerA.id });
    const bot = captureBot();
    const text = await botSearch(bot, id, 'Mijoz');
    expect(text).toContain('Birinchi');
    expect(text).not.toContain('Ikkinchi');
    expect(await botSearch(bot, id, 'Anvar')).not.toContain('To‘lovlar');
  });

  it('Branch A → Branch B (S3): filialga bog‘langan admin boshqa filial o‘quvchi, guruh, to‘lov, sertifikatini topmaydi; direktor topadi', async () => {
    const { paymentB } = await world();
    const { user: admin, token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const id = await link({ userId: admin.id });
    const bot = captureBot();
    for (const query of ['Botir', 'Beta-Guruh', formatPaymentNumber(paymentB.number), 'Beta loyiha']) {
      expect(await botSearch(bot, id, query), query).toContain('hech narsa topilmadi');
    }
    expect(await botSearch(bot, id, 'Anvar')).toContain('Anvar');
    // Web global qidiruv — xuddi shunday
    expect((await request(app).get('/api/search').query({ q: 'Botir' }).set(bearer(adminToken)).expect(200)).body.data.total).toBe(0);

    const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const ownerChat = await link({ userId: owner.id });
    const all = await botSearch(bot, ownerChat, 'Botir');
    expect(all).toContain('O‘quvchilar');
    expect(all).toContain('To‘lovlar');
    expect(all).toContain('Sertifikatlar');
  });

  it('to‘lov o‘quvchi ismi bo‘yicha ham topiladi (buxgalter), kvitansiya raqami — avvalgidek', async () => {
    const { paymentA } = await world();
    const { user: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const id = await link({ userId: accountant.id });
    const bot = captureBot();
    const text = await botSearch(bot, id, 'Anvar');
    expect(text).toContain('To‘lovlar');
    expect(text).toContain(formatPaymentNumber(paymentA.number));
    expect(await botSearch(bot, id, formatPaymentNumber(paymentA.number))).toContain(moneyUz(500_000));
  });
});
