import { MAIN_BRANCH_ID } from '../config/branch.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { permissionService } from './permission.service.js';

/**
 * Filial ko‘rinish doirasi — `leadAccess.ts` bilan bir xil naqsh.
 *
 * `branch.view_all` ruxsati bo‘lgan xodim (Super Admin, Direktor) barcha filiallarni ko‘radi;
 * qolganlar faqat o‘zi biriktirilgan filialni (`User.branchId`) ko‘radi.
 *
 * Filtr **servis qatlamida** qo‘llanadi — controllerga tashlab qo‘yilmaydi, shunda
 * yangi endpoint qo‘shilganda filial izolyatsiyasi unutilmaydi.
 */
export interface BranchAccess {
  /** Barcha filiallarni ko‘ra oladimi */
  canViewAll: boolean;
  /** Xodimning o‘z filiali (yangi yozuvlar shunga biriktiriladi) */
  branchId: string;
  canManage: boolean;
}

export async function getBranchAccess(actor: AuthUser): Promise<BranchAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    canViewAll: permissions.has(PERMISSIONS.BRANCH_VIEW_ALL),
    branchId: actor.branchId || MAIN_BRANCH_ID,
    canManage: permissions.has(PERMISSIONS.BRANCH_MANAGE),
  };
}

/**
 * Ro‘yxat so‘rovlari uchun `where` bo‘lagi: barcha filial ko‘rinsa bo‘sh obyekt,
 * aks holda `{ branchId }`. So‘ralgan filial (`requested`) ko‘rsatilsa, ruxsat tekshiriladi.
 */
export function branchFilter(access: BranchAccess, requested?: string | null): { branchId?: string } {
  if (requested) {
    assertBranchAccess(access, requested);
    return { branchId: requested };
  }
  return access.canViewAll ? {} : { branchId: access.branchId };
}

/** Yangi yozuv qaysi filialga tegishli: so‘ralgani (ruxsat bo‘lsa) yoki xodimning o‘z filiali */
export function resolveBranchId(access: BranchAccess, requested?: string | null): string {
  if (!requested) return access.branchId;
  assertBranchAccess(access, requested);
  return requested;
}

/** Boshqa filial yozuviga tegishga urinish — 403 */
export function assertBranchAccess(access: BranchAccess, branchId: string | null | undefined): void {
  if (access.canViewAll) return;
  if (!branchId || branchId === access.branchId) return;
  throw AppError.forbidden('Bu filial ma’lumotlariga ruxsat yo‘q');
}
