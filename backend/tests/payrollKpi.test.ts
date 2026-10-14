import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

/** Administrator ssenariysi 2026-yil mart oyi bo'yicha */
const MARCH = { year: 2026, month: 3 };

let counter = 0;

async function createEmployee(token: string, body: Record<string, unknown>) {
  counter += 1;
  const response = await request(app)
    .post('/api/employees')
    .set(bearer(token))
    .send({ firstName: 'Xodim', lastName: `KPI${counter}`, phone: `+99891${String(4_000_000 + counter)}`, hireDate: '2025-01-01', ...body });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function addKpi(token: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/salaries/kpi')
    .set(bearer(token))
    .send({ effectiveFrom: '2026-01-01', ...body });
}

async function employeePeriod(token: string, employeeId: string, month = MARCH) {
  const response = await request(app).get('/api/salaries/periods').query({ ...month, employeeId }).set(bearer(token));
  expect(response.status).toBe(200);
  return response.body.data[0];
}

describe.skipIf(!hasTestDatabase)('Maosh: KPI bonusi va tasdiqlash oqimi (integratsion)', () => {
  let ownerToken: string;
  let accountantToken: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: ownerToken } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' }));
    ({ token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'buxgalter@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('KPI sozlamasi: vaznlar 100% dan oshmaydi, foizli maqsad 100% dan oshmaydi, sozlash faqat tasdiqlovchiga', async () => {
    expect((await addKpi(ownerToken, { name: 'Vazifalar', position: 'ADMINISTRATOR', metric: 'TASK_COMPLETION', target: 90, weight: 70 })).status).toBe(201);
    const over = await addKpi(ownerToken, { name: 'Davomat', position: 'ADMINISTRATOR', metric: 'ATTENDANCE_RATE', target: 90, weight: 40 });
    expect(over.status).toBe(422);
    expect(over.body.errors[0]).toMatchObject({ field: 'weight' });
    expect((await addKpi(ownerToken, { name: 'Davomat', position: 'ADMINISTRATOR', metric: 'ATTENDANCE_RATE', target: 120, weight: 30 })).status).toBe(422);
    expect((await addKpi(accountantToken, { name: 'Davomat', position: 'ADMINISTRATOR', metric: 'ATTENDANCE_RATE', target: 90, weight: 30 })).status).toBe(403);

    const list = await request(app).get('/api/salaries/kpi').set(bearer(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.data.settings).toEqual({ threshold: 50 });
    expect(list.body.data.positions.find((row: { position: string }) => row.position === 'ADMINISTRATOR')).toMatchObject({ weightSum: 70, valid: false });
  });

  it('administrator: belgilangan maosh + KPI bonusi (fond × vaznli bajarilish), natija izohlanadi', async () => {
    const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'adminxodim@test.uz' });
    const employeeId = await createEmployee(ownerToken, { position: 'ADMINISTRATOR', baseSalary: 3_000_000, userId: user.id });
    expect((await request(app).put(`/api/salaries/kpi/pool/${employeeId}`).set(bearer(ownerToken)).send({ kpiBonusPool: 1_000_000 })).status).toBe(200);
    expect((await addKpi(ownerToken, { name: 'Vazifalar', position: 'ADMINISTRATOR', metric: 'TASK_COMPLETION', target: 100, weight: 60 })).status).toBe(201);
    const manual = await addKpi(ownerToken, { name: 'Mamnuniyat', position: 'ADMINISTRATOR', metric: 'MANUAL', target: 100, weight: 40 });
    expect(manual.status).toBe(201);

    // Martda 2 ta vazifa: biri muddatida bajarilgan, biri bajarilmagan → 50%
    await prisma.task.createMany({
      data: [
        { title: 'Hisobot', assigneeId: user.id, dueAt: new Date('2026-03-10T10:00:00Z'), status: 'DONE', completedAt: new Date('2026-03-09T10:00:00Z') },
        { title: 'Shartnoma', assigneeId: user.id, dueAt: new Date('2026-03-20T10:00:00Z'), status: 'OPEN' },
        { title: 'Bekor', assigneeId: user.id, dueAt: new Date('2026-03-21T10:00:00Z'), status: 'CANCELLED' },
      ],
    });

    // Qo'lda natija kiritilmagan — bahoga kirmaydi va ogohlantirish chiqadi
    const before = await request(app).get('/api/salaries/kpi/preview').query({ employeeId, ...MARCH }).set(bearer(ownerToken));
    expect(before.body.data).toMatchObject({ achievement: 50, bonus: 500_000 });
    expect(before.body.data.warnings.join(' ')).toContain('natijasi kiritilmagan');

    const saved = await request(app)
      .post('/api/salaries/kpi/results')
      .set(bearer(accountantToken))
      .send({ kpiId: manual.body.data.id, employeeId, ...MARCH, actual: 80, reason: 'Ota-onalar so‘rovi, 40 javob' });
    expect(saved.status).toBe(200);
    // (50 × 60 + 80 × 40) / 100 = 62 → 620 000
    expect(saved.body.data).toMatchObject({ achievement: 62, bonus: 620_000, configValid: true });

    expect((await request(app).post('/api/salaries/calculate').set(bearer(ownerToken)).send({ ...MARCH, employeeId })).status).toBe(200);
    const period = await employeePeriod(ownerToken, employeeId);
    expect(period).toMatchObject({ baseAmount: 3_000_000, kpiBonus: 620_000, kpiAchievement: 62, totalAmount: 3_620_000, status: 'CALCULATED' });
    const task = period.kpiDetails.results.find((row: { metric: string }) => row.metric === 'TASK_COMPLETION');
    expect(task).toMatchObject({ actual: 50, achievement: 50, basis: '1 / 2 vazifa' });

    // Chegara 70% — bajarilish 62% bo'lgani uchun bonus 0, sababi ogohlantirishda
    expect((await request(app).put('/api/salaries/kpi/settings').set(bearer(ownerToken)).send({ threshold: 70 })).status).toBe(200);
    await request(app).post('/api/salaries/calculate').set(bearer(ownerToken)).send({ ...MARCH, employeeId });
    const below = await employeePeriod(ownerToken, employeeId);
    expect(below).toMatchObject({ kpiBonus: 0, totalAmount: 3_000_000 });
    expect(below.warnings.join(' ')).toContain('chegara 70%');
  });

  it('filial ko‘rsatkichlari real yozuvlardan hisoblanadi; ma’lumot yo‘q KPI bahoga kirmaydi', async () => {
    const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'filial@test.uz' });
    const employeeId = await createEmployee(ownerToken, { position: 'ADMINISTRATOR', baseSalary: 3_000_000, userId: user.id });
    await request(app).put(`/api/salaries/kpi/pool/${employeeId}`).set(bearer(ownerToken)).send({ kpiBonusPool: 1_000_000 });
    for (const [metric, target] of [['PAYMENT_COLLECTION', 90], ['ATTENDANCE_RATE', 90], ['STUDENT_RETENTION', 95], ['LEAD_CONVERSION', 20]] as const) {
      expect((await addKpi(ownerToken, { name: metric, position: 'ADMINISTRATOR', metric, target, weight: 25 })).status).toBe(201);
    }
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: null });
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567', courseId: course.id, groupId: group.id, contractPrice: 1_000_000, startDate: new Date('2026-02-01'), createdAt: new Date('2026-02-01T00:00:00Z') },
    });
    // Martda 4 ta davomat belgisi: 3 tasi kelgan/kechikkan → 75%
    const marks = [['2026-03-02', 'PRESENT'], ['2026-03-04', 'LATE'], ['2026-03-06', 'PRESENT'], ['2026-03-09', 'ABSENT']] as const;
    for (const [date, status] of marks) {
      await prisma.attendance.create({ data: { studentId: student.id, groupId: group.id, date: new Date(`${date}T00:00:00Z`), status } });
    }

    const preview = await request(app).get('/api/salaries/kpi/preview').query({ employeeId, ...MARCH }).set(bearer(ownerToken));
    expect(preview.status).toBe(200);
    const byMetric = Object.fromEntries(preview.body.data.results.map((row: { metric: string }) => [row.metric, row]));
    expect(byMetric.ATTENDANCE_RATE).toMatchObject({ actual: 75, basis: '3 / 4 belgi' });
    expect(byMetric.STUDENT_RETENTION).toMatchObject({ actual: 100 });
    expect(byMetric.PAYMENT_COLLECTION).toMatchObject({ actual: null, achievement: null });
    expect(byMetric.LEAD_CONVERSION).toMatchObject({ actual: null });
    // Faqat ma'lumoti bor ikki KPI: (75/90 = 83.3%) va 100% → 91.7%
    expect(preview.body.data.achievement).toBeCloseTo(91.7, 1);
    expect(preview.body.data.bonus).toBe(917_000);
    expect(preview.body.data.warnings.join(' ')).toContain('to‘lov jadvali yo‘q');
  });

  it('vaznlar 100% bo‘lmasa KPI bonusi hisoblanmaydi va ogohlantiriladi', async () => {
    const employeeId = await createEmployee(ownerToken, { position: 'MANAGER', baseSalary: 2_000_000, kpiBonusPool: 0 });
    await request(app).put(`/api/salaries/kpi/pool/${employeeId}`).set(bearer(ownerToken)).send({ kpiBonusPool: 500_000 });
    await addKpi(ownerToken, { name: 'Davomat', position: 'MANAGER', metric: 'ATTENDANCE_RATE', target: 90, weight: 60 });
    await request(app).post('/api/salaries/calculate').set(bearer(ownerToken)).send({ ...MARCH, employeeId });
    const period = await employeePeriod(ownerToken, employeeId);
    expect(period.kpiBonus).toBe(0);
    expect(period.warnings.join(' ')).toContain('60%');
  });

  it('tasdiqlash oqimi: yuborish → rad etish (sabab) → qayta yuborish → summa o‘zgarsa qaytadi → tasdiqlash', async () => {
    const employeeId = await createEmployee(ownerToken, { position: 'ACCOUNTANT', baseSalary: 4_000_000 });
    await request(app).post('/api/salaries/calculate').set(bearer(ownerToken)).send({ ...MARCH, employeeId });
    const { id } = await employeePeriod(ownerToken, employeeId);

    // Yuborilmagan maosh tasdiqlanmaydi
    const direct = await request(app).post(`/api/salaries/periods/${id}/approve`).set(bearer(ownerToken));
    expect(direct.status).toBe(422);
    expect(direct.body.message).toContain('yuboring');

    const sent = await request(app).post(`/api/salaries/periods/${id}/submit`).set(bearer(accountantToken));
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({ status: 'UNDER_REVIEW', submittedBy: { firstName: expect.any(String) } });
    // Buxgalter tasdiqlay va rad eta olmaydi
    expect((await request(app).post(`/api/salaries/periods/${id}/reject`).set(bearer(accountantToken)).send({ reason: 'Yo‘q' })).status).toBe(403);

    const rejected = await request(app).post(`/api/salaries/periods/${id}/reject`).set(bearer(ownerToken)).send({ reason: 'Bonus kiritilmagan' });
    expect(rejected.body.data).toMatchObject({ status: 'CALCULATED', rejectReason: 'Bonus kiritilmagan', submittedAt: null });

    await request(app).post(`/api/salaries/periods/${id}/submit`).set(bearer(accountantToken)).expect(200);
    // Ko'rib chiqilayotganda bonus qo'shildi — summa o'zgardi, maosh qayta "Hisoblangan"
    const bonus = await request(app)
      .post('/api/salaries/adjustments')
      .set(bearer(accountantToken))
      .send({ employeeId, ...MARCH, type: 'BONUS', category: 'PERFORMANCE', amount: 200_000, reason: 'Hisobot sifati', date: '2026-03-25' });
    expect(bonus.status).toBe(201);
    expect(bonus.body.data).toMatchObject({ status: 'CALCULATED', totalAmount: 4_200_000 });

    const bulk = await request(app).post('/api/salaries/submit').set(bearer(accountantToken)).send(MARCH);
    expect(bulk.body.data).toEqual({ submitted: 1, skipped: 0 });
    const approved = await request(app).post(`/api/salaries/periods/${id}/approve`).set(bearer(ownerToken));
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', totalAmount: 4_200_000 });

    // Profil: tarix va xronologiya
    const profile = await request(app).get('/api/salaries/profile').query({ type: 'EMPLOYEE', id: employeeId, ...MARCH }).set(bearer(ownerToken));
    expect(profile.status).toBe(200);
    expect(profile.body.data.current).toMatchObject({ id, status: 'APPROVED' });
    expect(profile.body.data.timeline.map((row: { label: string }) => row.label)).toEqual(
      expect.arrayContaining(['Hisoblandi', 'Tasdiqlashga yuborildi', 'Rad etildi', 'Tasdiqlandi']),
    );

    const summary = await request(app).get('/api/salaries/summary').query(MARCH).set(bearer(ownerToken));
    expect(summary.body.data).toMatchObject({ accrued: 4_200_000, underReview: 0, budget: null });
    expect(summary.body.data.byGroup).toEqual([{ key: 'ACCOUNTANT', label: 'Buxgalter', count: 1, total: 4_200_000 }]);
  });

  it('operator: jalb qilingan o‘quvchi — konversiya paytidagi mas’ul va shu oydagi birinchi to‘lov; takror va bekor qilingan sanalmaydi', async () => {
    const month = currentBusinessMonth();
    const { user: operator } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'operator@test.uz' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'boshqa@test.uz' });
    const employeeId = await createEmployee(ownerToken, { position: 'CALL_CENTER', baseSalary: 2_000_000, userId: operator.id });
    await request(app).put(`/api/salaries/kpi/pool/${employeeId}`).set(bearer(ownerToken)).send({ kpiBonusPool: 1_000_000 });
    await addKpi(ownerToken, { name: 'Yangi o‘quvchilar', position: 'CALL_CENTER', metric: 'ACQUIRED_STUDENTS', target: 4, weight: 100 });
    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 0, sortOrder: 1 } });

    const source = await createSource();
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: null });
    const hourAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

    async function convertedStudent(options: { assignedNow: string; atConversion: string; phone: string; reassignedAfter?: boolean }) {
      counter += 1;
      const lead = await prisma.lead.create({
        data: { firstName: `Lead${counter}`, phone: options.phone, sourceId: source.id, status: 'WON', assignedToId: options.assignedNow, convertedAt: hourAgo(2) },
      });
      await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'CREATED', description: 'Yaratildi', metadata: { assignedToId: other.id }, createdAt: hourAgo(5) } });
      await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'ASSIGNED', description: 'Biriktirildi', metadata: { from: other.id, to: options.atConversion }, createdAt: hourAgo(4) } });
      if (options.reassignedAfter) {
        await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'ASSIGNED', description: 'Qayta', metadata: { from: options.atConversion, to: options.assignedNow }, createdAt: hourAgo(1) } });
      }
      return prisma.student.create({
        data: {
          firstName: `O‘quvchi${counter}`,
          lastName: 'Jalb',
          phone: options.phone,
          courseId: course.id,
          groupId: group.id,
          leadId: lead.id,
          contractPrice: 1_000_000,
          startDate: new Date(),
          debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
        },
      });
    }
    async function pay(studentId: string, paidAt?: Date) {
      const response = await request(app)
        .post('/api/payments')
        .set(bearer(ownerToken))
        .send({ studentId, amount: 300_000, method: 'CASH', ...(paidAt ? { paidAt: paidAt.toISOString() } : {}) });
      expect(response.status).toBe(201);
      return response.body.data.id as string;
    }

    // 1) Konversiyada operator mas'ul, shu oyda to'ladi — sanaladi
    const first = await convertedStudent({ assignedNow: operator.id, atConversion: operator.id, phone: '+998901110001' });
    await pay(first.id);
    // 2) Konversiyadan keyin boshqaga o'tkazilgan — baribir operatorniki
    const second = await convertedStudent({ assignedNow: other.id, atConversion: operator.id, phone: '+998901110002', reassignedAfter: true });
    await pay(second.id);
    // 3) Konversiyada boshqa xodim mas'ul — sanalmaydi
    const third = await convertedStudent({ assignedNow: operator.id, atConversion: other.id, phone: '+998901110003' });
    await pay(third.id);
    // 4) To'lov bekor qilingan — sanalmaydi
    const fourth = await convertedStudent({ assignedNow: operator.id, atConversion: operator.id, phone: '+998901110004' });
    const voided = await pay(fourth.id);
    await prisma.payment.update({ where: { id: voided }, data: { deletedAt: new Date() } });
    // 5) Xuddi shu telefon (takroriy yozuv) — bir marta
    const duplicate = await convertedStudent({ assignedNow: operator.id, atConversion: operator.id, phone: '+998901110001' });
    await pay(duplicate.id);

    const preview = await request(app).get('/api/salaries/kpi/preview').query({ employeeId, ...month }).set(bearer(ownerToken));
    expect(preview.status).toBe(200);
    expect(preview.body.data.acquisitions.map((row: { studentId: string }) => row.studentId).sort()).toEqual([first.id, second.id].sort());
    // 2 / 4 = 50% ≥ chegara 50% → 500 000
    expect(preview.body.data).toMatchObject({ achievement: 50, bonus: 500_000 });

    const profile = await request(app).get('/api/salaries/profile').query({ type: 'EMPLOYEE', id: employeeId, ...month }).set(bearer(ownerToken));
    expect(profile.body.data.sales.acquired).toHaveLength(2);
    expect(profile.body.data.kpis).toHaveLength(1);
  });
});
