import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PMT: qo'shimcha guruh o'qituvchisiga sozlanadigan ulush. Bo'linish to'lov paytida qotiriladi:
 * asosiy guruh o'qituvchisi — qolgan summadan, qo'shimcha guruh o'qituvchisi — ulushidan, har biri o'z foizi bilan.
 * Standart ulush 0 — avvalgi hisob-kitob o'zgarmaydi.
 */
const app = createApp();
const MARCH = { year: 2026, month: 3 };
const inMarch = (day = 10) => new Date(Date.UTC(2026, 2, day, 9)).toISOString();
let counter = 0;

describe.skipIf(!hasTestDatabase)('PMT: o‘qituvchi ulushi (integratsion)', () => {
  let admin: string;
  let courseId: string;
  let main: { userId: string; profileId: string; groupId: string };
  let extra: { userId: string; profileId: string; groupId: string };

  async function teacher(percentage: number, name: string) {
    counter += 1;
    const { user } = await createUserWithToken(app, { role: 'TEACHER', email: `pmt${counter}@test.uz`, firstName: name, lastName: 'Ustoz' });
    const group = await createGroup({ courseId, teacherId: user.id, name: `${name}-guruh` });
    const profile = await request(app).post('/api/teachers').set(bearer(admin)).send({ userId: user.id }).expect(201);
    await request(app)
      .post(`/api/teachers/${profile.body.data.id}/salary-rules`)
      .set(bearer(admin))
      .send({ type: 'PERCENTAGE', percentage, effectiveFrom: '2026-01-01' })
      .expect(201);
    return { userId: user.id, profileId: profile.body.data.id as string, groupId: group.id };
  }

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 10_000_000, sortOrder: 1 } });
    ({ token: admin } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'pmt-owner@test.uz' }));
    courseId = (await createCourse()).id;
    main = await teacher(30, 'Matematika');
    extra = await teacher(20, 'Ingliz');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function pmtStudent(share: number | null) {
    counter += 1;
    const student = await prisma.student.create({
      data: {
        firstName: `PMT${counter}`,
        lastName: 'O‘quvchi',
        phone: `+99894${String(1_000_000 + counter)}`,
        courseId,
        groupId: main.groupId,
        contractPrice: 6_000_000,
        startDate: new Date('2026-01-10'),
        debt: { create: { totalAmount: 6_000_000, remainingAmount: 6_000_000 } },
      },
    });
    await request(app).post(`/api/students/${student.id}/groups`).set(bearer(admin)).send({ groupId: extra.groupId }).expect(200);
    if (share !== null) {
      await request(app).put(`/api/students/${student.id}/groups/${extra.groupId}/share`).set(bearer(admin)).send({ commissionShare: share }).expect(200);
    }
    return student;
  }
  const pay = async (studentId: string, amount: number, paidAt = inMarch()) =>
    (await request(app).post('/api/payments').set(bearer(admin)).send({ studentId, amount, method: 'CASH', paidAt }).expect(201)).body.data as { id: string };
  const entriesOf = (teacherId: string) =>
    prisma.commissionEntry.findMany({ where: { teacherId }, orderBy: [{ createdAt: 'asc' }, { kind: 'asc' }], select: { kind: true, baseAmount: true, amount: true, reason: true } });
  const plain = (rows: Array<{ kind: string; baseAmount: { toNumber(): number }; amount: { toNumber(): number } }>) =>
    rows.map((row) => ({ kind: row.kind, base: row.baseAmount.toNumber(), amount: row.amount.toNumber() }));
  const calculate = (value = MARCH) => request(app).post('/api/salaries/calculate').set(bearer(admin)).send(value).expect(200);
  const period = async (profileId: string) =>
    (await request(app).get('/api/salaries/periods').query({ ...MARCH, teacherProfileId: profileId }).set(bearer(admin))).body.data[0];

  it('ulush 0 (standart): hammasi asosiy o‘qituvchiga — avvalgidek; bo‘linish yozuvi yo‘q', async () => {
    const student = await pmtStudent(null);
    await pay(student.id, 1_000_000);
    expect(plain(await entriesOf(main.userId))).toEqual([{ kind: 'ACCRUAL', base: 1_000_000, amount: 300_000 }]);
    expect(await entriesOf(extra.userId)).toHaveLength(0);
    expect(await prisma.paymentTeacherShare.count()).toBe(0);
  });

  it('40% ulush: 1 000 000 → asosiy 600 000 × 30% = 180 000, qo‘shimcha 400 000 × 20% = 80 000; maosh va tushum mos', async () => {
    const student = await pmtStudent(40);
    const payment = await pay(student.id, 1_000_000);
    expect(await prisma.paymentTeacherShare.findMany({ where: { paymentId: payment.id }, select: { teacherId: true, groupId: true } })).toEqual([
      { teacherId: extra.userId, groupId: extra.groupId },
    ]);
    expect(plain(await entriesOf(main.userId))).toEqual([{ kind: 'ACCRUAL', base: 600_000, amount: 180_000 }]);
    const extraEntries = await entriesOf(extra.userId);
    expect(plain(extraEntries)).toEqual([{ kind: 'ACCRUAL', base: 400_000, amount: 80_000 }]);
    expect(extraEntries[0]!.reason).toBe('PMT ulushi: Ingliz-guruh (40%)');

    await calculate();
    expect(await period(main.profileId)).toMatchObject({ groupRevenue: 600_000, percentageAmount: 180_000 });
    expect(await period(extra.profileId)).toMatchObject({ groupRevenue: 400_000, percentageAmount: 80_000 });

    const list = (await request(app).get('/api/teacher-commissions').query(MARCH).set(bearer(admin)).expect(200)).body.data as Array<{
      teacher: { profileId: string };
      revenue: number;
      payments: number;
      commission: number;
    }>;
    expect(list.find((row) => row.teacher.profileId === main.profileId)).toMatchObject({ revenue: 600_000, payments: 1, commission: 180_000 });
    expect(list.find((row) => row.teacher.profileId === extra.profileId)).toMatchObject({ revenue: 400_000, payments: 1, commission: 80_000 });
  });

  it('ulush keyin o‘zgarsa — o‘tgan to‘lov o‘zgarmaydi, qayta hisoblashda ham; yangi to‘lov yangi ulush bilan', async () => {
    const student = await pmtStudent(40);
    await pay(student.id, 1_000_000, inMarch(5));
    await request(app).put(`/api/students/${student.id}/groups/${extra.groupId}/share`).set(bearer(admin)).send({ commissionShare: 10 }).expect(200);
    await calculate();
    expect(await period(extra.profileId)).toMatchObject({ groupRevenue: 400_000, percentageAmount: 80_000 });

    await pay(student.id, 1_000_000, inMarch(20));
    await calculate();
    // 400 000 + 100 000 = 500 000 × 20%; asosiy: 600 000 + 900 000 = 1 500 000 × 30%
    expect(await period(extra.profileId)).toMatchObject({ groupRevenue: 500_000, percentageAmount: 100_000 });
    expect(await period(main.profileId)).toMatchObject({ groupRevenue: 1_500_000, percentageAmount: 450_000 });
    expect(await prisma.auditLog.count({ where: { action: 'student.group_share_changed' } })).toBe(2);
  });

  it('bekor qilish: ikkala o‘qituvchiga o‘z qismi bo‘yicha teskari yozuv; qisman qaytarish — ulushga proporsional', async () => {
    const student = await pmtStudent(40);
    const cancelled = await pay(student.id, 1_000_000, inMarch(5));
    await request(app).delete(`/api/payments/${cancelled.id}`).set(bearer(admin)).send({ reason: 'Xato kiritildi' }).expect(200);
    expect(plain(await entriesOf(main.userId))).toEqual([
      { kind: 'ACCRUAL', base: 600_000, amount: 180_000 },
      { kind: 'REVERSAL', base: -600_000, amount: -180_000 },
    ]);
    expect(plain(await entriesOf(extra.userId))).toEqual([
      { kind: 'ACCRUAL', base: 400_000, amount: 80_000 },
      { kind: 'REVERSAL', base: -400_000, amount: -80_000 },
    ]);

    const refunded = await pay(student.id, 1_000_000, inMarch(6));
    const refund = await request(app).post(`/api/payments/${refunded.id}/refunds`).set(bearer(admin)).send({ amount: 500_000, method: 'CASH', reason: 'Kursni erta tugatdi' });
    expect(refund.status).toBe(200);
    const reversals = async (teacherId: string) =>
      plain(await prisma.commissionEntry.findMany({ where: { teacherId, paymentId: refunded.id, kind: 'REVERSAL' }, select: { kind: true, baseAmount: true, amount: true } }));
    expect(await reversals(main.userId)).toEqual([{ kind: 'REVERSAL', base: -300_000, amount: -90_000 }]);
    expect(await reversals(extra.userId)).toEqual([{ kind: 'REVERSAL', base: -200_000, amount: -40_000 }]);

    await calculate();
    // Bekor qilingan to'lov tushumga kirmaydi; qaytarilgan to'lov — yozuvlar yig'indisi
    expect(await period(main.profileId)).toMatchObject({ percentageAmount: 90_000 });
    expect(await period(extra.profileId)).toMatchObject({ percentageAmount: 40_000 });
  });

  it('qayta hisoblash yozuvi yo‘q to‘lovga qotirilgan bo‘linish bo‘yicha yozuv yaratadi (butun summa emas)', async () => {
    const student = await pmtStudent(25);
    const payment = await pay(student.id, 800_000);
    await prisma.commissionEntry.deleteMany({ where: { paymentId: payment.id } });
    await calculate();
    expect(plain(await entriesOf(main.userId))).toEqual([{ kind: 'ACCRUAL', base: 600_000, amount: 180_000 }]);
    expect(plain(await entriesOf(extra.userId))).toEqual([{ kind: 'ACCRUAL', base: 200_000, amount: 40_000 }]);
  });

  it('cheklovlar: jami > 100% — 422; o‘qituvchi o‘zgartira olmaydi — 403; asosiy o‘qituvchining o‘z qo‘shimcha guruhi — bo‘linmaydi', async () => {
    const student = await pmtStudent(60);
    const third = await createGroup({ courseId, teacherId: main.userId, name: 'Matematika-2' });
    await request(app).post(`/api/students/${student.id}/groups`).set(bearer(admin)).send({ groupId: third.id }).expect(200);
    const over = await request(app).put(`/api/students/${student.id}/groups/${third.id}/share`).set(bearer(admin)).send({ commissionShare: 50 });
    expect(over.status).toBe(422);
    expect(over.body.errors[0].message).toContain('60%');
    await request(app).put(`/api/students/${student.id}/groups/${third.id}/share`).set(bearer(admin)).send({ commissionShare: 40 }).expect(200);

    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER', email: 'pmt-t@test.uz' });
    expect((await request(app).put(`/api/students/${student.id}/groups/${third.id}/share`).set(bearer(teacherToken)).send({ commissionShare: 10 })).status).toBe(403);

    // Ingliz 60% → qo'shimcha o'qituvchiga; Matematika-2 40% — asosiy o'qituvchining o'zi, unda qoladi
    await pay(student.id, 1_000_000);
    expect(plain(await entriesOf(extra.userId))).toEqual([{ kind: 'ACCRUAL', base: 600_000, amount: 120_000 }]);
    expect(plain(await entriesOf(main.userId))).toEqual([{ kind: 'ACCRUAL', base: 400_000, amount: 120_000 }]);
    const detail = (await request(app).get(`/api/students/${student.id}`).set(bearer(admin)).expect(200)).body.data;
    expect(detail.extraGroups.map((group: { commissionShare: number }) => group.commissionShare).sort()).toEqual([40, 60]);
  });
});
