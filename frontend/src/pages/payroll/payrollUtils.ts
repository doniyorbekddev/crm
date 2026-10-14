import type { KpiMetric, KpiUnit, PayeeKind } from '@/types/payroll';
import type { SalaryPeriod } from '@/types/teacher';
import { formatNumber } from '@/utils/format';

/** Xodim maosh profili manzili (tanlangan oy bilan) */
export function payrollProfileUrl(type: PayeeKind, id: string, month?: { year: number; month: number }): string {
  const base = `/salaries/${type === 'TEACHER' ? 'teacher' : 'employee'}/${id}`;
  return month ? `${base}?year=${month.year}&month=${month.month}` : base;
}

/** O'zgaruvchan qism: dars, o'quvchi va tushumdan ulush */
export function variableOf(period: SalaryPeriod): number {
  return period.lessonAmount + period.studentAmount + period.percentageAmount;
}

/** Bonus (model + yozuvlar) minus jarima */
export function adjustmentsOf(period: SalaryPeriod): number {
  return period.bonus - period.penalty;
}

export type PaymentState = 'NONE' | 'ADVANCE' | 'PARTIAL' | 'PAID';

export function paymentStateOf(period: SalaryPeriod): PaymentState {
  if (period.status === 'PAID' || (period.lockedAt && period.remainingAmount <= 0 && period.totalAmount > 0)) return 'PAID';
  if (period.paidAmount <= 0) return 'NONE';
  return period.lockedAt ? 'PARTIAL' : 'ADVANCE';
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  NONE: 'To‘lanmagan',
  ADVANCE: 'Avans berilgan',
  PARTIAL: 'Qisman to‘langan',
  PAID: 'To‘langan',
};

export const PAYMENT_STATE_TONES: Record<PaymentState, 'neutral' | 'info' | 'warning' | 'success'> = {
  NONE: 'neutral',
  ADVANCE: 'info',
  PARTIAL: 'warning',
  PAID: 'success',
};

/** Maosh modeli qisqa nomi — xodimda KPI bo'lsa "Belgilangan + KPI" */
export function modelLabelOf(period: SalaryPeriod, salaryTypeLabel: string): string {
  if (period.payee.type === 'EMPLOYEE') return period.kpiDetails && period.kpiDetails.results.length > 0 ? 'Belgilangan + KPI' : 'Belgilangan';
  return salaryTypeLabel;
}

export const KPI_METRIC_OPTIONS: ReadonlyArray<{ value: KpiMetric; label: string; unit: KpiUnit; hint: string; forRole: string }> = [
  {
    value: 'ACQUIRED_STUDENTS',
    label: 'Jalb qilingan o‘quvchilar',
    unit: 'COUNT',
    forRole: 'Operator, sotuv',
    hint: 'Lead o‘quvchiga aylangan paytda xodim mas’ul bo‘lgan va o‘quvchi shu oyda birinchi to‘lovini qilgan. Bekor qilingan yoki to‘liq qaytarilgan to‘lov va takroriy o‘quvchi sanalmaydi.',
  },
  {
    value: 'LEAD_CONVERSION',
    label: 'Lead konversiyasi',
    unit: 'PERCENT',
    forRole: 'Operator, sotuv',
    hint: 'Oyda xodimga biriktirilgan yangi leadlardan shu oyda sotuvga aylangani.',
  },
  {
    value: 'PAYMENT_COLLECTION',
    label: 'To‘lov yig‘ilishi',
    unit: 'PERCENT',
    forRole: 'Administrator',
    hint: 'Filialda muddati shu oyga to‘g‘ri kelgan to‘lov jadvali summasidan yig‘ilgan sof tushum (qaytarishlar ayirilgan).',
  },
  {
    value: 'ATTENDANCE_RATE',
    label: 'Filial davomati',
    unit: 'PERCENT',
    forRole: 'Administrator',
    hint: 'Filialdagi oylik davomat belgilari ichida kelgan va kechikkanlar ulushi.',
  },
  {
    value: 'STUDENT_RETENTION',
    label: 'O‘quvchilarni saqlash',
    unit: 'PERCENT',
    forRole: 'Administrator',
    hint: '100 − oyda o‘qishni tashlaganlar ulushi (filial bo‘yicha).',
  },
  {
    value: 'TASK_COMPLETION',
    label: 'Vazifalarni o‘z vaqtida bajarish',
    unit: 'PERCENT',
    forRole: 'Har qanday lavozim',
    hint: 'Xodimga biriktirilgan, muddati shu oyda bo‘lgan vazifalardan muddatigacha bajarilgani.',
  },
  {
    value: 'MANUAL',
    label: 'Qo‘lda kiritiladigan natija',
    unit: 'PERCENT',
    forRole: 'Har qanday lavozim',
    hint: 'Masalan, o‘quvchi va ota-ona mamnuniyati so‘rovi. Natija har oy sabab bilan kiritiladi; kiritilmasa bahoga kirmaydi.',
  },
];

/** "12 ta" yoki "85%" */
export function formatKpiValue(value: number | null, unit: KpiUnit): string {
  if (value === null) return '—';
  return unit === 'COUNT' ? `${formatNumber(value)} ta` : `${formatNumber(value)}%`;
}

