import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyTasksDueSoon } from '../src/jobs/org.job.js';
import { notifyOverdueComplaints } from '../src/services/org/complaints.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

/**
 * ORG tizimi · 2-bosqich (Operations): murojaatlar, chegirma vakolati, tuzilma katalogi va ish tarixi,
 * ishga qabul qilish → onboarding, offboarding, aktivlar, bilimlar bazasi, eslatmalar.
 */
const app = createApp();
const HOUR = 3_600_000;

async function student(price = 1_000_000) {
  const course = await createCourse();
  return prisma.student.create({
    data: { firstName: 'Aziz', lastName: 'Karimov', phone: `+9989${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, courseId: course.id, contractPrice: price, startDate: new Date('2026-09-01'), debt: { create: { totalAmount: price, remainingAmount: price } } },
  });
}

describe.skipIf(!hasTestDatabase)('ORG · 2-bosqich', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ murojaatlar
  describe('Murojaatlar', () => {
    it('qabulxona kiritadi → rahbar yo‘naltiradi → mas’ul hal etadi (yechim majburiy) → kirituvchi yopadi; tarix va audit', async () => {
      const { token: reception, user: receptionUser } = await createUserWithToken(app, { role: 'ACCOUNTANT', firstName: 'Guli' });
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Umidjon' });
      const pupil = await student();

      expect((await request(app).post('/api/org/complaints').set(bearer(reception)).send({ source: 'PARENT', category: 'SCHEDULE', title: 'Dars vaqti', description: 'Dars vaqtini o‘zgartirish' })).status).toBe(422);
      const created = await request(app)
        .post('/api/org/complaints')
        .set(bearer(reception))
        .send({ source: 'PARENT', category: 'SCHEDULE', title: 'Dars vaqti noqulay', description: 'Ota-ona dars vaqtini kechroqqa surishni so‘radi', studentId: pupil.id, contactName: 'Karimova Dilnoza' });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect(created.body.data).toMatchObject({ status: 'NEW', severity: 'NORMAL', reporter: { id: receptionUser.id }, student: { id: pupil.id } });
      expect(new Date(created.body.data.dueAt).getTime() - new Date(created.body.data.createdAt).getTime()).toBe(72 * HOUR);

      // Mas'ul ko'ra olmaydi — hali biriktirilmagan
      expect((await request(app).get(`/api/org/complaints/${id}`).set(bearer(teacher))).status).toBe(404);
      const assigned = await request(app).post(`/api/org/complaints/${id}/assign`).set(bearer(admin)).send({ assigneeId: teacherUser.id, note: 'Guruh o‘qituvchisi' });
      expect(assigned.body.data).toMatchObject({ status: 'UNDER_REVIEW', assignee: { id: teacherUser.id } });
      expect(await prisma.notification.count({ where: { userId: teacherUser.id, type: 'COMPLAINT_UPDATE', title: 'Sizga murojaat biriktirildi' } })).toBe(1);

      expect((await request(app).post(`/api/org/complaints/${id}/status`).set(bearer(teacher)).send({ status: 'RESOLVED' })).status).toBe(422);
      expect((await request(app).post(`/api/org/complaints/${id}/status`).set(bearer(teacher)).send({ status: 'CLOSED', note: 'x' })).status).toBe(403);
      const resolved = await request(app).post(`/api/org/complaints/${id}/status`).set(bearer(teacher)).send({ status: 'RESOLVED', note: 'Kechki guruhga o‘tkazildi' });
      expect(resolved.body.data).toMatchObject({ status: 'RESOLVED', resolution: 'Kechki guruhga o‘tkazildi' });
      expect(await prisma.notification.count({ where: { userId: receptionUser.id, title: 'Murojaat hal etildi' } })).toBe(1);

      const closed = await request(app).post(`/api/org/complaints/${id}/status`).set(bearer(reception)).send({ status: 'CLOSED' });
      expect(closed.body.data.status).toBe('CLOSED');
      expect(closed.body.data.events.map((event: { type: string }) => event.type)).toEqual(['CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'STATUS_CHANGED']);
      expect(await prisma.auditLog.count({ where: { entityType: 'complaint', entityId: id } })).toBe(4);
    });

    it('xavfsizlik — darhol kritik va CEOga ko‘tariladi (4 soatlik muddat); muddati o‘tgani bir marta eslatiladi', async () => {
      const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: reception } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
      const created = await request(app).post('/api/org/complaints').set(bearer(reception)).send({ source: 'STUDENT', category: 'SAFETY', title: 'Tazyiq haqida xabar', description: 'O‘quvchi tanaffusda tazyiq bo‘lganini aytdi', contactName: 'Ali' });
      expect(created.body.data).toMatchObject({ severity: 'CRITICAL', status: 'NEW' });
      expect(created.body.data.escalatedAt).not.toBeNull();
      expect(new Date(created.body.data.dueAt).getTime() - new Date(created.body.data.createdAt).getTime()).toBe(4 * HOUR);
      expect(await prisma.notification.count({ where: { userId: owner.id, title: '🚨 Murojaat rahbarga ko‘tarildi' } })).toBe(1);

      expect(await notifyOverdueComplaints(new Date(Date.now() + 5 * HOUR))).toBe(1);
      expect(await notifyOverdueComplaints(new Date(Date.now() + 6 * HOUR))).toBe(0);
      expect(await prisma.notification.count({ where: { userId: owner.id, title: '⏰ Murojaat muddati o‘tdi' } })).toBe(1);
    });

    it('xodimning maxfiy murojaati (nizo): rahbar (Admin) ko‘rmaydi, CEO ko‘radi, kim haqida bo‘lsa — ko‘rmaydi', async () => {
      const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
      const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

      expect((await request(app).post('/api/org/complaints/appeal').set(bearer(sales)).send({ category: 'STAFF_CONFLICT', title: 'O‘zim haqimda', description: 'Sinov uchun matn', subjectUserId: salesUser.id })).status).toBe(422);
      const appeal = await request(app).post('/api/org/complaints/appeal').set(bearer(teacher)).send({ category: 'STAFF_CONFLICT', title: 'Hamkasb bilan nizo', description: 'Dars xonasi bo‘yicha kelishmovchilik', subjectUserId: salesUser.id, confidential: false });
      expect(appeal.status).toBe(201);
      expect(appeal.body.data).toMatchObject({ source: 'STAFF', confidential: true });
      const id = appeal.body.data.id as string;

      expect((await request(app).get(`/api/org/complaints/${id}`).set(bearer(admin))).status).toBe(404);
      expect((await request(app).get(`/api/org/complaints/${id}`).set(bearer(sales))).status).toBe(404);
      expect((await request(app).get(`/api/org/complaints/${id}`).set(bearer(owner))).status).toBe(200);
      expect((await request(app).get(`/api/org/complaints/${id}`).set(bearer(teacher))).status).toBe(200);
      expect((await request(app).get('/api/org/complaints').set(bearer(admin))).body.data.items).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------ chegirma vakolati
  describe('Chegirma vakolati (0–5% mustaqil, yuqorisi — CEO)', () => {
    async function rule(key: string, value: number) {
      return prisma.discountRule.create({ data: { key, name: `Qoida ${value}%`, type: 'FAMILY', valueType: 'PERCENT', value } });
    }

    it('5% gacha — darhol; 10% — sababsiz rad, sabab bilan tasdiqqa; CEO tasdiqlaydi — chegirma kim so‘ragani va kim tasdiqlagani bilan', async () => {
      const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const first = await student();
      const second = await student();
      await rule('five', 5);
      await rule('ten', 10);

      const direct = await request(app).post(`/api/discounts/students/${first.id}`).set(bearer(sales)).send({ ruleKey: 'five' });
      expect(direct.status).toBe(200);
      expect(direct.body.data.contractPrice).toBe(950_000);

      expect((await request(app).post(`/api/discounts/students/${second.id}`).set(bearer(sales)).send({ ruleKey: 'ten' })).status).toBe(422);
      const pending = await request(app).post(`/api/discounts/students/${second.id}`).set(bearer(sales)).send({ ruleKey: 'ten', note: 'Ikkinchi farzand' });
      expect(pending.status).toBe(202);
      expect(pending.body.data).toMatchObject({ pending: true, request: { status: 'PENDING', amount: 100_000, percent: 10, reason: 'Ikkinchi farzand' } });
      const requestId = pending.body.data.request.id as string;
      // Shartnoma hali o'zgarmagan
      expect((await prisma.student.findUniqueOrThrow({ where: { id: second.id } })).contractPrice.toNumber()).toBe(1_000_000);
      expect(await prisma.notification.count({ where: { userId: ownerUser.id, type: 'APPROVAL_REQUEST' } })).toBe(1);
      // Takror so'rov — 409; sotuvchi tasdiqlay olmaydi
      expect((await request(app).post(`/api/discounts/students/${second.id}`).set(bearer(sales)).send({ ruleKey: 'ten', note: 'Takror' })).status).toBe(409);
      expect((await request(app).post(`/api/discounts/requests/${requestId}/approve`).set(bearer(sales)).send({})).status).toBe(403);

      const myWork = await request(app).get('/api/my-work').set(bearer(owner));
      const approvals = myWork.body.data.sections.find((section: { key: string }) => section.key === 'approvals');
      expect(approvals.count).toBe(1);

      const approved = await request(app).post(`/api/discounts/requests/${requestId}/approve`).set(bearer(owner)).send({ note: 'Roziman' });
      expect(approved.body.data).toMatchObject({ status: 'APPROVED', decidedBy: { id: ownerUser.id } });
      const discount = await prisma.studentDiscount.findFirstOrThrow({ where: { studentId: second.id } });
      expect(discount).toMatchObject({ grantedById: salesUser.id, approvedById: ownerUser.id });
      expect((await prisma.student.findUniqueOrThrow({ where: { id: second.id } })).contractPrice.toNumber()).toBe(900_000);
      expect(await prisma.approvalRequest.findFirstOrThrow({ where: { entityId: requestId } })).toMatchObject({ status: 'APPROVED', type: 'DISCOUNT' });
      expect(await prisma.notification.count({ where: { userId: salesUser.id, title: 'Chegirma tasdiqlandi' } })).toBe(1);
      // Ikkinchi marta tasdiqlab bo'lmaydi
      expect((await request(app).post(`/api/discounts/requests/${requestId}/approve`).set(bearer(owner)).send({})).status).toBe(409);
    });

    it('rad etish sababi bilan; so‘ragan bekor qiladi; chegarani faqat tasdiqlovchi o‘zgartiradi; "qoidalar oldindan tasdiqlangan"', async () => {
      const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const pupil = await student();
      await rule('ten', 10);

      const pending = await request(app).post(`/api/discounts/students/${pupil.id}`).set(bearer(sales)).send({ ruleKey: 'ten', note: 'Do‘sti orqali' });
      const id = pending.body.data.request.id as string;
      expect((await request(app).post(`/api/discounts/requests/${id}/reject`).set(bearer(owner)).send({})).status).toBe(422);
      const rejected = await request(app).post(`/api/discounts/requests/${id}/reject`).set(bearer(owner)).send({ note: 'Aksiya tugagan' });
      expect(rejected.body.data).toMatchObject({ status: 'REJECTED', decisionNote: 'Aksiya tugagan' });
      expect(await prisma.notification.count({ where: { userId: salesUser.id, title: 'Chegirma rad etildi' } })).toBe(1);

      const again = await request(app).post(`/api/discounts/students/${pupil.id}`).set(bearer(sales)).send({ ruleKey: 'ten', note: 'Qayta' });
      expect((await request(app).post(`/api/discounts/requests/${again.body.data.request.id}/cancel`).set(bearer(sales)).send({})).body.data.status).toBe('CANCELLED');

      // Admin ham 5% dan yuqori chegirma uchun tasdiq kutadi va chegarani o'zgartira olmaydi
      expect((await request(app).put('/api/discounts/settings').set(bearer(admin)).send({ maxPercent: 30, allowStacking: true, approvalThresholdPercent: 50 })).status).toBe(403);
      // Foiz chegarasini (eski maydonlar) Admin o'zgartira oladi — tasdiq chegarasi o'zgarmaydi
      const legacy = await request(app).put('/api/discounts/settings').set(bearer(admin)).send({ maxPercent: 40, allowStacking: true });
      expect(legacy.body.data).toMatchObject({ maxPercent: 40, approvalThresholdPercent: 5, rulesPreapproved: false });
      await request(app).put('/api/discounts/settings').set(bearer(owner)).send({ maxPercent: 40, allowStacking: true, rulesPreapproved: true }).expect(200);
      const direct = await request(app).post(`/api/discounts/students/${pupil.id}`).set(bearer(sales)).send({ ruleKey: 'ten' });
      expect(direct.status).toBe(200);
      // Qo'lda (individual) chegirma baribir tasdiqqa ketadi
      const other = await student();
      expect((await request(app).post(`/api/discounts/students/${other.id}`).set(bearer(sales)).send({ valueType: 'PERCENT', value: 8, note: 'Individual narx' })).status).toBe(202);
    });
  });

  // ------------------------------------------------------------------ katalog va ish tarixi
  describe('Tuzilma katalogi va ish tarixi', () => {
    it('standart lavozimlar hujjatdagi mas’uliyatlar bilan; karyera yo‘li; bo‘lim matni katalogga bog‘lanadi; tarix sababi bilan', async () => {
      const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

      const positions = (await request(app).get('/api/org/positions').set(bearer(admin))).body.data as Array<{ key: string; responsibilities: unknown[]; department: { name: string } | null; probationMonths: number }>;
      const sales = positions.find((position) => position.key === 'SALES_MANAGER')!;
      expect(sales).toMatchObject({ department: { name: 'Sotuv va qabulxona' }, probationMonths: 1 });
      expect(sales.responsibilities).toHaveLength(8);
      expect(positions.find((position) => position.key === 'MARKETING_MANAGER')!.probationMonths).toBe(3);
      expect(positions.find((position) => position.key === 'TEACHER')!.responsibilities).toHaveLength(7);

      // Tuzilmani faqat CEO o'zgartiradi
      expect((await request(app).patch('/api/org/positions/SALES_MANAGER').set(bearer(admin)).send({ minimumKpiScore: 80 })).status).toBe(403);
      const career = await request(app).patch('/api/org/positions/SALES_MANAGER').set(bearer(owner)).send({ nextPositionKey: 'STUDENT_SUCCESS_MANAGER', minimumKpiScore: 80, minimumMonths: 12, careerRequirements: 'Konversiya 30%+' });
      expect(career.body.data).toMatchObject({ nextPosition: { key: 'STUDENT_SUCCESS_MANAGER' }, minimumKpiScore: 80, minimumMonths: 12 });
      await request(app).post('/api/org/positions/SALES_MANAGER/responsibilities').set(bearer(owner)).send({ title: 'Haftalik sotuv hisoboti', priority: 'HIGH' }).expect(201);

      const created = await request(app).post('/api/employees').set(bearer(owner)).send({ firstName: 'Shodiya', lastName: 'Sotuvchi', position: 'SALES_MANAGER', baseSalary: 4_000_000, hireDate: '2026-10-01', department: 'Sotuv va qabulxona' });
      expect(created.status).toBe(201);
      const departments = (await request(app).get('/api/org/departments').set(bearer(owner))).body.data as Array<{ id: string; name: string; employees: number }>;
      const salesDepartment = departments.find((department) => department.name === 'Sotuv va qabulxona')!;
      expect(created.body.data).toMatchObject({ departmentId: salesDepartment.id, department: 'Sotuv va qabulxona' });
      expect(salesDepartment.employees).toBe(1);

      const promoted = await request(app).put(`/api/employees/${created.body.data.id}`).set(bearer(owner)).send({ position: 'STUDENT_SUCCESS_MANAGER', changeReason: 'KPI 3 oy ketma-ket 90%+' });
      expect(promoted.status).toBe(200);
      const history = (await request(app).get(`/api/org/employees/${created.body.data.id}/history`).set(bearer(owner))).body.data;
      expect(history.map((row: { type: string }) => row.type)).toEqual(['POSITION_CHANGED', 'HIRED']);
      expect(history[0]).toMatchObject({ positionKey: 'STUDENT_SUCCESS_MANAGER', changeReason: 'KPI 3 oy ketma-ket 90%+' });

      const dept = await request(app).post('/api/org/departments').set(bearer(owner)).send({ name: 'Metodika', monthlyExpenseLimit: 2_000_000 });
      expect(dept.status).toBe(201);
      expect((await request(app).post('/api/org/departments').set(bearer(owner)).send({ name: 'Metodika' })).status).toBe(409);
    });
  });

  // ------------------------------------------------------------------ HR jarayonlari
  describe('Ishga qabul qilish, onboarding va offboarding', () => {
    it('nomzod: suhbat → demo → CEO ishga oladi; Admin qaror qila olmaydi; xodim kartasi lavozim sinov muddati bilan; onboarding', async () => {
      const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

      const created = await request(app).post('/api/org/candidates').set(bearer(admin)).send({ firstName: 'Nodira', lastName: 'Marketing', position: 'MARKETING_MANAGER', source: 'Telegram', score: 8 });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      await request(app).post(`/api/org/candidates/${id}/stage`).set(bearer(admin)).send({ stage: 'INTERVIEW' }).expect(200);
      await request(app).post(`/api/org/candidates/${id}/stage`).set(bearer(admin)).send({ stage: 'DEMO' }).expect(200);
      expect((await request(app).post(`/api/org/candidates/${id}/stage`).set(bearer(admin)).send({ stage: 'REJECTED', note: 'x' })).status).toBe(403);
      expect((await request(app).post(`/api/org/candidates/${id}/hire`).set(bearer(admin)).send({ hireDate: '2026-11-10' })).status).toBe(403);

      const hired = await request(app).post(`/api/org/candidates/${id}/hire`).set(bearer(owner)).send({ hireDate: '2026-11-10', baseSalary: 5_000_000 });
      expect(hired.status).toBe(200);
      expect(hired.body.data).toMatchObject({ stage: 'HIRED', decidedBy: { id: ownerUser.id } });
      const employee = await prisma.employee.findUniqueOrThrow({ where: { id: hired.body.data.employeeId } });
      // Marketing menejeri — rahbarlik lavozimi: sinov 3 oy
      expect(employee.probationEndDate?.toISOString().slice(0, 10)).toBe('2027-02-10');
      const checklist = (await request(app).get(`/api/org/checklists/${hired.body.data.checklistId}`).set(bearer(owner))).body.data;
      expect(checklist).toMatchObject({ kind: 'ONBOARDING', status: 'OPEN', subjectName: 'Nodira Marketing' });
      expect(checklist.items).toHaveLength(7);
      expect(checklist.items[0].responsible.id).toBe(ownerUser.id);
      // Hal qilingan nomzod qayta o'zgartirilmaydi
      expect((await request(app).post(`/api/org/candidates/${id}/stage`).set(bearer(admin)).send({ stage: 'OFFER' })).status).toBe(422);
    });

    it('offboarding: tizim bandlari CRMdan tekshiriladi — vazifalar topshiriladi, jihoz qaytariladi, kirish bloklanadi; yopilganda xodim "ishdan ketgan"', async () => {
      const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: leaverToken, user: leaver } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Ketuvchi' });
      const { user: colleague } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Hamkasb' });
      const employee = await prisma.employee.create({ data: { firstName: 'Ketuvchi', lastName: 'X', position: 'SALES_MANAGER', hireDate: new Date('2025-01-01'), userId: leaver.id } });
      await prisma.task.createMany({ data: [{ title: 'Qo‘ng‘iroqlar', assigneeId: leaver.id, createdById: ownerUser.id }, { title: 'Hisobot', assigneeId: leaver.id, status: 'IN_PROGRESS' }] });
      const laptop = await request(app).post('/api/org/assets').set(bearer(owner)).send({ inventoryNumber: 'INV-1', name: 'Noutbuk', category: 'Kompyuter', purchaseCost: 7_000_000, responsibleId: leaver.id });

      const opened = await request(app).post('/api/org/checklists').set(bearer(owner)).send({ kind: 'OFFBOARDING', employeeId: employee.id, reason: 'O‘z xohishi', lastWorkingDay: '2026-11-15' });
      expect(opened.status).toBe(201);
      const id = opened.body.data.id as string;
      const byKey = (data: { items: Array<{ key: string | null; done: boolean; id: string }> }, key: string) => data.items.find((item) => item.key === key)!;
      expect(byKey(opened.body.data, 'reason').done).toBe(true);
      expect(byKey(opened.body.data, 'tasks').done).toBe(false);
      expect(opened.body.data.facts).toMatchObject({ openWork: { tasks: 2 }, assets: [{ inventoryNumber: 'INV-1' }], account: { active: true } });
      // Tizim bandini qo'lda belgilab bo'lmaydi
      expect((await request(app).post(`/api/org/checklists/${id}/items/${byKey(opened.body.data, 'tasks').id}`).set(bearer(owner)).send({ done: true })).status).toBe(422);
      expect((await request(app).post(`/api/org/checklists/${id}/complete`).set(bearer(owner))).status).toBe(422);

      const handed = await request(app).post(`/api/org/checklists/${id}/handover`).set(bearer(owner)).send({ assigneeId: colleague.id });
      expect(byKey(handed.body.data, 'tasks').done).toBe(true);
      expect(await prisma.task.count({ where: { assigneeId: colleague.id } })).toBe(2);
      expect(await prisma.taskAssignment.count({ where: { fromUserId: leaver.id, toUserId: colleague.id } })).toBe(2);

      await request(app).post(`/api/org/assets/${laptop.body.data.id}/events`).set(bearer(owner)).send({ type: 'ASSIGNED', note: 'Qaytarildi, holati yaxshi' }).expect(200);
      const revoked = await request(app).post(`/api/org/checklists/${id}/revoke-access`).set(bearer(owner));
      expect(byKey(revoked.body.data, 'access').done).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: leaver.id } })).status).toBe('BLOCKED');
      expect((await request(app).get('/api/tasks').set(bearer(leaverToken))).status).toBe(401);

      let detail = revoked.body.data;
      for (const item of detail.items.filter((entry: { done: boolean; system: boolean }) => !entry.done && !entry.system)) {
        detail = (await request(app).post(`/api/org/checklists/${id}/items/${item.id}`).set(bearer(owner)).send({ done: true })).body.data;
      }
      expect(byKey(detail, 'assets').done).toBe(true);
      const completed = await request(app).post(`/api/org/checklists/${id}/complete`).set(bearer(owner));
      expect(completed.body.data.status).toBe('COMPLETED');
      const after = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
      expect(after.status).toBe('RESIGNED');
      expect(after.terminationDate?.toISOString().slice(0, 10)).toBe('2026-11-15');
      expect(await prisma.employmentHistory.count({ where: { employeeId: employee.id, type: 'TERMINATED', changeReason: 'O‘z xohishi' } })).toBe(1);
    });
  });

  // ------------------------------------------------------------------ aktivlar
  describe('Aktivlar', () => {
    it('inventar raqami takrorlanmaydi; biriktirish, ko‘chirish, ta’mir (xarajat bilan), hisobdan chiqarish — tarix; ruxsatsiz 403', async () => {
      const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
      const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Firdavs' });
      const created = await request(app).post('/api/org/assets').set(bearer(accountant)).send({ inventoryNumber: 'PR-01', name: 'Proyektor', category: 'Proyektor', purchaseDate: '2026-01-15', purchaseCost: 3_000_000 });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await request(app).post('/api/org/assets').set(bearer(accountant)).send({ inventoryNumber: 'PR-01', name: 'Boshqa', category: 'Proyektor' })).status).toBe(409);

      await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'ASSIGNED', responsibleId: teacherUser.id }).expect(200);
      await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'MOVED', location: '3-xona' }).expect(200);
      await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'REPAIR', cost: 250_000, note: 'Lampa almashtirildi' }).expect(200);
      expect((await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'REPAIR' })).status).toBe(422);
      const writtenOff = await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'STATUS_CHANGED', status: 'WRITTEN_OFF', note: 'Yaroqsiz' });
      expect(writtenOff.body.data).toMatchObject({ status: 'WRITTEN_OFF', repairCost: 250_000, repairCount: 1, responsible: { id: teacherUser.id } });
      expect(writtenOff.body.data.events.map((event: { type: string }) => event.type)).toEqual(['STATUS_CHANGED', 'REPAIR', 'MOVED', 'ASSIGNED', 'CREATED']);
      expect((await request(app).post(`/api/org/assets/${id}/events`).set(bearer(accountant)).send({ type: 'MOVED', location: '1-xona' })).status).toBe(422);

      const list = (await request(app).get('/api/org/assets').set(bearer(accountant))).body.data;
      expect(list.summary).toMatchObject({ count: 0, value: 0, byStatus: { WRITTEN_OFF: 1 } });
      expect((await request(app).get('/api/org/assets').set(bearer(teacher))).status).toBe(403);
    });
  });

  // ------------------------------------------------------------------ bilimlar bazasi
  describe('Bilimlar bazasi', () => {
    it('qoralama yashirin; auditoriya bo‘yicha ko‘rinadi; tanishish majburiy — xabar va tasdiq; yangi versiya qayta tanishishni so‘raydi', async () => {
      const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });
      const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const teacherRole = await prisma.role.findUniqueOrThrow({ where: { key: 'TEACHER' } });

      const created = await request(app).post('/api/org/knowledge').set(bearer(admin)).send({ title: 'Dars standarti', category: 'LESSON_STANDARD', body: 'Dars 5 daqiqa oldin boshlanadi va reja bilan o‘tadi.', audienceRoleIds: [teacherRole.id], requiresAck: true });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await request(app).get(`/api/org/knowledge/${id}`).set(bearer(teacher))).status).toBe(404);
      expect((await request(app).post('/api/org/knowledge').set(bearer(teacher)).send({ title: 'X', category: 'OTHER', body: 'xxxxxxxxxxxx' })).status).toBe(403);

      await request(app).post(`/api/org/knowledge/${id}/status`).set(bearer(admin)).send({ status: 'PUBLISHED' }).expect(200);
      expect(await prisma.notification.count({ where: { userId: teacherUser.id, type: 'HR_UPDATE', entityId: id } })).toBe(1);
      expect((await request(app).get(`/api/org/knowledge/${id}`).set(bearer(sales))).status).toBe(404);
      expect((await request(app).get('/api/org/knowledge').set(bearer(teacher))).body.data.pendingAck).toBe(1);

      const ack = await request(app).post(`/api/org/knowledge/${id}/acknowledge`).set(bearer(teacher));
      expect(ack.body.data.acknowledged).toBe(true);
      await request(app).post(`/api/org/knowledge/${id}/acknowledge`).set(bearer(teacher)).expect(200);
      expect((await request(app).get('/api/org/knowledge').set(bearer(teacher))).body.data.pendingAck).toBe(0);

      const v2 = await request(app).put(`/api/org/knowledge/${id}`).set(bearer(admin)).send({ title: 'Dars standarti', category: 'LESSON_STANDARD', body: 'Dars 10 daqiqa oldin tayyorlanadi, reja va uy vazifasi bilan.', audienceRoleIds: [teacherRole.id], requiresAck: true, changeNote: 'Tayyorgarlik vaqti' });
      expect(v2.body.data).toMatchObject({ version: 2 });
      expect(v2.body.data.versions.map((version: { version: number }) => version.version)).toEqual([2, 1]);
      expect((await request(app).get('/api/org/knowledge').set(bearer(teacher))).body.data.pendingAck).toBe(1);
      const old = await request(app).get(`/api/org/knowledge/${id}/versions/1`).set(bearer(teacher));
      expect(old.body.data.body).toContain('5 daqiqa');
    });
  });

  // ------------------------------------------------------------------ eslatmalar
  it('vazifa muddati yaqinlashdi: 24 soat ichida, bir marta; yaqin muddat bilan berilganiga — yo‘q', async () => {
    const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const now = new Date();
    await prisma.task.create({ data: { title: 'Uzoq vazifa', assigneeId: user.id, dueAt: new Date(now.getTime() + 10 * HOUR), createdAt: new Date(now.getTime() - 72 * HOUR) } });
    await prisma.task.create({ data: { title: 'Yaqin berilgan', assigneeId: user.id, dueAt: new Date(now.getTime() + 5 * HOUR) } });
    await prisma.task.create({ data: { title: 'Tekshiruvda', assigneeId: user.id, status: 'REVIEW', dueAt: new Date(now.getTime() + 5 * HOUR), createdAt: new Date(now.getTime() - 72 * HOUR) } });
    expect(await notifyTasksDueSoon(now)).toBe(1);
    await notifyTasksDueSoon(new Date(now.getTime() + HOUR));
    expect(await prisma.notification.findMany({ where: { userId: user.id, title: 'Vazifa muddati yaqinlashdi' }, select: { message: true } })).toEqual([{ message: expect.stringContaining('Uzoq vazifa') }]);
  });
});
