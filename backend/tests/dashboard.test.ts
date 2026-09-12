import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

/** Testlar 2026-09-15 (seshanba) kuni ishlaydi — sana bo‘yicha bucketlar barqaror bo‘lsin */
const NOW = new Date('2026-09-15T09:00:00.000Z');

let phoneCounter = 0;

async function enroll(courseId: string, contractPrice: number, leadId?: string) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: `+99890${String(3_000_000 + phoneCounter)}`,
      courseId,
      leadId: leadId ?? null,
      contractPrice,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: contractPrice, remainingAmount: contractPrice } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Dashboard API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('admin uchun barcha bloklarni qaytaradi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    await createLead({ sourceId: source.id, assignedToId: manager.id });
    const wonLead = await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'WON' });
    await prisma.lead.update({ where: { id: wonLead.id }, data: { convertedAt: NOW } });
    await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'LOST' });

    const student = await enroll(course.id, 2_000_000, wonLead.id);
    await prisma.payment.create({
      data: { studentId: student.id, courseId: course.id, amount: 500_000, method: 'CASH', paidAt: NOW, managerId: manager.id },
    });
    await prisma.debt.update({
      where: { studentId: student.id },
      data: { paidAmount: 500_000, remainingAmount: 1_500_000, status: 'PARTIAL' },
    });

    const response = await request(app).get('/api/dashboard/summary').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe('2026-09-15');
    expect(response.body.data.leads).toMatchObject({
      todayNew: 3,
      monthNew: 3,
      open: 1,
      monthWon: 1,
      monthLost: 1,
      conversionRate: 50,
    });
    expect(response.body.data.students).toMatchObject({ active: 1, monthNew: 1, frozen: 0 });
    expect(response.body.data.finance).toMatchObject({ todayRevenue: 500_000, monthRevenue: 500_000, prevMonthRevenue: 0 });
    expect(response.body.data.debts).toMatchObject({ totalRemaining: 1_500_000, debtors: 1 });
    expect(response.body.data.tasks).toMatchObject({ todayFollowUps: 0, overdueFollowUps: 0, todayCalls: 0 });
  });

  it('ruxsatga qarab bloklarni yashiradi va manager faqat o‘z leadlarini ko‘radi', async () => {
    const source = await createSource();
    const { user: owner, token: ownerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    await createLead({ sourceId: source.id, assignedToId: owner.id });
    await createLead({ sourceId: source.id, assignedToId: other.id });
    await createLead({ sourceId: source.id, assignedToId: null });

    const managerView = await request(app).get('/api/dashboard/summary').set(bearer(ownerToken));
    const accountantView = await request(app).get('/api/dashboard/summary').set(bearer(accountantToken));

    // O‘ziga biriktirilgan + biriktirilmagan leadlar
    expect(managerView.body.data.leads).toMatchObject({ todayNew: 2, open: 2 });
    expect(managerView.body.data.finance).toBeNull();
    expect(managerView.body.data.debts).toBeNull();
    expect(managerView.body.data.students).toMatchObject({ active: 0 });

    expect(accountantView.body.data.leads).toBeNull();
    expect(accountantView.body.data.tasks).toBeNull();
    expect(accountantView.body.data.finance).not.toBeNull();
    expect(accountantView.body.data.debts).not.toBeNull();
  });

  it('grafikni davr bo‘yicha qaytaradi va bugungi kunga yozuvlarni joylashtiradi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    await createLead({ sourceId: source.id });
    const student = await enroll(course.id, 1_000_000);
    await prisma.payment.create({
      data: { studentId: student.id, courseId: course.id, amount: 300_000, method: 'CARD', paidAt: NOW },
    });

    const daily = await request(app).get('/api/dashboard/charts?period=day').set(bearer(token));
    const weekly = await request(app).get('/api/dashboard/charts?period=week').set(bearer(token));
    const monthly = await request(app).get('/api/dashboard/charts?period=month').set(bearer(token));
    const invalid = await request(app).get('/api/dashboard/charts?period=hour').set(bearer(token));

    expect(daily.body.data).toHaveLength(14);
    expect(weekly.body.data).toHaveLength(8);
    expect(monthly.body.data).toHaveLength(6);
    const lastDay = daily.body.data.at(-1);
    expect(lastDay).toMatchObject({ date: '2026-09-15', leads: 1, revenue: 300_000 });
    expect(daily.body.data[0]).toMatchObject({ leads: 0, revenue: 0 });
    expect(monthly.body.data.at(-1)).toMatchObject({ leads: 1, revenue: 300_000, label: 'Sen' });
    expect(invalid.status).toBe(422);
  });

  it('voronkani va managerlar reytingini hisoblaydi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'NEW' });
    await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'NEGOTIATION' });
    const won = await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'WON' });
    await prisma.lead.update({ where: { id: won.id }, data: { convertedAt: NOW } });
    await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'LOST' });

    const student = await enroll(course.id, 3_000_000, won.id);
    await prisma.payment.create({
      data: { studentId: student.id, courseId: course.id, amount: 1_200_000, method: 'PAYME', paidAt: NOW, managerId: manager.id },
    });

    const funnel = await request(app).get('/api/dashboard/funnel').set(bearer(token));
    const managers = await request(app).get('/api/dashboard/managers').set(bearer(token));

    // LOST voronkada ko‘rsatilmaydi
    expect(funnel.body.data.map((stage: { status: string }) => stage.status)).not.toContain('LOST');
    const newStage = funnel.body.data.find((stage: { status: string }) => stage.status === 'NEW');
    expect(newStage).toMatchObject({ count: 1, percent: 25 });
    expect(funnel.body.data.find((stage: { status: string }) => stage.status === 'WON')).toMatchObject({ count: 1 });

    expect(managers.body.data).toHaveLength(1);
    expect(managers.body.data[0]).toMatchObject({
      id: manager.id,
      leads: 4,
      won: 1,
      conversionRate: 25,
      revenue: 1_200_000,
    });
  });

  it('bugungi va kechikkan follow-uplarni qaytaradi', async () => {
    const source = await createSource();
    const { user: manager, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: manager.id, firstName: 'Nodira' });
    const otherLead = await createLead({ sourceId: source.id, assignedToId: other.id });

    await prisma.followUp.create({
      data: { leadId: lead.id, assignedToId: manager.id, dueAt: new Date('2026-09-14T09:00:00.000Z'), title: 'Kechikkan' },
    });
    await prisma.followUp.create({
      data: { leadId: lead.id, assignedToId: manager.id, dueAt: new Date('2026-09-15T15:00:00.000Z'), title: 'Bugun' },
    });
    await prisma.followUp.create({
      data: { leadId: lead.id, assignedToId: manager.id, dueAt: new Date('2026-09-20T10:00:00.000Z'), title: 'Keyinroq' },
    });
    await prisma.followUp.create({
      data: { leadId: otherLead.id, assignedToId: other.id, dueAt: new Date('2026-09-15T10:00:00.000Z'), title: 'Begona' },
    });

    const response = await request(app).get('/api/dashboard/follow-ups').set(bearer(token));
    const summary = await request(app).get('/api/dashboard/summary').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toMatchObject({ title: 'Kechikkan', overdue: true, lead: { firstName: 'Nodira' } });
    expect(response.body.data[0].lead.code).toMatch(/^L-\d{6}$/);
    expect(response.body.data[1]).toMatchObject({ title: 'Bugun', overdue: false });
    expect(summary.body.data.tasks).toMatchObject({ todayFollowUps: 1, overdueFollowUps: 1 });
  });

  it('dashboard.view ruxsati bo‘lmasa 403 qaytaradi', async () => {
    await prisma.role.create({ data: { key: 'NO_DASHBOARD', name: 'Ruxsatsiz', isSystem: false } });
    const { token } = await createUserWithToken(app, { role: 'NO_DASHBOARD' });
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });

    const forbidden = await request(app).get('/api/dashboard/summary').set(bearer(token));
    const teacherManagers = await request(app).get('/api/dashboard/managers').set(bearer(teacherToken));
    const teacherFunnel = await request(app).get('/api/dashboard/funnel').set(bearer(teacherToken));

    expect(forbidden.status).toBe(403);
    // O‘qituvchida report.view ham, lead.view ham yo‘q
    expect(teacherManagers.status).toBe(403);
    expect(teacherFunnel.status).toBe(403);
  });
});
