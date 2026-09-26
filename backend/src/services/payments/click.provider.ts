import { env, primaryClientUrl } from '../../config/env.js';
import { md5Hex, safeEquals, sha1Hex } from './provider.js';
import type { ProtocolProvider, ProviderRequest, ProviderResponse } from './provider.js';
import { TX_STATE, providerTransactions } from './providerTransactions.js';

/**
 * Click SHOP API (Prepare → Complete) — TZ 3.1 GAP-17.
 *
 * Click `POST /api/payments/webhook/click` ga `application/x-www-form-urlencoded` yuboradi: `action=0` — Prepare
 * (buyurtma va summani tekshirish), `action=1` — Complete (to'lov o'tdi yoki `error<0` — bekor). Har javob HTTP 200,
 * natija — `error` kodida. Imzo (`sign_string`) — MD5:
 *
 *   Prepare:  md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 *   Complete: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 *
 * `merchant_trans_id` — CRM to'lov so'rovi (intent) id; `merchant_prepare_id` / `merchant_confirm_id` — bizdagi
 * tranzaksiyaning butun son raqami. Summa — so'm. Kalitlarsiz o'chiq (503).
 */

export const CLICK_ERRORS = {
  SUCCESS: 0,
  SIGN_FAILED: -1,
  WRONG_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TX_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  BAD_REQUEST: -8,
  CANCELLED: -9,
} as const;

const NOTES: Record<number, string> = {
  [CLICK_ERRORS.SUCCESS]: 'Success',
  [CLICK_ERRORS.SIGN_FAILED]: 'SIGN CHECK FAILED!',
  [CLICK_ERRORS.WRONG_AMOUNT]: 'Incorrect parameter amount',
  [CLICK_ERRORS.ACTION_NOT_FOUND]: 'Action not found',
  [CLICK_ERRORS.ALREADY_PAID]: 'Already paid',
  [CLICK_ERRORS.ORDER_NOT_FOUND]: 'User does not exist',
  [CLICK_ERRORS.TX_NOT_FOUND]: 'Transaction does not exist',
  [CLICK_ERRORS.UPDATE_FAILED]: 'Failed to update user',
  [CLICK_ERRORS.BAD_REQUEST]: 'Error in request from click',
  [CLICK_ERRORS.CANCELLED]: 'Transaction cancelled',
};

const REQUIRED = ['click_trans_id', 'service_id', 'click_paydoc_id', 'merchant_trans_id', 'amount', 'action', 'error', 'sign_time', 'sign_string'] as const;

type ClickParams = Record<(typeof REQUIRED)[number], string> & { merchant_prepare_id?: string; error_note?: string };

function respond(params: Partial<ClickParams>, error: number, extra: Record<string, unknown> = {}, result?: ProviderResponse['result']): ProviderResponse {
  return {
    status: 200,
    result: result ?? (error === CLICK_ERRORS.SUCCESS ? 'ok' : error === CLICK_ERRORS.ALREADY_PAID ? 'duplicate' : error === CLICK_ERRORS.SIGN_FAILED ? 'unauthorized' : 'rejected'),
    body: {
      click_trans_id: params.click_trans_id ? Number(params.click_trans_id) : null,
      merchant_trans_id: params.merchant_trans_id ?? null,
      ...extra,
      error,
      error_note: NOTES[error],
    },
  };
}

/** Form qiymatlari satr — imzo aynan kelgan satrlardan hisoblanadi */
function readParams(body: unknown): ClickParams | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of [...REQUIRED, 'merchant_prepare_id', 'error_note']) {
    const value = data[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
  }
  return REQUIRED.every((key) => out[key] !== undefined && out[key] !== '') ? (out as ClickParams) : null;
}

export function clickSignature(params: ClickParams, secret: string): string {
  const prepareId = params.action === '1' ? (params.merchant_prepare_id ?? '') : '';
  return md5Hex(`${params.click_trans_id}${params.service_id}${secret}${params.merchant_trans_id}${prepareId}${params.amount}${params.action}${params.sign_time}`);
}

function amountMatches(sent: string, expected: number): boolean {
  const value = Number(sent);
  return Number.isFinite(value) && Math.abs(value - expected) < 0.01;
}

async function prepare(params: ClickParams): Promise<ProviderResponse> {
  const existing = await providerTransactions.find('CLICK', params.click_trans_id);
  if (existing) {
    // Takroriy Prepare — o'sha javob
    if (existing.intentId !== params.merchant_trans_id) return respond(params, CLICK_ERRORS.TX_NOT_FOUND);
    if (existing.state === TX_STATE.CANCELLED) return respond(params, CLICK_ERRORS.CANCELLED);
    if (existing.state === TX_STATE.PERFORMED) return respond(params, CLICK_ERRORS.ALREADY_PAID);
    return respond(params, CLICK_ERRORS.SUCCESS, { merchant_prepare_id: existing.number }, 'duplicate');
  }
  const check = await providerTransactions.payableIntent('CLICK', params.merchant_trans_id);
  if (!check.ok) {
    if (check.reason === 'not_found') return respond(params, CLICK_ERRORS.ORDER_NOT_FOUND);
    if (check.reason === 'paid') return respond(params, CLICK_ERRORS.ALREADY_PAID);
    if (check.reason === 'busy') return respond(params, CLICK_ERRORS.UPDATE_FAILED);
    return respond(params, CLICK_ERRORS.CANCELLED);
  }
  if (!amountMatches(params.amount, check.intent.amount)) return respond(params, CLICK_ERRORS.WRONG_AMOUNT);
  const { tx } = await providerTransactions.create({
    provider: 'CLICK',
    providerTxId: params.click_trans_id,
    providerRef: params.click_paydoc_id,
    intentId: check.intent.id,
    amount: check.intent.amount,
  });
  return respond(params, CLICK_ERRORS.SUCCESS, { merchant_prepare_id: tx.number });
}

