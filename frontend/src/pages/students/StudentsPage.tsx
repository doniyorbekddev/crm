import { headerSort } from '@/utils/tableSort';
import { Tooltip } from '@/components/ui/Tooltip';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ArrowLeftRight, CalendarCheck, GraduationCap, Pencil, Plus, RefreshCw, Sparkles, Trash2, UserRound, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { useBranchParam } from '@/store/branch.store';
import { studentsService } from '@/services/students.service';
import type { RiskLevel, StudentItem, StudentListParams, StudentStatus, StudentSummaryParams } from '@/types/student';
import { formatDate, formatMoney, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import {
  DEBT_STATUS_LABELS,
  DEBT_STATUS_TONES,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_ORDER,
  RISK_LEVEL_TONES,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_ORDER,
  STUDENT_STATUS_TONES,
} from '@/utils/studentLabels';
import { StudentXpModal } from '../gamification/StudentXpModal';
import { PaymentFormModal } from '../payments/PaymentFormModal';
import { StudentAttendanceModal } from './StudentAttendanceModal';
import { StudentFormModal } from './StudentFormModal';
import { BulkPortalAccountsModal } from '@/components/BulkPortalAccountsModal';
import { PortalAccountModal } from '@/components/PortalAccountModal';
import { StudentStatusModal } from './StudentStatusModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';
import { TransferGroupModal } from './TransferGroupModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Avval yangilari' },
  { value: 'createdAt:asc', label: 'Avval eskilari' },
  { value: 'firstName:asc', label: 'Ism (A–Z)' },
  { value: 'startDate:desc', label: 'O‘qish boshlanishi' },
  { value: 'number:asc', label: 'Raqami bo‘yicha' },
] as const;

type Dialog =
  | { type: 'create' }
  | { type: 'portalBulk' }
  | { type: 'edit' | 'status' | 'transfer' | 'delete' | 'attendance' | 'payment' | 'xp' | 'portal' | 'portalReset'; student: StudentItem }
  | null;

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { student: 'firstName', startDate: 'startDate' } as const;

