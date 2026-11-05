import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** ORG roadmap §5: tasdiqlangan ta'til va ruxsatlar, bayramlar — umumiy kalendarda */
const app = createApp();
const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe.skipIf(!hasTestDatabase)('ORG · umumiy kalendar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('oy bo‘yicha: bayram, tasdiqlangan ta’til va ruxsat, istisno; kutilayotgan so‘rov yo‘q; sabab faqat rahbarga; boshqa filial ko‘rinmaydi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Shodiya', lastName: 'S' });
    const { user: guli } = await createUserWithToken(app, { role: 'CALL_CENTER', firstName: 'Guli', lastName: 'G' });
    const { token: student } = await createUserWithToken(app, { role: 'STUDENT' });
    const other = await prisma.branch.create({ data: { key: 'SERGELI', name: 'Sergeli', sortOrder: 5 } });
    const { user: foreign } = await createUserWithToken(app, { role: 'CALL_CENTER', firstName: 'Begona', lastName: 'B' });
    await prisma.user.update({ where: { id: foreign.id }, data: { branchId: other.id } });

    const guliEmployee = await prisma.employee.create({ data: { userId: guli.id, firstName: 'Guli', lastName: 'G', position: 'CALL_CENTER', hireDate: day('2026-01-01') } });
    await prisma.staffHoliday.create({ data: { date: day('2026-11-18'), name: 'Mustaqillik bayrami' } });
    await prisma.employeeLeave.create({ data: { employeeId: guliEmployee.id, type: 'SICK', startDate: day('2026-10-30'), endDate: day('2026-11-02'), days: 4, reason: 'Shifokor ma’lumotnomasi', status: 'APPROVED' } });
    await prisma.employeeLeave.create({ data: { employeeId: guliEmployee.id, type: 'VACATION', startDate: day('2026-11-20'), endDate: day('2026-11-22'), days: 3, status: 'PENDING' } });
    await prisma.staffPermissionRequest.create({ data: { userId: salesUser.id, type: 'LATE_ARRIVAL', time: '10:00', startDate: day('2026-11-10'), endDate: day('2026-11-10'), reason: 'Bank', status: 'APPROVED' } });
    await prisma.staffPermissionRequest.create({ data: { userId: foreign.id, type: 'ABSENCE', startDate: day('2026-11-11'), endDate: day('2026-11-11'), reason: 'Begona filial', status: 'APPROVED' } });
    await prisma.staffScheduleException.create({ data: { userId: guli.id, date: day('2026-11-25'), type: 'DAY_OFF', reason: 'Almashtirildi' } });

    const manager = await request(app).get('/api/org/calendar').query({ month: '2026-11' }).set(bearer(admin));
    expect(manager.status).toBe(200);
    expect(manager.body.data).toMatchObject({ month: '2026-11', from: '2026-11-01', to: '2026-11-30', canSeeReasons: true });
    expect(manager.body.data.items.map((item: { kind: string; startDate: string; endDate: string }) => [item.kind, item.startDate, item.endDate])).toEqual([
      ['LEAVE', '2026-10-30', '2026-11-02'],
      ['LATE_ARRIVAL', '2026-11-10', '2026-11-10'],
      ['HOLIDAY', '2026-11-18', '2026-11-18'],
      ['DAY_OFF', '2026-11-25', '2026-11-25'],
    ]);
    expect(manager.body.data.items[0]).toMatchObject({ detail: 'Kasallik ta’tili', reason: 'Shifokor ma’lumotnomasi', person: { id: guli.id, name: 'Guli G' } });

    // Oddiy xodim kalendarni ko'radi, lekin sabablarni emas
    const staffView = await request(app).get('/api/org/calendar').query({ month: '2026-11' }).set(bearer(sales));
    expect(staffView.status).toBe(200);
    expect(staffView.body.data.canSeeReasons).toBe(false);
    expect(staffView.body.data.items.every((item: { reason: string | null }) => item.reason === null)).toBe(true);
    expect(staffView.body.data.items).toHaveLength(4);

    expect((await request(app).get('/api/org/calendar').query({ month: '2026-11' }).set(bearer(student))).status).toBe(403);
    expect((await request(app).get('/api/org/calendar').query({ month: '2026-13' }).set(bearer(admin))).status).toBe(422);
  });
});
