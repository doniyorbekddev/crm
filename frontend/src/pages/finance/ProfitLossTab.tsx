import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { FinanceRangeParams } from '@/types/finance';
import { formatDate, formatMoney } from '@/utils/format';

const COLORS = { revenue: '#10b981', costs: '#ef4444', profit: '#3354ec' };

/** Manfiy summa "−" belgisi bilan; nol hech qachon "-0" bo‘lib chiqmaydi */
const signedMoney = (value: number) => (value < 0 ? `−${formatMoney(Math.abs(value))}` : formatMoney(Math.abs(value)));

type StatementRow =
  | { kind: 'section'; label: string }
  | { kind: 'line'; label: string; amount: number; share?: number; negative?: boolean }
  | { kind: 'subtotal' | 'total'; label: string; amount: number; margin?: number; previous?: number };

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-fg-subtle">oldingi davr yo‘q</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="size-3.5" aria-hidden />
      {up ? '+' : ''}
      {value}%
    </span>
  );
}

function Kpi({ label, value, hint, change, tone = 'default' }: { label: string; value: number; hint?: string; change?: number | null; tone?: 'default' | 'signed' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums sm:text-xl',
          tone === 'signed' ? (value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : 'text-fg',
        )}
      >
        {signedMoney(value)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {change !== undefined && <ChangeBadge value={change} />}
        {change !== undefined && hint && <span className="text-xs text-fg-subtle" aria-hidden>·</span>}
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </div>
    </Card>
  );
}

/** Foyda va zarar (P&L): sof tushum → yalpi foyda → operatsion xarajatlar → sof foyda (kassa usuli) */
export function ProfitLossTab({ range }: { range: FinanceRangeParams }) {
  const plQuery = useQuery({
    queryKey: queryKeys.finance.profitLoss(range),
    queryFn: () => financeService.profitLoss(range),
  });

  if (plQuery.isPending) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (plQuery.isError) {
    return <ErrorState error={plQuery.error} retrying={plQuery.isFetching} onRetry={() => void plQuery.refetch()} />;
  }

  const data = plQuery.data;
  const rows: StatementRow[] = [
    { kind: 'section', label: 'Tushum' },
    { kind: 'line', label: 'O‘quvchi to‘lovlari', amount: data.revenue.studentPayments },
    ...(data.revenue.refunds > 0 ? [{ kind: 'line' as const, label: 'Qaytarilgan to‘lovlar', amount: data.revenue.refunds, negative: true }] : []),
    ...data.revenue.otherIncome.map((line) => ({ kind: 'line' as const, label: line.name, amount: line.amount, share: line.share })),
    { kind: 'subtotal', label: 'Sof tushum', amount: data.revenue.netRevenue, previous: data.previous.netRevenue },
    { kind: 'section', label: 'Bevosita xarajat' },
    { kind: 'line', label: 'O‘qituvchi maoshi', amount: data.directCosts.teacherSalaries, negative: true },
    { kind: 'subtotal', label: 'Yalpi foyda', amount: data.grossProfit, margin: data.grossMargin, previous: data.previous.grossProfit },
    { kind: 'section', label: 'Operatsion xarajatlar' },
    ...(data.operatingExpenses.lines.length === 0
      ? [{ kind: 'line' as const, label: 'Xarajat yo‘q', amount: 0 }]
      : data.operatingExpenses.lines.map((line) => ({ kind: 'line' as const, label: line.name, amount: line.amount, share: line.share, negative: true }))),
    { kind: 'subtotal', label: 'Jami operatsion xarajat', amount: -data.operatingExpenses.total, previous: -data.previous.operatingExpenses },
    { kind: 'total', label: 'Sof foyda', amount: data.netProfit, margin: data.netMargin, previous: data.previous.netProfit },
  ];

  const chartData = data.months.map((month) => ({
    label: month.label,
    revenue: month.netRevenue,
    costs: month.directCosts + month.operatingExpenses,
    profit: month.netProfit,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Sof tushum" value={data.revenue.netRevenue} change={data.change.netRevenue} hint={data.revenue.refunds > 0 ? `qaytarilgan: ${formatMoney(data.revenue.refunds)}` : undefined} />
        <Kpi label="Yalpi foyda" value={data.grossProfit} change={data.change.grossProfit} hint={`marja ${data.grossMargin}%`} tone="signed" />
        <Kpi label="Operatsion xarajatlar" value={data.operatingExpenses.total} hint={`tushumning ${data.revenue.netRevenue === 0 ? 0 : Math.round((data.operatingExpenses.total / data.revenue.netRevenue) * 100)}%`} />
        <Kpi label="Sof foyda" value={data.netProfit} change={data.change.netProfit} hint={`marja ${data.netMargin}%`} tone="signed" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="min-w-0 xl:col-span-3">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Foyda va zarar hisoboti</CardTitle>
            <span className="text-xs text-fg-muted">
              {formatDate(data.from)} — {formatDate(data.to)}
            </span>
          </CardHeader>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Modda</TH>
                  <TH className="text-right">Joriy davr</TH>
                  <TH className="text-right">Ulush</TH>
                  <TH className="text-right">Oldingi davr</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row, index) => {
                  if (row.kind === 'section') {
                    return (
                      <tr key={`section-${index}`} className="bg-surface-muted">
                        <td colSpan={4} className="px-4 py-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                          {row.label}
                        </td>
                      </tr>
                    );
                  }
                  if (row.kind === 'line') {
                    return (
                      <TR key={`line-${index}`}>
                        <TD className="pl-8 text-fg-muted">{row.label}</TD>
                        <TD className={cn('text-right whitespace-nowrap tabular-nums', row.negative ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                          {row.amount === 0 ? '—' : `${row.negative ? '−' : ''}${formatMoney(row.amount)}`}
                        </TD>
                        <TD className="text-right text-xs whitespace-nowrap tabular-nums text-fg-muted">{row.share !== undefined ? `${row.share}%` : ''}</TD>
                        <TD />
                      </TR>
                    );
                  }
                  const isTotal = row.kind === 'total';
                  return (
                    <TR key={`total-${index}`} className={cn(isTotal && 'bg-brand-50/60 dark:bg-brand-950/40')}>
                      <TD className={cn('font-semibold text-fg', isTotal && 'text-base')}>{row.label}</TD>
                      <TD
                        className={cn(
                          'text-right font-semibold whitespace-nowrap tabular-nums',
                          isTotal && 'text-base',
                          row.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg',
                        )}
                      >
                        {signedMoney(row.amount)}
                      </TD>
                      <TD className="text-right text-xs whitespace-nowrap tabular-nums text-fg-muted">{row.margin !== undefined ? `marja ${String(row.margin).replace('-', '−')}%` : ''}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">
                        {row.previous === undefined ? '' : signedMoney(row.previous)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
          <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
            Kassa usuli: tushum va xarajat pul harakati sanasi bo‘yicha. Qaytarilgan to‘lov tushumdan ayriladi. Oldingi davr:{' '}
            {formatDate(data.previous.from)} — {formatDate(data.previous.to)}.
          </p>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>Oylar kesimida</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full text-fg-muted">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
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
                  <Bar dataKey="revenue" name="Sof tushum" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="costs" name="Xarajatlar" fill={COLORS.costs} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Line type="monotone" dataKey="profit" name="Sof foyda" stroke={COLORS.profit} strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
