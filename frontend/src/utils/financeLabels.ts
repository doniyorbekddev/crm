import type { BadgeTone } from '@/components/ui/Badge';
import type { AccountType, ExpenseStatus, TransactionStatus, TransactionType } from '@/types/finance';

export const TRANSACTION_TYPE_ORDER: readonly TransactionType[] = ['INCOME', 'EXPENSE', 'TRANSFER', 'REFUND'];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Tushum',
  EXPENSE: 'Xarajat',
  TRANSFER: 'O‘tkazma',
  REFUND: 'Qaytarish',
};

export const TRANSACTION_TYPE_TONES: Record<TransactionType, BadgeTone> = {
  INCOME: 'green',
  EXPENSE: 'red',
  TRANSFER: 'blue',
  REFUND: 'yellow',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  COMPLETED: 'Amalda',
  VOID: 'Bekor qilingan',
  REVERSED: 'Qaytarilgan',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: 'Naqd',
  BANK: 'Bank',
  CARD: 'Karta',
  UZCARD: 'Uzcard',
  HUMO: 'Humo',
  CLICK: 'Click',
  PAYME: 'Payme',
  UZUM: 'Uzum',
  OTHER: 'Boshqa',
};

/** Daftardagi yozuv qaysi moduldan kelgani */
export const TRANSACTION_SOURCE_LABELS: Record<string, string> = {
  payment: 'O‘quvchi to‘lovi',
  income: 'Tushum',
  expense: 'Xarajat',
  teacherSalaryPayment: 'Maosh to‘lovi',
  transfer: 'Kassa o‘tkazmasi',
  paymentRefund: 'To‘lov qaytarildi',
};

export const CASH_FLOW_PERIODS = [
  { value: 'day', label: 'Kunlik' },
  { value: 'week', label: 'Haftalik' },
  { value: 'month', label: 'Oylik' },
] as const;

export const EXPENSE_STATUS_ORDER = ['PENDING', 'APPROVED', 'UPCOMING', 'PAID', 'REJECTED'] as const satisfies readonly ExpenseStatus[];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  UPCOMING: 'Kutilayotgan',
  PENDING: 'Tasdiq kutmoqda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  PAID: 'To‘langan',
};

export const EXPENSE_STATUS_TONES: Record<ExpenseStatus, BadgeTone> = {
  UPCOMING: 'blue',
  PENDING: 'yellow',
  APPROVED: 'purple',
  REJECTED: 'gray',
  PAID: 'green',
};
