/* eslint-disable no-console -- xizmat logi */
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig, type RunnerConfig } from './config.js';
import { RunValidationError, parseRunRequest, runTests } from './runner.js';

/**
 * Runner HTTP xizmati (alohida serverda, faqat CRM IP'siga ochiq):
 *   GET  /health     — holat (tokensiz, sir yo'q)
 *   POST /v1/runs    — `Authorization: Bearer <CODE_RUNNER_TOKEN>`; navbat to'lsa 429
 */

const MAX_BODY = 256 * 1024;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new RunValidationError('So‘rov juda katta');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createRunnerServer(config: RunnerConfig): Server {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async () => {
    if (active < config.concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
  };
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && req.url === '/health') {
        send(res, 200, { ok: true, runtime: config.runtime, active, queued: waiting.length });
        return;
      }
      if (req.method !== 'POST' || req.url !== '/v1/runs') {
        send(res, 404, { error: 'not_found' });
        return;
      }
      if (!authorized(req.headers.authorization, config.token)) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      if (active >= config.concurrency && waiting.length >= config.queueLimit) {
        send(res, 429, { error: 'busy' });
        return;
      }
      let request;
      try {
        const raw = await readBody(req);
        request = parseRunRequest(JSON.parse(raw));
      } catch (error) {
        send(res, 422, { error: error instanceof RunValidationError ? error.message : 'JSON noto‘g‘ri' });
        return;
      }
      await acquire();
      try {
        send(res, 200, await runTests(request, { runtime: config.runtime }));
      } catch (error) {
        console.error('run failed', error instanceof Error ? error.message : error);
        send(res, 500, { error: 'runner_error' });
      } finally {
        release();
      }
    })();
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = loadConfig();
  if (config.runtime !== 'runsc') console.warn(`⚠️  CODE_RUNNER_RUNTIME=${config.runtime} — production'da gVisor (runsc) talab qilinadi`);
  createRunnerServer(config).listen(config.port, config.host, () => console.log(`code-runner: ${config.host}:${config.port} (runtime ${config.runtime})`));
}
