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
import { REPORT_TYPES } from '../src/validators/report.validator.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 PHASE 20 — audit **S3** (filial doirasi): analitika, direktor paneli, akademiya holati, dashboard,
 * 15 hisobot turi, moliya paneli, o'qituvchi paneli va bot kunlik hisoboti. Filial admini (`branch.view_all` yo'q)
 * boshqa filial ma'lumotini **ko'rmaydi**; direktor — hammasini.
 *
 * B filial ma'lumotlarida noyob belgilar bor ("Botirjon", "Bravo-guruh", "Bekzodbek", "B kassa", 777 000) — ularning
 * javobda umuman uchramasligi tekshiriladi (sonlar bilan birga).
 */
const app = createApp();
const B_MARKERS = ['Botirjon', 'Bravo-guruh', 'Bekzodbek', 'B kassa', '777000'];
let phone = 0;

async function world() {
  const branchB = await prisma.branch.create({ data: { key: 'BRAVO', name: 'Bravo filial' } });
  const course = await createCourse();
  const source = await prisma.source.create({ data: { key: 'S3_SRC', name: 'Instagram', sortOrder: 1 } });

  const seedBranch = async (branchId: string, tag: { student: string; group: string; lead: string; account: string; amount: number }) => {
    const group = await createGroup({ courseId: course.id, name: tag.group });
    await prisma.group.update({ where: { id: group.id }, data: { branchId } });
    phone += 1;
    const student = await prisma.student.create({
      data: {
        firstName: tag.student,
        lastName: 'S3',
        phone: `+99876${String(1_000_000 + phone).slice(-7)}`,
        courseId: course.id,
        groupId: group.id,
        contractPrice: 2_000_000,
        startDate: new Date('2026-01-01'),
        branchId,
        riskLevel: 'CRITICAL',
        debt: { create: { totalAmount: 2_000_000, remainingAmount: 2_000_000 - tag.amount, paidAmount: tag.amount } },
      },
    });
    phone += 1;
    await prisma.lead.create({ data: { firstName: tag.lead, phone: `+99876${String(1_000_000 + phone).slice(-7)}`, sourceId: source.id, branchId } });
    const account = await prisma.financialAccount.create({ data: { key: `ACC_${tag.account.replace(/\W/g, '')}`, name: tag.account, type: 'CASH', balance: tag.amount, branchId } });
    await prisma.payment.create({ data: { studentId: student.id, courseId: course.id, groupId: group.id, amount: tag.amount, method: 'CASH', branchId } });
    await prisma.transaction.create({ data: { type: 'INCOME', amount: tag.amount, accountId: account.id, categoryName: `To‘lov ${tag.student}`, description: tag.student, branchId } });
    const session = await prisma.attendanceSession.create({ data: { groupId: group.id, date: dateColumn(new Date()), status: 'HELD' } });
    await prisma.attendance.create({ data: { studentId: student.id, groupId: group.id, sessionId: session.id, date: dateColumn(new Date()), status: 'ABSENT' } });
    return { group, student };
  };

  const main = await seedBranch('branch_main', { student: 'Alisher', group: 'Alfa-guruh', lead: 'Anvarbek', account: 'A kassa', amount: 300_000 });
  const bravo = await seedBranch(branchB.id, { student: 'Botirjon', group: 'Bravo-guruh', lead: 'Bekzodbek', account: 'B kassa', amount: 777_000 });

  const { token: adminA, user: adminAUser } = await createUserWithToken(app, { role: 'ADMIN' });
  const { token: adminB } = await createUserWithToken(app, { role: 'ADMIN', branchId: branchB.id });
  const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
  return { branchB, main, bravo, adminA, adminAUser, adminB, owner };
}

const get = (token: string, path: string, query: Record<string, string> = {}) => request(app).get(path).query(query).set(bearer(token));

/** Javobda B filial belgilari yo'q */
function expectNoBravo(body: unknown, label: string) {
  const text = JSON.stringify(body);
  for (const marker of B_MARKERS) expect(text, `${label}: "${marker}"`).not.toContain(marker);
}

