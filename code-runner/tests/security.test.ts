import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, containerFlags, execute, type Language, type Limits } from '../src/executor.js';

/**
 * TZ 3.1 §41 — sandbox xavfsizlik testlari **haqiqiy Docker konteynerlarida** (soxta emas):
 * cheksiz sikl, xotira bombasi, fayl tizimi, tarmoq, jarayon, sirlar — hammasi bloklanishi shart.
 *
 * Ikki daraja tekshiriladi:
 *  1) o'quvchi kodi odatdagi yo'l bilan (`execute`) — til himoyasi + konteyner;
 *  2) **konteynerning o'zi** — til himoyasini chetlab, xuddi shu bayroqlar bilan xom `sh` (til qatlami buzilgan
 *     taqdirda ham konteyner ushlab turishini isbotlash).
 *
 * Docker bo'lmasa — o'tkazib yuboriladi (va buni aniq aytadi). Mahalliy muhitda runtime `runc`; production — `runsc`.
 */
const dockerReady = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' }).status === 0;
const RUNTIME = process.env.CODE_RUNNER_RUNTIME ?? 'runc';
const LIMITS: Limits = { ...DEFAULT_LIMITS, timeMs: 2_000 };
const run = (language: Language, code: string, input = '') => execute(language, code, input, LIMITS, { runtime: RUNTIME });

/** Til qatlamisiz: xuddi shu izolyatsiya bayroqlari bilan xom shell buyrug'i */
async function rawContainer(script: string, env: Record<string, string> = {}): Promise<{ code: number | null; out: string; ms: number }> {
  const started = Date.now();
  const args = [...containerFlags(`sbx-test-${randomUUID()}`, LIMITS, RUNTIME), ...Object.keys(env).flatMap((key) => ['--env', key]), 'node:24-alpine', 'sh', '-c', script];
  return new Promise((resolve) => {
    const child = spawn('docker', args, { env: { PATH: process.env.PATH ?? '', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}), ...env } });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
    const guard = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (code) => {
      clearTimeout(guard);
      resolve({ code, out, ms: Date.now() - started });
    });
  });
}

