import { env, primaryClientUrl } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { safeEquals } from './provider.js';
import type { ProtocolProvider, ProviderRequest, ProviderResponse } from './provider.js';
import { TX_STATE, providerTransactions, type ProviderTx } from './providerTransactions.js';

/**
 * Payme Merchant API (JSON-RPC 2.0) — TZ 3.1 GAP-17.
 *
 * Payme bizning `POST /api/payments/webhook/payme` ga `{ method, params, id }` yuboradi; har javob **HTTP 200**,
 * xato — `error.code` bilan. Avtorizatsiya: `Authorization: Basic base64("Paycom:<PAYME_KEY>")`.
 * Summalar **tiyin** (1 so'm = 100 tiyin). Buyurtma — `account.<PAYME_ACCOUNT_FIELD>` = CRM to'lov so'rovi (intent) id.
 *
 * Kalitlarsiz provayder o'chiq (503). `PAYME_MODE=test` — sinov kassasi (checkout.test.paycom.uz), UI'da "sinov".
 */

/** Bajarilmagan tranzaksiya 12 soatdan keyin eskiradi (Payme talabi) */
export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export const PAYME_ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  SYSTEM: -32400,
  UNAUTHORIZED: -32504,
  WRONG_AMOUNT: -31001,
  TX_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  ORDER_NOT_FOUND: -31050,
  ORDER_UNAVAILABLE: -31051,
} as const;

const MESSAGES: Record<number, { uz: string; ru: string; en: string }> = {
  [PAYME_ERRORS.PARSE]: { uz: 'So‘rovni o‘qib bo‘lmadi', ru: 'Ошибка разбора запроса', en: 'Parse error' },
  [PAYME_ERRORS.INVALID_REQUEST]: { uz: 'So‘rov noto‘g‘ri', ru: 'Неверный запрос', en: 'Invalid request' },
  [PAYME_ERRORS.METHOD_NOT_FOUND]: { uz: 'Metod topilmadi', ru: 'Метод не найден', en: 'Method not found' },
  [PAYME_ERRORS.SYSTEM]: { uz: 'Tizim xatosi', ru: 'Системная ошибка', en: 'System error' },
  [PAYME_ERRORS.UNAUTHORIZED]: { uz: 'Ruxsat yo‘q', ru: 'Недостаточно привилегий', en: 'Insufficient privilege' },
  [PAYME_ERRORS.WRONG_AMOUNT]: { uz: 'Summa noto‘g‘ri', ru: 'Неверная сумма', en: 'Incorrect amount' },
  [PAYME_ERRORS.TX_NOT_FOUND]: { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' },
  [PAYME_ERRORS.CANNOT_CANCEL]: { uz: 'To‘lovni bekor qilib bo‘lmaydi', ru: 'Невозможно отменить транзакцию', en: 'Unable to cancel transaction' },
  [PAYME_ERRORS.CANNOT_PERFORM]: { uz: 'Amalni bajarib bo‘lmaydi', ru: 'Невозможно выполнить операцию', en: 'Unable to perform operation' },
  [PAYME_ERRORS.ORDER_NOT_FOUND]: { uz: 'Buyurtma topilmadi', ru: 'Заказ не найден', en: 'Order not found' },
  [PAYME_ERRORS.ORDER_UNAVAILABLE]: { uz: 'Buyurtmani to‘lab bo‘lmaydi (to‘langan yoki boshqa to‘lov jarayonda)', ru: 'Заказ недоступен для оплаты', en: 'Order is not available for payment' },
};

type RpcId = string | number | null;

class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly data?: string,
  ) {
    super(MESSAGES[code]?.en ?? 'Error');
  }
}

function reply(id: RpcId, result: unknown, outcome: ProviderResponse['result'] = 'ok'): ProviderResponse {
  return { status: 200, result: outcome, body: { jsonrpc: '2.0', id, result } };
}

function fail(id: RpcId, error: PaymeError, outcome: ProviderResponse['result'] = 'rejected'): ProviderResponse {
  return { status: 200, result: outcome, body: { jsonrpc: '2.0', id, error: { code: error.code, message: MESSAGES[error.code], ...(error.data ? { data: error.data } : {}) } } };
}

function authorized(header: string | undefined): boolean {
  const key = env.PAYME_KEY;
  if (!key || !header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return decoded.slice(0, separator) === 'Paycom' && safeEquals(decoded.slice(separator + 1), key);
}

const toTiyin = (som: number) => Math.round(som * 100);

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new PaymeError(PAYME_ERRORS.INVALID_REQUEST, field);
  return value;
}

function requireAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new PaymeError(PAYME_ERRORS.WRONG_AMOUNT, 'amount');
  return value;
}

function accountOrderId(params: Record<string, unknown>): string {
  const account = params.account as Record<string, unknown> | undefined;
  const value = account?.[env.PAYME_ACCOUNT_FIELD];
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new PaymeError(PAYME_ERRORS.ORDER_NOT_FOUND, env.PAYME_ACCOUNT_FIELD);
  return value;
}

/** Buyurtma va summa tekshiruvi (CheckPerform va Create uchun umumiy) */
async function checkOrder(orderId: string, tiyin: number, ignoreTxId?: string) {
  const check = await providerTransactions.payableIntent('PAYME', orderId, ignoreTxId ? { ignoreTxId } : {});
  if (!check.ok) {
    throw new PaymeError(check.reason === 'not_found' ? PAYME_ERRORS.ORDER_NOT_FOUND : PAYME_ERRORS.ORDER_UNAVAILABLE, env.PAYME_ACCOUNT_FIELD);
  }
  if (toTiyin(check.intent.amount) !== tiyin) throw new PaymeError(PAYME_ERRORS.WRONG_AMOUNT, 'amount');
  return check.intent;
}

/** Fiskal chek ma'lumoti — MXIK va o'lchov kodi sozlangan bo'lsa (bo'lmasa `detail` yuborilmaydi) */
function fiscalDetail(tiyin: number) {
  if (!env.PAYME_FISCAL_MXIK || !env.PAYME_FISCAL_PACKAGE_CODE) return undefined;
  return {
    receipt_type: 0,
    items: [{ title: 'O‘quv kursi uchun to‘lov', price: tiyin, count: 1, code: env.PAYME_FISCAL_MXIK, package_code: env.PAYME_FISCAL_PACKAGE_CODE, vat_percent: 0 }],
  };
}

const ms = (value: Date | null) => (value ? value.getTime() : 0);

function isExpired(tx: ProviderTx, now = Date.now()): boolean {
  const created = tx.providerTime === null ? tx.createdAt.getTime() : Number(tx.providerTime);
  return now - created > PAYME_TIMEOUT_MS;
}

async function expire(tx: ProviderTx, client: ClientInfo): Promise<never> {
  // Payme: 12 soatdan eski bajarilmagan tranzaksiya sabab 4 bilan bekor qilinadi
  await providerTransactions.cancel(tx, 4, client);
  throw new PaymeError(PAYME_ERRORS.CANNOT_PERFORM, 'timeout');
}

async function findTx(params: Record<string, unknown>): Promise<ProviderTx> {
  const tx = await providerTransactions.find('PAYME', requireString(params.id, 'id'));
  if (!tx) throw new PaymeError(PAYME_ERRORS.TX_NOT_FOUND, 'id');
  return tx;
}

