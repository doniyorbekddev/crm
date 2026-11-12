/**
 * Oylik to'lov modeliga o'tkazish rejasi (2026-11 tuzatishi). Ilgari jadval shartnoma summasini kurs oylariga
 * bo'lardi (600 000 / 12 = 50 000), vaholanki shartnomaga **oylik** to'lov yozilgan. Yangi model: har oyga to'liq
 * oylik to'lov, shartnoma jami = oylar yig'indisi.
 *
 * Sof funksiya (bazaga tegmaydi, import yo'q):
 *  - hisob boshlanishidan oldingi oylar bekor qilinadi;
 *  - qolgan har oy (bitta qismli) summasi oylik to'lovga tenglanadi; yopilgan oylar va bir oyda bir nechta qism
 *    bo'lsa — tegilmaydi (qo'lda ko'rish uchun qaytariladi);
 *  - to'lovlar sanasi tartibida eng eski ochiq oydan qayta taqsimlanadi (sof summa = to'lov − qaytarishlar).
 */

export interface MigrationInstallment {
  id: string;
  dueDate: string;
  amount: number;
  cancelled: boolean;
}

export interface MigrationPayment {
  id: string;
  paidAt: string;
  /** To'lov summasi − qaytarishlar */
  net: number;
}

export interface MonthlyFeeMigrationInput {
  monthly: number;
  installments: MigrationInstallment[];
  payments: MigrationPayment[];
  closedMonths: ReadonlySet<string>;
  startMonth: string;
  /** Muzlatilgan o'quvchi: shu sanadan (YYYY-MM-DD) keyingi muddatli, to'lov tushmagan oylar yozilmaydi */
  frozenFrom?: string | null;
}

export interface MonthlyFeeMigrationPlan {
  /** Bekor qilinadigan qismlar (hisob boshlanishidan oldin) */
  cancel: Array<{ id: string; key: string; amount: number }>;
  /** Muzlatilgan davr — bekor qilinadigan oylar (to'lov tushmagan) */
  freeze: Array<{ id: string; key: string; amount: number }>;
  /** Summasi oylik to'lovga tenglanadigan qismlar */
  reprice: Array<{ id: string; key: string; from: number; to: number }>;
  /** Bir oyda bir nechta qism yoki yopilgan oy — tegilmadi */
  untouched: string[];
  /** Yangi oy taqsimoti (eski taqsimot bekor qilinadi) */
  allocations: Array<{ paymentId: string; key: string; amount: number }>;
  /** Oylarga sig'magan to'lov qismi (shartnoma jamidan ortiq) */
  unallocated: number;
  totalBefore: number;
  totalAfter: number;
  /** Oy → summa (yangi) */
  charges: Array<{ key: string; amount: number }>;
}

const monthOf = (date: string) => date.slice(0, 7);

export function planMonthlyFeeMigration(input: MonthlyFeeMigrationInput): MonthlyFeeMigrationPlan {
  const active = input.installments.filter((item) => !item.cancelled);
  const totalBefore = active.reduce((sum, item) => sum + item.amount, 0);
  const byMonth = new Map<string, MigrationInstallment[]>();
  for (const item of active) byMonth.set(monthOf(item.dueDate), [...(byMonth.get(monthOf(item.dueDate)) ?? []), item]);

  const cancel: MonthlyFeeMigrationPlan['cancel'] = [];
  const reprice: MonthlyFeeMigrationPlan['reprice'] = [];
  const untouched: string[] = [];
  const charges = new Map<string, number>();

  for (const [key, list] of [...byMonth].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sum = list.reduce((total, item) => total + item.amount, 0);
    if (input.closedMonths.has(key)) {
      untouched.push(key);
      charges.set(key, sum);
      continue;
    }
    if (key < input.startMonth) {
      for (const item of list) cancel.push({ id: item.id, key, amount: item.amount });
      continue;
    }
    if (list.length !== 1 || input.monthly <= 0) {
      untouched.push(key);
      charges.set(key, sum);
      continue;
    }
    const only = list[0]!;
    if (only.amount !== input.monthly) reprice.push({ id: only.id, key, from: only.amount, to: input.monthly });
    charges.set(key, input.monthly);
  }

  const capacity = [...charges].sort((a, b) => a[0].localeCompare(b[0])).map(([key, amount]) => ({ key, left: amount }));
  const allocations: MonthlyFeeMigrationPlan['allocations'] = [];
  let unallocated = 0;
  const firstDue = new Map<string, string>();
  for (const item of active) {
    const key = monthOf(item.dueDate);
    if (!firstDue.has(key) || item.dueDate < firstDue.get(key)!) firstDue.set(key, item.dueDate);
  }
  for (const payment of [...input.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id))) {
    let left = Math.max(payment.net, 0);
    for (const month of capacity) {
      if (left <= 0) break;
      const take = Math.min(month.left, left);
      if (take <= 0) continue;
      allocations.push({ paymentId: payment.id, key: month.key, amount: take });
      month.left -= take;
      left -= take;
    }
    unallocated += left;
  }

  // Muzlatilgan: sanadan keyingi, hech narsa biriktirilmagan (yopilmagan) oylar bekor qilinadi
  const freeze: MonthlyFeeMigrationPlan['freeze'] = [];
  if (input.frozenFrom) {
    const allocatedKeys = new Set(allocations.map((item) => item.key));
    for (const [key] of [...charges]) {
      if (input.closedMonths.has(key) || allocatedKeys.has(key) || (firstDue.get(key) ?? `${key}-01`) < input.frozenFrom) continue;
      for (const item of byMonth.get(key) ?? []) freeze.push({ id: item.id, key, amount: item.amount });
      charges.delete(key);
    }
    freeze.sort((a, b) => a.key.localeCompare(b.key));
  }

  const sorted = [...charges].sort((a, b) => a[0].localeCompare(b[0])).map(([key, amount]) => ({ key, amount }));
  return {
    cancel,
    freeze,
    reprice,
    untouched,
    allocations,
    unallocated,
    totalBefore,
    totalAfter: sorted.reduce((sum, item) => sum + item.amount, 0),
    charges: sorted,
  };
}
