/**
 * Permission va tizim rollarining yagona manbasi.
 * Seed shu ro‘yxatdan bazani to‘ldiradi, `requirePermission` middleware esa shu kalitlarni tekshiradi.
 */

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  LEAD_VIEW: 'lead.view',
  LEAD_VIEW_ALL: 'lead.view_all',
  LEAD_CREATE: 'lead.create',
  LEAD_UPDATE: 'lead.update',
  LEAD_ASSIGN: 'lead.assign',
  LEAD_DELETE: 'lead.delete',

  CALL_VIEW: 'call.view',
  CALL_CREATE: 'call.create',
  CALL_UPDATE: 'call.update',
  CALL_DELETE: 'call.delete',

  FOLLOWUP_VIEW: 'followup.view',
  FOLLOWUP_CREATE: 'followup.create',
  FOLLOWUP_UPDATE: 'followup.update',
  FOLLOWUP_DELETE: 'followup.delete',

  COURSE_VIEW: 'course.view',
  COURSE_MANAGE: 'course.manage',
  /// LMS darslari va materiallari (o'qituvchi — o'zi o'qitadigan kurslar)
  LESSON_MANAGE: 'lesson.manage',

  GROUP_VIEW: 'group.view',
  GROUP_MANAGE: 'group.manage',

  STUDENT_VIEW: 'student.view',
  STUDENT_MANAGE: 'student.manage',
  STUDENT_CONVERT: 'student.convert',

  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',
  ATTENDANCE_CORRECT_CLOSED: 'attendance.correct_closed',

  PAYMENT_VIEW: 'payment.view',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_DELETE: 'payment.delete',
  PAYMENT_REFUND: 'payment.refund',
  /** To'lovning oylarga taqsimotini tuzatish (sabab bilan, audit) */
  PAYMENT_REALLOCATE: 'payment.reallocate',
  /** Oy majburiyatini bekor qilish (masalan, ketgan o'quvchining kelgusi oylari) — shartnoma kamayadi */
  PAYMENT_CANCEL_CHARGE: 'payment.cancel_charge',

  DEBT_VIEW: 'debt.view',

  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',

  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_MANAGE: 'employee.manage',
  EMPLOYEE_SENSITIVE: 'employee.sensitive',
  STAFF_DOCUMENT_VIEW: 'staff_document.view',
  STAFF_DOCUMENT_MANAGE: 'staff_document.manage',
  /// Xodim davomati (QR): rahbar paneli va hisobotlar
  STAFF_ATTENDANCE_VIEW: 'staff_attendance.view',
  /// Jadvallar, tuzatishlar, ruxsat so'rovlarini hal qilish
  STAFF_ATTENDANCE_MANAGE: 'staff_attendance.manage',
  /// Qabulxonadagi QR ekranini ochish
  STAFF_ATTENDANCE_DISPLAY: 'staff_attendance.display',

  // ORG tizimi
  /// Bo'limlar, lavozimlar katalogi, mas'uliyatlar va karyera yo'llari
  ORG_MANAGE: 'org.manage',
  COMPLAINT_VIEW: 'complaint.view',
  COMPLAINT_CREATE: 'complaint.create',
  COMPLAINT_MANAGE: 'complaint.manage',
  /// Maxfiy murojaatlar (xodimlar nizosi, xavfsizlik) va o'zi haqidagi murojaatlar
  COMPLAINT_CONFIDENTIAL: 'complaint.confidential',
  /// Nomzodlar voronkasi (suhbat, demo dars)
  HIRING_MANAGE: 'hiring.manage',
  /// Ishga olish yoki rad etish bo'yicha yakuniy qaror
  HIRING_DECIDE: 'hiring.decide',
  ASSET_VIEW: 'asset.view',
  ASSET_MANAGE: 'asset.manage',
  KNOWLEDGE_MANAGE: 'knowledge.manage',
  /// Choraklik baholash, taqdirlash va lavozimga ko'tarish tavsiyalari
  PERFORMANCE_VIEW: 'performance.view',
  PERFORMANCE_MANAGE: 'performance.manage',
  /// Attestatsiya va lavozimga ko'tarishni tasdiqlash — markaz rahbari
  PERFORMANCE_APPROVE: 'performance.approve',

  ROLE_MANAGE: 'role.manage',
  SETTINGS_MANAGE: 'settings.manage',
  /** Telegram orqali ommaviy xabar yuborish */
  BROADCAST_SEND: 'broadcast.send',
  AUDIT_VIEW: 'audit.view',

  // --- O'quv markaz modullari ---
  TEACHER_VIEW: 'teacher.view',
  TEACHER_MANAGE: 'teacher.manage',

  SALARY_VIEW: 'salary.view',
  SALARY_CALCULATE: 'salary.calculate',
  SALARY_APPROVE: 'salary.approve',
  SALARY_PAY: 'salary.pay',
  SALARY_UNLOCK: 'salary.unlock',
  COMMISSION_VIEW_OWN: 'commission.view_own',

  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  FINANCE_CLOSE: 'finance.close',
  FINANCE_REOPEN: 'finance.reopen',
  FINANCE_LOCK: 'finance.lock',
  INCOME_VIEW: 'income.view',
  INCOME_MANAGE: 'income.manage',
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  EXPENSE_APPROVE: 'expense.approve',
  BUDGET_MANAGE: 'budget.manage',

  GAMIFICATION_VIEW: 'gamification.view',
  GAMIFICATION_MANAGE: 'gamification.manage',

  HOMEWORK_VIEW: 'homework.view',
  HOMEWORK_MANAGE: 'homework.manage',
  HOMEWORK_GRADE: 'homework.grade',

  EXAM_VIEW: 'exam.view',
  EXAM_MANAGE: 'exam.manage',
  EXAM_GRADE: 'exam.grade',

  PARENT_VIEW: 'parent.view',
  PARENT_MANAGE: 'parent.manage',

  ALERT_VIEW: 'alert.view',
  ALERT_MANAGE: 'alert.manage',
  TASK_CREATE: 'task.create',
  TASK_ASSIGN: 'task.assign',
  TASK_VIEW_ALL: 'task.view_all',
  TARGET_VIEW: 'target.view',
  TARGET_MANAGE: 'target.manage',

  ANALYTICS_VIEW: 'analytics.view',

  BRANCH_VIEW_ALL: 'branch.view_all',
  BRANCH_MANAGE: 'branch.manage',

  AI_ASSISTANT: 'ai.assistant',
  AI_ACADEMIC: 'ai.academic',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',

  FEEDBACK_VIEW: 'feedback.view',
  FEEDBACK_MANAGE: 'feedback.manage',

  DISCOUNT_VIEW: 'discount.view',
  DISCOUNT_MANAGE: 'discount.manage',
  DISCOUNT_GRANT: 'discount.grant',
  /** Chegaradan (standart 5%) yuqori chegirmani tasdiqlash yoki o'zi berish */
  DISCOUNT_APPROVE: 'discount.approve',
  REFERRAL_VIEW: 'referral.view',
  REFERRAL_REWARD: 'referral.reward',

  /// Kabinet (portal) ruxsatlari — faqat o'quvchi va ota-ona hisoblari uchun
  PORTAL_STUDENT: 'portal.student',
  PORTAL_PARENT: 'portal.parent',
  /// Xodim o'quvchi/ota-onaga kabinet hisobi ochishi
  PORTAL_MANAGE: 'portal.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  key: PermissionKey;
  module: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  { key: PERMISSIONS.DASHBOARD_VIEW, module: 'dashboard', description: 'Dashboardni ko‘rish' },

  { key: PERMISSIONS.LEAD_VIEW, module: 'leads', description: 'O‘ziga biriktirilgan va biriktirilmagan leadlarni ko‘rish' },
  { key: PERMISSIONS.LEAD_VIEW_ALL, module: 'leads', description: 'Barcha leadlarni ko‘rish' },
  { key: PERMISSIONS.LEAD_CREATE, module: 'leads', description: 'Lead yaratish' },
  { key: PERMISSIONS.LEAD_UPDATE, module: 'leads', description: 'Leadni tahrirlash va statusini o‘zgartirish' },
  { key: PERMISSIONS.LEAD_ASSIGN, module: 'leads', description: 'Leadni managerga biriktirish' },
  { key: PERMISSIONS.LEAD_DELETE, module: 'leads', description: 'Leadni o‘chirish' },

  { key: PERMISSIONS.CALL_VIEW, module: 'calls', description: 'Qo‘ng‘iroqlar tarixini ko‘rish' },
  { key: PERMISSIONS.CALL_CREATE, module: 'calls', description: 'Qo‘ng‘iroq yozish' },
  { key: PERMISSIONS.CALL_UPDATE, module: 'calls', description: 'Qo‘ng‘iroqni tahrirlash' },
  { key: PERMISSIONS.CALL_DELETE, module: 'calls', description: 'Qo‘ng‘iroqni o‘chirish' },

  { key: PERMISSIONS.FOLLOWUP_VIEW, module: 'follow-ups', description: 'Follow-uplarni ko‘rish' },
  { key: PERMISSIONS.FOLLOWUP_CREATE, module: 'follow-ups', description: 'Follow-up yaratish' },
  { key: PERMISSIONS.FOLLOWUP_UPDATE, module: 'follow-ups', description: 'Follow-upni tahrirlash va yakunlash' },
  { key: PERMISSIONS.FOLLOWUP_DELETE, module: 'follow-ups', description: 'Follow-upni o‘chirish' },

  { key: PERMISSIONS.COURSE_VIEW, module: 'courses', description: 'Kurslarni ko‘rish' },
  { key: PERMISSIONS.COURSE_MANAGE, module: 'courses', description: 'Kurs yaratish, tahrirlash, o‘chirish' },
  { key: PERMISSIONS.LESSON_MANAGE, module: 'courses', description: 'LMS darslari va materiallarini yaratish (o‘qituvchi — o‘z kurslarida)' },

  { key: PERMISSIONS.GROUP_VIEW, module: 'groups', description: 'Guruhlarni ko‘rish' },
  { key: PERMISSIONS.GROUP_MANAGE, module: 'groups', description: 'Guruh yaratish, tahrirlash, o‘chirish' },

  { key: PERMISSIONS.STUDENT_VIEW, module: 'students', description: 'O‘quvchilarni ko‘rish' },
  { key: PERMISSIONS.STUDENT_MANAGE, module: 'students', description: 'O‘quvchi yaratish, tahrirlash, o‘chirish' },
  { key: PERMISSIONS.STUDENT_CONVERT, module: 'students', description: 'Leadni o‘quvchiga aylantirish' },

  { key: PERMISSIONS.ATTENDANCE_VIEW, module: 'attendance', description: 'Davomatni ko‘rish' },
  { key: PERMISSIONS.ATTENDANCE_MARK, module: 'attendance', description: 'Davomat belgilash' },
  { key: PERMISSIONS.ATTENDANCE_CORRECT_CLOSED, module: 'attendance', description: 'Yopilgan moliyaviy oy davomatini tuzatish (sabab bilan)' },

  { key: PERMISSIONS.PAYMENT_VIEW, module: 'payments', description: 'To‘lovlarni ko‘rish' },
  { key: PERMISSIONS.PAYMENT_CREATE, module: 'payments', description: 'To‘lov qabul qilish' },
  { key: PERMISSIONS.PAYMENT_DELETE, module: 'payments', description: 'To‘lovni bekor qilish' },
  { key: PERMISSIONS.PAYMENT_REFUND, module: 'payments', description: 'To‘lovni (qisman) qaytarish' },
  { key: PERMISSIONS.PAYMENT_REALLOCATE, module: 'payments', description: 'To‘lovning oylarga taqsimotini tuzatish (sabab bilan)' },
  {
    key: PERMISSIONS.PAYMENT_CANCEL_CHARGE,
    module: 'payments',
    description: 'Oy to‘lov majburiyatini bekor qilish (shartnoma summasi kamayadi, sabab bilan)',
  },

  { key: PERMISSIONS.DEBT_VIEW, module: 'debts', description: 'Qarzdorlikni ko‘rish' },

  { key: PERMISSIONS.REPORT_VIEW, module: 'reports', description: 'Hisobotlarni ko‘rish' },
  { key: PERMISSIONS.REPORT_EXPORT, module: 'reports', description: 'Hisobotlarni Excel/CSV ga eksport qilish' },

  { key: PERMISSIONS.USER_VIEW, module: 'users', description: 'Xodimlar ro‘yxatini ko‘rish' },
  { key: PERMISSIONS.USER_MANAGE, module: 'users', description: 'Xodim yaratish, o‘chirish, role berish' },
  { key: PERMISSIONS.EMPLOYEE_VIEW, module: 'employees', description: 'Xodimlar (HR) ro‘yxatini ko‘rish' },
  { key: PERMISSIONS.EMPLOYEE_MANAGE, module: 'employees', description: 'Xodim qo‘shish, tahrirlash, holatini o‘zgartirish' },
  {
    key: PERMISSIONS.EMPLOYEE_SENSITIVE,
    module: 'employees',
    description: 'Xodimning maxfiy ma’lumotini (pasport, tug‘ilgan sana, manzil, favqulodda aloqa) ko‘rish',
  },
  { key: PERMISSIONS.STAFF_ATTENDANCE_VIEW, module: 'staff_attendance', description: 'Xodimlar davomati paneli, hisobotlar va eksport' },
  {
    key: PERMISSIONS.STAFF_ATTENDANCE_MANAGE,
    module: 'staff_attendance',
    description: 'Xodimlar ish jadvali, davomatni sabab bilan tuzatish, ruxsat so‘rovlarini tasdiqlash',
  },
  { key: PERMISSIONS.STAFF_ATTENDANCE_DISPLAY, module: 'staff_attendance', description: 'Qabulxonadagi davomat QR ekranini ochish' },
  { key: PERMISSIONS.ORG_MANAGE, module: 'org', description: 'Bo‘limlar, lavozimlar katalogi, mas’uliyatlar va karyera yo‘llarini boshqarish' },
  { key: PERMISSIONS.COMPLAINT_VIEW, module: 'complaints', description: 'Filialdagi murojaat va shikoyatlarni ko‘rish' },
  { key: PERMISSIONS.COMPLAINT_CREATE, module: 'complaints', description: 'O‘quvchi, ota-ona va boshqalarning murojaatini kiritish' },
  { key: PERMISSIONS.COMPLAINT_MANAGE, module: 'complaints', description: 'Murojaatni mas’ulga yo‘naltirish, hal etish, yopish va rahbarga ko‘tarish' },
  {
    key: PERMISSIONS.COMPLAINT_CONFIDENTIAL,
    module: 'complaints',
    description: 'Maxfiy murojaatlarni (xodimlar nizosi, xavfsizlik) va rahbarlarning o‘zi haqidagi murojaatlarni ko‘rish',
  },
  { key: PERMISSIONS.HIRING_MANAGE, module: 'hiring', description: 'Nomzodlar: suhbat, demo dars, onboarding va offboarding ro‘yxatlari' },
  { key: PERMISSIONS.HIRING_DECIDE, module: 'hiring', description: 'Nomzodni ishga olish yoki rad etish bo‘yicha yakuniy qaror' },
  { key: PERMISSIONS.ASSET_VIEW, module: 'assets', description: 'Markaz jihozlari (aktivlar) reyestrini ko‘rish' },
  { key: PERMISSIONS.ASSET_MANAGE, module: 'assets', description: 'Aktiv qo‘shish, mas’ulga biriktirish, ko‘chirish, ta’mirlash va hisobdan chiqarish' },
  { key: PERMISSIONS.KNOWLEDGE_MANAGE, module: 'knowledge', description: 'Bilimlar bazasi hujjatlarini yozish, e’lon qilish va arxivlash' },
  { key: PERMISSIONS.PERFORMANCE_VIEW, module: 'performance', description: 'Xodimlar baholash natijalari, taqdirlashlar va ko‘tarilish tavsiyalarini ko‘rish' },
  { key: PERMISSIONS.PERFORMANCE_MANAGE, module: 'performance', description: 'Choraklik baholash yozish, taqdirlash va lavozimga ko‘tarishni tavsiya qilish' },
  { key: PERMISSIONS.PERFORMANCE_APPROVE, module: 'performance', description: 'Baholashni va lavozimga ko‘tarilishni tasdiqlash (yakuniy qaror)' },
  {
    key: PERMISSIONS.STAFF_DOCUMENT_VIEW,
    module: 'hr',
    description: 'O‘qituvchi va xodim hujjatlarini (shartnoma, pasport, sertifikat) ko‘rish va yuklab olish',
  },
  {
    key: PERMISSIONS.STAFF_DOCUMENT_MANAGE,
    module: 'hr',
    description: 'O‘qituvchi va xodim hujjatlarini yuklash, tahrirlash va o‘chirish',
  },

  { key: PERMISSIONS.ROLE_MANAGE, module: 'roles', description: 'Rollar va permissionlarni boshqarish' },
  { key: PERMISSIONS.SETTINGS_MANAGE, module: 'settings', description: 'CRM sozlamalarini boshqarish' },
  { key: PERMISSIONS.BROADCAST_SEND, module: 'settings', description: 'Telegram orqali ommaviy xabar yuborish' },
  { key: PERMISSIONS.AUDIT_VIEW, module: 'audit', description: 'Audit logni ko‘rish' },

  { key: PERMISSIONS.TEACHER_VIEW, module: 'teachers', description: 'O‘qituvchilarni ko‘rish' },
  { key: PERMISSIONS.TEACHER_MANAGE, module: 'teachers', description: 'O‘qituvchi profilini boshqarish' },

  { key: PERMISSIONS.SALARY_VIEW, module: 'salary', description: 'Maoshlarni ko‘rish' },
  { key: PERMISSIONS.SALARY_CALCULATE, module: 'salary', description: 'Maoshni hisoblash' },
  { key: PERMISSIONS.SALARY_APPROVE, module: 'salary', description: 'Maoshni tasdiqlash (locked)' },
  { key: PERMISSIONS.SALARY_PAY, module: 'salary', description: 'Maoshni to‘lash' },
  { key: PERMISSIONS.SALARY_UNLOCK, module: 'salary', description: 'Tasdiqlangan maoshni qayta ochish (sabab bilan)' },
  { key: PERMISSIONS.COMMISSION_VIEW_OWN, module: 'salary', description: 'O‘z foiz daromadini ko‘rish (o‘qituvchi)' },

  { key: PERMISSIONS.FINANCE_VIEW, module: 'finance', description: 'Moliyaviy panel va tranzaksiyalarni ko‘rish' },
  { key: PERMISSIONS.FINANCE_MANAGE, module: 'finance', description: 'Hisoblar va tranzaksiyalarni boshqarish' },
  { key: PERMISSIONS.FINANCE_CLOSE, module: 'finance', description: 'Moliyaviy oyni yopish' },
  { key: PERMISSIONS.FINANCE_REOPEN, module: 'finance', description: 'Yopilgan moliyaviy oyni qayta ochish (sabab bilan)' },
  { key: PERMISSIONS.FINANCE_LOCK, module: 'finance', description: 'Yopilgan oyni qulflash va qulfini ochish, oy oxiri snapshotini to‘ldirish' },
  { key: PERMISSIONS.INCOME_VIEW, module: 'finance', description: 'Tushumlarni ko‘rish' },
  { key: PERMISSIONS.INCOME_MANAGE, module: 'finance', description: 'Tushum qo‘shish va bekor qilish' },
  { key: PERMISSIONS.EXPENSE_VIEW, module: 'finance', description: 'Xarajatlarni ko‘rish' },
  { key: PERMISSIONS.EXPENSE_MANAGE, module: 'finance', description: 'Xarajat qo‘shish va bekor qilish' },
  { key: PERMISSIONS.EXPENSE_APPROVE, module: 'finance', description: 'Katta xarajatni tasdiqlash / rad etish, tasdiq chegarasini belgilash' },
  { key: PERMISSIONS.BUDGET_MANAGE, module: 'finance', description: 'Oylik budjetni belgilash' },

  { key: PERMISSIONS.GAMIFICATION_VIEW, module: 'gamification', description: 'XP, daraja va reytingni ko‘rish' },
  { key: PERMISSIONS.GAMIFICATION_MANAGE, module: 'gamification', description: 'XP qoidalari, darajalar va nishonlarni boshqarish' },

  { key: PERMISSIONS.HOMEWORK_VIEW, module: 'homework', description: 'Uy vazifalarini ko‘rish' },
  { key: PERMISSIONS.HOMEWORK_MANAGE, module: 'homework', description: 'Uy vazifasi berish va tahrirlash' },
  { key: PERMISSIONS.HOMEWORK_GRADE, module: 'homework', description: 'Uy vazifasini baholash' },

  { key: PERMISSIONS.EXAM_VIEW, module: 'exams', description: 'Imtihonlarni ko‘rish' },
  { key: PERMISSIONS.EXAM_MANAGE, module: 'exams', description: 'Imtihon yaratish va tahrirlash' },
  { key: PERMISSIONS.EXAM_GRADE, module: 'exams', description: 'Imtihon natijasini kiritish' },

  { key: PERMISSIONS.PARENT_VIEW, module: 'parents', description: 'Ota-onalarni ko‘rish' },
  { key: PERMISSIONS.PARENT_MANAGE, module: 'parents', description: 'Ota-ona ma’lumotlarini boshqarish' },

  { key: PERMISSIONS.ALERT_VIEW, module: 'alerts', description: 'Ogohlantirishlarni ko‘rish' },
  {
    key: PERMISSIONS.ALERT_MANAGE,
    module: 'alerts',
    description: 'Ogohlantirish qoidalari va chegaralarini, kunlik xulosani sozlash',
  },
  { key: PERMISSIONS.TASK_CREATE, module: 'tasks', description: 'O‘zi uchun vazifa yaratish' },
  { key: PERMISSIONS.TASK_ASSIGN, module: 'tasks', description: 'Boshqa xodimga vazifa berish va qayta biriktirish' },
  { key: PERMISSIONS.TASK_VIEW_ALL, module: 'tasks', description: 'O‘z filiali doirasida barcha xodimlarning vazifalarini ko‘rish va boshqarish' },
  { key: PERMISSIONS.TARGET_VIEW, module: 'targets', description: 'Sotuv rejalarini ko‘rish' },
  { key: PERMISSIONS.TARGET_MANAGE, module: 'targets', description: 'Sotuv rejasini belgilash' },

  { key: PERMISSIONS.ANALYTICS_VIEW, module: 'analytics', description: 'Kengaytirilgan analitikani ko‘rish' },

  {
    key: PERMISSIONS.AI_ASSISTANT,
    module: 'ai',
    description: 'AI yordamchiga savol berish (javoblar xodimning o‘z ruxsatlari doirasida bo‘ladi)',
  },
  {
    key: PERMISSIONS.AI_ACADEMIC,
    module: 'ai',
    description: 'AI akademik tahlil: o‘quvchi/guruh tahlili, vazifa tekshiruvi, remedial reja (o‘qituvchi tasdiqlaydi)',
  },

  { key: PERMISSIONS.INVENTORY_VIEW, module: 'inventory', description: 'Ombor (mahsulotlar va qoldiq) ma’lumotini ko‘rish' },
  { key: PERMISSIONS.INVENTORY_MANAGE, module: 'inventory', description: 'Mahsulot qo‘shish va ombor harakatini yozish (kirim, sotuv, hisobdan chiqarish)' },

  { key: PERMISSIONS.FEEDBACK_VIEW, module: 'feedback', description: 'O‘quvchilar fikri va NPS hisobotini ko‘rish' },
  {
    key: PERMISSIONS.FEEDBACK_MANAGE,
    module: 'feedback',
    description: 'Fikr qo‘shish va salbiy fikrni ishlangan deb belgilash (past baho bildirishnomasi shu ruxsat bo‘yicha boradi)',
  },

  { key: PERMISSIONS.DISCOUNT_VIEW, module: 'discounts', description: 'Chegirma qoidalari va berilgan chegirmalarni ko‘rish' },
  { key: PERMISSIONS.DISCOUNT_MANAGE, module: 'discounts', description: 'Chegirma qoidalari va promo kodlarni boshqarish' },
  { key: PERMISSIONS.DISCOUNT_GRANT, module: 'discounts', description: 'O‘quvchiga chegirma berish va bekor qilish' },
  {
    key: PERMISSIONS.DISCOUNT_APPROVE,
    module: 'discounts',
    description: 'Chegaradan (standart 5%) yuqori chegirmani tasdiqlash yoki tasdiqsiz berish',
  },
  { key: PERMISSIONS.REFERRAL_VIEW, module: 'referrals', description: 'Do‘st taklif qilish (referal) ro‘yxati va hisobotini ko‘rish' },
  { key: PERMISSIONS.REFERRAL_REWARD, module: 'referrals', description: 'Taklif uchun bonus berish' },

  {
    key: PERMISSIONS.BRANCH_VIEW_ALL,
    module: 'branches',
    description: 'Barcha filiallar ma’lumotini ko‘rish (bo‘lmasa — faqat o‘z filiali)',
  },
  { key: PERMISSIONS.BRANCH_MANAGE, module: 'branches', description: 'Filial qo‘shish va tahrirlash' },

  { key: PERMISSIONS.PORTAL_STUDENT, module: 'portal', description: 'O‘quvchi kabinetiga kirish' },
  { key: PERMISSIONS.PORTAL_PARENT, module: 'portal', description: 'Ota-ona kabinetiga kirish' },
  {
    key: PERMISSIONS.PORTAL_MANAGE,
    module: 'portal',
    description: 'O‘quvchi va ota-onaga kabinet hisobi ochish',
  },
];

