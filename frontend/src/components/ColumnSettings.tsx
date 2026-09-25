import { ArrowDown, ArrowUp, Columns3, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import type { TableColumnsControl } from '@/hooks/useTableColumns';
import { COLUMN_WIDTHS } from '@/utils/tableColumns';

/** "Ustunlar" tugmasi va oynasi: ko'rsatish/yashirish, tartib, kenglik, standart holat (TZ 3.1 GAP-03) */
export function ColumnSettings<Row>({ control, title = 'Jadval ustunlari' }: { control: TableColumnsControl<Row>; title?: string }) {
  const [open, setOpen] = useState(false);
  const configurable = control.columns.filter((column) => !column.fixed);
  const hiddenCount = configurable.filter((column) => !column.visible).length;

  return (
    <>
      <Button variant="secondary" size="sm" leftIcon={<Columns3 className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        Ustunlar{hiddenCount > 0 ? ` (${hiddenCount} yashirin)` : ''}
      </Button>
      <Modal
        open={open}
        title={title}
        description="Faqat ko‘rinish: profilingizda saqlanadi, boshqa qurilmada ham shunday ochiladi"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" leftIcon={<RotateCcw className="size-4" aria-hidden />} disabled={!control.customized} onClick={control.reset}>
              Standart holat
            </Button>
            <Button onClick={() => setOpen(false)}>Tayyor</Button>
          </>
        }
      >
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Ustunlar ro‘yxati">
          {configurable.map((column, index) => (
            <li key={column.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <Checkbox
                  label={column.label}
                  checked={column.visible}
                  disabled={column.required}
                  onChange={(event) => control.setVisible(column.key, event.target.checked)}
                />
                {column.required && <p className="ml-6 text-xs text-fg-subtle">Doim ko‘rinadi</p>}
              </div>
              <Select
                aria-label={`${column.label} kengligi`}
                value={column.width === null ? '' : String(column.width)}
                wrapperClassName="w-28"
                className="h-8 text-xs"
                onChange={(event) => control.setWidth(column.key, event.target.value ? Number(event.target.value) : null)}
              >
                {COLUMN_WIDTHS.map((option) => (
                  <option key={option.label} value={option.value === null ? '' : String(option.value)}>
                    {option.label}
                  </option>
                ))}
                {column.width !== null && !COLUMN_WIDTHS.some((option) => option.value === column.width) && <option value={String(column.width)}>{column.width}px</option>}
              </Select>
              <Button variant="ghost" size="sm" aria-label={`${column.label} — yuqoriga`} disabled={index === 0} onClick={() => control.move(column.key, -1)}>
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`${column.label} — pastga`} disabled={index === configurable.length - 1} onClick={() => control.move(column.key, 1)}>
                <ArrowDown className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
