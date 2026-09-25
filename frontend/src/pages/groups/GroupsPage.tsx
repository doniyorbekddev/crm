import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Target, Trash2 } from 'lucide-react';
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
import { TBody, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import type { GroupItem, GroupListParams, GroupStatus } from '@/types/group';
import { GROUP_STATUS_LABELS, GROUP_STATUS_ORDER, GROUP_STATUS_TONES, formatSchedule } from '@/utils/courseLabels';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupFormModal } from './GroupFormModal';
import { GroupMasteryModal } from './GroupMasteryModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { ColumnCells, ColumnHeaders } from '@/components/ui/ColumnTable';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

type Dialog = { type: 'create' } | { type: 'edit' | 'delete' | 'mastery'; group: GroupItem } | null;

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.GROUP_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState<GroupStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: GroupListParams = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(courseId ? { courseId } : {}),
    ...(status ? { status } : {}),
  };

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list(params),
    queryFn: () => groupsService.list(params),
    placeholderData: keepPreviousData,
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.groupForm,
    queryFn: groupsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => groupsService.remove(id),
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

  type GroupTableRow = NonNullable<typeof groupsQuery.data>['items'][number];
  const groupTableColumns: Array<ColumnDef<GroupTableRow>> = [
    {
      key: 'group',
      label: 'Guruh',
      required: true,
      cell: (group: GroupTableRow) => (
        <>
          <p className="font-medium text-fg">{group.name}</p>
          <p className="text-xs text-fg-muted">
            {group.course.name}
            {group.room && ` · ${group.room}-xona`}
          </p>
        </>
      ),
    },
    {
      key: 'schedule',
      label: 'Jadval',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (group: GroupTableRow) => (
        <>
          {formatSchedule(group.scheduleDays, group.startTime, group.endTime)}
        </>
      ),
    },
    {
      key: 'teacher',
      label: 'O‘qituvchi',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (group: GroupTableRow) => (
        <>
          {group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : '—'}
        </>
      ),
    },
    {
      key: 'students',
      label: 'O‘quvchilar',
      tdClassName: 'whitespace-nowrap',
      cell: (group: GroupTableRow) => (
        <>
          <span className="font-medium text-fg">
            {group.studentCount} / {group.capacity}
          </span>
          <span className={cn('ml-2 text-xs', group.freeSeats === 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>
            {group.freeSeats === 0 ? 'to‘lgan' : `${group.freeSeats} o‘rin bo‘sh`}
          </span>
        </>
      ),
    },
    {
      key: 'startDate',
      label: 'Boshlanish',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (group: GroupTableRow) => (
        <>
          {formatDate(group.startDate)}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Holat',
      cell: (group: GroupTableRow) => (
        <>
          <Badge tone={GROUP_STATUS_TONES[group.status]}>{GROUP_STATUS_LABELS[group.status]}</Badge>
        </>
      ),
    },
    {
      key: 'actions',
      label: 'Amallar',
      header: <span className="sr-only">Amallar</span>,
      fixed: true,
      thClassName: 'w-12',
      tdClassName: 'text-right',
      cell: (group: GroupTableRow) => (
        <>
          <ActionMenu
            label={`${group.name} amallari`}
            items={[
              { label: 'O‘zlashtirish', icon: Target, onSelect: () => setDialog({ type: 'mastery', group }) },
              ...(canManage
                ? [
                    { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', group }) },
                    { label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', group }) },
                  ]
                : []),
            ]}
          />
        </>
      ),
    },
  ];
  const groupTable = useTableColumns('groups', groupTableColumns);

  return (
    <>
      <PageHeader
        title="Guruhlar"
        description="Dars jadvali, xona, o‘qituvchi va bo‘sh o‘rinlar"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Guruh qo‘shish
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput value={searchInput} onChange={(value) => changeFilter(() => setSearchInput(value))} placeholder="Guruh, xona yoki kurs" className="sm:max-w-xs" />
          <Select value={courseId} onChange={(event) => changeFilter(() => setCourseId(event.target.value))} aria-label="Kurs" wrapperClassName="sm:w-52">
            <option value="">Barcha kurslar</option>
            {lookupsQuery.data?.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value as GroupStatus | ''))} aria-label="Holat" wrapperClassName="sm:w-44">
            <option value="">Barcha holatlar</option>
            {GROUP_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {GROUP_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>

        {groupsQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : groupsQuery.isError ? (
          <ErrorState error={groupsQuery.error} retrying={groupsQuery.isFetching} onRetry={() => void groupsQuery.refetch()} />
        ) : groupsQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Guruh topilmadi"
            description={canManage ? 'Yangi guruh qo‘shing' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <div className="flex justify-end border-b border-border px-4 py-2">
              <ColumnSettings control={groupTable} />
            </div>
            <TableContainer className={cn('transition-opacity', groupsQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <ColumnHeaders columns={groupTable.visibleColumns} />
                  </tr>
                </THead>
                <TBody>
                  {groupsQuery.data.items.map((group) => (
                    <TR key={group.id}>
                      <ColumnCells columns={groupTable.visibleColumns} row={group} />
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={groupsQuery.data.meta.page}
              totalPages={groupsQuery.data.meta.totalPages}
              total={groupsQuery.data.meta.total}
              limit={groupsQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={groupsQuery.isFetching}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'create' && (
        <GroupFormModal
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <GroupFormModal
          group={dialog.group}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'mastery' && <GroupMasteryModal group={dialog.group} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Guruh o‘chirilsinmi?"
        description={
          dialog?.type === 'delete'
            ? `«${dialog.group.name}» o‘chiriladi. O‘quvchisi bor guruhni o‘chirib bo‘lmaydi.`
            : ''
        }
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.group.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
