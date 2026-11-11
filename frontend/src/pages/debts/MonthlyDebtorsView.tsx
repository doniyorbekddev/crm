import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ReportingPeriodPicker } from '@/components/ReportingPeriodPicker';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { useDebounce } from '@/hooks/useDebounce';
import { periodKey, useReportingPeriod } from '@/hooks/useReportingPeriod';
import { useTableDensity } from '@/hooks/useTableDensity';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { billingService } from '@/services/billing.service';
import type { MonthlyDebtor, MonthlyDebtorsParams, MonthlyDebtStatusFilter } from '@/types/billing';
import { dueCountdown } from '@/utils/billingLabels';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from '@/utils/scheduleLabels';
import { BillingFilters, EMPTY_BILLING_FILTERS, toBillingParams } from './BillingFilters';
import type { BillingFilterState } from './BillingFilters';
import { useBillingRowActions } from './useBillingRowActions';

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{ value: MonthlyDebtStatusFilter; label: string }> = [
  { value: 'DEBT', label: 'Qarzdorlar' },
  { value: 'UPCOMING', label: 'Kutilmoqda' },
  { value: 'ALL', label: 'Barchasi' },
  { value: 'UNPAID', label: 'To‘lanmagan' },
  { value: 'PARTIAL', label: 'Qisman' },
  { value: 'PAID', label: 'Yopilgan' },
  { value: 'CANCELLED', label: 'Bekor qilingan' },
];

const SORT_OPTIONS = [
  { value: 'remaining:desc', label: 'Katta qoldiq' },
  { value: 'dueDate:asc', label: 'Muddat bo‘yicha' },
  { value: 'name:asc', label: 'Ism (A–Z)' },
] as const;

/**
 * A. Tanlangan oy majburiyatlari: hozirgi qoldiq va oy oxiridagi holat (tarix) yonma-yon — keyingi oyda shu oy uchun
 * kelgan to'lov qarzni yopadi, lekin oy oxiridagi raqam o'zgarmaydi.
 */
