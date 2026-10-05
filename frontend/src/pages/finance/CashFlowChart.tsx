import { CHART_LEGEND_STYLE, chartLegendFormatter } from '@/components/charts/chartTheme';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { useQuery } from '@tanstack/react-query';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { CashFlowParams, CashFlowPeriod, FinanceRangeParams } from '@/types/finance';
import { formatMoney } from '@/utils/format';
import { CASH_FLOW_PERIODS } from '@/utils/financeLabels';

/** Grafik ranglari — ikkala mavzuda ham o‘qiladigan to‘q ranglar */
const COLORS = { income: 'var(--color-chart-positive)', expense: 'var(--color-chart-negative)', balance: 'var(--color-chart-brand)' };

interface CashFlowChartProps {
  range: FinanceRangeParams;
  period: CashFlowPeriod;
  onPeriodChange: (period: CashFlowPeriod) => void;
}

export function CashFlowChart({ range, period, onPeriodChange }: CashFlowChartProps) {
  const params: CashFlowParams = { ...range, period };
  const cashFlowQuery = useQuery({
    queryKey: queryKeys.finance.cashFlow(params),
    queryFn: () => financeService.cashFlow(params),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Pul oqimi</CardTitle>
        <Tabs value={period} onValueChange={(value) => onPeriodChange(value as typeof period)} variant="pill" panels={false}>
          <TabList label="Davr">
            {CASH_FLOW_PERIODS.map((item) => (
              <Tab key={item.value} value={item.value}>
                {item.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {cashFlowQuery.isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : cashFlowQuery.isError ? (
          <ErrorState error={cashFlowQuery.error} retrying={cashFlowQuery.isFetching} onRetry={() => void cashFlowQuery.refetch()} />
        ) : cashFlowQuery.data.length === 0 ? (
          <p className="py-16 text-center text-body text-fg-muted">Tanlangan davrda moliyaviy harakat bo‘lmagan</p>
        ) : (
          <div className="h-72 w-full text-fg-muted">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlowQuery.data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="cash-flow-balance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.balance} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COLORS.balance} stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: 'var(--color-fg)',
                  }}
                  formatter={(value, name) => [formatMoney(typeof value === 'number' ? value : Number(value ?? 0)), String(name ?? '')]}
                />
                <Legend wrapperStyle={CHART_LEGEND_STYLE} formatter={chartLegendFormatter} />
                <Area
                  type="monotone"
                  dataKey="cashBalance"
                  name="Kassadagi qoldiq"
                  stroke={COLORS.balance}
                  strokeWidth={2}
                  fill="url(#cash-flow-balance)"
                />
                <Line type="monotone" dataKey="income" name="Tushum" stroke={COLORS.income} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" name="Xarajat" stroke={COLORS.expense} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
