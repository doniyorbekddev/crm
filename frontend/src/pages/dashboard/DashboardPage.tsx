import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  FileCheck,
  GraduationCap,
  HandCoins,
  History,
  Landmark,
  LayoutGrid,
  Phone,
  PiggyBank,
  Target,
  TrendingUp,
  UserX,
  Wallet,
  Wallet2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { WidgetLayoutPanel } from '@/components/WidgetLayoutPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { usePreference } from '@/hooks/usePreference';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { activityService } from '@/services/activity.service';
import { dashboardService } from '@/services/dashboard.service';
import { useAuthStore } from '@/store/auth.store';
import type { ManagerPeriod } from '@/types/dashboard';
import { formatDateTime, formatMoney, formatNumber, formatPhone, formatRelativeTime } from '@/utils/format';
import { LEAD_STATUS_LABELS, leadFullName } from '@/utils/leadLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { WIDGET_SPAN_CLASSES, parseWidgetLayout, resolveWidgets } from '@/utils/widgetLayout';
import type { WidgetDefinition } from '@/utils/widgetLayout';
import { AtRiskStudents } from './AtRiskStudents';
import { DashboardCharts } from './DashboardCharts';

const MANAGER_PERIODS: ReadonlyArray<{ value: ManagerPeriod; label: string }> = [
  { value: 'month', label: 'Shu oy' },
  { value: 'quarter', label: 'So‘nggi 3 oy' },
  { value: 'year', label: 'So‘nggi 12 oy' },
];

type WidgetKey = 'kpis' | 'charts' | 'tasks' | 'funnel' | 'atRisk' | 'managers' | 'activity';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  to?: string;
  tone?: 'default' | 'danger' | 'success';
}

