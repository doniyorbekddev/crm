import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { commissionService } from '@/services/commission.service';
import type { SalaryPeriod } from '@/types/teacher';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { ADJUSTMENT_CATEGORY_LABELS } from '@/utils/teacherLabels';

interface Line {
  key: string;
  label: string;
  /** Formula: "4 500 000 so'm × 30%" */
  formula?: string;
  hint?: string;
  amount: number;
}

/** O'qituvchi foizi guruhlar bo'yicha: har guruh to'lovlari × foiz; qaytarish va ko'chgan qoldiq alohida qator */
function useTeacherGroupLines(period: SalaryPeriod): { lines: Line[]; loading: boolean } {
  const enabled = period.payee.type === 'TEACHER' && period.percentageAmount !== 0;
  const params = { year: period.year, month: period.month };
  const query = useQuery({
    queryKey: queryKeys.commissions.detail(period.payee.id, params),
    queryFn: () => commissionService.detail(period.payee.id, params),
    enabled,
  });
  if (!enabled) return { lines: [], loading: false };
  if (!query.data) return { lines: [], loading: query.isPending };

  const groups = new Map<string, { name: string; base: number; amount: number; percentage: number; payments: number }>();
  let reversals = 0;
  let reversalCount = 0;
  let carry = 0;
  for (const entry of query.data.entries) {
    if (entry.kind === 'ACCRUAL') {
      const key = entry.payment?.group?.id ?? 'none';
      const row = groups.get(key) ?? { name: entry.payment?.group?.name ?? 'Guruhsiz to‘lovlar', base: 0, amount: 0, percentage: entry.percentage, payments: 0 };
      groups.set(key, { ...row, base: row.base + entry.baseAmount, amount: row.amount + entry.amount, payments: row.payments + 1 });
    } else if (entry.kind === 'REVERSAL') {
      reversals += entry.amount;
      reversalCount += 1;
    } else {
      carry += entry.amount;
    }
  }
  const lines: Line[] = [...groups.entries()].map(([key, row]) => ({
    key: `group-${key}`,
    label: `${row.name} guruhi`,
    formula: `${formatMoney(row.base)} × ${formatNumber(row.percentage)}%`,
    hint: `${formatNumber(row.payments)} ta to‘lov`,
    amount: row.amount,
  }));
  if (reversalCount > 0) {
    lines.push({ key: 'reversals', label: 'Bekor qilingan va qaytarilgan to‘lovlar', hint: `${formatNumber(reversalCount)} ta yozuv — foizi ayiriladi`, amount: reversals });
  }
  if (carry !== 0) lines.push({ key: 'carry', label: 'O‘tgan oydan ko‘chgan qoldiq', amount: carry });
  return { lines, loading: false };
}

/**
 * "Hisobni ko'rish": maosh qanday hosil bo'lgani — har qator manbasi va formulasi bilan, oxirida jami.
 * Raqamlar hisoblangan maosh yozuvidan; o'qituvchi foizi to'lov yozuvlaridan guruhlab ko'rsatiladi.
 */
