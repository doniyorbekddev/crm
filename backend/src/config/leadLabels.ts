import type { LeadPriority, LeadStatus } from '../generated/prisma/client.js';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: 'Bog‘lanildi',
  CALLBACK: 'Qayta qo‘ng‘iroq',
  INTERESTED: 'Qiziqdi',
  TRIAL_BOOKED: 'Sinov darsiga yozildi',
  TRIAL_ATTENDED: 'Sinov darsiga keldi',
  NEGOTIATION: 'Muzokara',
  WON: 'Sotildi',
  LOST: 'Yo‘qotildi',
};

/** Kanban ustunlari va hisobotlardagi tartib (sotuv jarayoni bo‘yicha) */
export const LEAD_STATUS_ORDER: readonly LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'CALLBACK',
  'INTERESTED',
  'TRIAL_BOOKED',
  'TRIAL_ATTENDED',
  'NEGOTIATION',
  'WON',
  'LOST',
];

/** 123 → "L-000123" */
export function formatLeadNumber(value: number): string {
  return `L-${String(value).padStart(6, '0')}`;
}

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: 'Past',
  MEDIUM: 'O‘rta',
  HIGH: 'Yuqori',
  URGENT: 'Shoshilinch',
};
