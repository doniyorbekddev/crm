import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { currentReportingPeriod, periodKey, shiftPeriod } from '@/hooks/useReportingPeriod';
import type { ReportingPeriod } from '@/hooks/useReportingPeriod';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import type { CalendarItem, CalendarItemKind } from '@/types/org';
import { periodKeyLabel } from '@/utils/billingLabels';
import { formatDate } from '@/utils/format';

const KIND_LABELS: Record<CalendarItemKind, string> = {
  HOLIDAY: 'Bayram',
  LEAVE: 'Ta’til',
  ABSENCE: 'Kelmaydi',
  LATE_ARRIVAL: 'Kech keladi',
  EARLY_LEAVE: 'Erta ketadi',
  DAY_OFF: 'Dam olish',
  CUSTOM_HOURS: 'Boshqa soat',
};

const KIND_TONES: Record<CalendarItemKind, BadgeTone> = {
  HOLIDAY: 'red',
  LEAVE: 'blue',
  ABSENCE: 'yellow',
  LATE_ARRIVAL: 'gray',
  EARLY_LEAVE: 'gray',
  DAY_OFF: 'green',
  CUSTOM_HOURS: 'gray',
};

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

/** Oy kunlari dushanbadan boshlanadigan haftalar bo'yicha (bo'sh katak — null) */
function monthGrid(period: ReportingPeriod): Array<string | null> {
  const first = new Date(Date.UTC(period.year, period.month - 1, 1));
  const days = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${periodKey(period)}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const onDay = (item: CalendarItem, date: string) => item.startDate <= date && item.endDate >= date;

/**
 * Umumiy kalendar (ORG §3.5): bayramlar, tasdiqlangan ta'til va ruxsatlar, dam olish istisnolari — kim qachon yo'qligi
 * bir qarashda. Sabablar faqat rahbarga ko'rinadi (serverda).
 */
export default function TeamCalendarPage() {
  const [period, setPeriod] = useState<ReportingPeriod>(() => currentReportingPeriod());
  const key = periodKey(period);
  const query = useQuery({ queryKey: queryKeys.org.calendar(key), queryFn: () => orgService.calendar(key) });
  const today = periodKey(currentReportingPeriod()) === key ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()) : null;
  const items = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Umumiy kalendar"
        description="Bayramlar, tasdiqlangan ta’til va ruxsatlar — kim qachon ishda bo‘lmaydi"
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Oldingi oy" onClick={() => setPeriod((value) => shiftPeriod(value, -1))}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="min-w-32 text-center text-label text-fg" aria-live="polite">
              {periodKeyLabel(key)}
            </span>
            <Button size="sm" variant="ghost" aria-label="Keyingi oy" onClick={() => setPeriod((value) => shiftPeriod(value, 1))}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPeriod(currentReportingPeriod())}>
              Bu oy
            </Button>
          </div>
        }
      />

      {query.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Belgilar">
            {(Object.keys(KIND_LABELS) as CalendarItemKind[]).map((kind) => (
              <Badge key={kind} tone={KIND_TONES[kind]}>
                {KIND_LABELS[kind]}
              </Badge>
            ))}
          </div>

          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-caption font-medium text-fg-muted">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="py-2">
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7" role="grid" aria-label={`${periodKeyLabel(key)} kalendari`}>
              {monthGrid(period).map((date, index) => {
                const dayItems = date ? items.filter((item) => onDay(item, date)) : [];
                const holiday = dayItems.some((item) => item.kind === 'HOLIDAY');
                return (
                  <div
                    key={date ?? `empty-${index}`}
                    role="gridcell"
                    className={cn('min-h-24 border-r border-b border-border p-1.5 last:border-r-0', !date && 'bg-surface-muted/40', holiday && 'bg-danger-subtle/40')}
                  >
                    {date && (
                      <>
                        <p className={cn('text-caption', date === today ? 'font-semibold text-primary' : 'text-fg-muted')}>{Number(date.slice(8))}</p>
                        <ul className="mt-1 space-y-0.5">
                          {dayItems.slice(0, 3).map((item) => (
                            <li key={item.id} title={item.title} className="truncate">
                              <Badge tone={KIND_TONES[item.kind]} className="max-w-full truncate">
                                {item.person ? item.person.name : item.title}
                              </Badge>
                            </li>
                          ))}
                          {dayItems.length > 3 && <li className="text-caption text-fg-subtle">+{dayItems.length - 3}</li>}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-0">
            <h2 className="border-b border-border px-4 py-3 text-label font-semibold text-fg">{periodKeyLabel(key)} — ro‘yxat</h2>
            {items.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Bu oyda yozuv yo‘q" description="Bayram, tasdiqlangan ta’til yoki ruxsat bo‘lsa — shu yerda ko‘rinadi" />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-body text-fg">{item.title}</p>
                      {item.reason && <p className="text-caption text-fg-muted">{item.reason}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={KIND_TONES[item.kind]}>{KIND_LABELS[item.kind]}</Badge>
                      <span className="text-caption whitespace-nowrap text-fg-muted">
                        {item.startDate === item.endDate ? formatDate(item.startDate) : `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
