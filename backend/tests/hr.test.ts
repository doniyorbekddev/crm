import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { countDays } from '../src/services/employeeLeave.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function createEmployee(token: string, overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/employees')
    .set(bearer(token))
    .send({
      firstName: 'Dilnoza',
      lastName: 'Rahimova',
      phone: '+998901234567',
      position: 'ADMINISTRATOR',
      baseSalary: 4_000_000,
      hireDate: '2026-01-15',
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

describe('Ta’til kunlari hisobi', () => {
  it('ikkala chekka kun ham hisobga olinadi', () => {
    expect(countDays(new Date('2026-07-01T00:00:00.000Z'), new Date('2026-07-01T00:00:00.000Z'))).toBe(1);
    expect(countDays(new Date('2026-07-01T00:00:00.000Z'), new Date('2026-07-14T00:00:00.000Z'))).toBe(14);
  });
});

describe.skipIf(!hasTestDatabase)('HR — shartnoma, maxfiy ma’lumot va ta’til', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shartnoma va maxfiy ma’lumot saqlanadi, muddat hisoblanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const employee = await createEmployee(token, {
      department: 'Sotuv',
      email: 'dilnoza@local.uz',
      contractNumber: 'SH-2026-001',
      contractStartDate: '2026-01-15',
      contractEndDate: future,
      birthDate: '1998-04-20',
      passportNumber: 'AA1234567',
      address: 'Toshkent, Chilonzor',
      emergencyContact: 'Onasi',
      emergencyPhone: '+998901112233',
    });

    const response = await request(app).get(`/api/employees/${employee.id}`).set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.department).toBe('Sotuv');
    expect(response.body.data.contractNumber).toBe('SH-2026-001');
    expect(response.body.data.contractDaysLeft).toBeGreaterThan(25);
    expect(response.body.data.sensitive).toMatchObject({ passportNumber: 'AA1234567', emergencyContact: 'Onasi' });
  });

  it('maxfiy ma’lumot ruxsatsiz xodimga qaytarilmaydi', async () => {
    const { token: adminToken } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(adminToken, { passportNumber: 'AA7654321', birthDate: '1995-01-01' });

    // Buxgalterda employee.view bor, lekin employee.sensitive yo'q
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'buxgalter-hr@local.uz' });
    const response = await request(app).get(`/api/employees/${employee.id}`).set(bearer(accountantToken));

    expect(response.status).toBe(200);
    expect(response.body.data.firstName).toBe('Dilnoza');
    // Blok butunlay null — "bo'sh" va "ko'rsatilmadi" farqlanadi
    expect(response.body.data.sensitive).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('AA7654321');
  });

  it('ta’til arizasi yaratiladi, tasdiqlanadi va kunlar hisoblanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(token);

    const created = await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'VACATION', startDate: '2026-07-01', endDate: '2026-07-14', reason: 'Yillik ta’til' });

    expect(created.status).toBe(201);
    expect(created.body.data.days).toBe(14);
    expect(created.body.data.status).toBe('PENDING');

    const approved = await request(app)
      .post(`/api/employees/leaves/${created.body.data.id}/decide`)
      .set(bearer(token))
      .send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.decidedBy).toBeTruthy();

    // Xodim holati o'zgarmaydi — "ta'tilda" sanalardan hisoblanadi
    const stored = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(stored.status).toBe('ACTIVE');
  });

  it('tasdiqlangan ta’til ustiga ikkinchisi tushmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(token);

    const first = await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'VACATION', startDate: '2026-08-01', endDate: '2026-08-10' });
    await request(app).post(`/api/employees/leaves/${first.body.data.id}/decide`).set(bearer(token)).send({ status: 'APPROVED' }).expect(200);

    const overlapping = await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'SICK', startDate: '2026-08-05', endDate: '2026-08-12' });

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.message).toContain('ta\'til bor');
  });

  it('rad etishda sabab majburiy', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(token);
    const leave = await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'UNPAID', startDate: '2026-09-01', endDate: '2026-09-03' });

    const noReason = await request(app).post(`/api/employees/leaves/${leave.body.data.id}/decide`).set(bearer(token)).send({ status: 'REJECTED' });
    expect(noReason.status).toBe(422);

    const withReason = await request(app)
      .post(`/api/employees/leaves/${leave.body.data.id}/decide`)
      .set(bearer(token))
      .send({ status: 'REJECTED', note: 'Ish hajmi ko‘p' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.data.decisionNote).toBe('Ish hajmi ko‘p');

    // Rad etilgan ariza qayta tasdiqlanmaydi
    const again = await request(app)
      .post(`/api/employees/leaves/${leave.body.data.id}/decide`)
      .set(bearer(token))
      .send({ status: 'APPROVED' });
    expect(again.status).toBe(409);
  });

  it('bugungi ta’til xodim kartochkasida ko‘rinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(token);
    const today = new Date().toISOString().slice(0, 10);
    const leave = await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'SICK', startDate: today, endDate: today });
    await request(app).post(`/api/employees/leaves/${leave.body.data.id}/decide`).set(bearer(token)).send({ status: 'APPROVED' }).expect(200);

    const card = await request(app).get(`/api/employees/${employee.id}`).set(bearer(token));
    expect(card.body.data.onLeaveToday).toBe(true);

    const history = await request(app).get(`/api/employees/${employee.id}/leaves`).set(bearer(token));
    expect(history.body.data.onLeaveToday).toBe(true);
    expect(history.body.data.approvedDaysThisYear).toBe(1);
  });

  it('ta’tilni boshqarish huquqi yo‘q xodim ariza qo‘sha olmaydi', async () => {
    const { token: adminToken } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const employee = await createEmployee(adminToken);
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'buxgalter-leave@local.uz' });

    await request(app)
      .post('/api/employees/leaves')
      .set(bearer(token))
      .send({ employeeId: employee.id, type: 'VACATION', startDate: '2026-10-01', endDate: '2026-10-05' })
      .expect(403);

    // Ko'rish esa mumkin
    await request(app).get('/api/employees/leaves').set(bearer(token)).expect(200);
  });
});
