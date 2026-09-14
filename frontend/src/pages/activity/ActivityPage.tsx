import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarCheck, Coins, GraduationCap, History, Receipt, Target, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DateRangePicker, dateRangeParams } from '@/components/DateRangePicker';
import type { DateRangeValue } from '@/components/DateRangePicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { activityService } from '@/services/activity.service';
import type { ActivityItem, ActivityType } from '@/types/activity';
import { STANDARD_PRESETS, toDateString } from '@/utils/dateRange';
import { formatMoney } from '@/utils/format';

const TYPE_CONFIG: Record<ActivityType, { label: string; icon: LucideIcon; className: string }> = {
  student: { label: 'O‘quvchilar', icon: GraduationCap, className: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300' },
  payment: { label: 'To‘lovlar', icon: Wallet, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' },
  expense: { label: 'Xarajatlar', icon: Receipt, className: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' },
  lead: { label: 'Leadlar', icon: Target, className: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300' },
  attendance: { label: 'Davomat', icon: CalendarCheck, className: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300' },
  teaching: { label: 'O‘qituvchi amallari', icon: BookOpen, className: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300' },
  salary: { label: 'Maoshlar', icon: Coins, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

const TYPE_ORDER: readonly ActivityType[] = ['payment', 'student', 'lead', 'expense', 'attendance', 'teaching', 'salary'];

const PAGE_SIZE = 30;

function dayLabel(dateKey: string): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dateKey === toDateString(today)) return 'Bugun';
  if (dateKey === toDateString(yesterday)) return 'Kecha';
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}.${dateKey.slice(0, 4)}`;
}

function groupByDay(items: ActivityItem[]): Array<{ key: string; items: ActivityItem[] }> {
  const groups: Array<{ key: string; items: ActivityItem[] }> = [];
  for (const item of items) {
    const key = toDateString(new Date(item.occurredAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const time = new Date(item.occurredAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <li className="relative flex gap-3 px-4 py-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', config.className)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium text-fg">{item.title}</p>
          {item.amount !== null && (
            <span
              className={cn(
                'text-sm font-semibold whitespace-nowrap tabular-nums',
                item.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {item.amount < 0 ? '−' : '+'}
              {formatMoney(Math.abs(item.amount))}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted">{item.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
          <span className="tabular-nums">{time}</span>
          {item.actor && (
            <span>
              · {item.actor.firstName} {item.actor.lastName}
            </span>
          )}
          {item.link && (
            <Link to={item.link} className="inline-flex items-center gap-0.5 text-brand-600 hover:underline dark:text-brand-400">
              Ochish
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}

/** Faoliyat markazi: markazdagi voqealar vaqt chizig‘ida */
export default function ActivityPage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: 'all', custom: { from: '', to: '' } });
  const [selected, setSelected] = useState<ActivityType[]>([]);

  const rangeParams = dateRangeParams(range);
  const params = {
    limit: PAGE_SIZE,
    ...(rangeParams ?? {}),
    ...(selected.length > 0 ? { types: [...selected].sort().join(',') } : {}),
  };

  const feedQuery = useInfiniteQuery({
    queryKey: queryKeys.activity.feed(params),
    queryFn: ({ pageParam }) => activityService.feed({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: rangeParams !== null,
  });

  const allowed = feedQuery.data?.pages[0]?.types ?? [];
  const items = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const toggleType = (type: ActivityType) =>
    setSelected((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));

  return (
    <>
      <PageHeader
        title="Faoliyat"
        description="Yangi o‘quvchi, to‘lov, xarajat, lead, davomat, o‘qituvchi amallari va maoshlar — vaqt tartibida"
        documentTitle="Faoliyat"
        actions={<DateRangePicker value={range} onChange={setRange} presets={['all', ...STANDARD_PRESETS]} />}
      />

      {allowed.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Faoliyat turlari">
          {TYPE_ORDER.filter((type) => allowed.includes(type)).map((type) => {
            const active = selected.includes(type);
            const Icon = TYPE_CONFIG[type].icon;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => toggleType(type)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                    : 'border-border bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {TYPE_CONFIG[type].label}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="h-8 px-2 text-xs text-fg-muted hover:text-fg">
              Tozalash
            </button>
          )}
        </div>
      )}

      <Card>
        {rangeParams === null ? (
          <p className="p-6 text-center text-sm text-fg-muted">Oraliqning boshlanish va tugash sanalarini tanlang</p>
        ) : feedQuery.isPending ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : feedQuery.isError ? (
          <ErrorState error={feedQuery.error} retrying={feedQuery.isFetching} onRetry={() => void feedQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="Faoliyat topilmadi" description="Davr yoki turlarni o‘zgartirib ko‘ring" />
        ) : (
          <>
            {groupByDay(items).map((group) => (
              <section key={group.key}>
                <h2 className="sticky top-0 z-10 border-b border-border bg-surface-muted/95 px-4 py-1.5 text-xs font-semibold text-fg-muted backdrop-blur">
                  {dayLabel(group.key)}
                </h2>
                <ul className="divide-y divide-border">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
            {feedQuery.hasNextPage && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="secondary" loading={feedQuery.isFetchingNextPage} onClick={() => void feedQuery.fetchNextPage()}>
                  Ko‘proq ko‘rsatish
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
