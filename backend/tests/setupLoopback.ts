import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { beforeAll, vi } from 'vitest';

/**
 * Testlarda `request(app)` har doim **bitta doimiy, faqat 127.0.0.1 ga bog'langan** serverga boradi.
 *
 * Nega: Supertest o'zi har so'rov uchun `http.createServer(app).listen(0)` qiladi — server barcha manzillarga
 * bog'lanadi, tizim tasodifiy port beradi — so'ng so'rovni `http://127.0.0.1:<port>` ga yuboradi. Boshqa lokal
 * jarayon aynan `127.0.0.1:<port>` ni tinglayotgan bo'lsa (masalan VS Code kengaytma jarayonining Node inspector'i
 * tasodifiy portda), tizim o'sha port raqamini "barcha manzillar" uchun baribir beradi, lekin 127.0.0.1 ga kelgan
 * ulanish aniqroq manzilni tinglayotgan O'SHA jarayonga tushadi. Natija:
 *   - tasodifiy `400 "WebSockets request was expected"` (inspector javobi) — test kutilmagan status oladi;
 *   - yoki umuman javobsiz osilib qolish — test vaqt chegarasidan oshadi.
 * To'liq yurishda o'n minglab so'rov = o'n minglab port tanlovi, shuning uchun har yurishda 0–2 ta "tasodifiy"
 * yiqilish chiqardi, har safar boshqa testda (o'lchov: 10 ta inspector tinglovchisi bilan 30 100 so'rovdan 22 tasi).
 *
 * Yechim: bitta server test fayli boshida **aniq 127.0.0.1 ga** bog'lanadi — bir xil manzilda band portni tizim
 * bermaydi — va fayl oxirigacha ishlatiladi. Port har so'rovda emas, faylda bir marta tanlanadi.
 * Bitta faylda bir nechta ilova bo'lishi mumkin (masalan turli `trust proxy` bilan), shuning uchun server so'rovni
 * ichki sarlavha bo'yicha tegishli ilovaga uzatadi; sarlavha ilovaga yetmasdan olib tashlanadi.
 */
const APP_HEADER = 'x-test-app-id';
const apps = new Map<string, RequestListener>();
const ids = new WeakMap<RequestListener, string>();

const server = createServer((req, res) => {
  const id = req.headers[APP_HEADER];
  const app = typeof id === 'string' ? apps.get(id) : undefined;
  if (!app) {
    res.statusCode = 500;
    res.end('Test serveri: ilova topilmadi');
    return;
  }
  delete req.headers[APP_HEADER];
  app(req, res);
});

// Host berilganda Node asinxron bog'lanadi — shuning uchun server testlardan oldin, shu yerda tayyorlanadi
beforeAll(async () => {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  // Test jarayoni server tufayli ochiq qolmasin
  server.unref();
});

function idOf(app: RequestListener): string {
  let id = ids.get(app);
  if (!id) {
    id = String(apps.size + 1);
    ids.set(app, id);
    apps.set(id, app);
  }
  return id;
}

type Chain = { set: (name: string, value: string) => unknown };
type Methods = Record<string, (url: string) => Chain>;

vi.mock('supertest', async (importOriginal) => {
  const actual = await importOriginal<{ default: (app: unknown, options?: unknown) => Methods } & Record<string, unknown>>();
  const original = actual.default;
  const request = Object.assign((app: unknown, options?: unknown) => {
    // Faqat Express ilovasi (funksiya) o'raladi; tayyor server/URL berilsa yoki server hali ishga tushmagan bo'lsa
    // (masalan fayl yuklanayotganda chaqirilsa) — Supertest'ning o'z yo'li
    if (typeof app !== 'function' || !server.listening) return original(app, options);
    const id = idOf(app as RequestListener);
    const methods = original(server, options);
    return new Proxy(methods, {
      get(target, property: string) {
        const method = target[property];
        return typeof method === 'function' ? (url: string) => method(url).set(APP_HEADER, id) : method;
      },
    });
  }, original);
  return { ...actual, default: request };
});
