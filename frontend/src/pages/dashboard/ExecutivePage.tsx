import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  CircleCheck,
  GraduationCap,
  HandCoins,
  Info,
  Layers,
  LayoutGrid,
  Target,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker, dateRangeParams } from '@/components/DateRangePicker';
import type { DateRangeValue } from '@/components/DateRangePicker';
import { PageHeader } from '@/components/PageHeader';
import { WidgetLayoutPanel } from '@/components/WidgetLayoutPanel';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePreference } from '@/hooks/usePreference';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import { AcademyOverviewCard } from './AcademyOverviewCard';
import type { ExecutiveChangeKey, ExecutiveHealth, ExecutiveParams, ExecutiveSummary, HealthStatus } from '@/types/dashboard';
import type { DateRangePreset } from '@/utils/dateRange';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { WIDGET_SPAN_CLASSES, parseWidgetLayout, resolveWidgets } from '@/utils/widgetLayout';
import type { WidgetDefinition } from '@/utils/widgetLayout';

/** Grafik ranglari — ikkala mavzuda ham o‘qiladigan to‘q ranglar */
const COLORS = { revenue: '#10b981', expense: '#ef4444', profit: '#3354ec' };

// ---------------------------------------------------------------------
// Davr tanlash
// ---------------------------------------------------------------------

const EXECUTIVE_PRESETS: readonly DateRangePreset[] = [
  'this_month',
  'last_month',
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_quarter',
  'this_year',
  'custom',
];

/** Shu oy — prognoz bilan joriy oy; o‘tgan oy — to‘liq oy; qolganlari — sana oralig‘i */
function executiveParams(value: DateRangeValue): ExecutiveParams | null {
  if (value.preset === 'this_month') return {};
  if (value.preset === 'last_month') {
    const today = new Date();
    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { year: previous.getFullYear(), month: previous.getMonth() + 1 };
  }
  const range = dateRangeParams(value);
  return range?.from && range.to ? { from: range.from, to: range.to } : null;
}

// ---------------------------------------------------------------------
// Vidjetlar — tartibi va ko‘rinishi xodim profilida saqlanadi
// ---------------------------------------------------------------------

type WidgetKey = 'health' | 'insights' | 'kpis' | 'academy' | 'forecast' | 'attention' | 'today' | 'trend' | 'summary';

const EXECUTIVE_WIDGETS: ReadonlyArray<WidgetDefinition<WidgetKey>> = [
  { key: 'health', label: 'Sog‘lomlik bahosi', span: 'half' },
  { key: 'insights', label: 'Xulosalar', span: 'half' },
  { key: 'kpis', label: 'Asosiy ko‘rsatkichlar', span: 'full' },
  { key: 'academy', label: 'Akademiya holati', span: 'full' },
  { key: 'forecast', label: 'Oy oxiri prognozi', span: 'full' },
  { key: 'attention', label: 'Diqqat talab qiladi', span: 'full' },
  { key: 'today', label: 'Bugun', span: 'third' },
  { key: 'trend', label: 'Dinamika grafigi', span: 'twoThirds' },
  { key: 'summary', label: 'Davr yakunlari', span: 'full' },
];

/** Avval vidjetlar brauzerda saqlanardi — bir marta profilga ko‘chiriladi */
const LEGACY_STORAGE_KEY = 'executive.hiddenWidgets';

function readLegacyHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Kichik komponentlar
// ---------------------------------------------------------------------

/**
 * O‘zgarish belgisi. `inverse` — kamayishi yaxshi bo‘lgan ko‘rsatkichlar (xarajat, ketganlar).
 * `points` — foiz punkti (marja, davomat, konversiya).
 */
function Delta({ value, inverse = false, points = false }: { value: number | null; inverse?: boolean; points?: boolean }) {
  if (value === null) return <span className="text-xs text-fg-subtle">solishtirish yo‘q</span>;
  if (value === 0) return <span className="text-xs text-fg-muted">o‘zgarmadi</span>;
  const good = inverse ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="size-3.5" aria-hidden />
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
      {points ? ' p.' : '%'}
    </span>
  );
}