export function MonthlyDebtorsView() {
  const { period } = useReportingPeriod();
  const [filters, setFilters] = useState<BillingFilterState>(EMPTY_BILLING_FILTERS);
  const search = useDebounce(filters.search.trim(), 400);
  const [status, setStatus] = useState<MonthlyDebtStatusFilter>('DEBT');
  const [sort, setSort] = useState<string>('remaining:desc');
  const [page, setPage] = useState(1);
  const [seenPeriod, setSeenPeriod] = useState(periodKey(period));
  const { actions, modals } = useBillingRowActions();
  const density = useTableDensity();

  // Oy almashganda birinchi sahifaga qaytiladi (effektsiz — render paytida)
  if (seenPeriod !== periodKey(period)) {
    setSeenPeriod(periodKey(period));
    setPage(1);
  }

  const [sortBy, sortOrder] = sort.split(':') as [MonthlyDebtorsParams['sortBy'], MonthlyDebtorsParams['sortOrder']];
  const params: MonthlyDebtorsParams = { ...toBillingParams(filters, search), period: periodKey(period), status, sortBy, sortOrder, page, limit: PAGE_SIZE };
  const query = useQuery({ queryKey: queryKeys.debts.monthly(params), queryFn: () => billingService.monthly(params), placeholderData: keepPreviousData });
  const summary = query.data?.summary;
  const ended = summary?.periodEnded ?? false;

  const columns: Array<DataTableColumn<MonthlyDebtor>> = [
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
      key: 'dueDate',
      label: 'Muddat',
      tdClassName: 'whitespace-nowrap',
      cell: (row) => {
        // Oy tugamagan va qoldiq bor: "4 kun qoldi" / "6 kun kechikdi"
        const countdown = !ended && row.remaining > 0 ? dueCountdown(row.dueDate) : null;
        return (
          <>
            <p className="text-fg">{formatDate(row.dueDate)}</p>
            {countdown && <p className={cn('text-caption', countdown.kind === 'upcoming' ? 'text-fg-muted' : 'text-danger')}>{countdown.text}</p>}
          </>
        );
      },
    },
    { key: 'charge', label: 'Majburiyat', align: 'right', tdClassName: 'whitespace-nowrap', cell: (row) => formatMoney(row.charge) },
    { key: 'paid', label: 'To‘langan', align: 'right', tdClassName: 'whitespace-nowrap', cell: (row) => formatMoney(row.paid) },
    {
      key: 'remaining',
      label: 'Qoldiq',
      align: 'right',
      tdClassName: 'whitespace-nowrap',
      cell: (row) => (
        <>
          <p className={row.remaining > 0 && row.due ? 'font-medium text-danger' : 'text-fg'}>{formatMoney(row.remaining)}</p>
          <Badge tone={CHARGE_STATUS_TONES[row.status]}>{CHARGE_STATUS_LABELS[row.status]}</Badge>
          {row.closedAt && <p className="mt-0.5 text-caption text-fg-muted">{formatDate(row.closedAt)} yopildi</p>}
        </>
      ),
    },
    ...(ended
      ? [
          {
            key: 'atEnd',
            label: 'Oy oxirida',
            align: 'right' as const,
            tdClassName: 'whitespace-nowrap text-fg-muted',
            cell: (row: MonthlyDebtor) => (
              <>
                <p>{formatMoney(row.remainingAtPeriodEnd)}</p>
                {(row.paidAfterPeriod ?? 0) > 0 && <p className="text-caption text-success">keyin +{formatMoney(row.paidAfterPeriod)}</p>}
              </>
            ),
          },
        ]
      : []),
    { key: 'actions', label: 'Amallar', header: <span className="sr-only">Amallar</span>, fixed: true, tdClassName: 'text-right', cell: (row) => actions(row.student.id, row.remaining > 0) },
  ];

  const statusCount = (value: MonthlyDebtStatusFilter) =>
    !summary
      ? undefined
      : value === 'DEBT'
        ? summary.debtors
        : value === 'UPCOMING'
          ? summary.upcoming
          : value === 'ALL'
            ? summary.students
            : summary.byStatus[value];

  return (
    <>
      <div className="mb-4">
        <ReportingPeriodPicker />
      </div>
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            size="sm"
            title="Hisoblangan"
            value={formatMoney(summary.charge)}
            description={`${formatNumber(summary.students)} ta o‘quvchi${summary.cancelled > 0 ? ` · bekor ${formatMoney(summary.cancelled)}` : ''}`}
          />
          <StatCard size="sm" title="Shu oy uchun to‘langan" value={formatMoney(summary.paid)} description="Qaysi sanada kelganidan qat’i nazar" />
          <StatCard
            size="sm"
            title="Muddati kelgan qarz"
            value={formatMoney(summary.dueRemaining)}
            valueTone={summary.dueRemaining > 0 ? 'danger' : 'default'}
            description={
              summary.upcoming > 0
                ? `${formatNumber(summary.debtors)} ta qarzdor · ${formatNumber(summary.upcoming)} ta muddati kelmagan (${formatMoney(summary.remaining - summary.dueRemaining)})`
                : `${formatNumber(summary.debtors)} ta qarzdor`
            }
          />
          <StatCard
            size="sm"
            title="Oy oxirida qarz"
            value={summary.remainingAtPeriodEnd === null ? '—' : formatMoney(summary.remainingAtPeriodEnd)}
            description={
              summary.remainingAtPeriodEnd === null
                ? 'Oy hali tugamagan'
                : `Keyin shu oy uchun to‘langan: ${formatMoney(summary.paidAfterPeriod)}`
            }
          />
        </div>
      )}
      <DataTable
        label={`${summary?.label ?? ''} majburiyatlari`}
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.student.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        stale={query.isPlaceholderData}
        empty={{ icon: CalendarCheck, title: 'Bu oy bo‘yicha yozuv yo‘q', description: 'Boshqa holat yoki oyni tanlang' }}
        header={
          <Tabs
            value={status}
            onValueChange={(value) => {
              setStatus(value as MonthlyDebtStatusFilter);
              setPage(1);
            }}
            panels={false}
          >
            <TabList label="Oy majburiyati holati" className="px-4">
              {STATUS_TABS.map((tab) => {
                const count = statusCount(tab.value);
                return (
                  <Tab key={tab.value} value={tab.value} {...(count !== undefined ? { count } : {})}>
                    {tab.label}
                  </Tab>
                );
              })}
            </TabList>
          </Tabs>
        }
        toolbar={
          <BillingFilters
            value={filters}
            amountLabel="Qoldiq summasi"
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
