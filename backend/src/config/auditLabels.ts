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

  'parent.created': 'Ota-ona qo‘shildi',
  'parent.updated': 'Ota-ona tahrirlandi',
  'parent.deleted': 'Ota-ona o‘chirildi',
  'parent.linked': 'Farzand biriktirildi',
  'parent.link_updated': 'Ota-ona bog‘lanishi o‘zgardi',
  'parent.unlinked': 'Farzand ajratildi',

  'attendance.marked': 'Davomat belgilandi',

  'homework.created': 'Uy vazifasi berildi',
  'homework.updated': 'Uy vazifasi tahrirlandi',
  'homework.graded': 'Uy vazifasi baholandi',
  'homework.deleted': 'Uy vazifasi o‘chirildi',

  'exam.created': 'Imtihon yaratildi',
  'exam.updated': 'Imtihon tahrirlandi',
  'exam.graded': 'Imtihon natijalari kiritildi',
  'exam.deleted': 'Imtihon o‘chirildi',

  'payment.created': 'To‘lov qabul qilindi',
  'payment.deleted': 'To‘lov bekor qilindi',

  'teacher.profile_created': 'O‘qituvchi profili yaratildi',
  'teacher.profile_updated': 'O‘qituvchi profili tahrirlandi',
  'teacher.deactivated': 'O‘qituvchi faolsizlantirildi',

  'salary.rule_created': 'Maosh modeli belgilandi',
  'salary.calculated': 'Maosh hisoblandi',
  'salary.adjusted': 'Bonus/jarima o‘zgartirildi',
  'salary.approved': 'Maosh tasdiqlandi',
  'salary.paid': 'Maosh to‘landi',
  'salary.adjustment_added': 'Maoshga bonus/jarima qo‘shildi',
  'salary.adjustment_voided': 'Bonus/jarima bekor qilindi',
  'salary.advance_paid': 'Avans berildi',
  'salary.unlocked': 'Tasdiqlangan maosh qayta ochildi',
  'salary.note_updated': 'Maosh izohi o‘zgartirildi',
  'commission.reversed': 'O‘qituvchi foizi qaytarildi',
  'commission.carried_over': 'Manfiy foiz keyingi oyga ko‘chirildi',

  'finance.account_created': 'Kassa qo‘shildi',
  'finance.account_updated': 'Kassa tahrirlandi',
  'finance.transfer': 'Kassalar o‘rtasida o‘tkazma',
  'finance.transaction_voided': 'Moliyaviy yozuv bekor qilindi',
  'finance.category_created': 'Kategoriya qo‘shildi',
  'finance.category_updated': 'Kategoriya tahrirlandi',

  'income.created': 'Tushum qayd etildi',
  'income.voided': 'Tushum bekor qilindi',

  'expense.created': 'Xarajat qayd etildi',
  'expense.voided': 'Xarajat bekor qilindi',

  'budget.saved': 'Budjet saqlandi',

  'alert.resolved': 'Ogohlantirish yopildi',
  'target.updated': 'Sotuv rejasi belgilandi',
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
  parent: 'Ota-ona',
  payment: 'To‘lov',
  debt: 'Qarzdorlik',
  attendance: 'Davomat',
  homework: 'Uy vazifasi',
  exam: 'Imtihon',
  teacher: 'O‘qituvchi',
  salary: 'Maosh',
  commission: 'O‘qituvchi foizi',
  account: 'Kassa',
  transaction: 'Moliyaviy yozuv',
  income: 'Tushum',
  expense: 'Xarajat',
  budget: 'Budjet',
  alert: 'Ogohlantirish',
  target: 'Sotuv rejasi',
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
  'salary.approved',
  'salary.paid',
  'commission.reversed',
  'commission.carried_over',
  'salary.unlocked',
  'salary.adjustment_voided',
  'salary.advance_paid',
  'finance.transaction_voided',
  'income.voided',
  'expense.voided',
];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}
