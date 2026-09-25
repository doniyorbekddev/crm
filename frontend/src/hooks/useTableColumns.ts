import { useMemo } from 'react';
import { usePreference } from '@/hooks/usePreference';
import { moveColumn, parseTableColumns, resolveColumns, toLayout } from '@/utils/tableColumns';
import type { ColumnDef, ResolvedColumn, TableName } from '@/utils/tableColumns';

export interface TableColumnsControl<Row> {
  /** Barcha ustunlar joriy tartibda (sozlamalar oynasi uchun) */
  columns: Array<ResolvedColumn<Row>>;
  /** Jadvalda chiziladiganlar */
  visibleColumns: Array<ResolvedColumn<Row>>;
  setVisible: (key: string, visible: boolean) => void;
  move: (key: string, direction: -1 | 1) => void;
  setWidth: (key: string, width: number | null) => void;
  reset: () => void;
  customized: boolean;
}

/** Jadval ustunlari holati — xodim profilida saqlanadi (optimistik) */
export function useTableColumns<Row>(table: TableName, defs: ReadonlyArray<ColumnDef<Row>>): TableColumnsControl<Row> {
  const { value, save } = usePreference(`table.${table}.columns`, parseTableColumns);
  const columns = useMemo(() => resolveColumns(defs, value), [defs, value]);

  const persist = (next: Array<ResolvedColumn<Row>>) => save(toLayout(next));
  return {
    columns,
    visibleColumns: columns.filter((column) => column.visible),
    setVisible: (key, visible) => persist(columns.map((column) => (column.key === key && !column.required ? { ...column, visible } : column))),
    move: (key, direction) => persist(moveColumn(columns, key, direction)),
    setWidth: (key, width) => persist(columns.map((column) => (column.key === key ? { ...column, width } : column))),
    reset: () => save({ columns: [] }),
    customized: Boolean(value && value.columns.length > 0),
  };
}
