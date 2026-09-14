import type { BadgeTone } from '@/components/ui/Badge';
import type { AlertSeverity, AlertType, TargetType } from '@/types/alert';

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  HIGH_DEBT: 'Katta qarz',
  LOW_ATTENDANCE: 'Past davomat',
  HIGH_DROPOUT: 'Chiqib ketish xavfi',
  OVERDUE_FOLLOWUPS: 'Kechikkan follow-up',
  UNPAID_SALARY: 'To‘lanmagan maosh',
  BUDGET_EXCEEDED: 'Budjetdan oshish',
  LOW_GROUP_CAPACITY: 'To‘lmagan guruh',
  SALES_TARGET_ACHIEVED: 'Reja bajarildi',
  CONVERSION_DROP: 'Konversiya tushishi',
  DROPOUT_INCREASE: 'Ketishlar o‘sishi',
  CASH_SHORTAGE: 'Mablag‘ yetishmasligi',
  PENDING_EXPENSE_APPROVAL: 'Kutib qolgan tasdiq',
  DOCUMENT_EXPIRING: 'Hujjat muddati',
};

export const ALERT_TYPE_ORDER: readonly AlertType[] = [
  'CASH_SHORTAGE',
  'HIGH_DROPOUT',
  'DROPOUT_INCREASE',
  'HIGH_DEBT',
  'CONVERSION_DROP',
  'LOW_ATTENDANCE',
  'UNPAID_SALARY',
  'BUDGET_EXCEEDED',
  'PENDING_EXPENSE_APPROVAL',
  'DOCUMENT_EXPIRING',
  'OVERDUE_FOLLOWUPS',
  'LOW_GROUP_CAPACITY',
  'SALES_TARGET_ACHIEVED',
];

export const ALERT_SEVERITY_ORDER: readonly AlertSeverity[] = ['CRITICAL', 'WARNING', 'INFO', 'SUCCESS'];

/** Muhimlik darajasi: kritik — yuqori, ogohlantirish — o‘rta, ma’lumot — past */
export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: 'Yuqori',
  WARNING: 'O‘rta',
  INFO: 'Past',
  SUCCESS: 'Yutuq',
};

/** Qoidalar sozlamasida ko‘rsatiladigan tavsif */
export const ALERT_TYPE_DESCRIPTIONS: Record<AlertType, string> = {
  HIGH_DEBT: 'O‘quvchining qarzi shartnomaning belgilangan qismidan katta',
  LOW_ATTENDANCE: 'Guruh davomati oxirgi 14 kunda me’yordan past',
  HIGH_DROPOUT: 'O‘quvchi ketma-ket bir necha darsga sababsiz kelmadi',
  OVERDUE_FOLLOWUPS: 'Managerda muddati o‘tgan follow-uplar ko‘p',
  UNPAID_SALARY: 'Tasdiqlangan maosh muddatida to‘lanmagan',
  BUDGET_EXCEEDED: 'Kategoriya xarajati oylik rejadan oshdi',
  LOW_GROUP_CAPACITY: 'Faol guruhda bo‘sh o‘rinlar ko‘p',
  SALES_TARGET_ACHIEVED: 'Manager oylik rejasini bajardi',
  CONVERSION_DROP: 'Sotuv konversiyasi o‘tgan oyning shu davriga nisbatan tushdi',
  DROPOUT_INCREASE: 'Ketgan o‘quvchilar o‘tgan oyning shu davriga nisbatan ko‘paydi',
  CASH_SHORTAGE: '30 kunlik prognozda majburiyatlarga mablag‘ yetmaydi',
  PENDING_EXPENSE_APPROVAL: 'Xarajat belgilangan kundan ortiq tasdiq kutmoqda',
  DOCUMENT_EXPIRING: 'O‘qituvchi yoki xodim shartnomasi, pasporti muddati tugamoqda yoki o‘tgan',
};

export const ALERT_SEVERITY_TONES: Record<AlertSeverity, BadgeTone> = {
  CRITICAL: 'red',
  WARNING: 'yellow',
  INFO: 'blue',
  SUCCESS: 'green',
};

export const TARGET_TYPE_ORDER: readonly TargetType[] = ['LEADS', 'SALES', 'REVENUE'];

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  LEADS: 'Leadlar',
  SALES: 'Sotuvlar',
  REVENUE: 'Tushum',
};
