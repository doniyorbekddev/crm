import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

let phoneCounter = 0;

async function enroll(courseId: string, groupId: string, firstName: string, status: 'ACTIVE' | 'FROZEN' = 'ACTIVE') {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Valiyev',
      phone: `+99890${String(1_000_000 + phoneCounter)}`,
      courseId,
      groupId,
      status,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Attendance API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('jurnalda faqat faol o‘quvchilar chiqadi va dars kuni aniqlanadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['MONDAY', 'WEDNESDAY'] });
    await enroll(course.id, group.id, 'Ali');
    await enroll(course.id, group.id, 'Muzlagan', 'FROZEN');

    // 2026-09-14 — dushanba, 2026-09-15 — seshanba
    const lessonDay = await request(app).get(`/api/groups/${group.id}/attendance?date=2026-09-14`).set(bearer(token));
    const offDay = await request(app).get(`/api/groups/${group.id}/attendance?date=2026-09-15`).set(bearer(token));

    expect(lessonDay.status).toBe(200);
    expect(lessonDay.body.data.isScheduledDay).toBe(true);
    expect(lessonDay.body.data.canMark).toBe(true);
    expect(lessonDay.body.data.students).toHaveLength(1);
    expect(lessonDay.body.data.students[0]).toMatchObject({ firstName: 'Ali', status: null, markedBy: null });
    expect(lessonDay.body.data.summary).toMatchObject({ total: 1, unmarked: 1, PRESENT: 0 });
    expect(offDay.body.data.isScheduledDay).toBe(false);
  });

  it('davomat belgilaydi, qayta belgilaganda yozuv yangilanadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const ali = await enroll(course.id, group.id, 'Ali');
    const vali = await enroll(course.id, group.id, 'Vali');

    const marked = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({
        date: '2026-09-14',
        records: [
          { studentId: ali.id, status: 'PRESENT' },
          { studentId: vali.id, status: 'ABSENT', note: 'Kasal' },
        ],
      });
    const corrected = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-14', records: [{ studentId: vali.id, status: 'EXCUSED' }] });

    expect(marked.status).toBe(200);
    expect(marked.body.data.summary).toMatchObject({ PRESENT: 1, ABSENT: 1, unmarked: 0, total: 2 });
    expect(marked.body.data.students.find((row: { firstName: string }) => row.firstName === 'Vali')).toMatchObject({
      status: 'ABSENT',
      note: 'Kasal',
      markedBy: { id: teacher.id },
    });
    expect(corrected.body.data.summary).toMatchObject({ PRESENT: 1, EXCUSED: 1, ABSENT: 0 });
    expect(await prisma.attendance.count({ where: { groupId: group.id } })).toBe(2);
  });

  it('begona guruh yoki boshqa guruh o‘quvchisi uchun davomat belgilab bo‘lmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const ownGroup = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const foreignGroup = await createGroup({ courseId: course.id });
    const outsider = await enroll(course.id, foreignGroup.id, 'Begona');

    const foreignSheet = await request(app).get(`/api/groups/${foreignGroup.id}/attendance?date=2026-09-14`).set(bearer(teacherToken));
    const wrongStudent = await request(app)
      .post(`/api/groups/${ownGroup.id}/attendance`)
      .set(bearer(teacherToken))
      .send({ date: '2026-09-14', records: [{ studentId: outsider.id, status: 'PRESENT' }] });

    expect(foreignSheet.status).toBe(404);
    expect(wrongStudent.status).toBe(422);
    expect(wrongStudent.body.errors[0].message).toContain('faol emas');
  });

  it('davomat belgilash ruxsati yo‘q rol 403 oladi, admin esa istalgan guruhni belgilaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const ali = await enroll(course.id, group.id, 'Ali');
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    const adminMark = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(adminToken))
      .send({ date: '2026-09-14', records: [{ studentId: ali.id, status: 'LATE' }] });
    const accountantMark = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(accountantToken))
      .send({ date: '2026-09-14', records: [{ studentId: ali.id, status: 'PRESENT' }] });

    expect(adminMark.status).toBe(200);
    expect(adminMark.body.data.summary.LATE).toBe(1);
    expect(accountantMark.status).toBe(403);
  });

  it('sana formati noto‘g‘ri bo‘lsa 422 qaytaradi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const badQuery = await request(app).get(`/api/groups/${group.id}/attendance?date=14.09.2026`).set(bearer(token));
    const emptyRecords = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-14', records: [] });

    expect(badQuery.status).toBe(422);
    expect(emptyRecords.status).toBe(422);
  });

  it('o‘quvchi davomat tarixi va davomat foizini qaytaradi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const ali = await enroll(course.id, group.id, 'Ali');
    for (const [date, status] of [
      ['2026-09-07', 'PRESENT'],
      ['2026-09-09', 'ABSENT'],
      ['2026-09-11', 'LATE'],
      ['2026-09-14', 'PRESENT'],
    ] as const) {
      await request(app)
        .post(`/api/groups/${group.id}/attendance`)
        .set(bearer(token))
        .send({ date, records: [{ studentId: ali.id, status }] });
    }

    const history = await request(app).get(`/api/students/${ali.id}/attendance`).set(bearer(token));

    expect(history.status).toBe(200);
    expect(history.body.data.items).toHaveLength(4);
    expect(history.body.data.items[0]).toMatchObject({ date: '2026-09-14', status: 'PRESENT', groupName: group.name });
    expect(history.body.data.summary).toMatchObject({ total: 4, PRESENT: 2, ABSENT: 1, LATE: 1, attendanceRate: 75 });
  });
});
