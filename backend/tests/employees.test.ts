import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

/** Payroll ssenariylari 2026-yil mart (31 kun) bo‘yicha */
const MARCH = { year: 2026, month: 3 };

let counter = 0;

async function createEmployee(token: string, body: Record<string, unknown> = {}) {
  counter += 1;
  return request(app)
    .post('/api/employees')
    .set(bearer(token))
    .send({
      firstName: 'Dilnoza',
      lastName: 'Karimova',
      phone: `+99890${String(3_000_000 + counter)}`,
      position: 'ACCOUNTANT',
      baseSalary: 4_000_000,
      hireDate: '2025-06-01',
      ...body,
    });
}

async function payrollRows(token: string) {
  const response = await request(app).get('/api/payroll').query({ ...MARCH, payeeType: 'EMPLOYEE' }).set(bearer(token));
  expect(response.status).toBe(200);
  return response.body.data as Array<{
    id: string;
    totalAmount: number;
    payee: { type: string; id: string; firstName: string };
  }>;
}

describe.skipIf(!hasTestDatabase)('Xodimlar va umumiy payroll (integratsion)', () => {
  let adminToken: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: adminToken } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('xodimni yaratadi, filtrlaydi, ishdan bo‘shatadi; ruxsatlar va validatsiya', async () => {
    const created = await createEmployee(adminToken);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ position: 'ACCOUNTANT', status: 'ACTIVE', baseSalary: 4_000_000, hireDate: '2025-06-01' });
    const employeeId = created.body.data.id as string;

    expect((await createEmployee(adminToken, { baseSalary: -1 })).status).toBe(422);
    expect((await createEmployee(adminToken, { position: 'PILOT' })).status).toBe(422);
    expect((await createEmployee(adminToken, { firstName: '' })).status).toBe(422);

    const found = await request(app).get('/api/employees').query({ search: 'Dilnoza' }).set(bearer(adminToken));
    expect(found.body.meta.total).toBe(1);
    const cleaners = await request(app).get('/api/employees').query({ position: 'CLEANER' }).set(bearer(adminToken));
    expect(cleaners.body.meta.total).toBe(0);

    const withoutDate = await request(app).put(`/api/employees/${employeeId}`).set(bearer(adminToken)).send({ status: 'RESIGNED' });
    expect(withoutDate.status).toBe(422);
    const resigned = await request(app)
      .put(`/api/employees/${employeeId}`)
      .set(bearer(adminToken))
      .send({ status: 'RESIGNED', terminationDate: '2026-03-20' });
    expect(resigned.status).toBe(200);
    expect(resigned.body.data).toMatchObject({ status: 'RESIGNED', terminationDate: '2026-03-20' });
    expect(await prisma.auditLog.count({ where: { action: 'employee.created' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'employee.updated' } })).toBe(1);

    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    expect((await request(app).get('/api/employees').set(bearer(teacherToken))).status).toBe(403);
    const { user: accountant, token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'acc@test.uz' });
    expect((await request(app).get('/api/employees').set(bearer(accountantToken))).status).toBe(200);
    expect((await createEmployee(accountantToken)).status).toBe(403);

    // Tizim akkauntini bog'lash: bog'langan foydalanuvchi nomzodlar ro'yxatidan chiqadi
    const before = await request(app).get('/api/employees/candidates').set(bearer(adminToken));
    expect(before.body.data.map((user: { id: string }) => user.id)).toContain(accountant.id);
    expect((await createEmployee(adminToken, { firstName: 'Bog‘langan', userId: accountant.id })).status).toBe(201);
    const after = await request(app).get('/api/employees/candidates').set(bearer(adminToken));
    expect(after.body.data.map((user: { id: string }) => user.id)).not.toContain(accountant.id);
    expect((await createEmployee(adminToken, { firstName: 'Takroriy', userId: accountant.id })).status).toBe(409);
  });

  it('to‘liq oy, oy o‘rtasida ishga kirgan va ishdan ketgan xodim maoshi kunlarga proporsional', async () => {
    await createEmployee(adminToken, { firstName: 'Toliq', position: 'ADMINISTRATOR', baseSalary: 4_000_000, hireDate: '2025-01-10' });
    // 16-31 mart: 16 kun / 31 → 3 100 000 × 16/31 = 1 600 000
    await createEmployee(adminToken, { firstName: 'Yangi', position: 'CLEANER', baseSalary: 3_100_000, hireDate: '2026-03-16' });
    const leaving = await createEmployee(adminToken, { firstName: 'Ketgan', position: 'SECURITY', baseSalary: 3_100_000, hireDate: '2025-01-01' });
    // 1-10 mart: 10 kun → 1 000 000
    await request(app).put(`/api/employees/${leaving.body.data.id}`).set(bearer(adminToken)).send({ status: 'RESIGNED', terminationDate: '2026-03-10' }).expect(200);
    const gone = await createEmployee(adminToken, { firstName: 'Oldin', hireDate: '2025-01-01' });
    await request(app).put(`/api/employees/${gone.body.data.id}`).set(bearer(adminToken)).send({ status: 'RESIGNED', terminationDate: '2026-02-20' }).expect(200);
    const suspended = await createEmployee(adminToken, { firstName: 'Toxtatilgan' });
    await request(app).put(`/api/employees/${suspended.body.data.id}`).set(bearer(adminToken)).send({ status: 'SUSPENDED' }).expect(200);

    const calculated = await request(app).post('/api/payroll/calculate').set(bearer(adminToken)).send(MARCH);
    expect(calculated.status).toBe(200);
    expect(calculated.body.data.calculated).toBe(3);
    expect(calculated.body.data.skipped).toEqual([expect.objectContaining({ firstName: 'Toxtatilgan', reason: 'Faoliyati to‘xtatilgan' })]);

    const rows = await payrollRows(adminToken);
    const totalOf = (name: string) => rows.find((row) => row.payee.firstName === name)?.totalAmount;
    expect(rows.every((row) => row.payee.type === 'EMPLOYEE')).toBe(true);
    expect(totalOf('Toliq')).toBe(4_000_000);
    expect(totalOf('Yangi')).toBe(1_600_000);
    expect(totalOf('Ketgan')).toBe(1_000_000);
    expect(totalOf('Oldin')).toBeUndefined();

    const teachersOnly = await request(app).get('/api/payroll').query({ ...MARCH, payeeType: 'TEACHER' }).set(bearer(adminToken));
    expect(teachersOnly.body.data).toHaveLength(0);
  });

  it('xodim maoshi: bonus, avans, tasdiqlash, to‘lov — xarajat "Xodim maoshi" kategoriyasiga', async () => {
    const { user: linked } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'dilnoza@test.uz' });
    const employee = await createEmployee(adminToken, { userId: linked.id });
    const employeeId = employee.body.data.id as string;
    await request(app).post('/api/payroll/calculate').set(bearer(adminToken)).send({ ...MARCH, employeeId }).expect(200);

    const bonus = await request(app)
      .post('/api/salaries/adjustments')
      .set(bearer(adminToken))
      .send({ employeeId, ...MARCH, type: 'BONUS', category: 'MONTHLY', amount: 500_000, reason: 'Oylik reja bajarildi', date: '2026-03-25' });
    expect(bonus.status).toBe(201);
    expect(bonus.body.data).toMatchObject({ totalAmount: 4_500_000, payee: { type: 'EMPLOYEE', id: employeeId } });
    const both = await request(app)
      .post('/api/salaries/adjustments')
      .set(bearer(adminToken))
      .send({ employeeId, teacherProfileId: employeeId, ...MARCH, type: 'BONUS', category: 'MONTHLY', amount: 1_000, reason: 'Ikkalasi', date: '2026-03-25' });
    expect(both.status).toBe(422);

    const periodId = bonus.body.data.id as string;
    const advance = await request(app)
      .post(`/api/payroll/${periodId}/pay`)
      .set(bearer(adminToken))
      .send({ kind: 'ADVANCE', amount: 1_000_000, method: 'CASH' });
    expect(advance.body.data).toMatchObject({ paidAmount: 1_000_000, remainingAmount: 3_500_000 });

    expect((await request(app).post(`/api/payroll/${periodId}/approve`).set(bearer(adminToken))).body.data.status).toBe('PARTIALLY_PAID');
    const paid = await request(app).post(`/api/payroll/${periodId}/pay`).set(bearer(adminToken)).send({ amount: 3_500_000, method: 'BANK' });
    expect(paid.body.data).toMatchObject({ status: 'PAID', remainingAmount: 0 });

    const expenses = await prisma.expense.findMany({ include: { category: true } });
    expect(expenses).toHaveLength(2);
    expect(expenses.every((expense) => expense.category.key === 'EMPLOYEE_SALARY')).toBe(true);
    expect(await prisma.notification.count({ where: { userId: linked.id, title: 'Maosh to‘landi' } })).toBe(1);

    const report = await request(app).get('/api/reports/salaries').query({ from: '2026-03-01', to: '2026-03-31' }).set(bearer(adminToken));
    expect(report.status).toBe(200);
    expect(report.body.data.rows[0]).toMatchObject({ payee: 'Dilnoza Karimova', salaryType: 'Buxgalter' });
  });
});