describe.skipIf(!dockerReady)(`§41 sandbox xavfsizligi (runtime: ${RUNTIME})`, () => {
  beforeAll(() => {
    // Runner jarayonining sirlari — konteynerga o'tmasligi tekshiriladi
    process.env.CODE_RUNNER_TOKEN = 'runner-secret-token-must-not-leak-0000';
    process.env.DATABASE_URL = 'postgresql://crm:super-secret@db/crm';
  });

  it('oddiy kod ishlaydi (JS, TS, Python) — nazorat', async () => {
    expect(await run('javascript', 'console.log(2 + 3)')).toMatchObject({ status: 'ok', stdout: '5\n' });
    expect(await run('typescript', 'const x: number = 7; console.log(x * 6)')).toMatchObject({ status: 'ok', stdout: '42\n' });
    expect(await run('python', 'print(sum(map(int, input().split())))', '4 5')).toMatchObject({ status: 'ok', stdout: '9\n' });
  });

  describe('cheksiz sikl', () => {
    it.each([
      ['javascript', 'while (true) {}'],
      ['python', 'while True:\n    pass'],
    ] as const)('%s — vaqt tugashi bilan o‘ldiriladi', async (language, code) => {
      const result = await run(language, code);
      expect(result.status).toBe('timeout');
      expect(result.timeMs).toBeLessThan(LIMITS.timeMs + 4_000);
    });
  });

  describe('xotira bombasi', () => {
    it.each([
      ['javascript', 'const a = []; while (true) a.push(new Array(1e6).fill(7));'],
      ['python', 'a = []\nwhile True:\n    a.append(bytearray(10**7))'],
    ] as const)('%s — xotira chegarasi (OOM), host ta’sirlanmaydi', async (language, code) => {
      const result = await run(language, code);
      expect(result.status).toBe('memory');
      // Keyingi ish odatdagidek ishlaydi
      expect((await run('javascript', 'console.log("ok")')).status).toBe('ok');
    });
  });

  describe('fayl tizimi', () => {
    it('JS: tizim faylini o‘qish va yozish — rad (permission model)', async () => {
      const read = await run('javascript', 'console.log(require("fs").readFileSync("/etc/passwd", "utf8"))');
      expect(read.status).toBe('error');
      expect(read.stderr).toMatch(/ERR_ACCESS_DENIED/);
      expect(read.stdout).not.toContain('root:');
      const write = await run('javascript', 'require("fs").writeFileSync("/tmp/x.txt", "hack"); console.log("WROTE")');
      expect(write.stdout).not.toContain('WROTE');
      expect(write.stderr).toMatch(/ERR_ACCESS_DENIED/);
    });

    it('Python: tizim faylini o‘qish, yozish, papka ro‘yxati — rad (audit hook)', async () => {
      for (const code of ['print(open("/etc/passwd").read())', 'open("/tmp/x.txt", "w").write("hack")', 'import os\nprint(os.listdir("/"))']) {
        const result = await run('python', code);
        expect(result.status, code).toBe('error');
        expect(result.stderr, code).toMatch(/PermissionError: Sandbox/);
        expect(result.stdout, code).not.toContain('root:');
      }
    });

    it('konteyner: rootfs faqat o‘qish, /tmp noexec, host papkalari yo‘q, docker socket yo‘q', async () => {
      const result = await rawContainer(
        'touch /etc/hack 2>&1; echo "--"; ls /Users /home/runner /var/run/docker.sock 2>&1; echo "--"; cp /bin/busybox /tmp/bb && /tmp/bb echo EXEC_OK 2>&1; echo "--"; id',
      );
      expect(result.out).toMatch(/Read-only file system/);
      expect(result.out).toMatch(/No such file or directory/);
      expect(result.out).not.toContain('EXEC_OK');
      expect(result.out).toMatch(/Permission denied/);
      expect(result.out).toMatch(/uid=65534/);
    });
  });

  describe('tarmoq', () => {
    it('JS va Python: tashqi so‘rov — bloklangan', async () => {
      const js = await run('javascript', 'fetch("http://1.1.1.1").then(() => console.log("ONLINE"), () => console.log("BLOCKED"))');
      expect(js.stdout.trim()).toBe('BLOCKED');
      const py = await run('python', 'import socket\nsocket.create_connection(("1.1.1.1", 80), timeout=2)\nprint("ONLINE")');
      expect(py.stdout).not.toContain('ONLINE');
      expect(py.stderr).toMatch(/PermissionError: Sandbox/);
    });

    it('konteyner: faqat loopback, tashqi manzilga ulanib bo‘lmaydi', async () => {
      const result = await rawContainer('cat /proc/net/dev | tail -n +3 | cut -d: -f1; echo "--"; wget -q -T 2 -O - http://1.1.1.1 2>&1 || echo NO_NETWORK');
      const interfaces = result.out.split('--')[0]!.trim().split(/\s+/);
      expect(interfaces).toEqual(['lo']);
      expect(result.out).toContain('NO_NETWORK');
    });
  });

  describe('jarayon yaratish', () => {
    it('JS: child_process va Worker — rad', async () => {
      const exec = await run('javascript', 'console.log(require("child_process").execSync("id").toString())');
      expect(exec.stdout).not.toContain('uid=');
      expect(exec.stderr).toMatch(/ERR_ACCESS_DENIED/);
      const worker = await run('javascript', 'new (require("worker_threads").Worker)("console.log(1)", { eval: true })');
      expect(worker.stderr).toMatch(/ERR_ACCESS_DENIED/);
    });

    it('Python: subprocess, os.system, os.fork — rad', async () => {
      for (const code of ['import subprocess\nsubprocess.run(["id"])', 'import os\nos.system("id")', 'import os\nos.fork()']) {
        const result = await run('python', code);
        expect(result.stdout, code).not.toContain('uid=');
        expect(result.stderr, code).toMatch(/PermissionError: Sandbox/);
      }
    });

    it('konteyner: fork bomba jarayon chegarasida to‘xtaydi, host ta’sirlanmaydi', async () => {
      // Til himoyasisiz (xom node, --permission yo'q): 200 ta jarayon — pids chegarasidan (64) oshganlari yaratilmaydi
      const bomb = "const cp=require('child_process');let ok=0,fail=0;for(let i=0;i<200;i++){try{const c=cp.spawn('sleep',['5'],{stdio:'ignore'});c.on('error',()=>{});if(c.pid)ok++;else fail++}catch{fail++}}setTimeout(()=>{console.log('ok='+ok+' fail='+fail);process.exit(0)},500)";
      const result = await rawContainer(`node -e "${bomb.replace(/"/g, '\\"')}"`);
      const [, ok, fail] = /ok=(\d+) fail=(\d+)/.exec(result.out) ?? [];
      expect(Number(ok), result.out).toBeLessThan(LIMITS.pids);
      expect(Number(fail), result.out).toBeGreaterThan(100);
      expect(result.ms).toBeLessThan(10_000);
      expect((await run('javascript', 'console.log("alive")')).stdout).toBe('alive\n');
    });
  });

  describe('sirlar', () => {
    it('JS va Python: runner muhiti (token, baza manzili) ko‘rinmaydi', async () => {
      const js = await run('javascript', 'console.log(JSON.stringify(process.env))');
      const py = await run('python', 'import os\nprint(dict(os.environ))');
      for (const output of [js.stdout, py.stdout]) {
        expect(output).not.toContain('runner-secret-token');
        expect(output).not.toContain('super-secret');
        expect(output).not.toContain('CODE_RUNNER_TOKEN');
        expect(output).not.toContain('DATABASE_URL');
      }
      // Kod va kirish ham kod ishga tushishidan oldin muhitdan olib tashlangan
      expect(js.stdout).not.toContain('"CODE"');
    });

    it('konteyner: imtiyozlar yo‘q (CapEff = 0), root emas', async () => {
      const result = await rawContainer('grep CapEff /proc/self/status; id -u');
      expect(result.out).toMatch(/CapEff:\s+0000000000000000/);
      expect(result.out).toMatch(/^65534$/m);
    });
  });

  it('chiqish bombasi — chegarada to‘xtatiladi', async () => {
    const result = await run('javascript', 'const s = "x".repeat(1024); while (true) process.stdout.write(s);');
    expect(result.status).toBe('output_limit');
    expect(result.stdout.length).toBeLessThanOrEqual(LIMITS.outputBytes);
  });
});

describe.runIf(!dockerReady)('§41 sandbox xavfsizligi', () => {
  it.skip('Docker mavjud emas — xavfsizlik testlari bu muhitda bajarilmadi', () => undefined);
});
