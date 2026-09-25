import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { runHomeworkReminders } from '../src/jobs/homeworkReminder.job.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 5 — kundalik uy vazifasi (TZ 3.0 §15–20): kimga (guruh/tanlangan/bitta), keyin
 * qo'shilganlar, qoralama va ko'p fayl, havola/kod, o'qituvchi javobni ko'radi, qaytarish,
 * rubrika, eslatma va "topshirmadi".
 */
const app = createApp();
const DAY = 86_400_000;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 3)]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');
let phone = 0;

async function createStudent(courseId: string, groupId: string | null, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99894${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function setup() {
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
  const [anvar, barno, sardor] = [await createStudent(course.id, group.id, 'Anvar'), await createStudent(course.id, group.id, 'Barno'), await createStudent(course.id, group.id, 'Sardor')];
  return { teacher, token, course, group, anvar, barno, sardor };
}

async function portalToken(adminToken: string, studentId: string) {
  const created = await request(app).post(`/api/students/${studentId}/portal-account`).set(bearer(adminToken)).send({});
  return loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
}

function future(days = 2) {
  return new Date(Date.now() + days * DAY).toISOString();
}

describe.skipIf(!hasTestDatabase)('Uy vazifasi 2.0 (PHASE 5)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('kimga: tanlanganlar va bitta o‘quvchi; begona/noto‘g‘ri nishon rad etiladi; xabar faqat nishonga', async () => {
    const { token, group, anvar, barno, sardor, course } = await setup();
    const outsider = await createStudent(course.id, null, 'Tashqi');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    // Xabar tekshiruvi uchun ikkala tomonda kabinet hisobi
    await request(app).post(`/api/students/${anvar.id}/portal-account`).set(bearer(admin)).send({});
    await request(app).post(`/api/students/${sardor.id}/portal-account`).set(bearer(admin)).send({});

    const selected = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Tanlanganlarga', groupId: group.id, deadline: future(), targetType: 'SELECTED', studentIds: [anvar.id, barno.id] });
    expect(selected.status).toBe(201);
    expect(selected.body.data).toMatchObject({ targetType: 'SELECTED', stats: { students: 2 } });
    expect(selected.body.data.submissions.map((row: { firstName: string }) => row.firstName)).toEqual(['Anvar', 'Barno']);

    const individual = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Faqat Sardorga', groupId: group.id, deadline: future(), targetType: 'INDIVIDUAL', studentIds: [sardor.id] });
    expect(individual.body.data.stats.students).toBe(1);

    const bad = await Promise.all([
      request(app).post('/api/homework').set(bearer(token)).send({ title: 'Ikki kishi', groupId: group.id, deadline: future(), targetType: 'INDIVIDUAL', studentIds: [anvar.id, barno.id] }),
      request(app).post('/api/homework').set(bearer(token)).send({ title: 'Begona', groupId: group.id, deadline: future(), targetType: 'SELECTED', studentIds: [outsider.id] }),
      request(app).post('/api/homework').set(bearer(token)).send({ title: 'Guruh+tanlov', groupId: group.id, deadline: future(), targetType: 'GROUP', studentIds: [anvar.id] }),
      request(app).post('/api/homework').set(bearer(token)).send({ title: 'Bo‘sh tanlov', groupId: group.id, deadline: future(), targetType: 'SELECTED', studentIds: [] }),
    ]);
    expect(bad.map((response) => response.status)).toEqual([422, 422, 422, 422]);

    // "Yangi vazifa" xabari faqat nishondagilarga: Anvar — tanlanganlar vazifasi, Sardor — o'zinikiga
    const notices = await prisma.notification.findMany({
      where: { type: 'HOMEWORK_CREATED' },
      select: { entityId: true, user: { select: { studentAccount: { select: { id: true } } } } },
    });
    const pairs = notices.map((notice) => `${notice.user.studentAccount?.id}:${notice.entityId}`).sort();
    expect(pairs).toEqual([`${anvar.id}:${selected.body.data.id}`, `${sardor.id}:${individual.body.data.id}`].sort());
    expect(await prisma.homeworkSubmission.count({ where: { studentId: sardor.id } })).toBe(1);
  });

  it('guruhga keyin qo‘shilgan o‘quvchi ochiq "butun guruh" vazifalarini oladi, boshqalarini emas', async () => {
    const { token, course, group, anvar } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const open = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Ochiq', groupId: group.id, deadline: future() });
    await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Tanlangan', groupId: group.id, deadline: future(), targetType: 'INDIVIDUAL', studentIds: [anvar.id] });
    const closed = await prisma.homework.create({ data: { title: 'O‘tgan', groupId: group.id, deadline: new Date(Date.now() - DAY), status: 'PUBLISHED' } });

    const newcomer = await createStudent(course.id, null, 'Yangi');
    const transfer = await request(app).post(`/api/students/${newcomer.id}/transfer`).set(bearer(admin)).send({ groupId: group.id, reason: 'Qo‘shildi' });
    expect(transfer.status).toBe(200);

    const rows = await prisma.homeworkSubmission.findMany({ where: { studentId: newcomer.id }, select: { homeworkId: true } });
    expect(rows.map((row) => row.homeworkId)).toEqual([open.body.data.id]);
    expect(rows.some((row) => row.homeworkId === closed.id)).toBe(false);
  });

  it('mavzu, dars, qiyinlik bog‘lanadi; begona kurs mavzusi — 422', async () => {
    const { token, course, group } = await setup();
    const other = await createCourse('Boshqa');
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'M1' } });
    const topic = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Tsikllar' } });
    const lesson = await prisma.lesson.create({ data: { topicId: topic.id, title: 'for va while', status: 'PUBLISHED' } });
    const foreignModule = await prisma.courseModule.create({ data: { courseId: other.id, title: 'X' } });
    const foreignTopic = await prisma.courseTopic.create({ data: { moduleId: foreignModule.id, title: 'Begona' } });

    const ok = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Tsikl mashqi', groupId: group.id, deadline: future(), topicId: topic.id, lessonId: lesson.id, difficulty: 'HARD' });
    const bad = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Begona mavzu', groupId: group.id, deadline: future(), topicId: foreignTopic.id });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ topic: { id: topic.id, title: 'Tsikllar' }, lesson: { id: lesson.id }, difficulty: 'HARD' });
    expect(bad.status).toBe(422);
  });

  it('o‘quvchi: qoralama → ko‘p fayl → havola va kod bilan topshirish; o‘qituvchi hammasini ko‘radi', async () => {
    const { token, group, anvar, teacher } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    const homework = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Landing sahifa', groupId: group.id, deadline: future() });
    const id = homework.body.data.id as string;
    const student = await portalToken(admin, anvar.id);

    const empty = await request(app).post(`/api/portal/homework/${id}/submit`).set(bearer(student)).send({});
    expect(empty.status).toBe(422);

    const draft = await request(app).put(`/api/portal/homework/${id}/draft`).set(bearer(student)).send({ answerText: 'Boshladim' });
    expect(draft.body.data.status).toBe('IN_PROGRESS');

    const upload = (buffer: Buffer, type: string, name: string) =>
      request(app).post(`/api/portal/homework/${id}/files`).set(bearer(student)).set('Content-Type', type).set('X-File-Name', name).send(buffer);
    expect((await upload(PNG, 'image/png', 'ekran.png')).status).toBe(201);
    expect((await upload(PDF, 'application/pdf', 'hisobot.pdf')).status).toBe(201);
    for (let index = 0; index < 3; index += 1) await upload(PNG, 'image/png', `r${index}.png`);
    expect((await upload(PNG, 'image/png', 'oltinchi.png')).status).toBe(422);
    expect((await upload(Buffer.from('console.log(1)'), 'text/plain', 'kod.js')).status).toBe(422);

    const evil = await request(app).post(`/api/portal/homework/${id}/submit`).set(bearer(student)).send({ linkUrl: 'javascript:alert(1)' });
    expect(evil.status).toBe(422);

    const submitted = await request(app)
      .post(`/api/portal/homework/${id}/submit`)
      .set(bearer(student))
      .send({ answerText: 'Tayyor', linkUrl: 'https://github.com/anvar/landing', codeText: 'const a = 1;', codeLanguage: 'javascript' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe('SUBMITTED');

    const detail = await request(app).get(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(token));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      status: 'SUBMITTED',
      answerText: 'Tayyor',
      linkUrl: 'https://github.com/anvar/landing',
      codeText: 'const a = 1;',
      codeLanguage: 'javascript',
      late: false,
    });
    expect(detail.body.data.files).toHaveLength(5);
    const file = await request(app).get(`/api/homework/${id}/submissions/${anvar.id}/files/${detail.body.data.files[1].id}`).set(bearer(token)).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');

    const list = await request(app).get(`/api/homework/${id}`).set(bearer(token));
    expect(list.body.data.submissions.find((row: { studentId: string }) => row.studentId === anvar.id)).toMatchObject({ hasText: true, hasLink: true, hasCode: true, fileCount: 5 });

    expect((await request(app).get(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(stranger))).status).toBe(404);
    expect(teacher.id).toBeTruthy();

    // Kabinet ko'rinishi: o'z fayllari, havola va kod
    const portal = await request(app).get(`/api/portal/homework/${id}`).set(bearer(student));
    expect(portal.body.data.submission).toMatchObject({ linkUrl: 'https://github.com/anvar/landing', codeLanguage: 'javascript', hasAttachment: true });
    expect(portal.body.data.submission.files).toHaveLength(5);
    const removed = await request(app).delete(`/api/portal/homework/${id}/files/${portal.body.data.submission.files[0].id}`).set(bearer(student));
    expect(removed.status).toBe(200);
  });

  it('qaytarish: izoh bilan RETURNED, xabar ketadi; muddatdan keyin qayta topshirish kechikish emas', async () => {
    const { token, group, anvar, barno } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const homework = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Qaytariladigan', groupId: group.id, deadline: future(1) });
    const id = homework.body.data.id as string;
    const student = await portalToken(admin, anvar.id);
    await request(app).post(`/api/portal/homework/${id}/submit`).set(bearer(student)).send({ answerText: 'Birinchi urinish' });

    const notSubmitted = await request(app).post(`/api/homework/${id}/submissions/${barno.id}/return`).set(bearer(token)).send({ feedback: 'Qayta qiling' });
    const noFeedback = await request(app).post(`/api/homework/${id}/submissions/${anvar.id}/return`).set(bearer(token)).send({ feedback: '' });
    expect([notSubmitted.status, noFeedback.status]).toEqual([422, 422]);

    const returned = await request(app).post(`/api/homework/${id}/submissions/${anvar.id}/return`).set(bearer(token)).send({ feedback: 'Validatsiya yo‘q' });
    expect(returned.status).toBe(200);
    expect(returned.body.data).toMatchObject({ status: 'RETURNED', feedback: 'Validatsiya yo‘q' });
    expect(returned.body.data.returnedAt).not.toBeNull();
    const notice = await prisma.notification.findFirst({ where: { type: 'HOMEWORK_RETURNED' }, select: { message: true } });
    expect(notice?.message).toContain('Validatsiya yo‘q');

    // Muddat o'tib ketdi — lekin qaytarilgan ishni qayta topshirish LATE emas
    await prisma.homework.update({ where: { id }, data: { deadline: new Date(Date.now() - DAY) } });
    const resubmit = await request(app).post(`/api/portal/homework/${id}/submit`).set(bearer(student)).send({ answerText: 'Tuzatildi' });
    expect(resubmit.body.data).toMatchObject({ status: 'SUBMITTED', late: false });
  });

  it('rubrika: og‘irliklar 100%, ball serverda hisoblanadi; to‘liq baholash shart; faqat muallif/admin tahrirlaydi', async () => {
    const { token, group, anvar, barno } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: otherTeacher } = await createUserWithToken(app, { role: 'TEACHER' });

    const wrong = await request(app)
      .post('/api/rubrics')
      .set(bearer(token))
      .send({ name: 'Noto‘g‘ri', criteria: [{ key: 'a', title: 'A mezon', weight: 50 }, { key: 'b', title: 'B mezon', weight: 30 }] });
    expect(wrong.status).toBe(422);
    const rubric = await request(app)
      .post('/api/rubrics')
      .set(bearer(token))
      .send({ name: 'Kod rubrikasi', criteria: [{ key: 'correctness', title: 'To‘g‘rilik', weight: 60 }, { key: 'quality', title: 'Sifat', weight: 40 }] });
    expect(rubric.status).toBe(201);
    const rubricId = rubric.body.data.id as string;

    const homework = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Rubrikali', groupId: group.id, deadline: future(), maxPoints: 50, rubricId });
    const id = homework.body.data.id as string;
    expect(homework.body.data.rubricCriteria).toHaveLength(2);

    const partial = await request(app).patch(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(token)).send({ rubricScores: { correctness: 100 } });
    const unknown = await request(app).patch(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(token)).send({ rubricScores: { correctness: 100, quality: 50, extra: 10 } });
    expect([partial.status, unknown.status]).toEqual([422, 422]);

    // 60% × 100 + 40% × 50 = 80% → 50 balldan 40
    const graded = await request(app).patch(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(token)).send({ rubricScores: { correctness: 100, quality: 50 }, feedback: 'Yaxshi' });
    expect(graded.status).toBe(200);
    const row = graded.body.data.submissions.find((item: { studentId: string }) => item.studentId === anvar.id);
    expect(row).toMatchObject({ status: 'GRADED', score: 40 });
    const detail = await request(app).get(`/api/homework/${id}/submissions/${anvar.id}`).set(bearer(token));
    expect(detail.body.data.rubricScores).toEqual({ correctness: 100, quality: 50 });

    const plain = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Rubrikasiz', groupId: group.id, deadline: future() });
    const noRubric = await request(app).patch(`/api/homework/${plain.body.data.id}/submissions/${barno.id}`).set(bearer(token)).send({ rubricScores: { correctness: 100, quality: 100 } });
    expect(noRubric.status).toBe(422);

    const foreignEdit = await request(app).put(`/api/rubrics/${rubricId}`).set(bearer(otherTeacher)).send({ name: 'O‘g‘irlangan' });
    const adminEdit = await request(app).put(`/api/rubrics/${rubricId}`).set(bearer(admin)).send({ isActive: false });
    expect([foreignEdit.status, adminEdit.status]).toEqual([403, 200]);
    const active = await request(app).get('/api/rubrics').set(bearer(token));
    expect(active.body.data).toHaveLength(0);
  });

  it('job: 24 soat qolganda bir marta eslatadi; muddati o‘tgan topshirilmagan — MISSED, keyin kech topshirish mumkin', async () => {
    const { token, group, anvar, barno } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const soon = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Ertaga', groupId: group.id, deadline: new Date(Date.now() + 5 * 3_600_000).toISOString() });
    const past = await prisma.homework.create({ data: { title: 'Kecha', groupId: group.id, deadline: new Date(Date.now() - DAY), status: 'PUBLISHED' } });
    await prisma.homeworkSubmission.createMany({ data: [{ homeworkId: past.id, studentId: anvar.id }, { homeworkId: past.id, studentId: barno.id, status: 'SUBMITTED', submittedAt: new Date() }] });
    await request(app).post(`/api/students/${anvar.id}/portal-account`).set(bearer(admin)).send({});

    const first = await runHomeworkReminders();
    const second = await runHomeworkReminders();
    expect(first.missed).toBe(1);
    expect(second.missed).toBe(0);
    const deadlineNotices = await prisma.notification.count({ where: { type: 'HOMEWORK_DEADLINE' } });
    expect(deadlineNotices).toBe(1); // faqat kabineti bor Anvar, bir marta
    expect(soon.status).toBe(201);

    const states = await prisma.homeworkSubmission.findMany({ where: { homeworkId: past.id }, select: { studentId: true, status: true } });
    expect(new Map(states.map((row) => [row.studentId, row.status]))).toEqual(new Map([[anvar.id, 'MISSED'], [barno.id, 'SUBMITTED']]));

    const student = await loginWithTemporaryPassword(
      app,
      `ST-${String((await prisma.student.findUniqueOrThrow({ where: { id: anvar.id } })).number).padStart(6, '0')}`,
      (await request(app).post(`/api/students/${anvar.id}/portal-account/reset-password`).set(bearer(admin))).body.data.temporaryPassword,
    );
    const late = await request(app).post(`/api/portal/homework/${past.id}/submit`).set(bearer(student)).send({ answerText: 'Kech bo‘lsa ham' });
    expect(late.body.data).toMatchObject({ status: 'LATE', late: true });
  });

  it('o‘qituvchi fayli va havolasi: nishondagi o‘quvchi oladi, boshqa o‘quvchi va qoralama — 404', async () => {
    const { token, group, anvar, barno } = await setup();
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Materialli', groupId: group.id, deadline: future(), targetType: 'INDIVIDUAL', studentIds: [anvar.id] });
    const id = homework.body.data.id as string;
    const file = await request(app).post(`/api/homework/${id}/attachments/upload`).set(bearer(token)).set('Content-Type', 'application/pdf').set('X-File-Name', 'topshiriq.pdf').send(PDF);
    const link = await request(app).post(`/api/homework/${id}/attachments`).set(bearer(token)).send({ title: 'Figma', url: 'https://figma.com/file/x' });
    expect([file.status, link.status]).toEqual([201, 201]);

    const anvarToken = await portalToken(admin, anvar.id);
    const barnoToken = await portalToken(admin, barno.id);
    const detail = await request(app).get(`/api/portal/homework/${id}`).set(bearer(anvarToken));
    expect(detail.body.data.attachments.map((item: { kind: string }) => item.kind)).toEqual(['FILE', 'LINK']);
    const own = await request(app).get(`/api/portal/homework/${id}/materials/${file.body.data.id}`).set(bearer(anvarToken));
    const foreign = await request(app).get(`/api/portal/homework/${id}/materials/${file.body.data.id}`).set(bearer(barnoToken));
    const foreignDetail = await request(app).get(`/api/portal/homework/${id}`).set(bearer(barnoToken));
    expect([own.status, foreign.status, foreignDetail.status]).toEqual([200, 404, 404]);

    const draft = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Qoralama', groupId: group.id, deadline: future(), status: 'DRAFT', targetType: 'INDIVIDUAL', studentIds: [anvar.id] });
    const hidden = await request(app).get(`/api/portal/homework/${draft.body.data.id}`).set(bearer(anvarToken));
    const list = await request(app).get('/api/portal/homework').set(bearer(anvarToken));
    expect(hidden.status).toBe(404);
    expect(list.body.data.map((row: { title: string }) => row.title)).toEqual(['Materialli']);
  });
});
