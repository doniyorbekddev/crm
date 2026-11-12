export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'DUE_TODAY' | 'UPCOMING' | 'OVERDUE' | 'CANCELLED';

/** Oy majburiyati holati */
export type ChargeStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

/** Qarzdorlar ro‘yxatida to‘lov jadvali bo‘yicha filtr */
export type DebtDueFilter = 'all' | 'overdue' | 'upcoming';

export interface Installment {
  id: string;
  sequence: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
  overdueDays: number;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Moliyaviy oyi yopilgan — qayta tuzishda o'zgarmaydi */
  locked: boolean;
}

/** Oylik majburiyat: shu oyga tushgan qismlar yig'indisi */
export interface ScheduleMonth {
  /** "2026-10" */
  key: string;
  year: number;
  month: number;
  amount: number;
  paid: number;
  remaining: number;
  cancelledAmount: number;
  /** Shu oyga aniq biriktirilgan to'lov */
  allocated: number;
  status: ChargeStatus;
}

export interface PaymentSchedule {
  studentId: string;
  /** Oylik to'lov — har oy shu summa */
  monthlyFee: number;
  /** Shartnoma jami summasi (jadvaldagi oylar yig'indisi) */
  contractTotal: number;
  paid: number;
  scheduledTotal: number;
  /** Jadval yig‘indisi shartnomadan farq qiladi — qayta tuzish kerak */
  mismatch: boolean;
  dueToDate: number;
  overdueAmount: number;
  overdueDays: number;
  nextDue: { dueDate: string; amount: number } | null;
  installments: Installment[];
  months: ScheduleMonth[];
}

export interface CancelChargesPayload {
  months: string[];
  reason: string;
}

export interface GenerateSchedulePayload {
  count: number;
  firstDueDate: string;
}

export interface ReplaceSchedulePayload {
  installments: Array<{ dueDate: string; amount: number; note?: string }>;
}
