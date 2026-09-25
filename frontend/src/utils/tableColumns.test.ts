import { describe, expect, it } from 'vitest';
import { moveColumn, parseTableColumns, resolveColumns, toLayout } from './tableColumns';
import type { ColumnDef } from './tableColumns';

type Row = { id: string };
const defs: Array<ColumnDef<Row>> = [
  { key: 'name', label: 'Ism', cell: () => null, required: true },
  { key: 'phone', label: 'Telefon', cell: () => null },
  { key: 'debt', label: 'Qarz', cell: () => null },
  { key: 'notes', label: 'Izoh', cell: () => null, defaultHidden: true },
  { key: 'actions', label: 'Amallar', cell: () => null, fixed: true },
];
const keys = (columns: Array<{ key: string }>) => columns.map((column) => column.key);

describe('tableColumns (GAP-03)', () => {
  it('sozlama yo‘q — ta’rif tartibi, defaultHidden yashirin, amallar doim oxirida', () => {
    const resolved = resolveColumns(defs, null);
    expect(keys(resolved)).toEqual(['name', 'phone', 'debt', 'notes', 'actions']);
    expect(resolved.filter((column) => column.visible).map((column) => column.key)).toEqual(['name', 'phone', 'debt', 'actions']);
  });

  it('saqlangan tartib, ko‘rinish va kenglik; yangi ustun oxirida; o‘chirilgan ustun tashlanadi; majburiy yashirilmaydi', () => {
    const resolved = resolveColumns(defs, {
      columns: [
        { key: 'debt', visible: true, width: 200 },
        { key: 'ghost', visible: true },
        { key: 'name', visible: false },
        { key: 'phone', visible: false },
      ],
    });
    expect(keys(resolved)).toEqual(['debt', 'name', 'phone', 'notes', 'actions']);
    expect(resolved.find((column) => column.key === 'name')!.visible).toBe(true);
    expect(resolved.find((column) => column.key === 'phone')!.visible).toBe(false);
    expect(resolved.find((column) => column.key === 'debt')!.width).toBe(200);
    expect(toLayout(resolved)).toEqual({
      columns: [
        { key: 'debt', visible: true, width: 200 },
        { key: 'name', visible: true },
        { key: 'phone', visible: false },
        { key: 'notes', visible: false },
      ],
    });
  });

  it('surish chegarada o‘zgarmaydi; amallar ustuni surilmaydi', () => {
    const resolved = resolveColumns(defs, null);
    expect(keys(moveColumn(resolved, 'phone', -1))).toEqual(['phone', 'name', 'debt', 'notes', 'actions']);
    expect(keys(moveColumn(resolved, 'name', -1))).toEqual(keys(resolved));
    expect(keys(moveColumn(resolved, 'notes', 1))).toEqual(keys(resolved));
  });

  it('buzuq saqlangan qiymat xavfsiz o‘qiladi', () => {
    expect(parseTableColumns(null)).toBeNull();
    expect(parseTableColumns({ columns: 'x' })).toBeNull();
    expect(
      parseTableColumns({
        columns: [{ key: 'name', visible: true, width: 5000 }, { key: 'name', visible: false }, { key: '../x', visible: true }, { key: 'phone' }, 7],
      }),
    ).toEqual({ columns: [{ key: 'name', visible: true, width: null }] });
  });
});
