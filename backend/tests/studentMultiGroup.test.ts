import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const FUTURE = '2030-01-01T10:00:00.000Z';

/**
 * PMT: bitta o'quvchi — Matematika va Ingliz tili guruhlari, bitta umumiy oylik to'lov.
 * Asosiy guruh (Student.groupId) — moliya; qo'shimcha a'zolik — faqat o'quv jarayoni.
 */
describe.skipIf(!hasTestDatabase)('Bir o‘quvchi — bir nechta fan guruhi (integratsion)', () => {
  let admin: string;
  let mathToken: string;
  let englishToken: string;
  let math: { id: string };
  let english: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: admin } = await createUserWithToken(app, { role: 'ADMIN' }));
    const mathTeacher = await createUserWithToken(app, { role: 'TEACHER', email: 'math@test.uz' });
    const englishTeacher = await createUserWithToken(app, { role: 'TEACHER', email: 'english@test.uz' });
    mathToken = mathTeacher.token;
    englishToken = englishTeacher.token;
    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 0, sortOrder: 1 } });
    const mathCourse = await createCourse('PMT Matematika');
    const englishCourse = await createCourse('PMT Ingliz tili');
    math = await createGroup({ courseId: mathCourse.id, teacherId: mathTeacher.user.id, name: 'PMT-MATH-1' });
    english = await createGroup({ courseId: englishCourse.id, teacherId: englishTeacher.user.id, name: 'PMT-ENG-1', scheduleDays: ['TUESDAY', 'THURSDAY'] });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function pmtStudent(): Promise<string> {
    const course = await prisma.group.findUniqueOrThrow({ where: { id: math.id }, select: { courseId: true } });
    const created = await request(app)
      .post('/api/students')
      .set(bearer(admin))
      .send({ firstName: 'Ali', lastName: 'Valiyev', phone: '+998901112233', courseId: course.courseId, groupId: math.id, startDate: '2026-10-01', contractPrice: 1_000_000 });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }
  const addGroup = (token: string, studentId: string, groupId: string) =>
    request(app).post(`/api/students/${studentId}/groups`).set(bearer(token)).send({ groupId, reason: 'PMT ikkinchi fan' });

  it('ikkala guruhga biriktiriladi: bitta Student ID, ikkinchi qarz/shartnoma yaratilmaydi', async () => {
    const id = await pmtStudent();
    const debtsBefore = await prisma.debt.findMany({ where: { studentId: id } });

    const added = await addGroup(admin, id, english.id);
    expect(added.status).toBe(200);
    expect(added.body.data).toMatchObject({ id, group: { id: math.id }, contractPrice: 1_000_000 });
    expect(added.body.data.extraGroups).toEqual([expect.objectContaining({ id: english.id, name: 'PMT-ENG-1', course: expect.objectContaining({ name: 'PMT Ingliz tili' }) })]);

    // Ikkala guruh ro'yxatida aynan bir Student ID; profil bitta
    for (const groupId of [math.id, english.id]) {
      const list = await request(app).get('/api/students').query({ groupId }).set(bearer(admin));
      expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([id]);
    }
    expect(await prisma.student.count()).toBe(1);
    // Moliya: qarz bitta, summasi o'zgarmagan
    const debtsAfter = await prisma.debt.findMany({ where: { studentId: id } });
    expect(debtsAfter).toHaveLength(1);
    expect(debtsAfter[0]!.totalAmount.toNumber()).toBe(debtsBefore[0]!.totalAmount.toNumber());
    expect((await request(app).get('/api/groups/' + english.id).set(bearer(admin))).body.data.studentCount).toBe(1);
  });

  it('takroriy, asosiy guruhga, yopilgan va noto‘g‘ri guruhga biriktirish xavfsiz rad etiladi; parallel so‘rovda bittasi o‘tadi', async () => {
    const id = await pmtStudent();
    expect((await addGroup(admin, id, math.id)).status).toBe(422);
    expect((await addGroup(admin, id, 'clnotexistinggroup00000000')).status).toBe(422);

    const results = await Promise.all([addGroup(admin, id, english.id), addGroup(admin, id, english.id), addGroup(admin, id, english.id)]);
    expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    expect(results.filter((response) => response.status === 409)).toHaveLength(2);
    expect(await prisma.studentGroupMembership.count({ where: { studentId: id, leftAt: null } })).toBe(1);

    const closedCourse = await createCourse('Yopiq');
    const closed = await createGroup({ courseId: closedCourse.id, name: 'OLD-1' });
    await prisma.group.update({ where: { id: closed.id }, data: { status: 'COMPLETED' } });
    expect((await addGroup(admin, id, closed.id)).status).toBe(422);

    // Ruxsatsiz: o'qituvchi o'quvchini guruhga qo'sha olmaydi
    expect((await addGroup(mathToken, id, english.id)).status).toBe(403);
  });

  it('bir guruhdan chiqarish boshqasiga ta’sir qilmaydi; asosiy guruh shu yo‘l bilan chiqarilmaydi', async () => {
    const id = await pmtStudent();
    await addGroup(admin, id, english.id);
    const removeMain = await request(app).post(`/api/students/${id}/groups/${math.id}/remove`).set(bearer(admin)).send({ reason: 'Sinov' });
    expect(removeMain.status).toBe(422);

    const removed = await request(app).post(`/api/students/${id}/groups/${english.id}/remove`).set(bearer(admin)).send({ reason: 'Fanni tugatdi' });
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ group: { id: math.id }, extraGroups: [] });
    expect(await prisma.studentGroupMembership.findFirst({ where: { studentId: id } })).toMatchObject({ leftReason: 'Fanni tugatdi' });
    // Qayta qo'shish mumkin (tarix saqlangan)
    expect((await addGroup(admin, id, english.id)).status).toBe(200);
    const history = await request(app).get(`/api/students/${id}/group-history`).set(bearer(admin));
    expect(history.body.data.map((row: { kind: string }) => row.kind)).toEqual(['ENROLLED', 'REMOVED', 'ENROLLED', 'ENROLLED']);
  });

  it('o‘qituvchilar: har biri o‘z guruhini ko‘radi, begona guruh ID’si bilan ma’lumot ololmaydi', async () => {
    const id = await pmtStudent();
    await addGroup(admin, id, english.id);

    // Ikkala o'qituvchi ham o'quvchini o'z guruhi orqali ko'radi
    expect((await request(app).get(`/api/students/${id}`).set(bearer(englishToken))).status).toBe(200);
    expect((await request(app).get(`/api/students/${id}`).set(bearer(mathToken))).status).toBe(200);
    // Begona guruh davomat varag'i — ruxsat yo'q
    const foreignSheet = await request(app).get(`/api/groups/${english.id}/attendance`).query({ date: '2026-10-13' }).set(bearer(mathToken));
    expect(foreignSheet.status).toBeGreaterThanOrEqual(403);
    const foreignMark = await request(app)
      .post(`/api/groups/${english.id}/attendance`)
      .set(bearer(mathToken))
      .send({ date: '2026-10-13', records: [{ studentId: id, status: 'PRESENT' }] });
    expect(foreignMark.status).toBeGreaterThanOrEqual(403);
  });

  it('davomat va vazifa har guruh kontekstida alohida; o‘qituvchi boshqa fan davomatini ko‘rmaydi', async () => {
    const id = await pmtStudent();
    await addGroup(admin, id, english.id);

    // Ingliz tili o'qituvchisi o'z guruhida o'quvchini ko'radi va belgilaydi
    const sheet = await request(app).get(`/api/groups/${english.id}/attendance`).query({ date: '2026-10-13' }).set(bearer(englishToken));
    expect(sheet.body.data.students.map((row: { studentId: string }) => row.studentId)).toEqual([id]);
    const mark = await request(app)
      .post(`/api/groups/${english.id}/attendance`)
      .set(bearer(englishToken))
      .send({ date: '2026-10-13', records: [{ studentId: id, status: 'ABSENT' }] });
    expect(mark.status).toBe(200);
    await request(app)
      .post(`/api/groups/${math.id}/attendance`)
      .set(bearer(mathToken))
      .send({ date: '2026-10-13', records: [{ studentId: id, status: 'PRESENT' }] })
      .expect(200);

    const rows = await prisma.attendance.findMany({ where: { studentId: id }, orderBy: { groupId: 'asc' }, select: { groupId: true, status: true } });
    expect(rows).toEqual(expect.arrayContaining([{ groupId: english.id, status: 'ABSENT' }, { groupId: math.id, status: 'PRESENT' }]));
    // Matematika o'qituvchisi o'quvchi tarixida faqat o'z guruhi belgisini ko'radi
    const mathView = await request(app).get(`/api/students/${id}/attendance`).set(bearer(mathToken));
    expect(mathView.body.data.items.map((row: { status: string }) => row.status)).toEqual(['PRESENT']);

    // Vazifa: Ingliz tili guruhiga berilgan vazifa o'quvchiga ham tushadi
    const homework = await request(app).post('/api/homework').set(bearer(englishToken)).send({ title: 'Essay', groupId: english.id, deadline: FUTURE });
    expect(homework.status).toBe(201);
    expect(homework.body.data.submissions.map((row: { studentId: string }) => row.studentId)).toEqual([id]);
  });

  it('to‘lov va qarzdorlik: bitta to‘lov bitta marta, guruhlar kesimida takrorlanmaydi', async () => {
    const id = await pmtStudent();
    await addGroup(admin, id, english.id);
    const paid = await request(app).post('/api/payments').set(bearer(admin)).send({ studentId: id, amount: 400_000, method: 'CASH' });
    expect(paid.status).toBe(201);
    // To'lov asosiy guruhga yoziladi (o'qituvchi foizi avvalgidek) — bitta yozuv
    expect(await prisma.payment.count({ where: { studentId: id } })).toBe(1);
    expect(await prisma.payment.findFirst({ where: { studentId: id }, select: { groupId: true } })).toEqual({ groupId: math.id });

    const debts = await request(app).get('/api/debts').set(bearer(admin));
    const rows = debts.body.data.filter((row: { studentId: string }) => row.studentId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 1_000_000, paid: 400_000, remaining: 600_000 });
    const summary = await request(app).get('/api/debts/summary').set(bearer(admin));
    expect(summary.body.data.totalRemaining).toBe(600_000);
  });

  it('o‘quvchi kabineti: ikkala fan darslari bitta profil ostida, guruh nomi bilan', async () => {
    const id = await pmtStudent();
    await addGroup(admin, id, english.id);
    const created = await request(app).post(`/api/students/${id}/portal-account`).set(bearer(admin)).send({ email: 'pmt@portal.uz' });
    expect(created.status).toBe(201);
    const token = await loginWithTemporaryPassword(app, 'pmt@portal.uz', created.body.data.temporaryPassword);

    const schedule = await request(app).get('/api/portal/lessons').set(bearer(token));
    expect(schedule.status).toBe(200);
    expect(schedule.body.data.groups.map((group: { name: string }) => group.name)).toEqual(['PMT-MATH-1', 'PMT-ENG-1']);
    const lessonGroups = new Set(schedule.body.data.lessons.map((lesson: { group: { name: string } }) => lesson.group.name));
    expect(lessonGroups).toEqual(new Set(['PMT-MATH-1', 'PMT-ENG-1']));
    // Asosiy guruh maydoni avvalgidek (eski iste'molchilar uchun)
    expect(schedule.body.data.group).toMatchObject({ name: 'PMT-MATH-1' });
  });
});
