import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate } from '@/utils/format';

const STATUS_LABELS = {
  PLANNED: 'Rejalashtirilgan',
  HELD: 'O‘tkazilgan',
  CANCELLED: 'Bekor qilingan',
} as const;

/**
 * Kelgusi darslar va o'qituvchi.
 *
 * Jadval guruhning haftalik jadvalidan hisoblanadi; dars bekor qilingan bo'lsa shu yerda
 * ko'rinadi — o'quvchi bekorga kelmasin. O'qituvchi haqida faqat ism va yo'nalish beriladi.
 */
export function LessonsCard({ studentId }: { studentId?: string }) {
  const query = useQuery({
    queryKey: queryKeys.portal.lessons(studentId ?? ''),
    queryFn: () => portalService.lessons(studentId),
    enabled: Boolean(studentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-fg-subtle" aria-hidden />
          Kelgusi darslar
        </CardTitle>
        {query.data?.teacher && (
          <span className="text-xs text-fg-muted">
            O‘qituvchi: {query.data.teacher.name}
            {query.data.teacher.specialization ? ` · ${query.data.teacher.specialization}` : ''}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data?.group ? (
          <EmptyState icon={CalendarDays} title="Guruh yo‘q" description="Guruhga biriktirilgandan keyin darslar shu yerda ko‘rinadi" />
        ) : query.data.lessons.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Dars yo‘q" description="Yaqin ikki haftada rejalashtirilgan dars yo‘q" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.lessons.map((lesson) => (
              <li key={`${lesson.date}-${lesson.startTime}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-fg">
                    {formatDate(lesson.date)} · {lesson.startTime}–{lesson.endTime}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {query.data?.group?.name}
                    {lesson.room ? ` · ${lesson.room}` : ''}
                    {lesson.topic ? ` · ${lesson.topic}` : ''}
                  </p>
                </div>
                {lesson.status !== 'PLANNED' && (
                  <Badge tone={lesson.status === 'CANCELLED' ? 'red' : 'green'}>{STATUS_LABELS[lesson.status]}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
