import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyAbsences } from '../src/jobs/staffAttendance.job.js';
import { recordAutoAttendance } from '../src/services/staffAttendance/auto.service.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Juma, Toshkent vaqti */
const FRIDAY = '2026-10-30';
const at = (time: string, date = FRIDAY) => new Date(`${date}T${time}:00+05:00`);
const hhmm = (value: Date) => new Date(value.getTime() + 5 * 3_600_000).toISOString().slice(11, 16);

/** Guli va Shodiya: dushanba–shanba 08:00–17:30, avtomatik */
const OFFICE = {
  mode: 'FIXED',
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  startTime: '08:00',
  endTime: '17:30',
  autoMark: true,
  effectiveFrom: '2026-10-01',
};

describe.skipIf(!hasTestDatabase)('Xodim davomati — jadval bo‘yicha avtomatik', () => {
  let admin: string;
  let adminId: string;
  let guliId: string;

  const events = (userId: string) =>
    prisma.staffAttendanceEvent.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' }, select: { type: true, source: true, occurredAt: true, voidedAt: true } });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('07:00'));
    await resetDatabase();
    await seedRolesAndPermissions();
    const adminUser = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz', firstName: 'Aziza', lastName: 'Rahbar' });
    admin = adminUser.token;
    adminId = adminUser.user.id;
    const guli = await createUserWithToken(app, { role: 'CALL_CENTER', email: 'guli@test.uz', firstName: 'Guli', lastName: 'Karimova' });
    guliId = guli.user.id;
    await prisma.employee.create({ data: { userId: guliId, firstName: 'Guli', lastName: 'Karimova', position: 'CALL_CENTER', hireDate: new Date('2026-01-01T00:00:00Z') } });
    await request(app).put(`/api/staff-attendance/schedules/${guliId}`).set(bearer(admin)).send(OFFICE).expect(200);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('belgilangan jadval: 08:00 da "keldi", 17:30 da "ketdi" avtomatik; takroran yozilmaydi; kelmadi xabari ketmaydi', async () => {
    const schedules = await request(app).get('/api/staff-attendance/schedules').set(bearer(admin)).expect(200);
    expect(schedules.body.data.find((row: { userId: string }) => row.userId === guliId).schedule).toMatchObject({ autoMark: true, startTime: '08:00' });

    expect(await recordAutoAttendance(at('07:59'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await recordAutoAttendance(at('08:03'))).toEqual({ checkIns: 1, checkOuts: 0 });
    expect(await recordAutoAttendance(at('09:00'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await notifyAbsences(at('11:05'))).toBe(0);
    expect(await recordAutoAttendance(at('17:29'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await recordAutoAttendance(at('17:31'))).toEqual({ checkIns: 0, checkOuts: 1 });
    expect(await recordAutoAttendance(at('18:00'))).toEqual({ checkIns: 0, checkOuts: 0 });

    const list = await events(guliId);
    expect(list.map((event) => [event.type, event.source, hhmm(event.occurredAt)])).toEqual([
      ['CHECK_IN', 'AUTO', '08:00'],
      ['CHECK_OUT', 'AUTO', '17:30'],
    ]);
    vi.setSystemTime(at('18:00'));
    admin = await loginAs(app, 'admin@test.uz');
    const detail = await request(app).get(`/api/staff-attendance/users/${guliId}/days/${FRIDAY}`).set(bearer(admin)).expect(200);
    expect(detail.body.data.day).toMatchObject({ arrival: 'PRESENT', lateMinutes: 0, workedSeconds: 9.5 * 3600 });
    expect(detail.body.data.events.every((event: { source: string }) => event.source === 'AUTO')).toBe(true);
  });

  it('QR ustun: xodim o‘zi skanerlagan bo‘lsa avtomatik "keldi" yozilmaydi, "ketdi" — jadval tugaganda', async () => {
    await createUserWithToken(app, { role: 'RECEPTION', email: 'reception@test.uz' });
    // Kirish tokenlari soxta vaqt bilan eskirmasin — skanerlash paytida qayta kiriladi
    vi.setSystemTime(at('07:50'));
    const guli = await loginAs(app, 'guli@test.uz');
    const display = await loginAs(app, 'reception@test.uz');
    const qr = (await request(app).post('/api/staff-attendance/qr').set(bearer(display)).expect(201)).body.data.token as string;
    await request(app).post('/api/staff-attendance/scan').set(bearer(guli)).send({ token: qr, action: 'CHECK_IN' }).expect(200);

    expect(await recordAutoAttendance(at('08:05'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await recordAutoAttendance(at('17:35'))).toEqual({ checkIns: 0, checkOuts: 1 });
    expect((await events(guliId)).map((event) => [event.type, event.source, hhmm(event.occurredAt)])).toEqual([
      ['CHECK_IN', 'QR', '07:50'],
      ['CHECK_OUT', 'AUTO', '17:30'],
    ]);
  });

  it('rahbar bekor qilgan avtomatik yozuv qayta paydo bo‘lmaydi; ruxsat, bayram va dam olish kunida yozilmaydi', async () => {
    await recordAutoAttendance(at('08:05'));
    const auto = await prisma.staffAttendanceEvent.findFirstOrThrow({ where: { userId: guliId, day: { date: new Date(`${FRIDAY}T00:00:00Z`) } } });
    vi.setSystemTime(at('09:00'));
    admin = await loginAs(app, 'admin@test.uz');
    await request(app)
      .post(`/api/staff-attendance/users/${guliId}/days/${FRIDAY}/corrections`)
      .set(bearer(admin))
      .send({ action: 'VOID', eventId: auto.id, reason: 'Bugun kasal, kelmadi' })
      .expect(200);
    expect(await recordAutoAttendance(at('10:00'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await recordAutoAttendance(at('17:40'))).toEqual({ checkIns: 0, checkOuts: 0 });

    // Yakshanba — ish kuni emas; shanba — bayram; dushanba — "kelmayman" ruxsati
    expect(await recordAutoAttendance(at('12:00', '2026-11-01'))).toEqual({ checkIns: 0, checkOuts: 0 });
    await prisma.staffHoliday.create({ data: { date: new Date('2026-10-31T00:00:00Z'), name: 'Bayram' } });
    expect(await recordAutoAttendance(at('12:00', '2026-10-31'))).toEqual({ checkIns: 0, checkOuts: 0 });
    await prisma.staffPermissionRequest.create({
      data: { userId: guliId, type: 'ABSENCE', startDate: new Date('2026-11-02T00:00:00Z'), endDate: new Date('2026-11-02T00:00:00Z'), reason: 'Oilaviy', status: 'APPROVED' },
    });
    expect(await recordAutoAttendance(at('12:00', '2026-11-02'))).toEqual({ checkIns: 0, checkOuts: 0 });
    // "Kech kelaman" ruxsati — o'sha vaqt
    await prisma.staffPermissionRequest.create({
      data: { userId: guliId, type: 'LATE_ARRIVAL', time: '10:00', startDate: new Date('2026-11-03T00:00:00Z'), endDate: new Date('2026-11-03T00:00:00Z'), reason: 'Shifokor', status: 'APPROVED' },
    });
    expect(await recordAutoAttendance(at('09:00', '2026-11-03'))).toEqual({ checkIns: 0, checkOuts: 0 });
    expect(await recordAutoAttendance(at('10:01', '2026-11-03'))).toEqual({ checkIns: 1, checkOuts: 0 });
    const tuesday = await prisma.staffAttendanceDay.findFirstOrThrow({ where: { userId: guliId, date: new Date('2026-11-03T00:00:00Z') } });
    expect(hhmm(tuesday.checkInAt!)).toBe('10:00');
    expect(await prisma.notification.count({ where: { userId: adminId, title: 'Xodim ishga kelmadi' } })).toBe(0);
  });

  it('o‘qituvchi dars jadvali bo‘yicha: birinchi darsdan 15 daqiqa oldin keldi, oxirgi dars tugaganda ketdi; dars bekor bo‘lsa — yozilmaydi', async () => {
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    await prisma.teacherProfile.create({ data: { userId: teacher.user.id } });
    const course = await createCourse();
    const morning = await createGroup({ courseId: course.id, teacherId: teacher.user.id, scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'] });
    await prisma.group.update({ where: { id: morning.id }, data: { startTime: '10:00', endTime: '11:30' } });
    const evening = await createGroup({ courseId: course.id, teacherId: teacher.user.id, scheduleDays: ['FRIDAY'] });
    await prisma.group.update({ where: { id: evening.id }, data: { startTime: '16:00', endTime: '17:30' } });
    await request(app)
      .put(`/api/staff-attendance/schedules/${teacher.user.id}`)
      .set(bearer(admin))
      .send({ mode: 'LESSONS', lessonLeadMinutes: 15, autoMark: true, effectiveFrom: '2026-10-01' })
      .expect(200);

    await recordAutoAttendance(at('09:40'));
    expect(await events(teacher.user.id)).toEqual([]);
    await recordAutoAttendance(at('09:46'));
    await recordAutoAttendance(at('17:31'));
    expect((await events(teacher.user.id)).map((event) => [event.type, event.source, hhmm(event.occurredAt)])).toEqual([
      ['CHECK_IN', 'AUTO', '09:45'],
      ['CHECK_OUT', 'AUTO', '17:30'],
    ]);

    // Dushanba: yagona dars bekor qilingan — kutilmaydi
    await prisma.attendanceSession.create({
      data: { groupId: morning.id, date: new Date('2026-11-02T00:00:00Z'), status: 'CANCELLED', teacherId: teacher.user.id },
    });
    // (Guli dushanba ham ishlaydi — uning yozuvi bor, o'qituvchida yo'q)
    expect(await recordAutoAttendance(at('12:00', '2026-11-02'))).toEqual({ checkIns: 1, checkOuts: 0 });
    expect(await prisma.staffAttendanceDay.count({ where: { userId: teacher.user.id, date: new Date('2026-11-02T00:00:00Z'), checkInAt: { not: null } } })).toBe(0);
    expect(await prisma.staffAttendanceDay.count({ where: { userId: guliId, date: new Date('2026-11-02T00:00:00Z'), checkInAt: { not: null } } })).toBe(1);
  });

  it('barcha o‘qituvchilarga bir bosishda dars jadvali bo‘yicha avtomatik: belgilangan soatli jadvali borlar va ofis xodimlari tegilmaydi', async () => {
    const lessons = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher1@test.uz' });
    await prisma.teacherProfile.create({ data: { userId: lessons.user.id } });
    const office = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher2@test.uz' });
    await prisma.teacherProfile.create({ data: { userId: office.user.id } });
    await request(app).put(`/api/staff-attendance/schedules/${office.user.id}`).set(bearer(admin)).send({ ...OFFICE, autoMark: false }).expect(200);

    const guli = await loginAs(app, 'guli@test.uz');
    await request(app).post('/api/staff-attendance/schedules/teachers/lessons').set(bearer(guli)).send({}).expect(403);
    const applied = await request(app).post('/api/staff-attendance/schedules/teachers/lessons').set(bearer(admin)).send({ effectiveFrom: FRIDAY }).expect(200);
    expect(applied.body.data).toEqual({ applied: 1, skipped: 1 });

    const rows = (await request(app).get('/api/staff-attendance/schedules').set(bearer(admin)).expect(200)).body.data as Array<{ userId: string; schedule: Record<string, unknown> | null }>;
    expect(rows.find((row) => row.userId === lessons.user.id)?.schedule).toMatchObject({ mode: 'LESSONS', autoMark: true, lessonLeadMinutes: 15 });
    expect(rows.find((row) => row.userId === office.user.id)?.schedule).toMatchObject({ mode: 'FIXED', autoMark: false });
    expect(rows.find((row) => row.userId === guliId)?.schedule).toMatchObject({ mode: 'FIXED', autoMark: true, startTime: '08:00', endTime: '17:30' });
    expect(await prisma.auditLog.count({ where: { action: 'staff_schedule.saved', metadata: { path: ['userId'], equals: lessons.user.id } } })).toBe(1);
  });
});
