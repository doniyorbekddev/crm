import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';

/**
 * O'quvchining qarz qatorini tranzaksiya oxirigacha qulflaydi (`SELECT … FOR UPDATE`) va qulf ostidagi
 * qiymatlarni qaytaradi.
 *
 * Qarzga ta'sir qiluvchi **har** amal (to'lov, bekor qilish, qaytarish, chegirma, shartnoma narxini
 * tahrirlash, taklif bonusi) shu qulfdan boshlanishi kerak: aks holda biri tranzaksiyadan oldin o'qigan
 * `paidAmount` / `contractPrice` ni ikkinchisi o'zgartirib ulguradi va qarz eskirgan qiymat bilan yoziladi.
 * Qulf har doim birinchi olinadi — tartib bir xil bo'lgani uchun o'zaro blokirovka (deadlock) bo'lmaydi.
 *
 * Qarz qatori yo'q bo'lsa `null` (shartnoma balansi ochilmagan o'quvchi).
 */
export async function lockDebt(tx: Prisma.TransactionClient, studentId: string): Promise<{ totalAmount: number; paidAmount: number } | null> {
  const [row] = await tx.$queryRaw<Array<{ totalAmount: unknown; paidAmount: unknown }>>`
    SELECT "totalAmount", "paidAmount" FROM "debts" WHERE "studentId" = ${studentId} FOR UPDATE
  `;
  return row ? { totalAmount: Number(row.totalAmount), paidAmount: Number(row.paidAmount) } : null;
}

/**
 * Shartnoma narxini o'zgartiruvchi amallar uchun (chegirma, tahrirlash, taklif bonusi): qarz qatori va
 * o'quvchi qatori qulflanadi, shunda `contractPrice` / `discountTotal` ham qulf ostida qayta o'qiladi.
 *
 * `FOR NO KEY UPDATE` — oddiy `UPDATE` oladigan qulfning o'zi: to'lov yozuvi qo'shilishidagi tashqi kalit
 * tekshiruvini (`FOR KEY SHARE`) to'smaydi, faqat boshqa o'zgartirishlarni navbatga qo'yadi.
 */
export async function lockStudentContract(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<{ debt: { totalAmount: number; paidAmount: number } | null; contractPrice: number; discountTotal: number }> {
  const debt = await lockDebt(tx, studentId);
  const [row] = await tx.$queryRaw<Array<{ contractPrice: unknown; discountTotal: unknown }>>`
    SELECT "contractPrice", "discountTotal" FROM "students" WHERE "id" = ${studentId} FOR NO KEY UPDATE
  `;
  if (!row) {
    throw AppError.notFound('O‘quvchi topilmadi');
  }
  return { debt, contractPrice: Number(row.contractPrice), discountTotal: Number(row.discountTotal) };
}

/** Amal hisoblangan paytdagi narx va chegirma qulf ostida ham o'shamidi? Yo'q bo'lsa — eskirgan hisob bilan yozilmaydi. */
export function assertContractUnchanged(
  locked: { contractPrice: number; discountTotal: number },
  expected: { contractPrice: number; discountTotal: number },
): void {
  if (locked.contractPrice !== expected.contractPrice || locked.discountTotal !== expected.discountTotal) {
    throw AppError.conflict('O‘quvchining shartnoma ma’lumotlari hozirgina o‘zgardi — sahifani yangilab, qayta urinib ko‘ring');
  }
}
