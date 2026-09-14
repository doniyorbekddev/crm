import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

let phoneCounter = 0;

function studentBody(courseId: string, groupId?: string) {
  phoneCounter += 1;
  return {
    firstName: 'Madina',
    lastName: 'Yusupova',
    phone: `+99890${String(8_100_000 + phoneCounter)}`,
    courseId,
    startDate: '2026-09-01',
    ...(groupId ? { groupId } : {}),
  };
}

async function setup() {
  const { token: owner, user } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
  const course = await createCourse('Frontend');
  const otherCourse = await createCourse('English');
  const first = await createGroup({ courseId: course.id, name: 'FE-01', capacity: 3 });
  const second = await createGroup({ courseId: course.id, name: 'FE-02', capacity: 3 });
  const foreign = await createGroup({ courseId: otherCourse.id, name: 'EN-01' });
  return { owner, user, course, first, second, foreign };
}

async function createStudent(token: string, courseId: string, groupId?: string): Promise<string> {
  const response = await request(app).post('/api/students').set(bearer(token)).send(studentBody(courseId, groupId));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

const transfer = (token: string, studentId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/students/${studentId}/transfer`).set(bearer(token)).send(body);
const history = (token: string, studentId: string) => request(app).get(`/api/students/${studentId}/group-history`).set(bearer(token));

describe.skipIf(!hasTestDatabase)('O‘quvchi guruh tarixi va o‘tkazish (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('qo‘shilish, o‘tkazish va chiqarish tarixga, auditga, profil va faoliyat lentasiga yoziladi', async () => {
    const { owner, user, course, first, second } = await setup();
    const studentId = await createStudent(owner, course.id, first.id);

    const initial = await history(owner, studentId);
    expect(initial.status).toBe(200);
    expect(initial.body.data).toEqual([
      expect.objectContaining({
        kind: 'ENROLLED',
        from: null,
        to: { id: first.id, name: 'FE-01' },
        reason: 'O‘quvchi qo‘shildi',
        changedBy: { id: user.id, firstName: user.firstName, lastName: user.lastName },
        daysInPreviousGroup: null,
      }),
    ]);

    const moved = await transfer(owner, studentId, { groupId: second.id, reason: 'Dars vaqti to‘g‘ri kelmadi' });
    expect(moved.status).toBe(200);
    expect(moved.body.message).toBe('O‘quvchi guruhga o‘tkazildi');
    expect(moved.body.data.group).toMatchObject({ id: second.id, name: 'FE-02' });

    // Guruh keyin qayta nomlansa ham tarixda o'sha paytdagi nom qoladi
    await prisma.group.update({ where: { id: first.id }, data: { name: 'FE-01 (eski)' } });
    const afterMove = (await history(owner, studentId)).body.data;
    expect(afterMove).toHaveLength(2);
    expect(afterMove[0]).toMatchObject({
      kind: 'TRANSFERRED',
      from: { id: first.id, name: 'FE-01' },
      to: { id: second.id, name: 'FE-02' },
      reason: 'Dars vaqti to‘g‘ri kelmadi',
      daysInPreviousGroup: 0,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'student.group_changed', entityId: studentId } });
    expect(audit.metadata).toMatchObject({ from: 'FE-01', to: 'FE-02', reason: 'Dars vaqti to‘g‘ri kelmadi' });

    const removed = await transfer(owner, studentId, { groupId: null, reason: 'O‘qishni vaqtincha to‘xtatdi' });
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('O‘quvchi guruhdan chiqarildi');
    expect(removed.body.data.group).toBeNull();
    expect((await history(owner, studentId)).body.data[0]).toMatchObject({ kind: 'REMOVED', from: { name: 'FE-02' }, to: null });

    const profile = await request(app).get(`/api/students/${studentId}/profile`).set(bearer(owner));
    const groupActivity = profile.body.data.activity.filter((item: { type: string }) => item.type === 'group');
    expect(groupActivity.map((item: { title: string }) => item.title)).toEqual([
      'Guruhdan chiqarildi: FE-02',
      'Guruh almashtirildi: FE-01 → FE-02',
      'Guruhga qo‘shildi: FE-01',
    ]);

    const feed = await request(app).get('/api/dashboard/activity').query({ types: 'student' }).set(bearer(owner));
    expect(feed.status).toBe(200);
    const titles = feed.body.data.items.map((item: { title: string }) => item.title);
    expect(titles).toContain('Guruh almashtirildi: Madina Yusupova');
    expect(titles).toContain('Guruhdan chiqarildi: Madina Yusupova');
  });

  it('leaddan aylantirish va tahrirlashda guruh o‘zgarsa tarixga yoziladi, o‘zgarmasa yozilmaydi', async () => {
    const { owner, course, first, second } = await setup();
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, courseId: course.id, phone: '+998935551100' });
    const converted = await request(app).post(`/api/leads/${lead.id}/convert`).set(bearer(owner)).send({ groupId: first.id });
    expect(converted.status).toBe(201);
    const convertedId = converted.body.data.id as string;
    expect((await history(owner, convertedId)).body.data[0]).toMatchObject({ kind: 'ENROLLED', reason: 'Leaddan o‘quvchiga aylantirildi' });

    const studentId = await createStudent(owner, course.id);
    expect((await history(owner, studentId)).body.data).toEqual([]);

    const body = { ...studentBody(course.id, first.id) };
    expect((await request(app).put(`/api/students/${studentId}`).set(bearer(owner)).send(body)).status).toBe(200);
    expect((await request(app).put(`/api/students/${studentId}`).set(bearer(owner)).send(body)).status).toBe(200);
    expect((await request(app).put(`/api/students/${studentId}`).set(bearer(owner)).send({ ...body, groupId: second.id })).status).toBe(200);

    const rows = (await history(owner, studentId)).body.data;
    expect(rows.map((row: { kind: string }) => row.kind)).toEqual(['TRANSFERRED', 'ENROLLED']);
    expect(rows[0].reason).toBe('Ma’lumotlarni tahrirlash orqali');
  });

  it('o‘tkazish qoidalari: shu guruh, boshqa kurs, yopilgan va to‘lgan guruh, sababsiz so‘rov rad etiladi', async () => {
    const { owner, course, first, second, foreign } = await setup();
    const studentId = await createStudent(owner, course.id, first.id);
    const reason = 'Sinov uchun';

    const same = await transfer(owner, studentId, { groupId: first.id, reason });
    expect(same.status).toBe(422);
    expect(same.body.errors).toEqual([{ field: 'groupId', message: 'O‘quvchi allaqachon shu guruhda' }]);

    const otherCourse = await transfer(owner, studentId, { groupId: foreign.id, reason });
    expect(otherCourse.status).toBe(422);
    expect(otherCourse.body.errors[0].message).toContain('kursiga tegishli emas');

    expect((await transfer(owner, studentId, { groupId: 'clnotexistinggroup00000000', reason })).status).toBe(422);
    expect((await transfer(owner, studentId, { groupId: second.id })).status).toBe(422);
    expect((await transfer(owner, studentId, { groupId: second.id, reason: 'ab' })).status).toBe(422);

    const closed = await createGroup({ courseId: course.id, name: 'FE-00' });
    await prisma.group.update({ where: { id: closed.id }, data: { status: 'COMPLETED' } });
    const toClosed = await transfer(owner, studentId, { groupId: closed.id, reason });
    expect(toClosed.status).toBe(422);
    expect(toClosed.body.errors[0].message).toContain('yopilgan');

    const tiny = await createGroup({ courseId: course.id, name: 'FE-03', capacity: 1 });
    await createStudent(owner, course.id, tiny.id);
    const full = await transfer(owner, studentId, { groupId: tiny.id, reason });
    expect(full.status).toBe(422);
    expect(full.body.errors[0].message).toBe('«FE-03» guruhida bo‘sh o‘rin yo‘q');

    expect((await history(owner, studentId)).body.data).toHaveLength(1);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: studentId } })).groupId).toBe(first.id);
  });

  it('bir vaqtda ikki o‘quvchi oxirgi bo‘sh o‘ringa o‘tkazilsa, faqat bittasi sig‘adi', async () => {
    const { owner, course } = await setup();
    const lastSeat = await createGroup({ courseId: course.id, name: 'FE-09', capacity: 1 });
    const a = await createStudent(owner, course.id);
    const b = await createStudent(owner, course.id);

    const results = await Promise.all([
      transfer(owner, a, { groupId: lastSeat.id, reason: 'Parallel sinov' }),
      transfer(owner, b, { groupId: lastSeat.id, reason: 'Parallel sinov' }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 422]);
    expect(await prisma.student.count({ where: { groupId: lastSeat.id } })).toBe(1);
    expect(await prisma.studentGroupChange.count({ where: { toGroupId: lastSeat.id } })).toBe(1);
  });

  it('ruxsatlar: o‘tkazish faqat o‘quvchilarni boshqaradigan xodimga', async () => {
    const { owner, course, first, second } = await setup();
    const studentId = await createStudent(owner, course.id, first.id);
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });

    expect((await transfer(teacher, studentId, { groupId: second.id, reason: 'Ruxsatsiz' })).status).toBe(403);
    expect((await transfer(sales, studentId, { groupId: second.id, reason: 'Ruxsatsiz' })).status).toBe(403);
    expect((await request(app).get(`/api/students/${studentId}/group-history`)).status).toBe(401);
  });
});
