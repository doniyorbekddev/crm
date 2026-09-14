import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { DATE_RANGE_PRESET_LABELS, STANDARD_PRESETS, resolveDateRange } from '@/utils/dateRange';
import type { DateRange, DateRangePreset } from '@/utils/dateRange';

export interface DateRangeValue {
  preset: DateRangePreset;
  /** Faqat `custom` uchun */
  custom: DateRange;
}

/** Tanlovni so‘rov parametrlariga aylantiradi: `all` — sanasiz, `custom` to‘liq tanlanmaguncha — null */
export function dateRangeParams(value: DateRangeValue): Partial<DateRange> | null {
  if (value.preset === 'all') return {};
  if (value.preset === 'custom') {
    const { from, to } = value.custom;
    return from && to && from <= to ? { from, to } : null;
  }
  return resolveDateRange(value.preset);
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  presets?: readonly DateRangePreset[];
  className?: string;
}

/** Bugun, kecha, shu/o‘tgan hafta, shu/o‘tgan oy, chorak, yil yoki ixtiyoriy oraliq */
export function DateRangePicker({ value, onChange, presets = STANDARD_PRESETS, className }: DateRangePickerProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Select
        value={value.preset}
        onChange={(event) => onChange({ ...value, preset: event.target.value as DateRangePreset })}
        aria-label="Davr"
        wrapperClassName="w-44"
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {DATE_RANGE_PRESET_LABELS[preset]}
          </option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input
            type="date"
            value={value.custom.from}
            max={value.custom.to || undefined}
            onChange={(event) => onChange({ ...value, custom: { ...value.custom, from: event.target.value } })}
            aria-label="Boshlanish sanasi"
            className="h-10 w-40"
          />
          <Input
            type="date"
            value={value.custom.to}
            min={value.custom.from || undefined}
            onChange={(event) => onChange({ ...value, custom: { ...value.custom, to: event.target.value } })}
            aria-label="Tugash sanasi"
            className="h-10 w-40"
          />
        </>
      )}
    </div>
  );
}
