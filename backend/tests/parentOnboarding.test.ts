import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
let counter = 0;

/** Ota-onalarni ulash: o'quvchi ma'lumotidan ota-ona profillari va guruh Telegram taklifnomalari */
describe.skipIf(!hasTestDatabase)('Ota-onalarni ulash (integratsion)', () => {
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

  function student(firstName: string, parentPhone: string | null) {
    counter += 1;
    return prisma.student.create({
      data: { firstName, lastName: 'Valiyev', phone: `+99890${String(5_000_000 + counter)}`, parentPhone, courseId, groupId, contractPrice: 0, startDate: new Date('2026-09-01') },
    });
  }
  const runImport = (dryRun: boolean, token = admin) => request(app).post('/api/parents/import-from-students').set(bearer(token)).send({ dryRun });

  it('ko‘rib chiqish hech narsa yozmaydi; tasdiqlash: aka-uka bitta ota-onaga, mavjud ota-onaga bog‘lanadi, takror ishga tushirish xavfsiz', async () => {
    const ali = await student('Ali', '+998935550001');
    const vali = await student('Vali', '+998935550001'); // aka-uka — bir telefon
    const sami = await student('Sami', '+998935550002'); // shu telefonli ota-ona bor
    await student('Gani', null); // ota-ona telefoni yo'q
    const existing = await prisma.parent.create({ data: { firstName: 'Zarina', lastName: 'Karimova', phone: '+998935550002' } });
    const linkedAlready = await student('Bek', '+998935550003');
    const own = await prisma.parent.create({ data: { firstName: 'Bobur', lastName: 'Aliyev', phone: '+998935550099' } });
    await prisma.studentParent.create({ data: { studentId: linkedAlready.id, parentId: own.id, isPrimary: true } });

    const plan = await runImport(true);
    expect(plan.status).toBe(200);
    expect(plan.body.data).toMatchObject({ dryRun: true, created: 1, linkedToExisting: 1, skippedAlreadyLinked: 1 });
    expect(await prisma.parent.count()).toBe(2);

    const done = await runImport(false);
    expect(done.body.data).toMatchObject({ dryRun: false, created: 1, linkedToExisting: 1 });
    const created = await prisma.parent.findFirstOrThrow({ where: { phone: '+998935550001' }, include: { students: true } });
    expect(created).toMatchObject({ firstName: 'Ali Valiyevning', lastName: 'ota-onasi' });
    expect(created.notes).toContain('aniqlashtiring');
    expect(created.students.map((link) => link.studentId).sort()).toEqual([ali.id, vali.id].sort());
    expect(await prisma.studentParent.findFirst({ where: { studentId: sami.id, parentId: existing.id } })).not.toBeNull();
    // O'quvchidagi ota-ona telefoni o'zgarmaydi
    expect((await prisma.student.findUniqueOrThrow({ where: { id: ali.id } })).parentPhone).toBe('+998935550001');

    const again = await runImport(false);
    expect(again.body.data).toMatchObject({ created: 0, linkedToExisting: 0, skippedAlreadyLinked: 4, items: [] });
    expect(await prisma.parent.count()).toBe(3);
  });

  it('o‘qituvchi import qila olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await runImport(true, token)).status).toBe(403);
  });

  it('guruh taklifnomalari: o‘quvchi va ota-ona uchun 14 kunlik kod, ulanganlar belgilanadi, takror so‘rovda kod o‘zgarmaydi', async () => {
    const ali = await student('Ali', '+998935550001');
    const vali = await student('Vali', '+998935550001');
    await runImport(false);
    const parent = await prisma.parent.findFirstOrThrow();
    // Vali allaqachon ulangan
    await prisma.telegramLink.create({ data: { studentId: vali.id, linkCode: 'linked-code', chatId: '777', verifiedAt: new Date() } });

    const first = await request(app).post(`/api/groups/${groupId}/telegram-invites`).set(bearer(admin));
    expect(first.status).toBe(200);
    expect(first.body.data.group).toMatchObject({ id: groupId, name: 'FE-1' });
    const byId = Object.fromEntries(first.body.data.rows.map((row: { student: { id: string } }) => [row.student.id, row]));
    expect(byId[vali.id].link).toMatchObject({ linked: true, deepLink: null });
    expect(byId[ali.id].link.linked).toBe(false);
    expect(byId[ali.id].parents).toEqual([expect.objectContaining({ id: parent.id, phone: '+998935550001' })]);

    const code = await prisma.telegramLink.findFirstOrThrow({ where: { studentId: ali.id } });
    const days = (code.codeExpiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    // Ota-ona aka-uka uchun bitta kod
    expect(await prisma.telegramLink.count({ where: { parentId: parent.id } })).toBe(1);

    await request(app).post(`/api/groups/${groupId}/telegram-invites`).set(bearer(admin)).expect(200);
    expect((await prisma.telegramLink.findFirstOrThrow({ where: { studentId: ali.id } })).linkCode).toBe(code.linkCode);
  });

  it('taklifnoma: noto‘g‘ri guruh — 404, ruxsatsiz — 403', async () => {
    expect((await request(app).post('/api/groups/clnotexistinggroup00000000/telegram-invites').set(bearer(admin))).status).toBe(404);
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).post(`/api/groups/${groupId}/telegram-invites`).set(bearer(token))).status).toBe(403);
  });
});
