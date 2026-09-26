import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { BROADCAST_ACTIONS } from '../src/telegram/handlers/broadcast.js';
import { EXTRA_ACTIONS } from '../src/telegram/handlers/extras.js';
import { OWNER_ACTIONS } from '../src/telegram/handlers/owner.js';
import { SALES_ACTIONS, SALES_ACTION_PERMISSIONS } from '../src/telegram/handlers/sales.js';
import { TEACHER_ACTIONS, TEACHER_ACTION_PERMISSIONS } from '../src/telegram/handlers/teacher.js';
import { WORKSPACE_ACTIONS, WORKSPACE_ACTION_PERMISSIONS } from '../src/telegram/handlers/workspace.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-16 / audit S1 qoldig'i — har xodim bot amali ruxsat bilan himoyalangan
 * ([telegram-permissions.md](../../docs/telegram-permissions.md) bilan bir xil ro'yxat).
 */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';

/** O'z funksiyasida tekshiriladi (sabab bilan) — jadvalda emas */
const CHECKED_IN_HANDLER: Record<string, string> = {
  ...Object.fromEntries(Object.values(OWNER_ACTIONS).map((action) => [action, 'owner requirePermission'])),
  ...Object.fromEntries(Object.values(BROADCAST_ACTIONS).map((action) => [action, 'broadcast.send — har callbackda'])),
  [EXTRA_ACTIONS.aiStart]: 'ai.assistant | ai.academic',
  [EXTRA_ACTIONS.aiSuggest]: 'ai.assistant | ai.academic',
  [WORKSPACE_ACTIONS.review]: 'homework.grade',
  [WORKSPACE_ACTIONS.ai]: 'ai.academic',
  [WORKSPACE_ACTIONS.kpi]: 'analytics.view | attendance.mark',
  [WORKSPACE_ACTIONS.teacherKpi]: 'analytics.view + group.manage',
  [WORKSPACE_ACTIONS.marketing]: 'analytics.view',
  [WORKSPACE_ACTIONS.marketingCsv]: 'analytics.view + report.export',
  [WORKSPACE_ACTIONS.reports]: 'report.view',
  [WORKSPACE_ACTIONS.report]: 'canViewReport',
  [WORKSPACE_ACTIONS.reportCsv]: 'canViewReport + report.export',
  [WORKSPACE_ACTIONS.daily]: 'analytics.view',
};

/** Shaxsiy — ruxsat kerak emas (o'z sozlamasi, o'z qidiruvi natijalari servisda filtrlanadi) */
const PERSONAL = new Set<string>([
  WORKSPACE_ACTIONS.search,
  WORKSPACE_ACTIONS.settings,
  WORKSPACE_ACTIONS.toggleType,
  WORKSPACE_ACTIONS.toggleCategory,
  WORKSPACE_ACTIONS.toggleMute,
]);

/** O'quvchi/ota-ona amallari (doira `scope.studentIds`) — xodim uchun emas */
const FAMILY = new Set<string>([EXTRA_ACTIONS.payNow, EXTRA_ACTIONS.referral]);

const STAFF_ACTIONS = [
  ...Object.values(TEACHER_ACTIONS),
  ...Object.values(SALES_ACTIONS),
  ...Object.values(OWNER_ACTIONS),
  ...Object.values(BROADCAST_ACTIONS),
  ...Object.values(WORKSPACE_ACTIONS),
  ...Object.values(EXTRA_ACTIONS),
].filter((action) => !FAMILY.has(action));

function captureBot() {
  const shown: string[] = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, _k?: InlineKeyboard) => {
    shown.push(text);
    return { ok: true, retryable: false, messageId: shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string) => {
    shown.push(text);
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  vi.spyOn(telegram.telegramService, 'sendMedia').mockResolvedValue({ ok: true, retryable: false });
  return { last: () => shown.at(-1) ?? '', count: () => shown.length };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (chat: number, text: string) => post({ message: { message_id: 10, chat: { id: chat }, from: { id: chat }, text } });
const press = (chat: number, data: string) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function role(key: string, permissions: string[]) {
  const row = await prisma.role.create({ data: { key, name: key, isSystem: false } });
  const rows = await prisma.permission.findMany({ where: { key: { in: permissions } } });
  if (rows.length) await prisma.rolePermission.createMany({ data: rows.map((permission) => ({ roleId: row.id, permissionId: permission.id })) });
}

async function linkStaff(roleKey: string, chat: number) {
  const { user } = await createUserWithToken(app, { role: roleKey });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(chat, `/start ${link.linkCode}`);
  return user;
}

async function classroom(teacherId: string | null) {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId, name: 'Ruxsat-1' });
  const student = await prisma.student.create({
    data: { firstName: 'Maxfiy', lastName: 'Telefon', phone: '+998977777777', courseId: course.id, groupId: group.id, contractPrice: 1, startDate: new Date('2026-01-01') },
  });
  const homework = await prisma.homework.create({ data: { title: 'Sinov', groupId: group.id, deadline: new Date(Date.now() + 86_400_000), maxPoints: 100, status: 'PUBLISHED' } });
  await prisma.homeworkSubmission.create({ data: { homeworkId: homework.id, studentId: student.id, status: 'SUBMITTED', submittedAt: new Date(), answerText: 'Javob' } });
  return { group, student, homework };
}

describe('bot amallari ro‘yxati to‘liq himoyalangan', () => {
  it('har xodim amali — jadvalda, o‘z funksiyasida tekshiriladi yoki ataylab shaxsiy', () => {
    const mapped = new Set([...Object.keys(TEACHER_ACTION_PERMISSIONS), ...Object.keys(WORKSPACE_ACTION_PERMISSIONS), ...Object.keys(SALES_ACTION_PERMISSIONS)]);
    const unguarded = STAFF_ACTIONS.filter((action) => !mapped.has(action) && !(action in CHECKED_IN_HANDLER) && !PERSONAL.has(action));
    expect(unguarded).toEqual([]);
  });
});

describe.skipIf(!hasTestDatabase)('Bot ruxsatlari (S1 qoldig‘i, GAP-16)', () => {
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

  it('ruxsatsiz xodim: har xodim amali (qo‘lda yuborilgan callback) rad, bazada o‘zgarish yo‘q', async () => {
    const { group, student, homework } = await classroom(null);
    await role('BOT_NOPERM', []);
    await linkStaff('BOT_NOPERM', 83_001);
    const bot = captureBot();
    const arg = `${homework.id}:${student.id}`;
    for (const action of STAFF_ACTIONS.filter((item) => !PERSONAL.has(item))) {
      resetRateLimits();
      const before = bot.count();
      await press(83_001, `${action}:${action.startsWith('tc_') ? group.id : arg}`).expect(200);
      if (bot.count() === before) continue; // javob yo'q — ma'lumot ham yo'q
      expect(bot.last(), action).toMatch(/ruxsat|huquq/i);
      expect(bot.last(), action).not.toContain('+998977777777');
    }
    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.homeworkSubmission.count({ where: { score: { not: null } } })).toBe(0);
    expect(await prisma.telegramBroadcast.count()).toBe(0);
    expect(await prisma.call.count()).toBe(0);
  }, 60_000);

  it('sotuv menejeri begona guruh ro‘yxatini (ism, telefon) callback bilan ham ko‘rmaydi', async () => {
    const { group } = await classroom(null);
    await linkStaff('SALES_MANAGER', 83_002);
    const bot = captureBot();
    for (const action of [TEACHER_ACTIONS.students, TEACHER_ACTIONS.attendance, TEACHER_ACTIONS.today]) {
      await press(83_002, `${action}:${group.id}`).expect(200);
      expect(bot.last(), action).toContain('ruxsatingiz yo‘q');
      expect(bot.last(), action).not.toContain('Maxfiy');
    }
  });

  it('davomatni ko‘radi, lekin belgilay olmaydi (attendance.view, attendance.mark yo‘q) — saqlanmaydi', async () => {
    const { group, student } = await classroom(null);
    await role('ATT_VIEWER', [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.GROUP_VIEW, PERMISSIONS.GROUP_MANAGE]);
    await linkStaff('ATT_VIEWER', 83_003);
    const bot = captureBot();
    await press(83_003, `${TEACHER_ACTIONS.attendance}:${group.id}`).expect(200);
    await press(83_003, `${TEACHER_ACTIONS.toggle}:${student.id}`).expect(200);
    expect(bot.last()).toContain('ruxsatingiz yo‘q');
    await press(83_003, TEACHER_ACTIONS.save).expect(200);
    expect(bot.last()).toContain('ruxsatingiz yo‘q');
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('baholash: homework.grade yo‘q — ko‘radi, lekin baho/qaytarish rad; oqim o‘rtasida olib qo‘yilsa ham', async () => {
    const { homework, student } = await classroom(null);
    await role('HW_VIEWER', [PERMISSIONS.HOMEWORK_VIEW, PERMISSIONS.GROUP_MANAGE, PERMISSIONS.GROUP_VIEW]);
    await linkStaff('HW_VIEWER', 83_004);
    const bot = captureBot();
    const pair = `${homework.id}:${student.id}`;
    await press(83_004, `${WORKSPACE_ACTIONS.reviewOne}:${pair}`).expect(200);
    expect(bot.last()).toContain('Javob');
    for (const action of [WORKSPACE_ACTIONS.grade, WORKSPACE_ACTIONS.giveBack, WORKSPACE_ACTIONS.aiAccept]) {
      await press(83_004, `${action}:${pair}`).expect(200);
      expect(bot.last(), action).toContain('ruxsatingiz yo‘q');
    }

    // O'qituvchi baholashni boshlaydi, keyin ruxsat olib qo'yiladi
    const teacher = await linkStaff('TEACHER', 83_005);
    await prisma.group.update({ where: { id: homework.groupId }, data: { teacherId: teacher.id } });
    await press(83_005, `${WORKSPACE_ACTIONS.grade}:${pair}`).expect(200);
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { key: 'TEACHER' } });
    const gradePermission = await prisma.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.HOMEWORK_GRADE } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: gradePermission.id } } });
    permissionService.invalidate();
    await message(83_005, '90').expect(200);
    expect(bot.last()).toContain('ruxsatingiz yo‘q');
    expect((await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id } })).score).toBeNull();
  });
});
