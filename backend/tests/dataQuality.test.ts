import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
let counter = 0;

describe.skipIf(!hasTestDatabase)('Ma’lumotlar sifati (integratsion)', () => {
  let admin: string;
  let courseId: string;
  let groupId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: admin } = await createUserWithToken(app, { role: 'ADMIN' }));
    courseId = (await createCourse()).id;
    groupId = (await createGroup({ courseId, name: 'FE-1' })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function student(data: { parentPhone?: string | null; groupId?: string | null; contract?: number }) {
    counter += 1;
    const contract = data.contract ?? 600_000;
    return prisma.student.create({
      data: {
        firstName: `O‘quvchi${counter}`,
        lastName: 'Test',
        phone: `+99890${String(6_000_000 + counter)}`,
        parentPhone: data.parentPhone ?? null,
        courseId,
        groupId: data.groupId === undefined ? groupId : data.groupId,
        contractPrice: contract,
        startDate: new Date('2026-09-01'),
        debt: { create: { totalAmount: contract, paidAmount: 0, remainingAmount: contract } },
      },
    });
  }
  const check = (body: { checks: Array<{ key: string; count: number }> }, key: string) => body.checks.find((item) => item.key === key)!;

  it('sanoqlar va namunalar: guruhsiz, ota-onasiz, import qilinmagan, Telegram, jadval nomuvofiqligi, mayda qoldiq', async () => {
    const withPhone = await student({ parentPhone: '+998935550001' });
    await student({ groupId: null });
    await student({});
    // Jadval: 2 qism, birinchisi muddati o'tgan; 10 000 to'langan → 290 000 muddati o'tgan (mayda emas)
    const scheduled = await student({ contract: 600_000 });
    await prisma.paymentInstallment.createMany({
      data: [
        { studentId: scheduled.id, sequence: 1, dueDate: new Date('2026-09-05'), amount: 300_000 },
        { studentId: scheduled.id, sequence: 2, dueDate: new Date('2030-10-05'), amount: 300_000 },
      ],
    });
    // Mayda qoldiq: 300 000 muddati o'tgan, 280 000 to'langan → 20 000
    const small = await student({ contract: 300_000 });
    await prisma.paymentInstallment.create({ data: { studentId: small.id, sequence: 1, dueDate: new Date('2026-09-05'), amount: 300_000 } });
    await prisma.debt.update({ where: { studentId: small.id }, data: { paidAmount: 280_000, remainingAmount: 20_000 } });
    // Nomuvofiq: jadval 500 000, shartnoma 600 000
    const mismatch = await student({ contract: 600_000 });
    await prisma.paymentInstallment.create({ data: { studentId: mismatch.id, sequence: 1, dueDate: new Date('2030-10-05'), amount: 500_000 } });
    await prisma.group.create({ data: { name: 'Egasiz', courseId, scheduleDays: ['MONDAY'], startTime: '10:00', endTime: '11:00', startDate: new Date('2026-09-01'), status: 'ACTIVE' } });

    const response = await request(app).get('/api/data-quality').set(bearer(admin));
    expect(response.status).toBe(200);
    const body = response.body.data;
    expect(body.activeStudents).toBe(6);
    expect(check(body, 'parentPhoneNotImported')).toMatchObject({ count: 1, sample: [expect.objectContaining({ id: withPhone.id })] });
    expect(check(body, 'noParentAtAll').count).toBe(5);
    expect(check(body, 'noGroup').count).toBe(1);
    expect(check(body, 'noTelegram').count).toBe(6);
    expect(check(body, 'noPortal').count).toBe(6);
    expect(check(body, 'scheduleMismatch')).toMatchObject({ count: 1, sample: [expect.objectContaining({ id: mismatch.id })] });
    expect(check(body, 'smallOverdue')).toMatchObject({ count: 1, sample: [expect.objectContaining({ id: small.id, subtitle: expect.stringContaining('20') })] });
    expect(check(body, 'groupsNoTeacher').count).toBe(2);

    // Import qilingach — "import qilinmagan" yo'qoladi, "ismi aniqlashtirilmagan" paydo bo'ladi
    await request(app).post('/api/parents/import-from-students').set(bearer(admin)).send({ dryRun: false }).expect(200);
    const after = (await request(app).get('/api/data-quality').set(bearer(admin))).body.data;
    expect(check(after, 'parentPhoneNotImported').count).toBe(0);
    expect(check(after, 'importedParentNames').count).toBe(1);
    expect(check(after, 'noParentAtAll').count).toBe(5);
  });

  it('o‘qituvchiga yopiq', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get('/api/data-quality').set(bearer(token))).status).toBe(403);
  });
});
