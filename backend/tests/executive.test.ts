import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

/** Barcha hisob-kitoblar shu kunga nisbatan tekshiriladi */
const NOW = new Date('2026-09-15T09:00:00.000Z');

let counter = 0;

async function seedAccounts() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 5_000_000 } });
  await prisma.financialAccount.create({ data: { key: 'BANK', name: 'Bank hisobi', type: 'BANK', balance: 9_000_000 } });
  await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 1 } });
  await prisma.incomeCategory.create({ data: { key: 'BOOKS', name: 'Kitob', sortOrder: 1 } });
}

async function enroll(courseId: string, groupId: string, status: 'ACTIVE' | 'DROPPED' = 'ACTIVE') {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(4_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      status,
      ...(status === 'DROPPED' ? { statusChangedAt: NOW } : {}),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 600_000, paidAmount: 400_000 } },
    },
  });
}

async function categoryId(kind: 'income' | 'expense', key: string): Promise<string> {
  const category =
    kind === 'income'
      ? await prisma.incomeCategory.findFirstOrThrow({ where: { key }, select: { id: true } })
      : await prisma.expenseCategory.findFirstOrThrow({ where: { key }, select: { id: true } });
  return category.id;
}

describe.skipIf(!hasTestDatabase)('Direktor paneli (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedAccounts();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('KPI, bugungi va oylik bloklarni qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id);
    await enroll(course.id, group.id);
    await enroll(course.id, group.id, 'DROPPED');

    const source = await createSource();
    await createLead({ sourceId: source.id });
    await createLead({ sourceId: source.id, status: 'WON' });
    await prisma.lead.updateMany({ where: { status: 'WON' }, data: { convertedAt: NOW } });

    // Davomat belgilanganda yozuvlar har doim seansga bog‘lanadi
    const session = await prisma.attendanceSession.create({
      data: { groupId: group.id, date: new Date('2026-09-15'), status: 'HELD' },
    });
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, groupId: group.id, sessionId: session.id, date: new Date('2026-09-15'), status: 'PRESENT' },
        {
          studentId: (await enroll(course.id, group.id)).id,
          groupId: group.id,
          sessionId: session.id,
          date: new Date('2026-09-15'),
          status: 'ABSENT',
        },
      ],
    });

    await request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 400_000, method: 'CASH' });
    await request(app)
      .post('/api/expenses')
      .set(bearer(token))
      .send({ categoryId: await categoryId('expense', 'RENT'), amount: 1_000_000, method: 'CASH' });

    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    expect(response.status).toBe(200);

    const { kpi, today, month } = response.body.data;
    expect(kpi).toMatchObject({
      totalStudents: 4,
      activeStudents: 3,
      droppedStudents: 1,
      totalGroups: 1,
      monthRevenue: 400_000,
      monthExpense: 1_000_000,
      netProfit: -600_000,
    });
    // 4 ta o‘quvchi × 600 000 so‘m qoldiq
    expect(kpi.totalDebt).toBe(2_400_000);
    expect(today).toMatchObject({
      date: '2026-09-15',
      newLeads: 2,
      lessons: 1,
      markedLessons: 1,
      absentStudents: 1,
      attendanceRate: 50,
      payments: 400_000,
      expenses: 1_000_000,
      netRevenue: -600_000,
    });
    expect(month).toMatchObject({ label: '2026-yil sentabr', wonLeads: 1, conversionRate: 100, newStudents: 4 });
  });

  it('kassalar o‘rtasidagi o‘tkazma tushum va xarajatga qo‘shilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const cash = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'CASH' } });
    const bank = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'BANK' } });

    await request(app)
      .post('/api/finance/transfers')
      .set(bearer(token))
      .send({ fromAccountId: cash.id, toAccountId: bank.id, amount: 2_000_000 });

    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    expect(response.body.data.kpi).toMatchObject({ monthRevenue: 0, monthExpense: 0, netProfit: 0 });
  });

  it('diqqat ro‘yxatiga faqat mavjud muammolar tushadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await enroll(course.id, group.id);
    // Bugungi dars bor, lekin davomat belgilanmagan
    await prisma.attendanceSession.create({ data: { groupId: group.id, date: new Date('2026-09-15'), status: 'PLANNED' } });

    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    const keys = response.body.data.attention.map((row: { key: string }) => row.key);
    expect(keys).toContain('debtors');
    expect(keys).toContain('unmarkedLessons');
    expect(keys).not.toContain('pendingSalaries');
  });

  it('oxirgi 6 oy dinamikasi qaytadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });

    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    const trend = response.body.data.trend;
    expect(trend).toHaveLength(6);
    expect(trend.at(-1).label).toBe('Sen');
    expect(trend.every((point: { profit: number }) => typeof point.profit === 'number')).toBe(true);
  });

  it('sotuv manageri direktor panelini ko‘ra olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

    const response = await request(app).get('/api/dashboard/executive').set(bearer(token));
    expect(response.status).toBe(403);
  });
});
