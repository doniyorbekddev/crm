import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyAbsences, notifyMissingCheckouts } from '../src/jobs/staffAttendance.job.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** Juma, 09:20 Toshkent vaqti */
const NOW = new Date('2026-10-30T09:20:00+05:00');
const FRIDAY = '2026-10-30';

const FIXED_SCHEDULE = {
  mode: 'FIXED',
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  graceMinutes: 10,
  absentAfterMinutes: 120,
  effectiveFrom: '2026-10-01',
};

describe.skipIf(!hasTestDatabase)('Xodim davomati — QR (integratsion)', () => {
  let admin: string;
  let adminId: string;
  let reception: string;
  let operator: string;
  let operatorId: string;

  async function issueQr(token = reception): Promise<{ id: string; token: string }> {
    const response = await request(app).post('/api/staff-attendance/qr').set(bearer(token)).expect(201);
    return response.body.data;
  }

  async function scan(userToken: string, action: string, qr?: string, status?: number) {
    const code = qr ?? (await issueQr()).token;
    const response = await request(app).post('/api/staff-attendance/scan').set(bearer(userToken)).send({ token: code, action });
    if (status !== undefined) expect(response.status, JSON.stringify(response.body)).toBe(status);
    return response;
  }

  /** Soxta vaqtni suradi; access token muddati tugamasin deb asosiy hisoblar qayta kiradi */
  async function setTime(value: string | Date) {
    vi.setSystemTime(typeof value === 'string' ? new Date(`${FRIDAY}T${value}:00+05:00`) : value);
    admin = await loginAs(app, 'admin@test.uz');
    reception = await loginAs(app, 'reception@test.uz');
    operator = await loginAs(app, 'operator@test.uz');
  }

  async function createTeacher() {
    const created = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    await prisma.teacherProfile.create({ data: { userId: created.user.id } });
    return created;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await resetDatabase();
    await seedRolesAndPermissions();
    const adminUser = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz', firstName: 'Aziza', lastName: 'Rahbar' });
    admin = adminUser.token;
    adminId = adminUser.user.id;
    ({ token: reception } = await createUserWithToken(app, { role: 'RECEPTION', email: 'reception@test.uz' }));
    const operatorUser = await createUserWithToken(app, { role: 'CALL_CENTER', email: 'operator@test.uz', firstName: 'Ali', lastName: 'Valiyev' });
    operator = operatorUser.token;
    operatorId = operatorUser.user.id;
    await prisma.employee.create({
      data: { userId: operatorId, firstName: 'Ali', lastName: 'Valiyev', position: 'CALL_CENTER', hireDate: new Date('2026-01-01T00:00:00Z') },
    });
    await request(app).put(`/api/staff-attendance/schedules/${operatorId}`).set(bearer(admin)).send(FIXED_SCHEDULE).expect(200);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('to‘liq kun: keldi → tanaffus → qaytdi → ketdi; vaqtlar serverda, kechikish o‘z jadvali bo‘yicha', async () => {
    const checkIn = await scan(operator, 'CHECK_IN', undefined, 200);
    expect(checkIn.body.data).toMatchObject({ action: 'CHECK_IN', replayed: false, occurredAt: NOW.toISOString() });
    expect(checkIn.body.data.today.day).toMatchObject({ status: 'WORKING', arrival: 'LATE', lateMinutes: 20 });
    expect(checkIn.body.data.today.actions).toEqual(['BREAK_START', 'CHECK_OUT']);

    await setTime('13:00');
    await scan(operator, 'BREAK_START', undefined, 200);
    await setTime('13:30');
    await scan(operator, 'BREAK_END', undefined, 200);
    await setTime('18:10');
    const out = await scan(operator, 'CHECK_OUT', undefined, 200);
    expect(out.body.data.today.day).toMatchObject({
      status: 'LATE',
      phase: 'CHECKED_OUT',
      breakSeconds: 30 * 60,
      workedSeconds: (8 * 60 + 50 - 30) * 60,
      earlyMinutes: 0,
    });
    expect(out.body.data.today.actions).toEqual([]);

    // Xodimga tasdiq va rahbarga kechikish xabari (bir martadan)
    const mine = await prisma.notification.findMany({ where: { userId: operatorId, type: 'STAFF_ATTENDANCE' }, orderBy: { createdAt: 'asc' } });
    expect(mine.map((item) => item.title).sort()).toEqual(['Ishdan ketganingiz qayd etildi', 'Ishga kelganingiz qayd etildi']);
    const late = await prisma.notification.findMany({ where: { userId: adminId, title: 'Xodim kechikdi' } });
    expect(late).toHaveLength(1);
    expect(late[0]!.message).toContain('20 daqiqa kechikdi');
  });

  it('frontend yuborgan userId e’tiborga olinmaydi — xodim faqat sessiyadan aniqlanadi', async () => {
    const qr = await issueQr();
    await request(app).post('/api/staff-attendance/scan').set(bearer(operator)).send({ token: qr.token, action: 'CHECK_IN', userId: adminId }).expect(200);
    expect(await prisma.staffAttendanceEvent.count({ where: { userId: operatorId } })).toBe(1);
    expect(await prisma.staffAttendanceEvent.count({ where: { userId: adminId } })).toBe(0);
  });

  it('muddati o‘tgan, tanilmagan va ikki marta ishlatilgan QR rad etiladi', async () => {
    const qr = await issueQr();
    await setTime(new Date(NOW.getTime() + 61_000));
    const expired = await scan(operator, 'CHECK_IN', qr.token, 422);
    expect(expired.body.errors[0]).toMatchObject({ field: 'qr', message: 'EXPIRED' });

    const unknown = await scan(operator, 'CHECK_IN', 'x'.repeat(43), 422);
    expect(unknown.body.errors[0].message).toBe('INVALID');

    // Bir martalik: boshqa xodim ham, o'zi boshqa amal bilan ham ishlata olmaydi
    const { token: teacher } = await createTeacher();
    const fresh = await issueQr();
    await scan(operator, 'CHECK_IN', fresh.token, 200);
    const reused = await scan(teacher, 'CHECK_IN', fresh.token, 409);
    expect(reused.body.errors[0].message).toBe('USED');
    await scan(operator, 'BREAK_START', fresh.token, 409);
  });

  it('takroriy yuborish (replay) idempotent: shu xodim, shu amal — yangi hodisa yozilmaydi', async () => {
    const qr = await issueQr();
    await scan(operator, 'CHECK_IN', qr.token, 200);
    const again = await scan(operator, 'CHECK_IN', qr.token, 200);
    expect(again.body.data.replayed).toBe(true);
    expect(await prisma.staffAttendanceEvent.count()).toBe(1);
  });

  it('noto‘g‘ri ketma-ketlik: ikki marta keldi, kelmasdan ketdi, tanaffusdan qaytmay ketdi', async () => {
    const noCheckIn = await scan(operator, 'CHECK_OUT', undefined, 409);
    expect(noCheckIn.body.message).toMatch(/Avval ishga kelganingizni/);
    // Rad etilgan amal QR'ni sarflamaydi
    const qr = await issueQr();
    await scan(operator, 'BREAK_END', qr.token, 409);
    expect((await prisma.staffQrToken.findUniqueOrThrow({ where: { id: qr.id } })).usedAt).toBeNull();

    await scan(operator, 'CHECK_IN', qr.token, 200);
    const duplicate = await scan(operator, 'CHECK_IN', undefined, 409);
    expect(duplicate.body.message).toMatch(/allaqachon/);
    await scan(operator, 'BREAK_START', undefined, 200);
    await scan(operator, 'CHECK_OUT', undefined, 409);
    await scan(operator, 'BREAK_END', undefined, 200);
    await scan(operator, 'CHECK_OUT', undefined, 200);
    const after = await scan(operator, 'CHECK_OUT', undefined, 409);
    expect(after.body.message).toMatch(/yakunlangan/);
  });

  it('bir vaqtdagi so‘rovlar: bitta QR — bitta hodisa; bir xodimning ikki "keldi"si — bittasi yoziladi', async () => {
    const { token: teacher, user: teacherUser } = await createTeacher();
    const qr = await issueQr();
    const sameToken = await Promise.all([scan(operator, 'CHECK_IN', qr.token), scan(teacher, 'CHECK_IN', qr.token)]);
    expect(sameToken.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.staffAttendanceEvent.count({ where: { qrTokenId: qr.id } })).toBe(1);

    const { token: other, user: otherUser } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher2@test.uz' });
    await prisma.teacherProfile.create({ data: { userId: otherUser.id } });
    const [first, second] = await Promise.all([issueQr(), issueQr()]);
    const twice = await Promise.all([scan(other, 'CHECK_IN', first.token), scan(other, 'CHECK_IN', second.token)]);
    expect(twice.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.staffAttendanceEvent.count({ where: { userId: otherUser.id, type: 'CHECK_IN', voidedAt: null } })).toBe(1);
    expect(teacherUser.id).not.toBe(otherUser.id);
  });

  it("ruxsatlar: QR'ni faqat qabulxona/administrator yaratadi; kirmagan foydalanuvchi skanerlay olmaydi", async () => {
    await request(app).post('/api/staff-attendance/qr').set(bearer(operator)).expect(403);
    await request(app).post('/api/staff-attendance/qr').set(bearer(admin)).expect(201);
    await request(app).post('/api/staff-attendance/scan').send({ token: 'a'.repeat(43), action: 'CHECK_IN' }).expect(401);

    // Qabulxona hisobi o'zi davomat sub'ekti emas
    const qr = await issueQr();
    const notTracked = await scan(reception, 'CHECK_IN', qr.token, 403);
    expect(notTracked.body.message).toMatch(/davomati yuritilmaydi/);

    // Xodim boshqalarning davomatini ko'ra olmaydi, tuzata olmaydi
    await request(app).get('/api/staff-attendance/overview').set(bearer(operator)).expect(403);
    await request(app).get(`/api/staff-attendance/users/${adminId}/days/${FRIDAY}`).set(bearer(operator)).expect(403);
    await request(app)
      .post(`/api/staff-attendance/users/${operatorId}/days/${FRIDAY}/corrections`)
      .set(bearer(operator))
      .send({ action: 'ADD', type: 'CHECK_IN', time: '08:55', reason: 'O‘zim tuzatdim' })
      .expect(403);
    await request(app).put(`/api/staff-attendance/schedules/${operatorId}`).set(bearer(reception)).send(FIXED_SCHEDULE).expect(403);

    // QR holatini faqat uni yaratgan qurilma so'raydi
    await request(app).get(`/api/staff-attendance/qr/${qr.id}`).set(bearer(reception)).expect(200);
    await request(app).get(`/api/staff-attendance/qr/${qr.id}`).set(bearer(admin)).expect(404);
  });

  it('o‘qituvchi dars jadvali bo‘yicha: 13:50 da kelishi kechikish emas, administrator jadvali boshqa', async () => {
    const { user: teacherUser } = await createTeacher();
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacherUser.id, scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], startDate: '2026-09-01' });
    await prisma.group.update({ where: { id: group.id }, data: { status: 'ACTIVE', startTime: '14:00', endTime: '15:30' } });
    await request(app)
      .put(`/api/staff-attendance/schedules/${teacherUser.id}`)
      .set(bearer(admin))
      .send({ mode: 'LESSONS', lessonLeadMinutes: 15, graceMinutes: 5, effectiveFrom: '2026-10-01' })
      .expect(200);

    await setTime('13:50');
    const result = await scan(await loginAs(app, 'teacher@test.uz'), 'CHECK_IN', undefined, 200);
    expect(result.body.data.today.day).toMatchObject({ arrival: 'PRESENT', lateMinutes: 0, scheduledStart: '13:45', scheduledEnd: '15:30', planSource: 'LESSONS' });
    expect(result.body.data.today.day.lessons).toEqual([{ groupName: group.name, startTime: '14:00', endTime: '15:30' }]);

    const overview = await request(app).get('/api/staff-attendance/overview').set(bearer(admin)).expect(200);
    const rows = overview.body.data.rows as Array<{ userId: string; status: string; scheduledStart: string }>;
    expect(rows.find((row) => row.userId === operatorId)).toMatchObject({ status: 'ABSENT', scheduledStart: '09:00' });
    expect(rows.find((row) => row.userId === teacherUser.id)).toMatchObject({ status: 'WORKING' });
  });

  it('dam olish kuni va bayram: kutilmaydi, "kelmagan" bo‘lmaydi', async () => {
    await request(app).post('/api/staff-attendance/holidays').set(bearer(admin)).send({ date: FRIDAY, name: 'Bayram' }).expect(201);
    await setTime('15:00');
    const overview = await request(app).get('/api/staff-attendance/overview').set(bearer(admin)).expect(200);
    expect(overview.body.data.rows.find((row: { userId: string }) => row.userId === operatorId)).toMatchObject({ status: 'OFF', expected: false });

    const saturday = await request(app).get('/api/staff-attendance/overview?date=2026-10-31').set(bearer(admin)).expect(200);
    expect(saturday.body.data.rows.find((row: { userId: string }) => row.userId === operatorId).status).toBe('OFF');
    const thursday = await request(app).get('/api/staff-attendance/overview?date=2026-10-29').set(bearer(admin)).expect(200);
    expect(thursday.body.data.rows.find((row: { userId: string }) => row.userId === operatorId).status).toBe('ABSENT');
  });

  it('chiqish belgilanmasa: kun tekshiruvga tushadi, vaqt o‘ylab topilmaydi, eslatma bir marta', async () => {
    await scan(operator, 'CHECK_IN', undefined, 200);
    await setTime('22:05');
    expect(await notifyMissingCheckouts(new Date())).toBe(1);
    expect(await notifyMissingCheckouts(new Date())).toBe(0);
    expect(await prisma.notification.count({ where: { userId: operatorId, title: 'Ishdan ketish belgilanmagan' } })).toBe(1);

    await setTime(new Date('2026-10-31T09:00:00+05:00'));
    const detail = await request(app).get(`/api/staff-attendance/users/${operatorId}/days/${FRIDAY}`).set(bearer(admin)).expect(200);
    expect(detail.body.data.day).toMatchObject({ status: 'PENDING_REVIEW', workedSeconds: null, checkOutAt: null });
    const overview = await request(app).get('/api/staff-attendance/overview').set(bearer(admin)).expect(200);
    expect(overview.body.data.reviewQueue).toEqual([expect.objectContaining({ userId: operatorId, date: FRIDAY })]);
    // Keyingi kuni yangi "keldi" mumkin
    await scan(operator, 'CHECK_IN', undefined, 200);
  });

  it('kelmagan xodim: baholash muddatidan keyin rahbarga bir marta', async () => {
    await setTime('10:30');
    expect(await notifyAbsences(new Date())).toBe(0);
    await setTime('11:05');
    expect(await notifyAbsences(new Date())).toBe(1);
    expect(await notifyAbsences(new Date())).toBe(0);
    expect(await prisma.notification.count({ where: { userId: adminId, title: 'Xodim ishga kelmadi' } })).toBe(1);
  });

  it('tuzatish: asl hodisa o‘chirilmaydi, sabab majburiy, tarix va audit yoziladi', async () => {
    await scan(operator, 'CHECK_IN', undefined, 200);
    const original = await prisma.staffAttendanceEvent.findFirstOrThrow({ where: { userId: operatorId } });
    const url = `/api/staff-attendance/users/${operatorId}/days/${FRIDAY}/corrections`;

    await request(app).post(url).set(bearer(admin)).send({ action: 'REPLACE', eventId: original.id, time: '08:58' }).expect(422);

    const corrected = await request(app)
      .post(url)
      .set(bearer(admin))
      .send({ action: 'REPLACE', eventId: original.id, time: '08:58', reason: 'Telefon zaryadsiz edi, qabulxona tasdiqladi' })
      .expect(200);
    expect(corrected.body.data.day).toMatchObject({ arrival: 'PRESENT', lateMinutes: 0, corrected: true });
    expect(corrected.body.data.events).toEqual([
      expect.objectContaining({ voided: false, source: 'CORRECTION', time: '08:58' }),
      expect.objectContaining({ id: original.id, voided: true, source: 'QR', time: '09:20' }),
    ]);
    expect(corrected.body.data.corrections[0]).toMatchObject({
      reason: 'Telefon zaryadsiz edi, qabulxona tasdiqladi',
      createdBy: 'Aziza Rahbar',
      before: [expect.objectContaining({ type: 'CHECK_IN', time: '09:20' })],
      after: [expect.objectContaining({ type: 'CHECK_IN', time: '08:58' })],
    });
    // Asl hodisa vaqti o'zgarmagan
    expect((await prisma.staffAttendanceEvent.findUniqueOrThrow({ where: { id: original.id } })).occurredAt.toISOString()).toBe(NOW.toISOString());
    expect(await prisma.auditLog.count({ where: { action: 'staff_attendance.corrected', userId: adminId } })).toBe(1);

    // Ketma-ketlikni buzadigan tuzatish rad etiladi va hech narsa o'zgarmaydi
    const broken = await request(app).post(url).set(bearer(admin)).send({ action: 'ADD', type: 'CHECK_OUT', time: '08:30', reason: 'Xato vaqt' }).expect(422);
    expect(broken.body.message).toMatch(/ketma-ketligi/);
    expect(await prisma.staffAttendanceCorrection.count()).toBe(1);

    // Kelajakdagi vaqt mumkin emas
    await request(app).post(url).set(bearer(admin)).send({ action: 'ADD', type: 'CHECK_OUT', time: '23:00', reason: 'Kelajak' }).expect(422);
  });

  it('ruxsat so‘rovi: xodim yuboradi, rahbar tasdiqlaydi yoki rad etadi; tasdiqlangani — sababli', async () => {
    const created = await request(app)
      .post('/api/staff-attendance/me/requests')
      .set(bearer(operator))
      .send({ type: 'ABSENCE', startDate: FRIDAY, reason: 'Kasal bo‘lib qoldim' })
      .expect(201);
    expect(await prisma.notification.count({ where: { userId: adminId, title: 'Yangi ruxsat so‘rovi' } })).toBe(1);
    await request(app).post('/api/staff-attendance/me/requests').set(bearer(operator)).send({ type: 'ABSENCE', startDate: FRIDAY, reason: 'Yana' }).expect(409);

    const decide = (token: string, body: object) => request(app).post(`/api/staff-attendance/requests/${created.body.data.id}/decide`).set(bearer(token)).send(body);
    await decide(operator, { status: 'APPROVED' }).expect(403);
    await decide(admin, { status: 'APPROVED', note: 'Sog‘ayib keting' }).expect(200);
    await decide(admin, { status: 'REJECTED' }).expect(409);
    expect(await prisma.notification.count({ where: { userId: operatorId, title: 'Ruxsat so‘rovingiz tasdiqlandi' } })).toBe(1);

    await setTime('12:00');
    const month = await request(app).get('/api/staff-attendance/me/month?year=2026&month=10').set(bearer(operator)).expect(200);
    expect(month.body.data.days[0]).toMatchObject({ date: FRIDAY, status: 'EXCUSED', excuseLabel: 'Kasal bo‘lib qoldim' });

    const late = await request(app)
      .post('/api/staff-attendance/me/requests')
      .set(bearer(operator))
      .send({ type: 'LATE_ARRIVAL', startDate: '2026-11-02', time: '11:00', reason: 'Bank' })
      .expect(201);
    await request(app).post(`/api/staff-attendance/requests/${late.body.data.id}/decide`).set(bearer(admin)).send({ status: 'REJECTED', note: 'Boshqa kunga' }).expect(200);
    const mine = await request(app).get('/api/staff-attendance/me/requests').set(bearer(operator)).expect(200);
    expect(mine.body.data.map((item: { status: string }) => item.status).sort()).toEqual(['APPROVED', 'REJECTED']);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'staff_permission.' } } })).toBe(4);
  });

  it('hisobot va eksport: davr jami, tanaffus ish vaqtiga kirmaydi', async () => {
    await scan(operator, 'CHECK_IN', undefined, 200);
    await setTime('13:00');
    await scan(operator, 'BREAK_START', undefined, 200);
    await setTime('14:00');
    await scan(operator, 'BREAK_END', undefined, 200);
    await setTime('18:00');
    await scan(operator, 'CHECK_OUT', undefined, 200);

    const report = await request(app).get('/api/staff-attendance/report?from=2026-10-26&to=2026-10-30').set(bearer(admin)).expect(200);
    const row = report.body.data.rows.find((item: { userId: string }) => item.userId === operatorId);
    expect(row.summary).toMatchObject({
      expectedDays: 5,
      attendedDays: 1,
      absentDays: 4,
      lateDays: 1,
      lateMinutes: 20,
      workedSeconds: (8 * 60 + 40 - 60) * 60,
      breakSeconds: 3600,
      attendancePercent: 20,
    });
    const csv = await request(app).get('/api/staff-attendance/report/export?from=2026-10-26&to=2026-10-30&format=csv').set(bearer(admin)).expect(200);
    expect(csv.text).toContain('Ali Valiyev');
    await request(app).get('/api/staff-attendance/report?from=2026-10-26&to=2026-10-30').set(bearer(operator)).expect(403);
  });

  it('maoshga ta’sir yo‘q: davomat moliyaviy yozuv, maosh yoki komissiya yaratmaydi', async () => {
    const counts = async () => ({
      salaryPeriods: await prisma.teacherSalaryPeriod.count(),
      salaryPayments: await prisma.teacherSalaryPayment.count(),
      adjustments: await prisma.payrollAdjustment.count(),
      commissions: await prisma.commissionEntry.count(),
      transactions: await prisma.transaction.count(),
      expenses: await prisma.expense.count(),
    });
    const before = await counts();
    await scan(operator, 'CHECK_IN', undefined, 200);
    await setTime('17:00');
    await scan(operator, 'CHECK_OUT', undefined, 200);
    const event = await prisma.staffAttendanceEvent.findFirstOrThrow({ where: { userId: operatorId, type: 'CHECK_OUT' } });
    await request(app)
      .post(`/api/staff-attendance/users/${operatorId}/days/${FRIDAY}/corrections`)
      .set(bearer(admin))
      .send({ action: 'VOID', eventId: event.id, reason: 'Noto‘g‘ri bosilgan' })
      .expect(200);
    expect(await counts()).toEqual(before);
  });
});
