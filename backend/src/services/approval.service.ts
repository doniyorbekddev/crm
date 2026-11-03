import type { ApprovalStatus, ApprovalType, Prisma } from '../generated/prisma/client.js';

/**
 * Umumiy tasdiq so'rovi (CRM 4.0, 2-faza). Birinchi tur — xarajat tasdig'i.
 *
 * Holatning egasi avvalgidek asl obyekt (`expenses.status`) — bu yozuv uning **ko'zgusi**: "Ishlarim"
 * markazi barcha tasdiqlarni bitta ro'yxatda ko'rsatishi uchun. Shu sababli ochish ham, yopish ham
 * faqat asl holat o'zgargan tranzaksiyaning ichida chaqiriladi — ikkalasi bir-biridan ajralib qolmaydi.
 */
type Tx = Prisma.TransactionClient;

export const EXPENSE_APPROVAL_LINK = '/expenses';

export async function openExpenseApproval(
  tx: Tx,
  expense: { id: string; number: number; amount: number; categoryName: string; description: string | null; branchId?: string | null },
  requestedById: string | null,
): Promise<void> {
  const title = `Xarajat #${expense.number} · ${expense.categoryName}${expense.description ? ` — ${expense.description}` : ''}`.slice(0, 200);
  await tx.approvalRequest.upsert({
    where: { entityType_entityId: { entityType: 'expense', entityId: expense.id } },
    // Rad etilgan xarajat qayta tasdiqqa yuborilsa — o'sha qator qayta ochiladi
    update: { status: 'PENDING', title, amount: expense.amount, decidedById: null, decidedAt: null, reason: null, requestedById },
    create: {
      type: 'EXPENSE',
      entityType: 'expense',
      entityId: expense.id,
      title,
      amount: expense.amount,
      link: EXPENSE_APPROVAL_LINK,
      branchId: expense.branchId ?? null,
      requestedById,
    },
  });
}

/** Umumiy tasdiq ko'zgusi (chegirma va keyingi turlar) — asl so'rov yaratilgan tranzaksiyada chaqiriladi */
export async function openApproval(
  tx: Tx,
  input: { type: ApprovalType; entityType: string; entityId: string; title: string; amount: number | null; link: string; branchId: string | null },
  requestedById: string | null,
): Promise<void> {
  const title = input.title.slice(0, 200);
  await tx.approvalRequest.upsert({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
    update: { status: 'PENDING', title, amount: input.amount, decidedById: null, decidedAt: null, reason: null, requestedById },
    create: { type: input.type, entityType: input.entityType, entityId: input.entityId, title, amount: input.amount, link: input.link, branchId: input.branchId, requestedById },
  });
}

/** Kutilayotgan so'rovni yopadi. So'rov yo'q yoki allaqachon yopilgan bo'lsa — hech narsa qilmaydi */
export async function closeApproval(
  tx: Tx,
  target: { entityType: string; entityId: string },
  decision: { status: Exclude<ApprovalStatus, 'PENDING'>; decidedById: string | null; reason?: string | null },
): Promise<void> {
  await tx.approvalRequest.updateMany({
    where: { entityType: target.entityType, entityId: target.entityId, status: 'PENDING' },
    data: { status: decision.status, decidedById: decision.decidedById, decidedAt: new Date(), reason: decision.reason ?? null },
  });
}
