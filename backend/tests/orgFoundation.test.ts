import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notifyProbationEnds } from '../src/jobs/org.job.js';
import { evaluateEmployeeKpi } from '../src/services/kpi.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * ORG tizimi · 1-bosqich (Foundation): vazifa holatlari (New → In Progress → Review → Done, Overdue, kutilgan natija),
 * lavozimlar, "kimga hisobot beradi", sinov muddati va tashkiliy tuzilma.
 */
const app = createApp();
const HOUR = 3_600_000;

async function delegated() {
  const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER', firstName: 'Doniyorbek', lastName: 'CEO' });
  const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Shodiya', lastName: 'Sotuv' });
  const created = await request(app)
    .post('/api/tasks')
    .set(bearer(owner))
    .send({ title: 'Sinov darsiga 5 kishi yozish', assigneeId: salesUser.id, expectedResult: 'CRMda 5 ta sinov darsi yozuvi', dueAt: new Date(Date.now() + 24 * HOUR).toISOString() });
  expect(created.status).toBe(201);
  return { owner, ownerUser, sales, salesUser, id: created.body.data.id as string };
}

describe.skipIf(!hasTestDatabase)('ORG · 1-bosqich', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Vazifa holatlari', () => {
    it('to‘liq yo‘l: Yangi → Jarayonda → Tekshiruvda → qaytarildi (izoh bilan) → qayta topshirildi → qabul qilindi', async () => {
      const { owner, sales, salesUser, ownerUser, id } = await delegated();
      const task = await prisma.task.findUniqueOrThrow({ where: { id } });
      expect(task).toMatchObject({ status: 'OPEN', expectedResult: 'CRMda 5 ta sinov darsi yozuvi' });

      const started = await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'IN_PROGRESS' });
      expect(started.body.data).toMatchObject({ status: 'IN_PROGRESS', needsReview: true });

      const submitted = await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'REVIEW', note: '5 ta yozildi' });
      expect(submitted.body.data.status).toBe('REVIEW');
      // Ijrochi o'z ishini o'zi qabul qila olmaydi
      const selfAccept = await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'DONE' });
      expect(selfAccept.status).toBe(422);

      // Tekshiruvchi ro'yxatida — "qabul qilishim kerak"
      const queue = await request(app).get('/api/tasks').query({ scope: 'created', review: 'true' }).set(bearer(owner));
      expect(queue.body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);
      const detail = await request(app).get(`/api/tasks/${id}`).set(bearer(owner));
      expect(detail.body.data.can).toMatchObject({ review: true });
      expect((await request(app).get(`/api/tasks/${id}`).set(bearer(sales))).body.data.can.review).toBe(false);

      const returned = await request(app).patch(`/api/tasks/${id}`).set(bearer(owner)).send({ status: 'IN_PROGRESS', note: '2 tasi hali tasdiqlanmagan' });
      expect(returned.body.data).toMatchObject({ status: 'IN_PROGRESS', submittedAt: null });
      // Izoh vazifa izohlariga yoziladi, ijrochi xabar oladi
      expect(await prisma.taskComment.findMany({ where: { taskId: id }, select: { content: true }, orderBy: { createdAt: 'asc' } })).toEqual([
        { content: '5 ta yozildi' },
        { content: '2 tasi hali tasdiqlanmagan' },
      ]);
      expect(await prisma.notification.count({ where: { userId: salesUser.id, title: 'Vazifa qaytarildi' } })).toBe(1);

      await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'DONE' }).expect(200);
      const accepted = await request(app).patch(`/api/tasks/${id}`).set(bearer(owner)).send({ status: 'DONE' });
      expect(accepted.body.data.status).toBe('DONE');
      expect(await prisma.notification.count({ where: { userId: ownerUser.id, title: 'Vazifa tekshiruvga topshirildi' } })).toBe(2);
      expect(await prisma.notification.count({ where: { userId: salesUser.id, title: 'Vazifa qabul qilindi' } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'task.status_changed', entityId: id } })).toBe(5);
    });

    it('ijrochi boshqa xodim bergan vazifani bekor qila olmaydi, yopilganini qayta ocholmaydi; o‘z vazifasini o‘zi yopadi', async () => {
      const { owner, sales, id } = await delegated();
      expect((await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'CANCELLED' })).status).toBe(403);
      await request(app).patch(`/api/tasks/${id}`).set(bearer(owner)).send({ status: 'CANCELLED', note: 'Kerak emas' }).expect(200);
      expect((await request(app).patch(`/api/tasks/${id}`).set(bearer(sales)).send({ status: 'OPEN' })).status).toBe(403);
      // Rahbar qayta ocha oladi
      expect((await request(app).patch(`/api/tasks/${id}`).set(bearer(owner)).send({ status: 'OPEN' })).body.data.status).toBe('OPEN');

      const own = await request(app).post('/api/tasks').set(bearer(sales)).send({ title: 'O‘zim uchun' });
      expect(own.body.data.needsReview).toBe(false);
      // Tekshiruvchisi yo'q vazifani tekshiruvga topshirib bo'lmaydi — to'g'ridan yopiladi
      expect((await request(app).patch(`/api/tasks/${own.body.data.id}`).set(bearer(sales)).send({ status: 'REVIEW' })).status).toBe(422);
      expect((await request(app).patch(`/api/tasks/${own.body.data.id}`).set(bearer(sales)).send({ status: 'DONE' })).body.data.status).toBe('DONE');
    });

    it('muddati o‘tgan: faqat ishlanayotganlar; tekshiruvdagisi va yopilgani overdue emas; "Ishlarim"da tekshiruvdagisi yo‘q', async () => {
      const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { token: sales, user: salesUser } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const past = new Date(Date.now() - 2 * HOUR);
      await prisma.task.createMany({
        data: [
          { title: 'Yangi', assigneeId: salesUser.id, createdById: owner.id, dueAt: past, status: 'OPEN' },
          { title: 'Jarayonda', assigneeId: salesUser.id, createdById: owner.id, dueAt: past, status: 'IN_PROGRESS' },
          { title: 'Tekshiruvda', assigneeId: salesUser.id, createdById: owner.id, dueAt: past, status: 'REVIEW', submittedAt: new Date(past.getTime() - HOUR) },
          { title: 'Bajarilgan', assigneeId: salesUser.id, createdById: owner.id, dueAt: past, status: 'DONE' },
        ],
      });
      const overdue = await request(app).get('/api/tasks').query({ overdue: 'true' }).set(bearer(sales));
      expect(overdue.body.data.items.map((item: { title: string }) => item.title).sort()).toEqual(['Jarayonda', 'Yangi']);
      const all = await request(app).get('/api/tasks').query({ limit: 10 }).set(bearer(sales));
      expect(all.body.data.openCount).toBe(3);
      expect(all.body.data.items.find((item: { title: string }) => item.title === 'Tekshiruvda').overdue).toBe(false);
      const active = await request(app).get('/api/tasks').query({ active: 'true' }).set(bearer(sales));
      expect(active.body.data.total).toBe(3);

      const myWork = await request(app).get('/api/my-work').set(bearer(sales));
      const section = myWork.body.data.sections.find((item: { key: string }) => item.key === 'tasks');
      expect(section).toMatchObject({ count: 2, overdue: 2 });
    });

    it('KPI "o‘z vaqtida": tekshiruvli vazifada ijrochi topshirgan vaqt hisobga olinadi', async () => {
      const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const due = new Date('2026-03-10T10:00:00Z');
      await prisma.task.createMany({
        data: [
          // Muddatida topshirilgan, rahbar kech qabul qilgan — o'z vaqtida
          { title: 'A', assigneeId: user.id, createdById: owner.id, dueAt: due, status: 'DONE', submittedAt: new Date('2026-03-09T10:00:00Z'), completedAt: new Date('2026-03-12T10:00:00Z') },
          // Kech topshirilgan — kechikkan
          { title: 'B', assigneeId: user.id, createdById: owner.id, dueAt: due, status: 'DONE', submittedAt: new Date('2026-03-11T10:00:00Z'), completedAt: new Date('2026-03-11T12:00:00Z') },
        ],
      });
      const employee = await prisma.employee.create({
        data: { firstName: 'Shodiya', lastName: 'Sotuv', position: 'SALES_MANAGER', hireDate: new Date('2025-01-01'), userId: user.id },
      });
      await prisma.kpiDefinition.create({
        data: { name: 'Vazifalar', position: 'SALES_MANAGER', metric: 'TASK_COMPLETION', target: 100, weight: 100, effectiveFrom: new Date('2026-01-01') },
      });
      const evaluation = await evaluateEmployeeKpi(prisma, { id: employee.id, userId: user.id, position: 'SALES_MANAGER', branchId: employee.branchId, kpiBonusPool: 0 }, 2026, 3);
      expect(evaluation.results[0]).toMatchObject({ actual: 50 });
    });
  });

  describe('Lavozimlar, rahbar va sinov muddati', () => {
    it('yangi lavozim, rahbar va sinov muddati saqlanadi; noto‘g‘ri rahbar va sana rad etiladi', async () => {
      const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
      const { user: student } = await createUserWithToken(app, { role: 'STUDENT' });
      const base = { firstName: 'Elmurodjon', lastName: 'Video', position: 'CONTENT_CREATOR', baseSalary: 3_000_000, hireDate: '2026-10-01' };

      expect((await request(app).post('/api/employees').set(bearer(owner)).send({ ...base, managerId: student.id })).status).toBe(422);
      expect((await request(app).post('/api/employees').set(bearer(owner)).send({ ...base, probationEndDate: '2026-09-01' })).status).toBe(422);

      const created = await request(app).post('/api/employees').set(bearer(owner)).send({ ...base, managerId: ownerUser.id, probationEndDate: '2026-11-01' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ position: 'CONTENT_CREATOR', probationEndDate: '2026-11-01', manager: { id: ownerUser.id } });

      const cleared = await request(app).put(`/api/employees/${created.body.data.id}`).set(bearer(owner)).send({ managerId: null, probationEndDate: null });
      expect(cleared.body.data).toMatchObject({ manager: null, probationEndDate: null, probationDaysLeft: null });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'employee.updated', entityId: created.body.data.id } });
      expect(audit.before).toMatchObject({ managerId: ownerUser.id, probationEndDate: '2026-11-01' });
      expect(audit.after).toMatchObject({ managerId: null, probationEndDate: null });
    });

    it('sinov muddati eslatmasi: 7 kun qolganda va tugagan kuni bir martadan, faqat faol xodimlar uchun', async () => {
      const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
      const { user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Umidjon', lastName: 'Frontend' });
      const now = new Date('2026-11-03T06:00:00Z');
      await prisma.employee.createMany({
        data: [
          { firstName: 'Guli', lastName: 'Kassa', position: 'RECEPTIONIST', hireDate: new Date('2026-10-10'), probationEndDate: new Date('2026-11-10') },
          { firstName: 'Ketgan', lastName: 'Xodim', position: 'CLEANER', hireDate: new Date('2026-10-01'), probationEndDate: new Date('2026-11-05'), status: 'RESIGNED', terminationDate: new Date('2026-10-20') },
          { firstName: 'Uzoq', lastName: 'Muddat', position: 'CLEANER', hireDate: new Date('2026-10-01'), probationEndDate: new Date('2026-12-30') },
        ],
      });
      await prisma.teacherProfile.create({ data: { userId: teacherUser.id, hireDate: new Date('2026-10-03'), probationEndDate: new Date('2026-11-03') } });

      expect(await notifyProbationEnds(now)).toBe(2);
      const sent = await prisma.notification.findMany({ where: { userId: owner.id, type: 'HR_UPDATE' }, select: { title: true, message: true }, orderBy: { title: 'asc' } });
      expect(sent).toEqual([
        { title: 'Sinov muddati bugun tugaydi', message: expect.stringContaining('Umidjon Frontend') },
        { title: 'Sinov muddati tugashiga oz qoldi', message: expect.stringContaining('Guli Kassa') },
      ]);
      // Qayta yurganda takrorlanmaydi
      await notifyProbationEnds(new Date(now.getTime() + HOUR));
      expect(await prisma.notification.count({ where: { type: 'HR_UPDATE' } })).toBe(2);
    });
  });

  describe('Tashkiliy tuzilma', () => {
    it('rahbar → bo‘limlar → xodimlar va o‘qituvchilar; vakant lavozimlar; ruxsatsiz — 403', async () => {
      const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER', firstName: 'Doniyorbek', lastName: 'CEO' });
      const { token: teacherToken, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER', firstName: 'Akmal', lastName: 'English' });
      await prisma.teacherProfile.create({ data: { userId: teacherUser.id, specialization: 'English' } });
      await prisma.employee.createMany({
        data: [
          { firstName: 'Shodiya', lastName: 'S', position: 'SALES_MANAGER', hireDate: new Date('2025-01-01'), managerId: ownerUser.id },
          { firstName: 'Guli', lastName: 'G', position: 'RECEPTIONIST', hireDate: new Date('2025-01-01') },
          { firstName: 'Elmurodjon', lastName: 'E', position: 'CONTENT_CREATOR', hireDate: new Date('2025-01-01') },
          { firstName: 'Metodist', lastName: 'M', position: 'OTHER', positionTitle: 'Metodist', department: 'Metodika', hireDate: new Date('2025-01-01') },
          { firstName: 'Akademik', lastName: 'K', position: 'ACADEMIC_COORDINATOR', hireDate: new Date('2025-01-01') },
          { firstName: 'Eski', lastName: 'X', position: 'OPERATIONS_MANAGER', hireDate: new Date('2024-01-01'), status: 'RESIGNED', terminationDate: new Date('2025-01-01') },
        ],
      });

      const response = await request(app).get('/api/org/structure').set(bearer(owner));
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data.leaders).toEqual([expect.objectContaining({ id: ownerUser.id, firstName: 'Doniyorbek' })]);
      const byName = Object.fromEntries(data.departments.map((department: { name: string; members: Array<{ name: string }> }) => [department.name, department.members.map((member) => member.name)]));
      expect(byName).toEqual({
        'Sotuv va qabulxona': ['Guli G', 'Shodiya S'],
        'Marketing va kontent': ['Elmurodjon E'],
        'O‘quv bo‘limi': ['Akademik K', 'Akmal English'],
        Metodika: ['Metodist M'],
      });
      expect(data.departments[0].members[1]).toMatchObject({ manager: { id: ownerUser.id }, position: 'Sotuv menejeri' });
      // Ishdan ketgan xodim lavozimni band qilmaydi — vakant
      expect(data.vacancies.map((vacancy: { position: string }) => vacancy.position)).toEqual(['OPERATIONS_MANAGER', 'STUDENT_SUCCESS_MANAGER']);
      expect(data.summary).toMatchObject({ members: 6, employees: 5, teachers: 1 });

      expect((await request(app).get('/api/org/structure').set(bearer(teacherToken))).status).toBe(403);
    });
  });
});
