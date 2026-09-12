import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import type { ChartPeriod } from '@/types/dashboard';
import { formatMoney, formatNumber } from '@/utils/format';

const PERIODS: ReadonlyArray<{ value: ChartPeriod; label: string }> = [
  { value: 'day', label: '14 kun' },
  { value: 'week', label: '8 hafta' },
  { value: 'month', label: '6 oy' },
];

/** Grafik ranglari — ikkala mavzuda ham o‘qiladigan to‘q ranglar */
const COLORS = { leads: '#3354ec', won: '#10b981', revenue: '#f59e0b' };

interface DashboardChartsProps {
  showRevenue: boolean;
}

export function DashboardCharts({ showRevenue }: DashboardChartsProps) {
  const [period, setPeriod] = useState<ChartPeriod>('day');

  const chartsQuery = useQuery({
    queryKey: queryKeys.dashboard.charts(period),
    queryFn: () => dashboardService.charts(period),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Dinamika</CardTitle>
        <div role="tablist" aria-label="Davr" className="flex gap-1">
          {PERIODS.map((item) => {
            const active = period === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(item.value)}
                className={cn(
                  'h-8 rounded-lg px-2.5 text-xs font-medium transition-colors',
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
      </CardHeader>
      <CardContent>
        {chartsQuery.isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : chartsQuery.isError ? (
          <ErrorState error={chartsQuery.error} retrying={chartsQuery.isFetching} onRetry={() => void chartsQuery.refetch()} />
        ) : (
          <div className="h-72 w-full text-fg-muted">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartsQuery.data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} vertical={false} />
                <XAxis dataKey="label" stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                {showRevenue && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="currentColor"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}mln`}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: 'var(--color-fg)',
                  }}
                  formatter={(value, name) => {
                    const amount = typeof value === 'number' ? value : Number(value ?? 0);
                    const label = String(name ?? '');
                    return [label === 'Tushum' ? formatMoney(amount) : formatNumber(amount), label];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="leads" name="Yangi leadlar" fill={COLORS.leads} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="left" dataKey="won" name="Sotildi" fill={COLORS.won} radius={[4, 4, 0, 0]} maxBarSize={28} />
                {showRevenue && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    name="Tushum"
                    stroke={COLORS.revenue}
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
