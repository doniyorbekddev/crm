import type { BadgeTone } from '@/components/ui/Badge';
import type { PayrollAdjustmentCategory, PayrollAdjustmentType, SalaryPaymentKind, SalaryPeriodStatus, SalaryType } from '@/types/teacher';
import { formatMoney } from './format';

export const SALARY_TYPE_ORDER: readonly SalaryType[] = ['FIXED', 'PER_LESSON', 'PER_STUDENT', 'PERCENTAGE', 'MIXED'];

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  FIXED: 'Belgilangan maosh',
  PER_LESSON: 'Dars uchun',
  PER_STUDENT: 'O‘quvchi uchun',
  PERCENTAGE: 'Tushumdan ulush',
  MIXED: 'Aralash',
};

export const SALARY_TYPE_HINTS: Record<SalaryType, string> = {
  FIXED: 'Har oy bir xil summa to‘lanadi',
  PER_LESSON: 'O‘tkazilgan darslar soniga ko‘paytiriladi',
  PER_STUDENT: 'Guruhlaridagi faol o‘quvchilar soniga ko‘paytiriladi',
  PERCENTAGE: 'Guruhlari o‘quvchilaridan tushgan to‘lovdan foiz',
  MIXED: 'Asosiy maosh + dars/o‘quvchi/ulush + bonus',
};

export const SALARY_STATUS_ORDER: readonly SalaryPeriodStatus[] = [
  'PENDING',
  'CALCULATED',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAID',
];

export const SALARY_STATUS_LABELS: Record<SalaryPeriodStatus, string> = {
  PENDING: 'Hisoblanmagan',
  CALCULATED: 'Hisoblandi',
  APPROVED: 'Tasdiqlandi',
  PARTIALLY_PAID: 'Qisman to‘langan',
  PAID: 'To‘langan',
};

export const SALARY_STATUS_TONES: Record<SalaryPeriodStatus, BadgeTone> = {
  PENDING: 'gray',
  CALCULATED: 'blue',
  APPROVED: 'yellow',
  PARTIALLY_PAID: 'purple',
  PAID: 'green',
};

export const MONTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Yanvar' },
  { value: 2, label: 'Fevral' },
  { value: 3, label: 'Mart' },
  { value: 4, label: 'Aprel' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Iyun' },
  { value: 7, label: 'Iyul' },
  { value: 8, label: 'Avgust' },
  { value: 9, label: 'Sentabr' },
  { value: 10, label: 'Oktabr' },
  { value: 11, label: 'Noyabr' },
  { value: 12, label: 'Dekabr' },
];

/** Maosh modelining qisqa tavsifi: "Dars uchun · 120 000 so‘m" */
export function salaryRuleSummary(rule: {
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
}): string {
  const money = (value: number) => formatMoney(value);
  switch (rule.type) {
    case 'FIXED':
      return money(rule.baseSalary);
    case 'PER_LESSON':
      return `${money(rule.perLessonRate)} / dars`;
    case 'PER_STUDENT':
      return `${money(rule.perStudentRate)} / o‘quvchi`;
    case 'PERCENTAGE':
      return `${rule.percentage}% tushumdan`;
    case 'MIXED':
      return [
        rule.baseSalary > 0 ? money(rule.baseSalary) : null,
        rule.perLessonRate > 0 ? `${money(rule.perLessonRate)} / dars` : null,
        rule.perStudentRate > 0 ? `${money(rule.perStudentRate)} / o‘quvchi` : null,
        rule.percentage > 0 ? `${rule.percentage}%` : null,
      ]
        .filter(Boolean)
        .join(' + ');
  }
}

export const ADJUSTMENT_TYPE_LABELS: Record<PayrollAdjustmentType, string> = {
  BONUS: 'Bonus',
  PENALTY: 'Jarima',
};

export const BONUS_CATEGORY_ORDER: readonly PayrollAdjustmentCategory[] = ['PERFORMANCE', 'ATTENDANCE', 'RETENTION', 'MONTHLY', 'SPECIAL', 'OTHER'];
export const PENALTY_CATEGORY_ORDER: readonly PayrollAdjustmentCategory[] = ['LATENESS', 'ABSENCE', 'DISCIPLINE', 'OTHER'];

export const ADJUSTMENT_CATEGORY_LABELS: Record<PayrollAdjustmentCategory, string> = {
  ATTENDANCE: 'Davomat bonusi',
  RETENTION: 'O‘quvchilarni saqlab qolish',
  PERFORMANCE: 'Natija bonusi',
  MONTHLY: 'Oylik bonus',
  SPECIAL: 'Maxsus bonus',
  LATENESS: 'Kechikish',
  ABSENCE: 'Darsni qoldirish',
  DISCIPLINE: 'Intizom',
  OTHER: 'Boshqa',
};

export const SALARY_PAYMENT_KIND_LABELS: Record<SalaryPaymentKind, string> = {
  SALARY: 'Maosh',
  ADVANCE: 'Avans',
};
