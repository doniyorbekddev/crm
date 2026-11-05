import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { HandCoins, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableDensity } from '@/hooks/useTableDensity';
import { queryKeys } from '@/lib/queryKeys';
import { billingService } from '@/services/billing.service';
import type { OutstandingDebt, OutstandingParams } from '@/types/billing';
import { periodKeyLabel } from '@/utils/billingLabels';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { BillingFilters, EMPTY_BILLING_FILTERS, toBillingParams } from './BillingFilters';
import type { BillingFilterState } from './BillingFilters';
import { useBillingRowActions } from './useBillingRowActions';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'debt:desc', label: 'Katta qarz' },
  { value: 'oldest:asc', label: 'Eng eski qarz' },
  { value: 'name:asc', label: 'Ism (A–Z)' },
] as const;

/** B. Barcha oylardan qolgan, muddati kelgan qarzlar (shartnomaning hali kelmagan qismi — alohida) */
export function OutstandingDebtsView() {
  const [filters, setFilters] = useState<BillingFilterState>(EMPTY_BILLING_FILTERS);
  const search = useDebounce(filters.search.trim(), 400);
  const [sort, setSort] = useState<string>('debt:desc');
  const [page, setPage] = useState(1);
  const { actions, modals } = useBillingRowActions();
  const density = useTableDensity();

  const [sortBy, sortOrder] = sort.split(':') as [OutstandingParams['sortBy'], OutstandingParams['sortOrder']];
  const params: OutstandingParams = { ...toBillingParams(filters, search), sortBy, sortOrder, page, limit: PAGE_SIZE };
  const query = useQuery({ queryKey: queryKeys.debts.outstanding(params), queryFn: () => billingService.outstanding(params), placeholderData: keepPreviousData });
  const summary = query.data?.summary;

  const columns: Array<DataTableColumn<OutstandingDebt>> = [
    {
      key: 'student',
      label: 'O‘quvchi',
      required: true,
      cell: (row) => (
        <>
          <Link to={`/students/${row.student.id}`} className="focus-ring rounded-sm font-medium text-fg hover:text-primary hover:underline">
            {row.student.firstName} {row.student.lastName}
          </Link>
          <a href={`tel:${row.student.phone ?? row.student.parentPhone ?? ''}`} className="flex items-center gap-1 text-caption whitespace-nowrap text-fg-muted hover:text-primary">
            <Phone className="size-3 shrink-0" aria-hidden />
            {formatPhone(row.student.phone ?? row.student.parentPhone)}
          </a>
        </>
      ),
    },
    {
      key: 'course',
      label: 'Kurs / guruh',
      cell: (row) => (
        <>
          <p className="text-fg">{row.student.course.name}</p>
          <p className="text-caption text-fg-muted">
            {row.student.group?.name ?? 'Guruhsiz'}
            {row.student.teacher && ` · ${row.student.teacher.firstName} ${row.student.teacher.lastName}`}
          </p>
        </>
      ),
    },
    {
      key: 'months',
      label: 'Qaysi oylar',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.months.map((month) => (
            <Badge key={month.period} tone="red">
              {periodKeyLabel(month.period)} · {formatMoney(month.remaining)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'oldest',
      label: 'Eng eski',
      tdClassName: 'whitespace-nowrap',
      cell: (row) => (
        <>
          <p className="text-fg">{formatDate(row.oldestDueDate)}</p>
          {row.overdueDays > 0 && <p className="text-caption text-danger">{row.overdueDays} kun kechikdi</p>}
        </>
      ),
    },
    {
      key: 'debt',
      label: 'Qarz',
      align: 'right',
      tdClassName: 'whitespace-nowrap font-medium text-danger',
      cell: (row) => formatMoney(row.debt),
    },
    {
      key: 'upcoming',
      label: 'Kelgusi to‘lovlar',
      align: 'right',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (row) => formatMoney(row.upcoming),
    },
    { key: 'actions', label: 'Amallar', header: <span className="sr-only">Amallar</span>, fixed: true, tdClassName: 'text-right', cell: (row) => actions(row.student.id, row.debt > 0) },
  ];

  return (
    <>
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard size="sm" title="Muddati kelgan qarz" value={formatMoney(summary.debt)} valueTone={summary.debt > 0 ? 'danger' : 'default'} description={`${formatNumber(summary.students)} ta o‘quvchi`} />
          <StatCard size="sm" title="30 kungacha" value={formatMoney(summary.byAge.upTo30.debt)} description={`${formatNumber(summary.byAge.upTo30.students)} ta o‘quvchi`} />
          <StatCard
            size="sm"
            title="30 kundan eski"
            value={formatMoney(summary.byAge.upTo60.debt + summary.byAge.over60.debt)}
            valueTone={summary.byAge.over60.debt > 0 ? 'danger' : 'warning'}
            description={`${formatNumber(summary.byAge.upTo60.students + summary.byAge.over60.students)} ta · 60 kundan eski: ${formatNumber(summary.byAge.over60.students)}`}
          />
          <StatCard size="sm" title="Kelgusi to‘lovlar" value={formatMoney(summary.upcoming)} description="Shartnomaning hali muddati kelmagan qismi" />
        </div>
      )}
      <DataTable
        label="Muddati kelgan qarzlar"
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.student.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        stale={query.isPlaceholderData}
        empty={{ icon: HandCoins, title: 'Muddati kelgan qarz yo‘q', description: 'Filtrlarni o‘zgartirib ko‘ring' }}
        toolbar={
          <BillingFilters
            value={filters}
            amountLabel="Qarz summasi"
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
          />
        }
        toolbarActions={
          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Saralash" wrapperClassName="w-44">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        }
        {...density}
        mobileLayout="cards"
        {...(query.data
          ? {
              pagination: {
                page: query.data.meta.page,
                totalPages: query.data.meta.totalPages,
                total: query.data.meta.total,
                limit: query.data.meta.limit,
                onPageChange: setPage,
                disabled: query.isFetching,
              },
            }
          : {})}
      />
      {modals}
    </>
  );
}
