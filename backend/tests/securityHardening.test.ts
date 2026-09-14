import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { binaryParser } from './helpers/zip.js';

const app = createApp();

/** 1×1 PNG */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');

async function createRole(key: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  return prisma.role.create({
    data: { key, name: key, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
}

describe.skipIf(!hasTestDatabase)('Xavfsizlik: moliya va kadrlar ma’lumotlari (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rollar matritsasi: moliya, maosh va tasdiq amallari faqat tegishli rolga (spec 74)', async () => {
    const tokens = {
      owner: (await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' })).token,
      admin: (await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' })).token,
      accountant: (await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'acc@test.uz' })).token,
      teacher: (await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' })).token,
      sales: (await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' })).token,
    };
    const status = async (token: string, method: 'get' | 'post' | 'put', url: string) => (await request(app)[method](url).set(bearer(token)).send({})).status;

    // Ko'rish: o'qituvchi va sotuv menejeri moliya/maoshni ko'rmaydi
    for (const url of ['/api/finance/summary', '/api/finance/profit-loss', '/api/salaries/periods', '/api/payroll', '/api/incomes', '/api/expenses', '/api/analytics/unit-economics']) {
      expect(await status(tokens.teacher, 'get', url)).toBe(403);
      expect(await status(tokens.sales, 'get', url)).toBe(403);
    }
    expect(await status(tokens.accountant, 'get', '/api/finance/summary')).toBe(200);
    expect(await status(tokens.accountant, 'get', '/api/salaries/periods')).toBe(200);

    // Tasdiqlash va qayta ochish: buxgalter emas, rahbar
    expect(await status(tokens.accountant, 'post', '/api/payroll/yoq/approve')).toBe(403);
    expect(await status(tokens.accountant, 'post', '/api/expenses/yoq/approve')).toBe(403);
    expect(await status(tokens.accountant, 'post', '/api/finance/periods/reopen')).toBe(403);
    expect(await status(tokens.admin, 'post', '/api/payroll/yoq/unlock')).toBe(403);
    expect(await status(tokens.admin, 'post', '/api/expenses/yoq/approve')).toBe(403);
    expect(await status(tokens.admin, 'put', '/api/alerts/settings')).toBe(403);
    // Rahbar ruxsatdan o'tadi (yozuv yo'q — 404)
    expect(await status(tokens.owner, 'post', '/api/payroll/yoq/approve')).toBe(404);
    expect(await status(tokens.owner, 'post', '/api/expenses/yoq/approve')).toBe(404);
    // To'lash: buxgalter ruxsatdan o'tadi, o'qituvchi yo'q
    expect(await status(tokens.accountant, 'post', '/api/payroll/yoq/pay')).not.toBe(403);
    expect(await status(tokens.teacher, 'post', '/api/payroll/yoq/pay')).toBe(403);
  });

  it('qarzdorlik va to‘lov hisobotlari modul ruxsatini ham talab qiladi', async () => {
    await createRole('ANALYST', [PERMISSIONS.REPORT_VIEW]);
    const { token: analyst } = await createUserWithToken(app, { role: 'ANALYST', email: 'analyst@test.uz' });
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'acc@test.uz' });

    expect((await request(app).get('/api/reports/debts').set(bearer(analyst))).status).toBe(403);
    expect((await request(app).get('/api/reports/payments').set(bearer(analyst))).status).toBe(403);
    expect((await request(app).get('/api/reports/sales').set(bearer(analyst))).status).toBe(200);
    expect((await request(app).get('/api/reports/debts').set(bearer(accountant))).status).toBe(200);
    expect((await request(app).get('/api/reports/payments').set(bearer(accountant))).status).toBe(200);
  });

  it('xodim maoshi salary.view bo‘lmasa qaytarilmaydi; xodim hujjatini yuklab olish auditga yoziladi; eksport keshlanmaydi', async () => {
    await createRole('HR_ASSISTANT', [PERMISSIONS.EMPLOYEE_VIEW]);
    const { token: hr } = await createUserWithToken(app, { role: 'HR_ASSISTANT', email: 'hr@test.uz' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
    const employee = await prisma.employee.create({
      data: { firstName: 'Dilnoza', lastName: 'Karimova', position: 'ACCOUNTANT', baseSalary: 4_700_000, hireDate: new Date('2025-01-10') },
    });

    const masked = await request(app).get('/api/employees').set(bearer(hr));
    expect(masked.status).toBe(200);
    expect(masked.body.data[0]).toMatchObject({ firstName: 'Dilnoza', baseSalary: null, currentSalary: null });
    expect(JSON.stringify(masked.body)).not.toContain('4700000');
    expect((await request(app).get(`/api/employees/${employee.id}`).set(bearer(hr))).body.data.baseSalary).toBeNull();
    expect((await request(app).get('/api/employees').set(bearer(owner))).body.data[0].baseSalary).toBe(4_700_000);

    const uploaded = await request(app)
      .post(`/api/employees/${employee.id}/documents`)
      .query({ category: 'PASSPORT' })
      .set(bearer(owner))
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'pasport.png')
      .send(PNG);
    expect(uploaded.status).toBe(201);
    const download = await request(app).get(`/api/documents/${uploaded.body.data.id}/download`).set(bearer(owner)).buffer(true).parse(binaryParser);
    expect(download.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'document.downloaded', entityId: employee.id } })).toBe(1);

    const exported = await request(app).get('/api/audit-logs/export').query({ format: 'csv' }).set(bearer(owner));
    expect(exported.status).toBe(200);
    expect(exported.headers['cache-control']).toContain('no-store');
  });

  it('hisob darajasida blok: 8 ta noto‘g‘ri paroldan keyin to‘g‘ri parol ham vaqtincha qabul qilinmaydi', async () => {
    await createUserWithToken(app, { role: 'ADMIN', email: 'victim@test.uz' });
    await createUserWithToken(app, { role: 'ADMIN', email: 'other@test.uz' });
    const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await login('victim@test.uz', 'NotThePassword1')).status).toBe(401);
    }
    const locked = await login('victim@test.uz', 'Password123');
    expect(locked.status).toBe(429);
    expect(locked.body.message).toContain('bloklandi');
    expect(await prisma.auditLog.count({ where: { action: 'auth.login_locked' } })).toBe(1);

    // Boshqa hisob ta'sirlanmaydi
    expect((await login('other@test.uz', 'Password123')).status).toBe(200);

    // Mavjud bo'lmagan email ham xuddi shunday javob beradi — hisob borligi oshkor bo'lmaydi
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await login('ghost@test.uz', 'NotThePassword1')).status).toBe(401);
    }
    expect((await login('ghost@test.uz', 'NotThePassword1')).status).toBe(429);
  });
});
