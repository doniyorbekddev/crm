import { headerSort } from '@/utils/tableSort';
import { StatCard } from '@/components/ui/StatCard';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Phone, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService, debtsService } from '@/services/payments.service';
import { studentsService } from '@/services/students.service';
import type { DebtItem, DebtListParams, DebtRange, DebtSummaryParams } from '@/types/payment';
import type { DebtDueFilter } from '@/types/paymentSchedule';
import type { StudentItem } from '@/types/student';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { DEBT_RANGE_LABELS, DEBT_RANGE_ORDER } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { DEBT_DUE_LABELS, DEBT_DUE_ORDER } from '@/utils/scheduleLabels';
import { DEBT_STATUS_LABELS, DEBT_STATUS_TONES } from '@/utils/studentLabels';
import { PaymentFormModal } from '../payments/PaymentFormModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'remaining:desc', label: 'Katta qarz' },
  { value: 'remaining:asc', label: 'Kichik qarz' },
  { value: 'name:asc', label: 'Ism (A–Z)' },
  { value: 'startDate:asc', label: 'Avval boshlaganlar' },
] as const;

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { student: 'name', remaining: 'remaining' } as const;

export default function DebtsPage() {
  const queryClient = useQueryClient();
  const canCreatePayment = usePermission(PERMISSIONS.PAYMENT_CREATE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [range, setRange] = useState<DebtRange>('all');
  const [due, setDue] = useState<DebtDueFilter>('all');
  const [courseId, setCourseId] = useState('');
  const [sort, setSort] = useState<string>('remaining:desc');
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState<StudentItem | null>(null);
  const [loadingStudentId, setLoadingStudentId] = useState<string | null>(null);

  const [sortBy, sortOrder] = sort.split(':') as [DebtListParams['sortBy'], DebtListParams['sortOrder']];
  const filters: DebtSummaryParams = {
    ...(search ? { search } : {}),
    ...(courseId ? { courseId } : {}),
  };
  const params: DebtListParams = { ...filters, page, limit: PAGE_SIZE, range, sortBy, sortOrder, due };

  const debtsQuery = useQuery({
    queryKey: queryKeys.debts.list(params),
    queryFn: () => debtsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.debts.summary(filters),
    queryFn: () => debtsService.summary(filters),
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  };

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  /** To‘lov oynasi to‘liq o‘quvchi ma’lumotini kutadi — qarz satridan yuklab olamiz */
  const openPayment = async (debt: DebtItem) => {
    setLoadingStudentId(debt.studentId);
    try {
      setPayFor(await studentsService.getById(debt.studentId));
    } finally {
      setLoadingStudentId(null);
    }
  };

  const summary = summaryQuery.data;

  type DebtTableRow = NonNullable<typeof debtsQuery.data>['items'][number];
  const debtTableColumns: Array<ColumnDef<DebtTableRow>> = [
    {
      key: 'student',
      sortable: true,
      label: 'O‘quvchi',
      required: true,
      cell: (debt: DebtTableRow) => (
        <>
          <Link to={`/students/${debt.studentId}`} className="focus-ring rounded-sm font-medium text-fg hover:text-primary hover:underline">
            {debt.firstName} {debt.lastName}
          </Link>
          <p className="flex items-center gap-1 text-xs text-fg-muted">
            <Phone className="size-3" aria-hidden />
            {formatPhone(debt.phone)}
            {debt.parentPhone && ` · ota-ona: ${formatPhone(debt.parentPhone)}`}
          </p>
        </>
      ),
    },
    {
      key: 'courseGroup',
      label: 'Kurs / guruh',
      cell: (debt: DebtTableRow) => (
        <>
          <p className="text-fg">{debt.course.name}</p>
          <p className="text-xs text-fg-muted">{debt.group ? debt.group.name : 'Guruhsiz'}</p>
        </>
      ),
    },
    {
      key: 'contract',
      label: 'Shartnoma',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (debt: DebtTableRow) => (
        <>
          {formatMoney(debt.total)}
        </>
      ),
    },
    {
      key: 'paid',
      label: 'To‘langan',
      tdClassName: 'whitespace-nowrap text-fg',
      cell: (debt: DebtTableRow) => (
        <>
          {formatMoney(debt.paid)}
        </>
      ),
    },
    {
      key: 'remaining',
      sortable: true,
      label: 'Qolgan',
      tdClassName: 'whitespace-nowrap',
      cell: (debt: DebtTableRow) => (
        <>
          <p className={cn('font-medium', debt.remaining > 0 ? 'text-danger' : 'text-fg')}>
            {formatMoney(debt.remaining)}
          </p>
          <Badge tone={DEBT_STATUS_TONES[debt.status]}>{DEBT_STATUS_LABELS[debt.status]}</Badge>
        </>
      ),
    },
    {
      key: 'schedule',
      label: 'Jadval',
      tdClassName: 'whitespace-nowrap',
      cell: (debt: DebtTableRow) => (
        <>
          {!debt.schedule ? (
            <span className="text-xs text-fg-subtle">Jadval yo‘q</span>
          ) : debt.schedule.overdueAmount > 0 ? (
            <>
              <Badge tone="red">{debt.schedule.overdueDays} kun kechikdi</Badge>
              <p className="mt-0.5 text-xs text-danger">{formatMoney(debt.schedule.overdueAmount)}</p>
            </>
          ) : debt.schedule.nextDueDate ? (
            <>
              <p className="text-fg">{formatDate(debt.schedule.nextDueDate)}</p>
              <p className="text-xs text-fg-muted">keyingi to‘lov</p>
            </>
          ) : (
            <span className="text-xs text-fg-muted">To‘liq to‘langan</span>
          )}
        </>
      ),
    },
    {
      key: 'lastPayment',
      label: 'Oxirgi to‘lov',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (debt: DebtTableRow) => (
        <>
          {debt.lastPayment ? (
            <>
              <p className="text-fg">{formatMoney(debt.lastPayment.amount)}</p>
              <p className="text-xs">{formatDate(debt.lastPayment.paidAt)}</p>
            </>
          ) : (
            'To‘lov yo‘q'
          )}
        </>
      ),
    },
    ...(canCreatePayment ? [{
      key: 'actions',
      label: 'Amallar',
      header: <span className="sr-only">Amallar</span>,
      fixed: true,
      thClassName: 'w-32',
      tdClassName: 'text-right',
      cell: (debt: DebtTableRow) => (
        <>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Wallet className="size-4" aria-hidden />}
            loading={loadingStudentId === debt.studentId}
            disabled={debt.remaining <= 0}
            onClick={() => void openPayment(debt)}
          >
            To‘lov
          </Button>
        </>
      ),
    }] : []),
  ];
  const debtTable = useTableColumns('debts', debtTableColumns);
  const density = useTableDensity();

  return (
    <>
      <PageHeader title="Qarzdorlik" description="Shartnoma bo‘yicha qolgan summalar va oxirgi to‘lovlar" />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard size="sm" title="Umumiy qarz" value={formatMoney(summary.totalRemaining)} valueTone="danger" description={`${formatNumber(summary.students)} ta o‘quvchi`} />
          <StatCard
            size="sm"
            title="Muddati o‘tgan"
            value={formatMoney(summary.overdue.amount)}
            valueTone={summary.overdue.amount > 0 ? 'danger' : 'default'}
            description={`${formatNumber(summary.overdue.students)} ta o‘quvchi · 7 kunda ${formatMoney(summary.upcoming.amount)}`}
          />
          <StatCard size="sm" title="Yig‘ilgan to‘lov" value={formatMoney(summary.totalPaid)} description={`Shartnomalar: ${formatMoney(summary.totalContracts)}`} />
          <StatCard
            size="sm"
            title="1 mln dan ortiq"
            value={formatMoney(summary.byRange['1m-plus'].remaining)}
            description={`${formatNumber(summary.byRange['1m-plus'].students)} ta o‘quvchi`}
          />
          <StatCard size="sm" title="Qarzi yo‘q" value={formatNumber(summary.byRange.zero.students)} valueTone="success" description="to‘liq to‘lagan o‘quvchilar" />
        </div>
      )}

      <DataTable
        {...headerSort(sort, SORT_COLUMNS, 'remaining:desc', (value) => changeFilter(() => setSort(value)))}
        label="Qarzdorlar"
        columns={debtTable.visibleColumns}
        rows={debtsQuery.data?.items}
        rowKey={(debt) => debt.studentId}
        loading={debtsQuery.isPending}
        error={debtsQuery.error}
        onRetry={() => void debtsQuery.refetch()}
        retrying={debtsQuery.isFetching}
        stale={debtsQuery.isPlaceholderData}
        empty={{ icon: HandCoins, title: 'Qarzdor topilmadi', description: 'Filtrlarni o‘zgartirib ko‘ring' }}
        header={
          <>
            <Tabs value={range} onValueChange={(value) => changeFilter(() => setRange(value as DebtRange))} panels={false}>
              <TabList label="Qarz oralig‘i" className="px-4">
                {DEBT_RANGE_ORDER.map((item) => (
                  <Tab key={item} value={item} count={item === 'all' ? (summary?.students ?? 0) : (summary?.byRange[item]?.students ?? 0)}>
                    {DEBT_RANGE_LABELS[item]}
                  </Tab>
                ))}
              </TabList>
            </Tabs>
            <div className="border-b border-border px-4 py-2">
              <Tabs value={due} onValueChange={(value) => changeFilter(() => setDue(value as DebtDueFilter))} variant="pill" panels={false}>
                <TabList label="To‘lov muddati">
                  {DEBT_DUE_ORDER.map((item) => {
                    const count = item === 'overdue' ? summary?.overdue.students : item === 'upcoming' ? summary?.upcoming.students : undefined;
                    return (
                      <Tab key={item} value={item} {...(count !== undefined ? { count } : {})} {...(item === 'overdue' ? { countTone: 'danger' as const } : {})}>
                        {DEBT_DUE_LABELS[item]}
                      </Tab>
                    );
                  })}
                </TabList>
              </Tabs>
            </div>
          </>
        }
        toolbar={
          <FilterBar
            search={{ value: searchInput, onChange: (value) => changeFilter(() => setSearchInput(value)), placeholder: 'Ism, telefon yoki ST-raqam' }}
            activeCount={Number(Boolean(courseId))}
            onClear={() => changeFilter(() => setCourseId(''))}
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
            <ColumnSettings control={debtTable} />
          </>
        }
        {...density}
        mobileLayout="cards"
        {...(debtsQuery.data
          ? {
              pagination: {
                page: debtsQuery.data.meta.page,
                totalPages: debtsQuery.data.meta.totalPages,
                total: debtsQuery.data.meta.total,
                limit: debtsQuery.data.meta.limit,
                onPageChange: setPage,
                disabled: debtsQuery.isFetching,
              },
            }
          : {})}
      />

      {payFor && (
        <PaymentFormModal
          student={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
