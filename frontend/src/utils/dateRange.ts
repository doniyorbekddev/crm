/** Analitika sahifalari uchun umumiy davr tanlovi (promt 60-bo‘lim) */

export type DateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  all: 'Barcha vaqt',
  today: 'Bugun',
  yesterday: 'Kecha',
  this_week: 'Shu hafta',
  last_week: 'O‘tgan hafta',
  this_month: 'Shu oy',
  last_month: 'O‘tgan oy',
  this_quarter: 'Shu chorak',
  this_year: 'Shu yil',
  last_year: 'O‘tgan yil',
  custom: 'Oraliq tanlash',
};

export const STANDARD_PRESETS: readonly DateRangePreset[] = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'last_year',
  'custom',
];

export interface DateRange {
  from: string;
  to: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Mahalliy sana "YYYY-MM-DD" ko‘rinishida */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Tayyor davrni sanalarga aylantiradi. Hafta dushanbadan boshlanadi; joriy davrlar bugun bilan tugaydi.
 * `all` va `custom` uchun null (sana tanlovchining o‘zi beradi).
 */
export function resolveDateRange(preset: DateRangePreset, today: Date = new Date()): DateRange | null {
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  const todayString = toDateString(today);
  const weekStart = day - ((today.getDay() + 6) % 7);

  switch (preset) {
    case 'today':
      return { from: todayString, to: todayString };
    case 'yesterday': {
      const yesterday = toDateString(new Date(year, month, day - 1));
      return { from: yesterday, to: yesterday };
    }
    case 'this_week':
      return { from: toDateString(new Date(year, month, weekStart)), to: todayString };
    case 'last_week':
      return { from: toDateString(new Date(year, month, weekStart - 7)), to: toDateString(new Date(year, month, weekStart - 1)) };
    case 'this_month':
      return { from: toDateString(new Date(year, month, 1)), to: todayString };
    case 'last_month':
      return { from: toDateString(new Date(year, month - 1, 1)), to: toDateString(new Date(year, month, 0)) };
    case 'this_quarter':
      return { from: toDateString(new Date(year, month - (month % 3), 1)), to: todayString };
    case 'this_year':
      return { from: toDateString(new Date(year, 0, 1)), to: todayString };
    case 'last_year':
      return { from: toDateString(new Date(year - 1, 0, 1)), to: toDateString(new Date(year - 1, 11, 31)) };
    case 'all':
    case 'custom':
      return null;
  }
}