export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
  CALL_CENTER: 'CALL_CENTER',
  TEACHER: 'TEACHER',
  ACCOUNTANT: 'ACCOUNTANT',
  /// Qabulxona qurilmasi — faqat davomat QR ekrani
  RECEPTION: 'RECEPTION',
  /// Kabinet rollari — xodim emas, faqat o'z ma'lumotini ko'radi
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export interface SystemRoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}

/** Rahbar rollari uchun — o‘qituvchining shaxsiy "Mening daromadim" sahifasi ularga kerak emas */
/**
 * Rahbar rollari uchun. Chiqarib tashlanadi:
 *  - `commission.view_own` — o'qituvchining shaxsiy "Mening daromadim" sahifasi;
 *  - `portal.student` / `portal.parent` — kabinet hisoblari uchun, xodimga kerak emas
 *    (va berilsa, xodimning o'zi kabinetga tushib qolardi).
 */
const PORTAL_ACCESS_PERMISSIONS: readonly PermissionKey[] = [PERMISSIONS.PORTAL_STUDENT, PERMISSIONS.PORTAL_PARENT];

const ALL_PERMISSIONS: readonly PermissionKey[] = PERMISSION_DEFINITIONS.map((permission) => permission.key).filter(
  (key) => key !== PERMISSIONS.COMMISSION_VIEW_OWN && !PORTAL_ACCESS_PERMISSIONS.includes(key),
);

