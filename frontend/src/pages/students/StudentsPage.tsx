import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ArrowLeftRight, CalendarCheck, GraduationCap, Pencil, Plus, RefreshCw, Sparkles, Trash2, UserRound, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { PortalAccountModal } from './PortalAccountModal';
import { StudentStatusModal } from './StudentStatusModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';
import { TransferGroupModal } from './TransferGroupModal';

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
  | { type: 'edit' | 'status' | 'transfer' | 'delete' | 'attendance' | 'payment' | 'xp' | 'portal'; student: StudentItem }
  | null;

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
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('createdAt:desc');
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
    enabled: canManage,
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
            {canManage && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
                O‘quvchi qo‘shish
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div role="tablist" aria-label="Holat bo‘yicha filtr" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {tabs.map((tab) => {
              const active = status === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeFilter(() => setStatus(tab))}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {tab === 'ALL' ? 'Barchasi' : STUDENT_STATUS_LABELS[tab]}
                  {summary && (
                    <span className={cn('rounded-full px-1.5 tabular-nums', active ? 'bg-brand-100 dark:bg-brand-900' : 'bg-surface-muted')}>
                      {summary[tab]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Ism, telefon, ST-raqam yoki shartnoma"
              className="sm:max-w-xs"
            />
            <Select
              value={riskLevel}
              onChange={(event) => changeFilter(() => setRiskLevel(event.target.value as RiskLevel | 'ALL'))}
              aria-label="Xavf darajasi"
              wrapperClassName="sm:w-44"
            >
              <option value="ALL">Xavf: barchasi</option>
              {RISK_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {RISK_LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
            <Select
              value={courseId}
              onChange={(event) => changeFilter(() => setCourseId(event.target.value))}
              aria-label="Kurs"
              wrapperClassName="sm:w-52"
            >
              <option value="">Barcha kurslar</option>
              {lookupsQuery.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
            <Select
              value={sort}
              onChange={(event) => changeFilter(() => setSort(event.target.value as typeof sort))}
              aria-label="Saralash"
              wrapperClassName="sm:w-52 sm:ml-auto"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {studentsQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : studentsQuery.isError ? (
          <ErrorState error={studentsQuery.error} retrying={studentsQuery.isFetching} onRetry={() => void studentsQuery.refetch()} />
        ) : studentsQuery.data.items.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="O‘quvchi topilmadi"
            description={canManage ? 'Yangi o‘quvchi qo‘shing yoki leadni o‘quvchiga aylantiring' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', studentsQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>O‘quvchi</TH>
                    <TH>Kurs / guruh</TH>
                    <TH>Shartnoma</TH>
                    <TH>Qarzdorlik</TH>
                    <TH>Boshlangan</TH>
                    <TH>Holat</TH>
                    <TH>Xavf</TH>
                    <TH className="w-12">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {studentsQuery.data.items.map((student) => (
                    <TR key={student.id}>
                      <TD>
                        <Link to={`/students/${student.id}`} className="font-medium text-fg hover:text-brand-600 hover:underline dark:hover:text-brand-300">
                          {student.firstName} {student.lastName}
                        </Link>
                        <p className="text-xs text-fg-muted">
                          {student.code} · {formatPhone(student.phone)}
                        </p>
                      </TD>
                      <TD>
                        <p className="text-fg">{student.course.name}</p>
                        <p className="text-xs text-fg-muted">{student.group ? student.group.name : 'Guruhsiz'}</p>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <p className="text-fg">{formatMoney(student.contractPrice)}</p>
                        {student.contractNumber && <p className="text-xs text-fg-muted">{student.contractNumber}</p>}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {student.debt ? (
                          <>
                            <p className={cn('font-medium', student.debt.remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                              {formatMoney(student.debt.remaining)}
                            </p>
                            <Badge tone={DEBT_STATUS_TONES[student.debt.status]}>{DEBT_STATUS_LABELS[student.debt.status]}</Badge>
                          </>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDate(student.startDate)}</TD>
                      <TD>
                        <Badge tone={STUDENT_STATUS_TONES[student.status]}>{STUDENT_STATUS_LABELS[student.status]}</Badge>
                      </TD>
                      <TD>
                        {student.riskLevel ? (
                          <Badge tone={RISK_LEVEL_TONES[student.riskLevel]}>
                            {RISK_LEVEL_LABELS[student.riskLevel]}
                            {student.healthScore !== null && <span className="ml-1 tabular-nums opacity-70">{student.healthScore}</span>}
                          </Badge>
                        ) : (
                          <span className="text-fg-subtle" title="Baho uchun yetarli ma’lumot yo‘q">
                            —
                          </span>
                        )}
                      </TD>
                      <TD className="text-right">
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
                                  ...(canManagePortal && !student.hasPortalAccount
                                    ? [
                                        {
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
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={studentsQuery.data.meta.page}
              totalPages={studentsQuery.data.meta.totalPages}
              total={studentsQuery.data.meta.total}
              limit={studentsQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={studentsQuery.isFetching}
            />
          </>
        )}
      </Card>

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
      {dialog?.type === 'portal' && (
        <PortalAccountModal
          student={dialog.student}
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
