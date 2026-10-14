import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calculator, Lock, Send, Settings2, Wallet2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExportMenu } from '@/components/ExportMenu';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/Select';
import { useExport } from '@/hooks/useExport';
import { useInitialParam } from '@/hooks/useInitialParam';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { PayrollOverview } from '@/pages/payroll/PayrollOverview';
import {
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONES,
  adjustmentsOf,
  modelLabelOf,
  paymentStateOf,
  payrollProfileUrl,
  variableOf,
} from '@/pages/payroll/payrollUtils';
import { usePayrollActions } from '@/pages/payroll/usePayrollActions';
import { branchesService } from '@/services/branches.service';
import { salaryService } from '@/services/salary.service';
import type { SalaryPeriod, SalaryPeriodParams, SalaryPeriodStatus } from '@/types/teacher';
import { formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { MONTH_OPTIONS, SALARY_STATUS_LABELS, SALARY_STATUS_ORDER, SALARY_STATUS_TONES, SALARY_TYPE_LABELS } from '@/utils/teacherLabels';

const now = new Date();

/** Joriy yildan 3 yil oldingacha */
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

type SortKey = 'total' | 'name' | 'kpi' | 'status';

/** Ro'yxatdagi guruh kaliti — summary.byGroup bilan bir xil (TEACHER yoki lavozim) */
const groupKeyOf = (period: SalaryPeriod) => (period.payee.type === 'TEACHER' ? 'TEACHER' : (period.employee?.position ?? 'OTHER'));

export default function SalariesPage() {
  const navigate = useNavigate();
  const actions = usePayrollActions({ showProfileLink: true });
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const canViewBranches = usePermission(PERMISSIONS.BRANCH_VIEW_ALL);
  const { exporting, run: runExport } = useExport();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<SalaryPeriodStatus | ''>(
    useInitialParam<SalaryPeriodStatus | ''>('status', ['PENDING', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID'], ''),
  );
  const [group, setGroup] = useState('');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('total');

  // Oy bo'yicha hammasi bir marta olinadi — jarayon sanoqlari va filtrlar shu ro'yxatdan
  const params: SalaryPeriodParams = { year, month, ...(branchId ? { branchId } : {}) };
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
  const monthRange = { from: `${monthLabel}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };

  const periodsQuery = useQuery({
    queryKey: queryKeys.salaries.periods(params),
    queryFn: () => salaryService.periods(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.salaries.summary({ year, month, ...(branchId ? { branchId } : {}) }),
    queryFn: () => salaryService.summary({ year, month, ...(branchId ? { branchId } : {}) }),
  });
  const branchesQuery = useQuery({ queryKey: ['branches', 'list'], queryFn: () => branchesService.list(), enabled: canViewBranches, retry: false });
  const branches = branchesQuery.data ?? [];

  const periods = useMemo(() => periodsQuery.data ?? [], [periodsQuery.data]);
  const departments = useMemo(
    () => [...new Set(periods.map((period) => period.employee?.department).filter((value): value is string => Boolean(value)))].sort(),
    [periods],
  );
  const calculatedCount = periods.filter((period) => period.status === 'CALCULATED').length;

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    const filtered = periods.filter(
      (period) =>
        (!status || period.status === status) &&
        (!group || groupKeyOf(period) === group) &&
        (!department || period.employee?.department === department) &&
        (!warningsOnly || (period.warnings.length > 0 && !period.lockedAt)) &&
        (!needle || `${period.payee.firstName} ${period.payee.lastName}`.toLocaleLowerCase('uz').includes(needle)),
    );
    const order = SALARY_STATUS_ORDER;
    return [...filtered].sort((a, b) =>
      sort === 'name'
        ? `${a.payee.firstName} ${a.payee.lastName}`.localeCompare(`${b.payee.firstName} ${b.payee.lastName}`, 'uz')
        : sort === 'kpi'
          ? b.kpiBonus - a.kpiBonus
          : sort === 'status'
            ? order.indexOf(a.status) - order.indexOf(b.status)
            : b.totalAmount - a.totalAmount,
    );
  }, [periods, status, group, department, warningsOnly, search, sort]);

  const activeFilters = [status, group, department, warningsOnly ? 'w' : ''].filter(Boolean).length;
  const clearFilters = () => {
    setStatus('');
    setGroup('');
    setDepartment('');
    setWarningsOnly(false);
  };

  return (
    <>
      <PageHeader
        title="Maoshlar"
        description="Oylik hisob, KPI bonuslari, tasdiqlash va to‘lovlar"
        documentTitle="Maoshlar"
        actions={
          <>
            {canExport && (
              <ExportMenu loading={exporting} onExport={(format) => void runExport('/reports/salaries/export', monthRange, `maoshlar-${monthLabel}`, format)} />
            )}
            <Link
              to="/salaries/kpi"
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-body font-medium text-fg shadow-sm transition-colors hover:bg-surface-muted"
            >
              <Settings2 className="size-4" aria-hidden />
              KPI sozlamalari
            </Link>
            {actions.can.calculate && (
              <Button
                variant={calculatedCount > 0 ? 'secondary' : 'primary'}
                leftIcon={<Calculator className="size-4" aria-hidden />}
                loading={actions.calculate.isPending}
                onClick={() => actions.calculate.mutate({ year, month })}
              >
                Oyni hisoblash
              </Button>
            )}
            {actions.can.calculate && calculatedCount > 0 && (
              <SubmitMonthButton year={year} month={month} branchId={branchId} count={calculatedCount} onDone={actions.refresh} />
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Oy" wrapperClassName="sm:w-40">
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Yil" wrapperClassName="sm:w-32">
          {YEAR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        {branches.length > 1 && (
          <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Filial" wrapperClassName="sm:w-48">
            <option value="">Barcha filiallar</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <PayrollOverview
        summary={summaryQuery.data}
        loading={summaryQuery.isPending}
        periods={periods}
        status={status}
        onStatusChange={setStatus}
        warningsOnly={warningsOnly}
        onWarningsOnlyChange={setWarningsOnly}
        group={group}
        onGroupChange={setGroup}
      />

      <DataTable
        label="Maoshlar"
        rows={rows}
        rowKey={(period) => period.id}
        loading={periodsQuery.isPending}
        error={periodsQuery.error}
        onRetry={() => void periodsQuery.refetch()}
        retrying={periodsQuery.isFetching}
        stale={periodsQuery.isPlaceholderData}
        mobileLayout="cards"
        onRowClick={(period) => void navigate(payrollProfileUrl(period.payee.type, period.payee.id, period))}
        rowActions={actions.itemsFor}
        empty={{
          icon: Wallet2,
          title: periods.length === 0 ? 'Bu oy uchun hisob yo‘q' : 'Filtrga mos maosh yo‘q',
          description:
            periods.length === 0
              ? actions.can.calculate
                ? '“Oyni hisoblash” barcha faol o‘qituvchi va xodimlar maoshini kelishilgan model va KPI bo‘yicha hisoblaydi'
                : 'Maosh hisoblangandan keyin ro‘yxat shu yerda ko‘rinadi'
              : 'Filtrlarni o‘zgartirib ko‘ring',
        }}
        toolbar={
          <FilterBar search={{ value: search, onChange: setSearch, placeholder: 'Xodim ismi…', label: 'Xodim bo‘yicha qidirish' }} activeCount={activeFilters} onClear={clearFilters}>
            <FilterField>
              <Select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Lavozim">
                <option value="">Barcha lavozimlar</option>
                {(summaryQuery.data?.byGroup ?? []).map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.label}
                  </option>
                ))}
              </Select>
            </FilterField>
            {departments.length > 0 && (
              <FilterField>
                <Select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Bo‘lim">
                  <option value="">Barcha bo‘limlar</option>
                  {departments.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </FilterField>
            )}
            <FilterField>
              <Select value={status} onChange={(event) => setStatus(event.target.value as SalaryPeriodStatus | '')} aria-label="Holat">
                <option value="">Barcha holatlar</option>
                {SALARY_STATUS_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {SALARY_STATUS_LABELS[item]}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterBar>
        }
        toolbarActions={
          <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Saralash" wrapperClassName="sm:w-48">
            <option value="total">Jami (kattasi birinchi)</option>
            <option value="kpi">KPI bonusi</option>
            <option value="status">Holat bo‘yicha</option>
            <option value="name">Ism (A–Z)</option>
          </Select>
        }
        columns={[
          {
            key: 'payee',
            label: 'Xodim',
            cell: (period) => (
              <>
                <Link
                  to={payrollProfileUrl(period.payee.type, period.payee.id, period)}
                  onClick={(event) => event.stopPropagation()}
                  className="font-medium whitespace-nowrap text-fg hover:text-primary hover:underline"
                >
                  {period.payee.firstName} {period.payee.lastName}
                </Link>
                <p className="text-caption whitespace-nowrap text-fg-muted">
                  {period.payee.type === 'TEACHER' ? 'O‘qituvchi' : (period.payee.subtitle ?? 'Xodim')}
                  {period.employee?.department ? ` · ${period.employee.department}` : ''}
                </p>
              </>
            ),
          },
          {
            key: 'model',
            label: 'Model',
            tdClassName: 'whitespace-nowrap text-fg-muted',
            cell: (period) => (
              <>
                {modelLabelOf(period, SALARY_TYPE_LABELS[period.salaryType])}
                {period.commissionRate > 0 && <span className="text-caption text-fg-subtle"> · {formatNumber(period.commissionRate)}%</span>}
              </>
            ),
          },
          {
            key: 'fixed',
            label: 'Belgilangan',
            align: 'right',
            tdClassName: 'whitespace-nowrap text-fg-muted',
            cell: (period) => <>{period.baseAmount === 0 ? <span className="text-fg-subtle">—</span> : formatMoney(period.baseAmount)}</>,
          },
          {
            key: 'variable',
            label: 'O‘zgaruvchan',
            align: 'right',
            tdClassName: 'whitespace-nowrap',
            cell: (period) => {
              const value = variableOf(period);
              return (
                <>
                  <span className={cn(value < 0 ? 'text-danger' : 'text-fg-muted')}>{value === 0 ? '—' : formatMoney(value)}</span>
                  {period.payee.type === 'TEACHER' && (
                    <p className="text-caption text-fg-subtle">
                      {formatNumber(period.studentsCount)} o‘quvchi{period.lessonsCount > 0 ? ` · ${formatNumber(period.lessonsCount)} dars` : ''}
                    </p>
                  )}
                </>
              );
            },
          },
          {
            key: 'kpi',
            label: 'KPI bonusi',
            align: 'right',
            tdClassName: 'whitespace-nowrap',
            cell: (period) =>
              period.kpiAchievement === null && period.kpiBonus === 0 ? (
                <span className="text-fg-subtle">—</span>
              ) : (
                <>
                  <span className={period.kpiBonus > 0 ? 'text-success' : 'text-fg-muted'}>{formatMoney(period.kpiBonus)}</span>
                  {period.kpiAchievement !== null && <p className="text-caption text-fg-subtle">{formatNumber(period.kpiAchievement)}% bajarildi</p>}
                </>
              ),
          },
          {
            key: 'adjustments',
            label: 'Tuzatishlar',
            align: 'right',
            tdClassName: 'whitespace-nowrap',
            cell: (period) => {
              const value = adjustmentsOf(period);
              return value === 0 ? <span className="text-fg-subtle">—</span> : <span className={value > 0 ? 'text-success' : 'text-danger'}>{value > 0 ? '+' : '−'}{formatMoney(Math.abs(value))}</span>;
            },
          },
          {
            key: 'total',
            label: 'Jami',
            align: 'right',
            tdClassName: 'font-semibold whitespace-nowrap text-fg',
            cell: (period) => <>{formatMoney(period.totalAmount)}</>,
          },
          {
            key: 'status',
            label: 'Tasdiq',
            cell: (period) => (
              <>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                  {period.lockedAt && <Lock className="size-3.5 text-fg-subtle" aria-label="Qotirilgan" />}
                  {period.warnings.length > 0 && !period.lockedAt && (
                    <span className="inline-flex items-center gap-0.5 text-caption text-warning" title={period.warnings.join('\n')}>
                      <AlertTriangle className="size-3.5" aria-hidden />
                      <span className="tabular-nums">{period.warnings.length}</span>
                      <span className="sr-only">ta ogohlantirish</span>
                    </span>
                  )}
                </span>
                {period.status === 'CALCULATED' && period.rejectReason && (
                  <p className="mt-1 max-w-48 truncate text-caption text-danger" title={period.rejectReason}>
                    rad etilgan: {period.rejectReason}
                  </p>
                )}
                {!period.lockedAt && period.unlockedAt && <p className="mt-1 text-caption whitespace-nowrap text-warning">qayta ochilgan</p>}
              </>
            ),
          },
          {
            key: 'payment',
            label: 'To‘lov',
            cell: (period) => {
              const state = paymentStateOf(period);
              return (
                <>
                  <Badge tone={PAYMENT_STATE_TONES[state]}>{PAYMENT_STATE_LABELS[state]}</Badge>
                  {state !== 'NONE' && state !== 'PAID' && (
                    <p className="mt-1 text-caption whitespace-nowrap text-fg-muted tabular-nums">qolgan {formatMoney(period.remainingAmount)}</p>
                  )}
                </>
              );
            },
          },
        ]}
      />

      {actions.dialogs}
    </>
  );
}

/** Oyning hisoblangan maoshlarini bittada tasdiqlashga yuborish */
function SubmitMonthButton({ year, month, branchId, count, onDone }: { year: number; month: number; branchId: string; count: number; onDone: () => void }) {
  const submitMonth = useMutation({
    mutationFn: () => salaryService.submitMonth({ year, month, ...(branchId ? { branchId } : {}) }),
    onSuccess: (result) => {
      toast.success(result.message);
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  return (
    <Button leftIcon={<Send className="size-4" aria-hidden />} loading={submitMonth.isPending} onClick={() => submitMonth.mutate()}>
      Tasdiqlashga yuborish ({formatNumber(count)})
    </Button>
  );
}
