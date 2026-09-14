export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'DUE_TODAY' | 'UPCOMING' | 'OVERDUE';

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
}

export interface PaymentSchedule {
  studentId: string;
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
}

export interface GenerateSchedulePayload {
  count: number;
  firstDueDate: string;
}

export interface ReplaceSchedulePayload {
  installments: Array<{ dueDate: string; amount: number; note?: string }>;
}