const ADMIN_EXCLUDED: readonly PermissionKey[] = [
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  // Tasdiqlangan maoshni ochish — faqat Owner / Super Admin
  PERMISSIONS.SALARY_UNLOCK,
  // Yopilgan moliyaviy oyni ochish — faqat Owner / Super Admin
  PERMISSIONS.FINANCE_REOPEN,
  // Oyni qulflash va yopilgan oy davomatini tuzatish — tarixiy hisobotni o'zgartiradi (qaror 3)
  PERMISSIONS.FINANCE_LOCK,
  PERMISSIONS.ATTENDANCE_CORRECT_CLOSED,
  PERMISSIONS.PAYMENT_CANCEL_CHARGE,
  // Katta xarajatni tasdiqlash — faqat Owner / Super Admin
  PERMISSIONS.EXPENSE_APPROVE,
  // Ogohlantirish chegaralarini sozlash — faqat Owner / Super Admin
  PERMISSIONS.ALERT_MANAGE,
  // Filial boshqaruvi va barcha filiallarni ko‘rish — faqat Owner / Super Admin.
  // Admin o‘z filiali doirasida ishlaydi (bitta filial bo‘lsa farqi bilinmaydi).
  PERMISSIONS.BRANCH_VIEW_ALL,
  PERMISSIONS.BRANCH_MANAGE,
  // ORG tizimi: strategik va yakuniy qarorlar — markaz rahbari (ORG §1, §2.2, §3.1)
  PERMISSIONS.ORG_MANAGE,
  PERMISSIONS.DISCOUNT_APPROVE,
  PERMISSIONS.HIRING_DECIDE,
  PERMISSIONS.COMPLAINT_CONFIDENTIAL,
  PERMISSIONS.PERFORMANCE_APPROVE,
];

