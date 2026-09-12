import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

const NOW = new Date('2026-09-15T09:00:00.000Z');

let phoneCounter = 0;

async function enroll(options: { courseId: string; groupId?: string; contractPrice?: number; leadId?: string; firstName?: string }) {
  phoneCounter += 1;
  const price = options.contractPrice ?? 1_000_000;
  return prisma.student.create({
    data: {
      firstName: options.firstName ?? 'Ali',
      lastName: 'Valiyev',
      phone: `+99890${String(4_000_000 + phoneCounter)}`,
      courseId: options.courseId,
      groupId: options.groupId ?? null,
      leadId: options.leadId ?? null,
      contractPrice: price,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
}

/** Bitta so‘rovda ustun qiymatini topish */
function cell(rows: Array<Record<string, unknown>>, key: string, value: unknown, column: string): unknown {
  return rows.find((row) => row[key] === value)?.[column];
}

describe.skipIf(!hasTestDatabase)('Reports API (integratsion)', () => {
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

  it('sotuv hisobotini davr bo‘yicha hisoblaydi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    await createLead({ sourceId: source.id, assignedToId: manager.id });
    const won = await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'WON' });
    await prisma.lead.update({ where: { id: won.id }, data: { convertedAt: NOW } });
    await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'LOST' });

    const student = await enroll({ courseId: course.id, leadId: won.id, contractPrice: 2_000_000 });
    await prisma.payment.create({
      data: { studentId: student.id, courseId: course.id, amount: 800_000, method: 'CASH', paidAt: NOW, managerId: manager.id },
    });

    const response = await request(app).get('/api/reports/sales?from=2026-09-14&to=2026-09-15').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe('sales');
    expect(response.body.data.title).toBe('Sotuv hisoboti');
    expect(response.body.data.rows).toHaveLength(2);
    expect(cell(response.body.data.rows, 'period', '2026-09-15', 'leads')).toBe(3);
    expect(cell(response.body.data.rows, 'period', '2026-09-15', 'won')).toBe(1);
    expect(cell(response.body.data.rows, 'period', '2026-09-15', 'conversion')).toBe(50);
    expect(cell(response.body.data.rows, 'period', '2026-09-15', 'revenue')).toBe(800_000);
    expect(response.body.data.totals).toMatchObject({ leads: 3, won: 1, revenue: 800_000 });
    expect(response.body.data.kpis).toEqual(
      expect.arrayContaining([{ label: 'Tushum', value: 800_000, type: 'money' }]),
    );
  });

  it('oylik guruhlash va standart davr (oxirgi 30 kun) ishlaydi', async () => {
    const source = await createSource();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    await createLead({ sourceId: source.id });

    const monthly = await request(app).get('/api/reports/sales?from=2026-07-01&to=2026-09-15&groupBy=month').set(bearer(token));
    const weekly = await request(app).get('/api/reports/sales?from=2026-09-01&to=2026-09-15&groupBy=week').set(bearer(token));
    const defaultRange = await request(app).get('/api/reports/sales').set(bearer(token));

    expect(monthly.body.data.rows.map((row: { period: string }) => row.period)).toEqual([
      'Iyul 2026',
      'Avgust 2026',
      'Sentabr 2026',
    ]);
    expect(weekly.body.data.rows).toHaveLength(3);
    expect(weekly.body.data.rows[0].period).toBe('2026-09-01 — 2026-09-07');
    expect(defaultRange.body.data.from).toBe('2026-08-17');
    expect(defaultRange.body.data.to).toBe('2026-09-15');
  });

  it('managerlar, kurslar va manbalar hisobotlarini qaytaradi', async () => {
    const source = await createSource('Instagram');
    const course = await createCourse('Frontend');
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Dilshod' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const won = await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'WON', courseId: course.id });
    await prisma.lead.update({ where: { id: won.id }, data: { convertedAt: NOW } });
    await createLead({ sourceId: source.id, assignedToId: manager.id });
    await prisma.call.create({
      data: { leadId: won.id, managerId: manager.id, status: 'COMPLETED', calledAt: NOW, durationSec: 120 },
    });

    const student = await enroll({ courseId: course.id, leadId: won.id, contractPrice: 3_000_000 });
    await prisma.payment.create({
      data: { studentId: student.id, courseId: course.id, amount: 1_000_000, method: 'CARD', paidAt: NOW, managerId: manager.id },
    });
    await prisma.debt.update({
      where: { studentId: student.id },
      data: { paidAmount: 1_000_000, remainingAmount: 2_000_000, status: 'PARTIAL' },
    });

    const managers = await request(app).get('/api/reports/managers?from=2026-09-01&to=2026-09-15').set(bearer(token));
    const courses = await request(app).get('/api/reports/courses?from=2026-09-01&to=2026-09-15').set(bearer(token));
    const sources = await request(app).get('/api/reports/sources?from=2026-09-01&to=2026-09-15').set(bearer(token));

    expect(managers.body.data.rows).toHaveLength(1);
    expect(managers.body.data.rows[0]).toMatchObject({
      manager: 'Dilshod Foydalanuvchi',
      leads: 2,
      calls: 1,
      won: 1,
      conversion: 100,
      revenue: 1_000_000,
    });

    expect(courses.body.data.rows[0]).toMatchObject({
      course: 'Frontend',
      students: 1,
      activeStudents: 1,
      newStudents: 1,
      revenue: 1_000_000,
      debt: 2_000_000,
    });

    expect(sources.body.data.rows[0]).toMatchObject({ source: 'Instagram', leads: 2, won: 1, revenue: 1_000_000 });
  });

  it('guruhlar va davomat hisobotlarini hisoblaydi', async () => {
    const course = await createCourse();
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Bobur' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, capacity: 10, name: 'FE-01' });
    const student = await enroll({ courseId: course.id, groupId: group.id, firstName: 'Ali' });

    for (const [date, status] of [
      ['2026-09-07', 'PRESENT'],
      ['2026-09-09', 'ABSENT'],
      ['2026-09-11', 'LATE'],
      ['2026-09-14', 'PRESENT'],
    ] as const) {
      await prisma.attendance.create({
        data: { studentId: student.id, groupId: group.id, date: new Date(`${date}T00:00:00.000Z`), status },
      });
    }

    const groups = await request(app).get('/api/reports/groups?from=2026-09-01&to=2026-09-15').set(bearer(token));
    const attendance = await request(app).get('/api/reports/attendance?from=2026-09-01&to=2026-09-15').set(bearer(token));

    expect(groups.body.data.rows[0]).toMatchObject({
      group: 'FE-01',
      teacher: 'Bobur Foydalanuvchi',
      capacity: 10,
      students: 1,
      fill: 10,
      marks: 4,
      attendance: 75,
    });

    expect(attendance.body.data.rows[0]).toMatchObject({
      student: 'Ali Valiyev',
      present: 2,
      late: 1,
      absent: 1,
      lessons: 4,
      rate: 75,
    });
    expect(attendance.body.data.kpis).toEqual(
      expect.arrayContaining([{ label: 'O‘rtacha davomat', value: 75, type: 'percent' }]),
    );
  });

  it('to‘lovlar hisoboti usullar bo‘yicha ustun ochadi, qarzdorlik hisoboti qarzdorlarni ko‘rsatadi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const first = await enroll({ courseId: course.id, contractPrice: 2_000_000, firstName: 'Qarzdor' });
    const second = await enroll({ courseId: course.id, contractPrice: 1_000_000, firstName: 'Tolagan' });

    await request(app).post('/api/payments').set(bearer(token)).send({ studentId: first.id, amount: 500_000, method: 'CASH' });
    await request(app).post('/api/payments').set(bearer(token)).send({ studentId: second.id, amount: 1_000_000, method: 'PAYME' });

    const payments = await request(app).get('/api/reports/payments?from=2026-09-15&to=2026-09-15').set(bearer(token));
    const debts = await request(app).get('/api/reports/debts').set(bearer(token));

    expect(payments.body.data.columns.map((column: { key: string }) => column.key)).toEqual(
      expect.arrayContaining(['method_CASH', 'method_PAYME', 'count', 'total']),
    );
    expect(payments.body.data.rows[0]).toMatchObject({ method_CASH: 500_000, method_PAYME: 1_000_000, count: 2, total: 1_500_000 });
    expect(payments.body.data.kpis[0]).toMatchObject({ label: 'Jami tushum', value: 1_500_000 });

    expect(debts.body.data.rows[0]).toMatchObject({
      student: 'Qarzdor Valiyev',
      total: 2_000_000,
      paid: 500_000,
      remaining: 1_500_000,
    });
    expect(debts.body.data.kpis).toEqual(expect.arrayContaining([{ label: 'Qarzdorlar', value: 1, type: 'number' }]));
  });

  it('CSV eksport qiladi va ruxsatlarni tekshiradi', async () => {
    const source = await createSource();
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await createLead({ sourceId: source.id });

    const csv = await request(app).get('/api/reports/sales/export?from=2026-09-15&to=2026-09-15').set(bearer(token));
    const managerView = await request(app).get('/api/reports/sales').set(bearer(managerToken));
    const managerExport = await request(app).get('/api/reports/sales/export').set(bearer(managerToken));
    const unknownType = await request(app).get('/api/reports/unknown').set(bearer(token));
    const badRange = await request(app).get('/api/reports/sales?from=2026-09-20&to=2026-09-01').set(bearer(token));

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('sales-2026-09-15_2026-09-15.csv');
    expect(csv.text.startsWith('﻿')).toBe(true);
    expect(csv.text).toContain('"Yangi leadlar"');
    expect(csv.text).toContain('"Jami"');

    // Sales manager’da report.view ham, report.export ham yo‘q
    expect(managerView.status).toBe(403);
    expect(managerExport.status).toBe(403);
    expect(unknownType.status).toBe(422);
    expect(badRange.status).toBe(422);
  });
});
