import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import { codeRunService } from '../src/services/codeRun.service.js';
import { homeworkService } from '../src/services/homework.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-19 — CRM tomoni: vazifa testlari → topshirish → navbat → runner → natija.
 * Soxta natija yo'q: runner sozlanmagan yoki ishlamasa "o'tdi" hech qachon yozilmaydi.
 */
const app = createApp();
const mutableEnv = env as { -readonly [K in keyof typeof env]: (typeof env)[K] };
const saved = { url: env.CODE_RUNNER_URL, token: env.CODE_RUNNER_TOKEN };
const TOKEN = 'crm-runner-shared-token-0123456789-abc';
const dockerReady = spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;
let phone = 0;

const TESTS = [
  { input: '2 3', expected: '5' },
  { input: '10 5', expected: '15' },
  { input: '100 1', expected: '101', hidden: true },
];

async function setup() {
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: `Python ${phone}` });
  phone += 1;
  const student = await prisma.student.create({
    data: { firstName: 'Kod', lastName: 'Yozar', phone: `+99883${String(1_000_000 + phone).slice(-7)}`, courseId: course.id, groupId: group.id, contractPrice: 1, startDate: new Date('2026-01-01') },
  });
  const created = await request(app)
    .post('/api/homework')
    .set(bearer(token))
    .send({ title: 'Ikki son yig‘indisi', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString(), codeLanguage: 'python', codeTests: TESTS })
    .expect(201);
  return { token, student, homeworkId: created.body.data.id as string };
}

const submit = (studentId: string, homeworkId: string, codeText: string) =>
  homeworkService.submitByStudent(studentId, homeworkId, { codeText, codeLanguage: 'python', source: 'portal' } as never);

const submissionId = async (homeworkId: string, studentId: string) =>
  (await prisma.homeworkSubmission.findUniqueOrThrow({ where: { homeworkId_studentId: { homeworkId, studentId } } })).id;

function runnerReply(tests: Array<{ passed: boolean; stdout: string; status?: string }>) {
  const passed = tests.filter((test) => test.passed).length;
  return new Response(
    JSON.stringify({
      status: passed === tests.length ? 'PASSED' : 'FAILED',
      passed,
      total: tests.length,
      tests: tests.map((test) => ({ passed: test.passed, status: test.status ?? 'ok', timeMs: 120, exitCode: 0, stdout: test.stdout, stderr: '' })),
    }),
    { status: 200 },
  );
}

