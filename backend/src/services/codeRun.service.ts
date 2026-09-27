import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import type { CodeRunStatus, Prisma } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';

/**
 * Kod sandbox — CRM tomoni (TZ 3.1 GAP-19, docs/code-sandbox.md).
 *
 * CRM kodni **o'zi bajarmaydi**: faqat navbat (`code_runs`) va alohida runner serverga HTTP so'rov. Runner sozlanmagan
 * (`CODE_RUNNER_URL`/`CODE_RUNNER_TOKEN` bo'sh) — run yaratilmaydi, UI "ulanmagan" deydi. Runner javob bermasa — 3
 * urinishdan keyin `ERROR` (natija yo'q); hech qachon "o'tdi" deb yozilmaydi.
 */

export const RUNNABLE_LANGUAGES = ['javascript', 'typescript', 'python'] as const;
export type RunnableLanguage = (typeof RUNNABLE_LANGUAGES)[number];

export interface CodeTest {
  input: string;
  expected: string;
  /** O'quvchiga kirish va kutilgan chiqish ko'rsatilmaydi — faqat o'tdi/o'tmadi */
  hidden?: boolean;
}

interface RunnerTest {
  passed: boolean;
  status: string;
  timeMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface RunnerResponse {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  passed: number;
  total: number;
  tests: RunnerTest[];
}

export interface CodeRunTestDto {
  index: number;
  passed: boolean;
  /** ok, error, timeout, memory, output_limit */
  status: string;
  timeMs: number;
  hidden: boolean;
  /** Yashirin testda o'quvchiga null */
  input: string | null;
  expected: string | null;
  stdout: string | null;
  stderr: string | null;
}

export interface CodeRunDto {
  id: string;
  status: CodeRunStatus;
  language: string;
  passed: number | null;
  total: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  tests: CodeRunTestDto[];
}

const MAX_ATTEMPTS = 3;
const BATCH = 5;
/** RUNNING da osilib qolgan (server qayta ishga tushgan) run shuncha vaqtdan keyin navbatga qaytadi */
const STALE_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 150_000;

export function isRunnerEnabled(): boolean {
  return Boolean(env.CODE_RUNNER_URL && env.CODE_RUNNER_TOKEN);
}

export function isRunnable(language: string | null | undefined): language is RunnableLanguage {
  return RUNNABLE_LANGUAGES.includes(language as RunnableLanguage);
}

export function parseTests(value: Prisma.JsonValue | null | undefined): CodeTest[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is { input: string; expected: string; hidden?: boolean } => typeof row === 'object' && row !== null && typeof (row as { input?: unknown }).input === 'string' && typeof (row as { expected?: unknown }).expected === 'string')
    .map((row) => ({ input: row.input, expected: row.expected, ...(row.hidden === true ? { hidden: true } : {}) }));
}

function toDto(run: { id: string; status: CodeRunStatus; language: string; passed: number | null; total: number | null; error: string | null; createdAt: Date; finishedAt: Date | null; result: Prisma.JsonValue | null }, tests: CodeTest[], forStudent: boolean): CodeRunDto {
  const outcomes = ((run.result as { tests?: RunnerTest[] } | null)?.tests ?? []) as RunnerTest[];
  return {
    id: run.id,
    status: run.status,
    language: run.language,
    passed: run.passed,
    total: run.total,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    tests: outcomes.map((outcome, index) => {
      const test = tests[index];
      const masked = forStudent && Boolean(test?.hidden);
      return {
        index: index + 1,
        passed: outcome.passed,
        status: outcome.status,
        timeMs: outcome.timeMs,
        hidden: Boolean(test?.hidden),
        input: masked ? null : (test?.input ?? null),
        expected: masked ? null : (test?.expected ?? null),
        stdout: masked ? null : outcome.stdout,
        stderr: masked ? null : outcome.stderr,
      };
    }),
  };
}

