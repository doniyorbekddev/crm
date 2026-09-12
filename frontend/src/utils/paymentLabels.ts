import type { BadgeTone } from '@/components/ui/Badge';
import type { DebtRange, PaymentMethod } from '@/types/payment';

export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = ['CASH', 'CARD', 'CLICK', 'PAYME', 'UZUM', 'BANK', 'OTHER'];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Plastik karta',
  CLICK: 'Click',
  PAYME: 'Payme',
  UZUM: 'Uzum',
  BANK: 'Bank o‘tkazmasi',
  OTHER: 'Boshqa',
};

export const PAYMENT_METHOD_TONES: Record<PaymentMethod, BadgeTone> = {
  CASH: 'green',
  CARD: 'blue',
  CLICK: 'purple',
  PAYME: 'purple',
  UZUM: 'purple',
  BANK: 'gray',
  OTHER: 'gray',
};

export const DEBT_RANGE_ORDER: readonly DebtRange[] = ['all', '1m-plus', '500k-1m', 'upto500k', 'zero'];

export const DEBT_RANGE_LABELS: Record<DebtRange, string> = {
  all: 'Barchasi',
  zero: 'Qarzi yo‘q',
  upto500k: '500 mingtacha',
  '500k-1m': '500 ming – 1 mln',
  '1m-plus': '1 mln dan ortiq',
};
