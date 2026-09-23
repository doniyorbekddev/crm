import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Layers, Pencil, Plus, Target, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { CurriculumModal } from './CurriculumModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { coursesService } from '@/services/courses.service';
import type { CourseItem, CourseListParams, CourseCategory, CourseStatus } from '@/types/course';
import {
  COURSE_CATEGORY_LABELS,
  COURSE_CATEGORY_ORDER,
  COURSE_STATUS_LABELS,
  COURSE_STATUS_ORDER,
  COURSE_STATUS_TONES,
} from '@/utils/courseLabels';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { CourseFormModal } from './CourseFormModal';

const PAGE_SIZE = 12;

type Dialog = { type: 'create' } | { type: 'edit' | 'curriculum' | 'delete'; course: CourseItem } | null;

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.COURSE_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [category, setCategory] = useState<CourseCategory | ''>('');
  const [status, setStatus] = useState<CourseStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: CourseListParams = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
  };

  const coursesQuery = useQuery({
    queryKey: queryKeys.courses.list(params),
    queryFn: () => coursesService.list(params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lookups.leadForm });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lookups.groupForm });
  };

  const remove = useMutation({
    mutationFn: (id: string) => coursesService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      setDialog(null);
      refresh();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Kurslar"
        description="Kurs narxi, chegirma va davomiyligi"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Kurs qo‘shish
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={searchInput} onChange={(value) => changeFilter(() => setSearchInput(value))} placeholder="Kurs nomi" className="sm:max-w-xs" />
        <Select value={category} onChange={(event) => changeFilter(() => setCategory(event.target.value as CourseCategory | ''))} aria-label="Yo‘nalish" wrapperClassName="sm:w-52">
          <option value="">Barcha yo‘nalishlar</option>
          {COURSE_CATEGORY_ORDER.map((item) => (
            <option key={item} value={item}>
              {COURSE_CATEGORY_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value as CourseStatus | ''))} aria-label="Holat" wrapperClassName="sm:w-44">
          <option value="">Barcha holatlar</option>
          {COURSE_STATUS_ORDER.map((item) => (
            <option key={item} value={item}>
              {COURSE_STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
      </div>

      {coursesQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : coursesQuery.isError ? (
        <Card>
          <ErrorState error={coursesQuery.error} onRetry={() => void coursesQuery.refetch()} />
        </Card>
      ) : coursesQuery.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Kurs topilmadi"
            description={canManage ? 'Birinchi kursni qo‘shing' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {coursesQuery.data.items.map((course) => (
              <Card key={course.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-fg">{course.name}</h2>
                    <p className="mt-1 text-xs text-fg-muted">
                      {COURSE_CATEGORY_LABELS[course.category]} · {course.durationMonths} oy
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={COURSE_STATUS_TONES[course.status]}>{COURSE_STATUS_LABELS[course.status]}</Badge>
                    {canManage && (
                      <ActionMenu
                        label={`${course.name} amallari`}
                        items={[
                          { label: 'Kurs dasturi', icon: BookOpen, onSelect: () => setDialog({ type: 'curriculum', course }) },
                          { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', course }) },
                          { label: 'O‘chirish', icon: Trash2, tone: 'danger', onSelect: () => setDialog({ type: 'delete', course }) },
                        ]}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-lg font-semibold text-fg">{formatMoney(course.finalPrice)}</p>
                  {course.discountAmount > 0 && (
                    <p className="text-xs text-fg-muted">
                      <span className="line-through">{formatMoney(course.price)}</span>
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">−{formatMoney(course.discountAmount)}</span>
                    </p>
                  )}
                </div>

                {course.description && <p className="mt-3 line-clamp-2 text-sm text-fg-muted">{course.description}</p>}

                <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs text-fg-muted">
                  <span className="flex items-center gap-1.5" title="Guruhlar">
                    <Layers className="size-3.5" aria-hidden />
                    {course.counts.groups} guruh
                  </span>
                  <span className="flex items-center gap-1.5" title="O‘quvchilar">
                    <GraduationCap className="size-3.5" aria-hidden />
                    {course.counts.students} o‘quvchi
                  </span>
                  <span className="flex items-center gap-1.5" title="Qiziqqan leadlar">
                    <Target className="size-3.5" aria-hidden />
                    {course.counts.leads} lead
                  </span>
                </div>

                {course.teacher && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
                    <UserRound className="size-3.5" aria-hidden />
                    {course.teacher.firstName} {course.teacher.lastName}
                  </p>
                )}
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <Pagination
              page={coursesQuery.data.meta.page}
              totalPages={coursesQuery.data.meta.totalPages}
              total={coursesQuery.data.meta.total}
              limit={coursesQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={coursesQuery.isFetching}
            />
          </Card>
        </>
      )}

      {dialog?.type === 'curriculum' && <CurriculumModal course={dialog.course} onClose={() => setDialog(null)} />}
      {dialog?.type === 'create' && (
        <CourseFormModal
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <CourseFormModal
          course={dialog.course}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Kurs o‘chirilsinmi?"
        description={
          dialog?.type === 'delete'
            ? `«${dialog.course.name}» o‘chiriladi. Guruh, o‘quvchi yoki to‘lovi bo‘lgan kursni o‘chirib bo‘lmaydi — buning o‘rniga holatini "Arxivlangan" qiling.`
            : ''
        }
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.course.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
