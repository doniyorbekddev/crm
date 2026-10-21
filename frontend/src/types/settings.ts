export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface WorkingDay {
  day: Weekday;
  isOpen: boolean;
  from: string;
  to: string;
}

/** Hozir faqat qo'llab-quvvatlanadiganlar (backend bilan bir xil) */
export type AcademyCurrency = 'UZS';
export type AcademyLanguage = 'uz';

export interface AcademySettingsPayload {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  workingHours: WorkingDay[];
  currency: AcademyCurrency;
  academicYear: { start: string; end: string };
  timezone: string;
  defaultLanguage: AcademyLanguage;
}

export interface AcademySettings extends AcademySettingsPayload {
  logoUrl: string | null;
  configured: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface Branding {
  name: string;
  logoUrl: string | null;
  currency: AcademyCurrency;
  defaultLanguage: AcademyLanguage;
}

export type SmsRecipients = 'PARENTS' | 'PARENTS_AND_STUDENTS';

export interface SmsSettingsPayload {
  enabled: boolean;
  types: string[];
  recipients: SmsRecipients;
  dailyLimit: number;
}

/** SMS zaxira kanali (Eskiz.uz). Kalitlar serverda — bu yerda faqat "sozlanganmi" */
export interface SmsSettings extends SmsSettingsPayload {
  configured: boolean;
  sender: string;
  availableTypes: Array<{ type: string; label: string; example: string }>;
  today: { sent: number; failed: number; skipped: number; pending: number };
  updatedAt: string | null;
}