describe.skipIf(!hasTestDatabase)('S3 — hisobot va analitikada filial doirasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    permissionService.invalidate();
    resetRateLimits();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('analitika (unit-economics, manbalar, rentabellik, kohortlar) — filial admini faqat o‘zinikini ko‘radi', async () => {
    const { adminA, adminB, owner } = await world();
    const unit = async (token: string) => (await get(token, '/api/analytics/unit-economics').expect(200)).body.data;
    expect((await unit(adminA)).newStudents).toBe(1);
    expect((await unit(adminB)).newStudents).toBe(1);
    expect((await unit(owner)).newStudents).toBe(2);

    const sources = async (token: string) => (await get(token, '/api/analytics/sources').expect(200)).body.data;
    expect((await sources(adminA)).totals.leads).toBe(1);
    expect((await sources(owner)).totals.leads).toBe(2);

    for (const dimension of ['course', 'group', 'teacher']) {
      const body = (await get(adminA, '/api/analytics/profitability', { dimension }).expect(200)).body.data;
      expectNoBravo(body, `profitability:${dimension}`);
    }
    expectNoBravo((await get(adminA, '/api/analytics/cohorts').expect(200)).body.data, 'cohorts');
    const sourcesCsv = await get(owner, '/api/analytics/sources/export', { format: 'csv' });
    expect(sourcesCsv.status).toBe(200);
  });

  it('direktor paneli, akademiya holati, dashboard — raqamlar filial bo‘yicha', async () => {
    const { adminA, adminB, owner } = await world();
    const exec = async (token: string) => (await get(token, '/api/dashboard/executive').expect(200)).body.data;
    const [a, b, o] = [await exec(adminA), await exec(adminB), await exec(owner)];
    expect(a.kpi.activeStudents).toBe(1);
    expect(b.kpi.activeStudents).toBe(1);
    expect(o.kpi.activeStudents).toBe(2);
    expect(a.kpi.totalDebt).toBe(1_700_000);
    expect(o.kpi.totalDebt).toBe(1_700_000 + 1_223_000);
    expectNoBravo(a, 'executive');

    const academy = async (token: string) => (await get(token, '/api/dashboard/executive/academy').expect(200)).body.data;
    expect((await academy(adminA)).risk.critical).toBe(1);
    expect((await academy(owner)).risk.critical).toBe(2);
    expect((await academy(adminA)).attendance.marked).toBe(1);

    const summary = (await get(adminA, '/api/dashboard/summary').expect(200)).body.data;
    expectNoBravo(summary, 'dashboard summary');
    expectNoBravo((await get(adminA, '/api/dashboard/managers').expect(200)).body.data, 'dashboard managers');
  });

  it.each(REPORT_TYPES)('hisobot “%s” — filial admini B filial ma’lumotini ko‘rmaydi', async (type) => {
    const { adminA, owner } = await world();
    const mine = await get(adminA, `/api/reports/${type}`);
    expect([200, 403]).toContain(mine.status);
    if (mine.status === 200) expectNoBravo(mine.body.data, `report:${type}`);
    const csv = await get(adminA, `/api/reports/${type}/export`, { format: 'csv' });
    if (csv.status === 200) for (const marker of B_MARKERS) expect(csv.text, `${type} csv`).not.toContain(marker);
    // Direktor — ruxsati bo'lgan hisobotda ishlaydi
    expect((await get(owner, `/api/reports/${type}`)).status).toBe(200);
  });

  it('hisobotlar: direktor ikkala filialni ko‘radi (nazorat — filtr haddan oshmagan)', async () => {
    const { owner, adminB } = await world();
    const groups = JSON.stringify((await get(owner, '/api/reports/groups').expect(200)).body.data);
    expect(groups).toContain('Alfa-guruh');
    expect(groups).toContain('Bravo-guruh');
    const bGroups = JSON.stringify((await get(adminB, '/api/reports/groups').expect(200)).body.data);
    expect(bGroups).toContain('Bravo-guruh');
    expect(bGroups).not.toContain('Alfa-guruh');
  });

  it('moliya paneli: hisoblar, tranzaksiyalar, xulosa, pul oqimi, foyda-zarar — faqat o‘z filiali', async () => {
    const { adminA, owner } = await world();
    for (const path of ['/api/finance/summary', '/api/finance/accounts', '/api/finance/transactions', '/api/finance/cash-flow', '/api/finance/cash-flow/statement', '/api/finance/profit-loss']) {
      const response = await get(adminA, path);
      expect(response.status, path).toBe(200);
      expectNoBravo(response.body.data, path);
    }
    const accounts = async (token: string) => (await get(token, '/api/finance/accounts').expect(200)).body.data;
    expect((await accounts(adminA)).totalBalance).toBe(300_000);
    expect((await accounts(owner)).totalBalance).toBe(1_077_000);
  });

  it('o‘qituvchi paneli (barcha guruhlar huquqi bilan) — faqat o‘z filiali guruhlari', async () => {
    const { adminA, owner } = await world();
    const overview = (await get(adminA, '/api/attendance/teacher-overview').expect(200)).body.data;
    expectNoBravo(overview, 'teacher-overview');
    expect(JSON.stringify((await get(owner, '/api/attendance/teacher-overview').expect(200)).body.data)).toContain('Bravo-guruh');
  });

  it('bot: kunlik hisobot, marketing, hisobot — filial admini uchun faqat o‘z filiali', async () => {
    const { adminAUser } = await world();
    const shown: string[] = [];
    vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, _k?: InlineKeyboard) => {
      shown.push(text);
      return { ok: true, retryable: false };
    });
    vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string) => {
      shown.push(text);
      return { ok: true, retryable: false };
    });
    vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
    const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'test-telegram-webhook-secret').send(body);
    const link = await telegramLinkService.ensureLink({ userId: adminAUser.id });
    await post({ message: { message_id: 1, chat: { id: 86_001 }, from: { id: 86_001 }, text: `/start ${link.linkCode}` } });
    const press = (data: string) => post({ callback_query: { id: 'cb', data, from: { id: 86_001 }, message: { message_id: 1, chat: { id: 86_001 } } } });

    await press('ws_day').expect(200);
    expect(shown.at(-1)).toContain('O‘quvchilar: <b>1</b>');
    for (const data of ['ws_day', 'ws_mkt', 'ws_r:groups', 'ws_r:payments', 'ws_r:debts']) {
      await press(data).expect(200);
      for (const marker of ['Botirjon', 'Bravo-guruh', '777 000']) expect(shown.at(-1), data).not.toContain(marker);
    }
  });
});
