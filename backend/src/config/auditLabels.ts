/** Audit jurnalidagi amallar uchun o‘zbekcha izohlar */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Tizimga kirdi',
  'auth.login_failed': 'Kirish muvaffaqiyatsiz',
  'auth.logout': 'Tizimdan chiqdi',
  'auth.logout_all': 'Barcha qurilmalardan chiqdi',
  'auth.password_changed': 'Parolini o‘zgartirdi',
  'auth.password_reset': 'Parolni tikladi',
  'auth.password_reset_requested': 'Parolni tiklashni so‘radi',
  'auth.refresh_token_reuse': 'Shubhali token qayta ishlatildi',

  'user.registered': 'Ro‘yxatdan o‘tdi',
  'user.created': 'Xodim qo‘shildi',
  'user.updated': 'Xodim ma’lumoti o‘zgardi',
  'user.status_changed': 'Xodim holati o‘zgardi',
  'user.deleted': 'Xodim o‘chirildi',
  'user.password_reset_by_admin': 'Admin parolni yangiladi',

  'role.created': 'Rol yaratildi',
  'role.updated': 'Rol o‘zgartirildi',
  'role.permissions_updated': 'Rol ruxsatlari yangilandi',
  'role.deleted': 'Rol o‘chirildi',

  'lead.created': 'Lead qo‘shildi',
  'lead.updated': 'Lead tahrirlandi',
  'lead.status_changed': 'Lead statusi o‘zgardi',
  'lead.assigned': 'Lead biriktirildi',
  'lead.deleted': 'Lead o‘chirildi',

  'call.created': 'Qo‘ng‘iroq qayd etildi',
  'call.updated': 'Qo‘ng‘iroq tahrirlandi',
  'call.deleted': 'Qo‘ng‘iroq o‘chirildi',

  'followup.created': 'Follow-up yaratildi',
  'followup.updated': 'Follow-up tahrirlandi',
  'followup.completed': 'Follow-up bajarildi',
  'followup.deleted': 'Follow-up o‘chirildi',

  'course.created': 'Kurs qo‘shildi',
  'course.updated': 'Kurs tahrirlandi',
  'course.deleted': 'Kurs o‘chirildi',

  'group.created': 'Guruh qo‘shildi',
  'group.updated': 'Guruh tahrirlandi',
  'group.deleted': 'Guruh o‘chirildi',

  'student.created': 'O‘quvchi qo‘shildi',
  'student.updated': 'O‘quvchi tahrirlandi',
  'student.status_changed': 'O‘quvchi holati o‘zgardi',
  'student.deleted': 'O‘quvchi o‘chirildi',
  'student.converted_from_lead': 'Lead o‘quvchiga aylantirildi',

  'attendance.marked': 'Davomat belgilandi',

  'payment.created': 'To‘lov qabul qilindi',
  'payment.deleted': 'To‘lov bekor qilindi',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  /** Kirish/chiqish amallari ham foydalanuvchi obyektiga yoziladi */
  user: 'Xodim',
  role: 'Rol',
  lead: 'Lead',
  call: 'Qo‘ng‘iroq',
  followUp: 'Follow-up',
  course: 'Kurs',
  group: 'Guruh',
  student: 'O‘quvchi',
  payment: 'To‘lov',
  debt: 'Qarzdorlik',
  attendance: 'Davomat',
  settings: 'Sozlamalar',
};

/** Xavfli yoki diqqat talab qiladigan amallar — ro‘yxatda ajratib ko‘rsatiladi */
export const AUDIT_CRITICAL_ACTIONS: readonly string[] = [
  'auth.login_failed',
  'auth.refresh_token_reuse',
  'user.deleted',
  'role.deleted',
  'role.permissions_updated',
  'lead.deleted',
  'course.deleted',
  'group.deleted',
  'student.deleted',
  'payment.deleted',
  'user.password_reset_by_admin',
];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}
