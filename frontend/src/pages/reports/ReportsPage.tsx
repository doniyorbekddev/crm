import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import { reportsService } from '@/services/reports.service';
import type { ReportCell, ReportColumn, ReportColumnType, ReportGroupBy, ReportParams, ReportType } from '@/types/report';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { hasPermission } from '@/utils/permissions';
import { DateRangePicker, dateRangeParams } from '@/components/DateRangePicker';
import type { DateRangeValue } from '@/components/DateRangePicker';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';

interface ReportConfig {
  value: ReportType;
  label: string;
  timeSeries: boolean;
  filters: Array<'course' | 'group' | 'manager'>;
  /** report.view dan tashqari kerak bo‘ladigan ruxsat (backend bilan bir xil) */
  permission?: string;
}

const REPORTS: readonly ReportConfig[] = [
  { value: 'sales', label: 'Sotuv', timeSeries: true, filters: ['manager'] },
  { value: 'managers', label: 'Managerlar', timeSeries: false, filters: ['manager'] },
  { value: 'payments', label: 'To‘lovlar', timeSeries: true, filters: ['course', 'group', 'manager'], permission: PERMISSIONS.PAYMENT_VIEW },
  { value: 'debts', label: 'Qarzdorlik', timeSeries: false, filters: ['course', 'group'], permission: PERMISSIONS.DEBT_VIEW },
  { value: 'profit', label: 'Foyda', timeSeries: true, filters: [], permission: PERMISSIONS.FINANCE_VIEW },
  { value: 'incomes', label: 'Tushumlar', timeSeries: false, filters: [], permission: PERMISSIONS.INCOME_VIEW },
  { value: 'expenses', label: 'Xarajatlar', timeSeries: false, filters: [], permission: PERMISSIONS.EXPENSE_VIEW },
  { value: 'salaries', label: 'Maoshlar', timeSeries: false, filters: [], permission: PERMISSIONS.SALARY_VIEW },
  { value: 'courses', label: 'Kurslar', timeSeries: false, filters: ['course'] },
  { value: 'groups', label: 'Guruhlar', timeSeries: false, filters: ['course', 'group'] },
  { value: 'teachers', label: 'O‘qituvchilar', timeSeries: false, filters: ['course'], permission: PERMISSIONS.TEACHER_VIEW },
  { value: 'attendance', label: 'Davomat', timeSeries: false, filters: ['course', 'group'] },
  { value: 'retention', label: 'Retention', timeSeries: true, filters: ['course', 'group'] },
  { value: 'gamification', label: 'Gamification', timeSeries: false, filters: ['course', 'group'], permission: PERMISSIONS.GAMIFICATION_VIEW },
  { value: 'sources', label: 'Manbalar', timeSeries: false, filters: ['manager'] },
];

const GROUP_BY_OPTIONS: ReadonlyArray<{ value: ReportGroupBy; label: string }> = [
  { value: 'day', label: 'Kunlar bo‘yicha' },
  { value: 'week', label: 'Haftalar bo‘yicha' },
  { value: 'month', label: 'Oylar bo‘yicha' },
];

function formatCell(value: ReportCell, type: ReportColumnType): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'money':
      return formatMoney(Number(value));
    case 'number':
      return formatNumber(Number(value));
    case 'percent':
      return `${Number(value)}%`;
    case 'date':
      return formatDate(String(value));
    case 'text':
      return String(value);
  }
}

function TotalsRow({ columns, totals }: { columns: ReportColumn[]; totals: Record<string, number> }) {
  return (
    <TR className="bg-surface-muted font-medium">
      {columns.map((column, index) => (
        <TD key={column.key} className={cn('whitespace-nowrap', column.type === 'text' ? 'text-fg' : 'text-right tabular-nums text-fg')}>
          {index === 0 ? 'Jami' : column.key in totals ? formatCell(totals[column.key] ?? 0, column.type) : ''}
        </TD>
      ))}
    </TR>
  );
}

