import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarPlus,
  GraduationCap,
  History,
  Paperclip,
  Pencil,
  PhoneCall,
  Plus,
  StickyNote,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import type { LeadActivityType } from '@/types/lead';
import { formatDateTime } from '@/utils/format';

const ACTIVITY_ICONS: Record<LeadActivityType, { icon: LucideIcon; className: string }> = {
  CREATED: { icon: Plus, className: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300' },
  UPDATED: { icon: Pencil, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  STATUS_CHANGED: { icon: ArrowRightLeft, className: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300' },
  ASSIGNED: { icon: UserCheck, className: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300' },
  NOTE_ADDED: { icon: StickyNote, className: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300' },
  CALL_LOGGED: { icon: PhoneCall, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' },
  FOLLOW_UP_CREATED: { icon: CalendarPlus, className: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300' },
  FOLLOW_UP_COMPLETED: { icon: CalendarCheck, className: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300' },
  DOCUMENT_UPLOADED: { icon: Paperclip, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  CONVERTED_TO_STUDENT: { icon: GraduationCap, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' },
};

export function LeadTimeline({ leadId }: { leadId: string }) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.leads.activities(leadId),
    queryFn: ({ pageParam }) => leadsService.activities(leadId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  if (query.isPending) {
    return (
      <div className="space-y-5 p-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <EmptyState icon={History} title="Hali hech qanday harakat yo‘q" />;
  }

  return (
    <div className="p-5">
      <ol className="relative space-y-5">
        {items.map((activity, index) => {
          const { icon: Icon, className } = ACTIVITY_ICONS[activity.type];
          return (
            <li key={activity.id} className="relative flex gap-3">
              {index < items.length - 1 && <span className="absolute top-8 bottom-[-20px] left-4 w-px bg-border" aria-hidden />}
              <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full', className)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm break-words text-fg">{activity.description}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'Tizim'} · {formatDateTime(activity.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {query.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Oldingilarini ko‘rsatish
          </Button>
        </div>
      )}
    </div>
  );
}
