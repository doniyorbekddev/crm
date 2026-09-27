import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * Bitta kod bajarilishi — har safar **yangi, izolyatsiyalangan konteynerda** (TZ 3.1 GAP-19).
 *
 * Himoya qatlamlari (docs/code-sandbox.md §2):
 *  - konteyner: `--network none`, `--read-only` + `tmpfs /tmp` (noexec, 16 MB), bind mount yo'q, `--user 65534`,
 *    `--cap-drop ALL`, `no-new-privileges`, xotira/CPU/jarayon/fayl hajmi chegaralari, production'da gVisor (`runsc`);
 *  - muhit: konteynerga faqat `CODE` va `INPUT` (runnerning o'z muhiti, token — o'tmaydi); kod ishga tushishidan oldin
 *    `env -i` bilan ular ham tozalanadi;
 *  - til darajasida qo'shimcha to'siq: Node — permission model (`--permission`: fayl, child_process, worker yo'q),
 *    Python — audit hook (subprocess, exec, fork, socket, ctypes, fayl yozish va begona fayl o'qish yo'q);
 *  - vaqt: konteyner ichida `timeout -s KILL` + runner tomonda `docker kill`; chiqish — cheklangan hajmda o'qiladi.
 */

export type Language = 'javascript' | 'typescript' | 'python';
export const LANGUAGES: readonly Language[] = ['javascript', 'typescript', 'python'];

export interface Limits {
  /** Bitta test uchun bajarilish vaqti (ms) */
  timeMs: number;
  memoryMb: number;
  /** CPU ulushi (0.5 = yarim yadro) */
  cpus: number;
  pids: number;
  /** stdout + stderr jami (bayt) */
  outputBytes: number;
  /** Yoziladigan fayl hajmi chegarasi (bayt, `ulimit fsize`) */
  fileBytes: number;
}

export const DEFAULT_LIMITS: Limits = { timeMs: 5_000, memoryMb: 128, cpus: 0.5, pids: 64, outputBytes: 64 * 1024, fileBytes: 1024 * 1024 };

export type ExecStatus = 'ok' | 'error' | 'timeout' | 'memory' | 'output_limit' | 'runner_error';

export interface ExecResult {
  status: ExecStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timeMs: number;
}

export interface ExecOptions {
  runtime: string;
  /** Test uchun: qo'shimcha docker bayroqlari yo'q; faqat kuzatish */
  dockerBin?: string;
}

const IMAGES: Record<Language, string> = {
  javascript: 'node:24-alpine',
  typescript: 'node:24-alpine',
  python: 'python:3.13-alpine',
};

/**
 * Python himoya muqaddimasi: audit hook o'chirib bo'lmaydi (sys.addaudithook qayta chaqirilsa ham bloklanadi).
 * O'qish — faqat o'quvchi fayli va Python standart kutubxonasi; yozish — hech qayerga.
 */
const PYTHON_PRELUDE = String.raw`
import sys
_ALLOW_READ = ('/tmp/main.py',)
_LIB = tuple(p for p in sys.path if p.startswith('/usr/local/lib/python'))
_BLOCK = {'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn', 'os.spawn', 'os.fork', 'os.forkpty', 'pty.spawn',
          'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'socket.sendto', 'ctypes.dlopen', 'ctypes.dlsym',
          'os.kill', 'os.killpg', 'os.putenv', 'os.unsetenv', 'os.remove', 'os.rename',
          'os.mkdir', 'os.rmdir', 'os.chmod', 'os.chown', 'os.symlink', 'os.link', 'shutil.rmtree', 'sys.addaudithook',
          'mmap.__new__', 'sys.setrecursionlimit', 'sys.settrace', 'sys.setprofile', 'posixsubprocess'}
def _hook(event, args):
    if event in _BLOCK or event.startswith('os.exec') or event.startswith('os.spawn'):
        raise PermissionError('Sandbox: ' + event + ' taqiqlangan')
    # Import tizimi standart kutubxona papkalarini ro'yxatlaydi — faqat shu yerda ruxsat
    if event in ('os.listdir', 'os.scandir'):
        target = str(args[0]) if args and args[0] is not None else '.'
        if not target.startswith(_LIB):
            raise PermissionError('Sandbox: papka ro‘yxati taqiqlangan: ' + target)
        return
    if event == 'open':
        path, mode = str(args[0]), args[1] if len(args) > 1 and args[1] is not None else 'r'
        if isinstance(mode, int):
            import os as _os
            writing = bool(mode & (_os.O_WRONLY | _os.O_RDWR | _os.O_CREAT | _os.O_APPEND | _os.O_TRUNC))
        else:
            writing = any(c in str(mode) for c in 'wax+')
        if writing:
            raise PermissionError('Sandbox: faylga yozish taqiqlangan')
        if path not in _ALLOW_READ and not path.startswith(_LIB):
            raise PermissionError('Sandbox: fayl o‘qish taqiqlangan: ' + path)
with open('/tmp/main.py', encoding='utf-8') as _f:
    _src = _f.read()
_code = compile(_src, 'main.py', 'exec')
sys.addaudithook(_hook)
del _f, _src
exec(_code, {'__name__': '__main__', '__builtins__': __builtins__})
`;

function scriptFor(language: Language, seconds: number, memoryMb: number): string {
  const timeout = `/usr/bin/timeout -s KILL ${seconds}`;
  const clean = 'env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp';
  if (language === 'python') {
    return [
      'set -e',
      'printf %s "$CODE" | base64 -d > /tmp/main.py',
      'printf %s "$PRELUDE" | base64 -d > /tmp/prelude.py',
      'printf %s "$INPUT" | base64 -d > /tmp/input',
      `exec ${clean} ${timeout} /usr/local/bin/python3 -I -B /tmp/prelude.py < /tmp/input`,
    ].join('\n');
  }
  const file = language === 'typescript' ? '/tmp/main.ts' : '/tmp/main.js';
  const heap = Math.max(32, Math.floor(memoryMb * 0.75));
  return [
    'set -e',
    `printf %s "$CODE" | base64 -d > ${file}`,
    'printf %s "$INPUT" | base64 -d > /tmp/input',
    // --permission: fayl o'qish faqat o'quvchi fayli; yozish, child_process, worker, addon — yo'q
    `exec ${clean} ${timeout} /usr/local/bin/node --no-warnings --max-old-space-size=${heap} --permission --allow-fs-read=${file} ${file} < /tmp/input`,
  ].join('\n');
}

/** Konteyner izolyatsiya bayroqlari — bajaruvchi va xavfsizlik testlari aynan shu ro'yxatni ishlatadi */
export function containerFlags(name: string, limits: Limits, runtime: string): string[] {
  return [
    'run',
    '--rm',
    '--name', name,
    ...(runtime && runtime !== 'runc' ? ['--runtime', runtime] : []),
    '--network', 'none',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777',
    '--workdir', '/tmp',
    '--user', '65534:65534',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--memory', `${limits.memoryMb}m`,
    '--memory-swap', `${limits.memoryMb}m`,
    '--cpus', String(limits.cpus),
    '--pids-limit', String(limits.pids),
    '--ulimit', `fsize=${limits.fileBytes}:${limits.fileBytes}`,
    '--ulimit', 'nofile=64:64',
    '--ulimit', 'core=0:0',
    '--log-driver', 'none',
  ];
}

export function dockerArgs(name: string, language: Language, limits: Limits, runtime: string): string[] {
  const seconds = Math.max(1, Math.ceil(limits.timeMs / 1000));
  return [
    ...containerFlags(name, limits, runtime),
    // Qiymatlar argv'da emas — docker ularni runner jarayonining (tozalangan) muhitidan oladi
    '--env', 'CODE',
    '--env', 'INPUT',
    ...(language === 'python' ? ['--env', 'PRELUDE'] : []),
    IMAGES[language],
    'sh', '-c', scriptFor(language, seconds, limits.memoryMb),
  ];
}

function killContainer(dockerBin: string, name: string): void {
  const child = spawn(dockerBin, ['rm', '-f', name], { stdio: 'ignore', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) } });
  child.on('error', () => undefined);
}

