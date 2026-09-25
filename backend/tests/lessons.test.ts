import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 4 — LMS (TZ 3.0 §12–14): Kurs → Modul → Mavzu → Dars → Material,
 * o'qituvchi doirasi, kabinetda faqat nashr qilingan darslar, darsni "o'rgandim",
 * dars sessiyasi mavzusi → kelganlar progressi.
 */
const app = createApp();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
let phone = 0;

async function createStudent(courseId: string, groupId: string | null, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99893${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function curriculum(courseId: string) {
  const module = await prisma.courseModule.create({ data: { courseId, title: 'JavaScript' } });
  const topic = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Massivlar' } });
  return { module, topic };
}

async function studentToken(adminToken: string, studentId: string) {
  const created = await request(app).post(`/api/students/${studentId}/portal-account`).set(bearer(adminToken)).send({});
  return loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
}

describe.skipIf(!hasTestDatabase)('LMS darslari (PHASE 4)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dars hayot sikli: qoralama → nashr → arxiv; nashr qilingan o‘chirilmaydi, qoralama o‘chiriladi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Frontend');
    const { topic } = await curriculum(course.id);

    const created = await request(app)
      .post(`/api/curriculum/topics/${topic.id}/lessons`)
      .set(bearer(admin))
      .send({ title: 'map va filter', description: 'Massiv metodlari', content: 'Konspekt', durationMinutes: 90, videoUrl: 'https://youtu.be/abc' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'DRAFT', publishedAt: null, durationMinutes: 90, videoUrl: 'https://youtu.be/abc' });
    const id = created.body.data.id as string;

    const published = await request(app).put(`/api/lessons/${id}`).set(bearer(admin)).send({ status: 'PUBLISHED' });
    expect(published.body.data.status).toBe('PUBLISHED');
    const publishedAt = published.body.data.publishedAt as string;
    expect(publishedAt).not.toBeNull();
    // Qayta saqlash nashr sanasini o'zgartirmaydi
    const edited = await request(app).put(`/api/lessons/${id}`).set(bearer(admin)).send({ title: 'map, filter, reduce', status: 'PUBLISHED' });
    expect(edited.body.data.publishedAt).toBe(publishedAt);

    const deletePublished = await request(app).delete(`/api/lessons/${id}`).set(bearer(admin));
    expect(deletePublished.status).toBe(422);

    const tree = await request(app).get(`/api/courses/${course.id}/lessons`).set(bearer(admin));
    expect(tree.body.data).toMatchObject({ canEdit: true, totals: { lessons: 1, published: 1 } });
    expect(tree.body.data.modules[0].topics[0].lessons[0]).toMatchObject({ title: 'map, filter, reduce', hasVideo: true });

    await request(app).put(`/api/lessons/${id}`).set(bearer(admin)).send({ status: 'ARCHIVED' });
    const withoutArchived = await request(app).get(`/api/courses/${course.id}/lessons`).set(bearer(admin));
    const withArchived = await request(app).get(`/api/courses/${course.id}/lessons`).query({ includeArchived: 'true' }).set(bearer(admin));
    expect(withoutArchived.body.data.totals.lessons).toBe(0);
    expect(withArchived.body.data.totals.lessons).toBe(1);

    const draft = await request(app).post(`/api/curriculum/topics/${topic.id}/lessons`).set(bearer(admin)).send({ title: 'Qoralama' });
    expect((await request(app).delete(`/api/lessons/${draft.body.data.id}`).set(bearer(admin))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'lesson.' } } })).toBeGreaterThanOrEqual(5);
  });

  it('o‘qituvchi faqat o‘zi o‘qitadigan kursda dars yaratadi; ruxsatsiz rol — 403', async () => {
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const own = await createCourse('Python');
    const foreign = await createCourse('Dizayn');
    await createGroup({ courseId: own.id, teacherId: teacher.id });
    const ownTopic = (await curriculum(own.id)).topic;
    const foreignTopic = (await curriculum(foreign.id)).topic;

    const allowed = await request(app).post(`/api/curriculum/topics/${ownTopic.id}/lessons`).set(bearer(teacherToken)).send({ title: 'Ro‘yxatlar' });
    const denied = await request(app).post(`/api/curriculum/topics/${foreignTopic.id}/lessons`).set(bearer(teacherToken)).send({ title: 'Begona' });
    const noPermission = await request(app).post(`/api/curriculum/topics/${ownTopic.id}/lessons`).set(bearer(sales)).send({ title: 'Sotuv' });
    expect([allowed.status, denied.status, noPermission.status]).toEqual([201, 403, 403]);
    expect(allowed.body.data.teacher).toMatchObject({ id: teacher.id });

    const ownTree = await request(app).get(`/api/courses/${own.id}/lessons`).set(bearer(teacherToken));
    const foreignTree = await request(app).get(`/api/courses/${foreign.id}/lessons`).set(bearer(teacherToken));
    expect([ownTree.body.data.canEdit, foreignTree.body.data.canEdit]).toEqual([true, false]);
  });

  it('materiallar: havola, video, fayl; xavfli havola va noto‘g‘ri fayl rad etiladi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Backend');
    const { topic } = await curriculum(course.id);
    const lesson = await request(app).post(`/api/curriculum/topics/${topic.id}/lessons`).set(bearer(admin)).send({ title: 'HTTP' });
    const id = lesson.body.data.id as string;

    const link = await request(app).post(`/api/lessons/${id}/materials`).set(bearer(admin)).send({ kind: 'LINK', title: 'MDN', url: 'https://developer.mozilla.org' });
    const video = await request(app).post(`/api/lessons/${id}/materials`).set(bearer(admin)).send({ kind: 'VIDEO', title: 'Video', url: 'https://youtu.be/x' });
    const evil = await request(app).post(`/api/lessons/${id}/materials`).set(bearer(admin)).send({ kind: 'LINK', title: 'Xavfli', url: 'javascript:alert(1)' });
    expect([link.status, video.status, evil.status]).toEqual([201, 201, 422]);

    const upload = await request(app)
      .post(`/api/lessons/${id}/materials/upload`)
      .set(bearer(admin))
      .set('Content-Type', 'image/png')
      .set('X-File-Name', encodeURIComponent('sxema.png'))
      .set('X-Material-Title', encodeURIComponent('Sxema rasmi'))
      .send(PNG);
    expect(upload.status).toBe(201);
    expect(upload.body.data).toMatchObject({ kind: 'FILE', title: 'Sxema rasmi', originalName: 'sxema.png', mimeType: 'image/png', url: null });

    const text = await request(app)
      .post(`/api/lessons/${id}/materials/upload`)
      .set(bearer(admin))
      .set('Content-Type', 'text/plain')
      .send(Buffer.from('oddiy matn'));
    expect(text.status).toBe(422);

    const download = await request(app).get(`/api/lessons/materials/${upload.body.data.id}/download`).set(bearer(admin)).buffer(true);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');

    const detail = await request(app).get(`/api/lessons/${id}`).set(bearer(admin));
    expect(detail.body.data.materials.map((material: { kind: string }) => material.kind)).toEqual(['LINK', 'VIDEO', 'FILE']);

    expect((await request(app).delete(`/api/lessons/materials/${link.body.data.id}`).set(bearer(admin))).status).toBe(200);
    expect((await request(app).get(`/api/lessons/${id}`).set(bearer(admin))).body.data.materials).toHaveLength(2);
  });

  it('kabinet: faqat o‘z kursining nashr qilingan darslari; ko‘rish yoziladi; "o‘rgandim"; begona — 404', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('React');
    const other = await createCourse('Vue');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Darsli');
    const { topic } = await curriculum(course.id);
    const otherTopic = (await curriculum(other.id)).topic;

    const published = await request(app).post(`/api/curriculum/topics/${topic.id}/lessons`).set(bearer(admin)).send({ title: 'JSX', status: 'PUBLISHED' });
    await request(app).post(`/api/curriculum/topics/${topic.id}/lessons`).set(bearer(admin)).send({ title: 'Qoralama dars' });
    const foreign = await request(app).post(`/api/curriculum/topics/${otherTopic.id}/lessons`).set(bearer(admin)).send({ title: 'Vue asoslari', status: 'PUBLISHED' });
    const file = await request(app)
      .post(`/api/lessons/${published.body.data.id}/materials/upload`)
      .set(bearer(admin))
      .set('Content-Type', 'image/png')
      .send(PNG);
    const foreignFile = await request(app)
      .post(`/api/lessons/${foreign.body.data.id}/materials/upload`)
      .set(bearer(admin))
      .set('Content-Type', 'image/png')
      .send(PNG);

    const token = await studentToken(admin, student.id);
    const tree = await request(app).get('/api/portal/course').set(bearer(token));
    expect(tree.status).toBe(200);
    expect(tree.body.data.totals).toEqual({ lessons: 1, published: 1, completed: 0 });
    expect(tree.body.data.modules[0].topics[0].lessons.map((lesson: { title: string }) => lesson.title)).toEqual(['JSX']);

    const lesson = await request(app).get(`/api/portal/course/lessons/${published.body.data.id}`).set(bearer(token));
    expect(lesson.status).toBe(200);
    expect(lesson.body.data).toMatchObject({ title: 'JSX', completed: false });
    expect(await prisma.lessonProgress.count({ where: { studentId: student.id } })).toBe(1);

    const complete = await request(app).post(`/api/portal/course/lessons/${published.body.data.id}/complete`).set(bearer(token)).send({ completed: true });
    expect(complete.body.data.completed).toBe(true);
    expect((await request(app).get('/api/portal/course').set(bearer(token))).body.data.totals.completed).toBe(1);

    const ownFile = await request(app).get(`/api/portal/course/materials/${file.body.data.id}/download`).set(bearer(token));
    const otherFile = await request(app).get(`/api/portal/course/materials/${foreignFile.body.data.id}/download`).set(bearer(token));
    const otherLesson = await request(app).get(`/api/portal/course/lessons/${foreign.body.data.id}`).set(bearer(token));
    expect([ownFile.status, otherFile.status, otherLesson.status]).toEqual([200, 404, 404]);

    // Ota-ona ko'radi, lekin "ko'rildi"/"o'rgandim" yozmaydi
    const parent = await prisma.parent.create({ data: { firstName: 'Ota', lastName: 'Darsli', phone: '+998909990000', students: { create: [{ studentId: student.id }] } } });
    const parentAccount = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
    const parentToken = await loginWithTemporaryPassword(app, parentAccount.body.data.login, parentAccount.body.data.temporaryPassword);
    await prisma.lessonProgress.deleteMany({});
    const parentView = await request(app).get(`/api/portal/course/lessons/${published.body.data.id}`).set(bearer(parentToken));
    const parentComplete = await request(app).post(`/api/portal/course/lessons/${published.body.data.id}/complete`).set(bearer(parentToken)).send({});
    expect([parentView.status, parentComplete.status]).toEqual([200, 403]);
    expect(await prisma.lessonProgress.count()).toBe(0);
  });

  it('davomatda mavzu tanlansa: kelganlarda "o‘rganilmoqda", kelmaganda yo‘q, tugatilgani o‘zgarmaydi; begona mavzu — 422', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse('Algoritmlar');
    const other = await createCourse('Boshqa');
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const { topic } = await curriculum(course.id);
    const foreignTopic = (await curriculum(other.id)).topic;
    const present = await createStudent(course.id, group.id, 'Keldi');
    const late = await createStudent(course.id, group.id, 'Kechikdi');
    const absent = await createStudent(course.id, group.id, 'Kelmadi');
    const finished = await createStudent(course.id, group.id, 'Tugatgan');
    await prisma.studentTopicProgress.create({ data: { studentId: finished.id, topicId: topic.id, status: 'COMPLETED', completedAt: new Date() } });

    const records = [
      { studentId: present.id, status: 'PRESENT' },
      { studentId: late.id, status: 'LATE' },
      { studentId: absent.id, status: 'ABSENT' },
      { studentId: finished.id, status: 'PRESENT' },
    ];
    const foreign = await request(app).post(`/api/groups/${group.id}/attendance`).set(bearer(token)).send({ date: '2026-09-21', topicId: foreignTopic.id, records });
    expect(foreign.status).toBe(422);

    const marked = await request(app).post(`/api/groups/${group.id}/attendance`).set(bearer(token)).send({ date: '2026-09-21', topicId: topic.id, records });
    expect(marked.status).toBe(200);

    const rows = await prisma.studentTopicProgress.findMany({ where: { topicId: topic.id }, select: { studentId: true, status: true } });
    const byStudent = new Map(rows.map((row) => [row.studentId, row.status]));
    expect(byStudent.get(present.id)).toBe('IN_PROGRESS');
    expect(byStudent.get(late.id)).toBe('IN_PROGRESS');
    expect(byStudent.has(absent.id)).toBe(false);
    expect(byStudent.get(finished.id)).toBe('COMPLETED');

    const session = await prisma.attendanceSession.findFirstOrThrow({ where: { groupId: group.id }, select: { id: true, topicId: true } });
    expect(session.topicId).toBe(topic.id);

    // Seansga keyin boshqa mavzu biriktirilsa — kelganlarga qo'llanadi
    const second = await prisma.courseTopic.create({ data: { moduleId: (await prisma.courseTopic.findUniqueOrThrow({ where: { id: topic.id } })).moduleId, title: 'Saralash' } });
    const updated = await request(app).put(`/api/attendance-sessions/${session.id}`).set(bearer(token)).send({ topicId: second.id });
    expect(updated.status).toBe(200);
    expect(updated.body.data.curriculumTopic).toEqual({ id: second.id, title: 'Saralash' });
    expect(await prisma.studentTopicProgress.count({ where: { topicId: second.id } })).toBe(3);
  });
});