describe.skipIf(!hasTestDatabase)('Kod sandbox — CRM (GAP-19)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    Object.assign(mutableEnv, { CODE_RUNNER_URL: 'http://runner.internal:4100', CODE_RUNNER_TOKEN: TOKEN });
  });
  afterEach(() => {
    Object.assign(mutableEnv, { CODE_RUNNER_URL: saved.url, CODE_RUNNER_TOKEN: saved.token });
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runner sozlanmagan: run yaratilmaydi, "ulanmagan" ko‘rinadi, qayta yuborish — 422 (soxta natija yo‘q)', async () => {
    Object.assign(mutableEnv, { CODE_RUNNER_URL: undefined, CODE_RUNNER_TOKEN: undefined });
    const { token, student, homeworkId } = await setup();
    await submit(student.id, homeworkId, 'print(1)');
    expect(await prisma.codeRun.count()).toBe(0);
    const detail = (await request(app).get(`/api/homework/${homeworkId}/submissions/${student.id}`).set(bearer(token)).expect(200)).body.data;
    expect(detail).toMatchObject({ codeRun: null, codeRunnerEnabled: false });
    expect((await request(app).post(`/api/homework/${homeworkId}/submissions/${student.id}/code-run`).set(bearer(token))).status).toBe(422);
    expect((await request(app).get('/api/homework/code-runner').set(bearer(token)).expect(200)).body.data).toEqual({ enabled: false });
  });

  it('testlar faqat JS/TS/Python, ko‘pi bilan 10 ta — aks holda 422', async () => {
    const { token } = await setup();
    const group = await prisma.group.findFirstOrThrow();
    const base = { title: 'Sahifa', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString() };
    expect((await request(app).post('/api/homework').set(bearer(token)).send({ ...base, codeLanguage: 'html', codeTests: TESTS })).status).toBe(422);
    expect((await request(app).post('/api/homework').set(bearer(token)).send({ ...base, codeLanguage: 'python', codeTests: Array.from({ length: 11 }, () => TESTS[0]) })).status).toBe(422);
    expect((await request(app).post('/api/homework').set(bearer(token)).send({ ...base, codeLanguage: 'html' })).status).toBe(201);
  });

  it('topshirish → navbat → runner (token bilan) → natija; o‘qituvchi to‘liq, o‘quvchi — yashirin test niqoblangan', async () => {
    const { token, student, homeworkId } = await setup();
    await submit(student.id, homeworkId, 'a, b = map(int, input().split())\nprint(a + b)');
    expect(await prisma.codeRun.findFirstOrThrow()).toMatchObject({ status: 'QUEUED', language: 'python' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(runnerReply([{ passed: true, stdout: '5\n' }, { passed: true, stdout: '15\n' }, { passed: false, stdout: '100\n' }]));
    expect(await codeRunService.processQueue()).toMatchObject({ done: 1 });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('http://runner.internal:4100/v1/runs');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init!.body));
    expect(body).toEqual({ language: 'python', code: 'a, b = map(int, input().split())\nprint(a + b)', tests: TESTS.map(({ input, expected }) => ({ input, expected })) });

    const teacherView = (await request(app).get(`/api/homework/${homeworkId}/submissions/${student.id}`).set(bearer(token)).expect(200)).body.data.codeRun;
    expect(teacherView).toMatchObject({ status: 'FAILED', passed: 2, total: 3 });
    expect(teacherView.tests[2]).toMatchObject({ hidden: true, input: '100 1', expected: '101', stdout: '100\n', passed: false });

    const studentView = await codeRunService.latestForSubmission(await submissionId(homeworkId, student.id), { forStudent: true });
    expect(studentView!.tests[2]).toMatchObject({ hidden: true, input: null, expected: null, stdout: null, stderr: null, passed: false });
    expect(studentView!.tests[0]).toMatchObject({ input: '2 3', expected: '5', stdout: '5\n' });
  });

  it('runner band/javob bermasa — qayta urinish, 3 dan keyin ERROR; 401 — darhol ERROR; hech qachon PASSED emas', async () => {
    const { student, homeworkId } = await setup();
    await submit(student.id, homeworkId, 'print(5)');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"error":"busy"}', { status: 429 })).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await codeRunService.processQueue()).toMatchObject({ retried: 1 });
    expect(await prisma.codeRun.findFirstOrThrow()).toMatchObject({ status: 'QUEUED', attempts: 1 });
    await codeRunService.processQueue(new Date(Date.now() + 60_000));
    await codeRunService.processQueue(new Date(Date.now() + 10 * 60_000));
    const run = await prisma.codeRun.findFirstOrThrow();
    expect(run).toMatchObject({ status: 'ERROR', attempts: 3, passed: null });
    expect(run.error).toMatch(/Runner javob bermadi/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await prisma.codeRun.deleteMany();
    await submit(student.id, homeworkId, 'print(6)');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }));
    await codeRunService.processQueue();
    expect(await prisma.codeRun.findFirstOrThrow()).toMatchObject({ status: 'ERROR', attempts: 1 });
  });

  it('parallel job — har run bir marta yuboriladi; osilib qolgan RUNNING navbatga qaytadi', async () => {
    const { student, homeworkId } = await setup();
    await submit(student.id, homeworkId, 'print(5)');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => runnerReply([{ passed: true, stdout: '5\n' }, { passed: false, stdout: '' }, { passed: false, stdout: '' }]));
    await Promise.all([codeRunService.processQueue(), codeRunService.processQueue(), codeRunService.processQueue()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await prisma.codeRun.updateMany({ data: { status: 'RUNNING', startedAt: new Date(Date.now() - 10 * 60_000) } });
    await codeRunService.processQueue();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(await prisma.codeRun.findFirstOrThrow()).toMatchObject({ status: 'FAILED' });
  });

  it.runIf(dockerReady)('haqiqiy runner (alohida jarayon, izolyatsiyalangan konteyner): to‘g‘ri kod — PASSED, taqiqlangan kod — FAILED', async () => {
    // Runner production'dagidek alohida jarayon — faqat HTTP orqali; unga CRM sirlari berilmaydi
    const port = 4190 + Math.floor(Math.random() * 400);
    const runner = spawn(process.execPath, ['--import', 'tsx', path.resolve(import.meta.dirname, '../../code-runner/src/server.ts')], {
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}), CODE_RUNNER_TOKEN: TOKEN, CODE_RUNNER_PORT: String(port), CODE_RUNNER_HOST: '127.0.0.1', CODE_RUNNER_RUNTIME: 'runc' },
      stdio: 'ignore',
    });
    mutableEnv.CODE_RUNNER_URL = `http://127.0.0.1:${port}`;
    try {
      for (let i = 0; i < 50; i += 1) {
        const ready = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.ok, () => false);
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const { token, student, homeworkId } = await setup();
      await submit(student.id, homeworkId, 'a, b = map(int, input().split())\nprint(a + b)');
      await codeRunService.processQueue();
      const good = (await request(app).get(`/api/homework/${homeworkId}/submissions/${student.id}`).set(bearer(token)).expect(200)).body.data.codeRun;
      expect(good).toMatchObject({ status: 'PASSED', passed: 3, total: 3 });

      // Taqiqlangan amal (jarayon yaratish) — sandbox bloklaydi, natija FAILED (soxta "o'tdi" yo'q)
      await prisma.homeworkSubmission.update({ where: { homeworkId_studentId: { homeworkId, studentId: student.id } }, data: { codeText: 'import os\nos.system("id")' } });
      await request(app).post(`/api/homework/${homeworkId}/submissions/${student.id}/code-run`).set(bearer(token)).expect(200);
      await codeRunService.processQueue();
      const bad = await codeRunService.latestForSubmission(await submissionId(homeworkId, student.id), { forStudent: false });
      expect(bad).toMatchObject({ status: 'FAILED', passed: 0 });
      expect(bad!.tests[0]!.stderr).toMatch(/PermissionError: Sandbox/);
    } finally {
      runner.kill('SIGTERM');
    }
  }, 120_000);
});