async function complete(params: ClickParams, request: ProviderRequest): Promise<ProviderResponse> {
  const tx = await providerTransactions.find('CLICK', params.click_trans_id);
  if (!tx || String(tx.number) !== params.merchant_prepare_id || tx.intentId !== params.merchant_trans_id) return respond(params, CLICK_ERRORS.TX_NOT_FOUND);
  if (tx.state === TX_STATE.PERFORMED) return respond(params, CLICK_ERRORS.ALREADY_PAID, { merchant_confirm_id: tx.number });
  if (tx.state === TX_STATE.CANCELLED || tx.state === TX_STATE.REFUNDED) return respond(params, CLICK_ERRORS.CANCELLED);
  if (!amountMatches(params.amount, tx.amount.toNumber())) return respond(params, CLICK_ERRORS.WRONG_AMOUNT);
  // Click to'lov o'tmaganini bildirdi (error < 0) — tranzaksiya bekor, buyurtma yana to'lanadi
  if (Number(params.error) < 0) {
    await providerTransactions.cancel(tx, null, request.client);
    return respond(params, CLICK_ERRORS.CANCELLED);
  }
  try {
    const done = await providerTransactions.perform(tx, request.client);
    return respond(params, CLICK_ERRORS.SUCCESS, { merchant_confirm_id: done.number });
  } catch {
    // Kvitansiya yozilmadi — Click qayta yuboradi yoki bekor qiladi
    return respond(params, CLICK_ERRORS.UPDATE_FAILED, {}, 'error');
  }
}

export const clickProvider: ProtocolProvider = {
  key: 'CLICK',
  kind: 'protocol',

  isConfigured: () => Boolean(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY),
  mode: () => env.CLICK_MODE,

  /** `https://my.click.uz/services/pay?service_id=…&merchant_id=…&amount=…&transaction_param=<intent>&return_url=…` */
  checkoutUrl(intent) {
    if (!clickProvider.isConfigured()) return null;
    const query = new URLSearchParams({
      service_id: env.CLICK_SERVICE_ID!,
      merchant_id: env.CLICK_MERCHANT_ID!,
      amount: intent.amount.toFixed(2),
      transaction_param: intent.id,
      return_url: env.PAYMENT_RETURN_URL ?? `${primaryClientUrl}/portal/payments`,
    });
    return `https://my.click.uz/services/pay?${query.toString()}`;
  },

  async handle(request) {
    const params = readParams(request.body);
    if (!params) return respond({}, CLICK_ERRORS.BAD_REQUEST);
    if (params.service_id !== env.CLICK_SERVICE_ID || !safeEquals(params.sign_string.toLowerCase(), clickSignature(params, env.CLICK_SECRET_KEY!))) {
      return respond(params, CLICK_ERRORS.SIGN_FAILED);
    }
    if (params.action === '0') return prepare(params);
    if (params.action === '1') {
      if (!params.merchant_prepare_id) return respond(params, CLICK_ERRORS.BAD_REQUEST);
      return complete(params, request);
    }
    return respond(params, CLICK_ERRORS.ACTION_NOT_FOUND);
  },
};

/**
 * Click Merchant API — bajarilgan to'lovni qaytarish (reversal). `CLICK_MERCHANT_USER_ID` kerak.
 * Sarlavha: `Auth: <merchant_user_id>:<sha1(timestamp + secret)>:<timestamp>`.
 * Faqat kalitlar bilan ishlaydi — kalitlarsiz chaqirilmaydi (soxta "qaytarildi" yo'q).
 */
export async function clickReversal(paydocId: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error: string | null }> {
  if (!env.CLICK_MERCHANT_USER_ID || !env.CLICK_SECRET_KEY || !env.CLICK_SERVICE_ID) return { ok: false, error: 'Click Merchant API sozlanmagan (CLICK_MERCHANT_USER_ID)' };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const auth = `${env.CLICK_MERCHANT_USER_ID}:${sha1Hex(timestamp + env.CLICK_SECRET_KEY)}:${timestamp}`;
  try {
    const response = await fetchImpl(`https://api.click.uz/v2/merchant/payment/reversal/${env.CLICK_SERVICE_ID}/${encodeURIComponent(paydocId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Auth: auth },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { error_code?: number; error_note?: string } | null;
    if (response.ok && body?.error_code === 0) return { ok: true, error: null };
    return { ok: false, error: body?.error_note ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tarmoq xatosi' };
  }
}
