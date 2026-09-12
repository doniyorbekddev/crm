import type { DebtStatus, PaymentMethod } from '../generated/prisma/client.js';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Plastik karta',
  CLICK: 'Click',
  PAYME: 'Payme',
  UZUM: 'Uzum',
  BANK: 'Bank o‘tkazmasi',
  OTHER: 'Boshqa',
};

export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = ['CASH', 'CARD', 'CLICK', 'PAYME', 'UZUM', 'BANK', 'OTHER'];

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  UNPAID: 'To‘lanmagan',
  PARTIAL: 'Qisman to‘langan',
  PAID: 'To‘langan',
};

/** 45 → "PM-000045" */
export function formatPaymentNumber(value: number): string {
  return `PM-${String(value).padStart(6, '0')}`;
}
