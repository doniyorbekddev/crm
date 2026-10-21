import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Eskiz.uz SMS API mijozi (https://notify.eskiz.uz/api).
 *
 * Kirish: email + parol → token (taxminan 30 kun). Token xotirada saqlanadi; 401 kelsa bir marta qayta kiriladi.
 * Kalitlar faqat env'da — logga, javobga yoki xato matniga chiqmaydi.
 *
 * Muhim (Eskiz talabi): har bir SMS matni kabinetda moderatsiyadan o'tgan shablonga mos bo'lishi kerak,
 * aks holda Eskiz uni rad etadi — bu doimiy xato (qayta urinilmaydi), sababi `lastError` da ko'rinadi.
 */

const REQUEST_TIMEOUT_MS = 10_000;
/** Token muddati ~30 kun; xavfsizlik uchun 20 kundan keyin yangisi olinadi */
const TOKEN_TTL_MS = 20 * 24 * 60 * 60 * 1000;
/** Uzun matn ko'p qismli SMS bo'lib, har qismi alohida pul — chegaralaymiz */
export const SMS_MAX_LENGTH = 320;

export interface SmsSendResult {
  ok: boolean;
  /** Tarmoq, 429 va 5xx — vaqtinchalik; 4xx (shablon, raqam, balans) — doimiy */
  retryable: boolean;
  error?: string;
  providerMessageId?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isSmsConfigured(): boolean {
  return Boolean(env.ESKIZ_EMAIL && env.ESKIZ_PASSWORD);
}

/** +998 90 123-45-67 → 998901234567; O'zbekiston mobil raqami bo'lmasa null */
export function normalizeSmsPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const full = digits.length === 9 ? `998${digits}` : digits;
  return /^998\d{9}$/.test(full) ? full : null;
}

/**
 * SMS uchun matn: o'zbekcha tutuq belgilari (‘ ’ ʻ ʼ) va tipografik belgilar oddiy ASCII ga.
 * Sabab: bitta "‘" belgisi butun xabarni UCS-2 ga o'tkazadi — 160 o'rniga 70 belgi/qism, ya'ni 2–3 barobar qimmat.
 */
export function toSmsText(text: string): string {
  const plain = text
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[«»“”„]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > SMS_MAX_LENGTH ? `${plain.slice(0, SMS_MAX_LENGTH - 3)}...` : plain;
}

async function call(path: string, init: { method: 'GET' | 'POST'; body?: FormData; token?: string }): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.ESKIZ_BASE_URL}${path}`, {
      method: init.method,
      headers: init.token ? { Authorization: `Bearer ${init.token}` } : {},
      ...(init.body ? { body: init.body } : {}),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Eskiz xato matni turli maydonlarda keladi: message (satr yoki obyekt), error */
function errorText(status: number, body: Record<string, unknown> | null): string {
  const message = body?.message ?? body?.error;
  const text = typeof message === 'string' ? message : message ? JSON.stringify(message) : `HTTP ${status}`;
  return `Eskiz: ${text}`.slice(0, 500);
}

async function login(): Promise<string> {
  const form = new FormData();
  form.set('email', env.ESKIZ_EMAIL ?? '');
  form.set('password', env.ESKIZ_PASSWORD ?? '');
  const { status, body } = await call('/auth/login', { method: 'POST', body: form });
  const token = (body?.data as { token?: unknown } | undefined)?.token;
  if (status !== 200 || typeof token !== 'string' || token.length === 0) {
    // Parol/email noto'g'ri — matnda kalitlar yo'q, faqat holat
    throw new EskizAuthError(status === 401 ? 'Eskiz: email yoki parol noto‘g‘ri' : errorText(status, body));
  }
  cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

class EskizAuthError extends Error {}

async function tokenOf(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return login();
}

/** Token bilan so'rov; 401 bo'lsa token yangilanib bir marta qayta yuboriladi */
async function authorized(path: string, init: { method: 'GET' | 'POST'; form?: () => FormData }) {
  let token = await tokenOf();
  let result = await call(path, { method: init.method, token, ...(init.form ? { body: init.form() } : {}) });
  if (result.status === 401) {
    cachedToken = null;
    token = await login();
    result = await call(path, { method: init.method, token, ...(init.form ? { body: init.form() } : {}) });
  }
  return result;
}

export const eskizService = {
  async send(phone: string, message: string): Promise<SmsSendResult> {
    if (!isSmsConfigured()) return { ok: false, retryable: false, error: 'SMS sozlanmagan (ESKIZ_EMAIL/ESKIZ_PASSWORD)' };
    try {
      const { status, body } = await authorized('/message/sms/send', {
        method: 'POST',
        form: () => {
          const form = new FormData();
          form.set('mobile_phone', phone);
          form.set('message', message);
          form.set('from', env.ESKIZ_FROM);
          return form;
        },
      });
      const id = body?.id;
      if (status >= 200 && status < 300 && (typeof id === 'string' || typeof id === 'number')) {
        return { ok: true, retryable: false, providerMessageId: String(id) };
      }
      return { ok: false, retryable: status === 429 || status >= 500, error: errorText(status, body) };
    } catch (error) {
      if (error instanceof EskizAuthError) return { ok: false, retryable: false, error: error.message };
      logger.warn({ err: error instanceof Error ? error.message : error }, 'Eskiz API ga ulanib bo‘lmadi');
      return { ok: false, retryable: true, error: 'Eskiz: tarmoq xatosi yoki vaqt tugadi' };
    }
  },

  /** Hisobdagi qoldiq (so'm); olinmasa — null (sahifa buzilmasin) */
  async balance(): Promise<number | null> {
    if (!isSmsConfigured()) return null;
    try {
      const { status, body } = await authorized('/user/get-limit', { method: 'GET' });
      const balance = (body?.data as { balance?: unknown } | undefined)?.balance;
      return status === 200 && (typeof balance === 'number' || typeof balance === 'string') && Number.isFinite(Number(balance)) ? Number(balance) : null;
    } catch {
      return null;
    }
  },

  /** Testlar uchun: token keshini tozalash */
  resetForTests(): void {
    cachedToken = null;
  },
};