export default function ReportsPage() {
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const user = useAuthStore((state) => state.user);
  const availableReports = REPORTS.filter((report) => !report.permission || hasPermission(user, report.permission));

  const [type, setType] = useState<ReportType>('sales');
  const [range, setRange] = useState<DateRangeValue>({ preset: 'this_month', custom: { from: '', to: '' } });
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('day');
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [managerId, setManagerId] = useState('');
  const { exporting, run: runExport } = useExport();

  const config = availableReports.find((report) => report.value === type) ?? availableReports[0] ?? REPORTS[0]!;
  const rangeParams = dateRangeParams(range);
  const params: ReportParams = {
    ...(rangeParams ?? {}),
    ...(config.timeSeries ? { groupBy } : {}),
    ...(config.filters.includes('course') && courseId ? { courseId } : {}),
    ...(config.filters.includes('group') && groupId ? { groupId } : {}),
    ...(config.filters.includes('manager') && managerId ? { managerId } : {}),
  };

  const reportQuery = useQuery({
    queryKey: queryKeys.reports.build(type, params),
    queryFn: () => reportsService.build(type, params),
    placeholderData: keepPreviousData,
    enabled: rangeParams !== null,
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const groupsForCourse = (lookupsQuery.data?.groups ?? []).filter((group) => !courseId || group.courseId === courseId);

  const report = reportQuery.data;

  return (
    <>
      <PageHeader
        title="Hisobotlar"
        description={report?.description ?? 'Sana oralig‘ini tanlab, kerakli hisobotni oling'}
        actions={
          canExport ? (
            <ExportMenu
              loading={exporting}
              disabled={!report || report.rows.length === 0}
              onExport={(format) => void runExport(`/reports/${type}/export`, params, type, format)}
            />
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3">
          <div role="tablist" aria-label="Hisobot turi" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {availableReports.map((item) => {
              const active = type === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setType(item.value)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <DateRangePicker value={range} onChange={setRange} />
            {config.timeSeries && (
              <Select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as ReportGroupBy)}
                aria-label="Guruhlash"
                wrapperClassName="sm:w-48"
              >
                {GROUP_BY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
            {config.filters.includes('course') && (
              <Select
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setGroupId('');
                }}
                aria-label="Kurs"
                wrapperClassName="sm:w-48"
              >
                <option value="">Barcha kurslar</option>
                {lookupsQuery.data?.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Select>
            )}
            {config.filters.includes('group') && (
              <Select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Guruh" wrapperClassName="sm:w-48">
                <option value="">Barcha guruhlar</option>
                {groupsForCourse.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            )}
            {config.filters.includes('manager') && (
              <Select value={managerId} onChange={(event) => setManagerId(event.target.value)} aria-label="Manager" wrapperClassName="sm:w-52">
                <option value="">Barcha managerlar</option>
                {lookupsQuery.data?.managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
      </Card>

      {report && report.kpis.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.kpis.map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <p className="text-xs text-fg-muted">{kpi.label}</p>
              <p className="mt-1 text-xl font-semibold text-fg">{formatCell(kpi.value, kpi.type)}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        {reportQuery.isPending ? (
          <TableSkeleton rows={8} columns={6} />
        ) : reportQuery.isError ? (
          <ErrorState error={reportQuery.error} retrying={reportQuery.isFetching} onRetry={() => void reportQuery.refetch()} />
        ) : report && report.rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="Ma’lumot topilmadi" description="Tanlangan davrda yozuv yo‘q — sana oralig‘ini kengaytiring" />
        ) : report ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4 text-fg-muted" aria-hidden />
                <span className="font-medium text-fg">{report.title}</span>
                <span className="text-fg-muted">
                  {formatDate(report.from)} — {formatDate(report.to)}
                </span>
              </div>
              <span className="text-xs text-fg-muted">{formatNumber(report.rows.length)} ta qator</span>
            </div>

            <TableContainer className={cn('transition-opacity', reportQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    {report.columns.map((column) => (
                      <TH key={column.key} className={cn(column.type !== 'text' && 'text-right')}>
                        {column.label}
                      </TH>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {report.rows.map((row, index) => (
                    <TR key={index}>
                      {report.columns.map((column) => (
                        <TD
                          key={column.key}
                          className={cn('whitespace-nowrap', column.type === 'text' ? 'text-fg' : 'text-right tabular-nums text-fg')}
                        >
                          {formatCell(row[column.key] ?? null, column.type)}
                        </TD>
                      ))}
                    </TR>
                  ))}
                  {report.totals && (
                    <TotalsRow columns={report.columns} totals={report.totals} />
                  )}
                </TBody>
              </Table>
            </TableContainer>

            {report.truncatedFrom && (
              <p className="border-t border-border px-4 py-3 text-xs text-fg-muted">
                Jami {formatNumber(report.truncatedFrom)} ta yozuvdan birinchi {formatNumber(report.rows.length)} tasi ko‘rsatildi.
                To‘liq ma’lumot uchun sana oralig‘ini toraytiring.
              </p>
            )}
          </>
        ) : null}
      </Card>
    </>
  );
}
