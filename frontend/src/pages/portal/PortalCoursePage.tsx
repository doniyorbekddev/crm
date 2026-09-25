import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Circle, Clock, Paperclip, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/**
 * Kurs (LMS): modul → mavzu → nashr qilingan darslar. O‘quvchi tugatgan darslar belgilanadi,
 * yuqorida umumiy progress. Qoralama va arxiv darslar bu yerda ko‘rinmaydi (backend).
 */
export default function PortalCoursePage() {
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.course(activeChild), queryFn: () => portalService.course(activeChild) });

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const tree = query.data;
  const completed = tree.totals.completed ?? 0;
  const percent = tree.totals.lessons ? Math.round((completed / tree.totals.lessons) * 100) : 0;

  return (
    <div>
      <PageHeader title={tree.courseName} description={tree.totals.lessons ? `${completed}/${tree.totals.lessons} dars o‘rganilgan` : 'Darslar'} />

      {tree.totals.lessons === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="Darslar hali joylanmagan" description="O‘qituvchi dars materiallarini joylaganda shu yerda paydo bo‘ladi" />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Kurs darslari progressi">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
          </div>
          {tree.modules.map((module) => (
            <Card key={module.id}>
              <CardHeader>
                <CardTitle>{module.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {module.topics.map((topic) => (
                  <div key={topic.id}>
                    <p className="mb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{topic.title}</p>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {topic.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link
                            to={`/portal/course/lessons/${lesson.id}`}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                          >
                            {lesson.completed ? (
                              <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="O‘rganilgan" />
                            ) : (
                              <Circle className="size-5 shrink-0 text-fg-subtle" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-fg">{lesson.title}</span>
                              {lesson.description && <span className="block truncate text-xs text-fg-muted">{lesson.description}</span>}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                              {lesson.hasVideo && <PlayCircle className="size-4" aria-label="Video bor" />}
                              {lesson.materialCount > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Paperclip className="size-3.5" aria-hidden />
                                  {lesson.materialCount}
                                </span>
                              )}
                              {lesson.durationMinutes && (
                                <span className="hidden items-center gap-0.5 sm:inline-flex">
                                  <Clock className="size-3.5" aria-hidden />
                                  {lesson.durationMinutes} daq
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