async function callRunner(body: { language: string; code: string; tests: Array<{ input: string; expected: string }> }): Promise<{ ok: true; data: RunnerResponse } | { ok: false; retry: boolean; error: string }> {
  try {
    const response = await fetch(`${env.CODE_RUNNER_URL!.replace(/\/$/, '')}/v1/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CODE_RUNNER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const data = (await response.json()) as RunnerResponse;
      if (!Array.isArray(data?.tests) || typeof data.passed !== 'number') return { ok: false, retry: false, error: 'Runner javobi noto‘g‘ri' };
      return { ok: true, data };
    }
    const text = (await response.text().catch(() => '')).slice(0, 200);
    // 429 (band), 5xx — keyinroq; 401/422 — sozlama yoki ma'lumot xatosi, qayta urinish foydasiz
    return { ok: false, retry: response.status === 429 || response.status >= 500, error: `Runner ${response.status}: ${text}` };
  } catch (error) {
    return { ok: false, retry: true, error: `Runner javob bermadi: ${error instanceof Error ? error.message : 'tarmoq xatosi'}`.slice(0, 500) };
  }
}

export const codeRunService = {
  /**
   * Topshirish tranzaksiyasida: vazifada til va testlar, javobda kod va runner sozlangan bo'lsa — navbatga.
   * Aks holda hech narsa yaratilmaydi (soxta natija yo'q).
   */
  async enqueueInTransaction(tx: Prisma.TransactionClient, submissionId: string): Promise<boolean> {
    if (!isRunnerEnabled()) return false;
    const submission = await tx.homeworkSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, studentId: true, homeworkId: true, codeText: true, homework: { select: { codeLanguage: true, codeTests: true } } },
    });
    if (!submission?.codeText?.trim() || !isRunnable(submission.homework.codeLanguage) || parseTests(submission.homework.codeTests).length === 0) return false;
    await tx.codeRun.create({
      data: { submissionId: submission.id, homeworkId: submission.homeworkId, studentId: submission.studentId, language: submission.homework.codeLanguage },
    });
    return true;
  },

  /** Oxirgi run (o'qituvchi — to'liq; o'quvchi — yashirin testlar niqoblangan) */
  async latestForSubmission(submissionId: string, options: { forStudent: boolean }): Promise<CodeRunDto | null> {
    const run = await prisma.codeRun.findFirst({ where: { submissionId }, orderBy: { createdAt: 'desc' } });
    if (!run) return null;
    const homework = await prisma.homework.findUnique({ where: { id: run.homeworkId }, select: { codeTests: true } });
    return toDto(run, parseTests(homework?.codeTests), options.forStudent);
  },

  /** Navbatni qayta ishlaydi (job). Har run shartli olinadi — bir nechta server nusxasi bir runni ikki marta olmaydi */
  async processQueue(now: Date = new Date()): Promise<{ done: number; failed: number; retried: number }> {
    if (!isRunnerEnabled()) return { done: 0, failed: 0, retried: 0 };
    // Osilib qolganlar navbatga qaytadi
    await prisma.codeRun.updateMany({ where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_MS) } }, data: { status: 'QUEUED' } });
    const queued = await prisma.codeRun.findMany({ where: { status: 'QUEUED', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: BATCH, select: { id: true } });

    let done = 0;
    let failed = 0;
    let retried = 0;
    for (const { id } of queued) {
      const claimed = await prisma.codeRun.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } });
      if (claimed.count === 0) continue;
      const run = await prisma.codeRun.findUniqueOrThrow({
        where: { id },
        select: { id: true, language: true, attempts: true, submission: { select: { codeText: true } }, homeworkId: true },
      });
      const homework = await prisma.homework.findUnique({ where: { id: run.homeworkId }, select: { codeTests: true } });
      const tests = parseTests(homework?.codeTests);
      if (!run.submission.codeText || tests.length === 0) {
        await prisma.codeRun.update({ where: { id }, data: { status: 'ERROR', error: 'Kod yoki testlar topilmadi', finishedAt: new Date() } });
        failed += 1;
        continue;
      }

      const response = await callRunner({ language: run.language, code: run.submission.codeText, tests: tests.map((test) => ({ input: test.input, expected: test.expected })) });
      const attempts = run.attempts + 1;
      if (response.ok) {
        const status: CodeRunStatus = response.data.status === 'ERROR' ? 'ERROR' : response.data.status === 'PASSED' ? 'PASSED' : 'FAILED';
        await prisma.codeRun.update({
          where: { id },
          data: {
            status,
            attempts,
            passed: response.data.passed,
            total: response.data.total,
            result: response.data as unknown as Prisma.InputJsonValue,
            error: status === 'ERROR' ? 'Runner kodni ishga tushira olmadi' : null,
            finishedAt: new Date(),
          },
        });
        if (status === 'ERROR') failed += 1;
        else done += 1;
        continue;
      }
      if (response.retry && attempts < MAX_ATTEMPTS) {
        await prisma.codeRun.update({ where: { id }, data: { status: 'QUEUED', attempts, error: response.error, nextAttemptAt: new Date(Date.now() + attempts * attempts * 30_000) } });
        retried += 1;
        continue;
      }
      await prisma.codeRun.update({ where: { id }, data: { status: 'ERROR', attempts, error: response.error, finishedAt: new Date() } });
      logger.warn({ runId: id, error: response.error }, 'Kod sandbox: run bajarilmadi');
      failed += 1;
    }
    return { done, failed, retried };
  },
};
