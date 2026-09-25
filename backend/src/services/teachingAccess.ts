import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { permissionService } from './permission.service.js';

/**
 * O'qituvchi doirasi (teaching scope) — akademik modullar uchun **yagona** egalik qoidasi.
 *
 * Qoida: `group.manage` bo'lmagan xodim (o'qituvchi) faqat **o'zi biriktirilgan guruhlar**
 * bilan ishlaydi; admin va rahbar — hammasi bilan. Uy vazifasi, imtihon, urinishlar, savollar
 * shu moduldan foydalanadi, shuning uchun qoida bir joyda o'zgaradi va hamma joyda amal qiladi.
 *
 * Frontend'dagi yashirin tugma himoya emas — har servis shu tekshiruvni o'zi chaqiradi.
 */
export interface TeachingAccess {
  userId: string;
  /** Barcha guruhlar bilan ishlay oladi (admin, owner) */
  canManageAll: boolean;
  /** O‘qituvchi faqat o‘z guruhlari bilan ishlaydi */
  onlyOwnGroups: boolean;
}

export interface VisibleGroup {
  id: string;
  name: string;
  courseId: string;
  teacherId: string | null;
}

/** Ruxsatlar to'plamidan (allaqachon o'qilgan bo'lsa — qayta so'rovsiz) */
export function teachingAccessFrom(permissions: ReadonlySet<string>, userId: string): TeachingAccess {
  const canManageAll = permissions.has(PERMISSIONS.GROUP_MANAGE);
  return { userId, canManageAll, onlyOwnGroups: !canManageAll };
}

/** O‘qituvchi faqat o‘z guruhlari bilan ishlaydi, admin — hammasi bilan */
export async function getTeachingAccess(actor: AuthUser): Promise<TeachingAccess> {
  return teachingAccessFrom(await permissionService.getRolePermissions(actor.roleId), actor.id);
}

/**
 * **Ro'yxat doirasi** (guruh, o'quvchi, ota-ona, davomat ro'yxatlari va qidiruv): cheklov faqat
 * **o'qituvchiga** — `managePermission` yo'q, lekin davomat belgilay oladi. Buxgalter yoki sotuv
 * menejeri (davomat belgilamaydi) o'quvchilarni to'lov/lead uchun to'liq ko'radi.
 *
 * Akademik amallar (vazifa, imtihon, AI) uchun qat'iyroq {@link getTeachingAccess} ishlatiladi —
 * `group.manage` bo'lmagan har kim faqat o'z guruhlari. Ikki qoida ataylab farqli; ikkalasi shu faylda.
 */
export function isRosterLimited(permissions: ReadonlySet<string>, managePermission: PermissionKey): boolean {
  return !permissions.has(managePermission) && permissions.has(PERMISSIONS.ATTENDANCE_MARK);
}

/**
 * Guruhga bog'liq yozuvlar (`homework`, `exam`) uchun Prisma sharti.
 * Admin uchun bo'sh obyekt — filtr qo'shilmaydi.
 */
export function teachingGroupFilter(access: TeachingAccess): { group: Prisma.GroupWhereInput } | Record<string, never> {
  return access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {};
}

/**
 * Yangi yozuv yaratishda: tanlangan guruh shu xodimga ko'rinadimi.
 * Begona guruh "topilmadi" deb qaytadi — mavjudligi ham oshkor bo'lmaydi.
 */
export async function assertGroupVisible(access: TeachingAccess, groupId: string): Promise<VisibleGroup> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, courseId: true, teacherId: true },
  });
  if (!group || (access.onlyOwnGroups && group.teacherId !== access.userId)) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message: 'Guruh topilmadi' }]);
  }
  return group;
}