export default function StudentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.STUDENT_MANAGE);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();
  const canViewAttendance = usePermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canCreatePayment = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const canViewGamification = usePermission(PERMISSIONS.GAMIFICATION_VIEW);
  const canManagePortal = usePermission(PERMISSIONS.PORTAL_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [status, setStatus] = useState<StudentStatus | 'ALL'>('ALL');
  const [courseId, setCourseId] = useState('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel | 'ALL'>('ALL');
  const [sort, setSort] = useState<string>('createdAt:desc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const branchParam = useBranchParam();

  const [sortBy, sortOrder] = sort.split(':') as [StudentListParams['sortBy'], StudentListParams['sortOrder']];
  const summaryParams: StudentSummaryParams = {
    ...branchParam,
    ...(search ? { search } : {}),
    ...(courseId ? { courseId } : {}),
  };
  const params: StudentListParams = {
    ...summaryParams,
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(status === 'ALL' ? {} : { status }),
    ...(riskLevel === 'ALL' ? {} : { riskLevel }),
  };

  const studentsQuery = useQuery({
    queryKey: queryKeys.students.list(params),
    queryFn: () => studentsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.students.summary(summaryParams),
    queryFn: () => studentsService.summary(summaryParams),
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.studentForm,
    queryFn: studentsService.formLookups,
    staleTime: 60_000,
    enabled: canManage || canManagePortal,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lookups.studentForm });
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => studentsService.remove(id),
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

  const summary = summaryQuery.data;
  const tabs: ReadonlyArray<StudentStatus | 'ALL'> = ['ALL', ...STUDENT_STATUS_ORDER];

  type StudentTableRow = NonNullable<typeof studentsQuery.data>['items'][number];
  const studentTableColumns: Array<ColumnDef<StudentTableRow>> = [
    {
      key: 'student',
      sortable: true,
      label: 'O‘quvchi',
      required: true,
      cell: (student: StudentTableRow) => (
        <>
          <Link to={`/students/${student.id}`} className="focus-ring rounded-sm font-medium text-fg hover:text-primary hover:underline">
            {student.firstName} {student.lastName}
          </Link>
          <p className="text-xs text-fg-muted">
            {student.code} · {formatPhone(student.phone)}
          </p>
        </>
      ),
    },
    {
      key: 'courseGroup',
      label: 'Kurs / guruh',
      cell: (student: StudentTableRow) => (
        <>
          <p className="text-fg">{student.course.name}</p>
          <p className="text-xs text-fg-muted">{student.group ? student.group.name : 'Guruhsiz'}</p>
        </>
      ),
    },
    {
      key: 'contract',
      label: 'Shartnoma',
      tdClassName: 'whitespace-nowrap',
      cell: (student: StudentTableRow) => (
        <>
          <p className="text-fg">{formatMoney(student.contractPrice)}</p>
          {student.contractNumber && <p className="text-xs text-fg-muted">{student.contractNumber}</p>}
        </>
      ),
    },
    {
      key: 'debt',
      label: 'Qarzdorlik',
      tdClassName: 'whitespace-nowrap',
      cell: (student: StudentTableRow) => (
        <>
          {student.debt ? (
            <>
              <p className={cn('font-medium', student.debt.remaining > 0 ? 'text-danger' : 'text-fg')}>
                {formatMoney(student.debt.remaining)}
              </p>
              <Badge tone={DEBT_STATUS_TONES[student.debt.status]}>{DEBT_STATUS_LABELS[student.debt.status]}</Badge>
            </>
          ) : (
            <span className="text-fg-muted">—</span>
          )}
        </>
      ),
    },
    {
      key: 'startDate',
      sortable: true,
      label: 'Boshlangan',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (student: StudentTableRow) => (
        <>
          {formatDate(student.startDate)}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Holat',
      cell: (student: StudentTableRow) => (
        <>
          <Badge tone={STUDENT_STATUS_TONES[student.status]}>{STUDENT_STATUS_LABELS[student.status]}</Badge>
        </>
      ),
    },
    {
      key: 'risk',
      label: 'Xavf',
      cell: (student: StudentTableRow) => (
        <>
          {student.riskLevel ? (
            <Badge tone={RISK_LEVEL_TONES[student.riskLevel]}>
              {RISK_LEVEL_LABELS[student.riskLevel]}
              {student.healthScore !== null && <span className="ml-1 tabular-nums opacity-70">{student.healthScore}</span>}
            </Badge>
          ) : (
            <Tooltip content="Baho uchun yetarli ma’lumot yo‘q" describe={false}>
              <span className="text-fg-subtle">
                <span aria-hidden>—</span>
                <span className="sr-only">Baho uchun yetarli ma’lumot yo‘q</span>
              </span>
            </Tooltip>
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
      cell: (student: StudentTableRow) => (
        <>
          <ActionMenu
            label={`${student.firstName} ${student.lastName} amallari`}
            items={[
              { label: 'Profil', icon: UserRound, onSelect: () => navigate(`/students/${student.id}`) },
              ...(canCreatePayment && (student.debt?.remaining ?? 0) > 0
                ? [{ label: 'To‘lov qabul qilish', icon: Wallet, onSelect: () => setDialog({ type: 'payment', student }) }]
                : []),
              ...(canViewGamification
                ? [{ label: 'XP va yutuqlar', icon: Sparkles, onSelect: () => setDialog({ type: 'xp', student }) }]
                : []),
              ...(canViewAttendance
                ? [
                    {
                      label: 'Davomat tarixi',
                      icon: CalendarCheck,
                      onSelect: () => setDialog({ type: 'attendance', student }),
                    },
                  ]
                : []),
              ...(canManage
                ? [
                    { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', student }) },
                    { label: 'Guruhga o‘tkazish', icon: ArrowLeftRight, onSelect: () => setDialog({ type: 'transfer', student }) },
                    { label: 'Holatni o‘zgartirish', icon: RefreshCw, onSelect: () => setDialog({ type: 'status', student }) },
                    ...(canManagePortal
                      ? [
                          student.hasPortalAccount
                            ? {
                                label: 'Kabinet parolini tiklash',
                                icon: KeyRound,
                                onSelect: () => setDialog({ type: 'portalReset', student }),
                              }
                            : {
                                label: 'Kabinet ochish',
                                icon: KeyRound,
                                onSelect: () => setDialog({ type: 'portal', student }),
                              },
                        ]
                      : []),
                    {
                      label: 'O‘chirish',
                      icon: Trash2,
                      tone: 'danger' as const,
                      onSelect: () => setDialog({ type: 'delete', student }),
                    },
                  ]
                : []),
            ]}
          />
        </>
      ),
    },
  ];
  const studentTable = useTableColumns('students', studentTableColumns);
  const density = useTableDensity();

  return (
    <>
      <PageHeader
        title="O‘quvchilar"
        description="Shartnoma, guruh, holat va qarzdorlik"
        actions={
          <>
            {canExport && (
              <ExportMenu
                loading={exporting}
                onExport={(format) =>
                  void runExport('/students/export', { ...summaryParams, sortBy, sortOrder, ...(status === 'ALL' ? {} : { status }) }, 'oquvchilar', format)
                }
              />
            )}
            {canManagePortal && (
              <Button variant="secondary" leftIcon={<KeyRound className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'portalBulk' })}>
                Kabinetlar ochish
              </Button>
            )}
            {canManage && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
                O‘quvchi qo‘shish
              </Button>
            )}
          </>
        }
      />

      <DataTable
        {...headerSort(sort, SORT_COLUMNS, 'createdAt:desc', (value) => changeFilter(() => setSort(value)))}
        label="O‘quvchilar"
        columns={studentTable.visibleColumns}
        rows={studentsQuery.data?.items}
        rowKey={(student) => student.id}
        loading={studentsQuery.isPending}
        error={studentsQuery.error}
        onRetry={() => void studentsQuery.refetch()}
        retrying={studentsQuery.isFetching}
        stale={studentsQuery.isPlaceholderData}
        empty={{
          icon: GraduationCap,
          title: 'O‘quvchi topilmadi',
          description: canManage ? 'Yangi o‘quvchi qo‘shing yoki leadni o‘quvchiga aylantiring' : 'Filtrlarni o‘zgartirib ko‘ring',
        }}
        header={
          <Tabs value={status} onValueChange={(value) => changeFilter(() => setStatus(value as StudentStatus | 'ALL'))} panels={false}>
            <TabList label="Holat bo‘yicha filtr" className="px-4">
              {tabs.map((tab) => (
                <Tab key={tab} value={tab} {...(summary ? { count: summary[tab] } : {})}>
                  {tab === 'ALL' ? 'Barchasi' : STUDENT_STATUS_LABELS[tab]}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        }
        toolbar={
          <FilterBar
            search={{ value: searchInput, onChange: (value) => changeFilter(() => setSearchInput(value)), placeholder: 'Ism, telefon, ST-raqam yoki shartnoma' }}
            activeCount={Number(riskLevel !== 'ALL') + Number(Boolean(courseId))}
            onClear={() =>
              changeFilter(() => {
                setRiskLevel('ALL');
                setCourseId('');
              })
            }
          >
            <FilterField>
              <Select value={riskLevel} onChange={(event) => changeFilter(() => setRiskLevel(event.target.value as RiskLevel | 'ALL'))} aria-label="Xavf darajasi">
                <option value="ALL">Xavf: barchasi</option>
                {RISK_LEVEL_ORDER.map((level) => (
                  <option key={level} value={level}>
                    {RISK_LEVEL_LABELS[level]}
                  </option>
                ))}
              </Select>
            </FilterField>
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
            <ColumnSettings control={studentTable} />
          </>
        }
        {...density}
        mobileLayout="cards"
        {...(studentsQuery.data
          ? {
              pagination: {
                page: studentsQuery.data.meta.page,
                totalPages: studentsQuery.data.meta.totalPages,
                total: studentsQuery.data.meta.total,
                limit: studentsQuery.data.meta.limit,
                onPageChange: setPage,
                disabled: studentsQuery.isFetching,
              },
            }
          : {})}
      />

      {dialog?.type === 'create' && (
        <StudentFormModal
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <StudentFormModal
          student={dialog.student}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {(dialog?.type === 'portal' || dialog?.type === 'portalReset') && (
        <PortalAccountModal
          fullName={`${dialog.student.firstName} ${dialog.student.lastName}`}
          subtitle={[dialog.student.code, dialog.student.group?.name].filter(Boolean).join(' · ')}
          loginHint={
            <>
              O‘quvchi <b className="font-mono text-fg">{dialog.student.code}</b> ID raqami va tizim bergan parol bilan kiradi.
            </>
          }
          create={(email) => studentsService.createPortalAccount(dialog.student.id, email)}
          reset={() => studentsService.resetPortalPassword(dialog.student.id)}
          mode={dialog.type === 'portalReset' ? 'reset' : 'create'}
          onClose={() => setDialog(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.students.all })}
        />
      )}
      {dialog?.type === 'portalBulk' && (
        <BulkPortalAccountsModal
          title="O‘quvchilarga kabinet ochish"
          description="Har bir o‘quvchi o‘z ID raqami (ST-000045) va shaxsiy paroli bilan kiradi"
          allLabel="Barcha faol o‘quvchilar"
          groups={lookupsQuery.data?.groups ?? []}
          run={async (groupId) => {
            const result = await studentsService.bulkCreatePortalAccounts(groupId ? { groupId } : {});
            return {
              rows: result.data.created.map((row) => ({
                id: row.studentId,
                fullName: row.fullName,
                subtitle: [row.code, row.groupName].filter(Boolean).join(' · '),
                login: row.login,
                temporaryPassword: row.temporaryPassword,
              })),
              skipped: result.data.skipped,
              warnings: [],
              message: result.message,
            };
          }}
          onClose={() => setDialog(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.students.all })}
        />
      )}
      {dialog?.type === 'status' && (
        <StudentStatusModal
          student={dialog.student}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'transfer' && (
        <TransferGroupModal
          student={dialog.student}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'attendance' && <StudentAttendanceModal student={dialog.student} onClose={() => setDialog(null)} />}
      {dialog?.type === 'xp' && <StudentXpModal studentId={dialog.student.id} onClose={() => setDialog(null)} />}
      {dialog?.type === 'payment' && (
        <PaymentFormModal
          student={dialog.student}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="O‘quvchi o‘chirilsinmi?"
        description={
          dialog?.type === 'delete'
            ? `${dialog.student.firstName} ${dialog.student.lastName} ro‘yxatdan olib tashlanadi. To‘lovlar va davomat tarixi saqlanib qoladi.`
            : ''
        }
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.student.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
