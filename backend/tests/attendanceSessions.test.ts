import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** 2026-09-15 — seshanba */
const NOW = new Date('2026-09-15T09:00:00.000Z');

let phoneCounter = 0;

async function enroll(courseId: string, groupId: string, firstName: string) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Valiyev',
      phone: `+99890${String(7_000_000 + phoneCounter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function markDay(token: string, groupId: string, date: string, records: Array<{ studentId: string; status: string }>) {
  return request(app).post(`/api/groups/${groupId}/attendance`).set(bearer(token)).send({ date, records });
}

describe.skipIf(!hasTestDatabase)('Attendance 2.0 (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('davomat belgilanganda dars seansi avtomatik ochiladi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Ali');

    const before = await request(app).get(`/api/groups/${group.id}/attendance?date=2026-09-15`).set(bearer(token));
    const marked = await markDay(token, group.id, '2026-09-15', [{ studentId: student.id, status: 'PRESENT' }]);
    const after = await request(app).get(`/api/groups/${group.id}/attendance?date=2026-09-15`).set(bearer(token));

    expect(before.body.data.session).toBeNull();
    expect(marked.status).toBe(200);
    expect(after.body.data.session).not.toBeNull();

    const sessions = await prisma.attendanceSession.findMany({ where: { groupId: group.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.teacherId).toBe(teacher.id);

    const attendance = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(attendance.sessionId).toBe(sessions[0]?.id);
  });

  it('seansni qo‘lda ochadi, tahrirlaydi va davomatsiz o‘chiradi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });

    const created = await request(app)
      .post('/api/attendance-sessions')
      .set(bearer(token))
      .send({ groupId: group.id, date: '2026-09-16', startTime: '14:00', endTime: '16:00', topic: 'Massivlar' });
    const updated = await request(app)
      .put(`/api/attendance-sessions/${created.body.data.id}`)
      .set(bearer(token))
      .send({ topic: 'Massivlar va sikllar', status: 'HELD' });
    const list = await request(app).get(`/api/attendance-sessions?groupId=${group.id}`).set(bearer(token));
    const removed = await request(app).delete(`/api/attendance-sessions/${created.body.data.id}`).set(bearer(token));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ date: '2026-09-16', topic: 'Massivlar', startTime: '14:00', markedCount: 0 });
    expect(updated.body.data.topic).toBe('Massivlar va sikllar');
    expect(list.body.data).toHaveLength(1);
    expect(removed.status).toBe(200);
    expect(await prisma.attendanceSession.count()).toBe(0);
  });

  it('bir kunga ikkinchi seans yaratmaydi va davomatli seans o‘chmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Ali');

    const first = await request(app)
      .post('/api/attendance-sessions')
      .set(bearer(token))
      .send({ groupId: group.id, date: '2026-09-15', topic: 'Birinchi' });
    const second = await request(app)
      .post('/api/attendance-sessions')
      .set(bearer(token))
      .send({ groupId: group.id, date: '2026-09-15', topic: 'Ikkinchi' });
    await markDay(token, group.id, '2026-09-15', [{ studentId: student.id, status: 'PRESENT' }]);
    const removed = await request(app).delete(`/api/attendance-sessions/${first.body.data.id}`).set(bearer(token));

    expect(first.body.data.id).toBe(second.body.data.id);
    expect(second.body.data.topic).toBe('Ikkinchi');
    expect(await prisma.attendanceSession.count()).toBe(1);
    expect(removed.status).toBe(409);
  });

  it('o‘quvchi kalendarini oy bo‘yicha qaytaradi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Ali');

    await markDay(token, group.id, '2026-09-07', [{ studentId: student.id, status: 'PRESENT' }]);
    await markDay(token, group.id, '2026-09-09', [{ studentId: student.id, status: 'ABSENT' }]);
    await markDay(token, group.id, '2026-09-11', [{ studentId: student.id, status: 'LATE' }]);

    const calendar = await request(app)
      .get(`/api/students/${student.id}/attendance/calendar?year=2026&month=9`)
      .set(bearer(token));

    expect(calendar.status).toBe(200);
    expect(calendar.body.data.days).toHaveLength(30);
    expect(calendar.body.data.days.find((day: { date: string }) => day.date === '2026-09-07')).toMatchObject({
      status: 'PRESENT',
      statusLabel: 'Keldi',
    });
    expect(calendar.body.data.days.find((day: { date: string }) => day.date === '2026-09-08')?.status).toBeNull();
    expect(calendar.body.data.month_).toMatchObject({ PRESENT: 1, ABSENT: 1, LATE: 1, total: 3, rate: 67 });
    expect(calendar.body.data.overall.total).toBe(3);
  });

  it('statistika: bugun/hafta/oy va foiz taqsimoti', async () => {
    const course = await createCourse();
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const good = await enroll(course.id, group.id, 'Aziz');
    const weak = await enroll(course.id, group.id, 'Bek');

    // Aziz — 100%, Bek — 33%
    await markDay(token, group.id, '2026-09-10', [
      { studentId: good.id, status: 'PRESENT' },
      { studentId: weak.id, status: 'ABSENT' },
    ]);
    await markDay(token, group.id, '2026-09-12', [
      { studentId: good.id, status: 'PRESENT' },
      { studentId: weak.id, status: 'ABSENT' },
    ]);
    await markDay(token, group.id, '2026-09-15', [
      { studentId: good.id, status: 'PRESENT' },
      { studentId: weak.id, status: 'PRESENT' },
    ]);

    const stats = await request(app).get('/api/attendance/stats?from=2026-09-01&to=2026-09-15').set(bearer(token));

    expect(stats.status).toBe(200);
    expect(stats.body.data.range).toMatchObject({ PRESENT: 4, ABSENT: 2, total: 6, rate: 67 });
    expect(stats.body.data.today).toMatchObject({ total: 2, rate: 100 });
    expect(stats.body.data.students).toBe(2);
    expect(stats.body.data.sessions).toBe(3);
    expect(stats.body.data.buckets.find((b: { key: string }) => b.key === '95-100')?.students).toBe(1);
    expect(stats.body.data.buckets.find((b: { key: string }) => b.key === '0-70')?.students).toBe(1);
    expect(stats.body.data.byGroup[0]).toMatchObject({ groupName: group.name, total: 6, rate: 67 });
  });

  it('reyting: eng yuqori davomatli o‘quvchilar birinchi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id });
    const best = await enroll(course.id, group.id, 'Aziz');
    const worst = await enroll(course.id, group.id, 'Bek');

    for (const date of ['2026-09-08', '2026-09-10', '2026-09-12']) {
      await markDay(token, group.id, date, [
        { studentId: best.id, status: 'PRESENT' },
        { studentId: worst.id, status: date === '2026-09-08' ? 'PRESENT' : 'ABSENT' },
      ]);
    }

    const ranking = await request(app).get('/api/attendance/ranking?from=2026-09-01&to=2026-09-15').set(bearer(token));
    const filtered = await request(app).get('/api/attendance/ranking?minLessons=5').set(bearer(token));

    expect(ranking.body.data).toHaveLength(2);
    expect(ranking.body.data[0]).toMatchObject({ firstName: 'Aziz', rate: 100, lessons: 3 });
    expect(ranking.body.data[1]).toMatchObject({ firstName: 'Bek', rate: 33 });
    expect(ranking.body.data[0].code).toMatch(/^ST-\d{6}$/);
    // Kamida 5 ta dars talab qilinsa — hech kim tushmaydi
    expect(filtered.body.data).toHaveLength(0);
  });

  it('o‘qituvchi paneli: bugungi darslar va kelmaganlar', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    // 2026-09-15 — seshanba
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['TUESDAY', 'THURSDAY'] });
    const other = await createGroup({ courseId: course.id, name: 'Begona guruh' });
    const present = await enroll(course.id, group.id, 'Aziz');
    const absent = await enroll(course.id, group.id, 'Bek');

    await markDay(token, group.id, '2026-09-15', [
      { studentId: present.id, status: 'PRESENT' },
      { studentId: absent.id, status: 'ABSENT' },
    ]);

    const overview = await request(app).get('/api/attendance/teacher-overview').set(bearer(token));

    expect(overview.status).toBe(200);
    expect(overview.body.data.date).toBe('2026-09-15');
    // Faqat o‘z guruhi
    expect(overview.body.data.groups).toHaveLength(1);
    expect(overview.body.data.groups[0]).toMatchObject({ name: group.name, isScheduledToday: true, markedToday: 2 });
    expect(overview.body.data.todayLessons).toBe(1);
    expect(overview.body.data.markedLessons).toBe(1);
    expect(overview.body.data.todayAbsent).toHaveLength(1);
    expect(overview.body.data.todayAbsent[0]).toMatchObject({ firstName: 'Bek', groupName: group.name });
    expect(overview.body.data.monthCounts).toMatchObject({ PRESENT: 1, ABSENT: 1, total: 2, rate: 50 });
    expect(other.id).toBeTruthy();
  });

  it('kelmagan o‘quvchi uchun boshqaruvchilarga bildirishnoma yuboriladi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Bek');

    await markDay(token, group.id, '2026-09-15', [{ studentId: student.id, status: 'ABSENT' }]);
    // Qayta belgilash — bildirishnoma takrorlanmaydi (dedupeKey)
    await markDay(token, group.id, '2026-09-15', [{ studentId: student.id, status: 'ABSENT' }]);

    const notifications = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.message).toContain('Bek');
    expect(notifications[0]?.entityType).toBe('student');
    // O‘qituvchining o‘ziga xabar ketmaydi
    expect(await prisma.notification.count({ where: { userId: teacher.id } })).toBe(0);
  });

  it('o‘qituvchi begona guruh seansini ko‘ra olmaydi, ruxsatsiz rol 403 oladi', async () => {
    const course = await createCourse();
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const foreignGroup = await createGroup({ courseId: course.id });

    const created = await request(app)
      .post('/api/attendance-sessions')
      .set(bearer(adminToken))
      .send({ groupId: foreignGroup.id, date: '2026-09-15', topic: 'Begona dars' });
    const teacherRead = await request(app).get(`/api/attendance-sessions/${created.body.data.id}`).set(bearer(teacherToken));
    const teacherList = await request(app).get('/api/attendance-sessions').set(bearer(teacherToken));
    const salesStats = await request(app).get('/api/attendance/stats').set(bearer(salesToken));

    expect(created.status).toBe(201);
    expect(teacherRead.status).toBe(404);
    expect(teacherList.body.data).toHaveLength(0);
    expect(salesStats.status).toBe(403);
  });
});
