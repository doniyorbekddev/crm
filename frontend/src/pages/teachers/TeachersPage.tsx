import { headerSort } from '@/utils/tableSort';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Eye, FolderLock, Pencil, Plus, Power, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import type { SalaryType, TeacherItem, TeacherListParams } from '@/types/teacher';
import { formatDate, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONES } from '@/utils/employeeLabels';
import { SALARY_TYPE_LABELS, SALARY_TYPE_ORDER, salaryRuleSummary } from '@/utils/teacherLabels';
import { StaffDocumentsModal } from '@/pages/hr/StaffDocumentsModal';
import { SalaryRuleModal } from './SalaryRuleModal';
import { TeacherFormModal } from './TeacherFormModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Ism (A–Z)' },
  { value: 'name:desc', label: 'Ism (Z–A)' },
  { value: 'hireDate:desc', label: 'Yangi ishga olinganlar' },
  { value: 'createdAt:desc', label: 'Yangi qo‘shilganlar' },
] as const;

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; teacher: TeacherItem }
  | { type: 'salary-rule'; teacher: TeacherItem }
  | { type: 'toggle'; teacher: TeacherItem }
  | { type: 'documents'; teacher: TeacherItem }
  | null;

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { teacher: 'name' } as const;

export default function TeachersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = usePermission(PERMISSIONS.TEACHER_MANAGE);
  const canViewSalary = usePermission(PERMISSIONS.SALARY_VIEW);
  const canViewDocuments = usePermission(PERMISSIONS.STAFF_DOCUMENT_VIEW);
  const canManageDocuments = usePermission(PERMISSIONS.STAFF_DOCUMENT_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('true');
  const [salaryType, setSalaryType] = useState<SalaryType | ''>('');
  const [sort, setSort] = useState<string>('name:asc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [sortBy, sortOrder] = sort.split(':') as [TeacherListParams['sortBy'], TeacherListParams['sortOrder']];
  const params: TeacherListParams = {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(search ? { search } : {}),
    ...(isActive ? { isActive } : {}),
    ...(salaryType ? { salaryType } : {}),
  };

  const teachersQuery = useQuery({
    queryKey: queryKeys.teachers.list(params),
    queryFn: () => teachersService.list(params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.salaries.all });
  };

  const toggleActive = useMutation({
    mutationFn: (teacher: TeacherItem) =>
      teachersService.update(teacher.id, {
        isActive: !teacher.isActive,
        ...(teacher.specialization ? { specialization: teacher.specialization } : {}),
        ...(teacher.experienceYears === null ? {} : { experienceYears: teacher.experienceYears }),
        ...(teacher.hireDate ? { hireDate: teacher.hireDate } : {}),
        ...(teacher.bio ? { bio: teacher.bio } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.data.isActive ? 'O‘qituvchi faollashtirildi' : 'O‘qituvchi faolsizlantirildi');
      setDialog(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const rowActions = (teacher: TeacherItem) => [
    { label: 'Profil', icon: Eye, onSelect: () => navigate(`/teachers/${teacher.id}`) },
    ...(canViewDocuments
      ? [{ label: teacher.documents > 0 ? `Hujjatlar (${teacher.documents})` : 'Hujjatlar', icon: FolderLock, onSelect: () => setDialog({ type: 'documents', teacher }) }]
      : []),
    ...(canManage
      ? [
          { label: 'Profilni tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', teacher }) },
          { label: 'Maosh modeli', icon: Coins, onSelect: () => setDialog({ type: 'salary-rule', teacher }) },
          {
            label: teacher.isActive ? 'Faolsizlantirish' : 'Faollashtirish',
            icon: Power,
            tone: teacher.isActive ? ('danger' as const) : ('default' as const),
            onSelect: () => setDialog({ type: 'toggle', teacher }),
          },
        ]
      : []),
  ];

  type TeacherTableRow = NonNullable<typeof teachersQuery.data>['items'][number];
  const teacherTableColumns: Array<ColumnDef<TeacherTableRow>> = [
    {
      key: 'teacher',
      sortable: true,
      label: 'O‘qituvchi',
      required: true,
      cell: (teacher: TeacherTableRow) => (
        <>
          <p className="font-medium text-fg">
            {teacher.user.firstName} {teacher.user.lastName}
            {teacher.employmentStatus !== 'ACTIVE' && (
              <Badge tone={EMPLOYEE_STATUS_TONES[teacher.employmentStatus]} className="ml-2">
                {EMPLOYEE_STATUS_LABELS[teacher.employmentStatus]}
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {teacher.user.email} · {teacher.user.roleName}
          </p>
        </>
      ),
    },
    {
      key: 'specialization',
      label: 'Mutaxassislik',
      cell: (teacher: TeacherTableRow) => (
        <>
          <p className="text-fg">{teacher.specialization ?? '—'}</p>
          <p className="text-xs text-fg-muted">
            {teacher.experienceYears === null ? 'Tajriba ko‘rsatilmagan' : `${teacher.experienceYears} yil tajriba`}
            {teacher.hireDate && ` · ${formatDate(teacher.hireDate)}`}
            {teacher.terminationDate && ` · ketgan ${formatDate(teacher.terminationDate)}`}
          </p>
        </>
      ),
    },
    {
      key: 'groups',
      label: 'Guruh',
      thClassName: 'text-right',
      tdClassName: 'text-right tabular-nums text-fg-muted',
      cell: (teacher: TeacherTableRow) => (
        <>
          {formatNumber(teacher.groups)}
        </>
      ),
    },
    {
      key: 'students',
      label: 'O‘quvchi',
      thClassName: 'text-right',
      tdClassName: 'text-right tabular-nums text-fg-muted',
      cell: (teacher: TeacherTableRow) => (
        <>
          {formatNumber(teacher.students)}
        </>
      ),
    },
    {
      key: 'monthLessons',
      label: 'Oylik dars',
      thClassName: 'text-right',
      tdClassName: 'text-right tabular-nums text-fg-muted',
      cell: (teacher: TeacherTableRow) => (
        <>
          {formatNumber(teacher.lessonsThisMonth)}
        </>
      ),
    },
    {
      key: 'salaryModel',
      label: 'Maosh modeli',
      cell: (teacher: TeacherTableRow) => (
        <>
          {!teacher.salaryVisible ? (
            <span className="text-xs text-fg-subtle">—</span>
          ) : teacher.salaryRule ? (
            <>
              <Badge tone="blue">{SALARY_TYPE_LABELS[teacher.salaryRule.type]}</Badge>
              {canViewSalary && (
                <p className="mt-1 text-xs text-fg-muted">{salaryRuleSummary(teacher.salaryRule)}</p>
              )}
            </>
          ) : (
            <Badge tone="yellow">Belgilanmagan</Badge>
          )}
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
      stopRowClick: true,
      cell: (teacher: TeacherTableRow) => (
        <>
          <ActionMenu
            label={`${teacher.user.firstName} ${teacher.user.lastName} amallari`}
            items={rowActions(teacher)}
          />
        </>
      ),
    },
  ];
  const teacherTable = useTableColumns('teachers', teacherTableColumns);
  const density = useTableDensity();

  return (
    <>
      <PageHeader
        title="O‘qituvchilar"
        description="Profillar, yuklama va maosh modellari"
        documentTitle="O‘qituvchilar"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              O‘qituvchi qo‘shish
            </Button>
          ) : undefined
        }
      />

      <DataTable
        {...headerSort(sort, SORT_COLUMNS, 'name:asc', (value) => changeFilter(() => setSort(value)))}
        label="O‘qituvchilar"
        columns={teacherTable.visibleColumns}
        rows={teachersQuery.data?.items}
        rowKey={(teacher) => teacher.id}
        onRowClick={(teacher) => navigate(`/teachers/${teacher.id}`)}
        rowClassName={(teacher) => !teacher.isActive && 'opacity-60'}
        loading={teachersQuery.isPending}
        error={teachersQuery.error}
        onRetry={() => void teachersQuery.refetch()}
        retrying={teachersQuery.isFetching}
        stale={teachersQuery.isPlaceholderData}
        empty={{
          icon: UserCog,
          title: 'O‘qituvchi topilmadi',
          description: canManage ? 'Dars belgilash ruxsati bor xodimga o‘qituvchi profili oching' : 'Filtrlarni o‘zgartirib ko‘ring',
        }}
        toolbar={
          <FilterBar
            search={{ value: searchInput, onChange: (value) => changeFilter(() => setSearchInput(value)), placeholder: 'Ism, email yoki mutaxassislik' }}
            activeCount={Number(isActive !== 'true') + Number(Boolean(salaryType))}
            onClear={() =>
              changeFilter(() => {
                setIsActive('true');
                setSalaryType('');
              })
            }
          >
            <FilterField className="sm:w-40">
              <Select value={isActive} onChange={(event) => changeFilter(() => setIsActive(event.target.value as '' | 'true' | 'false'))} aria-label="Holat">
                <option value="true">Faol</option>
                <option value="false">Faolsiz</option>
                <option value="">Barchasi</option>
              </Select>
            </FilterField>
            <FilterField className="sm:w-48">
              <Select value={salaryType} onChange={(event) => changeFilter(() => setSalaryType(event.target.value as SalaryType | ''))} aria-label="Maosh modeli">
                <option value="">Barcha modellar</option>
                {SALARY_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {SALARY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterBar>
        }
        toolbarActions={
          <>
            <Select value={sort} onChange={(event) => changeFilter(() => setSort(event.target.value))} aria-label="Saralash" wrapperClassName="w-44">
              {!SORT_OPTIONS.some((option) => option.value === sort) && <option value={sort}>Ustun bo‘yicha</option>}
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <ColumnSettings control={teacherTable} />
          </>
        }
        {...density}
        mobileLayout="cards"
        {...(teachersQuery.data
          ? {
              pagination: {
                page,
                totalPages: teachersQuery.data.meta.totalPages,
                total: teachersQuery.data.meta.total,
                limit: PAGE_SIZE,
                onPageChange: setPage,
                disabled: teachersQuery.isPlaceholderData,
              },
            }
          : {})}
      />

      {dialog?.type === 'documents' && (
        <StaffDocumentsModal
          owner="teacher"
          entityId={dialog.teacher.id}
          personName={`${dialog.teacher.user.firstName} ${dialog.teacher.user.lastName}`}
          canManage={canManageDocuments}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      )}

      {dialog?.type === 'create' && (
        <TeacherFormModal
          mode="create"
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <TeacherFormModal
          mode="edit"
          teacher={dialog.teacher}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'salary-rule' && (
        <SalaryRuleModal
          teacher={dialog.teacher}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={dialog?.type === 'toggle'}
        title={dialog?.type === 'toggle' && dialog.teacher.isActive ? 'O‘qituvchini faolsizlantirish' : 'O‘qituvchini faollashtirish'}
        description={
          dialog?.type === 'toggle' && dialog.teacher.isActive
            ? 'Faolsiz o‘qituvchi maosh hisoblashda hisobga olinmaydi. Guruhlari va tarixi saqlanadi.'
            : 'O‘qituvchi yana maosh hisoblashda qatnashadi.'
        }
        confirmLabel={dialog?.type === 'toggle' && dialog.teacher.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
        tone={dialog?.type === 'toggle' && dialog.teacher.isActive ? 'danger' : 'primary'}
        loading={toggleActive.isPending}
        onConfirm={() => dialog?.type === 'toggle' && toggleActive.mutate(dialog.teacher)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
