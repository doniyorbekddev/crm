/** Dashboard vidjetlari: tartib va yashirish (promt 59-bo‘lim) */

export type WidgetSpan = 'full' | 'twoThirds' | 'half' | 'third';

export interface WidgetDefinition<K extends string = string> {
  key: K;
  label: string;
  span: WidgetSpan;
  /** Ruxsat bo‘lmasa — ro‘yxatda ham ko‘rinmaydi */
  available?: boolean;
}

export interface WidgetLayout {
  order: string[];
  hidden: string[];
}

/** lg ekranda 6 ustunli to‘r */
export const WIDGET_SPAN_CLASSES: Record<WidgetSpan, string> = {
  full: 'lg:col-span-6',
  twoThirds: 'lg:col-span-4',
  half: 'lg:col-span-3',
  third: 'lg:col-span-2',
};

export function parseWidgetLayout(value: unknown): WidgetLayout | null {
  if (!value || typeof value !== 'object') return null;
  const { order, hidden } = value as Record<string, unknown>;
  const isStrings = (list: unknown): list is string[] => Array.isArray(list) && list.every((item) => typeof item === 'string');
  return isStrings(order) && isStrings(hidden) ? { order, hidden } : null;
}

/**
 * Saqlangan tartibni joriy vidjetlarga qo‘llaydi: noma’lum kalitlar tashlanadi,
 * yangi qo‘shilgan vidjetlar standart o‘rnida oxiriga qo‘shiladi.
 */
export function resolveWidgets<K extends string>(
  definitions: ReadonlyArray<WidgetDefinition<K>>,
  layout: WidgetLayout | null,
): Array<WidgetDefinition<K> & { visible: boolean }> {
  const available = definitions.filter((definition) => definition.available !== false);
  const byKey = new Map(available.map((definition) => [definition.key as string, definition]));
  const ordered = (layout?.order ?? []).flatMap((key) => {
    const definition = byKey.get(key);
    if (!definition) return [];
    byKey.delete(key);
    return [definition];
  });
  const rest = available.filter((definition) => byKey.has(definition.key));
  const hidden = new Set(layout?.hidden ?? []);
  return [...ordered, ...rest].map((definition) => ({ ...definition, visible: !hidden.has(definition.key) }));
}

/** Vidjetni bir pog‘ona yuqoriga (-1) yoki pastga (+1) suradi */
export function moveWidget(order: string[], key: string, direction: -1 | 1): string[] {
  const index = order.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
