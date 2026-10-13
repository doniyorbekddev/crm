import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { businessDateString } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * O'qituvchi davomati 2.0: kunlik taxta (shu sanaga darsi bor guruhlar), guruh jurnali doirasi,
 * takrorlanmaslik va bir vaqtdagi saqlash.
 */
const app = createApp();
// 2026-09-14 — dushanba, 2026-09-15 — seshanba, 2026-09-13 — yakshanba
const MONDAY = '2026-09-14';
const TUESDAY = '2026-09-15';
const SUNDAY = '2026-09-13';

let phone = 0;
function enroll(courseId: string, groupId: string, firstName: string, status: 'ACTIVE' | 'FROZEN' | 'DROPPED' = 'ACTIVE') {
  phone += 1;
  return prisma.student.create({
    data: { firstName, lastName: 'Test', phone: `+99893${String(1_000_000 + phone)}`, courseId, groupId, status, contractPrice: 1_000_000, startDate: new Date('2026-09-01') },
  });
}
const day = (token: string, date?: string) => request(app).get('/api/attendance/day').query(date ? { date } : {}).set(bearer(token));
const mark = (token: string, groupId: string, date: string, records: Array<{ studentId: string; status: string }>) =>
  request(app).post(`/api/groups/${groupId}/attendance`).set(bearer(token)).send({ date, records });

