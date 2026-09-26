import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { localDayAt } from '../src/telegram/format.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createSource } from './helpers/fixtures.js';

/** TZ 3.1 GAP-08 / §37 va audit S1 — sotuv menejeri botdan qo'ng'iroq yozadi */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT = 74_001;

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

async function linked(role: string, chat = CHAT) {
  const { user } = await createUserWithToken(app, { role });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chat);
  return user;
}

async function lead(assignedToId: string | null) {
  const source = (await prisma.source.findFirst()) ?? (await createSource('Instagram'));
  return prisma.lead.create({ data: { firstName: 'Nodir', phone: `+99890${String(Date.now()).slice(-7)}`, sourceId: source.id, assignedToId } });
}

describe.skipIf(!hasTestDatabase)('Telegram: qo‘ng‘iroq yozish (GAP-08)', () => {
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

  it('tur → natija → davomiylik (yozib) → izoh → keyingi qadam: CRM qo‘ng‘irog‘i barcha maydonlar bilan', async () => {
    const manager = await linked('SALES_MANAGER');
    const target = await lead(manager.id);
    const bot = captureBot();

    await press(`sl_call:${target.id}`).expect(200);
    expect(bot.last().text).toContain('1/5');
    await press('sl_ct:OUT').expect(200);
    expect(bot.last().text).toContain('2/5');
    await press(`sl_cr:${target.id}:CALLBACK`).expect(200);
    expect(bot.last().text).toContain('3/5');
    await message('abc').expect(200);
    expect(bot.last().text).toContain('raqam bilan');
    await message('7').expect(200);
    expect(bot.last().text).toContain('4/5');
    await message('Kechqurun qayta qo‘ng‘iroq qilishni so‘radi').expect(200);
    expect(bot.last().text).toContain('5/5');
    expect(bot.last().text).toContain('7 daq');
    await press('sl_cn:t10').expect(200);
    expect(bot.last().text).toContain('Qayta qo‘ng‘iroq');

    const call = await prisma.call.findFirstOrThrow({ where: { leadId: target.id } });
    expect(call).toMatchObject({ direction: 'OUTGOING', status: 'COMPLETED', result: 'CALLBACK', durationSec: 420, notes: 'Kechqurun qayta qo‘ng‘iroq qilishni so‘radi', managerId: manager.id });
    expect(call.nextCallAt?.toISOString()).toBe(localDayAt(1, 10).toISOString());
    // CRM servisi ishi: lead oxirgi aloqa va audit
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: target.id } })).lastContactedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: call.id } })).toBeGreaterThan(0);
  });

  it('"Saqlash va follow-up" — qo‘ng‘iroq saqlanadi va follow-up muddati so‘raladi', async () => {
    const manager = await linked('SALES_MANAGER');
    const target = await lead(manager.id);
    const bot = captureBot();
    for (const data of [`sl_call:${target.id}`, 'sl_ct:IN', `sl_cr:${target.id}:BUSY`, 'sl_cs', 'sl_cn:fu']) await press(data).expect(200);
    expect(await prisma.call.count({ where: { leadId: target.id, result: 'BUSY', durationSec: 0, direction: 'INCOMING' } })).toBe(1);
    expect(bot.last().text).toContain('Follow-up');
    expect(bot.data()).toContain(`sl_fw:${target.id}:t10`);
  });

  it('S1: ruxsatsiz xodim — o‘qituvchi va call.create siz rol — qo‘ng‘iroq yoza olmaydi; oqim o‘rtasida ruxsat olinsa to‘xtaydi', async () => {
    const target = await lead(null);
    const bot = captureBot();

    await linked('TEACHER', 74_002);
    await press(`sl_call:${target.id}`, 74_002).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');

    // Leadni ko'radi, lekin qo'ng'iroq yozish ruxsati yo'q
    const role = await prisma.role.create({ data: { key: 'LEAD_VIEWER', name: 'Lead kuzatuvchi', isSystem: false } });
    const viewOnly = await prisma.permission.findMany({ where: { key: { in: [PERMISSIONS.LEAD_VIEW] } } });
    await prisma.rolePermission.createMany({ data: viewOnly.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    await linked('LEAD_VIEWER', 74_003);
    await press(`sl_lead:${target.id}`, 74_003).expect(200);
    expect(bot.last().text).toContain('Nodir');
    await press(`sl_call:${target.id}`, 74_003).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');

    // Menejer boshlaydi, izoh bosqichida call.create olib qo'yiladi
    const manager = await linked('SALES_MANAGER', 74_004);
    const own = await lead(manager.id);
    for (const data of [`sl_call:${own.id}`, 'sl_ct:OUT', `sl_cr:${own.id}:ANSWERED`, 'sl_cd:120']) await press(data, 74_004).expect(200);
    const salesRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SALES_MANAGER' } });
    const create = await prisma.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.CALL_CREATE } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: salesRole.id, permissionId: create.id } } });
    permissionService.invalidate();
    await message('izoh matni', 74_004).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    await press('sl_cn:none', 74_004).expect(200);
    expect(await prisma.call.count()).toBe(0);
  });

  it('boshqa menejerga biriktirilgan lead — qo‘ng‘iroq yozilmaydi (lead doirasi)', async () => {
    await linked('SALES_MANAGER');
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const foreign = await lead(other.id);
    const bot = captureBot();
    await press(`sl_call:${foreign.id}`).expect(200);
    expect(bot.last().text).toMatch(/topilmadi|ruxsat/i);
    // Soxta callback: boshqa lead id bilan natija — ham rad
    await press(`sl_cr:${foreign.id}:INTERESTED`).expect(200);
    await press('sl_cn:none').expect(200);
    expect(await prisma.call.count()).toBe(0);
  });
});
