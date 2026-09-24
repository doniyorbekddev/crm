import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { AttendanceCalendar } from '@/types/attendanceAnalytics';
import type { AttendanceStatus } from '@/types/attendance';
import { formatDate, formatNumber } from '@/utils/format';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

export const MONTH_NAMES = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Dushanbadan boshlanadigan hafta */
const WEEK_DAY_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const DAY_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500 text-white',
  ABSENT: 'bg-red-500 text-white',
  LATE: 'bg-amber-500 text-white',
  EXCUSED: 'bg-brand-500 text-white',
};

/** Oyning birinchi kuni haftaning nechanchi kuniga to‘g‘ri kelishi (dushanba = 0) */
export function firstWeekDayOf(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

export function MonthSwitcher({ year, month, onShift }: { year: number; month: number; onShift: (delta: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" aria-label="Oldingi oy" onClick={() => onShift(-1)}>
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <p className="text-sm font-medium text-fg">
        {MONTH_NAMES[month - 1]} {year}
      </p>
      <Button variant="ghost" size="icon" aria-label="Keyingi oy" onClick={() => onShift(1)}>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Oylik davomat panjarasi, holatlar bo‘yicha hisob va umumiy ko‘rsatkichlar.
 * Xodim modalida ham, kabinetda ham bitta ko‘rinish — ma’lumot bir xil, faqat manba boshqa.
 */
export function AttendanceCalendarView({ calendar }: { calendar: AttendanceCalendar }) {
  const firstWeekDay = firstWeekDayOf(calendar.year, calendar.month);

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_DAY_SHORT.map((day) => (
          <span key={day} className="py-1 text-[11px] font-medium text-fg-muted">
            {day}
          </span>
        ))}
        {Array.from({ length: firstWeekDay }, (_, index) => (
          <span key={`empty-${index}`} />
        ))}
        {calendar.days.map((day) => {
          const dayNumber = Number(day.date.slice(8, 10));
          return (
            <span
              key={day.date}
              title={day.status ? `${formatDate(day.date)} — ${day.statusLabel}${day.note ? ` (${day.note})` : ''}` : formatDate(day.date)}
              className={cn(
                'grid aspect-square place-items-center rounded-lg text-xs',
                day.status ? DAY_CLASSES[day.status] : 'bg-surface-muted text-fg-subtle',
              )}
            >
              {dayNumber}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_STATUS_ORDER.map((status) => (
          <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
            {ATTENDANCE_STATUS_LABELS[status]}: {formatNumber(calendar.month_[status])}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-surface-muted p-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-fg-muted">Shu oy davomati</p>
          <p className="text-lg font-semibold text-fg">{calendar.month_.rate}%</p>
          <p className="text-xs text-fg-muted">{formatNumber(calendar.month_.total)} ta dars</p>
        </div>
        <div>
          <p className="text-xs text-fg-muted">Umumiy davomat</p>
          <p className="text-lg font-semibold text-fg">{calendar.overall.rate}%</p>
          <p className="text-xs text-fg-muted">{formatNumber(calendar.overall.total)} ta dars</p>
        </div>
        <div>
          <p className="text-xs text-fg-muted">Sababsiz qoldirgan</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">{formatNumber(calendar.overall.ABSENT)}</p>
          <p className="text-xs text-fg-muted">butun davr bo‘yicha</p>
        </div>
      </div>
    </>
  );
}
