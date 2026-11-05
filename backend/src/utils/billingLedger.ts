/**
 * Oylik majburiyatlar hisobi (sof funksiyalar) — to'lov jadvali, qarzdorlar, o'quvchi qarz tarixi va oylik hisobot
 * shu qoidadan foydalanadi (SQL varianti: `services/billingLedger.service.ts` → `installmentPositions`).
 *
 * Qoida:
 *  1. Oy = qism muddati (`dueDate`, o'quv markaz sanasi) oyi. Bekor qilingan qism hisobga kirmaydi.
 *  2. Oyga aniq biriktirilgan summa (`payment_allocations`, qaytarishlar manfiy) shu oy qismlariga muddat tartibida tushadi.
 *  3. Qolgan pul (jami to'langan − qo'llangan biriktirishlar; deploydan oldingi to'lovlar) qolgan qismlarga
 *     muddat tartibida (FIFO) tushadi — biriktirish bo'lmasa natija avvalgi hisob bilan aynan bir xil.
 */

export interface LedgerRow {
  id: string;
  sequence: number;
  /** YYYY-MM-DD */
  dueDate: string;
  amount: number;
  cancelled: boolean;
}

export interface DistributedRow<T extends LedgerRow> {
  row: T;
  /** Shu oyga aniq biriktirilgan to'lovdan */
  explicitPaid: number;
  /** Biriktirilmagan puldan (FIFO) */
  poolPaid: number;
  paid: number;
  remaining: number;
}

export function periodKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "2026-10-15" → "2026-10" */
export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

export function parsePeriodKey(key: string): { year: number; month: number } {
  const [year = 0, month = 1] = key.split('-').map(Number);
  return { year, month };
}

const byDue = <T extends LedgerRow>(a: T, b: T) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence;

/**
 * To'langan summani qismlarga taqsimlaydi. `explicitByMonth` — oy kaliti ("2026-10") → aniq biriktirilgan sof summa.
 * Oy qismlaridan ortgan biriktirish (oy summasi keyin kamaygan bo'lsa) umumiy FIFO ga qaytadi.
 */
export function distributePaid<T extends LedgerRow>(
  rows: T[],
  paidTotal: number,
  explicitByMonth: ReadonlyMap<string, number> = new Map(),
): { rows: Array<DistributedRow<T>>; pool: number; explicitApplied: number } {
  const active = rows.filter((row) => !row.cancelled).sort(byDue);
  const explicitLeft = new Map<string, number>();
  for (const [key, value] of explicitByMonth) explicitLeft.set(key, Math.max(value, 0));

  let explicitApplied = 0;
  const staged = active.map((row) => {
    const key = monthOfDate(row.dueDate);
    const available = explicitLeft.get(key) ?? 0;
    const explicitPaid = Math.min(row.amount, available);
    explicitLeft.set(key, available - explicitPaid);
    explicitApplied += explicitPaid;
    return { row, explicitPaid };
  });

  const pool = Math.max(paidTotal - explicitApplied, 0);
  let left = pool;
  const distributed = staged.map(({ row, explicitPaid }) => {
    const poolPaid = Math.min(row.amount - explicitPaid, left);
    left -= poolPaid;
    const paid = explicitPaid + poolPaid;
    return { row, explicitPaid, poolPaid, paid, remaining: Math.max(row.amount - paid, 0) };
  });
  return { rows: distributed, pool, explicitApplied };
}

// ---------------------------------------------------------------------------------------------
// To'liq o'quvchi hisobi (tarix va hisobotlar uchun): biriktirishlar, to'lovlar va qaytarishlar "T sanadagi holat" bilan
// ---------------------------------------------------------------------------------------------

