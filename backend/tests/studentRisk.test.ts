import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { studentRiskService } from '../src/services/studentRisk.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(new Date().setHours(0, 0, 0, 0) - days * DAY);
}

interface StudentSeed {
  name: string;
  groupId?: string;
  startedDaysAgo?: number;
  contract?: number;
  paid?: number;
  /** Oxirgi darslardagi holatlar, eng eskisidan boshlab */
  attendance?: Array<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>;
}

async function seedStudent(courseId: string, seed: StudentSeed) {
  const contract = seed.contract ?? 1_000_000;
  const paid = seed.paid ?? 0;
  const student = await prisma.student.create({
    data: {
      firstName: seed.name,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId: seed.groupId ?? null,
      contractPrice: contract,
      startDate: daysAgo(seed.startedDaysAgo ?? 90),
      debt: { create: { totalAmount: contract, paidAmount: paid, remainingAmount: contract - paid } },
    },
  });

  const marks = seed.attendance ?? [];
  for (const [index, status] of marks.entries()) {
    const date = daysAgo(marks.length - index);
    if (seed.groupId) {
      await prisma.attendanceSession.upsert({
        where: { groupId_date: { groupId: seed.groupId, date } },
        update: {},
        create: { groupId: seed.groupId, date, status: 'HELD' },
      });
    }
    await prisma.attendance.create({
      data: { studentId: student.id, groupId: seed.groupId!, date, status },
    });
  }
  return student;
}