const METHODS: Record<string, (params: Record<string, unknown>, client: ClientInfo) => Promise<unknown>> = {
  async CheckPerformTransaction(params) {
    const tiyin = requireAmount(params.amount);
    await checkOrder(accountOrderId(params), tiyin);
    const detail = fiscalDetail(tiyin);
    return { allow: true, ...(detail ? { detail } : {}) };
  },

  async CreateTransaction(params, client) {
    const providerTxId = requireString(params.id, 'id');
    const time = typeof params.time === 'number' ? params.time : Date.now();
    const tiyin = requireAmount(params.amount);
    const existing = await providerTransactions.find('PAYME', providerTxId);
    if (existing) {
      if (existing.state !== TX_STATE.CREATED) throw new PaymeError(PAYME_ERRORS.CANNOT_PERFORM, 'state');
      if (isExpired(existing)) await expire(existing, client);
      return { create_time: existing.createdAt.getTime(), transaction: String(existing.number), state: existing.state };
    }
    const orderId = accountOrderId(params);
    const intent = await checkOrder(orderId, tiyin);
    const { tx } = await providerTransactions.create({ provider: 'PAYME', providerTxId, intentId: intent.id, amount: intent.amount, providerTime: time });
    return { create_time: tx.createdAt.getTime(), transaction: String(tx.number), state: tx.state };
  },

  async PerformTransaction(params, client) {
    const tx = await findTx(params);
    if (tx.state === TX_STATE.CREATED && isExpired(tx)) await expire(tx, client);
    if (tx.state !== TX_STATE.CREATED && tx.state !== TX_STATE.PERFORMED) throw new PaymeError(PAYME_ERRORS.CANNOT_PERFORM, 'state');
    let done: ProviderTx;
    try {
      done = await providerTransactions.perform(tx, client);
    } catch {
      // Kvitansiya yozilmadi (masalan moliyaviy oy yopiq) — Payme qayta urinadi yoki bekor qiladi
      throw new PaymeError(PAYME_ERRORS.CANNOT_PERFORM, 'receipt');
    }
    return { transaction: String(done.number), perform_time: ms(done.performedAt), state: done.state };
  },

  async CancelTransaction(params, client) {
    const tx = await findTx(params);
    const reason = typeof params.reason === 'number' ? params.reason : null;
    const result = await providerTransactions.cancel(tx, reason, client);
    if ('refused' in result) throw new PaymeError(PAYME_ERRORS.CANNOT_CANCEL, 'refund');
    return { transaction: String(result.tx.number), cancel_time: ms(result.tx.cancelledAt), state: result.tx.state };
  },

  async CheckTransaction(params) {
    const tx = await findTx(params);
    return {
      create_time: tx.createdAt.getTime(),
      perform_time: ms(tx.performedAt),
      cancel_time: ms(tx.cancelledAt),
      transaction: String(tx.number),
      state: tx.state,
      reason: tx.reason,
    };
  },

  async GetStatement(params) {
    const from = typeof params.from === 'number' ? params.from : Number.NaN;
    const to = typeof params.to === 'number' ? params.to : Number.NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new PaymeError(PAYME_ERRORS.INVALID_REQUEST, 'from');
    const rows = await prisma.paymentProviderTransaction.findMany({
      where: { provider: 'PAYME', providerTime: { gte: BigInt(Math.trunc(from)), lte: BigInt(Math.trunc(to)) } },
      orderBy: { providerTime: 'asc' },
      take: 5000,
    });
    return {
      transactions: rows.map((tx) => ({
        id: tx.providerTxId,
        time: Number(tx.providerTime),
        amount: toTiyin(tx.amount.toNumber()),
        account: { [env.PAYME_ACCOUNT_FIELD]: tx.intentId },
        create_time: tx.createdAt.getTime(),
        perform_time: ms(tx.performedAt),
        cancel_time: ms(tx.cancelledAt),
        transaction: String(tx.number),
        state: tx.state,
        reason: tx.reason,
      })),
    };
  },
};

export const paymeProvider: ProtocolProvider = {
  key: 'PAYME',
  kind: 'protocol',

  isConfigured: () => Boolean(env.PAYME_MERCHANT_ID && env.PAYME_KEY),
  mode: () => env.PAYME_MODE,

  /** `https://checkout.paycom.uz/<base64("m=…;ac.order_id=…;a=<tiyin>;c=<qaytish>")>` */
  checkoutUrl(intent) {
    if (!paymeProvider.isConfigured()) return null;
    const returnUrl = env.PAYMENT_RETURN_URL ?? `${primaryClientUrl}/portal/payments`;
    const params = `m=${env.PAYME_MERCHANT_ID};ac.${env.PAYME_ACCOUNT_FIELD}=${intent.id};a=${toTiyin(intent.amount)};c=${returnUrl}`;
    const host = env.PAYME_MODE === 'production' ? 'https://checkout.paycom.uz' : 'https://checkout.test.paycom.uz';
    return `${host}/${Buffer.from(params, 'utf8').toString('base64')}`;
  },

  async handle(request: ProviderRequest): Promise<ProviderResponse> {
    const body = request.body as { method?: unknown; params?: unknown; id?: unknown } | null;
    const id: RpcId = typeof body?.id === 'string' || typeof body?.id === 'number' ? body.id : null;
    if (!authorized(request.headers.authorization)) return fail(id, new PaymeError(PAYME_ERRORS.UNAUTHORIZED), 'unauthorized');
    if (!body || typeof body !== 'object' || typeof body.method !== 'string' || typeof body.params !== 'object' || body.params === null) {
      return fail(id, new PaymeError(PAYME_ERRORS.INVALID_REQUEST));
    }
    const method = METHODS[body.method];
    if (!method) return fail(id, new PaymeError(PAYME_ERRORS.METHOD_NOT_FOUND, body.method));
    try {
      return reply(id, await method(body.params as Record<string, unknown>, request.client));
    } catch (error) {
      if (error instanceof PaymeError) return fail(id, error);
      return fail(id, new PaymeError(PAYME_ERRORS.SYSTEM), 'error');
    }
  },
};
