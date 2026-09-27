import { DEFAULT_LIMITS, LANGUAGES, execute, type ExecOptions, type ExecStatus, type Language, type Limits } from './executor.js';

/** CRM yuboradigan ish: til, kod, testlar (kirish → kutilgan chiqish) */
export interface RunRequest {
  language: Language;
  code: string;
  tests: Array<{ input: string; expected: string }>;
  timeMs?: number;
}

export interface TestOutcome {
  passed: boolean;
  status: ExecStatus;
  timeMs: number;
  exitCode: number | null;
  /** O'quvchi chiqishi va xatosi — qisqartirilgan */
  stdout: string;
  stderr: string;
}

export interface RunResponse {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  passed: number;
  total: number;
  tests: TestOutcome[];
}

export const MAX_CODE = 64 * 1024;
export const MAX_TESTS = 10;
export const MAX_IO = 16 * 1024;
const PREVIEW = 4 * 1024;

export class RunValidationError extends Error {}

/** Kiruvchi ishni qat'iy tekshiradi — noma'lum maydon, katta kod, ko'p test — rad */
export function parseRunRequest(body: unknown): RunRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RunValidationError('JSON obyekt kutilgan');
  const data = body as Record<string, unknown>;
  const unknown = Object.keys(data).filter((key) => !['language', 'code', 'tests', 'timeMs'].includes(key));
  if (unknown.length) throw new RunValidationError(`Noma'lum maydon: ${unknown.join(', ')}`);
  if (!LANGUAGES.includes(data.language as Language)) throw new RunValidationError('Til: javascript, typescript yoki python');
  if (typeof data.code !== 'string' || data.code.length === 0 || Buffer.byteLength(data.code) > MAX_CODE) throw new RunValidationError(`Kod 1 bayt – ${MAX_CODE / 1024} KB`);
  if (!Array.isArray(data.tests) || data.tests.length === 0 || data.tests.length > MAX_TESTS) throw new RunValidationError(`Testlar 1–${MAX_TESTS} ta`);
  const tests = data.tests.map((test, index) => {
    const row = test as Record<string, unknown> | null;
    if (!row || typeof row.input !== 'string' || typeof row.expected !== 'string') throw new RunValidationError(`Test ${index + 1}: input va expected satr bo'lsin`);
    if (Buffer.byteLength(row.input) > MAX_IO || Buffer.byteLength(row.expected) > MAX_IO) throw new RunValidationError(`Test ${index + 1}: juda katta`);
    return { input: row.input, expected: row.expected };
  });
  const timeMs = data.timeMs === undefined ? undefined : Number(data.timeMs);
  if (timeMs !== undefined && (!Number.isInteger(timeMs) || timeMs < 500 || timeMs > 10_000)) throw new RunValidationError('timeMs 500–10000');
  return { language: data.language as Language, code: data.code, tests, ...(timeMs === undefined ? {} : { timeMs }) };
}

/** Chiqishni solishtirish: qator oxiridagi bo'shliqlar va oxirgi bo'sh qatorlar hisobga olinmaydi, \r\n = \n */
export function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

const preview = (value: string) => (value.length > PREVIEW ? `${value.slice(0, PREVIEW)}\n… (qisqartirildi)` : value);

export async function runTests(request: RunRequest, options: ExecOptions, baseLimits: Limits = DEFAULT_LIMITS): Promise<RunResponse> {
  const limits: Limits = { ...baseLimits, ...(request.timeMs ? { timeMs: request.timeMs } : {}) };
  const tests: TestOutcome[] = [];
  for (const test of request.tests) {
    const result = await execute(request.language, request.code, test.input, limits, options);
    const passed = result.status === 'ok' && normalizeOutput(result.stdout) === normalizeOutput(test.expected);
    tests.push({ passed, status: result.status, timeMs: result.timeMs, exitCode: result.exitCode, stdout: preview(result.stdout), stderr: preview(result.stderr) });
    // Runner o'zi ishlamayapti (docker/tasvir) — qolgan testlarni urinishning ma'nosi yo'q
    if (result.status === 'runner_error') break;
  }
  const passed = tests.filter((test) => test.passed).length;
  const runnerFailed = tests.some((test) => test.status === 'runner_error');
  return { status: runnerFailed ? 'ERROR' : passed === request.tests.length ? 'PASSED' : 'FAILED', passed, total: request.tests.length, tests };
}
