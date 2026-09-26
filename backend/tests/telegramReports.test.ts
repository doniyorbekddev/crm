import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard, TelegramMedia } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { moneyUz } from '../src/telegram/format.js';
import { periodRange } from '../src/telegram/handlers/workspace.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

/** TZ 3.1 GAP-12 — rahbar botda hisobotlar: kunlik qisqa hisobot, barcha turlar, davr, CSV */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT = 78_001;
const DAY = 86_400_000;
let phone = 0;

function captureBot() {
  const shown: Array<{ text: string; keyboard: InlineKeyboard | undefined }> = [];
  const files: Array<{ media: TelegramMedia; caption: string | undefined }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'sendMedia').mockImplementation(async (_c: string, media: TelegramMedia, caption?: string) => {
    files.push({ media, caption });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return { files, last: () => shown.at(-1)!, data: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data) };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (text: string, chat = CHAT) => post({ message: { message_id: 10, chat: { id: chat, first_name: 'S' }, from: { id: chat }, text } });
const press = (data: string, chat = CHAT) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function linked(role: string, chat = CHAT) {
  const { user, token } = await createUserWithToken(app, { role });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chat);
  return { user, token };
}

async function customRole(key: string, permissions: string[]) {
  const role = await prisma.role.create({ data: { key, name: key, isSystem: false } });
  const rows = await prisma.permission.findMany({ where: { key: { in: permissions } } });
  await prisma.rolePermission.createMany({ data: rows.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
}

async function seedAcademy() {
  const course = await createCourse('Frontend');
  const group = await createGroup({ courseId: course.id, name: 'Front-1' });
  const students = [];
  for (const [index, risk] of (['HEALTHY', 'AT_RISK', 'CRITICAL'] as const).entries()) {
    phone += 1;
    students.push(
      await prisma.student.create({
        data: {
          firstName: `Hisobot${index}`,
          lastName: 'Test',
          phone: `+99889${String(1_000_000 + phone).slice(-7)}`,
          courseId: course.id,
          groupId: group.id,
          contractPrice: 1_000_000,
          startDate: new Date('2026-01-01'),
          riskLevel: risk,
          debt: { create: { totalAmount: 1_000_000, remainingAmount: 700_000, paidAmount: 300_000 } },
        },
      }),
    );
  }
  for (const [index, student] of students.entries()) {
    await prisma.attendance.create({ data: { studentId: student.id, groupId: group.id, date: dateColumn(new Date(Date.now() - 3 * DAY)), status: index === 2 ? 'ABSENT' : 'PRESENT' } });
  }
  const homework = await prisma.homework.create({ data: { title: 'Grid', groupId: group.id, deadline: new Date(Date.now() - DAY), maxPoints: 100, status: 'PUBLISHED' } });
  await prisma.homeworkSubmission.createMany({
    data: students.map((student, index) => ({ homeworkId: homework.id, studentId: student.id, status: index === 0 ? ('MISSED' as const) : ('GRADED' as const), score: index === 0 ? null : 80 })),
  });
  const exam = await prisma.exam.create({ data: { title: 'Oylik', groupId: group.id, date: dateColumn(new Date(Date.now() - 2 * DAY)), maxScore: 100, passScore: 60, status: 'GRADED' } });
  await prisma.examResult.createMany({ data: [{ examId: exam.id, studentId: students[0]!.id, score: 90, percentage: 90 }, { examId: exam.id, studentId: students[1]!.id, score: 60, percentage: 60 }] });
  const source = await createSource('Instagram');
  await createLead({ sourceId: source.id, courseId: course.id, phone: '+998933000001' });
  await createLead({ sourceId: source.id, courseId: course.id, phone: '+998933000002' });
  return { students };
}

describe.skipIf(!hasTestDatabase)('Telegram: hisobotlar (GAP-12)', () => {
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

  it('kunlik hisobot: o‘quvchi, lead, tushum, qarz, davomat, vazifa, imtihon, xavf — rahbar paneli bilan bir xil', async () => {
    await seedAcademy();
    const { token } = await linked('OWNER');
    const bot = captureBot();
    const executive = (await request(app).get('/api/dashboard/executive').set(bearer(token)).expect(200)).body.data;
    const academy = (await request(app).get('/api/dashboard/executive/academy').set(bearer(token)).expect(200)).body.data;
    expect(academy).toMatchObject({ attendance: { rate: 67 }, homework: { submissionRate: 67 }, exams: { averagePercentage: 75 }, risk: { atRisk: 1, critical: 1 } });

    await message('/kunlik').expect(200);
    const text = bot.last().text;
    expect(text).toContain('📊 Kunlik hisobot');
    expect(text).toContain(`👨‍🎓 O‘quvchilar: <b>${executive.kpi.activeStudents}</b> faol`);
    expect(text).toContain(`📞 Leadlar: <b>${executive.today.newLeads}</b> bugun`);
    expect(executive.today.newLeads).toBe(2);
    expect(text).toContain(`💰 Tushum: <b>${moneyUz(executive.today.netRevenue)}</b> bugun · oy ${moneyUz(executive.kpi.monthRevenue)}`);
    expect(text).toContain(`💳 Qarz: <b>${moneyUz(2_100_000)}</b>`);
    expect(text).toContain('📚 Davomat: bugun <b>hali belgilanmagan</b> · 30 kun 67%');
    expect(text).toContain('📝 Vazifa: <b>67%</b> (30 kun)');
    expect(text).toContain('🎯 Imtihon o‘rtachasi: <b>75%</b> (30 kun)');
    expect(text).toContain('⚠️ Xavf ostida: <b>2</b> (kritik 1)');
    expect(bot.data()).toContain('ws_rep');

    // Hisobotlar menyusidan ham ochiladi
    await press('ws_rep').expect(200);
    expect(bot.data()).toContain('ws_day');
  });

  it('menyu: rahbar — barcha 15 tur; buxgalter — faqat ruxsatidagilar, kunlik hisobotsiz', async () => {
    await linked('OWNER');
    const bot = captureBot();
    await press('ws_rep').expect(200);
    const types = bot.data().filter((data) => data?.startsWith('ws_r:')).map((data) => data!.slice(5));
    expect(types).toEqual(expect.arrayContaining(['sales', 'managers', 'courses', 'groups', 'payments', 'debts', 'attendance', 'sources', 'teachers', 'salaries', 'incomes', 'expenses', 'profit', 'retention', 'gamification']));
    expect(types).toHaveLength(15);

    await linked('ACCOUNTANT', CHAT + 1);
    await press('ws_rep', CHAT + 1).expect(200);
    const accountant = bot.data();
    expect(accountant).not.toContain('ws_day');
    expect(accountant).toEqual(expect.arrayContaining(['ws_r:payments', 'ws_r:debts']));
    await press('ws_day', CHAT + 1).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
  });

  it('hisobot: davr bo‘yicha KPI va qisqa qatorlar REST bilan bir xil; CSV — REST eksport bilan aynan bir xil fayl', async () => {
    await seedAcademy();
    const { token } = await linked('OWNER');
    const bot = captureBot();
    const range = periodRange('last');
    const rest = (await request(app).get('/api/reports/debts').query(range).set(bearer(token)).expect(200)).body.data;

    await press('ws_r:debts:last').expect(200);
    const text = bot.last().text;
    expect(text).toContain(rest.title);
    expect(text).toContain('O‘tgan oy');
    for (const kpi of rest.kpis) expect(text).toContain(kpi.label);
    expect(text).toContain('Hisobot0');
    expect(text).toContain(`Jami ${rest.rows.length} ta qator`);
    expect(bot.data()).toEqual(expect.arrayContaining(['ws_r:debts:month', 'ws_r:debts:d30', 'ws_rcsv:debts:last', 'ws_rep']));

    await press('ws_rcsv:debts:last').expect(200);
    expect(bot.files).toHaveLength(1);
    const { media } = bot.files[0]!;
    if (!('buffer' in media)) throw new Error('buffer kutilgan');
    expect(media.fileName).toBe(`debts-${range.from}_${range.to}.csv`);
    const exported = await request(app).get('/api/reports/debts/export').query({ ...range, format: 'csv' }).set(bearer(token)).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(exported.status).toBe(200);
    expect(media.buffer.toString('utf8')).toBe((exported.body as Buffer).toString('utf8'));
  });

  it('ruxsat: tur ruxsati yo‘q — rad; report.export yo‘q — CSV tugmasi yo‘q va callback rad; o‘qituvchi — rad', async () => {
    await customRole('REPORT_READER', [PERMISSIONS.REPORT_VIEW]);
    await linked('REPORT_READER');
    const bot = captureBot();
    await press('ws_r:sales:month').expect(200);
    expect(bot.last().text).toContain('Sotuv');
    expect(bot.data().some((data) => data?.startsWith('ws_rcsv'))).toBe(false);
    await press('ws_rcsv:sales:month').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    // Qarzdorlik — debt.view kerak (web bilan bir xil)
    await press('ws_r:debts').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    await press('ws_rcsv:debts:month').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    await press('ws_r:nomalum').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    expect(bot.files).toHaveLength(0);

    await linked('TEACHER', CHAT + 2);
    for (const data of ['ws_rep', 'ws_day', 'ws_r:sales', 'ws_rcsv:sales:month']) {
      await press(data, CHAT + 2).expect(200);
      expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    }
    expect(bot.files).toHaveLength(0);
  });
});