const MEMORY_PATTERNS = [/MemoryError/, /heap out of memory/i, /Allocation failed/i, /Cannot allocate memory/i];

export async function execute(language: Language, code: string, input: string, limits: Limits, options: ExecOptions): Promise<ExecResult> {
  const dockerBin = options.dockerBin ?? 'docker';
  const name = `sbx-${randomUUID()}`;
  const started = Date.now();
  // Runner muhitidan hech narsa (token!) o'tmaydi — faqat docker'ga kerakli yo'l va socket manzili
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}),
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    CODE: Buffer.from(code, 'utf8').toString('base64'),
    INPUT: Buffer.from(input, 'utf8').toString('base64'),
    ...(language === 'python' ? { PRELUDE: Buffer.from(PYTHON_PRELUDE, 'utf8').toString('base64') } : {}),
  };

  return new Promise<ExecResult>((resolve) => {
    const child = spawn(dockerBin, dockerArgs(name, language, limits, options.runtime), { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let overflow = false;
    let timedOut = false;
    let settled = false;

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (overflow) return;
      size += chunk.length;
      if (size > limits.outputBytes) {
        overflow = true;
        target.push(chunk.subarray(0, Math.max(0, chunk.length - (size - limits.outputBytes))));
        killContainer(dockerBin, name);
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', collect(out));
    child.stderr.on('data', collect(err));

    // Konteyner ichidagi `timeout` asosiy; bu — zaxira (konteyner ishga tushishi + 3 s)
    const guard = setTimeout(() => {
      timedOut = true;
      killContainer(dockerBin, name);
    }, limits.timeMs + 3_000);

    const finish = (exitCode: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      const timeMs = Date.now() - started;
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = spawnError ? spawnError.message : Buffer.concat(err).toString('utf8');
      let status: ExecStatus;
      if (spawnError) status = 'runner_error';
      else if (overflow) status = 'output_limit';
      else if (timedOut) status = 'timeout';
      else if (exitCode === 0) status = 'ok';
      // SIGKILL (137): vaqt tugagan (ichki timeout) yoki xotira (OOM) — o'tgan vaqt bo'yicha ajratiladi
      else if (exitCode === 137) status = timeMs >= limits.timeMs ? 'timeout' : 'memory';
      else if (MEMORY_PATTERNS.some((pattern) => pattern.test(stderr))) status = 'memory';
      // docker'ning o'z xatolari (tasvir yo'q, runtime yo'q) — 125/126/127
      else if (exitCode === 125) status = 'runner_error';
      else status = 'error';
      resolve({ status, exitCode, stdout, stderr, timeMs });
    };
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code));
  });
}