interface KpiDefinition {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  tone?: 'default' | 'positive' | 'negative';
  change?: { key: ExecutiveChangeKey; inverse?: boolean; points?: boolean };
}

function buildKpis(data: ExecutiveSummary): KpiDefinition[] {
  const { kpi, month } = data;
  return [
    { key: 'revenue', label: 'Sof tushum', value: formatMoney(kpi.monthRevenue), icon: TrendingUp, to: '/finance', change: { key: 'revenue' } },
    { key: 'expense', label: 'Xarajat', value: formatMoney(kpi.monthExpense), icon: TrendingDown, to: '/expenses', change: { key: 'expense', inverse: true } },
    {
      key: 'profit',
      label: 'Sof foyda',
      value: formatMoney(kpi.netProfit),
      hint: `marja ${month.margin}%`,
      icon: Wallet,
      to: '/finance',
      tone: kpi.netProfit >= 0 ? 'positive' : 'negative',
      change: { key: 'netProfit' },
    },
    {
      key: 'debt',
      label: 'Qarzdorlik',
      value: formatMoney(kpi.totalDebt),
      hint: 'hozirgi holat',
      icon: HandCoins,
      to: '/debts',
      tone: kpi.totalDebt > 0 ? 'negative' : 'default',
    },
    {
      key: 'students',
      label: 'Faol o‘quvchilar',
      value: formatNumber(kpi.activeStudents),
      hint: `jami ${formatNumber(kpi.totalStudents)}`,
      icon: GraduationCap,
      to: '/students',
    },
    { key: 'new-students', label: 'Yangi o‘quvchilar', value: formatNumber(kpi.newStudents), icon: UserPlus, to: '/students', change: { key: 'newStudents' } },
    {
      key: 'dropped',
      label: 'Ketgan o‘quvchilar',
      value: formatNumber(kpi.droppedStudents),
      icon: UserMinus,
      to: '/students',
      tone: kpi.droppedStudents > 0 ? 'negative' : 'default',
      change: { key: 'droppedStudents', inverse: true },
    },
    {
      key: 'attendance',
      label: 'Davomat',
      value: month.attendanceMarks > 0 ? `${kpi.attendanceRate}%` : '—',
      icon: CalendarCheck,
      to: '/attendance',
      tone: month.attendanceMarks === 0 ? 'default' : kpi.attendanceRate >= 85 ? 'positive' : 'negative',
      change: { key: 'attendanceRate', points: true },
    },
    {
      key: 'leads',
      label: 'Yangi leadlar',
      value: formatNumber(month.newLeads),
      hint: `sotildi: ${formatNumber(month.wonLeads)}`,
      icon: Target,
      to: '/leads',
      change: { key: 'newLeads' },
    },
    {
      key: 'conversion',
      label: 'Sotuv konversiyasi',
      value: `${kpi.salesConversion}%`,
      icon: Target,
      to: '/leads',
      change: { key: 'conversionRate', points: true },
    },
    {
      key: 'groups',
      label: 'Guruh / o‘qituvchi',
      value: `${formatNumber(kpi.activeGroups)} / ${formatNumber(kpi.totalTeachers)}`,
      hint: `jami guruh: ${formatNumber(kpi.totalGroups)}`,
      icon: Layers,
      to: '/groups',
    },
    {
      key: 'salary',
      label: 'Hisoblangan maosh',
      value: formatMoney(month.salaryAccrued),
      hint: `to‘langan: ${formatMoney(month.salaryPaid)}`,
      icon: BookOpen,
      to: '/salaries',
    },
  ];
}