describe.skipIf(!hasTestDatabase)('Davomat: kunlik taxta va guruh jurnali', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi faqat shu kunga darsi bor O‘Z guruhlarini ko‘radi — vaqt bo‘yicha, o‘quvchilar soni va holati bilan', async () => {
    const course = await createCourse('Frontend');
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: other } = await createUserWithToken(app, { role: 'TEACHER' });
    const evening = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'FE-kech', scheduleDays: ['MONDAY', 'WEDNESDAY'] });
    const morning = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'FE-erta', scheduleDays: ['MONDAY'] });
    await prisma.group.update({ where: { id: morning.id }, data: { startTime: '09:00', endTime: '11:00', room: '101' } });
    const tuesdayOnly = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'FE-seshanba', scheduleDays: ['TUESDAY'] });
    await createGroup({ courseId: course.id, teacherId: other.id, name: 'Begona', scheduleDays: ['MONDAY'] });
    await createGroup({ courseId: course.id, teacherId: null, name: 'Egasiz', scheduleDays: ['MONDAY'] });
    await enroll(course.id, evening.id, 'Ali');
    await enroll(course.id, evening.id, 'Vali');
    await enroll(course.id, evening.id, 'Muzlagan', 'FROZEN');

    const response = await day(token, MONDAY);
    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe(MONDAY);
    expect(response.body.data.groups.map((group: { name: string }) => group.name)).toEqual(['FE-erta', 'FE-kech']);
    expect(response.body.data.groups[0]).toMatchObject({ id: morning.id, courseName: 'Frontend', startTime: '09:00', endTime: '11:00', room: '101', students: 0, marked: 0, state: 'NOT_STARTED', isScheduledDay: true });
    // Muzlatilgan o'quvchi sanalmaydi
    expect(response.body.data.groups[1]).toMatchObject({ id: evening.id, students: 2, marked: 0, state: 'NOT_STARTED' });
    // Shu kuni darsi yo'q o'z guruhi — alohida ro'yxatda; begona guruhlar hech qayerda yo'q
    expect(response.body.data.otherGroups.map((group: { id: string }) => group.id)).toEqual([tuesdayOnly.id]);
    expect(JSON.stringify(response.body.data)).not.toContain('Begona');
    expect(JSON.stringify(response.body.data)).not.toContain('Egasiz');
  });

  it('dars yo‘q kun — bo‘sh ro‘yxat; sana berilmasa o‘quv markaz vaqti bo‘yicha bugun; noto‘g‘ri sana rad etiladi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });

    const sunday = await day(token, SUNDAY);
    expect(sunday.body.data.groups).toEqual([]);
    expect(sunday.body.data.otherGroups).toHaveLength(1);

    const today = await day(token);
    expect(today.body.data.date).toBe(businessDateString(new Date()));
    expect(today.body.data.today).toBe(businessDateString(new Date()));

    expect((await day(token, '14.09.2026')).status).toBe(422);
    expect((await day(token, '2026-13-45')).status).toBe(422);
    expect((await request(app).get('/api/groups/x/attendance?date=2026-13-45').set(bearer(token))).status).toBe(422);
  });

  it('guruh muddatidan tashqari sana, faol bo‘lmagan guruh — ko‘rinmaydi; jadvaldan tashqari ochilgan seans — ko‘rinadi, takrorlanmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const future = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Hali boshlanmagan', scheduleDays: ['MONDAY'], startDate: '2026-10-01' });
    const ended = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Tugagan', scheduleDays: ['MONDAY'] });
    await prisma.group.update({ where: { id: ended.id }, data: { endDate: new Date('2026-09-10') } });
    const archived = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Yopilgan', scheduleDays: ['MONDAY'] });
    await prisma.group.update({ where: { id: archived.id }, data: { status: 'COMPLETED' } });
    const extra = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Qo‘shimcha', scheduleDays: ['TUESDAY'] });
    const student = await enroll(course.id, extra.id, 'Ali');

    expect((await day(token, MONDAY)).body.data.groups).toEqual([]);
    expect((await day(token, MONDAY)).body.data.otherGroups.map((group: { id: string }) => group.id)).toEqual([extra.id]);
    expect(future.id).not.toBe(extra.id);

    // Jadvalda yo'q kunga (dushanba) davomat belgilandi — seans ochiladi va guruh shu kunning taxtasida chiqadi
    expect((await mark(token, extra.id, MONDAY, [{ studentId: student.id, status: 'PRESENT' }])).status).toBe(200);
    const after = await day(token, MONDAY);
    expect(after.body.data.groups).toHaveLength(1);
    expect(after.body.data.groups[0]).toMatchObject({ id: extra.id, isScheduledDay: false, state: 'COMPLETED', marked: 1, students: 1 });
    expect(after.body.data.otherGroups).toEqual([]);
  });

  it('holat: boshlanmagan → jarayonda → tugallangan; bekor qilingan seans alohida; mavjud belgilar yuklanadi, takrorlanmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const ali = await enroll(course.id, group.id, 'Ali');
    const vali = await enroll(course.id, group.id, 'Vali');
    const state = async () => (await day(token, MONDAY)).body.data.groups[0];

    expect(await state()).toMatchObject({ state: 'NOT_STARTED', marked: 0 });
    await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'ABSENT' }]);
    expect(await state()).toMatchObject({ state: 'IN_PROGRESS', marked: 1, absent: 1, students: 2 });
    await mark(token, group.id, MONDAY, [{ studentId: vali.id, status: 'LATE' }]);
    expect(await state()).toMatchObject({ state: 'COMPLETED', marked: 2 });

    // Qayta ochilganda mavjud holatlar keladi; qayta saqlash yozuvni yangilaydi (yangi qator yaratmaydi)
    const sheet = await request(app).get(`/api/groups/${group.id}/attendance?date=${MONDAY}`).set(bearer(token));
    expect(sheet.body.data.students.map((row: { firstName: string; status: string }) => [row.firstName, row.status])).toEqual([['Ali', 'ABSENT'], ['Vali', 'LATE']]);
    expect(sheet.body.data.today).toBe(businessDateString(new Date()));
    await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'PRESENT' }]);
    expect(await prisma.attendance.count({ where: { groupId: group.id } })).toBe(2);
    expect(await prisma.attendanceSession.count({ where: { groupId: group.id } })).toBe(1);
    expect(await state()).toMatchObject({ state: 'COMPLETED', absent: 0 });

    await prisma.attendanceSession.updateMany({ where: { groupId: group.id }, data: { status: 'CANCELLED' } });
    expect((await state()).state).toBe('CANCELLED');
    expect((await request(app).get(`/api/groups/${group.id}/attendance?date=${MONDAY}`).set(bearer(token))).body.data.sessionStatus).toBe('CANCELLED');
  });

  it('jurnalda faqat shu guruhning faol o‘quvchilari; guruhdan chiqqan o‘quvchining eski belgisi tarixda ko‘rinadi, lekin qayta belgilanmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const sibling = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const ali = await enroll(course.id, group.id, 'Ali');
    const leaver = await enroll(course.id, group.id, 'Ketgan');
    await enroll(course.id, sibling.id, 'Qo‘shni guruh');
    await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'PRESENT' }, { studentId: leaver.id, status: 'LATE' }]);

    // O'qituvchining boshqa guruhidagi o'quvchi bu jurnalda yo'q va bu guruhga belgilanmaydi
    const other = await prisma.student.findFirstOrThrow({ where: { groupId: sibling.id } });
    expect((await mark(token, group.id, MONDAY, [{ studentId: other.id, status: 'PRESENT' }])).status).toBe(422);

    await prisma.student.update({ where: { id: leaver.id }, data: { groupId: sibling.id } });
    const sheet = (await request(app).get(`/api/groups/${group.id}/attendance?date=${MONDAY}`).set(bearer(token))).body.data;
    expect(sheet.students.map((row: { firstName: string }) => row.firstName)).toEqual(['Ali']);
    expect(sheet.summary).toMatchObject({ total: 1, PRESENT: 1, unmarked: 0 });
    expect(sheet.formerStudents).toEqual([expect.objectContaining({ studentId: leaver.id, firstName: 'Ketgan', status: 'LATE' })]);
    // Boshqa kunda (belgisi yo'q) u ko'rinmaydi
    expect((await request(app).get(`/api/groups/${group.id}/attendance?date=${TUESDAY}`).set(bearer(token))).body.data.formerStudents).toEqual([]);
    expect((await mark(token, group.id, MONDAY, [{ studentId: leaver.id, status: 'ABSENT' }])).status).toBe(422);
    expect((await prisma.attendance.findFirstOrThrow({ where: { studentId: leaver.id, groupId: group.id } })).status).toBe('LATE');
    // Taxtadagi holat joriy ro'yxatga nisbatan: 1 o'quvchi, 1 belgi
    expect((await day(token, MONDAY)).body.data.groups.find((row: { id: string }) => row.id === group.id)).toMatchObject({ students: 1, marked: 1, state: 'COMPLETED' });
  });

  it('begona o‘qituvchi va boshqa filial xodimi: taxtada ko‘rmaydi, jurnalni ocholmaydi, saqlay olmaydi (404)', async () => {
    const branch = await prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
    const course = await createCourse();
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: farAdmin } = await createUserWithToken(app, { role: 'ADMIN', branchId: branch.id });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const student = await enroll(course.id, group.id, 'Ali');
    const farGroup = await createGroup({ courseId: course.id, name: 'Uzoq filial', scheduleDays: ['MONDAY'] });
    await prisma.group.update({ where: { id: farGroup.id }, data: { branchId: branch.id } });

    for (const token of [stranger, farAdmin]) {
      expect((await day(token, MONDAY)).body.data.groups.map((row: { id: string }) => row.id)).not.toContain(group.id);
      expect((await request(app).get(`/api/groups/${group.id}/attendance?date=${MONDAY}`).set(bearer(token))).status).toBe(404);
      expect((await mark(token, group.id, MONDAY, [{ studentId: student.id, status: 'PRESENT' }])).status).toBe(404);
    }
    expect(await prisma.attendance.count()).toBe(0);

    // O'z filiali admini ko'radi va belgilaydi; boshqa filial guruhini ko'rmaydi; owner (barcha filiallar) ikkalasini ham
    expect((await day(admin, MONDAY)).body.data.groups.map((row: { id: string }) => row.id)).toEqual([group.id]);
    expect((await request(app).get(`/api/groups/${farGroup.id}/attendance?date=${MONDAY}`).set(bearer(admin))).status).toBe(404);
    expect((await day(farAdmin, MONDAY)).body.data.groups.map((row: { id: string }) => row.id)).toEqual([farGroup.id]);
    expect((await day(owner, MONDAY)).body.data.groups).toHaveLength(2);
    expect((await mark(teacherToken, group.id, MONDAY, [{ studentId: student.id, status: 'PRESENT' }])).status).toBe(200);
  });

  it('ruxsat: belgilash huquqi yo‘q xodim saqlay olmaydi; kabinet va kirmagan foydalanuvchi taxtani ko‘rmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, scheduleDays: ['MONDAY'] });
    const student = await enroll(course.id, group.id, 'Ali');
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: portal } = await createUserWithToken(app, { role: 'STUDENT' });

    expect((await mark(sales, group.id, MONDAY, [{ studentId: student.id, status: 'PRESENT' }])).status).toBe(403);
    expect((await day(sales, MONDAY)).status).toBe(403);
    expect((await day(portal, MONDAY)).status).toBe(403);
    expect((await request(app).get('/api/attendance/day')).status).toBe(401);
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('holat va ro‘yxat tekshiriladi: noma’lum holat, takror o‘quvchi, bo‘sh ro‘yxat — hech narsa saqlanmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const ali = await enroll(course.id, group.id, 'Ali');
    const vali = await enroll(course.id, group.id, 'Vali');

    expect((await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'SICK' }])).status).toBe(422);
    expect((await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'present' }])).status).toBe(422);
    expect((await mark(token, group.id, MONDAY, [{ studentId: ali.id, status: 'PRESENT' }, { studentId: ali.id, status: 'ABSENT' }])).status).toBe(422);
    expect((await mark(token, group.id, MONDAY, [])).status).toBe(422);
    // Bittasi noto'g'ri bo'lsa, to'g'risi ham saqlanmaydi
    expect((await mark(token, group.id, MONDAY, [{ studentId: vali.id, status: 'PRESENT' }, { studentId: 'yoq', status: 'PRESENT' }])).status).toBe(422);
    expect(await prisma.attendance.count()).toBe(0);
    expect(await prisma.attendanceSession.count()).toBe(0);

    for (const status of ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) {
      expect((await mark(token, group.id, MONDAY, [{ studentId: ali.id, status }])).status, status).toBe(200);
    }
    // Tanlanmagan o'quvchi jimgina "kelmadi" bo'lib qolmaydi
    expect(await prisma.attendance.count({ where: { studentId: vali.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'attendance.marked', entityId: group.id } })).toBe(4);
  });

  it('bir vaqtdagi va takroriy saqlashlar: xato yo‘q, bitta seans, har o‘quvchiga bitta yozuv', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY'] });
    const students = await Promise.all(['Ali', 'Vali', 'Sami'].map((name) => enroll(course.id, group.id, name)));
    const records = students.map((student) => ({ studentId: student.id, status: 'PRESENT' }));

    const responses = await Promise.all(Array.from({ length: 6 }, () => mark(token, group.id, MONDAY, records)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);

    expect(await prisma.attendanceSession.count({ where: { groupId: group.id } })).toBe(1);
    expect(await prisma.attendance.count({ where: { groupId: group.id } })).toBe(3);
    const perStudent = await prisma.attendance.groupBy({ by: ['studentId'], where: { groupId: group.id }, _count: { _all: true } });
    expect(perStudent.every((row) => row._count._all === 1)).toBe(true);
    expect((await day(token, MONDAY)).body.data.groups[0]).toMatchObject({ state: 'COMPLETED', marked: 3, students: 3 });
  }, 60_000);
});
