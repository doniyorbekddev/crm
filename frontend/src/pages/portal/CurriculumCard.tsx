import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/** Kurs dasturi bo'yicha progress: qaysi modul necha foiz o'tilgan. */
export function CurriculumCard({ studentId }: { studentId?: string }) {
  const query = useQuery({
    queryKey: queryKeys.portal.curriculum(studentId ?? ''),
    queryFn: () => portalService.curriculum(studentId),
    enabled: Boolean(studentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-4 text-fg-subtle" aria-hidden />
          Kurs dasturi
        </CardTitle>
        {query.data && (
          <span className="text-xs text-fg-muted">
            {query.data.completed}/{query.data.total} mavzu · {query.data.percent}%
          </span>
        )}
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data || query.data.modules.length === 0 ? (
          <EmptyState icon={BookOpen} title="Dastur tuzilmagan" description="O‘qituvchi kurs dasturini qo‘shgach shu yerda ko‘rinadi" />
        ) : (
          <ul className="space-y-2.5">
            {query.data.modules.map((module) => (
              <li key={module.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-fg">{module.title}</span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {module.completed}/{module.total} · {module.percent}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn('h-full rounded-full', module.percent === 100 ? 'bg-emerald-500' : 'bg-brand-500')}
                    style={{ width: `${module.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
