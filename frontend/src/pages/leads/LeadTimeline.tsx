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
import { Timeline } from '@/components/ui/Timeline';
import type { TimelineItem } from '@/components/ui/Timeline';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import type { LeadActivityType } from '@/types/lead';
import { formatDateTime } from '@/utils/format';

const ACTIVITY_ICONS: Record<LeadActivityType, { icon: LucideIcon; tone: NonNullable<TimelineItem['tone']> }> = {
  CREATED: { icon: Plus, tone: 'primary' },
  UPDATED: { icon: Pencil, tone: 'neutral' },
  STATUS_CHANGED: { icon: ArrowRightLeft, tone: 'accent' },
  ASSIGNED: { icon: UserCheck, tone: 'info' },
  NOTE_ADDED: { icon: StickyNote, tone: 'warning' },
  CALL_LOGGED: { icon: PhoneCall, tone: 'success' },
  FOLLOW_UP_CREATED: { icon: CalendarPlus, tone: 'warning' },
  FOLLOW_UP_COMPLETED: { icon: CalendarCheck, tone: 'success' },
  DOCUMENT_UPLOADED: { icon: Paperclip, tone: 'neutral' },
  CONVERTED_TO_STUDENT: { icon: GraduationCap, tone: 'success' },
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
      <Timeline
        label="Lead tarixi"
        items={items.map((activity) => ({
          id: activity.id,
          title: <span className="font-normal break-words">{activity.description}</span>,
          meta: `${activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'Tizim'} · ${formatDateTime(activity.createdAt)}`,
          ...ACTIVITY_ICONS[activity.type],
        }))}
      />
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
