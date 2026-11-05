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
