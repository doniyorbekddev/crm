import type { AuthUser } from '@/types/auth';

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return user?.permissions.includes(permission) ?? false;
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  lead: 'Leadlar',
  call: 'Qo‘ng‘iroqlar',
  followup: 'Follow-up',
  course: 'Kurslar',
  group: 'Guruhlar',
  student: 'O‘quvchilar',
  attendance: 'Davomat',
  payment: 'To‘lovlar',
  debt: 'Qarzdorlik',
  report: 'Hisobotlar',
  user: 'Xodimlar',
  role: 'Rollar',
  settings: 'Sozlamalar',
  audit: 'Audit log',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'Ko‘rish',
  view_all: 'Hammasini ko‘rish',
  create: 'Yaratish',
  update: 'Tahrirlash',
  delete: 'O‘chirish',
  assign: 'Biriktirish',
  manage: 'Boshqarish',
  convert: 'O‘quvchiga aylantirish',
  mark: 'Belgilash',
  export: 'Eksport',
};

/** Bazadagi `Permission.module` qiymatlari uchun nomlar */
const PERMISSION_MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leadlar',
  calls: 'Qo‘ng‘iroqlar',
  'follow-ups': 'Follow-up',
  courses: 'Kurslar',
  groups: 'Guruhlar',
  students: 'O‘quvchilar',
  attendance: 'Davomat',
  payments: 'To‘lovlar',
  debts: 'Qarzdorlik',
  reports: 'Hisobotlar',
  users: 'Xodimlar',
  roles: 'Rollar',
  settings: 'Sozlamalar',
  audit: 'Audit log',
};

export function permissionModuleLabel(module: string): string {
  return PERMISSION_MODULE_LABELS[module] ?? module;
}

export interface PermissionGroup {
  module: string;
  label: string;
  actions: string[];
}

/** ["lead.view", "lead.create", "payment.view"] → modullar bo‘yicha guruhlangan, o‘qiladigan ro‘yxat */
export function groupPermissions(permissions: readonly string[]): PermissionGroup[] {
  const groups = new Map<string, string[]>();
  for (const permission of permissions) {
    const [module = permission, action = ''] = permission.split('.');
    const actions = groups.get(module) ?? [];
    actions.push(ACTION_LABELS[action] ?? action);
    groups.set(module, actions);
  }
  return Array.from(groups, ([module, actions]) => ({ module, label: MODULE_LABELS[module] ?? module, actions }));
}
