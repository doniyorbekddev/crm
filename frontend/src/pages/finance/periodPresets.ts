/** Ro'yxat filtrlari uchun tez davrlar. Sanalar mahalliy (o'quv markaz) kun bo'yicha, `YYYY-MM-DD`. */
export type PeriodPreset = 'all' | 'this-month' | 'last-month' | 'quarter' | 'this-year';

export const PERIOD_PRESETS: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: 'all', label: 'Hammasi' },
  { value: 'this-month', label: 'Shu oy' },
  { value: 'last-month', label: 'O‘tgan oy' },
  { value: 'quarter', label: '3 oy' },
  { value: 'this-year', label: 'Bu yil' },
];

const pad = (value: number) => String(value).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function presetRange(preset: PeriodPreset, today: Date = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (preset) {
    case 'this-month':
      return { from: isoDay(new Date(year, month, 1)), to: isoDay(today) };
    case 'last-month':
      return { from: isoDay(new Date(year, month - 1, 1)), to: isoDay(new Date(year, month, 0)) };
    case 'quarter':
      // Joriy oy bilan birga oxirgi uch oy
      return { from: isoDay(new Date(year, month - 2, 1)), to: isoDay(today) };
    case 'this-year':
      return { from: isoDay(new Date(year, 0, 1)), to: isoDay(today) };
    default:
      return { from: '', to: '' };
  }
}

/** Qo'lda kiritilgan sanalar biror tez davrga mos kelsa — o'sha; aks holda `null` (oraliq) */
export function matchPreset(from: string, to: string, today: Date = new Date()): PeriodPreset | null {
  return PERIOD_PRESETS.find((preset) => {
    const range = presetRange(preset.value, today);
    return range.from === from && range.to === to;
  })?.value ?? null;
}
