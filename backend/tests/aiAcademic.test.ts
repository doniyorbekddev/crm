import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { setLlmClient } from '../src/services/ai/llm.js';
import type { LlmRequest } from '../src/services/ai/llm.js';
import { dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 9 — AI akademik markaz (TZ 3.0 §30–41, §58–61): qoidalar rejimi (kalitsiz), soxta model
 * bilan boyitish, faktlar o'zgarmasligi, sensitiv maydonlar promptga ketmasligi, vazifa tekshiruvi
 * + qabul qilish, o'xshashlik signali, guruh tahlili, remedial reja, yordamchi toollari, ota-ona xulosasi.
 */
const app = createApp();
const DAY = 86_400_000;
let phone = 0;

const CODE = `function sum(numbers) {\n  var total = 0;\n  for (const value of numbers) { total += value; }\n  document.getElementById('out').innerHTML = total;\n  return total;\n}\n// TODO: bo'sh massiv tekshiruvi`;

async function createStudent(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Sinovov',
      phone: `+99891${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date(Date.now() - 90 * DAY),
      debt: { create: { totalAmount: 1_000_000, paidAmount: 1_000_000, remainingAmount: 0 } },
    },
  });
}

async function setup() {
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
  const course = await createCourse('Frontend');
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Frontend-12' });
  const anvar = await createStudent(course.id, group.id, 'Anvar');
  const barno = await createStudent(course.id, group.id, 'Barno');
  // Davomat: oldingi oy 4/4, oxirgi oy 1/4 — trend "100% → 25%"
  const marks: Array<[number, 'PRESENT' | 'ABSENT']> = [[50, 'PRESENT'], [45, 'PRESENT'], [40, 'PRESENT'], [35, 'PRESENT'], [20, 'PRESENT'], [14, 'ABSENT'], [8, 'ABSENT'], [3, 'ABSENT']];
  for (const [offset, status] of marks) {
    const date = dateColumn(new Date(Date.now() - offset * DAY));
    await prisma.attendanceSession.create({ data: { groupId: group.id, date, status: 'HELD' } });
    await prisma.attendance.create({ data: { studentId: anvar.id, groupId: group.id, date, status } });
    await prisma.attendance.create({ data: { studentId: barno.id, groupId: group.id, date, status: 'PRESENT' } });
  }
  return { teacher, token, admin, course, group, anvar, barno };
}

/** Soxta model: so'rovlarni yozib boradi va berilgan javobni qaytaradi */
function mockLlm(reply: (request: LlmRequest) => string) {
  const calls: LlmRequest[] = [];
  setLlmClient(async (req) => {
    calls.push(req);
    return { text: reply(req), model: 'mock-model', inputTokens: 100, outputTokens: 50 };
  });
  return calls;
}

describe.skipIf(!hasTestDatabase)('AI akademik markaz (PHASE 9)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    setLlmClient(null);
  });

  afterEach(() => {
    setLlmClient(undefined);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘quvchi tahlili (qoidalar): 5 ball, faktlar raqam bilan, risk o‘zgarmaydi; doira va ruxsat', async () => {
    const { token, anvar } = await setup();
    const before = await prisma.student.findUniqueOrThrow({ where: { id: anvar.id }, select: { riskLevel: true, healthScore: true } });

    const status = await request(app).get('/api/ai/academic/status').set(bearer(token));
    expect(status.body.data).toEqual({ llm: false, mode: 'RULES' });

    const created = await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(token));
    expect(created.status).toBe(201);
    const analysis = created.body.data;
    expect(analysis).toMatchObject({ kind: 'STUDENT', source: 'RULES', status: 'READY', model: null });
    expect(Object.keys(analysis.result.scores).sort()).toEqual(['academic', 'assessment', 'attendance', 'engagement', 'homework']);
    const facts = analysis.result.items.filter((item: { type: string }) => item.type === 'FACT').map((item: { text: string }) => item.text);
    expect(facts).toContain('Davomat (30 kunlik): 100% → 25%.');
    expect(analysis.result.items.some((item: { type: string; text: string }) => item.type === 'OBSERVATION' && item.text.includes('Ketma-ket 3 ta'))).toBe(true);
    expect(analysis.result.items.some((item: { type: string }) => item.type === 'RECOMMENDATION')).toBe(true);
    // Deterministik risk o'zgartirilmaydi (§32)
    expect(await prisma.student.findUniqueOrThrow({ where: { id: anvar.id }, select: { riskLevel: true, healthScore: true } })).toEqual(before);

    const latest = await request(app).get(`/api/ai/academic/students/${anvar.id}`).set(bearer(token));
    expect(latest.body.data.id).toBe(analysis.id);
    expect(await prisma.auditLog.count({ where: { action: 'ai.analysis_created', entityId: anvar.id } })).toBe(1);

    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(stranger))).status).toBe(404);
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    expect((await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(accountant))).status).toBe(403);
  });

  it('model ulangan: kuzatuv/tavsiya boyitiladi, faktlar o‘zgarmaydi, promptda ism/telefon yo‘q; noto‘g‘ri javob — qoidalar', async () => {
    const { token, anvar } = await setup();
    const rules = (await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(token))).body.data;
    const ruleFacts = rules.result.items.filter((item: { type: string }) => item.type === 'FACT');

    const calls = mockLlm(() => JSON.stringify({ summary: 'Davomat keskin pasaygan, qo‘llab-quvvatlash kerak.', observations: ['Oxirgi uch darsga kelmagan.'], recommendations: ['Ota-ona bilan yumshoq suhbat.'] }));
    const enriched = (await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(token))).body.data;
    expect(enriched).toMatchObject({ source: 'LLM', model: 'mock-model', summary: 'Davomat keskin pasaygan, qo‘llab-quvvatlash kerak.' });
    expect(enriched.result.items.filter((item: { type: string }) => item.type === 'FACT')).toEqual(ruleFacts);
    expect(enriched.result.items.filter((item: { type: string }) => item.type !== 'FACT').map((item: { text: string }) => item.text)).toEqual(['Oxirgi uch darsga kelmagan.', 'Ota-ona bilan yumshoq suhbat.']);
    const sent = `${calls[0]!.system}\n${calls[0]!.prompt}`;
    expect(sent).not.toContain('Anvar');
    expect(sent).not.toContain('Sinovov');
    expect(sent).not.toContain('+99891');

    mockLlm(() => 'kechirasiz, JSON yozolmadim');
    expect((await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(token))).body.data.source).toBe('RULES');
    setLlmClient(async () => {
      throw new Error('timeout');
    });
    expect((await request(app).post(`/api/ai/academic/students/${anvar.id}`).set(bearer(token))).body.data.source).toBe('RULES');
  });

  it('vazifa tekshiruvi: kod topilmalari, o‘xshashlik signali, taklif balli va o‘qituvchi tasdiqlashi', async () => {
    const { token, group, anvar, barno } = await setup();
    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Massiv yig‘indisi', description: 'sum funksiyasini yozing', groupId: group.id, deadline: new Date(Date.now() + DAY).toISOString(), maxPoints: 100 });
    const homeworkId = homework.body.data.id as string;
    await prisma.homeworkSubmission.update({ where: { homeworkId_studentId: { homeworkId, studentId: anvar.id } }, data: { status: 'SUBMITTED', submittedAt: new Date(), codeText: CODE, codeLanguage: 'javascript' } });
    await prisma.homeworkSubmission.update({ where: { homeworkId_studentId: { homeworkId, studentId: barno.id } }, data: { status: 'SUBMITTED', submittedAt: new Date(), codeText: `${CODE}\n// tayyor`, codeLanguage: 'javascript' } });

    // Qoidalar rejimi: ball taklif qilinmaydi
    const rules = await request(app).post(`/api/ai/academic/submissions/${homeworkId}/${anvar.id}`).set(bearer(token));
    expect(rules.status, JSON.stringify(rules.body)).toBe(201);
    expect(rules.body.data.result).toMatchObject({ suggestedScore: null, criteria: null, similarity: [{ studentName: 'Barno Sinovov', score: 100, sameLink: false }] });
    expect(rules.body.data.result.codeFindings.map((finding: { area: string }) => finding.area)).toEqual(['security', 'bestPractice', 'completeness']);
    const facts = rules.body.data.result.items.map((item: { text: string }) => item.text).join(' ');
    expect(facts).toContain('Yuqori o‘xshashlik aniqlandi');
    expect(facts).toContain('signal, hukm emas');
    expect(facts).not.toMatch(/ko‘chirgan|plagiat tasdiq/i);
    const noScore = await request(app).post(`/api/ai/academic/analyses/${rules.body.data.id}/accept`).set(bearer(token)).send({});
    expect(noScore.status).toBe(422);

    // Model: taklif balli; o'qituvchi "Accept" — ball qo'yiladi
    mockLlm(() => JSON.stringify({ correctness: 80, completeness: 70, quality: 60, understanding: 75, suggestedScore: 72, errors: ['Bo‘sh massiv holati yo‘q'], suggestions: ['textContent ishlating'], summary: 'Asosan to‘g‘ri.' }));
    const reviewed = (await request(app).post(`/api/ai/academic/submissions/${homeworkId}/${anvar.id}`).set(bearer(token))).body.data;
    expect(reviewed).toMatchObject({ source: 'LLM', result: { suggestedScore: 72, criteria: { correctness: 80, completeness: 70, quality: 60, understanding: 75 } } });
    const accepted = await request(app).post(`/api/ai/academic/analyses/${reviewed.id}/accept`).set(bearer(token)).send({ feedback: 'Yaxshi, bo‘sh massivni tekshiring' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: 'ACCEPTED', decision: { score: 72, suggestedScore: 72, edited: false } });
    expect(await prisma.homeworkSubmission.findUniqueOrThrow({ where: { homeworkId_studentId: { homeworkId, studentId: anvar.id } } })).toMatchObject({ status: 'GRADED', score: 72, feedback: 'Yaxshi, bo‘sh massivni tekshiring' });
    expect((await request(app).post(`/api/ai/academic/analyses/${reviewed.id}/accept`).set(bearer(token)).send({})).status).toBe(422);

    // "Edit score": o'qituvchi taklifni o'zgartiradi
    const second = (await request(app).post(`/api/ai/academic/submissions/${homeworkId}/${barno.id}`).set(bearer(token))).body.data;
    const edited = await request(app).post(`/api/ai/academic/analyses/${second.id}/accept`).set(bearer(token)).send({ score: 60 });
    expect(edited.body.data.decision).toMatchObject({ score: 60, suggestedScore: 72, edited: true });

    // Chegaradan oshgan taklif — sxema rad etadi, qoidalar natijasi
    mockLlm(() => JSON.stringify({ correctness: 80, completeness: 70, quality: 60, understanding: 75, suggestedScore: 150, errors: [], suggestions: [], summary: 'x' }));
    expect((await request(app).post(`/api/ai/academic/submissions/${homeworkId}/${anvar.id}`).set(bearer(token))).body.data).toMatchObject({ source: 'RULES', result: { suggestedScore: null } });

    const similarity = await request(app).get(`/api/ai/academic/homework/${homeworkId}/similarity`).set(bearer(token));
    expect(similarity.body.data).toEqual([expect.objectContaining({ score: 100, label: 'Yuqori o‘xshashlik aniqlandi' })]);
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).post(`/api/ai/academic/submissions/${homeworkId}/${anvar.id}`).set(bearer(stranger))).status).toBe(404);
  });

  it('guruh tahlili → remedial reja → o‘qituvchi tasdiqlaydi: qoralama vazifa va onlayn quiz yaratiladi', async () => {
    const { token, admin, course, group, anvar, barno } = await setup();
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'JS' } });
    const weak = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Async JS' } });
    const strong = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'HTML' } });
    for (const [studentId, weakScore, strongScore] of [[anvar.id, 30, 90], [barno.id, 45, 85]] as const) {
      await prisma.topicMastery.create({ data: { studentId, topicId: weak.id, score: weakScore, status: 'LEARNING', calculatedAt: new Date() } });
      await prisma.topicMastery.create({ data: { studentId, topicId: strong.id, score: strongScore, status: 'MASTERED', calculatedAt: new Date() } });
    }
    const lesson = await prisma.lesson.create({ data: { topicId: weak.id, title: 'Promise asoslari', status: 'PUBLISHED', publishedAt: new Date() } });
    for (let index = 0; index < 4; index += 1) {
      await request(app).post('/api/questions').set(bearer(admin)).send({ courseId: course.id, topicId: weak.id, text: `Async savol ${index + 1}`, options: [{ text: 'Ha', isCorrect: true }, { text: 'Yo‘q' }] });
    }

    const analysis = await request(app).post(`/api/ai/academic/groups/${group.id}`).set(bearer(token));
    expect(analysis.status).toBe(201);
    expect(analysis.body.data.result).toMatchObject({
      strongTopics: [{ title: 'HTML', average: 88 }],
      weakTopics: [{ title: 'Async JS', average: 38 }],
      actions: [{ type: 'REMEDIAL', topicId: weak.id }],
    });

    const proposal = await request(app).post('/api/ai/academic/remedial').set(bearer(token)).send({ groupId: group.id, topicId: weak.id, studentIds: [anvar.id] });
    expect(proposal.status).toBe(201);
    expect(proposal.body.data.result.steps.map((step: { kind: string }) => step.kind)).toEqual(['LESSON', 'HOMEWORK', 'QUIZ', 'RETEST', 'MASTERY']);
    expect(proposal.body.data.result).toMatchObject({ quiz: { questionCount: 4, poolSize: 4 }, lessonId: lesson.id });

    const accepted = await request(app).post(`/api/ai/academic/analyses/${proposal.body.data.id}/accept`).set(bearer(token)).send({});
    expect(accepted.status).toBe(200);
    const { homeworkId, examId } = accepted.body.data.decision;
    expect(await prisma.homework.findUniqueOrThrow({ where: { id: homeworkId } })).toMatchObject({ status: 'DRAFT', topicId: weak.id, lessonId: lesson.id, targetType: 'SELECTED' });
    expect(await prisma.homeworkSubmission.findMany({ where: { homeworkId }, select: { studentId: true } })).toEqual([{ studentId: anvar.id }]);
    expect(await prisma.exam.findUniqueOrThrow({ where: { id: examId } })).toMatchObject({ type: 'PRACTICE', isOnline: true, maxAttempts: 2, blueprint: { total: 4, topics: [{ topicId: weak.id, percent: 100 }] } });

    const other = await request(app).post('/api/ai/academic/remedial').set(bearer(token)).send({ groupId: group.id, topicId: weak.id });
    const rejected = await request(app).post(`/api/ai/academic/analyses/${other.body.data.id}/reject`).set(bearer(token));
    expect(rejected.body.data.status).toBe('REJECTED');
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).post('/api/ai/academic/remedial').set(bearer(stranger)).send({ groupId: group.id, topicId: weak.id })).status).toBe(404);
  });

  it('yordamchi: o‘qituvchi akademik savol beradi (o‘z doirasida); model faqat ruxsat etilgan toolni tanlay oladi', async () => {
    const { token, course } = await setup();
    const otherTeacher = await createUserWithToken(app, { role: 'TEACHER' });
    const otherGroup = await createGroup({ courseId: course.id, teacherId: otherTeacher.user.id });
    await createStudent(course.id, otherGroup.id, 'Begona');

    const tools = await request(app).get('/api/ai/tools').set(bearer(token));
    expect(tools.status).toBe(200);
    const allowed = tools.body.data.filter((tool: { allowed: boolean }) => tool.allowed).map((tool: { key: string }) => tool.key);
    expect(allowed).toEqual(expect.arrayContaining(['students_need_help', 'weak_topics', 'groups_at_risk', 'academy_today']));
    expect(allowed).not.toContain('revenue_today');

    const help = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Qaysi studentlar yordamga muhtoj?' });
    expect(help.body.data).toMatchObject({ answered: true, tool: { key: 'students_need_help' } });
    expect(help.body.data.details.join(' ')).toContain('Anvar Sinovov (Frontend-12)');
    expect(help.body.data.details.join(' ')).not.toContain('Begona');
    const groups = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Qaysi guruhlar xavfda?' });
    expect(groups.body.data.tool.key).toBe('groups_at_risk');

    mockLlm(() => JSON.stringify({ toolKey: 'academy_today' }));
    const intent = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Hozir nimalarga qarashim kerak ekan?' });
    expect(intent.body.data).toMatchObject({ answered: true, tool: { key: 'academy_today' } });
    // Model ruxsatsiz toolni tanlasa — rad etiladi
    mockLlm(() => JSON.stringify({ toolKey: 'revenue_today' }));
    const denied = await request(app).post('/api/ai/ask').set(bearer(token)).send({ question: 'Hozir kassada nima gap?' });
    expect(denied.body.data.answered).toBe(false);
  });

  it('ota-ona haftalik xulosasi: tavsiyalar (qoidalar) va model bo‘lsa iliq matn — hafta bo‘yicha keshlanadi', async () => {
    const { admin, anvar } = await setup();
    const account = await request(app).post(`/api/students/${anvar.id}/portal-account`).set(bearer(admin)).send({});
    const studentToken = await loginWithTemporaryPassword(app, account.body.data.login, account.body.data.temporaryPassword);

    const plain = await request(app).get('/api/portal/weekly-report').set(bearer(studentToken));
    expect(plain.body.data.aiSummary).toBeNull();
    expect(plain.body.data.recommendations).toContain('Darslarga muntazam qatnashishni birga rejalashtirish foydali bo‘ladi.');

    const calls = mockLlm(() => JSON.stringify({ text: 'Bu hafta Anvar bir darsda qatnashdi. Keyingi haftada darslarga birga rejalashtirib borish foydali bo‘ladi.' }));
    const first = await request(app).get('/api/portal/weekly-report').set(bearer(studentToken));
    expect(first.body.data.aiSummary).toContain('foydali bo‘ladi');
    const second = await request(app).get('/api/portal/weekly-report').set(bearer(studentToken));
    expect(second.body.data.aiSummary).toBe(first.body.data.aiSummary);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.system).toContain('ota-ona');
    expect(calls[0]!.prompt).not.toContain('+99891');
  });
});
