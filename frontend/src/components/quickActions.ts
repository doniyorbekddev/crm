import { ClipboardList, GraduationCap, Receipt, UserPlus, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createIntentUrl } from '@/hooks/useCreateIntent';
import type { AuthUser } from '@/types/auth';
import { PERMISSIONS } from '@/utils/permissionKeys';

export interface QuickAction {
  key: string;
  label: string;
  /** Global qidiruvda mos kelish uchun qo'shimcha so'zlar */
  keywords: string;
  icon: LucideIcon;
  url: string;
  /** Hammasi kerak: sahifani ko'rish va yaratish ruxsati */
  permissions: readonly string[];
}

/**
 * Tez yaratish amallari — topbar'dagi "Yaratish" menyusi va global qidiruv bitta ro'yxatdan foydalanadi.
 * Har biri mavjud sahifaning o'z yaratish oynasini `?create=1` orqali ochadi; yangi biznes qoidasi yo'q.
 */
const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    key: 'lead',
    label: 'Yangi lead',
    keywords: 'lead lid mijoz qo‘shish',
    icon: UserPlus,
    url: createIntentUrl('/leads'),
    permissions: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE],
  },
  {
    key: 'student',
    label: 'Yangi o‘quvchi',
    keywords: 'o‘quvchi talaba student qo‘shish',
    icon: GraduationCap,
    url: createIntentUrl('/students'),
    permissions: [PERMISSIONS.STUDENT_VIEW, PERMISSIONS.STUDENT_MANAGE],
  },
  {
    key: 'payment',
    label: 'To‘lov qabul qilish',
    keywords: 'to‘lov pul kassa tolov',
    icon: Wallet,
    url: createIntentUrl('/payments'),
    permissions: [PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_CREATE],
  },
  {
    key: 'expense',
    label: 'Xarajat qo‘shish',
    keywords: 'xarajat chiqim harajat',
    icon: Receipt,
    url: createIntentUrl('/expenses'),
    permissions: [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE],
  },
  {
    key: 'task',
    label: 'Yangi vazifa',
    keywords: 'vazifa topshiriq task',
    icon: ClipboardList,
    url: createIntentUrl('/tasks'),
    permissions: [PERMISSIONS.TASK_CREATE],
  },
];

/** Foydalanuvchi bajara oladigan amallar */
export function availableQuickActions(user: AuthUser | null): QuickAction[] {
  if (!user) return [];
  return QUICK_ACTIONS.filter((action) => action.permissions.every((key) => user.permissions.includes(key)));
}

/** Qidiruv so'ziga mos amallar (bo'sh so'z — hammasi) */
export function matchQuickActions(actions: readonly QuickAction[], query: string): QuickAction[] {
  const needle = query.trim().toLocaleLowerCase('uz');
  if (!needle) return [...actions];
  return actions.filter((action) => `${action.label} ${action.keywords}`.toLocaleLowerCase('uz').includes(needle));
}
