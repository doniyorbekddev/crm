import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { normalizeOutput, parseRunRequest, RunValidationError } from '../src/runner.js';
import { createRunnerServer } from '../src/server.js';

const TOKEN = 'test-runner-token-0123456789-abcdefgh';
const dockerReady = spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;

describe('sozlama va kirish tekshiruvi', () => {
  it('token majburiy (≥ 32 belgi), qolgani standart', () => {
    expect(() => loadConfig({})).toThrow(/CODE_RUNNER_TOKEN/);
    expect(() => loadConfig({ CODE_RUNNER_TOKEN: 'qisqa' })).toThrow();
    expect(loadConfig({ CODE_RUNNER_TOKEN: TOKEN })).toMatchObject({ port: 4100, runtime: 'runsc', concurrency: 2, queueLimit: 20 });
  });

  it('parseRunRequest: noma’lum maydon, til, bo‘sh/katta kod, testlar soni, vaqt — rad', () => {
    const ok = { language: 'python', code: 'print(1)', tests: [{ input: '', expected: '1' }] };
    expect(parseRunRequest(ok)).toMatchObject({ language: 'python' });
    for (const bad of [
      { ...ok, extra: 1 },
      { ...ok, language: 'ruby' },
      { ...ok, code: '' },
      { ...ok, code: 'x'.repeat(70 * 1024) },
      { ...ok, tests: [] },
      { ...ok, tests: Array.from({ length: 11 }, () => ({ input: '', expected: '' })) },
      { ...ok, tests: [{ input: 1, expected: '1' }] },
      { ...ok, timeMs: 60_000 },
      [],
      null,
    ]) {
      expect(() => parseRunRequest(bad), JSON.stringify(bad)?.slice(0, 60)).toThrow(RunValidationError);
    }
  });

  it('normalizeOutput: \\r\\n, qator oxiri bo‘shliqlari, oxirgi bo‘sh qatorlar', () => {
    expect(normalizeOutput('1 2 \r\n3\n\n')).toBe('1 2\n3');
    expect(normalizeOutput('a')).toBe(normalizeOutput('a\n'));
    expect(normalizeOutput(' a')).not.toBe(normalizeOutput('a'));
  });
});

describe('HTTP xizmat', () => {
  let base = '';
  const server = createRunnerServer({ token: TOKEN, port: 0, host: '127.0.0.1', runtime: 'runc', concurrency: 1, queueLimit: 0 });
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = (body: unknown, token = TOKEN) =>
    fetch(`${base}/v1/runs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('health — tokensiz, sirsiz', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, runtime: 'runc' });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('token yo‘q/noto‘g‘ri — 401; buzilgan JSON/noto‘g‘ri ish — 422; noma’lum yo‘l — 404', async () => {
    expect((await post({ language: 'python', code: 'print(1)', tests: [{ input: '', expected: '1' }] }, 'wrong-token-wrong-token-wrong-token-xx')).status).toBe(401);
    expect((await fetch(`${base}/v1/runs`, { method: 'POST' })).status).toBe(401);
    expect((await post('{bad json')).status).toBe(422);
    expect((await post({ language: 'ruby', code: 'x', tests: [{ input: '', expected: '' }] })).status).toBe(422);
    expect((await fetch(`${base}/admin`)).status).toBe(404);
  });

  it.runIf(dockerReady)('ish bajariladi: testlar bo‘yicha natija; band bo‘lsa — 429', async () => {
    const good = await post({ language: 'python', code: 'a, b = map(int, input().split())\nprint(a + b)', tests: [{ input: '2 3', expected: '5' }, { input: '10 5', expected: '16' }] });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ status: 'FAILED', passed: 1, total: 2, tests: [{ passed: true }, { passed: false, stdout: '15\n' }] });

    const slow = post({ language: 'javascript', code: 'while (true) {}', tests: [{ input: '', expected: '' }], timeMs: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const busy = await post({ language: 'javascript', code: 'console.log(1)', tests: [{ input: '', expected: '1' }] });
    expect(busy.status).toBe(429);
    expect(await (await slow).json()).toMatchObject({ status: 'FAILED', tests: [{ status: 'timeout' }] });
  });
});