function KpiCard({ kpi, changes }: { kpi: KpiDefinition; changes: ExecutiveSummary['changes'] }) {
  const Icon = kpi.icon;
  return (
    <Link
      to={kpi.to}
      className="min-w-0 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted">{kpi.label}</p>
        <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </div>
      <p
        className={cn(
          'mt-1 text-base font-semibold tabular-nums sm:text-xl',
          kpi.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          kpi.tone === 'negative' && 'text-red-600 dark:text-red-400',
          (!kpi.tone || kpi.tone === 'default') && 'text-fg',
        )}
      >
        {kpi.value}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {kpi.change && <Delta value={changes[kpi.change.key]} inverse={kpi.change.inverse} points={kpi.change.points} />}
        {kpi.change && kpi.hint && <span className="text-xs text-fg-subtle" aria-hidden>·</span>}
        {kpi.hint && <span className="truncate text-xs text-fg-muted">{kpi.hint}</span>}
      </div>
    </Link>
  );
}

const HEALTH_LABELS: Record<HealthStatus, string> = {
  GOOD: 'Yaxshi',
  FAIR: 'O‘rtacha',
  POOR: 'Xavfli',
  NO_DATA: 'Ma’lumot yetarli emas',
};

function healthColor(score: number | null): string {
  if (score === null) return 'text-fg-subtle';
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function healthBar(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function HealthCard({ health }: { health: ExecutiveHealth }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = health.score === null ? 0 : (health.score / 100) * circumference;

  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>Markaz sog‘lomligi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto size-28 shrink-0 sm:mx-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`Sog‘lomlik bahosi: ${health.score ?? 'ma’lumot yo‘q'}`}>
            <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="10" className="stroke-surface-muted" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke="currentColor"
              strokeDasharray={`${progress} ${circumference}`}
              className={healthColor(health.score)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-fg">{health.score ?? '—'}</span>
            <span className="text-[11px] text-fg-muted">{HEALTH_LABELS[health.status]}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {health.components.map((component) => (
            <li key={component.key} title={component.hint}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-fg-muted">{component.label}</span>
                <span className="tabular-nums text-fg">
                  {component.value}
                  <span className="ml-1.5 text-fg-subtle">{component.score === null ? 'ma’lumot yo‘q' : `${component.score} ball`}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                {component.score !== null && (
                  <div className={cn('h-full rounded-full', healthBar(component.score))} style={{ width: `${Math.max(component.score, 3)}%` }} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-right">
        <span className="text-sm font-medium whitespace-nowrap tabular-nums text-fg">{value}</span>
        {hint && <span className="ml-2 text-xs text-fg-subtle">{hint}</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sahifa
// ---------------------------------------------------------------------

export default function ExecutivePage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: 'this_month', custom: { from: '', to: '' } });
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const { value: storedLayout, loaded: layoutLoaded, save: saveLayout } = usePreference('executive.layout', parseWidgetLayout);

  // Brauzerda saqlangan eski tanlov profilga bir marta ko‘chiriladi
  useEffect(() => {
    if (!layoutLoaded || storedLayout) return;
    const legacy = readLegacyHidden();
    if (legacy.length === 0) return;
    saveLayout({ order: EXECUTIVE_WIDGETS.map((widget) => widget.key), hidden: legacy });
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Brauzer xotirasiga kirib bo‘lmasa ham sozlama profilda saqlandi
    }
  }, [layoutLoaded, storedLayout, saveLayout]);

  const params = executiveParams(range);
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.executivePeriod(params ?? {}),
    queryFn: () => dashboardService.executive(params ?? {}),
    enabled: params !== null,
    placeholderData: (previous) => previous,
  });

  const widgets = resolveWidgets(EXECUTIVE_WIDGETS, storedLayout);
  const data = summaryQuery.data;

  const header = (
    <PageHeader
      title="Direktor paneli"
      description={data ? `${data.period.label} · ${formatDate(data.today.date)} holatiga ko‘ra` : 'Butun markaz holati bitta sahifada'}
      documentTitle="Direktor paneli"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} presets={EXECUTIVE_PRESETS} />
          <Button variant="secondary" leftIcon={<LayoutGrid className="size-4" aria-hidden />} aria-expanded={widgetsOpen} onClick={() => setWidgetsOpen((open) => !open)}>
            Vidjetlar
          </Button>
        </div>
      }
    />
  );

  const widgetPanel = widgetsOpen && (
    <WidgetLayoutPanel
      widgets={widgets}
      onChange={(layout) => saveLayout(layout)}
      onReset={() => saveLayout({ order: EXECUTIVE_WIDGETS.map((widget) => widget.key), hidden: [] })}
    />
  );

  if (params === null) {
    return (
      <>
        {header}
        {widgetPanel}
        <Card className="p-6 text-center text-sm text-fg-muted">Oraliqning boshlanish va tugash sanalarini tanlang</Card>
      </>
    );
  }

  if (summaryQuery.isError) {
    return (
      <>
        {header}
        <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {header}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const { today, month, previous, forecast } = data;
  const pendingLessons = Math.max(today.lessons - today.markedLessons, 0);
  const periodName = data.period.kind === 'range' ? 'Oraliq' : month.label;

  const content: Record<WidgetKey, ReactNode> = {
    health: <HealthCard health={data.health} />,
    academy: <AcademyOverviewCard kpi={data.kpi} />,
    insights: (
      <Card className="h-full min-w-0">
        <CardHeader>
          <CardTitle>Xulosalar</CardTitle>
          <span className="text-xs text-fg-muted">
            {formatDate(data.period.previousFrom)} — {formatDate(data.period.previousTo)} bilan
          </span>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.insights.map((insight) => {
              const Icon = insight.tone === 'negative' ? AlertTriangle : insight.tone === 'positive' ? CircleCheck : Info;
              return (
                <li key={insight.key} className="flex items-start gap-2 text-sm">
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      insight.tone === 'negative' && 'text-red-500',
                      insight.tone === 'positive' && 'text-emerald-500',
                      insight.tone === 'neutral' && 'text-fg-subtle',
                    )}
                    aria-hidden
                  />
                  <span className="text-fg">{insight.text}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    ),
    kpis: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {buildKpis(data).map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} changes={data.changes} />
        ))}
      </div>
    ),
    forecast: forecast ? (
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Oy oxiri prognozi</CardTitle>
          <span className="text-xs text-fg-muted">
            {forecast.daysElapsed} / {forecast.daysInMonth} kun o‘tdi
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((forecast.daysElapsed / forecast.daysInMonth) * 100)}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-fg-muted">Kutilayotgan tushum</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatMoney(forecast.projectedRevenue)}</p>
              <p className="text-xs text-fg-muted">hozirgi sur’at bo‘yicha</p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Kutilayotgan xarajat</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatMoney(forecast.projectedExpense)}</p>
              <p className="text-xs text-fg-muted">shundan to‘lanmagan: {formatMoney(forecast.upcomingExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Kutilayotgan foyda</p>
              <p className={cn('mt-1 text-lg font-semibold tabular-nums', forecast.projectedProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {forecast.projectedProfit < 0 ? '−' : ''}
                {formatMoney(Math.abs(forecast.projectedProfit))}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Tushum rejasi</p>
              {forecast.targetProgress === null ? (
                <p className="mt-1 text-sm text-fg-muted">
                  Reja belgilanmagan ·{' '}
                  <Link to="/targets" className="text-brand-600 hover:underline dark:text-brand-400">
                    belgilash
                  </Link>
                </p>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{forecast.targetProgress}%</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={cn('h-full rounded-full', forecast.targetProgress >= 100 ? 'bg-emerald-500' : forecast.targetProgress >= 80 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(forecast.targetProgress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">reja: {formatMoney(forecast.revenueTarget)}</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    ) : null,
    attention:
      data.attention.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Diqqat talab qiladi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 p-4">
            {data.attention.map((item) => (
              <span
                key={item.key}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
                  item.tone === 'danger'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
                )}
              >
                <AlertTriangle className="size-3.5" aria-hidden />
                {item.label}
                <strong>{formatNumber(item.value)}</strong>
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null,
    today: (
      <Card className="h-full min-w-0">
        <CardHeader>
          <CardTitle>Bugun</CardTitle>
          <span className="text-xs text-fg-muted">{formatDate(today.date)}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            <Row label="Yangi leadlar" value={formatNumber(today.newLeads)} />
            <Row label="Yangi o‘quvchilar" value={formatNumber(today.newStudents)} />
            <Row label="Sinov darslari" value={formatNumber(today.trialLessons)} />
            <Row
              label="Darslar"
              value={`${formatNumber(today.markedLessons)} / ${formatNumber(today.lessons)}`}
              hint={pendingLessons > 0 ? `${pendingLessons} ta belgilanmagan` : 'hammasi belgilangan'}
            />
            <Row label="Davomat" value={`${today.attendanceRate}%`} hint={`${formatNumber(today.absentStudents)} yo‘q`} />
            <Row label="To‘lovlar" value={formatMoney(today.payments)} />
            <Row label="Xarajatlar" value={formatMoney(today.expenses)} />
            <Row label="Sof tushum" value={formatMoney(today.netRevenue)} />
          </div>
        </CardContent>
      </Card>
    ),
    trend: (
      <Card className="h-full min-w-0">
        <CardHeader>
          <CardTitle>Tushum va xarajat dinamikasi</CardTitle>
          <span className="text-xs text-fg-muted">oxirgi 6 oy</span>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full text-fg-muted">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} vertical={false} />
                <XAxis dataKey="label" stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="currentColor"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${Math.round((value / 1_000_000) * 10) / 10}mln`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: 'var(--color-fg)',
                  }}
                  formatter={(value, name) => [formatMoney(typeof value === 'number' ? value : Number(value ?? 0)), String(name ?? '')]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Sof tushum" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" name="Xarajat" fill={COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="profit" name="Sof foyda" stroke={COLORS.profit} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    ),
    summary: (
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{periodName} yakunlari</CardTitle>
          <span className="text-xs text-fg-muted">
            {formatDate(data.period.from)} — {formatDate(data.period.to)}
          </span>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <div className="divide-y divide-border">
            <Row label="Sof tushum" value={formatMoney(month.revenue)} hint={`oldin: ${formatMoney(previous.revenue)}`} />
            <Row label="Xarajat" value={formatMoney(month.expense)} hint={`oldin: ${formatMoney(previous.expense)}`} />
            <Row label="Sof foyda" value={formatMoney(month.netProfit)} hint={`${month.margin}%`} />
            <Row label="Hisoblangan maosh" value={formatMoney(month.salaryAccrued)} />
          </div>
          <div className="divide-y divide-border">
            <Row label="Yangi leadlar" value={formatNumber(month.newLeads)} hint={`oldin: ${formatNumber(previous.newLeads)}`} />
            <Row label="Sotuvlar" value={formatNumber(month.wonLeads)} hint={`oldin: ${formatNumber(previous.wonLeads)}`} />
            <Row label="Konversiya" value={`${month.conversionRate}%`} />
            <Row label="Qarzdorlik" value={formatMoney(month.totalDebt)} />
          </div>
          <div className="divide-y divide-border">
            <Row label="Yangi o‘quvchilar" value={formatNumber(month.newStudents)} hint={`oldin: ${formatNumber(previous.newStudents)}`} />
            <Row label="Ketgan o‘quvchilar" value={formatNumber(month.droppedStudents)} hint={`oldin: ${formatNumber(previous.droppedStudents)}`} />
            <Row label="Faol o‘quvchilar" value={formatNumber(month.activeStudents)} />
            <Row label="Davomat" value={month.attendanceMarks > 0 ? `${month.attendanceRate}%` : '—'} />
          </div>
        </CardContent>
      </Card>
    ),
  };

  return (
    <>
      {header}
      {widgetPanel}

      <div className={cn('grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-6', summaryQuery.isFetching && 'opacity-70')}>
        {widgets
          .filter((widget) => widget.visible && content[widget.key] !== null)
          .map((widget) => (
            <div key={widget.key} className={cn('min-w-0', WIDGET_SPAN_CLASSES[widget.span])}>
              {content[widget.key]}
            </div>
          ))}
      </div>
    </>
  );
}
