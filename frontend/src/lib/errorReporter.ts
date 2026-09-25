/**
 * Brauzer xatolarini kuzatish (TZ 3.0 §68) — backenddagi `errorTracker` bilan bir xil yondashuv:
 * SDK'siz, Sentry `store` API'ga to'g'ridan-to'g'ri. `VITE_SENTRY_DSN` bo'lmasa — hech narsa
 * yuborilmaydi.
 *
 * Maxfiylik: email, telefon, JWT/Bearer tokenlar yashiriladi; URL'dan query olib tashlanadi;
 * foydalanuvchi ma'lumoti, forma qiymatlari yoki localStorage yuborilmaydi. Bir sahifa yuklanishida
 * ko'pi bilan {@link MAX_EVENTS} ta hodisa (xato siklida tarmoqni to'ldirmaslik uchun).
 */

interface Dsn {
  key: string;
  endpoint: string;
}

export const MAX_EVENTS = 10;

export function parseDsn(value: string | undefined): Dsn | null {
  if (!value || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    const projectId = url.pathname.replace(/^\/+/, '');
    if (!url.username || !projectId) return null;
    return { key: url.username, endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/` };
  } catch {
    return null;
  }
}

/** Shaxsiy ma'lumot va sirlarni matndan olib tashlaydi */
export function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [yashirilgan]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, '[telefon]')
    .replace(/(password|parol|secret|token)=([^&\s]+)/gi, '$1=[yashirilgan]');
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildEvent(error: unknown, context: { source: string; path?: string }) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Noma’lum xatolik');
  const frames = (err.stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((line) => scrub(line.trim().replace(/^at\s+/, '')).slice(0, 200))
    .filter(Boolean)
    .reverse()
    .map((line) => ({ function: line }));
  return {
    event_id: randomId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    environment: import.meta.env.MODE,
    exception: { values: [{ type: err.name, value: scrub(err.message).slice(0, 1000), stacktrace: { frames } }] },
    // Faqat yo'l (ID'lar ham bo'lishi mumkin, lekin query — qidiruv matni, token — hech qachon)
    tags: { source: context.source, ...(context.path ? { path: scrub(context.path.split('?')[0] ?? '') } : {}) },
  };
}

let sent = 0;
const dsn = parseDsn(import.meta.env.VITE_SENTRY_DSN);

export function isErrorReportingEnabled(): boolean {
  return dsn !== null;
}

export function reportError(error: unknown, source: string): void {
  if (!dsn || sent >= MAX_EVENTS) return;
  sent += 1;
  const event = buildEvent(error, { source, path: window.location.pathname });
  void fetch(`${dsn.endpoint}?sentry_version=7&sentry_key=${encodeURIComponent(dsn.key)}`, {
    method: 'POST',
    keepalive: true,
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(event),
  }).catch(() => {
    // Kuzatish xizmati ishlamasa — foydalanuvchiga ta'sir qilmaydi
  });
}

/** Global ushlanmagan xatolar (bir marta, `main.tsx` dan) */
export function installGlobalErrorReporting(): void {
  if (!dsn) return;
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window.error'));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'unhandledrejection'));
}
