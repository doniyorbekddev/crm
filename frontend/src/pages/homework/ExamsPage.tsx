import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, ClipboardCheck, FileCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ExamQuestionsModal } from './ExamQuestionsModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import { examsService } from '@/services/homework.service';
import type { Exam, ExamListParams, ExamStatus } from '@/types/homework';
import { formatDate, formatNumber } from '@/utils/format';
import { EXAM_STATUS_LABELS, EXAM_STATUS_ORDER, EXAM_STATUS_TONES, EXAM_TYPE_LABELS } from '@/utils/homeworkLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { ExamFormModal } from './ExamFormModal';
import { ExamResultsModal } from './ExamResultsModal';

const PAGE_SIZE = 20;

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; exam: Exam }
  | { type: 'results'; id: string }
  | { type: 'questions'; exam: Exam }
  | { type: 'delete'; exam: Exam }
  | null;

export default function ExamsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EXAM_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<ExamStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: ExamListParams = {
    page,
    limit: PAGE_SIZE,
    sortBy: 'date',
    sortOrder: 'desc',
    ...(search ? { search } : {}),
    ...(groupId ? { groupId } : {}),
    ...(status ? { status } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.exams.list(params),
    queryFn: () => examsService.list(params),
    placeholderData: keepPreviousData,
  });
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    queryFn: () => groupsService.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.exams.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gamification.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => examsService.remove(id),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Imtihonlar"
        description="Imtihon va testlar, natijalar, baho va o‘tish foizi"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Imtihon qo‘shish
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput
            value={searchInput}
            onChange={(value) => changeFilter(() => setSearchInput(value))}
            placeholder="Sarlavha yoki guruh"
            className="sm:max-w-xs"
          />
          <Select
            value={groupId}
            onChange={(event) => changeFilter(() => setGroupId(event.target.value))}
            aria-label="Guruh"
            wrapperClassName="sm:w-52"
          >
            <option value="">Barcha guruhlar</option>
            {(groupsQuery.data?.items ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => changeFilter(() => setStatus(event.target.value as ExamStatus | ''))}
            aria-label="Holat"
            wrapperClassName="sm:w-48"
          >
            <option value="">Barcha holatlar</option>
            {EXAM_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {EXAM_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>

        {listQuery.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="Imtihon topilmadi"
            description={canManage ? 'Guruh uchun yangi imtihon qo‘shing' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Imtihon</TH>
                    <TH>Guruh</TH>
                    <TH>Sana</TH>
                    <TH>Baholandi</TH>
                    <TH className="text-right">O‘rtacha</TH>
                    <TH className="text-right">O‘tdi</TH>
                    <TH className="w-12">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((exam) => (
                    <TR key={exam.id} onClick={() => setDialog({ type: 'results', id: exam.id })} className="cursor-pointer">
                      <TD>
                        <p className="font-medium text-fg">{exam.title}</p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                          <Badge tone={EXAM_STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
                          {exam.isOnline && <Badge tone="purple">Onlayn</Badge>}
                          {EXAM_TYPE_LABELS[exam.type]} · {exam.maxScore} ball
                        </p>
                      </TD>
                      <TD>
                        <p className="text-fg">{exam.group.name}</p>
                        <p className="text-xs text-fg-muted">{exam.course?.name ?? '—'}</p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDate(exam.date)}</TD>
                      <TD className="text-fg">
                        {formatNumber(exam.stats.graded)} / {formatNumber(exam.stats.students)}
                      </TD>
                      <TD
                        className={cn(
                          'text-right font-medium tabular-nums',
                          exam.stats.graded === 0
                            ? 'text-fg-subtle'
                            : exam.stats.averagePercentage >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : exam.stats.averagePercentage >= 60
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {exam.stats.graded === 0 ? '—' : `${exam.stats.averagePercentage}%`}
                      </TD>
                      <TD className="text-right tabular-nums text-fg-muted">
                        {exam.stats.graded === 0 || exam.passScore === null ? '—' : `${exam.stats.passRate}%`}
                      </TD>
                      <TD className="text-right" onClick={(event) => event.stopPropagation()}>
                        <ActionMenu
                          label={`${exam.title} amallari`}
                          items={[
                            {
                              label: 'Natijalar',
                              icon: ClipboardCheck,
                              onSelect: () => setDialog({ type: 'results', id: exam.id }),
                            },
                            {
                              label: 'Savollar va tahlil',
                              icon: ListChecks,
                              onSelect: () => setDialog({ type: 'questions', exam }),
                            },
                            ...(canManage
                              ? [
                                  { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', exam }) },
                                  {
                                    label: 'O‘chirish',
                                    icon: Trash2,
                                    tone: 'danger' as const,
                                    onSelect: () => setDialog({ type: 'delete', exam }),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              disabled={listQuery.isPlaceholderData}
            />
          </>
        )}
      </Card>

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <ExamFormModal
          {...(dialog.type === 'edit' ? { exam: dialog.exam } : {})}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'questions' && <ExamQuestionsModal exam={dialog.exam} onClose={() => setDialog(null)} />}

      {dialog?.type === 'results' && (
        <ExamResultsModal examId={dialog.id} onClose={() => setDialog(null)} onChanged={refresh} />
      )}

      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Imtihonni o‘chirish"
        description={
          dialog?.type === 'delete'
            ? `"${dialog.exam.title}" o‘chiriladi. Natijasi kiritilgan imtihonni o‘chirib bo‘lmaydi — uni bekor qiling.`
            : ''
        }
        confirmLabel="O‘chirish"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.exam.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