/** Owner/Admin uchun moliyaviy ruxsatlar to'plami */
const FINANCE_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.FINANCE_VIEW,
  PERMISSIONS.FINANCE_MANAGE,
  PERMISSIONS.INCOME_VIEW,
  PERMISSIONS.INCOME_MANAGE,
  PERMISSIONS.EXPENSE_VIEW,
  PERMISSIONS.EXPENSE_MANAGE,
  PERMISSIONS.BUDGET_MANAGE,
];

const LEAD_WORK_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.LEAD_VIEW,
  PERMISSIONS.LEAD_CREATE,
  PERMISSIONS.LEAD_UPDATE,
  PERMISSIONS.CALL_VIEW,
  PERMISSIONS.CALL_CREATE,
  PERMISSIONS.CALL_UPDATE,
  PERMISSIONS.CALL_DELETE,
  PERMISSIONS.FOLLOWUP_VIEW,
  PERMISSIONS.FOLLOWUP_CREATE,
  PERMISSIONS.FOLLOWUP_UPDATE,
  PERMISSIONS.FOLLOWUP_DELETE,
  PERMISSIONS.COURSE_VIEW,
  PERMISSIONS.GROUP_VIEW,
];

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: ROLE_KEYS.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Tizimning to‘liq egasi: xodimlar, rollar, sozlamalar va barcha ma’lumotlar',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.OWNER,
    name: 'Direktor (Owner)',
    description: 'O‘quv markaz egasi: barcha moliya, analitika va hisobotlar, xodimlarni boshqarishdan tashqari',
    permissions: ALL_PERMISSIONS.filter((key) => key !== PERMISSIONS.ROLE_MANAGE),
  },
  {
    key: ROLE_KEYS.ADMIN,
    name: 'Admin',
    description: 'Leadlar, o‘quvchilar, kurslar, to‘lovlar, sotuv va hisobotlar',
    permissions: ALL_PERMISSIONS.filter((key) => !ADMIN_EXCLUDED.includes(key)),
  },
  {
    key: ROLE_KEYS.SALES_MANAGER,
    name: 'Sales Manager',
    description: 'Leadlar bilan ishlash, qo‘ng‘iroq va follow-up, o‘quvchiga aylantirish',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.TASK_CREATE,
      ...LEAD_WORK_PERMISSIONS,
      PERMISSIONS.LEAD_ASSIGN,
      PERMISSIONS.STUDENT_VIEW,
      PERMISSIONS.STUDENT_CONVERT,
      PERMISSIONS.TARGET_VIEW,
      PERMISSIONS.PARENT_VIEW,
      PERMISSIONS.REFERRAL_VIEW,
      PERMISSIONS.DISCOUNT_VIEW,
      // ORG §2.2: 0–5% chegirmani o'zi beradi, undan yuqorisi rahbar tasdig'iga ketadi
      PERMISSIONS.DISCOUNT_GRANT,
      PERMISSIONS.COMPLAINT_CREATE,
    ],
  },
  {
    key: ROLE_KEYS.CALL_CENTER,
    name: 'Call Center',
    description: 'Leadlar, qo‘ng‘iroqlar va follow-up',
    permissions: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.TASK_CREATE, ...LEAD_WORK_PERMISSIONS, PERMISSIONS.COMPLAINT_CREATE],
  },
  {
    key: ROLE_KEYS.TEACHER,
    name: 'O‘qituvchi',
    description: 'O‘z guruhlari, o‘quvchilari va davomat',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.TASK_CREATE,
      PERMISSIONS.COURSE_VIEW,
      PERMISSIONS.LESSON_MANAGE,
      PERMISSIONS.GROUP_VIEW,
      PERMISSIONS.STUDENT_VIEW,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MARK,
      PERMISSIONS.HOMEWORK_VIEW,
      PERMISSIONS.HOMEWORK_MANAGE,
      PERMISSIONS.HOMEWORK_GRADE,
      PERMISSIONS.EXAM_VIEW,
      PERMISSIONS.EXAM_MANAGE,
      PERMISSIONS.EXAM_GRADE,
      PERMISSIONS.GAMIFICATION_VIEW,
      PERMISSIONS.PARENT_VIEW,
      PERMISSIONS.COMMISSION_VIEW_OWN,
      PERMISSIONS.FEEDBACK_VIEW,
      PERMISSIONS.AI_ACADEMIC,
      PERMISSIONS.COMPLAINT_CREATE,
    ],
  },
  {
    key: ROLE_KEYS.STUDENT,
    name: 'O‘quvchi (kabinet)',
    description: 'Faqat o‘z davomati, uy vazifasi, imtihonlari, XP va to‘lovlari',
    permissions: [PERMISSIONS.PORTAL_STUDENT],
  },
  {
    key: ROLE_KEYS.PARENT,
    name: 'Ota-ona (kabinet)',
    description: 'Faqat o‘z farzandlarining ma’lumotlari',
    permissions: [PERMISSIONS.PORTAL_PARENT],
  },
  {
    key: ROLE_KEYS.ACCOUNTANT,
    name: 'Buxgalter',
    description: 'To‘lovlar, qarzdorlik va moliyaviy hisobotlar',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.TASK_CREATE,
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.COURSE_VIEW,
      PERMISSIONS.GROUP_VIEW,
      PERMISSIONS.STUDENT_VIEW,
      PERMISSIONS.PAYMENT_VIEW,
      PERMISSIONS.PAYMENT_CREATE,
      PERMISSIONS.PAYMENT_DELETE,
      PERMISSIONS.PAYMENT_REFUND,
      PERMISSIONS.PAYMENT_REALLOCATE,
      PERMISSIONS.FINANCE_CLOSE,
      PERMISSIONS.DEBT_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_EXPORT,
      ...FINANCE_PERMISSIONS,
      PERMISSIONS.SALARY_VIEW,
      PERMISSIONS.SALARY_CALCULATE,
      PERMISSIONS.SALARY_PAY,
      PERMISSIONS.TEACHER_VIEW,
      PERMISSIONS.DISCOUNT_VIEW,
      PERMISSIONS.REFERRAL_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.ASSET_VIEW,
      PERMISSIONS.ASSET_MANAGE,
      PERMISSIONS.COMPLAINT_VIEW,
      PERMISSIONS.COMPLAINT_CREATE,
    ],
  },
  {
    key: ROLE_KEYS.RECEPTION,
    name: 'Qabulxona (QR ekran)',
    description: 'Qabulxonadagi planshet yoki ekran uchun: faqat xodimlar davomati QR kodini ko‘rsatadi',
    permissions: [PERMISSIONS.STAFF_ATTENDANCE_DISPLAY],
  },
];
