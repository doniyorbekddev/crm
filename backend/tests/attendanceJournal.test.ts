import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
let counter = 0;

/** Oylik davomat jurnali: 2026-yil sentabr (1-sentabr — seshanba), jadval: dushanba/chorshanba/juma */
describe.skipIf(!hasTestDatabase)('Davomat: oylik jurnal (integratsion)', () => {
  let teacherToken: string;
  let groupId: string;
  let courseId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    const teacher = await createUserWithToken(app, { role: 'TEACHER' });
    teacherToken = teacher.token;
    courseId = (await createCourse()).id;
    groupId = (await createGroup({ courseId, teacherId: teacher.user.id, name: 'FE-1', startDate: '2026-09-01' })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function enroll(firstName: string, group: string | null = groupId) {
    counter += 1;
    return prisma.student.create({
      data: { firstName, lastName: 'Test', phone: `+99890${String(7_000_000 + counter)}`, courseId, groupId: group, contractPrice: 0, startDate: new Date('2026-09-01') },
    });
  }
  const mark = (date: string, records: Array<{ studentId: string; status: string }>) =>
    request(app).post(`/api/groups/${groupId}/attendance`).set(bearer(teacherToken)).send({ date, records });

  it('dars kunlari, belgilar, jadvaldan tashqari kun, guruhdan chiqqan o‘quvchi va jami', async () => {
    const ali = await enroll('Ali');
    const vali = await enroll('Vali');
    const left = await enroll('Sami');
    await mark('2026-09-14', [
      { studentId: ali.id, status: 'PRESENT' },
      { studentId: vali.id, status: 'ABSENT' },
      { studentId: left.id, status: 'LATE' },
    ]).expect(200);
    await mark('2026-09-15', [{ studentId: ali.id, status: 'EXCUSED' }]).expect(200); // seshanba — jadvalda yo'q
    await prisma.student.update({ where: { id: left.id }, data: { groupId: null } }); // keyin guruhdan chiqdi

    const response = await request(app).get(`/api/groups/${groupId}/attendance/month`).query({ month: '2026-09' }).set(bearer(teacherToken));
    expect(response.status).toBe(200);
    const journal = response.body.data;
    expect(journal.days.filter((day: { scheduled: boolean }) => day.scheduled)).toHaveLength(13);
    expect(journal.days.find((day: { date: string }) => day.date === '2026-09-15')).toMatchObject({ scheduled: false, marked: 1 });
    expect(journal.days.find((day: { date: string }) => day.date === '2026-09-14')).toMatchObject({ scheduled: true, session: 'HELD', marked: 3, absent: 1 });

    const byName = Object.fromEntries(journal.students.map((row: { name: string }) => [row.name, row]));
    expect(byName['Test Ali']).toMatchObject({ former: false, cells: { '2026-09-14': 'PRESENT', '2026-09-15': 'EXCUSED' }, totals: { PRESENT: 1, EXCUSED: 1, marked: 2, rate: 50 } });
    expect(byName['Test Vali'].totals).toMatchObject({ ABSENT: 1, rate: 0 });
    expect(byName['Test Sami']).toMatchObject({ former: true, cells: { '2026-09-14': 'LATE' } });
    // Sobiq a'zo oxirida
    expect(journal.students.at(-1).name).toBe('Test Sami');
    expect(journal.totals).toMatchObject({ PRESENT: 1, LATE: 1, EXCUSED: 1, ABSENT: 1, marked: 4, rate: 50 });
  });

  it('eksport: CSV belgilar bilan, XLSX fayl', async () => {
    const ali = await enroll('Ali');
    await mark('2026-09-14', [{ studentId: ali.id, status: 'PRESENT' }]).expect(200);
    const csv = await request(app).get(`/api/groups/${groupId}/attendance/month/export`).query({ month: '2026-09', format: 'csv' }).set(bearer(teacherToken));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('14.09');
    expect(csv.text).toMatch(/Test Ali.*\+/);
    const xlsx = await request(app).get(`/api/groups/${groupId}/attendance/month/export`).query({ month: '2026-09', format: 'xlsx' }).set(bearer(teacherToken));
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('begona o‘qituvchi — 404; noto‘g‘ri oy — 422', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get(`/api/groups/${groupId}/attendance/month`).query({ month: '2026-09' }).set(bearer(token))).status).toBe(404);
    expect((await request(app).get(`/api/groups/${groupId}/attendance/month`).query({ month: '2026-13' }).set(bearer(teacherToken))).status).toBe(422);
  });
});
