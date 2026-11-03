import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyReviewSeason } from '../src/services/org/performance.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * ORG tizimi · 3-bosqich (Performance & Finance): bo'lim xarajat limiti, choraklik baholash, taqdirlash,
 * karyera yo'li va lavozimga ko'tarish, "baholash vaqti" eslatmasi.
 */
const app = createApp();

describe.skipIf(!hasTestDatabase)('ORG · 3-bosqich', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bo‘lim limiti: limit ichida — to‘lanadi; oshsa — rahbar tasdig‘iga; tasdiqlovchi limitdan oshsa ham to‘laydi; oylik hisobot', async () => {
    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 50_000_000, sortOrder: 1 } });
    const category = await prisma.expenseCategory.create({ data: { key: 'ADS', name: 'Reklama', sortOrder: 1 } });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const department = await prisma.department.create({ data: { name: 'Marketing', monthlyExpenseLimit: 1_000_000 } });
    const expense = (amount: number, token: string) => request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: category.id, amount, method: 'CASH', departmentId: department.id });

    const within = await expense(600_000, accountant);
    expect(within.status).toBe(201);
    expect(within.body.data).toMatchObject({ status: 'PAID', department: { id: department.id } });
    const over = await expense(500_000, accountant);
    expect(over.body.data.status).toBe('PENDING');
    expect(await prisma.auditLog.count({ where: { action: 'expense.requested', entityId: over.body.data.id } })).toBe(1);
    // Rahbar (tasdiqlash huquqi bor) — limitdan oshsa ham to'g'ridan
    expect((await expense(500_000, owner)).body.data.status).toBe('PAID');
    expect((await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: category.id, amount: 1000, method: 'CASH', departmentId: 'yoq' })).status).toBe(422);

    const now = new Date();
    const report = await request(app).get('/api/org/departments/spending').query({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }).set(bearer(owner));
    const row = report.body.data.rows.find((item: { id: string }) => item.id === department.id);
    expect(row).toMatchObject({ limit: 1_000_000, spent: 1_600_000, pending: 500_000, remaining: -600_000, percent: 160 });
  });

  it('choraklik baholash: qoralama → tasdiqqa → CEO tasdiqlaydi; Admin tasdiqlay olmaydi; o‘zini baholamaydi; tasdiqlangani o‘zgarmaydi', async () => {
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Shodiya' });
    await prisma.employee.create({ data: { firstName: 'Shodiya', lastName: 'S', position: 'SALES_MANAGER', hireDate: new Date('2025-01-01'), userId: salesUser.id } });
    const scores = { quality: 5, discipline: 4, teamwork: 5, initiative: 4, results: 5 };

    expect((await request(app).post('/api/org/performance/reviews').set(bearer(admin)).send({ userId: adminUser.id, year: 2026, quarter: 3, scores })).status).toBe(403);
    const draft = await request(app).post('/api/org/performance/reviews').set(bearer(admin)).send({ userId: salesUser.id, year: 2026, quarter: 3, scores, strengths: 'Konversiya yuqori' });
    expect(draft.body.data).toMatchObject({ status: 'DRAFT', overallScore: 4.6, rating: 'EXCEEDS', positionKey: 'SALES_MANAGER' });
    const submitted = await request(app).post('/api/org/performance/reviews').set(bearer(admin)).send({ userId: salesUser.id, year: 2026, quarter: 3, scores, submit: true });
    expect(submitted.body.data).toMatchObject({ id: draft.body.data.id, status: 'SUBMITTED' });
    expect(await prisma.notification.count({ where: { userId: ownerUser.id, title: 'Baholash tasdiq kutmoqda' } })).toBe(1);

    expect((await request(app).post(`/api/org/performance/reviews/${draft.body.data.id}/approve`).set(bearer(admin))).status).toBe(403);
    // Xodim tasdiqlanmagan natijani ko'rmaydi
    expect((await request(app).get('/api/org/performance/me').set(bearer(sales))).body.data.reviews).toHaveLength(0);
    const approved = await request(app).post(`/api/org/performance/reviews/${draft.body.data.id}/approve`).set(bearer(owner));
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', approvedBy: { id: ownerUser.id } });
    expect((await request(app).get('/api/org/performance/me').set(bearer(sales))).body.data.reviews).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: salesUser.id, title: 'Choraklik baholash natijasi' } })).toBe(1);
    expect((await request(app).post('/api/org/performance/reviews').set(bearer(admin)).send({ userId: salesUser.id, year: 2026, quarter: 3, scores })).status).toBe(409);
  });

  it('taqdirlash: oy xodimi davrga bitta; pul mukofoti maoshga bonus tuzatmasi bo‘lib qo‘shiladi; xodim xabar oladi', async () => {
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const { user: guli } = await createUserWithToken(app, { role: 'ACCOUNTANT', firstName: 'Guli' });
    const { user: other } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const employee = await prisma.employee.create({ data: { firstName: 'Guli', lastName: 'K', position: 'RECEPTIONIST', hireDate: new Date('2025-01-01'), userId: guli.id, baseSalary: 3_000_000 } });

    const award = await request(app).post('/api/org/performance/awards').set(bearer(owner)).send({ userId: guli.id, type: 'EMPLOYEE_OF_MONTH', year: 2026, period: 10, title: 'Oktyabr oyi xodimi', reason: 'Qarzdorlik 30% ga kamaydi', amount: 500_000, addToPayroll: true });
    expect(award.status).toBe(201);
    expect(award.body.data.salaryPeriodId).not.toBeNull();
    const adjustment = await prisma.payrollAdjustment.findFirstOrThrow({ where: { salaryPeriod: { employeeId: employee.id } } });
    expect(adjustment).toMatchObject({ type: 'BONUS', category: 'PERFORMANCE' });
    expect(adjustment.amount.toNumber()).toBe(500_000);
    expect(await prisma.notification.count({ where: { userId: guli.id, title: '🏆 Siz taqdirlandingiz' } })).toBe(1);

    expect((await request(app).post('/api/org/performance/awards').set(bearer(owner)).send({ userId: other.id, type: 'EMPLOYEE_OF_MONTH', year: 2026, period: 10, title: 'Ikkinchi', reason: 'Takror sinov' })).status).toBe(409);
    expect((await request(app).post('/api/org/performance/awards').set(bearer(owner)).send({ userId: other.id, type: 'EMPLOYEE_OF_MONTH', year: 2026, title: 'Davrsiz', reason: 'Oy ko‘rsatilmagan' })).status).toBe(422);
  });

  it('karyera: talab bajarilgan xodim "tayyor"; tavsiya → CEO tasdiqlaydi → lavozim va ish tarixi (PROMOTED); qayta tavsiya — 409', async () => {
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await request(app).patch('/api/org/positions/SALES_MANAGER').set(bearer(owner)).send({ nextPositionKey: 'STUDENT_SUCCESS_MANAGER', minimumMonths: 6 }).expect(200);
    const employee = await prisma.employee.create({ data: { firstName: 'Shodiya', lastName: 'S', position: 'SALES_MANAGER', hireDate: new Date('2025-01-01'), userId: salesUser.id } });
    const junior = await prisma.employee.create({ data: { firstName: 'Yangi', lastName: 'X', position: 'SALES_MANAGER', hireDate: new Date() } });

    const careers = (await request(app).get('/api/org/performance/careers').set(bearer(admin))).body.data as Array<{ employeeId: string; eligible: boolean; meetsTenure: boolean; next: { key: string } | null }>;
    expect(careers.find((row) => row.employeeId === employee.id)).toMatchObject({ eligible: true, next: { key: 'STUDENT_SUCCESS_MANAGER' } });
    expect(careers.find((row) => row.employeeId === junior.id)).toMatchObject({ eligible: false, meetsTenure: false });

    const recommended = await request(app).post('/api/org/performance/promotions').set(bearer(admin)).send({ employeeId: employee.id, toPositionKey: 'STUDENT_SUCCESS_MANAGER', reason: 'Saqlab qolish ko‘rsatkichi eng yuqori' });
    expect(recommended.status).toBe(201);
    expect((await request(app).post('/api/org/performance/promotions').set(bearer(admin)).send({ employeeId: employee.id, toPositionKey: 'STUDENT_SUCCESS_MANAGER', reason: 'Takror tavsiya' })).status).toBe(409);
    expect((await request(app).post(`/api/org/performance/promotions/${recommended.body.data.id}/decide`).set(bearer(admin)).send({ decision: 'APPROVED' })).status).toBe(403);

    const decided = await request(app).post(`/api/org/performance/promotions/${recommended.body.data.id}/decide`).set(bearer(owner)).send({ decision: 'APPROVED', note: '1-dekabrdan' });
    expect(decided.body.data).toMatchObject({ status: 'APPROVED', decidedBy: { id: ownerUser.id } });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } })).position).toBe('STUDENT_SUCCESS_MANAGER');
    const history = await prisma.employmentHistory.findFirstOrThrow({ where: { employeeId: employee.id, type: 'PROMOTED' } });
    expect(history).toMatchObject({ positionKey: 'STUDENT_SUCCESS_MANAGER', approvedById: ownerUser.id });
    expect(await prisma.notification.count({ where: { userId: salesUser.id, title: '🎉 Lavozimga ko‘tarilish tasdiqlandi' } })).toBe(1);

    const mine = (await request(app).get('/api/org/performance/me').set(bearer(sales))).body.data;
    expect(mine.career).toMatchObject({ position: { key: 'STUDENT_SUCCESS_MANAGER' }, monthsInPosition: 0 });
  });

  it('chorak boshida baholovchilarga "baholash vaqti" eslatmasi — bir marta; chorak o‘rtasida — yo‘q', async () => {
    const { user: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    expect(await notifyReviewSeason(new Date('2026-10-02T06:00:00Z'))).toBe(1);
    await notifyReviewSeason(new Date('2026-10-03T06:00:00Z'));
    expect(await notifyReviewSeason(new Date('2026-11-15T06:00:00Z'))).toBe(0);
    const sent = await prisma.notification.findMany({ where: { userId: admin.id, title: 'Choraklik baholash vaqti' }, select: { message: true } });
    expect(sent).toEqual([{ message: expect.stringContaining('2026-yil 3-chorak') }]);
  });
});
