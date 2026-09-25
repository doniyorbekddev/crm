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
