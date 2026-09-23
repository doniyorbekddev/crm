import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { curriculumService } from '@/services/curriculum.service';
import { groupsService } from '@/services/groups.service';
import type { CourseItem } from '@/types/course';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface CurriculumModalProps {
  course: CourseItem;
  onClose: () => void;
}

/**
 * Kurs dasturi: modul va mavzular. O'qituvchi mavzuni guruh bo'yicha "o'tildi" deb belgilaydi —
 * shundan keyin o'quvchi profilida progress foizi o'zgaradi.
 */
export function CurriculumModal({ course, onClose }: CurriculumModalProps) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.COURSE_MANAGE);
  const canMark = usePermission(PERMISSIONS.ATTENDANCE_MARK) || canManage;

  const [moduleTitle, setModuleTitle] = useState('');
  const [topicDrafts, setTopicDrafts] = useState<Record<string, string>>({});
  const [groupId, setGroupId] = useState('');

  const curriculumQuery = useQuery({
    queryKey: queryKeys.curriculum.course(course.id),
    queryFn: () => curriculumService.forCourse(course.id),
  });
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: 100, courseId: course.id }),
    queryFn: () => groupsService.list({ page: 1, limit: 100, courseId: course.id }),
    enabled: canMark,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all });
  }

  const addModule = useMutation({
    mutationFn: () => curriculumService.createModule(course.id, { title: moduleTitle.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setModuleTitle('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const addTopic = useMutation({
    mutationFn: (moduleId: string) => curriculumService.createTopic(moduleId, { title: (topicDrafts[moduleId] ?? '').trim() }),
    onSuccess: (result, moduleId) => {
      toast.success(result.message);
      setTopicDrafts((drafts) => ({ ...drafts, [moduleId]: '' }));
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const markTopic = useMutation({
    mutationFn: (topicId: string) => curriculumService.markTopic(topicId, { groupId, status: 'COMPLETED' }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const curriculum = curriculumQuery.data;

  return (
    <Modal
      open
      size="lg"
      title="Kurs dasturi"
      description={
        curriculum
          ? `${course.name} · ${curriculum.totalTopics} ta mavzu, ${curriculum.totalLessons} ta dars`
          : course.name
      }
      onClose={onClose}
      footer={<Button onClick={onClose}>Yopish</Button>}
    >
      {canMark && (groupsQuery.data?.items.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3 sm:flex-row sm:items-center">
          <span className="text-sm text-fg-muted">Mavzuni belgilash uchun guruh:</span>
          <Select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Guruh" wrapperClassName="sm:w-56">
            <option value="">Tanlanmagan</option>
            {(groupsQuery.data?.items ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {curriculumQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : curriculumQuery.isError ? (
        <ErrorState error={curriculumQuery.error} onRetry={() => void curriculumQuery.refetch()} />
      ) : curriculum && curriculum.modules.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Dastur tuzilmagan"
          description="Modul qo‘shing: masalan «HTML asoslari», keyin unga mavzular qo‘shasiz."
        />
      ) : (
        <div className="space-y-4">
          {curriculum?.modules.map((module) => (
            <div key={module.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-fg">{module.title}</p>
                <Badge tone="gray">{module.topics.length} ta mavzu</Badge>
              </div>

              <ul className="mt-2 divide-y divide-border">
                {module.topics.map((topic) => (
                  <li key={topic.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{topic.title}</p>
                      <p className="text-xs text-fg-subtle">
                        {topic.lessonCount} dars
                        {typeof topic.completedCount === 'number' && topic.completedCount > 0
                          ? ` · ${topic.completedCount} o‘quvchi tugatgan`
                          : ''}
                      </p>
                    </div>
                    {canMark && groupId && (
                      <Button
                        variant="secondary"
                        leftIcon={<Check className="size-4" aria-hidden />}
                        loading={markTopic.isPending && markTopic.variables === topic.id}
                        onClick={() => markTopic.mutate(topic.id)}
                      >
                        O‘tildi
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              {canManage && (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={topicDrafts[module.id] ?? ''}
                    placeholder="Yangi mavzu"
                    aria-label={`${module.title} uchun yangi mavzu`}
                    onChange={(event) => setTopicDrafts((drafts) => ({ ...drafts, [module.id]: event.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    disabled={(topicDrafts[module.id] ?? '').trim().length < 2}
                    loading={addTopic.isPending && addTopic.variables === module.id}
                    onClick={() => addTopic.mutate(module.id)}
                  >
                    Qo‘shish
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <Input
            value={moduleTitle}
            placeholder="Yangi modul: masalan «CSS»"
            aria-label="Yangi modul"
            onChange={(event) => setModuleTitle(event.target.value)}
          />
          <Button
            leftIcon={<Plus className="size-4" aria-hidden />}
            disabled={moduleTitle.trim().length < 2}
            loading={addModule.isPending}
            onClick={() => addModule.mutate()}
          >
            Modul
          </Button>
        </div>
      )}
    </Modal>
  );
}
