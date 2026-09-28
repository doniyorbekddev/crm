import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { getBranchAccess } from './branchAccess.js';

/**
 * Hisobot va analitika uchun filial doirasi (TZ 3.1, audit S3).
 *
 * `branch.view_all` bo'lgan xodim (Direktor, Super Admin) — barcha filiallar (`branchId: null`); qolganlar (masalan
 * filial admini) — faqat o'z filiali. Ro'yxat sahifalaridagi `branchFilter` bilan bir xil qoida, lekin agregatlar
 * (hisob, yig'indi, guruhlash) uchun: servis funksiyalari oxirgi parametr sifatida `scope` oladi, standart —
 * `ALL_BRANCHES` (mavjud chaqiruvlar va testlar o'zgarmaydi), controller va bot esa aktyordan hisoblab uzatadi.
 *
 * Filial ustuni bor modellar: Student, Lead, Group, Payment, Transaction, Income, Expense, Employee, User, Feedback,
 * Alert, FinancialAccount. Qolganlari — bog'liq model orqali (davomat → o'quvchi, qaytarish → to'lov, …).
 */
export interface BranchScope {
  /** null — barcha filiallar */
  branchId: string | null;
}

export const ALL_BRANCHES: BranchScope = Object.freeze({ branchId: null });

export async function branchScopeOf(actor: AuthUser): Promise<BranchScope> {
  const access = await getBranchAccess(actor);
  return { branchId: access.canViewAll ? null : access.branchId };
}

/** `branchId` ustuni bor model uchun `where` bo'lagi */
export function inBranch(scope: BranchScope): { branchId?: string } {
  return scope.branchId ? { branchId: scope.branchId } : {};
}

/** O'quvchi orqali (davomat, topshiriq, imtihon natijasi, qarz, mastery…) */
export function viaStudent(scope: BranchScope): { student?: { branchId: string } } {
  return scope.branchId ? { student: { branchId: scope.branchId } } : {};
}

/** Guruh orqali (vazifa, imtihon, dars seansi…) */
export function viaGroup(scope: BranchScope): { group?: { branchId: string } } {
  return scope.branchId ? { group: { branchId: scope.branchId } } : {};
}

/** To'lov orqali (qaytarishlar) */
export function viaPayment(scope: BranchScope): { payment?: { branchId: string } } {
  return scope.branchId ? { payment: { branchId: scope.branchId } } : {};
}

/** Xodim (User) orqali — masalan o'qituvchi profili, maosh davri */
export function viaUser(scope: BranchScope): { user?: { branchId: string } } {
  return scope.branchId ? { user: { branchId: scope.branchId } } : {};
}

/**
 * Xom SQL uchun: `AND <ustun> = $branch` (parametrlangan) yoki bo'sh. Ustun nomi faqat kod ichidan beriladi
 * (foydalanuvchi kirishi emas), masalan `Prisma.raw('t."branchId"')`.
 */
export function branchSql(scope: BranchScope, column: Prisma.Sql): Prisma.Sql {
  return scope.branchId ? Prisma.sql` AND ${column} = ${scope.branchId}` : Prisma.empty;
}
