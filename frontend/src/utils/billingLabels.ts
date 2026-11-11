import { MONTH_OPTIONS } from '@/utils/teacherLabels';

/** "2026-10" → "Oktabr 2026" */
export function periodKeyLabel(key: string): string {
  const [year = 0, month = 1] = key.split('-').map(Number);
  return `${MONTH_OPTIONS.find((option) => option.value === month)?.label ?? month} ${year}`;
}

/** Eng eski ochiq oydan boshlab (server bilan bir xil qoida) — oynada ko'rsatish uchun */
export function previewAutoAllocation(open: Array<{ key: string; remaining: number }>, amount: number): Array<{ key: string; amount: number }> {
  let left = amount;
  const result: Array<{ key: string; amount: number }> = [];
  for (const item of [...open].sort((a, b) => a.key.localeCompare(b.key))) {
    if (left <= 0) break;
    const take = Math.min(item.remaining, left);
    if (take > 0) {
      result.push({ key: item.key, amount: take });
      left -= take;
    }
  }
  return result;
}

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Bugungi sana o'quv markaz vaqti bo'yicha ("2026-11-11") — qurilma soat mintaqasi boshqa bo'lsa ham */
export function businessToday(now: Date = new Date()): string {
  return BUSINESS_DATE.format(now);
}

/** Ikki sana orasidagi kunlar ("2026-11-11" → "2026-11-15" = 4) */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface DueCountdown {
  kind: 'overdue' | 'today' | 'upcoming';
  days: number;
  text: string;
}

/** To'lov muddatiga nisbatan: "6 kun kechikdi" / "Bugun to'lov kuni" / "4 kun qoldi" */
export function dueCountdown(dueDate: string, today: string = businessToday()): DueCountdown {
  const days = daysBetweenDates(today, dueDate);
  if (days < 0) return { kind: 'overdue', days: -days, text: `${-days} kun kechikdi` };
  if (days === 0) return { kind: 'today', days: 0, text: 'Bugun to‘lov kuni' };
  return { kind: 'upcoming', days, text: `${days} kun qoldi` };
}

/** Tanlangan oylarga (eskisidan) summani taqsimlaydi: har oyga qoldig'igacha; ortgani `excess` */
export function allocateToSelected(selected: Array<{ key: string; remaining: number }>, amount: number): { items: Array<{ key: string; amount: number }>; excess: number } {
  const items = previewAutoAllocation(selected, amount);
  const used = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, excess: Math.max(amount - used, 0) };
}
