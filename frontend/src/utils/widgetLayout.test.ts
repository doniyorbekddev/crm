import { describe, expect, it } from 'vitest';
import { moveWidget, parseWidgetLayout, resolveWidgets } from './widgetLayout';
import type { WidgetDefinition } from './widgetLayout';

const WIDGETS: WidgetDefinition[] = [
  { key: 'kpis', label: 'KPI', span: 'full' },
  { key: 'charts', label: 'Grafik', span: 'twoThirds' },
  { key: 'tasks', label: 'Vazifalar', span: 'third', available: false },
  { key: 'activity', label: 'Faoliyat', span: 'full' },
];

describe('vidjet tartibi', () => {
  it('saqlangan tartib qo‘llanadi, noma’lum va ruxsatsiz vidjetlar tashlanadi, yangilari oxiriga qo‘shiladi', () => {
    const resolved = resolveWidgets(WIDGETS, { order: ['charts', 'eski', 'tasks', 'kpis'], hidden: ['kpis'] });
    expect(resolved.map((widget) => [widget.key, widget.visible])).toEqual([
      ['charts', true],
      ['kpis', false],
      ['activity', true],
    ]);
    expect(resolveWidgets(WIDGETS, null).map((widget) => widget.key)).toEqual(['kpis', 'charts', 'activity']);
  });

  it('surish chegaradan chiqmaydi; noto‘g‘ri saqlangan qiymat e’tiborga olinmaydi', () => {
    expect(moveWidget(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveWidget(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveWidget(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
    expect(parseWidgetLayout({ order: ['a'], hidden: [] })).toEqual({ order: ['a'], hidden: [] });
    expect(parseWidgetLayout({ order: 'a' })).toBeNull();
    expect(parseWidgetLayout(null)).toBeNull();
  });
});
