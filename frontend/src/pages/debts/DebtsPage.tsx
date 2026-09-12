import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Phone, Wallet } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService, debtsService } from '@/services/payments.service';
import { studentsService } from '@/services/students.service';
import type { DebtItem, DebtListParams, DebtRange, DebtSummaryParams } from '@/types/payment';
import type { StudentItem } from '@/types/student';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { DEBT_RANGE_LABELS, DEBT_RANGE_ORDER } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { DEBT_STATUS_LABELS, DEBT_STATUS_TONES } from '@/utils/studentLabels';
import { PaymentFormModal } from '../payments/PaymentFormModal';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'remaining:desc', label: 'Katta qarz' },
  { value: 'remaining:asc', label: 'Kichik qarz' },
  { value: 'name:asc', label: 'Ism (A–Z)' },
  { value: 'startDate:asc', label: 'Avval boshlaganlar' },
] as const;

export default function DebtsPage() {
  const queryClient = useQueryClient();
  const canCreatePayment = usePermission(PERMISSIONS.PAYMENT_CREATE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [range, setRange] = useState<DebtRange>('all');
  const [courseId, setCourseId] = useState('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('remaining:desc');
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState<StudentItem | null>(null);
  const [loadingStudentId, setLoadingStudentId] = useState<string | null>(null);

  const [sortBy, sortOrder] = sort.split(':') as [DebtListParams['sortBy'], DebtListParams['sortOrder']];
  const filters: DebtSummaryParams = {
    ...(search ? { search } : {}),
    ...(courseId ? { courseId } : {}),
  };
  const params: DebtListParams = { ...filters, page, limit: PAGE_SIZE, range, sortBy, sortOrder };

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

  return (
    <>
      <PageHeader title="Qarzdorlik" description="Shartnoma bo‘yicha qolgan summalar va oxirgi to‘lovlar" />

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Umumiy qarz</p>
            <p className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{formatMoney(summary.totalRemaining)}</p>
            <p className="mt-1 text-xs text-fg-muted">{formatNumber(summary.students)} ta o‘quvchi</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Yig‘ilgan to‘lov</p>
            <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(summary.totalPaid)}</p>
            <p className="mt-1 text-xs text-fg-muted">Shartnomalar: {formatMoney(summary.totalContracts)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">1 mln dan ortiq</p>
            <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(summary.byRange['1m-plus'].remaining)}</p>
            <p className="mt-1 text-xs text-fg-muted">{formatNumber(summary.byRange['1m-plus'].students)} ta o‘quvchi</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Qarzi yo‘q</p>
            <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
              {formatNumber(summary.byRange.zero.students)}
            </p>
            <p className="mt-1 text-xs text-fg-muted">to‘liq to‘lagan o‘quvchilar</p>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div role="tablist" aria-label="Qarz oralig‘i" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {DEBT_RANGE_ORDER.map((item) => {
              const active = range === item;
              const rangeSummary = item === 'all' ? null : summary?.byRange[item];
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeFilter(() => setRange(item))}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {DEBT_RANGE_LABELS[item]}
                  <span className={cn('rounded-full px-1.5 tabular-nums', active ? 'bg-brand-100 dark:bg-brand-900' : 'bg-surface-muted')}>
                    {item === 'all' ? (summary?.students ?? 0) : (rangeSummary?.students ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Ism, telefon yoki ST-raqam"
              className="sm:max-w-xs"
            />
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

        {debtsQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : debtsQuery.isError ? (
          <ErrorState error={debtsQuery.error} retrying={debtsQuery.isFetching} onRetry={() => void debtsQuery.refetch()} />
        ) : debtsQuery.data.items.length === 0 ? (
          <EmptyState icon={HandCoins} title="Qarzdor topilmadi" description="Filtrlarni o‘zgartirib ko‘ring" />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', debtsQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>O‘quvchi</TH>
                    <TH>Kurs / guruh</TH>
                    <TH>Shartnoma</TH>
                    <TH>To‘langan</TH>
                    <TH>Qolgan</TH>
                    <TH>Oxirgi to‘lov</TH>
                    {canCreatePayment && (
                      <TH className="w-32">
                        <span className="sr-only">Amallar</span>
                      </TH>
                    )}
                  </tr>
                </THead>
                <TBody>
                  {debtsQuery.data.items.map((debt) => (
                    <TR key={debt.studentId}>
                      <TD>
                        <p className="font-medium text-fg">
                          {debt.firstName} {debt.lastName}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-fg-muted">
                          <Phone className="size-3" aria-hidden />
                          {formatPhone(debt.phone)}
                          {debt.parentPhone && ` · ota-ona: ${formatPhone(debt.parentPhone)}`}
                        </p>
                      </TD>
                      <TD>
                        <p className="text-fg">{debt.course.name}</p>
                        <p className="text-xs text-fg-muted">{debt.group ? debt.group.name : 'Guruhsiz'}</p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatMoney(debt.total)}</TD>
                      <TD className="whitespace-nowrap text-fg">{formatMoney(debt.paid)}</TD>
                      <TD className="whitespace-nowrap">
                        <p className={cn('font-medium', debt.remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                          {formatMoney(debt.remaining)}
                        </p>
                        <Badge tone={DEBT_STATUS_TONES[debt.status]}>{DEBT_STATUS_LABELS[debt.status]}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {debt.lastPayment ? (
                          <>
                            <p className="text-fg">{formatMoney(debt.lastPayment.amount)}</p>
                            <p className="text-xs">{formatDate(debt.lastPayment.paidAt)}</p>
                          </>
                        ) : (
                          'To‘lov yo‘q'
                        )}
                      </TD>
                      {canCreatePayment && (
                        <TD className="text-right">
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
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={debtsQuery.data.meta.page}
              totalPages={debtsQuery.data.meta.totalPages}
              total={debtsQuery.data.meta.total}
              limit={debtsQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={debtsQuery.isFetching}
            />
          </>
        )}
      </Card>

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
