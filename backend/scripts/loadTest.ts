/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * HTTP yuk testi (TZ 3.0 §67: "Large dataset bilan test qil") — tashqi kutubxonasiz.
 *
 *   # 1) katta ma'lumot: DATABASE_URL=.../crm_perf npm run db:perf-seed
 *   # 2) server shu bazada ishlab turgan bo'lsin, keyin:
 *   LOAD_URL=http://localhost:4000 LOAD_EMAIL=owner@example.com LOAD_PASSWORD=... \
 *   LOAD_CONCURRENCY=20 LOAD_SECONDS=20 npm run perf:load
 *
 * Muhim: umumiy IP limiti (300/daqiqa) yuk testini 429 ga aylantiradi — bu limit to'g'ri
 * ishlayotganini bildiradi. Endpoint tezligini o'lchash uchun serverni `NODE_ENV=test` bilan
 * (limitlar o'chadi; faqat bcrypt raundlari va AI o'zgaradi) **alohida bazada** ishga tushiring.
 *
 * Har endpoint uchun: so'rovlar soni, RPS, p50/p95/p99 (ms), xatolar. Chegaralardan oshsa
 * (`LOAD_P95_MS`, standart 800 ms — `SLOW_REQUEST_MS` bilan bir xil) — chiqish kodi 1.
 */

const BASE = (process.env.LOAD_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const EMAIL = process.env.LOAD_EMAIL ?? 'owner@example.com';
const PASSWORD = process.env.LOAD_PASSWORD ?? '';
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 15);
const P95_LIMIT = Number(process.env.LOAD_P95_MS ?? 800);

/** Eng og'ir va eng ko'p ishlatiladigan o'qish endpointlari */
const ENDPOINTS = [
  '/api/dashboard/summary',
  '/api/students?page=1&limit=20',
  '/api/leads?page=1&limit=20',
  '/api/debts?page=1&limit=20',
  '/api/teaching/overview',
  '/api/analytics/academic?dimension=group',
  '/api/search?q=ali',
  '/api/alerts?status=open',
  '/api/tasks',
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!response.ok) throw new Error(`Kirish muvaffaqiyatsiz: HTTP ${response.status}`);
  const body = (await response.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

async function main(): Promise<void> {
  if (!PASSWORD) {
    console.error('LOAD_PASSWORD berilmagan.');
    process.exit(1);
  }
  const token = await login();
  const stats = new Map<string, { times: number[]; errors: number }>(ENDPOINTS.map((path) => [path, { times: [], errors: 0 }]));
  const deadline = Date.now() + SECONDS * 1000;
  let cursor = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      const path = ENDPOINTS[cursor++ % ENDPOINTS.length]!;
      const started = performance.now();
      try {
        const response = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
        await response.arrayBuffer();
        const entry = stats.get(path)!;
        entry.times.push(performance.now() - started);
        if (!response.ok) entry.errors += 1;
      } catch {
        stats.get(path)!.errors += 1;
      }
    }
  };
  console.log(`Yuk: ${CONCURRENCY} parallel, ${SECONDS} s, ${BASE}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  let failed = false;
  console.log('\nendpoint'.padEnd(46), 'so‘rov', '  rps', '  p50', '  p95', '  p99', 'xato');
  for (const [path, entry] of stats) {
    const sorted = [...entry.times].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    if (p95 > P95_LIMIT || entry.errors > 0) failed = true;
    console.log(
      path.padEnd(45),
      String(sorted.length).padStart(6),
      (sorted.length / SECONDS).toFixed(1).padStart(5),
      percentile(sorted, 50).toFixed(0).padStart(5),
      p95.toFixed(0).padStart(5),
      percentile(sorted, 99).toFixed(0).padStart(5),
      String(entry.errors).padStart(4),
      p95 > P95_LIMIT ? '  ⚠️ sekin' : '',
    );
  }
  if (failed) {
    console.error(`\nChegara buzildi: p95 > ${P95_LIMIT} ms yoki xatolar bor.`);
    process.exit(1);
  }
  console.log('\n✅ Barcha endpointlar chegarada.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
