import type { CSSProperties, MouseEvent } from 'react';
import type { ResolvedColumn } from '@/utils/tableColumns';
import { cn } from '@/lib/cn';
import { TD, TH } from './Table';

const ALIGN = { left: undefined, right: 'text-right', center: 'text-center' } as const;

function widthStyle(width: number | null): CSSProperties | undefined {
  return width ? { width, minWidth: width, maxWidth: width } : undefined;
}

/** Sozlanadigan ustunlar sarlavhasi (`<thead><tr>` ichida) */
export function ColumnHeaders<Row>({ columns }: { columns: ReadonlyArray<ResolvedColumn<Row>> }) {
  return (
    <>
      {columns.map((column) => (
        <TH key={column.key} className={cn(ALIGN[column.align ?? 'left'], column.thClassName)} style={widthStyle(column.width)}>
          {column.header ?? column.label}
        </TH>
      ))}
    </>
  );
}

/** Bitta qator kataklari — qator (`TR`) sahifaning o'zida qoladi (onClick, klass va h.k.) */
export function ColumnCells<Row>({ columns, row }: { columns: ReadonlyArray<ResolvedColumn<Row>>; row: Row }) {
  return (
    <>
      {columns.map((column) => (
        <TD
          key={column.key}
          className={cn(
            ALIGN[column.align ?? 'left'],
            column.align === 'right' && 'tabular-nums',
            typeof column.tdClassName === 'function' ? column.tdClassName(row) : column.tdClassName,
          )}
          style={widthStyle(column.width)}
          {...(column.stopRowClick ? { onClick: (event: MouseEvent) => event.stopPropagation() } : {})}
        >
          {column.cell(row)}
        </TD>
      ))}
    </>
  );
}
