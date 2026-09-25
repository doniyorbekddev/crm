import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Clock, Paperclip, Pencil, Plus, PlayCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { lessonsService } from '@/services/lessons.service';
import type { LessonStatus, LessonSummary } from '@/types/lesson';
import { LESSON_STATUS_LABELS, LESSON_STATUS_TONES } from '@/utils/lessonLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { LessonEditorModal } from './LessonEditorModal';

type Editor = { mode: 'create'; topicId: string; topicTitle: string } | { mode: 'edit'; lessonId: string } | null;

/**
 * Kurs darslari (LMS, TZ §12–14): modul → mavzu → dars. Xodim hamma holatni ko‘radi,
 * o‘quvchi — faqat nashr qilinganni. Tahrirlash — `lesson.manage` + o‘z kursi (backend `canEdit`).
 */
export default function CourseLessonsPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const canManageCourse = usePermission(PERMISSIONS.COURSE_MANAGE);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [toDelete, setToDelete] = useState<LessonSummary | null>(null);

  const query = useQuery({ queryKey: queryKeys.lessons.tree(id, includeArchived), queryFn: () => lessonsService.tree(id, includeArchived) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });

  const setStatus = useMutation({
    mutationFn: ({ lessonId, status }: { lessonId: string; status: LessonStatus }) => lessonsService.update(lessonId, { status }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (lessonId: string) => lessonsService.remove(lessonId),
    onSuccess: (message) => {
      toast.success(message);
      setToDelete(null);
      refresh();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setToDelete(null);
    },
  });

  const tree = query.data;
  const canEdit = tree?.canEdit ?? false;

  return (
    <>
      <Link to="/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Kurslar
      </Link>
      <PageHeader
        title={tree ? `${tree.courseName} — darslar` : 'Kurs darslari'}
        description={tree ? `${tree.totals.lessons} ta dars · ${tree.totals.published} tasi nashr qilingan` : 'Modul → mavzu → dars → material'}
        documentTitle="Kurs darslari"
        actions={
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <Checkbox checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            Arxivni ko‘rsatish
          </label>
        }
      />

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : tree!.modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Kurs dasturi bo‘sh"
            description={canManageCourse ? 'Avval "Kurslar → Kurs dasturi" orqali modul va mavzular qo‘shing' : 'Kurs dasturi hali tuzilmagan'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {tree!.modules.map((module) => (
            <Card key={module.id}>
              <CardHeader>
                <CardTitle>{module.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {module.topics.map((topic) => (
                  <div key={topic.id}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-fg">{topic.title}</p>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Plus className="size-4" aria-hidden />}
                          onClick={() => setEditor({ mode: 'create', topicId: topic.id, topicTitle: topic.title })}
                        >
                          Dars qo‘shish
                        </Button>
                      )}
                    </div>
                    {topic.lessons.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-fg-subtle">Dars yo‘q</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {topic.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <button
                              type="button"
                              className="min-w-0 text-left"
                              onClick={() => setEditor({ mode: 'edit', lessonId: lesson.id })}
                              disabled={!canEdit}
                            >
                              <span className="block truncate text-sm font-medium text-fg">{lesson.title}</span>
                              <span className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                                {lesson.durationMinutes && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="size-3" aria-hidden />
                                    {lesson.durationMinutes} daq
                                  </span>
                                )}
                                {lesson.hasVideo && (
                                  <span className="inline-flex items-center gap-1">
                                    <PlayCircle className="size-3" aria-hidden />
                                    video
                                  </span>
                                )}
                                {lesson.materialCount > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <Paperclip className="size-3" aria-hidden />
                                    {lesson.materialCount}
                                  </span>
                                )}
                              </span>
                            </button>
                            <span className="flex shrink-0 items-center gap-2">
                              <Badge tone={LESSON_STATUS_TONES[lesson.status]}>{LESSON_STATUS_LABELS[lesson.status]}</Badge>
                              {canEdit && (
                                <ActionMenu
                                  label={`${lesson.title} amallari`}
                                  items={[
                                    { label: 'Tahrirlash', icon: Pencil, onSelect: () => setEditor({ mode: 'edit', lessonId: lesson.id }) },
                                    ...(lesson.status !== 'PUBLISHED'
                                      ? [{ label: 'Nashr qilish', icon: BookOpen, onSelect: () => setStatus.mutate({ lessonId: lesson.id, status: 'PUBLISHED' }) }]
                                      : [{ label: 'Arxivlash', icon: BookOpen, onSelect: () => setStatus.mutate({ lessonId: lesson.id, status: 'ARCHIVED' }) }]),
                                    ...(lesson.status === 'DRAFT'
                                      ? [{ label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setToDelete(lesson) }]
                                      : []),
                                  ]}
                                />
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editor && <LessonEditorModal target={editor} onClose={() => setEditor(null)} />}
      <ConfirmDialog
        open={toDelete !== null}
        title="Darsni o‘chirish"
        description={`«${toDelete?.title ?? ''}» qoralamasi va uning materiallari o‘chiriladi.`}
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
