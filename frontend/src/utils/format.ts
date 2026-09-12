import { format, isValid } from 'date-fns';

const numberFormatter = new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 });

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return isValid(date) ? date : null;
}

/** 1500000 → "1 500 000 so‘m" */
export function formatMoney(value: number | string | null | undefined): string {
  return `${numberFormatter.format(toNumber(value))} so‘m`;
}

export function formatNumber(value: number | string | null | undefined): string {
  return numberFormatter.format(toNumber(value));
}

/** → "11.09.2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'dd.MM.yyyy') : '—';
}

/** → "11.09.2026 15:30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'dd.MM.yyyy HH:mm') : '—';
}

/** → "15:30" */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'HH:mm') : '—';
}

/** "+998901234567" → "+998 90 123 45 67" (boshqa formatlar o‘zgarishsiz qaytadi) */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value);
  return match ? `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value;
}

/** Soniyalarni o‘qiladigan ko‘rinishga o‘giradi: 3725 → "1 soat 2 daqiqa" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const restSeconds = seconds % 60;

  if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`;
  if (hours > 0) return minutes > 0 ? `${hours} soat ${minutes} daqiqa` : `${hours} soat`;
  if (minutes > 0) return restSeconds > 0 ? `${minutes} daqiqa ${restSeconds} soniya` : `${minutes} daqiqa`;
  return `${restSeconds} soniya`;
}

/** ISO sana → <input type="datetime-local"> qiymati (brauzerning mahalliy vaqti) */
export function toDateTimeInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="datetime-local"> qiymati → ISO (serverga yuborish uchun) */
export function fromDateTimeInputValue(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isValid(date) ? date.toISOString() : undefined;
}

/** "5 daqiqa oldin", "2 soat oldin", "3 kun oldin" — bildirishnomalar uchun */
export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'hozirgina';
  if (minutes < 60) return `${minutes} daqiqa oldin`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} kun oldin`;

  return formatDate(date);
}
