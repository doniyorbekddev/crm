import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { curriculumService } from '@/services/curriculum.service';

function barTone(percent: number): string {
  if (percent >= 80) return 'bg-emerald-500';
  if (percent >= 50) return 'bg-brand-500';
  if (percent > 0) return 'bg-amber-500';
  return 'bg-slate-300 dark:bg-slate-700';
}

/**
 * O'quvchining kurs dasturi bo'yicha progressi: "HTML 100%, CSS 82%".
 * Kurrikulum tuzilmagan bo'lsa kartochka umuman ko'rsatilmaydi.
 */
export function CurriculumProgressCard({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: queryKeys.curriculum.student(studentId),
    queryFn: () => curriculumService.studentProgress(studentId),
  });

  if (query.isPending) return <Skeleton className="h-32 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const progress = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kurs dasturi</CardTitle>
        <span className="text-sm text-fg-muted">
          {progress.completed}/{progress.total} mavzu · {progress.percent}%
        </span>
      </CardHeader>
      <CardContent>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className={cn('h-full rounded-full', barTone(progress.percent))} style={{ width: `${progress.percent}%` }} />
        </div>

        <ul className="space-y-3">
          {progress.modules.map((module) => (
            <li key={module.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-fg">{module.title}</span>
                <span className="shrink-0 text-sm tabular-nums text-fg-muted">
                  {module.percent}% ({module.completed}/{module.total})
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div className={cn('h-full rounded-full', barTone(module.percent))} style={{ width: `${module.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
