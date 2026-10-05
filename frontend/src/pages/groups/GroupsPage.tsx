import { headerSort } from '@/utils/tableSort';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import type { GroupItem, GroupListParams, GroupStatus } from '@/types/group';
import { GROUP_STATUS_LABELS, GROUP_STATUS_ORDER, formatSchedule } from '@/utils/courseLabels';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupFormModal } from './GroupFormModal';
import { GroupMasteryModal } from './GroupMasteryModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

type Dialog = { type: 'create' } | { type: 'edit' | 'delete' | 'mastery'; group: GroupItem } | null;

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { group: 'name', startDate: 'startDate' } as const;

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = usePermission(PERMISSIONS.GROUP_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState<GroupStatus | ''>('');
  const [sort, setSort] = useState('startDate:desc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [sortBy, sortOrder] = sort.split(':') as [NonNullable<GroupListParams['sortBy']>, 'asc' | 'desc'];
  const params: GroupListParams = {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
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
      sortable: true,
      label: 'Guruh',
      required: true,
      cell: (group: GroupTableRow) => (
        <>
          <Link to={`/groups/${group.id}`} className="focus-ring rounded-sm font-medium text-fg hover:underline">
            {group.name}
          </Link>
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
          <span className={cn('ml-2 text-xs', group.freeSeats === 0 ? 'text-danger' : 'text-fg-muted')}>
            {group.freeSeats === 0 ? 'to‘lgan' : `${group.freeSeats} o‘rin bo‘sh`}
          </span>
        </>
      ),
    },
    {
      key: 'startDate',
      sortable: true,
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
          <StatusBadge kind="group" status={group.status} />
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
              { label: 'Guruh sahifasi', icon: Layers, onSelect: () => navigate(`/groups/${group.id}`) },
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
  const density = useTableDensity();

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

      <DataTable
        {...headerSort(sort, SORT_COLUMNS, 'startDate:desc', (value) => changeFilter(() => setSort(value)))}
        label="Guruhlar"
        columns={groupTable.visibleColumns}
        rows={groupsQuery.data?.items}
        rowKey={(group) => group.id}
        loading={groupsQuery.isPending}
        error={groupsQuery.error}
        onRetry={() => void groupsQuery.refetch()}
        retrying={groupsQuery.isFetching}
        stale={groupsQuery.isPlaceholderData}
        empty={{ icon: Layers, title: 'Guruh topilmadi', description: canManage ? 'Yangi guruh qo‘shing' : 'Filtrlarni o‘zgartirib ko‘ring' }}
        toolbar={
          <FilterBar
            search={{ value: searchInput, onChange: (value) => changeFilter(() => setSearchInput(value)), placeholder: 'Guruh, xona yoki kurs' }}
            activeCount={Number(Boolean(courseId)) + Number(Boolean(status))}
            onClear={() =>
              changeFilter(() => {
                setCourseId('');
                setStatus('');
              })
            }
          >
            <FilterField className="sm:w-52">
              <Select value={courseId} onChange={(event) => changeFilter(() => setCourseId(event.target.value))} aria-label="Kurs">
                <option value="">Barcha kurslar</option>
                {lookupsQuery.data?.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField>
              <Select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value as GroupStatus | ''))} aria-label="Holat">
                <option value="">Barcha holatlar</option>
                {GROUP_STATUS_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {GROUP_STATUS_LABELS[item]}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterBar>
        }
        toolbarActions={<ColumnSettings control={groupTable} />}
        {...density}
        mobileLayout="cards"
        {...(groupsQuery.data
          ? {
              pagination: {
                page: groupsQuery.data.meta.page,
                totalPages: groupsQuery.data.meta.totalPages,
                total: groupsQuery.data.meta.total,
                limit: groupsQuery.data.meta.limit,
                onPageChange: setPage,
                disabled: groupsQuery.isFetching,
              },
            }
          : {})}
      />

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
