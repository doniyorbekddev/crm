import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  HandCoins,
  Layers,
  Target,
  TrendingDown,
  TrendingUp,
  UserCog,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import type { ExecutiveSummary } from '@/types/dashboard';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';

/** Grafik ranglari — ikkala mavzuda ham o‘qiladigan to‘q ranglar */
const COLORS = { revenue: '#10b981', expense: '#ef4444', profit: '#3354ec' };

interface KpiDefinition {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  tone?: 'default' | 'positive' | 'negative';
}

function buildKpis(data: ExecutiveSummary): KpiDefinition[] {
  const { kpi, month } = data;
  return [
    {
      key: 'students',
      label: 'Jami o‘quvchilar',
      value: formatNumber(kpi.totalStudents),
      hint: `Faol: ${formatNumber(kpi.activeStudents)}`,
      icon: GraduationCap,
      to: '/students',
    },
    {
      key: 'new-students',
      label: 'Yangi o‘quvchilar',
      value: formatNumber(kpi.newStudents),
      hint: month.label,
      icon: UserPlus,
      to: '/students',
      tone: 'positive',
    },
    {
      key: 'dropped',
      label: 'Ketgan o‘quvchilar',
      value: formatNumber(kpi.droppedStudents),
      hint: month.label,
      icon: UserMinus,
      to: '/students',
      tone: kpi.droppedStudents > 0 ? 'negative' : 'default',
    },
    {
      key: 'groups',
      label: 'Guruhlar',
      value: formatNumber(kpi.totalGroups),
      hint: `Faol: ${formatNumber(kpi.activeGroups)}`,
      icon: Layers,
      to: '/groups',
    },
    {
      key: 'teachers',
      label: 'O‘qituvchilar',
      value: formatNumber(kpi.totalTeachers),
      icon: UserCog,
      to: '/teachers',
    },
    {
      key: 'attendance',
      label: 'Davomat',
      value: `${kpi.attendanceRate}%`,
      hint: month.label,
      icon: CalendarCheck,
      to: '/attendance',
      tone: kpi.attendanceRate >= 85 ? 'positive' : 'negative',
    },
    {
      key: 'revenue',
      label: 'Oylik tushum',
      value: formatMoney(kpi.monthRevenue),
      icon: TrendingUp,
      to: '/finance',
      tone: 'positive',
    },
    {
      key: 'expense',
      label: 'Oylik xarajat',
      value: formatMoney(kpi.monthExpense),
      icon: TrendingDown,
      to: '/expenses',
      tone: 'negative',
    },
    {
      key: 'profit',
      label: 'Sof foyda',
      value: formatMoney(kpi.netProfit),
      hint: `Marja: ${month.margin}%`,
      icon: Wallet,
      to: '/finance',
      tone: kpi.netProfit >= 0 ? 'positive' : 'negative',
    },
    {
      key: 'debt',
      label: 'Qarzdorlik',
      value: formatMoney(kpi.totalDebt),
      icon: HandCoins,
      to: '/debts',
      tone: kpi.totalDebt > 0 ? 'negative' : 'default',
    },
    {
      key: 'conversion',
      label: 'Sotuv konversiyasi',
      value: `${kpi.salesConversion}%`,
      hint: `Sotildi: ${formatNumber(month.wonLeads)}`,
      icon: Target,
      to: '/leads',
    },
    {
      key: 'salary',
      label: 'Hisoblangan maosh',
      value: formatMoney(month.salaryAccrued),
      hint: `To‘langan: ${formatMoney(month.salaryPaid)}`,
      icon: BookOpen,
      to: '/salaries',
    },
  ];
}

function KpiCard({ kpi }: { kpi: KpiDefinition }) {
  const Icon = kpi.icon;
  return (
    <Link
      to={kpi.to}
      className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted">{kpi.label}</p>
        <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </div>
      <p
        className={cn(
          'mt-1 text-xl font-semibold',
          kpi.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          kpi.tone === 'negative' && 'text-red-600 dark:text-red-400',
          (!kpi.tone || kpi.tone === 'default') && 'text-fg',
        )}
      >
        {kpi.value}
      </p>
      {kpi.hint && <p className="mt-1 truncate text-xs text-fg-muted">{kpi.hint}</p>}
    </Link>
  );
}

function TodayRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-right">
        <span className="text-sm font-medium text-fg">{value}</span>
        {hint && <span className="ml-2 text-xs text-fg-subtle">{hint}</span>}
      </span>
    </div>
  );
}

export default function ExecutivePage() {
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.executive,
    queryFn: dashboardService.executive,
  });

  if (summaryQuery.isError) {
    return (
      <>
        <PageHeader title="Direktor paneli" description="Butun markaz holati bitta sahifada" />
        <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />
      </>
    );
  }

  if (summaryQuery.isPending) {
    return (
      <>
        <PageHeader title="Direktor paneli" description="Butun markaz holati bitta sahifada" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const data = summaryQuery.data;
  const { today, month } = data;
  const pendingLessons = Math.max(today.lessons - today.markedLessons, 0);

  return (
    <>
      <PageHeader
        title="Direktor paneli"
        description={`${month.label} · ${formatDate(today.date)} holatiga ko‘ra`}
        documentTitle="Direktor paneli"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buildKpis(data).map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      {data.attention.length > 0 && (
        <Card className="mt-4">
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
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Bugun</CardTitle>
            <span className="text-xs text-fg-muted">{formatDate(today.date)}</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <TodayRow label="Yangi leadlar" value={formatNumber(today.newLeads)} />
              <TodayRow label="Yangi o‘quvchilar" value={formatNumber(today.newStudents)} />
              <TodayRow label="Sinov darslari" value={formatNumber(today.trialLessons)} />
              <TodayRow
                label="Darslar"
                value={`${formatNumber(today.markedLessons)} / ${formatNumber(today.lessons)}`}
                hint={pendingLessons > 0 ? `${pendingLessons} ta belgilanmagan` : 'hammasi belgilangan'}
              />
              <TodayRow label="Davomat" value={`${today.attendanceRate}%`} hint={`${formatNumber(today.absentStudents)} yo‘q`} />
              <TodayRow label="To‘lovlar" value={formatMoney(today.payments)} />
              <TodayRow label="Xarajatlar" value={formatMoney(today.expenses)} />
              <TodayRow label="Sof tushum" value={formatMoney(today.netRevenue)} />
              <TodayRow
                label="Faol guruh / o‘qituvchi"
                value={`${formatNumber(today.activeGroups)} / ${formatNumber(today.activeTeachers)}`}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
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
                    tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}mln`}
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
                  <Bar dataKey="revenue" name="Tushum" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expense" name="Xarajat" fill={COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="profit" name="Sof foyda" stroke={COLORS.profit} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{month.label} yakunlari</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <div className="divide-y divide-border">
            <TodayRow label="Umumiy tushum" value={formatMoney(month.revenue)} />
            <TodayRow label="Umumiy xarajat" value={formatMoney(month.expense)} />
            <TodayRow label="Sof foyda" value={formatMoney(month.netProfit)} hint={`${month.margin}%`} />
            <TodayRow label="Hisoblangan maosh" value={formatMoney(month.salaryAccrued)} />
          </div>
          <div className="divide-y divide-border">
            <TodayRow label="Yangi leadlar" value={formatNumber(month.newLeads)} />
            <TodayRow label="Sotuvlar" value={formatNumber(month.wonLeads)} />
            <TodayRow label="Konversiya" value={`${month.conversionRate}%`} />
            <TodayRow label="Qarzdorlik" value={formatMoney(month.totalDebt)} />
          </div>
          <div className="divide-y divide-border">
            <TodayRow label="Yangi o‘quvchilar" value={formatNumber(month.newStudents)} />
            <TodayRow label="Ketgan o‘quvchilar" value={formatNumber(month.droppedStudents)} />
            <TodayRow label="Faol o‘quvchilar" value={formatNumber(month.activeStudents)} />
            <TodayRow label="Davomat" value={`${month.attendanceRate}%`} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
