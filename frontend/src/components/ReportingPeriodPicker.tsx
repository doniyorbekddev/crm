import { CalendarClock, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { periodKey, shiftPeriod, useReportingPeriod } from '@/hooks/useReportingPeriod';
import type { ReportingPeriod } from '@/hooks/useReportingPeriod';
import { MONTH_OPTIONS } from '@/utils/teacherLabels';

/** Tanlash mumkin bo'lgan oylar: joriy oy va undan oldingi 24 oy */
const HISTORY_MONTHS = 24;

export function periodLabel(period: ReportingPeriod): string {
  return `${MONTH_OPTIONS.find((option) => option.value === period.month)?.label ?? period.month} ${period.year}`;
}

/**
 * Hisobot davri tanlagichi (tarixiy ma'lumot, 3-bosqich): standart — joriy oy. O'tgan oy tanlanganda "Tanlangan davr"
 * belgisi va "Joriy oyga qaytish" tugmasi ko'rinadi; tanlov URL da (`?period=`) saqlanadi.
 */
export function ReportingPeriodPicker() {
  const { period, current, isCurrent, setPeriod, resetToCurrent } = useReportingPeriod();
  const options = Array.from({ length: HISTORY_MONTHS + 1 }, (_, offset) => shiftPeriod(current, -offset));
  const oldest = options[options.length - 1]!;
  const atOldest = periodKey(period) === periodKey(oldest);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Oldingi oy" disabled={atOldest} onClick={() => setPeriod(shiftPeriod(period, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Select
          aria-label="Hisobot oyi"
          value={periodKey(period)}
          wrapperClassName="w-44"
          onChange={(event) => {
            const next = options.find((option) => periodKey(option) === event.target.value);
            if (next) setPeriod(next);
          }}
        >
          {options.map((option) => (
            <option key={periodKey(option)} value={periodKey(option)}>
              {periodLabel(option)}
              {periodKey(option) === periodKey(current) ? ' (joriy)' : ''}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" aria-label="Keyingi oy" disabled={isCurrent} onClick={() => setPeriod(shiftPeriod(period, 1))}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      {!isCurrent && (
        <>
          <Badge tone="warning">
            <CalendarClock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Tanlangan davr: {periodLabel(period)}
          </Badge>
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="size-4" aria-hidden />} onClick={resetToCurrent}>
            Joriy oyga qaytish
          </Button>
        </>
      )}
    </div>
  );
}
