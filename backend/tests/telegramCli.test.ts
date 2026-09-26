import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCheck, runWebhook } from '../src/cli/telegramTools.js';
import { env } from '../src/config/env.js';
import { telegramService } from '../src/services/telegram.service.js';

/** TZ 3.1, audit S9 — Telegram CLI production image'da ishlashi (dist/cli) va sirlarni chiqarmasligi */
const TOKEN = '123456:TEST-token-must-not-leak';
const SECRET = 'webhook-secret-must-not-leak-0000000000';
const mutableEnv = env as { -readonly [K in keyof typeof env]: (typeof env)[K] };
const original = { token: env.TELEGRAM_BOT_TOKEN, secret: env.TELEGRAM_WEBHOOK_SECRET };

function captureConsole() {
  const lines: string[] = [];
  for (const method of ['log', 'error', 'warn'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
  }
  return () => lines.join('\n');
}

describe('Telegram CLI (S9)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mutableEnv.TELEGRAM_BOT_TOKEN = TOKEN;
    mutableEnv.TELEGRAM_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    mutableEnv.TELEGRAM_BOT_TOKEN = original.token;
    mutableEnv.TELEGRAM_WEBHOOK_SECRET = original.secret;
    vi.unstubAllGlobals();
  });

  it('production skriptlari dist/cli ga ishora qiladi va manbasi src/cli da (tsc build ichida)', () => {
    const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const name of ['telegram:webhook:prod', 'telegram:check:prod']) {
      const match = /^node dist\/cli\/(\w+)\.js$/.exec(pkg.scripts[name] ?? '');
      expect(match, name).not.toBeNull();
      expect(existsSync(path.resolve('src/cli', `${match![1]}.ts`)), name).toBe(true);
    }
    const build = JSON.parse(readFileSync(path.resolve('tsconfig.build.json'), 'utf8')) as { include: string[] };
    expect(build.include).toContain('src');
  });

  it('CLI import zanjirida faqat production bog‘liqliklar (runtime image `npm ci --omit=dev`)', () => {
    const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const allowed = new Set([...Object.keys(pkg.dependencies), ...builtinModules]);
    const seen = new Set<string>();
    const external = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      // `import type` kompilyatsiyada o'chadi — hisobga olinmaydi
      for (const match of source.matchAll(/^import\s+(?!type\s)[^'"]*?['"]([^'"]+)['"]/gm)) {
        const spec = match[1]!;
        if (spec.startsWith('.')) visit(path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts')));
        else external.add(spec.startsWith('node:') ? spec.slice(5) : spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
      }
    };
    visit(path.resolve('src/cli/telegramWebhook.ts'));
    visit(path.resolve('src/cli/telegramCheck.ts'));
    expect([...external].filter((name) => !allowed.has(name))).toEqual([]);
    expect(seen.size).toBeGreaterThan(3);
    // Tekshiruv haqiqatan tashqi paketlarni topyapti (bo'sh ro'yxat "o'tib ketmasin")
    expect([...external]).toEqual(expect.arrayContaining(['dotenv', 'zod', 'pino']));
  });

  it('webhook: https majburiy; secret yo‘q — rad; o‘rnatilganda to‘g‘ri manzil; sirlar chiqarilmaydi', async () => {
    const output = captureConsole();
    const set = vi.spyOn(telegramService, 'setWebhook').mockResolvedValue(true);

    expect(await runWebhook('http://crm.example.uz')).toBe(1);
    expect(await runWebhook(undefined)).toBe(1);
    expect(set).not.toHaveBeenCalled();

    mutableEnv.TELEGRAM_WEBHOOK_SECRET = undefined;
    expect(await runWebhook('https://crm.example.uz')).toBe(1);
    mutableEnv.TELEGRAM_WEBHOOK_SECRET = SECRET;

    expect(await runWebhook('https://crm.example.uz/')).toBe(0);
    expect(set).toHaveBeenCalledWith('https://crm.example.uz/api/telegram/webhook', SECRET);
    expect(output()).not.toContain(TOKEN);
    expect(output()).not.toContain(SECRET);
  });

  it('webhook --delete va token yo‘q holati', async () => {
    captureConsole();
    const remove = vi.spyOn(telegramService, 'deleteWebhook').mockResolvedValue(true);
    expect(await runWebhook('--delete')).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
    mutableEnv.TELEGRAM_BOT_TOKEN = undefined;
    expect(await runWebhook('https://crm.example.uz')).toBe(1);
    expect(await runCheck()).toBe(1);
  });

  it('check: bot va webhook holati, token faqat uzunligi bilan', async () => {
    const output = captureConsole();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = String(url).endsWith('/getMe')
          ? { ok: true, result: { id: 1, username: 'markaz_bot', first_name: 'Markaz' } }
          : { ok: true, result: { url: 'https://crm.example.uz/api/telegram/webhook', pending_update_count: 2 } };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    expect(await runCheck()).toBe(0);
    const text = output();
    expect(text).toContain(`bor (${TOKEN.length} belgi)`);
    expect(text).toContain('Bot: @markaz_bot');
    expect(text).toContain('Kutayotgan xabarlar: 2');
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(SECRET);
  });
});