export function CalculationBreakdown({ period }: { period: SalaryPeriod }) {
  const teacher = useTeacherGroupLines(period);
  const kpi = period.kpiDetails;
  const lines: Line[] = [];

  if (period.baseAmount !== 0) {
    lines.push({
      key: 'base',
      label: period.payee.type === 'TEACHER' ? 'Asosiy maosh' : 'Belgilangan maosh',
      ...(period.warnings.find((warning) => warning.includes('kun ishlagan')) ? { hint: period.warnings.find((warning) => warning.includes('kun ishlagan'))! } : {}),
      amount: period.baseAmount,
    });
  }
  if (period.lessonAmount !== 0) {
    lines.push({
      key: 'lessons',
      label: 'O‘tilgan darslar',
      ...(period.lessonsCount > 0 ? { formula: `${formatNumber(period.lessonsCount)} dars × ${formatMoney(Math.round(period.lessonAmount / period.lessonsCount))}` } : {}),
      amount: period.lessonAmount,
    });
  }
  if (period.studentAmount !== 0) {
    lines.push({
      key: 'students',
      label: 'Faol o‘quvchilar',
      ...(period.studentsCount > 0 ? { formula: `${formatNumber(period.studentsCount)} o‘quvchi × ${formatMoney(Math.round(period.studentAmount / period.studentsCount))}` } : {}),
      amount: period.studentAmount,
    });
  }
  if (period.percentageAmount !== 0) {
    if (teacher.lines.length > 0) lines.push(...teacher.lines);
    else
      lines.push({
        key: 'percentage',
        label: 'Tushumdan ulush',
        formula: `${formatMoney(period.groupRevenue)} × ${formatNumber(period.commissionRate)}%`,
        amount: period.percentageAmount,
      });
  }
  if (kpi && (kpi.results.length > 0 || kpi.pool > 0)) {
    const reason =
      kpi.bonus > 0
        ? undefined
        : !kpi.configValid
          ? 'KPI sozlamasi to‘liq emas — bonus hisoblanmadi'
          : kpi.achievement === null
            ? 'KPI uchun ma’lumot yo‘q'
            : kpi.achievement < kpi.threshold
              ? `Bajarilish ${formatNumber(kpi.achievement)}% — chegara ${formatNumber(kpi.threshold)}% dan past`
              : kpi.pool === 0
                ? 'KPI bonus fondi belgilanmagan'
                : undefined;
    lines.push({
      key: 'kpi',
      label: 'KPI bonusi',
      ...(kpi.achievement !== null ? { formula: `${formatMoney(kpi.pool)} × ${formatNumber(kpi.achievement)}%` } : {}),
      ...(reason ? { hint: reason } : {}),
      amount: period.kpiBonus,
    });
  }
  if (period.modelBonus !== 0) lines.push({ key: 'model-bonus', label: 'Maosh modelidagi oylik bonus', amount: period.modelBonus });
  for (const adjustment of period.adjustments.filter((item) => !item.voidedAt)) {
    lines.push({
      key: adjustment.id,
      label: `${adjustment.type === 'BONUS' ? 'Bonus' : 'Jarima'} · ${ADJUSTMENT_CATEGORY_LABELS[adjustment.category]}`,
      hint: `${adjustment.reason} · ${formatDate(adjustment.date)}${adjustment.approvedBy ? '' : ' · tasdiqlanmagan'}`,
      amount: adjustment.type === 'BONUS' ? adjustment.amount : -adjustment.amount,
    });
  }

  const formula =
    period.payee.type === 'TEACHER'
      ? 'Guruhlar ulushi + asosiy maosh, dars va o‘quvchi stavkasi + bonuslar − jarimalar'
      : 'Belgilangan maosh + KPI bonusi + bonuslar − jarimalar';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hisob-kitob</CardTitle>
        <span className="text-caption text-fg-muted">{period.label}</span>
      </CardHeader>
      <CardContent>
        {teacher.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : (
          <dl className="divide-y divide-border">
            {lines.map((line) => (
              <div key={line.key} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="min-w-0">
                  <span className="block text-body text-fg">{line.label}</span>
                  {line.formula && <span className="block text-caption text-fg-muted tabular-nums">{line.formula}</span>}
                  {line.hint && <span className="block text-caption text-fg-subtle">{line.hint}</span>}
                </dt>
                <dd className={cn('shrink-0 text-body font-medium tabular-nums', line.amount < 0 ? 'text-danger' : 'text-fg')}>
                  {line.amount < 0 ? '−' : ''}
                  {formatMoney(Math.abs(line.amount))}
                </dd>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4 pt-3">
              <dt>
                <span className="block text-body font-semibold text-fg">Jami</span>
                <span className="block text-caption text-fg-subtle">{formula}</span>
              </dt>
              <dd className="shrink-0 text-h2 text-fg tabular-nums">{formatMoney(period.totalAmount)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
