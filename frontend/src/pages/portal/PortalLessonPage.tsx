import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LessonContent, LessonVideo, MaterialList } from '@/components/lesson/LessonBody';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/**
 * Dars sahifasi: video, konspekt, materiallar. O‘quvchi "O‘rgandim" deb belgilaydi —
 * ota-ona faqat ko‘radi (backend ham ota-onaga ruxsat bermaydi).
 */
export default function PortalLessonPage() {
  const { id = '' } = useParams();
  const { me, activeChild } = usePortal();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.portal.lesson(activeChild, id), queryFn: () => portalService.lesson(id, activeChild) });

  const complete = useMutation({
    mutationFn: (completed: boolean) => portalService.completeLesson(id, completed),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.course(activeChild) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.lesson(activeChild, id) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const lesson = query.data;
  const isStudent = me.kind === 'STUDENT';

  return (
    <div>
      <Link to="/portal/course" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Kurs darslari
      </Link>
      <PageHeader
        title={lesson.title}
        description={[lesson.teacher?.name, lesson.durationMinutes ? `${lesson.durationMinutes} daqiqa` : null].filter(Boolean).join(' · ') || undefined}
        actions={
          isStudent ? (
            <Button
              variant={lesson.completed ? 'secondary' : 'primary'}
              leftIcon={lesson.completed ? <CheckCircle2 className="size-4 text-emerald-500" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              loading={complete.isPending}
              onClick={() => complete.mutate(!lesson.completed)}
            >
              {lesson.completed ? 'O‘rganildi' : 'O‘rgandim'}
            </Button>
          ) : lesson.completed ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              Farzandingiz o‘rgangan
            </span>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {lesson.description && <p className="text-sm text-fg-muted">{lesson.description}</p>}
        {lesson.videoUrl && <LessonVideo url={lesson.videoUrl} title={lesson.title} />}
        {lesson.content && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-fg-muted" aria-hidden />
                Dars matni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LessonContent content={lesson.content} />
            </CardContent>
          </Card>
        )}
        {lesson.materials.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Materiallar</CardTitle>
            </CardHeader>
            <CardContent>
              <MaterialList
                materials={lesson.materials}
                onDownload={(material) =>
                  void portalService.downloadLessonMaterial(material, activeChild).catch((error: unknown) => toast.error(getErrorMessage(error)))
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
