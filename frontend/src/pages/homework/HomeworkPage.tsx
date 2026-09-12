import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
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
import { homeworkService } from '@/services/homework.service';
import type { Homework, HomeworkListParams, HomeworkStatus } from '@/types/homework';
import { formatDateTime, formatNumber } from '@/utils/format';
import { HOMEWORK_STATUS_LABELS, HOMEWORK_STATUS_ORDER, HOMEWORK_STATUS_TONES } from '@/utils/homeworkLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { HomeworkDetailModal } from './HomeworkDetailModal';
import { HomeworkFormModal } from './HomeworkFormModal';

const PAGE_SIZE = 20;

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; homework: Homework }
  | { type: 'detail'; id: string }
  | { type: 'delete'; homework: Homework }
  | null;

export default function HomeworkPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.HOMEWORK_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<HomeworkStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: HomeworkListParams = {
    page,
    limit: PAGE_SIZE,
    sortBy: 'deadline',
    sortOrder: 'desc',
    ...(search ? { search } : {}),
    ...(groupId ? { groupId } : {}),
    ...(status ? { status } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.homework.list(params),
    queryFn: () => homeworkService.list(params),
    placeholderData: keepPreviousData,
  });
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    queryFn: () => groupsService.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.homework.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gamification.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => homeworkService.remove(id),
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
        title="Uy vazifalari"
        description="Vazifa berish, topshiriqlarni belgilash va baholash"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Vazifa berish
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
            onChange={(event) => changeFilter(() => setStatus(event.target.value as HomeworkStatus | ''))}
            aria-label="Holat"
            wrapperClassName="sm:w-48"
          >
            <option value="">Barcha holatlar</option>
            {HOMEWORK_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {HOMEWORK_STATUS_LABELS[item]}
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
            icon={ClipboardList}
            title="Uy vazifasi topilmadi"
            description={canManage ? 'Guruhga yangi vazifa bering' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Vazifa</TH>
                    <TH>Guruh</TH>
                    <TH>Muddat</TH>
                    <TH>Topshirdi</TH>
                    <TH className="text-right">O‘rtacha</TH>
                    <TH className="w-12">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((homework) => (
                    <TR key={homework.id} onClick={() => setDialog({ type: 'detail', id: homework.id })} className="cursor-pointer">
                      <TD>
                        <p className="font-medium text-fg">{homework.title}</p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                          <Badge tone={HOMEWORK_STATUS_TONES[homework.status]}>{HOMEWORK_STATUS_LABELS[homework.status]}</Badge>
                          {homework.isOverdue && <Badge tone="red">Muddati o‘tgan</Badge>}
                          {homework.maxPoints} ball
                        </p>
                      </TD>
                      <TD>
                        <p className="text-fg">{homework.group.name}</p>
                        <p className="text-xs text-fg-muted">{homework.course?.name ?? '—'}</p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(homework.deadline)}</TD>
                      <TD>
                        <p className="text-fg">
                          {formatNumber(homework.stats.submitted)} / {formatNumber(homework.stats.students)}
                        </p>
                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              homework.stats.submissionRate >= 80
                                ? 'bg-emerald-500'
                                : homework.stats.submissionRate >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-red-500',
                            )}
                            style={{ width: `${Math.max(homework.stats.submissionRate, 2)}%` }}
                          />
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums text-fg-muted">
                        {homework.stats.graded > 0 ? `${homework.stats.averageScore}/${homework.maxPoints}` : '—'}
                      </TD>
                      <TD className="text-right" onClick={(event) => event.stopPropagation()}>
                        <ActionMenu
                          label={`${homework.title} amallari`}
                          items={[
                            { label: 'Ochish', icon: Eye, onSelect: () => setDialog({ type: 'detail', id: homework.id }) },
                            ...(canManage
                              ? [
                                  { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', homework }) },
                                  {
                                    label: 'O‘chirish',
                                    icon: Trash2,
                                    tone: 'danger' as const,
                                    onSelect: () => setDialog({ type: 'delete', homework }),
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
        <HomeworkFormModal
          {...(dialog.type === 'edit' ? { homework: dialog.homework } : {})}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'detail' && (
        <HomeworkDetailModal homeworkId={dialog.id} onClose={() => setDialog(null)} onChanged={refresh} />
      )}

      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Uy vazifasini o‘chirish"
        description={
          dialog?.type === 'delete'
            ? `"${dialog.homework.title}" vazifasi va uning topshiriqlari o‘chiriladi. Baholangan vazifani o‘chirib bo‘lmaydi.`
            : ''
        }
        confirmLabel="O‘chirish"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.homework.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