function KpiCard({ icon: Icon, label, value, hint, to, tone = 'default' }: KpiCardProps) {
  const content = (
    <Card className={cn('h-full p-4 transition-colors', to && 'hover:border-brand-300 dark:hover:border-brand-800')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{label}</p>
          <p
            className={cn(
              'mt-1 text-xl font-semibold',
              tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg',
            )}
          >
            {value}
          </p>
          {hint && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
        </div>
        <span className="rounded-lg bg-surface-muted p-2 text-fg-muted">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </Card>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

/** Dashboarddagi qisqa faoliyat lentasi — to‘liqi Faoliyat sahifasida */
function RecentActivity() {
  const query = useQuery({
    queryKey: queryKeys.activity.feed({ limit: 8 }),
    queryFn: () => activityService.feed({ limit: 8 }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>So‘nggi faoliyat</CardTitle>
        <Link to="/activity" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
          Barchasi
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={History} title="Faoliyat yo‘q" description="Yangi voqealar shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{item.title}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {item.description} · {formatRelativeTime(item.occurredAt)}
                  </p>
                </div>
                {item.amount !== null && (
                  <span
                    className={cn(
                      'shrink-0 text-sm font-medium whitespace-nowrap tabular-nums',
                      item.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {item.amount < 0 ? '−' : '+'}
                    {formatMoney(Math.abs(item.amount))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canViewReports = usePermission(PERMISSIONS.REPORT_VIEW);
  const canViewLeads = usePermission(PERMISSIONS.LEAD_VIEW);
  const canViewFollowUps = usePermission(PERMISSIONS.FOLLOWUP_VIEW);
  const canViewActivity = usePermission(PERMISSIONS.ANALYTICS_VIEW);
  const canViewStudents = usePermission(PERMISSIONS.STUDENT_VIEW);
  const [managerPeriod, setManagerPeriod] = useState<ManagerPeriod>('month');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layout = usePreference('dashboard.layout', parseWidgetLayout);

  const summaryQuery = useQuery({ queryKey: queryKeys.dashboard.summary, queryFn: dashboardService.summary });
  const funnelQuery = useQuery({
    queryKey: queryKeys.dashboard.funnel,
    queryFn: dashboardService.funnel,
    enabled: canViewLeads,
  });
  const followUpsQuery = useQuery({
    queryKey: queryKeys.dashboard.followUps,
    queryFn: dashboardService.followUps,
    enabled: canViewFollowUps,
  });
  const managersQuery = useQuery({
    queryKey: queryKeys.dashboard.managers(managerPeriod),
    queryFn: () => dashboardService.managers(managerPeriod),
    enabled: canViewReports,
  });

  const summary = summaryQuery.data;
  const maxFunnel = Math.max(1, ...(funnelQuery.data ?? []).map((stage) => stage.count));

  const definitions: ReadonlyArray<WidgetDefinition<WidgetKey>> = [
    { key: 'kpis', label: 'Asosiy ko‘rsatkichlar', span: 'full' },
    { key: 'charts', label: 'Grafiklar', span: 'twoThirds' },
    { key: 'tasks', label: 'Bugungi vazifalar', span: 'third', available: canViewFollowUps },
    { key: 'funnel', label: 'Sotuv voronkasi', span: 'third', available: canViewLeads },
    { key: 'atRisk', label: 'Xavf ostidagi o‘quvchilar', span: 'third', available: canViewStudents },
    { key: 'managers', label: 'Managerlar reytingi', span: 'twoThirds', available: canViewReports },
    { key: 'activity', label: 'So‘nggi faoliyat', span: 'full', available: canViewActivity },
  ];
  const widgets = resolveWidgets(definitions, layout.value);

  const kpis = summaryQuery.isPending ? (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  ) : summaryQuery.isError ? (
    <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />
  ) : (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {summary?.teaching && (
        <>
          <KpiCard
            icon={CalendarCheck}
            label="Bugungi darslar"
            value={`${formatNumber(summary.teaching.markedLessons)} / ${formatNumber(summary.teaching.todayLessons)}`}
            hint={
              summary.teaching.todayLessons > summary.teaching.markedLessons
                ? `${formatNumber(summary.teaching.todayLessons - summary.teaching.markedLessons)} ta darsda davomat belgilanmagan`
                : 'Davomat belgilangan'
            }
            tone={summary.teaching.todayLessons > summary.teaching.markedLessons ? 'danger' : 'success'}
            to="/attendance"
          />
          <KpiCard
            icon={UserX}
            label="Bugun kelmaganlar"
            value={formatNumber(summary.teaching.todayAbsent)}
            hint={`Oylik davomat: ${summary.teaching.monthAttendanceRate}%`}
            tone={summary.teaching.todayAbsent > 0 ? 'danger' : 'default'}
            to="/attendance"
          />
          <KpiCard
            icon={ClipboardCheck}
            label="Baholash kutmoqda"
            value={formatNumber(summary.teaching.pendingGrading)}
            hint="Topshirilgan, ball qo‘yilmagan vazifalar"
            to="/homework"
          />
          <KpiCard
            icon={FileCheck}
            label="Yaqin imtihonlar"
            value={formatNumber(summary.teaching.upcomingExams)}
            hint={`${formatNumber(summary.teaching.groups)} guruh · ${formatNumber(summary.teaching.students)} o‘quvchi`}
            to="/exams"
          />
        </>
      )}
      {summary?.leads && (
        <>
          <KpiCard
            icon={Target}
            label="Bugungi yangi leadlar"
            value={formatNumber(summary.leads.todayNew)}
            hint={`Shu oyda: ${formatNumber(summary.leads.monthNew)}`}
            to="/leads"
          />
          <KpiCard
            icon={TrendingUp}
            label="Oylik konversiya"
            value={`${summary.leads.conversionRate}%`}
            hint={`Sotildi: ${formatNumber(summary.leads.monthWon)} · Yo‘qotildi: ${formatNumber(summary.leads.monthLost)}`}
            tone={summary.leads.conversionRate >= 50 ? 'success' : 'default'}
          />
        </>
      )}
      {summary?.finance && (
        <KpiCard
          icon={Wallet}
          label="Bugungi tushum"
          value={formatMoney(summary.finance.todayRevenue)}
          hint={
            <span className="inline-flex items-center gap-1">
              Shu oyda: {formatMoney(summary.finance.monthRevenue)}
              <span
                className={cn(
                  'inline-flex items-center',
                  summary.finance.monthGrowth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                )}
              >
                {summary.finance.monthGrowth >= 0 ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden />
                )}
                {Math.abs(summary.finance.monthGrowth)}%
              </span>
            </span>
          }
          to="/payments"
        />
      )}
      {summary?.debts && (
        <KpiCard
          icon={HandCoins}
          label="Umumiy qarzdorlik"
          value={formatMoney(summary.debts.totalRemaining)}
          hint={`${formatNumber(summary.debts.debtors)} ta qarzdor`}
          tone={summary.debts.totalRemaining > 0 ? 'danger' : 'success'}
          to="/debts"
        />
      )}
      {summary?.money && (
        <>
          <KpiCard
            icon={PiggyBank}
            label="Oylik sof foyda"
            value={formatMoney(summary.money.monthNetProfit)}
            hint={`Tushum ${formatMoney(summary.money.monthIncome)} · xarajat ${formatMoney(summary.money.monthExpense)}`}
            tone={summary.money.monthNetProfit >= 0 ? 'success' : 'danger'}
            to="/finance"
          />
          <KpiCard icon={Landmark} label="Kassalardagi qoldiq" value={formatMoney(summary.money.cashBalance)} to="/finance" />
          {summary.money.salaryDue !== null && (
            <KpiCard
              icon={Wallet2}
              label="To‘lanishi kerak maosh"
              value={formatMoney(summary.money.salaryDue)}
              hint={`Tasdiq kutmoqda: ${formatNumber(summary.money.salaryAwaitingApproval ?? 0)}`}
              to="/salaries"
            />
          )}
        </>
      )}
      {summary?.students && (
        <KpiCard
          icon={GraduationCap}
          label="Faol o‘quvchilar"
          value={formatNumber(summary.students.active)}
          hint={`Shu oyda qo‘shilgan: ${formatNumber(summary.students.monthNew)} · Muzlatilgan: ${formatNumber(summary.students.frozen)}`}
          to="/students"
        />
      )}
      {summary?.leads && (
        <KpiCard icon={Target} label="Ishlanayotgan leadlar" value={formatNumber(summary.leads.open)} hint="Yopilmagan sotuv jarayonlari" to="/leads" />
      )}
      {summary?.tasks && (
        <>
          <KpiCard
            icon={CalendarClock}
            label="Bugungi follow-up"
            value={formatNumber(summary.tasks.todayFollowUps)}
            hint={`Bugungi qo‘ng‘iroqlar: ${formatNumber(summary.tasks.todayCalls)}`}
            to="/follow-ups"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Kechikkan follow-up"
            value={formatNumber(summary.tasks.overdueFollowUps)}
            tone={summary.tasks.overdueFollowUps > 0 ? 'danger' : 'success'}
            hint={summary.tasks.overdueFollowUps > 0 ? 'Darhol bog‘laning' : 'Kechikkani yo‘q'}
            to="/follow-ups"
          />
        </>
      )}
    </div>
  );

  const tasks = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Bugungi vazifalar</CardTitle>
        <Link to="/follow-ups" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
          Barchasi
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {followUpsQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : followUpsQuery.isError ? (
          <ErrorState error={followUpsQuery.error} onRetry={() => void followUpsQuery.refetch()} />
        ) : followUpsQuery.data.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Bugunga vazifa yo‘q" description="Kechikkan follow-up ham yo‘q" />
        ) : (
          <ul className="divide-y divide-border">
            {followUpsQuery.data.map((item) => (
              <li key={item.id}>
                <Link to={`/leads/${item.lead.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-fg">{leadFullName(item.lead)}</p>
                    {item.overdue && <Badge tone="red">Kechikkan</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{item.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
                    <span>{formatDateTime(item.dueAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" aria-hidden />
                      {formatPhone(item.lead.phone)}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const funnel = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Sotuv voronkasi</CardTitle>
      </CardHeader>
      <CardContent>
        {funnelQuery.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : funnelQuery.isError ? (
          <ErrorState error={funnelQuery.error} onRetry={() => void funnelQuery.refetch()} />
        ) : (
          <ul className="space-y-2.5">
            {funnelQuery.data.map((stage) => (
              <li key={stage.status}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-fg">{LEAD_STATUS_LABELS[stage.status]}</span>
                  <span className="text-fg-muted tabular-nums">
                    {formatNumber(stage.count)} · {stage.percent}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn('h-full rounded-full', stage.status === 'WON' ? 'bg-emerald-500' : 'bg-brand-500')}
                    style={{ width: `${Math.round((stage.count / maxFunnel) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const managers = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Managerlar reytingi</CardTitle>
        <Select
          value={managerPeriod}
          onChange={(event) => setManagerPeriod(event.target.value as ManagerPeriod)}
          aria-label="Managerlar davri"
          wrapperClassName="w-40"
        >
          {MANAGER_PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        {managersQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : managersQuery.isError ? (
          <ErrorState error={managersQuery.error} onRetry={() => void managersQuery.refetch()} />
        ) : managersQuery.data.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Ma’lumot yo‘q" description="Tanlangan davrda sotuv qayd etilmagan" />
        ) : (
          <ul className="divide-y divide-border">
            {managersQuery.data.map((manager, index) => (
              <li key={manager.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-surface-muted text-fg-muted',
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {manager.firstName} {manager.lastName}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {manager.roleName} · {formatNumber(manager.leads)} lead · {formatNumber(manager.won)} sotuv · {manager.conversionRate}%
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-fg">{formatMoney(manager.revenue)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const content: Record<WidgetKey, ReactNode> = {
    kpis,
    charts: <DashboardCharts showRevenue={Boolean(summary?.finance)} />,
    tasks,
    funnel,
    atRisk: <AtRiskStudents />,
    managers,
    activity: <RecentActivity />,
  };

  return (
    <>
      <PageHeader
        title={`Salom, ${user?.firstName ?? ''}!`}
        documentTitle="Dashboard"
        description={summary ? `Bugungi holat · ${summary.date}` : 'Ko‘rsatkichlar yuklanmoqda'}
        actions={
          <Button variant="secondary" leftIcon={<LayoutGrid className="size-4" aria-hidden />} aria-expanded={layoutOpen} onClick={() => setLayoutOpen((open) => !open)}>
            Vidjetlar
          </Button>
        }
      />

      {layoutOpen && (
        <WidgetLayoutPanel
          widgets={widgets}
          onChange={(next) => layout.save(next)}
          onReset={() => layout.save({ order: definitions.map((definition) => definition.key), hidden: [] })}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
        {widgets
          .filter((widget) => widget.visible)
          .map((widget) => (
            <div key={widget.key} className={cn('min-w-0', WIDGET_SPAN_CLASSES[widget.span])}>
              {content[widget.key]}
            </div>
          ))}
      </div>
    </>
  );
}