describe.skipIf(!hasTestDatabase)('O‘quvchi xavfi (risk) va holat tarixi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('muntazam qatnaydigan va to‘laydigan o‘quvchi — barqaror (HEALTHY)', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await seedStudent(course.id, {
      name: 'Barqaror',
      groupId: group.id,
      paid: 1_000_000,
      attendance: ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'PRESENT', 'EXCUSED'],
    });

    const risk = await studentRiskService.forStudent(student.id);

    expect(risk.riskLevel).toBe('HEALTHY');
    expect(risk.healthScore).toBeGreaterThanOrEqual(80);
    expect(risk.reasons).toEqual([]);
  });

  it('ketma-ket kelmagan va qarzi bor o‘quvchi — kritik, sabablari ko‘rsatiladi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await seedStudent(course.id, {
      name: 'Xavfli',
      groupId: group.id,
      startedDaysAgo: 120,
      attendance: ['ABSENT', 'ABSENT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT'],
    });

    const risk = await studentRiskService.forStudent(student.id);

    expect(risk.riskLevel).toBe('CRITICAL');
    expect(risk.reasons.join(' ')).toContain('Ketma-ket kelmaslik');
    expect(risk.factors.find((factor) => factor.key === 'absences')?.value).toBe('3 ta');
    expect(risk.factors.find((factor) => factor.key === 'attendance')?.value).toBe('17%');
  });

  it('yangi yozilgan o‘quvchi qarzi uchun kritik deb belgilanmaydi (imtiyoz muddati)', async () => {
    const course = await createCourse();
    const student = await seedStudent(course.id, { name: 'Yangi', startedDaysAgo: 5 });

    const risk = await studentRiskService.forStudent(student.id);

    // Shartnoma to'lanmagan, lekin bu yangi o'quvchi uchun normal holat
    expect(risk.factors.find((factor) => factor.key === 'debt')?.score).toBeNull();
    expect(risk.riskLevel).toBeNull();
  });

  it('davomat foizi o‘tkazilgan darslar bo‘yicha hisoblanadi (belgilanmagan dars foizni oshirmaydi)', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await seedStudent(course.id, {
      name: 'Yarim',
      groupId: group.id,
      attendance: ['PRESENT', 'PRESENT'],
    });
    // Guruhda yana 2 ta dars o'tkazilgan, lekin bu o'quvchi uchun belgilanmagan
    for (const offset of [10, 11]) {
      await prisma.attendanceSession.create({
        data: { groupId: group.id, date: daysAgo(offset), status: 'HELD' },
      });
    }

    const risk = await studentRiskService.forStudent(student.id);

    // 2 ta qatnashgan / 4 ta o'tkazilgan dars = 50%
    expect(risk.factors.find((factor) => factor.key === 'attendance')?.value).toBe('50%');
  });

  it('qayta hisoblash natijani saqlaydi va at-risk ro‘yxati eng xavflisidan boshlanadi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await seedStudent(course.id, {
      name: 'Yaxshi',
      groupId: group.id,
      paid: 1_000_000,
      attendance: ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'],
    });
    await seedStudent(course.id, {
      name: 'Yomon',
      groupId: group.id,
      startedDaysAgo: 150,
      attendance: ['ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
    });

    const result = await studentRiskService.recalculateAll();
    expect(result.updated).toBe(2);
    expect(result.critical).toBe(1);

    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const response = await request(app).get('/api/students/at-risk').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ firstName: 'Yomon', riskLevel: 'CRITICAL' });
    expect(response.body.data[0].healthScore).toBeLessThan(40);
  });

  it('ro‘yxatni xavf darajasi bo‘yicha filtrlash mumkin', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await seedStudent(course.id, {
      name: 'Yomon',
      groupId: group.id,
      startedDaysAgo: 150,
      attendance: ['ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
    });
    await studentRiskService.recalculateAll();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const critical = await request(app).get('/api/students').query({ riskLevel: 'CRITICAL' }).set(bearer(token));
    const healthy = await request(app).get('/api/students').query({ riskLevel: 'HEALTHY' }).set(bearer(token));

    expect(critical.body.data).toHaveLength(1);
    expect(healthy.body.data).toHaveLength(0);
  });

  it('holat o‘zgarishi sabab bilan tarixga yoziladi', async () => {
    const course = await createCourse();
    const student = await seedStudent(course.id, { name: 'Muzlatilgan' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const changed = await request(app)
      .patch(`/api/students/${student.id}/status`)
      .set(bearer(token))
      .send({ status: 'FROZEN', reason: 'Oilaviy sabablarga ko‘ra 2 oyga to‘xtatdi' });
    const history = await request(app).get(`/api/students/${student.id}/status-history`).set(bearer(token));

    expect(changed.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      fromStatus: 'ACTIVE',
      toStatus: 'FROZEN',
      reason: 'Oilaviy sabablarga ko‘ra 2 oyga to‘xtatdi',
    });
    expect(history.body.data[0].changedBy).not.toBeNull();
  });

  it('ALUMNI holatiga o‘tkazish mumkin va risk hisobiga kirmaydi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await seedStudent(course.id, {
      name: 'Bitiruvchi',
      groupId: group.id,
      startedDaysAgo: 200,
      attendance: ['ABSENT', 'ABSENT', 'ABSENT'],
    });
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const changed = await request(app)
      .patch(`/api/students/${student.id}/status`)
      .set(bearer(token))
      .send({ status: 'ALUMNI' });
    const result = await studentRiskService.recalculateAll();

    expect(changed.status).toBe(200);
    expect(changed.body.data.status).toBe('ALUMNI');
    // Faqat ACTIVE va FROZEN kuzatiladi
    expect(result.updated).toBe(0);
  });

  it('profil orqali risk tafsilotlari ko‘rinadi, ruxsatsiz xodimga yopiq', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await seedStudent(course.id, { name: 'Tekshiruv', groupId: group.id, attendance: ['PRESENT'] });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: callCenter } = await createUserWithToken(app, { role: 'CALL_CENTER' });

    const allowed = await request(app).get(`/api/students/${student.id}/risk`).set(bearer(admin));
    const denied = await request(app).get(`/api/students/${student.id}/risk`).set(bearer(callCenter));

    expect(allowed.status).toBe(200);
    // 6 ta asosiy + TZ 3.0 §29 dagi 4 ta qo'shimcha sabab
    expect(allowed.body.data.factors.map((factor: { key: string }) => factor.key)).toEqual(['attendance', 'absences', 'debt', 'overdue', 'homework', 'exam', 'examTrend', 'missedHomework', 'activity', 'login']);
    expect(denied.status).toBe(403);
  });
});
