import type { BadgeTone } from '@/components/ui/Badge';
import type { Gender, LeadPriority, LeadStatus, LeadTemperature } from '@/types/lead';

/** Sotuv jarayoni bo‘yicha tartib (Kanban ustunlari, tablar) */
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

export const LEAD_STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  NEW: 'blue',
  CONTACTED: 'purple',
  CALLBACK: 'yellow',
  INTERESTED: 'purple',
  TRIAL_BOOKED: 'yellow',
  TRIAL_ATTENDED: 'yellow',
  NEGOTIATION: 'blue',
  WON: 'green',
  LOST: 'red',
};

/** Kanban ustunlari va badge’lardagi rangli nuqta */
export const LEAD_STATUS_DOTS: Record<LeadStatus, string> = {
  NEW: 'bg-sky-500',
  CONTACTED: 'bg-indigo-500',
  CALLBACK: 'bg-amber-500',
  INTERESTED: 'bg-violet-500',
  TRIAL_BOOKED: 'bg-orange-500',
  TRIAL_ATTENDED: 'bg-teal-500',
  NEGOTIATION: 'bg-blue-600',
  WON: 'bg-emerald-500',
  LOST: 'bg-red-500',
};

export const LEAD_PRIORITY_ORDER: readonly LeadPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: 'Past',
  MEDIUM: 'O‘rta',
  HIGH: 'Yuqori',
  URGENT: 'Shoshilinch',
};

export const LEAD_PRIORITY_TONES: Record<LeadPriority, BadgeTone> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'yellow',
  URGENT: 'red',
};

/** Qizish darajasi — ball oralig'i backend'dagi `temperatureFor()` bilan bir xil */
export const LEAD_TEMPERATURE_ORDER: readonly LeadTemperature[] = ['VERY_HOT', 'HOT', 'WARM', 'COLD'];

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  COLD: 'Sovuq',
  WARM: 'Iliq',
  HOT: 'Qizigan',
  VERY_HOT: 'Juda qizigan',
};

export const LEAD_TEMPERATURE_TONES: Record<LeadTemperature, BadgeTone> = {
  COLD: 'gray',
  WARM: 'blue',
  HOT: 'yellow',
  VERY_HOT: 'red',
};

/** Ball oralig'ini xodimga tushuntirish uchun */
export const LEAD_TEMPERATURE_HINTS: Record<LeadTemperature, string> = {
  COLD: '0–39 ball',
  WARM: '40–69 ball',
  HOT: '70–89 ball',
  VERY_HOT: '90–100 ball',
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Erkak',
  FEMALE: 'Ayol',
};

/** Yo‘qotilgan leadlar uchun tez-tez uchraydigan sabablar */
export const LOST_REASONS: readonly string[] = [
  'Narx qimmatlik qildi',
  'Boshqa o‘quv markazni tanladi',
  'Dars vaqti to‘g‘ri kelmadi',
  'Aloqaga chiqmayapti',
  'Qiziqishi yo‘qoldi',
];

export function leadFullName(lead: { firstName: string; lastName: string | null }): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
}