export type ChargeStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface LedgerInstallmentInput extends LedgerRow {
  note: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface LedgerPaymentInput {
  id: string;
  number: number;
  amount: number;
  paidAt: Date;
  deletedAt: Date | null;
}

export interface LedgerRefundInput {
  id: string;
  paymentId: string;
  amount: number;
  refundedAt: Date;
}

export interface LedgerAllocationInput {
  paymentId: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  refundId: string | null;
  effectiveAt: Date;
  voidedAt: Date | null;
}

export interface LedgerMonth {
  key: string;
  year: number;
  month: number;
  /** Hisoblangan (bekor qilinmagan qismlar) */
  charge: number;
  cancelledAmount: number;
  paid: number;
  remaining: number;
  firstDueDate: string;
  status: ChargeStatus;
  /** Oy to'liq yopilgan to'lov sanasi (oxirgi hissa) — yopilmagan bo'lsa null */
  closedAt: string | null;
}

export interface LedgerContribution {
  paymentId: string;
  periodKey: string;
  amount: number;
  /** true — operator/server biriktirgan; false — biriktirilmagan puldan muddat tartibida */
  explicit: boolean;
}

export interface StudentLedger {
  installments: Array<DistributedRow<LedgerInstallmentInput>>;
  months: LedgerMonth[];
  paidTotal: number;
  /** Biriktirilmagan pul (FIFO bilan tushgan) */
  pool: number;
  contributions: LedgerContribution[];
}

const effectiveAt = (asOf: Date | null) => (date: Date) => asOf === null || date.getTime() <= asOf.getTime();
const stillValid = (asOf: Date | null) => (date: Date | null) => date === null || (asOf !== null && date.getTime() > asOf.getTime());

export function chargeStatus(charge: number, paid: number, cancelledAmount: number): ChargeStatus {
  if (charge <= 0) return cancelledAmount > 0 ? 'CANCELLED' : 'PAID';
  if (paid >= charge) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

/** O'quvchining T sanadagi (`asOf = null` — hozirgi) oylik hisobi */
export function computeStudentLedger(input: {
  installments: LedgerInstallmentInput[];
  payments: LedgerPaymentInput[];
  refunds: LedgerRefundInput[];
  allocations: LedgerAllocationInput[];
  asOf?: Date | null;
}): StudentLedger {
  const asOf = input.asOf ?? null;
  const happened = effectiveAt(asOf);
  const notYet = stillValid(asOf);

  const payments = input.payments.filter((payment) => happened(payment.paidAt) && notYet(payment.deletedAt));
  const livePayments = new Map(payments.map((payment) => [payment.id, payment]));
  const refunds = input.refunds.filter((refund) => livePayments.has(refund.paymentId) && happened(refund.refundedAt));
  const allocations = input.allocations.filter(
    (row) => livePayments.has(row.paymentId) && happened(row.effectiveAt) && notYet(row.voidedAt),
  );
  const installments = input.installments.map((row) => ({ ...row, cancelled: row.cancelledAt !== null && happened(row.cancelledAt) }));

  const refundedBy = new Map<string, number>();
  for (const refund of refunds) refundedBy.set(refund.paymentId, (refundedBy.get(refund.paymentId) ?? 0) + refund.amount);
  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0) - refunds.reduce((sum, refund) => sum + refund.amount, 0);

  const explicitByMonth = new Map<string, number>();
  const explicitByPayment = new Map<string, Map<string, number>>();
  for (const row of allocations) {
    const key = periodKeyOf(row.periodYear, row.periodMonth);
    explicitByMonth.set(key, (explicitByMonth.get(key) ?? 0) + row.amount);
    const perPayment = explicitByPayment.get(row.paymentId) ?? new Map<string, number>();
    perPayment.set(key, (perPayment.get(key) ?? 0) + row.amount);
    explicitByPayment.set(row.paymentId, perPayment);
  }

  const { rows, pool } = distributePaid(installments, paidTotal, explicitByMonth);

  // Hissalar: aniq biriktirishlar + biriktirilmagan pul (to'lov sanasi tartibida) FIFO qismlarga
  const contributions: LedgerContribution[] = [];
  const poolQueue: Array<{ paymentId: string; left: number }> = [];
  for (const payment of [...payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.number - b.number)) {
    const net = payment.amount - (refundedBy.get(payment.id) ?? 0);
    const explicit = explicitByPayment.get(payment.id);
    let explicitNet = 0;
    for (const [key, amount] of explicit ?? []) {
      if (amount > 0) contributions.push({ paymentId: payment.id, periodKey: key, amount, explicit: true });
      explicitNet += amount;
    }
    const unallocated = net - explicitNet;
    if (unallocated > 0) poolQueue.push({ paymentId: payment.id, left: unallocated });
  }
  const poolByMonth = new Map<string, Array<{ paymentId: string; amount: number }>>();
  let cursor = 0;
  for (const item of rows) {
    let need = item.poolPaid;
    const key = monthOfDate(item.row.dueDate);
    while (need > 0 && cursor < poolQueue.length) {
      const source = poolQueue[cursor]!;
      const take = Math.min(need, source.left);
      source.left -= take;
      need -= take;
      if (take > 0) {
        const list = poolByMonth.get(key) ?? [];
        const last = list[list.length - 1];
        if (last && last.paymentId === source.paymentId) last.amount += take;
        else list.push({ paymentId: source.paymentId, amount: take });
        poolByMonth.set(key, list);
      }
      if (source.left <= 0) cursor += 1;
    }
  }
  for (const [key, list] of poolByMonth) {
    for (const item of list) contributions.push({ paymentId: item.paymentId, periodKey: key, amount: item.amount, explicit: false });
  }

  const paidAtOf = new Map(payments.map((payment) => [payment.id, payment.paidAt]));
  const monthMap = new Map<string, LedgerMonth>();
  for (const row of installments) {
    const key = monthOfDate(row.dueDate);
    const { year, month } = parsePeriodKey(key);
    const entry = monthMap.get(key) ?? {
      key,
      year,
      month,
      charge: 0,
      cancelledAmount: 0,
      paid: 0,
      remaining: 0,
      firstDueDate: row.dueDate,
      status: 'UNPAID' as ChargeStatus,
      closedAt: null,
    };
    if (row.dueDate < entry.firstDueDate) entry.firstDueDate = row.dueDate;
    if (row.cancelled) entry.cancelledAmount += row.amount;
    else entry.charge += row.amount;
    monthMap.set(key, entry);
  }
  for (const item of rows) {
    const entry = monthMap.get(monthOfDate(item.row.dueDate))!;
    entry.paid += item.paid;
    entry.remaining += item.remaining;
  }
  const months = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const entry of months) {
    entry.status = chargeStatus(entry.charge, entry.paid, entry.cancelledAmount);
    if (entry.status === 'PAID' && entry.charge > 0) {
      const dates = contributions
        .filter((item) => item.periodKey === entry.key)
        .map((item) => paidAtOf.get(item.paymentId))
        .filter((date): date is Date => date !== undefined);
      entry.closedAt = dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null;
    }
  }

  return { installments: rows, months, paidTotal, pool, contributions };
}

/**
 * Yangi to'lovni oylarga avtomatik biriktirish: eng eski ochiq oydan boshlab (oldindan to'lov — keyingi oylarga).
 * Sig'imdan ortgani biriktirilmaydi (jadval shartnomadan kam bo'lsa) — u umumiy FIFO ga tushadi.
 */
export function autoAllocate(capacity: Array<{ key: string; remaining: number }>, amount: number): Array<{ key: string; amount: number }> {
  let left = amount;
  const result: Array<{ key: string; amount: number }> = [];
  for (const item of [...capacity].sort((a, b) => a.key.localeCompare(b.key))) {
    if (left <= 0) break;
    const take = Math.min(item.remaining, left);
    if (take > 0) {
      result.push({ key: item.key, amount: take });
      left -= take;
    }
  }
  return result;
}
