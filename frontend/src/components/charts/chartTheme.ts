import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * Grafiklar (recharts) uchun yagona uslub. Ranglar CSS o'zgaruvchilari orqali — light/dark o'zi almashadi,
 * komponent ichida hex yozilmaydi. Seriya rangi **ma'no** bo'yicha tanlanadi (tushum — ijobiy, xarajat — salbiy).
 */
export const CHART_COLORS = {
  brand: 'var(--color-chart-brand)',
  positive: 'var(--color-chart-positive)',
  negative: 'var(--color-chart-negative)',
  warning: 'var(--color-chart-warning)',
  accent: 'var(--color-chart-accent)',
  neutral: 'var(--color-chart-neutral)',
} as const;

/** `<CartesianGrid {...CHART_GRID} />` — konteynerda `text-fg-muted` bo'lishi kerak (currentColor) */
export const CHART_GRID = { strokeDasharray: '3 3', stroke: 'currentColor', opacity: 0.15, vertical: false } as const;

/** `<XAxis {...CHART_AXIS} />`, `<YAxis {...CHART_AXIS} />` */
export const CHART_AXIS = { stroke: 'currentColor', fontSize: 11, tickLine: false, axisLine: false } as const;

/** `<Tooltip contentStyle={CHART_TOOLTIP_STYLE} />` */
export const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-surface-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-md)',
  fontSize: 12,
  color: 'var(--color-fg)',
} as const;

export const CHART_LEGEND_STYLE = { fontSize: 12 } as const;

/**
 * `<Legend formatter={chartLegendFormatter} />` — yozuv matn rangida (seriya rangi faqat belgida):
 * seriya ranglari oq fonda matn uchun yetarli kontrast bermaydi.
 */
export function chartLegendFormatter(value: string): ReactNode {
  return createElement('span', { className: 'text-fg-muted' }, value);
}

/** Ustun burchaklari va eng katta eni */
export const CHART_BAR = { radius: [4, 4, 0, 0] as [number, number, number, number], maxBarSize: 28 } as const;

/** O'q yorlig'i: 12 500 000 → "12.5mln" */
export function formatMillions(value: number): string {
  return `${Math.round((value / 1_000_000) * 10) / 10}mln`;
}
