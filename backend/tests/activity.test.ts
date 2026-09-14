import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { auditService } from '../src/services/audit.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();
const at = (value: string) => new Date(`${value}T09:00:00.000Z`);

describe.skipIf(!hasTestDatabase)('Faoliyat markazi va audit eksporti (integratsion)', () => {
  let owner: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('turli manbalar bitta vaqt chizig‘ida, sahifalab va tur bo‘yicha filtr bilan', async () => {
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id, name: 'FE-01' });
    const student = (phone: string, firstName: string, createdAt: Date) =>
      prisma.student.create({
        data: { firstName, lastName: 'Test', phone, courseId: course.id, groupId: group.id, contractPrice: 1_000_000, startDate: createdAt, createdAt },
      });
    const ali = await student('+998901110001', 'Ali', at('2026-09-01'));
    const vali = await student('+998901110002', 'Vali', at('2026-08-31'));

    await prisma.payment.create({ data: { studentId: ali.id, courseId: course.id, amount: 800_000, method: 'CASH', paidAt: at('2026-09-02') } });
    const rent = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });
    await prisma.expense.create({ data: { categoryId: rent.id, amount: 3_000_000, status: 'PAID', vendor: 'Biznes markaz', createdAt: at('2026-09-03') } });
    const source = await createSource('Instagram');
    await prisma.lead.create({ data: { firstName: 'Soli', phone: '+998901110003', sourceId: source.id, createdAt: at('2026-09-04') } });
    await prisma.attendanceSession.create({
      data: {
        groupId: group.id,
        date: new Date('2026-09-05T00:00:00.000Z'),
        topic: 'Flexbox',
        createdAt: at('2026-09-05'),
        attendances: {
          create: [
            { studentId: ali.id, groupId: group.id, date: new Date('2026-09-05T00:00:00.000Z'), status: 'PRESENT' },
            { studentId: vali.id, groupId: group.id, date: new Date('2026-09-05T00:00:00.000Z'), status: 'ABSENT' },
          ],
        },
      },
    });
    await prisma.homework.create({ data: { title: 'Grid layout', groupId: group.id, deadline: at('2026-09-10'), createdAt: at('2026-09-06') } });
    const employee = await prisma.employee.create({
      data: { firstName: 'Dilnoza', lastName: 'Karimova', position: 'ACCOUNTANT', baseSalary: 4_000_000, hireDate: new Date('2025-01-10') },
    });
    const period = await prisma.teacherSalaryPeriod.create({ data: { employeeId: employee.id, year: 2026, month: 8, salaryType: 'FIXED', totalAmount: 4_000_000 } });
    await prisma.teacherSalaryPayment.create({ data: { periodId: period.id, amount: 1_000_000, kind: 'ADVANCE', paidAt: at('2026-09-07') } });

    const first = await request(app).get('/api/dashboard/activity').query({ limit: 3 }).set(bearer(owner));
    expect(first.status).toBe(200);
    expect(first.body.data.types).toEqual(['student', 'payment', 'expense', 'lead', 'attendance', 'teaching', 'salary']);
    expect(first.body.data.items.map((item: { type: string }) => item.type)).toEqual(['salary', 'teaching', 'attendance']);
    expect(first.body.data.items[0]).toMatchObject({ title: 'Avans: Dilnoza Karimova', description: '2026-yil avgust', amount: -1_000_000, tone: 'negative', link: '/salaries' });
    expect(first.body.data.items[2]).toMatchObject({ title: 'Davomat: FE-01', description: '05.09.2026 · 1/2 keldi · Flexbox' });
    expect(first.body.data.nextCursor).toBe(at('2026-09-05').toISOString());

    const second = await request(app).get('/api/dashboard/activity').query({ limit: 3, cursor: first.body.data.nextCursor }).set(bearer(owner));
    expect(second.body.data.items.map((item: { type: string }) => item.type)).toEqual(['lead', 'expense', 'payment']);
    expect(second.body.data.items[1]).toMatchObject({ title: 'Xarajat: Ijara', description: 'Biznes markaz · to‘langan', amount: -3_000_000 });
    expect(second.body.data.items[2]).toMatchObject({ title: 'To‘lov: Ali Test', amount: 800_000, link: `/students/${ali.id}` });

    const third = await request(app).get('/api/dashboard/activity').query({ limit: 3, cursor: second.body.data.nextCursor }).set(bearer(owner));
    expect(third.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Yangi o‘quvchi: Ali Test', 'Yangi o‘quvchi: Vali Test']);
    expect(third.body.data.nextCursor).toBeNull();

    const money = await request(app).get('/api/dashboard/activity').query({ types: 'payment,expense' }).set(bearer(owner));
    expect(money.body.data.items.map((item: { type: string }) => item.type)).toEqual(['expense', 'payment']);

    const ranged = await request(app).get('/api/dashboard/activity').query({ from: '2026-09-04', to: '2026-09-05' }).set(bearer(owner));
    expect(ranged.body.data.items.map((item: { type: string }) => item.type)).toEqual(['attendance', 'lead']);

    expect((await request(app).get('/api/dashboard/activity').query({ types: 'hacker' }).set(bearer(owner))).status).toBe(422);
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await request(app).get('/api/dashboard/activity').set(bearer(sales))).status).toBe(403);
  });

  it('audit jurnali filtr bilan eksport qilinadi va eksportning o‘zi auditga yoziladi', async () => {
    const { user: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' });
    await auditService.record({ userId: admin.id, action: 'student.deleted', entityType: 'student', entityId: 'st-1', metadata: { name: 'Ali Test' } });
    await auditService.record({ userId: admin.id, action: 'lead.created', entityType: 'lead', entityId: 'ld-1' });

    const csv = await request(app).get('/api/audit-logs/export').query({ format: 'csv', entityType: 'student' }).set(bearer(owner));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('st-1');
    expect(csv.text).not.toContain('ld-1');
    expect(await prisma.auditLog.count({ where: { action: 'audit.exported' } })).toBe(1);

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales2@test.uz' });
    expect((await request(app).get('/api/audit-logs/export').set(bearer(sales))).status).toBe(403);
  });
});
