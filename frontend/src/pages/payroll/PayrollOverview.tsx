import { AlertTriangle, BadgeCheck, Gauge, HandCoins, PiggyBank, Send, Target, Wallet2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { cn } from '@/lib/cn';
import type { SalaryPeriod, SalaryPeriodStatus, SalarySummary } from '@/types/teacher';
import { formatMoney, formatNumber } from '@/utils/format';
import { SALARY_STATUS_LABELS } from '@/utils/teacherLabels';

/** Oy jarayoni bosqichlari — tartib bo'yicha */
const FLOW: readonly SalaryPeriodStatus[] = ['PENDING', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID'];

interface PayrollOverviewProps {
  summary: SalarySummary | undefined;
  loading: boolean;
  periods: SalaryPeriod[];
  status: SalaryPeriodStatus | '';
  onStatusChange: (status: SalaryPeriodStatus | '') => void;
  warningsOnly: boolean;
  onWarningsOnlyChange: (value: boolean) => void;
  group: string;
  onGroupChange: (group: string) => void;
}

/**
 * Direktor maosh paneli: oy fondi, guruhlar bo'yicha taqsimot, KPI bonuslari, byudjet va tasdiqlash jarayoni.
 * Jarayon bosqichlari va guruh qatorlari bosilganda pastdagi ro'yxat shu bo'yicha filtrlanadi.
 */
export function PayrollOverview({ summary, loading, periods, status, onStatusChange, warningsOnly, onWarningsOnlyChange, group, onGroupChange }: PayrollOverviewProps) {
  const approvedTotal = (summary?.byStatus ?? [])
    .filter((row) => row.status === 'APPROVED' || row.status === 'PARTIALLY_PAID' || row.status === 'PAID')
    .reduce((sum, row) => sum + row.total, 0);
  const budget = summary?.budget ?? null;
  const usage = budget && budget > 0 && summary ? Math.round((summary.accrued / budget) * 100) : null;
  const countOf = (value: SalaryPeriodStatus) => periods.filter((period) => period.status === value).length;
  const withWarnings = periods.filter((period) => period.warnings.length > 0 && !period.lockedAt).length;

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="sm"
          loading={loading}
          title="Oy maosh fondi"
          icon={Wallet2}
          value={formatMoney(summary?.accrued ?? 0)}
          description={summary ? `${formatNumber(summary.periods)} ta xodim · qolgan ${formatMoney(summary.remaining)}` : undefined}
        />
        <StatCard
          size="sm"
          loading={loading}
          title="KPI bonuslari"
          icon={Target}
          tone="primary"
          value={formatMoney(summary?.kpiBonus ?? 0)}
          description="Tasdiqlanmaguncha dastlabki hisob"
        />
        <StatCard
          size="sm"
          loading={loading}
          title="Tasdiqlangan"
          icon={BadgeCheck}
          tone="info"
          value={formatMoney(approvedTotal)}
          description={summary ? `to‘langan ${formatMoney(summary.paid)}` : undefined}
        />
        <StatCard
          size="sm"
          loading={loading}
          title="Byudjet va haqiqiy"
          icon={PiggyBank}
          tone={usage !== null && usage > 100 ? 'danger' : 'success'}
          value={budget === null ? '—' : formatMoney(budget)}
          valueTone={usage !== null && usage > 100 ? 'danger' : 'default'}
          description={
            budget === null ? (
              <Link to="/finance" className="text-primary hover:underline">
                Byudjet belgilanmagan — Moliya bo‘limida
              </Link>
            ) : (
              `hisoblangan ${formatMoney(summary?.accrued ?? 0)} · ${formatNumber(usage ?? 0)}%`
            )
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Oy jarayoni</CardTitle>
            <span className="text-caption text-fg-muted">bosqichni bosing — ro‘yxat filtrlanadi</span>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Maosh tasdiqlash bosqichlari">
              {FLOW.map((step, index) => {
                const count = countOf(step);
                const active = status === step;
                const needsAction = (step === 'CALCULATED' || step === 'UNDER_REVIEW') && count > 0;
                return (
                  <li key={step}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onStatusChange(active ? '' : step)}
                      className={cn(
                        'focus-ring flex h-full w-full flex-col items-start rounded-control border px-3 py-2 text-left transition-colors',
                        active ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-muted',
                      )}
                    >
                      <span className="text-caption text-fg-subtle tabular-nums">{index + 1}</span>
                      <span className={cn('text-h2 tabular-nums', needsAction ? 'text-warning' : 'text-fg')}>{formatNumber(count)}</span>
                      <span className="text-caption text-fg-muted">{SALARY_STATUS_LABELS[step]}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-caption">
              {(summary?.underReview ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <Send className="size-3.5" aria-hidden />
                  {formatNumber(summary?.underReview ?? 0)} ta maosh direktor qarorini kutmoqda
                </span>
              )}
              {withWarnings > 0 && (
                <button
                  type="button"
                  aria-pressed={warningsOnly}
                  onClick={() => onWarningsOnlyChange(!warningsOnly)}
                  className={cn(
                    'focus-ring inline-flex items-center gap-1.5 rounded-chip border px-2 py-1 transition-colors',
                    warningsOnly ? 'border-warning-border bg-warning-subtle text-warning' : 'border-border text-fg-muted hover:text-fg',
                  )}
                >
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {formatNumber(withWarnings)} ta hisobda ogohlantirish
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lavozimlar bo‘yicha</CardTitle>
            <Gauge className="size-4 text-fg-subtle" aria-hidden />
          </CardHeader>
          <CardContent>
            {(summary?.byGroup ?? []).length === 0 ? (
              <p className="text-body text-fg-muted">Bu oy uchun hisob yo‘q</p>
            ) : (
              <ul className="space-y-1">
                {summary!.byGroup.map((row) => {
                  const share = summary!.accrued > 0 ? Math.round((row.total / summary!.accrued) * 100) : 0;
                  const active = group === row.key;
                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onGroupChange(active ? '' : row.key)}
                        className={cn(
                          'focus-ring w-full rounded-control px-2 py-1.5 text-left transition-colors',
                          active ? 'bg-primary-subtle' : 'hover:bg-surface-muted',
                        )}
                      >
                        <span className="flex items-baseline justify-between gap-2 text-body">
                          <span className="truncate text-fg">
                            {row.label} <span className="text-caption text-fg-subtle">· {formatNumber(row.count)}</span>
                          </span>
                          <span className="shrink-0 font-medium text-fg tabular-nums">{formatMoney(row.total)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                          <span className="block h-full rounded-full bg-chart-brand" style={{ width: `${Math.max(share, 2)}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-fg-subtle">
              <HandCoins className="size-3.5" aria-hidden />
              Tizim pul o‘tkazmaydi — to‘lov qilingach qayd etiladi
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
