import { AlertTriangle, ArrowRight, CircleCheck, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ExecutiveSummary } from '@/types/dashboard';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { ProgressBar, StatRow } from '../parts';

/** Avtomatik xulosalar: oldingi davr bilan solishtirish natijalari (matn backenddan) */
export function InsightsCard({ data }: { data: ExecutiveSummary }) {
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>Xulosalar</CardTitle>
        <span className="text-caption text-fg-muted">
          {formatDate(data.period.previousFrom)} — {formatDate(data.period.previousTo)} bilan
        </span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {data.insights.map((insight) => {
            const Icon = insight.tone === 'negative' ? AlertTriangle : insight.tone === 'positive' ? CircleCheck : Info;
            return (
              <li key={insight.key} className="flex items-start gap-2.5 text-body">
                <Icon
                  className={cn('mt-0.5 size-4 shrink-0', insight.tone === 'negative' ? 'text-danger' : insight.tone === 'positive' ? 'text-success' : 'text-fg-subtle')}
                  aria-hidden
                />
                <span className="text-fg">{insight.text}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function ForecastItem({ label, value, hint, valueClassName }: { label: string; value: string; hint?: string; valueClassName?: string }) {
  return (
    <div>
      <p className="text-caption font-medium text-fg-muted">{label}</p>
      <p className={cn('mt-1 text-h3 text-fg tabular-nums', valueClassName)}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Joriy oy uchun: hozirgi sur'at bo'yicha oy oxiri va reja bajarilishi */
export function ForecastCard({ forecast }: { forecast: NonNullable<ExecutiveSummary['forecast']> }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>Oy oxiri prognozi</CardTitle>
        <span className="text-caption text-fg-muted tabular-nums">
          {forecast.daysElapsed} / {forecast.daysInMonth} kun o‘tdi
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar size="sm" percent={Math.round((forecast.daysElapsed / forecast.daysInMonth) * 100)} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ForecastItem label="Kutilayotgan tushum" value={formatMoney(forecast.projectedRevenue)} hint="hozirgi sur’at bo‘yicha" />
          <ForecastItem label="Kutilayotgan xarajat" value={formatMoney(forecast.projectedExpense)} hint={`shundan to‘lanmagan: ${formatMoney(forecast.upcomingExpenses)}`} />
          <ForecastItem
            label="Kutilayotgan foyda"
            value={`${forecast.projectedProfit < 0 ? '−' : ''}${formatMoney(Math.abs(forecast.projectedProfit))}`}
            valueClassName={forecast.projectedProfit >= 0 ? 'text-success' : 'text-danger'}
          />
          <div>
            <p className="text-caption font-medium text-fg-muted">Tushum rejasi</p>
            {forecast.targetProgress === null ? (
              <p className="mt-1 text-body text-fg-muted">
                Reja belgilanmagan ·{' '}
                <Link to="/targets" className="focus-ring rounded-sm font-medium text-primary hover:underline">
                  belgilash
                </Link>
              </p>
            ) : (
              <>
                <p className="mt-1 mb-1.5 text-h3 text-fg tabular-nums">{forecast.targetProgress}%</p>
                <ProgressBar
                  size="sm"
                  percent={forecast.targetProgress}
                  className={forecast.targetProgress >= 100 ? 'bg-chart-positive' : forecast.targetProgress >= 80 ? 'bg-chart-warning' : 'bg-chart-negative'}
                />
                <p className="mt-1 text-caption text-fg-muted">reja: {formatMoney(forecast.revenueTarget)}</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Darhol e'tibor talab qiladigan sonlar (kechikkan to'lov, belgilanmagan dars …) */
export function AttentionCard({ items }: { items: ExecutiveSummary['attention'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diqqat talab qiladi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 p-4">
        {items.map((item) => {
          const className = cn(
            'inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-body',
            item.tone === 'danger' ? 'border-danger-border bg-danger-subtle text-danger' : 'border-warning-border bg-warning-subtle text-warning',
          );
          const content = (
            <>
              <AlertTriangle className="size-3.5" aria-hidden />
              {item.label}
              <strong className="tabular-nums">{formatNumber(item.value)}</strong>
            </>
          );
          // Chip — shu holat ro'yxatiga olib boradigan havola (server filtrli manzilni beradi)
          return item.link ? (
            <Link key={item.key} to={item.link} className={cn(className, 'focus-ring transition-colors hover:brightness-95')}>
              {content}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <span key={item.key} className={className}>
              {content}
            </span>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Bugungi kun ko'rsatkichlari */
export function TodayCard({ today }: { today: ExecutiveSummary['today'] }) {
  const pendingLessons = Math.max(today.lessons - today.markedLessons, 0);
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>Bugun</CardTitle>
        <span className="text-caption text-fg-muted">{formatDate(today.date)}</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          <StatRow label="Yangi leadlar" value={formatNumber(today.newLeads)} />
          <StatRow label="Yangi o‘quvchilar" value={formatNumber(today.newStudents)} />
          <StatRow label="Sinov darslari" value={formatNumber(today.trialLessons)} />
          <StatRow
            label="Darslar"
            value={`${formatNumber(today.markedLessons)} / ${formatNumber(today.lessons)}`}
            hint={pendingLessons > 0 ? `${pendingLessons} ta belgilanmagan` : 'hammasi belgilangan'}
          />
          <StatRow label="Davomat" value={`${today.attendanceRate}%`} hint={`${formatNumber(today.absentStudents)} yo‘q`} />
          <StatRow label="To‘lovlar" value={formatMoney(today.payments)} />
          <StatRow label="Xarajatlar" value={formatMoney(today.expenses)} />
          <StatRow label="Sof tushum" value={formatMoney(today.netRevenue)} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Tanlangan davr yakunlari — oldingi davr bilan yonma-yon */
export function PeriodSummaryCard({ data }: { data: ExecutiveSummary }) {
  const { month, previous } = data;
  const periodName = data.period.kind === 'range' ? 'Oraliq' : month.label;
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>{periodName} yakunlari</CardTitle>
        <span className="text-caption text-fg-muted">
          {formatDate(data.period.from)} — {formatDate(data.period.to)}
        </span>
      </CardHeader>
      <CardContent className="grid p-0 sm:grid-cols-2 sm:divide-x sm:divide-border lg:grid-cols-3">
        <div className="divide-y divide-border">
          <StatRow label="Sof tushum" value={formatMoney(month.revenue)} hint={`oldin: ${formatMoney(previous.revenue)}`} />
          <StatRow label="Xarajat" value={formatMoney(month.expense)} hint={`oldin: ${formatMoney(previous.expense)}`} />
          <StatRow label="Sof foyda" value={formatMoney(month.netProfit)} hint={`${month.margin}%`} />
          <StatRow label="Hisoblangan maosh" value={formatMoney(month.salaryAccrued)} />
        </div>
        <div className="divide-y divide-border border-t border-border sm:border-t-0">
          <StatRow label="Yangi leadlar" value={formatNumber(month.newLeads)} hint={`oldin: ${formatNumber(previous.newLeads)}`} />
          <StatRow label="Sotuvlar" value={formatNumber(month.wonLeads)} hint={`oldin: ${formatNumber(previous.wonLeads)}`} />
          <StatRow label="Konversiya" value={`${month.conversionRate}%`} />
          <StatRow label="Qarzdorlik" value={formatMoney(month.totalDebt)} />
        </div>
        <div className="divide-y divide-border border-t border-border lg:border-t-0">
          <StatRow label="Yangi o‘quvchilar" value={formatNumber(month.newStudents)} hint={`oldin: ${formatNumber(previous.newStudents)}`} />
          <StatRow label="Ketgan o‘quvchilar" value={formatNumber(month.droppedStudents)} hint={`oldin: ${formatNumber(previous.droppedStudents)}`} />
          <StatRow label="Faol o‘quvchilar" value={formatNumber(month.activeStudents)} />
          <StatRow label="Davomat" value={month.attendanceMarks > 0 ? `${month.attendanceRate}%` : '—'} />
        </div>
      </CardContent>
    </Card>
  );
}
