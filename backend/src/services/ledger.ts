import { Prisma } from '../generated/prisma/client.js';
import type { PaymentMethod, TransactionType } from '../generated/prisma/client.js';

/**
 * Moliyaviy daftar (ledger) yordamchilari.
 *
 * Har bir pul harakati — o‘quvchi to‘lovi, tushum, xarajat, maosh — `Transaction`
 * sifatida yoziladi va hisob (kassa) qoldig‘i shu yerda o‘zgaradi. Shunday qilib
 * balans har doim daftardagi yozuvlarga mos bo‘ladi.
 */

/**
 * Foyda-zarar hisobiga kirmaydigan yozuvlar: kassalar o‘rtasidagi o‘tkazma va
 * boshlang‘ich qoldiq. Ular kassa qoldig‘ini o‘zgartiradi, lekin tushum ham, xarajat ham emas.
 */
export const NON_OPERATING_ENTITY_TYPES = ['transfer', 'opening-balance'] as const;

/**
 * Tushum/xarajat/foyda uchun daftar filtri. `entityType` NULL bo‘lgan yozuvlar ham
 * hisobga olinadi — SQL'da `NOT IN` NULL qatorlarni jimgina tashlab yuborardi.
 */
export const OPERATING_LEDGER_WHERE: Prisma.TransactionWhereInput = {
  status: 'COMPLETED',
  OR: [{ entityType: null }, { entityType: { notIn: [...NON_OPERATING_ENTITY_TYPES] } }],
};

/** `OPERATING_LEDGER_WHERE` ning xom SQL ko‘rinishi — `transactions` jadvali `t` taxallusi bilan */
export const OPERATING_LEDGER_SQL = Prisma.sql`t."status" = 'COMPLETED' AND (t."entityType" IS NULL OR t."entityType" NOT IN (${Prisma.join([...NON_OPERATING_ENTITY_TYPES])}))`;

export interface LedgerEntry {
  type: TransactionType;
  amount: number;
  accountId?: string | null;
  occurredAt?: Date;
  description?: string | null;
  categoryName?: string | null;
  /** Qaysi obyektga tegishli: payment, income, expense, teacherSalaryPayment */
  entityType?: string | null;
  entityId?: string | null;
  createdById?: string | null;
}

/** Pul qaysi tomonga harakatlanadi: tushum +, xarajat − */
export function balanceDelta(type: TransactionType, amount: number): number {
  return type === 'INCOME' || type === 'TRANSFER' ? amount : -amount;
}

/** To‘lov usuliga mos kassa (Click to‘lovi Click hisobiga tushadi) */
export async function accountIdForMethod(
  tx: Prisma.TransactionClient,
  method: PaymentMethod,
): Promise<string | null> {
  const account =
    (await tx.financialAccount.findFirst({ where: { key: method, isActive: true }, select: { id: true } })) ??
    (await tx.financialAccount.findFirst({ where: { key: 'CASH', isActive: true }, select: { id: true } }));
  return account?.id ?? null;
}

/** Daftarga yozuv qo‘shadi va hisob qoldig‘ini yangilaydi */
export async function recordTransaction(
  tx: Prisma.TransactionClient,
  entry: LedgerEntry,
): Promise<{ id: string; number: number }> {
  const transaction = await tx.transaction.create({
    data: {
      type: entry.type,
      amount: entry.amount,
      accountId: entry.accountId ?? null,
      occurredAt: entry.occurredAt ?? new Date(),
      description: entry.description ?? null,
      categoryName: entry.categoryName ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      createdById: entry.createdById ?? null,
    },
    select: { id: true, number: true },
  });

  if (entry.accountId) {
    await tx.financialAccount.update({
      where: { id: entry.accountId },
      data: { balance: { increment: balanceDelta(entry.type, entry.amount) } },
    });
  }

  return transaction;
}

/**
 * Yozuvni bekor qiladi: o‘chirilmaydi — VOID holatiga o‘tadi va hisob qoldig‘i
 * qaytariladi. Allaqachon bekor qilingan yozuv qayta bekor qilinmaydi.
 */
export async function voidTransaction(
  tx: Prisma.TransactionClient,
  transactionId: string,
  options: { userId: string | null; reason: string },
): Promise<boolean> {
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, type: true, amount: true, accountId: true, status: true },
  });
  if (!transaction || transaction.status !== 'COMPLETED') return false;

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      status: 'VOID',
      voidedAt: new Date(),
      voidedById: options.userId,
      voidReason: options.reason.slice(0, 255),
    },
  });

  if (transaction.accountId) {
    await tx.financialAccount.update({
      where: { id: transaction.accountId },
      data: { balance: { increment: -balanceDelta(transaction.type, transaction.amount.toNumber()) } },
    });
  }

  return true;
}
