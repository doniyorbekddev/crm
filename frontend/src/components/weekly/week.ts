/** "2026-09-21" + n hafta → "2026-09-14" (sana satri, vaqt mintaqasisiz) */
export function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}
