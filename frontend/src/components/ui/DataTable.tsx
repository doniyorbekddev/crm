import { ArrowDown, ArrowUp, ChevronsUpDown, Rows3, Rows4 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import type { ColumnDef } from '@/utils/tableColumns';
import { ActionMenu } from './ActionMenu';
import type { ActionMenuItem } from './ActionMenu';
import { Button } from './Button';
import { Card } from './Card';
import { Checkbox } from './Checkbox';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { IconButton } from './IconButton';
import { Pagination } from './Pagination';
import { TBody, TD, TH, THead, TR, Table, TableSkeleton } from './Table';

/**
 * Ustun ta'rifi — mavjud `ColumnDef` (ustun sozlamalari bilan bir xil) + saralash va tekislash.
 * `useTableColumns` qaytargan ustunlar shu turga mos: `visible: false` bo'lganlari chizilmaydi.
 */
export interface DataTableColumn<Row> extends ColumnDef<Row> {
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  visible?: boolean;
  width?: number | null;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export type TableDensity = 'comfortable' | 'compact';

interface DataTableProps<Row> {
  /** Jadval nomi (ekran o'quvchi uchun) */
  label: string;
  columns: ReadonlyArray<DataTableColumn<Row>>;
  /** `undefined` — hali yuklanmagan */
  rows: ReadonlyArray<Row> | undefined;
  rowKey: (row: Row) => string;

  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };

  /** Saralash chaqiruvchida (odatda server so'rovi parametri). Bosish tartibi: o'sish → kamayish → yo'q */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;

  /** Qator tanlash va ommaviy amallar */
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
    isSelectable?: (row: Row) => boolean;
    /** Belgilash katagi nomi uchun: "Ali Valiyev" */
    rowLabel?: (row: Row) => string;
  };
  bulkActions?: (selectedKeys: string[]) => ReactNode;

  /** Qator amallari — bitta "…" menyuda (har qatorga 5–6 tugma emas) */
  rowActions?: (row: Row) => ActionMenuItem[];
  onRowClick?: (row: Row) => void;

  density?: TableDensity;
  /** Berilsa — zichlik almashtirgichi ko'rinadi (qiymatni chaqiruvchi saqlaydi) */
  onDensityChange?: (density: TableDensity) => void;

  /** Jadval ustidagi qator: odatda `<FilterBar>` */
  toolbar?: ReactNode;
  /** Zichlik tugmasi yonidagi amallar: eksport (`ExportMenu`), ustunlar (`ColumnSettings`) */
  toolbarActions?: ReactNode;
  pagination?: { page: number; totalPages: number; total: number; limit: number; onPageChange: (page: number) => void };

  /** Sarlavha aylantirishda yuqorida qoladi (`maxHeight` bilan birga) */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  /** Telefonda jadval o'rniga karta. Berilmasa — jadval gorizontal aylanadi. */
  mobileCard?: (row: Row) => ReactNode;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function widthStyle(width: number | null | undefined): CSSProperties | undefined {
  return width ? { width, minWidth: width, maxWidth: width } : undefined;
}

/**
 * Ma'lumot jadvali poydevori (PHASE 1): holatlar (yuklanish / xato / bo'sh), saralash, tanlash + ommaviy amallar,
 * qator amallari, zichlik, yopishqoq sarlavha, sahifalash, telefonda karta.
 * Ma'lumot olish, filtr va saralash **chaqiruvchida** qoladi — komponent faqat ko'rsatadi va hodisa beradi.
 * Mavjud jadvallar o'zgarmagan; sahifalar keyingi fazalarda shu komponentga ko'chiriladi.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  retrying = false,
  empty,
  sort = null,
  onSortChange,
  selection,
  bulkActions,
  rowActions,
  onRowClick,
  density = 'comfortable',
  onDensityChange,
  toolbar,
  toolbarActions,
  pagination,
  stickyHeader = false,
  maxHeight,
  mobileCard,
  className,
}: DataTableProps<Row>) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const visibleColumns = columns.filter((column) => column.visible !== false);
  const cellPadding = density === 'compact' ? 'py-1.5' : 'py-3';

  const selectable = (rows ?? []).filter((row) => selection?.isSelectable?.(row) ?? true);
  const selectedHere = selectable.filter((row) => selection?.selected.has(rowKey(row)));
  const allSelected = selectable.length > 0 && selectedHere.length === selectable.length;

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const row of selectable) {
      if (allSelected) next.delete(rowKey(row));
      else next.add(rowKey(row));
    }
    selection.onChange(next);
  };
  const toggleRow = (key: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };
  const cycleSort = (key: string) => {
    if (!onSortChange) return;
    if (sort?.key !== key) onSortChange({ key, direction: 'asc' });
    else if (sort.direction === 'asc') onSortChange({ key, direction: 'desc' });
    else onSortChange(null);
  };

  const selectedKeys = selection ? [...selection.selected] : [];
  const showToolbar = Boolean(toolbar || toolbarActions || onDensityChange);
  const columnCount = visibleColumns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  let body: ReactNode;
  if (error && !rows) {
    body = <ErrorState error={error} {...(onRetry ? { onRetry } : {})} retrying={retrying} />;
  } else if (loading || !rows) {
    body = <TableSkeleton rows={6} columns={Math.min(columnCount, 6)} />;
  } else if (rows.length === 0) {
    body = <EmptyState {...empty} />;
  } else if (mobileCard && !desktop) {
    body = (
      <ul aria-label={label} className="divide-y divide-border">
        {rows.map((row) => {
          const key = rowKey(row);
          const actions = rowActions?.(row) ?? [];
          return (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              {selection && (selection.isSelectable?.(row) ?? true) && (
                <Checkbox
                  className="mt-1"
                  checked={selection.selected.has(key)}
                  onChange={() => toggleRow(key)}
                  aria-label={`Tanlash: ${selection.rowLabel?.(row) ?? key}`}
                />
              )}
              <div className="min-w-0 flex-1" {...(onRowClick ? { onClick: () => onRowClick(row) } : {})}>
                {mobileCard(row)}
              </div>
              {actions.length > 0 && <ActionMenu items={actions} />}
            </li>
          );
        })}
      </ul>
    );
  } else {
    body = (
      <div className="relative overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <Table aria-label={label}>
          <THead className={cn(stickyHeader && 'sticky top-0 z-sticky bg-surface-muted shadow-[inset_0_-1px_0_var(--color-border)]')}>
            <tr>
              {selection && (
                <TH className="w-10 pr-0">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedHere.length > 0 && !allSelected}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                    aria-label="Hammasini tanlash"
                  />
                </TH>
              )}
              {visibleColumns.map((column) => {
                const sorted = sort?.key === column.key ? sort.direction : null;
                const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
                return (
                  <TH
                    key={column.key}
                    className={cn(ALIGN[column.align ?? 'left'], column.thClassName)}
                    style={widthStyle(column.width)}
                    aria-sort={column.sortable ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(column.key)}
                        className={cn(
                          'focus-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 font-medium transition-colors hover:text-fg',
                          sorted && 'text-fg',
                        )}
                      >
                        {column.header ?? column.label}
                        <SortIcon className={cn('size-3.5', !sorted && 'text-fg-subtle')} aria-hidden />
                      </button>
                    ) : (
                      (column.header ?? column.label)
                    )}
                  </TH>
                );
              })}
              {rowActions && (
                <TH className="w-12">
                  <span className="sr-only">Amallar</span>
                </TH>
              )}
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const key = rowKey(row);
              const selected = selection?.selected.has(key) ?? false;
              const actions = rowActions?.(row) ?? [];
              return (
                <TR
                  key={key}
                  aria-selected={selection ? selected : undefined}
                  className={cn(onRowClick && 'cursor-pointer', selected && 'bg-primary-subtle/50 hover:bg-primary-subtle/60')}
                  {...(onRowClick ? { onClick: () => onRowClick(row) } : {})}
                >
                  {selection && (
                    <TD className={cn('w-10 pr-0', cellPadding)} onClick={(event) => event.stopPropagation()}>
                      {(selection.isSelectable?.(row) ?? true) && (
                        <Checkbox checked={selected} onChange={() => toggleRow(key)} aria-label={`Tanlash: ${selection.rowLabel?.(row) ?? key}`} />
                      )}
                    </TD>
                  )}
                  {visibleColumns.map((column) => (
                    <TD
                      key={column.key}
                      className={cn(
                        cellPadding,
                        ALIGN[column.align ?? 'left'],
                        column.align === 'right' && 'tabular-nums',
                        typeof column.tdClassName === 'function' ? column.tdClassName(row) : column.tdClassName,
                      )}
                      style={widthStyle(column.width)}
                      {...(column.stopRowClick ? { onClick: (event) => event.stopPropagation() } : {})}
                    >
                      {column.cell(row)}
                    </TD>
                  ))}
                  {rowActions && (
                    <TD className={cn('w-12 text-right', cellPadding)} onClick={(event) => event.stopPropagation()}>
                      <ActionMenu items={actions} />
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)} aria-busy={loading || undefined}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {(toolbarActions || onDensityChange) && (
            <div className="flex items-center gap-1">
              {toolbarActions}
              {onDensityChange && (
                <IconButton
                  label={density === 'compact' ? 'Keng qatorlar' : 'Zich qatorlar'}
                  aria-pressed={density === 'compact'}
                  onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
                  className="hidden sm:inline-grid"
                >
                  {density === 'compact' ? <Rows3 aria-hidden /> : <Rows4 aria-hidden />}
                </IconButton>
              )}
            </div>
          )}
        </div>
      )}
      {selection && selectedKeys.length > 0 && (
        <div role="region" aria-label="Ommaviy amallar" className="flex flex-wrap items-center gap-2 border-b border-primary-border bg-primary-subtle px-4 py-2">
          <p className="text-body font-medium text-primary tabular-nums" aria-live="polite">
            {selectedKeys.length} ta tanlandi
          </p>
          <div className="flex flex-wrap items-center gap-2">{bulkActions?.(selectedKeys)}</div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => selection.onChange(new Set())}>
            Bekor qilish
          </Button>
        </div>
      )}
      {body}
      {pagination && rows && rows.length > 0 && <Pagination {...pagination} disabled={loading} />}
    </Card>
  );
}
