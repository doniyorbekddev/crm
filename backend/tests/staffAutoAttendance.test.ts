import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyAbsences, notifyCheckoutDigest, notifyCheckoutReminders, notifyMissingCheckouts } from '../src/jobs/staffAttendance.job.js';
import { recordAutoAttendance } from '../src/services/staffAttendance/auto.service.js';
import { AUTO_CLEANUP_REASON, cleanupAutoCheckIns } from '../src/services/staffAttendance/autoCleanup.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Juma, Toshkent vaqti */
const FRIDAY = '2026-10-30';
const at = (time: string, date = FRIDAY) => new Date(`${date}T${time}:00+05:00`);
const hhmm = (value: Date) => new Date(value.getTime() + 5 * 3_600_000).toISOString().slice(11, 16);

/** Guli va Shodiya: dushanba–shanba 08:00–17:30, ketish avtomatik */
const OFFICE = {
  mode: 'FIXED',
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  startTime: '08:00',
  endTime: '17:30',
  autoMark: true,
  effectiveFrom: '2026-10-01',
};

describe.skipIf(!hasTestDatabase)('Xodim davomati — kelish faqat QR, ketish: eslatma, 18:00 ro‘yxati, 20:00 da avtomatik', () => {
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

  it('kelmagan xodim "keldi" bo‘lmaydi: avtomatik "keldi" yozilmaydi, kun yozuvi ham ochilmaydi, rahbarga "kelmadi" xabari ketadi', async () => {
    const schedules = await request(app).get('/api/staff-attendance/schedules').set(bearer(admin)).expect(200);
    expect(schedules.body.data.find((row: { userId: string }) => row.userId === guliId).schedule).toMatchObject({ autoMark: true, startTime: '08:00' });

    expect(await recordAutoAttendance(at('08:03'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('20:05'))).toEqual({ checkOuts: 0 });
    expect(await events(guliId)).toEqual([]);
    expect(await prisma.staffAttendanceDay.count({ where: { userId: guliId } })).toBe(0);
    expect(await notifyAbsences(at('11:05'))).toBe(1);
    expect(await prisma.notification.count({ where: { userId: adminId, title: 'Xodim ishga kelmadi' } })).toBe(1);

    vi.setSystemTime(at('18:00'));
    admin = await loginAs(app, 'admin@test.uz');
    const detail = await request(app).get(`/api/staff-attendance/users/${guliId}/days/${FRIDAY}`).set(bearer(admin)).expect(200);
    expect(detail.body.data.day).toMatchObject({ status: 'ABSENT', arrival: null, checkInAt: null });
  });

  it('QR bilan kelgan, ketishni belgilamagan kun 20:00 da jadval tugash vaqti (17:30) bilan yopiladi; takroran yozilmaydi', async () => {
    await createUserWithToken(app, { role: 'RECEPTION', email: 'reception@test.uz' });
    // Kirish tokenlari soxta vaqt bilan eskirmasin — skanerlash paytida qayta kiriladi
    vi.setSystemTime(at('08:25'));
    const guli = await loginAs(app, 'guli@test.uz');
    const display = await loginAs(app, 'reception@test.uz');
    const qr = (await request(app).post('/api/staff-attendance/qr').set(bearer(display)).expect(201)).body.data.token as string;
    await request(app).post('/api/staff-attendance/scan').set(bearer(guli)).send({ token: qr, action: 'CHECK_IN' }).expect(200);

    expect(await recordAutoAttendance(at('17:35'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('19:59'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('20:01'))).toEqual({ checkOuts: 1 });
    expect(await recordAutoAttendance(at('20:30'))).toEqual({ checkOuts: 0 });
    expect((await events(guliId)).map((event) => [event.type, event.source, hhmm(event.occurredAt)])).toEqual([
      ['CHECK_IN', 'QR', '08:25'],
      ['CHECK_OUT', 'AUTO', '17:30'],
    ]);
    vi.setSystemTime(at('20:30'));
    admin = await loginAs(app, 'admin@test.uz');
    const detail = await request(app).get(`/api/staff-attendance/users/${guliId}/days/${FRIDAY}`).set(bearer(admin)).expect(200);
    // Haqiqiy kechikish ko'rinadi (avval avtomatik 08:00 uni yashirardi)
    expect(detail.body.data.day).toMatchObject({ arrival: 'LATE', lateMinutes: 25 });
  });

  it('eski avtomatik "keldi" QR’ni to‘smaydi: QR skanerlanganda u bekor qilinadi va haqiqiy vaqt yoziladi; o‘zi avtomatik yopilmaydi', async () => {
    // 2026-11-10 gacha yozilgan yozuv: 08:00 da avtomatik "keldi"
    const day = await prisma.staffAttendanceDay.create({
      data: { userId: guliId, date: new Date(`${FRIDAY}T00:00:00Z`), phase: 'WORKING', checkInAt: at('08:00') },
    });
    await prisma.staffAttendanceEvent.create({ data: { dayId: day.id, userId: guliId, type: 'CHECK_IN', occurredAt: at('08:00'), source: 'AUTO' } });
    expect(await recordAutoAttendance(at('09:00'))).toEqual({ checkOuts: 0 });

    await createUserWithToken(app, { role: 'RECEPTION', email: 'reception@test.uz' });
    vi.setSystemTime(at('09:10'));
    const guli = await loginAs(app, 'guli@test.uz');
    const display = await loginAs(app, 'reception@test.uz');
    const today = await request(app).get('/api/staff-attendance/me/today').set(bearer(guli)).expect(200);
    expect(today.body.data.actions).toEqual(['CHECK_IN']);
    const qr = (await request(app).post('/api/staff-attendance/qr').set(bearer(display)).expect(201)).body.data.token as string;
    const preview = await request(app).post('/api/staff-attendance/scan/preview').set(bearer(guli)).send({ token: qr }).expect(200);
    expect(preview.body.data).toMatchObject({ actions: ['CHECK_IN'], phase: null });
    await request(app).post('/api/staff-attendance/scan').set(bearer(guli)).send({ token: qr, action: 'CHECK_IN' }).expect(200);

    const list = await events(guliId);
    expect(list.map((event) => [event.type, event.source, hhmm(event.occurredAt), event.voidedAt !== null])).toEqual([
      ['CHECK_IN', 'AUTO', '08:00', true],
      ['CHECK_IN', 'QR', '09:10', false],
    ]);
    const after = await prisma.staffAttendanceDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(hhmm(after.checkInAt!)).toBe('09:10');

    // Faqat avtomatik "keldi"si qolgan boshqa kun — avtomatik yopilmaydi (kelish tasdiqlanmagan)
    const thursday = await prisma.staffAttendanceDay.create({
      data: { userId: guliId, date: new Date('2026-10-29T00:00:00Z'), phase: 'WORKING', checkInAt: at('08:00', '2026-10-29') },
    });
    await prisma.staffAttendanceEvent.create({ data: { dayId: thursday.id, userId: guliId, type: 'CHECK_IN', occurredAt: at('08:00', '2026-10-29'), source: 'AUTO' } });
    expect(await recordAutoAttendance(at('20:05'))).toEqual({ checkOuts: 1 });
    expect(await prisma.staffAttendanceEvent.count({ where: { dayId: thursday.id, type: 'CHECK_OUT' } })).toBe(0);
  });

  it('rahbar bekor qilgan avtomatik "ketdi" qayta yozilmaydi; "erta ketaman" ruxsatida — o‘sha vaqt; ruxsat va bayram kunida yopilmaydi', async () => {
    const checkIn = async (date: string, time: string) => {
      vi.setSystemTime(at('12:00', date));
      admin = await loginAs(app, 'admin@test.uz');
      await request(app)
        .post(`/api/staff-attendance/users/${guliId}/days/${date}/corrections`)
        .set(bearer(admin))
        .send({ action: 'ADD', type: 'CHECK_IN', time, reason: 'QR ishlamadi, qo‘lda' })
        .expect(200);
    };
    await checkIn(FRIDAY, '08:05');
    expect(await recordAutoAttendance(at('20:01'))).toEqual({ checkOuts: 1 });
    const auto = await prisma.staffAttendanceEvent.findFirstOrThrow({ where: { userId: guliId, source: 'AUTO', type: 'CHECK_OUT' } });
    await request(app)
      .post(`/api/staff-attendance/users/${guliId}/days/${FRIDAY}/corrections`)
      .set(bearer(admin))
      .send({ action: 'VOID', eventId: auto.id, reason: 'Kech qoldi, ketish vaqtini o‘zi aytadi' })
      .expect(200);
    expect(await recordAutoAttendance(at('20:30'))).toEqual({ checkOuts: 0 });

    // Seshanba — "erta ketaman" 15:00
    await prisma.staffPermissionRequest.create({
      data: { userId: guliId, type: 'EARLY_LEAVE', time: '15:00', startDate: new Date('2026-11-03T00:00:00Z'), endDate: new Date('2026-11-03T00:00:00Z'), reason: 'Shifokor', status: 'APPROVED' },
    });
    await checkIn('2026-11-03', '08:00');
    expect(await recordAutoAttendance(at('15:01', '2026-11-03'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('20:01', '2026-11-03'))).toEqual({ checkOuts: 1 });
    const tuesday = await prisma.staffAttendanceDay.findFirstOrThrow({ where: { userId: guliId, date: new Date('2026-11-03T00:00:00Z') } });
    expect(hhmm(tuesday.checkOutAt!)).toBe('15:00');

    // Shanba — bayram: kelgan bo'lsa ham avtomatik yopilmaydi (tekshiruvga tushadi)
    await prisma.staffHoliday.create({ data: { date: new Date('2026-10-31T00:00:00Z'), name: 'Bayram' } });
    await checkIn('2026-10-31', '09:00');
    expect(await recordAutoAttendance(at('20:10', '2026-10-31'))).toEqual({ checkOuts: 0 });
  });

  it('o‘qituvchi dars jadvali bo‘yicha: "keldi" avtomatik yozilmaydi; QR bilan kelsa 20:00 da oxirgi dars tugashi bilan "ketdi"; dars bekor bo‘lsa — yopilmaydi', async () => {
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

    expect(await recordAutoAttendance(at('09:46'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('17:31'))).toEqual({ checkOuts: 0 });
    expect(await events(teacher.user.id)).toEqual([]);

    await createUserWithToken(app, { role: 'RECEPTION', email: 'reception@test.uz' });
    vi.setSystemTime(at('09:50', '2026-11-04'));
    const teacherToken = await loginAs(app, 'teacher@test.uz');
    const display = await loginAs(app, 'reception@test.uz');
    const qr = (await request(app).post('/api/staff-attendance/qr').set(bearer(display)).expect(201)).body.data.token as string;
    await request(app).post('/api/staff-attendance/scan').set(bearer(teacherToken)).send({ token: qr, action: 'CHECK_IN' }).expect(200);
    expect(await recordAutoAttendance(at('11:31', '2026-11-04'))).toEqual({ checkOuts: 0 });
    expect(await recordAutoAttendance(at('20:01', '2026-11-04'))).toEqual({ checkOuts: 1 });
    const wednesday = await prisma.staffAttendanceDay.findFirstOrThrow({ where: { userId: teacher.user.id, date: new Date('2026-11-04T00:00:00Z') } });
    expect([hhmm(wednesday.checkInAt!), hhmm(wednesday.checkOutAt!)]).toEqual(['09:50', '11:30']);

    // Dushanba: yagona dars bekor qilingan — dars kuni emas, ochiq kun avtomatik yopilmaydi
    await prisma.attendanceSession.create({
      data: { groupId: morning.id, date: new Date('2026-11-02T00:00:00Z'), status: 'CANCELLED', teacherId: teacher.user.id },
    });
    const monday = await prisma.staffAttendanceDay.create({
      data: { userId: teacher.user.id, date: new Date('2026-11-02T00:00:00Z'), phase: 'WORKING', checkInAt: at('09:40', '2026-11-02') },
    });
    await prisma.staffAttendanceEvent.create({ data: { dayId: monday.id, userId: teacher.user.id, type: 'CHECK_IN', occurredAt: at('09:40', '2026-11-02'), source: 'QR' } });
    expect(await recordAutoAttendance(at('20:30', '2026-11-02'))).toEqual({ checkOuts: 0 });
  });

  it('ketishni unutganlar: ish tugagach 30 daqiqada xodimga eslatma, 18:00 da rahbarga ro‘yxat (kechki darsdagi o‘qituvchisiz), 20:00 da yopiladi', async () => {
    // Guli 08:00 da QR bilan keldi (ish 17:30 gacha); o'qituvchining kechki darsi 18:30–20:30
    const openDay = async (userId: string, time: string) => {
      const day = await prisma.staffAttendanceDay.create({ data: { userId, date: new Date(`${FRIDAY}T00:00:00Z`), phase: 'WORKING', checkInAt: at(time) } });
      await prisma.staffAttendanceEvent.create({ data: { dayId: day.id, userId, type: 'CHECK_IN', occurredAt: at(time), source: 'QR' } });
      return day.id;
    };
    const guliDay = await openDay(guliId, '08:00');
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz', firstName: 'Kechki', lastName: 'Ustoz' });
    await prisma.teacherProfile.create({ data: { userId: teacher.user.id } });
    const group = await createGroup({ courseId: (await createCourse()).id, teacherId: teacher.user.id, scheduleDays: ['FRIDAY'] });
    await prisma.group.update({ where: { id: group.id }, data: { startTime: '18:30', endTime: '20:30' } });
    await request(app)
      .put(`/api/staff-attendance/schedules/${teacher.user.id}`)
      .set(bearer(admin))
      .send({ mode: 'LESSONS', lessonLeadMinutes: 15, autoMark: true, effectiveFrom: '2026-10-01' })
      .expect(200);
    const teacherDay = await openDay(teacher.user.id, '18:10');

    // Xodimga eslatma: 17:30 + 30 daqiqa
    expect(await notifyCheckoutReminders(at('17:55'))).toBe(0);
    expect(await notifyCheckoutReminders(at('18:01'))).toBe(1);
    expect(await notifyCheckoutReminders(at('18:30'))).toBe(0);
    const reminder = await prisma.notification.findFirstOrThrow({ where: { userId: guliId, title: 'Ishdan ketishni belgilang' } });
    expect(reminder.message).toContain('17:30');
    expect(reminder.message).toContain('20:00 gacha belgilanmasa');

    // Rahbarga ro'yxat: 18:00 dan, bir marta; o'qituvchi hali darsda — kirmaydi
    expect(await notifyCheckoutDigest(at('17:59'))).toBe(0);
    expect(await notifyCheckoutDigest(at('18:05'))).toBe(1);
    expect(await notifyCheckoutDigest(at('18:40'))).toBe(0);
    const digest = await prisma.notification.findFirstOrThrow({ where: { userId: adminId, title: { startsWith: 'Ketishi belgilanmagan' } } });
    expect(digest.title).toBe('Ketishi belgilanmagan: 1 kishi');
    expect(digest.message).toContain('Guli Karimova (17:30 gacha)');
    expect(digest.message).not.toContain('Kechki Ustoz');

    // 20:00: Guli 17:30 bilan yopiladi; o'qituvchi darsi 20:30 da tugaydi — hali yopilmaydi
    expect(await recordAutoAttendance(at('20:01'))).toEqual({ checkOuts: 1 });
    expect(hhmm((await prisma.staffAttendanceDay.findUniqueOrThrow({ where: { id: guliDay } })).checkOutAt!)).toBe('17:30');
    expect((await prisma.staffAttendanceDay.findUniqueOrThrow({ where: { id: teacherDay } })).phase).toBe('WORKING');
    // O'qituvchiga eslatma 21:00 da (20:30 + 30), yopilishi — dars tugashi bilan
    expect(await notifyCheckoutReminders(at('20:45'))).toBe(0);
    expect(await recordAutoAttendance(at('20:31'))).toEqual({ checkOuts: 1 });
    expect(hhmm((await prisma.staffAttendanceDay.findUniqueOrThrow({ where: { id: teacherDay } })).checkOutAt!)).toBe('20:30');
    // Hammasi yopilgan — 22:00 dagi "ketish belgilanmagan" xabari kerak emas
    expect(await notifyMissingCheckouts(at('22:05'))).toBe(0);
  });

  it('eski tasdiqlanmagan avtomatik "keldi"larni tozalash: sanash hech narsa o‘zgartirmaydi; bajarish faqat avtomatik kunlarni tuzatish bilan bekor qiladi', async () => {
    const legacyDay = async (date: string, events: Array<['CHECK_IN' | 'CHECK_OUT', 'AUTO' | 'QR', string]>) => {
      const day = await prisma.staffAttendanceDay.create({
        data: { userId: guliId, date: new Date(`${date}T00:00:00Z`), phase: 'CHECKED_OUT', checkInAt: at(events[0]![2], date), checkOutAt: at(events[1]![2], date) },
      });
      for (const [type, source, time] of events) {
        await prisma.staffAttendanceEvent.create({ data: { dayId: day.id, userId: guliId, type, source, occurredAt: at(time, date) } });
      }
      return day.id;
    };
    const autoDay = await legacyDay('2026-10-29', [['CHECK_IN', 'AUTO', '08:00'], ['CHECK_OUT', 'AUTO', '17:30']]);
    const mixedDay = await legacyDay('2026-10-28', [['CHECK_IN', 'AUTO', '08:00'], ['CHECK_OUT', 'QR', '18:05']]);
    const qrDay = await legacyDay('2026-10-27', [['CHECK_IN', 'QR', '07:55'], ['CHECK_OUT', 'QR', '17:40']]);

    const dry = await cleanupAutoCheckIns({ apply: false });
    expect(dry).toEqual({ apply: false, autoOnlyDays: 1, autoOnlyUsers: 1, voidedEvents: 2, byDate: { '2026-10-29': 1 }, mixedDays: 1 });
    expect(await prisma.staffAttendanceEvent.count({ where: { voidedAt: { not: null } } })).toBe(0);
    expect(await prisma.staffAttendanceCorrection.count()).toBe(0);

    const applied = await cleanupAutoCheckIns({ apply: true });
    expect(applied).toMatchObject({ apply: true, autoOnlyDays: 1, voidedEvents: 2, mixedDays: 1 });
    const cleaned = await prisma.staffAttendanceDay.findUniqueOrThrow({ where: { id: autoDay } });
    expect(cleaned).toMatchObject({ phase: null, checkInAt: null, checkOutAt: null });
    const correction = await prisma.staffAttendanceCorrection.findFirstOrThrow({ where: { dayId: autoDay } });
    expect(correction.reason).toBe(AUTO_CLEANUP_REASON);
    expect(await prisma.staffAttendanceEvent.count({ where: { dayId: autoDay, voidedByCorrectionId: correction.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'staff_attendance.auto_voided', entityId: autoDay } })).toBe(1);
    // Aralash va QR kunlariga tegilmagan
    expect(await prisma.staffAttendanceEvent.count({ where: { dayId: { in: [mixedDay, qrDay] }, voidedAt: { not: null } } })).toBe(0);
    expect(await prisma.staffAttendanceCorrection.count({ where: { dayId: { in: [mixedDay, qrDay] } } })).toBe(0);

    vi.setSystemTime(at('18:00'));
    admin = await loginAs(app, 'admin@test.uz');
    const detail = await request(app).get(`/api/staff-attendance/users/${guliId}/days/2026-10-29`).set(bearer(admin)).expect(200);
    expect(detail.body.data.day).toMatchObject({ status: 'ABSENT', corrected: true });

    // Qayta ishga tushirish — hech narsa qilmaydi
    expect(await cleanupAutoCheckIns({ apply: true })).toMatchObject({ autoOnlyDays: 0, voidedEvents: 0, mixedDays: 1 });
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
