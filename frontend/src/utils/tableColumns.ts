import type { ReactNode } from 'react';

/**
 * Jadval ustunlari (TZ 3.1 GAP-03): ko'rsatish/yashirish, tartib, kenglik, standartga qaytarish.
 * Sozlama xodim profilida (`table.<name>.columns`). **Faqat ko'rinish** — ma'lumot va ruxsat backendda.
 */
export const TABLE_NAMES = ['students', 'leads', 'payments', 'debts', 'groups', 'parents', 'teachers', 'employees'] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export interface ColumnDef<Row> {
  key: string;
  /** Sozlamalar oynasidagi nom (va sarlavha, `header` berilmasa) */
  label: string;
  header?: ReactNode;
  cell: (row: Row) => ReactNode;
  thClassName?: string;
  /** Qatorga bog'liq bo'lishi mumkin (masalan, o'chirilgan to'lov chizilgan) */
  tdClassName?: string | ((row: Row) => string);
  /** Katak bosilganda qatorning `onClick` i ishlamasin (amallar menyusi) */
  stopRowClick?: boolean;
  /** Yashirib bo'lmaydi (masalan, qator egasi nomi) */
  required?: boolean;
  /** Sozlamalarda ko'rsatilmaydi va doim oxirida (amallar menyusi) */
  fixed?: boolean;
  /** Standart holatda yashirin */
  defaultHidden?: boolean;
}

export interface ColumnState {
  key: string;
  visible: boolean;
  width?: number | null;
}

export interface TableColumnsLayout {
  columns: ColumnState[];
}

export type ResolvedColumn<Row> = ColumnDef<Row> & { visible: boolean; width: number | null };

export const COLUMN_WIDTHS = [
  { value: null, label: 'Avto' },
  { value: 120, label: 'Tor' },
  { value: 200, label: 'O‘rta' },
  { value: 320, label: 'Keng' },
] as const;

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/** Saqlangan qiymat (server/eski versiya) — buzuq bo'lsa null, noto'g'ri qatorlar tashlanadi */
export function parseTableColumns(value: unknown): TableColumnsLayout | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { columns?: unknown }).columns)) return null;
  const seen = new Set<string>();
  const columns: ColumnState[] = [];
  for (const raw of (value as { columns: unknown[] }).columns) {
    if (!raw || typeof raw !== 'object') continue;
    const { key, visible, width } = raw as Record<string, unknown>;
    if (typeof key !== 'string' || !KEY_PATTERN.test(key) || seen.has(key) || typeof visible !== 'boolean') continue;
    seen.add(key);
    columns.push({ key, visible, width: typeof width === 'number' && width >= 60 && width <= 640 ? Math.round(width) : null });
  }
  return { columns };
}

/**
 * Ta'riflar + saqlangan sozlama → yakuniy ustunlar. Saqlangan tartib birinchi, yangi qo'shilgan ustunlar
 * (sozlamada yo'q) o'z joyida oxirida; o'chirilgan ustun sozlamadan tashlanadi; majburiy ustun doim ko'rinadi;
 * `fixed` ustunlar doim oxirida.
 */
export function resolveColumns<Row>(defs: ReadonlyArray<ColumnDef<Row>>, layout: TableColumnsLayout | null): Array<ResolvedColumn<Row>> {
  const configurable = defs.filter((def) => !def.fixed);
  const byKey = new Map(configurable.map((def) => [def.key, def]));
  const saved = new Map((layout?.columns ?? []).map((column) => [column.key, column]));
  const ordered: Array<ColumnDef<Row>> = [];
  for (const column of layout?.columns ?? []) {
    const def = byKey.get(column.key);
    if (def) {
      ordered.push(def);
      byKey.delete(column.key);
    }
  }
  const rest = configurable.filter((def) => byKey.has(def.key));
  const resolved = [...ordered, ...rest].map((def) => {
    const state = saved.get(def.key);
    return { ...def, visible: def.required ? true : (state?.visible ?? !def.defaultHidden), width: state?.width ?? null };
  });
  return [...resolved, ...defs.filter((def) => def.fixed).map((def) => ({ ...def, visible: true, width: null }))];
}

export function toLayout<Row>(columns: ReadonlyArray<ResolvedColumn<Row>>): TableColumnsLayout {
  return {
    columns: columns.filter((column) => !column.fixed).map((column) => ({ key: column.key, visible: column.visible, ...(column.width ? { width: column.width } : {}) })),
  };
}

/** Ustunni bir pog'ona suradi (`fixed` ustunlar hisobga olinmaydi) */
export function moveColumn<Row>(columns: ReadonlyArray<ResolvedColumn<Row>>, key: string, direction: -1 | 1): Array<ResolvedColumn<Row>> {
  const configurable = columns.filter((column) => !column.fixed);
  const index = configurable.findIndex((column) => column.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= configurable.length) return [...columns];
  const next = [...configurable];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return [...next, ...columns.filter((column) => column.fixed)];
}
