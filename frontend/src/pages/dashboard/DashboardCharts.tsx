import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_AXIS, CHART_BAR, CHART_COLORS, CHART_GRID, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, chartLegendFormatter } from '@/components/charts/chartTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import type { ChartPeriod } from '@/types/dashboard';
import { formatMoney, formatNumber } from '@/utils/format';

const PERIODS: ReadonlyArray<{ value: ChartPeriod; label: string }> = [
  { value: 'day', label: '14 kun' },
  { value: 'week', label: '8 hafta' },
  { value: 'month', label: '6 oy' },
];

interface DashboardChartsProps {
  showRevenue: boolean;
  /** O'quv ko'rinishi (o'quvchilar o'sishi, davomat trendi) — o'quvchilarni ko'ra oladigan xodimga */
  showAcademy?: boolean;
}

type ChartView = 'sales' | 'academy';

/** Sotuv (leadlar, sotuvlar, tushum) yoki o'quv jarayoni (yangi o'quvchilar, davomat) dinamikasi */
export function DashboardCharts({ showRevenue, showAcademy = false }: DashboardChartsProps) {
  const [period, setPeriod] = useState<ChartPeriod>('day');
  const [view, setView] = useState<ChartView>('sales');
  const academy = showAcademy && view === 'academy';

  const chartsQuery = useQuery({
    queryKey: queryKeys.dashboard.charts(period),
    queryFn: () => dashboardService.charts(period),
  });

  return (
    <Card className="h-full">
      <Tabs value={period} onValueChange={(value) => setPeriod(value as ChartPeriod)} variant="pill">
        <CardHeader className="items-center">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle>Dinamika</CardTitle>
            {showAcademy && (
              <Select value={view} onChange={(event) => setView(event.target.value as ChartView)} aria-label="Grafik turi" wrapperClassName="w-40">
                <option value="sales">Sotuv</option>
                <option value="academy">O‘quv jarayoni</option>
              </Select>
            )}
          </div>
          <TabList label="Davr">
            {PERIODS.map((item) => (
              <Tab key={item.value} value={item.value}>
                {item.label}
              </Tab>
            ))}
          </TabList>
        </CardHeader>
        <CardContent>
          <TabPanel value={period}>
            {chartsQuery.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : chartsQuery.isError ? (
              <ErrorState error={chartsQuery.error} retrying={chartsQuery.isFetching} onRetry={() => void chartsQuery.refetch()} />
            ) : (
              <div className="h-72 w-full text-fg-muted">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartsQuery.data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis dataKey="label" {...CHART_AXIS} />
                    <YAxis yAxisId="left" {...CHART_AXIS} allowDecimals={false} />
                    {academy && <YAxis yAxisId="right" orientation="right" {...CHART_AXIS} domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} />}
                    {!academy && showRevenue && (
                      <YAxis yAxisId="right" orientation="right" {...CHART_AXIS} tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}mln`} />
                    )}
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ fill: 'var(--color-surface-muted)' }}
                      formatter={(value, name) => {
                        const amount = typeof value === 'number' ? value : Number(value ?? 0);
                        const label = String(name ?? '');
                        return [label === 'Tushum' ? formatMoney(amount) : label === 'Davomat' ? `${amount}%` : formatNumber(amount), label];
                      }}
                    />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} formatter={chartLegendFormatter} />
                    {academy && <Bar yAxisId="left" dataKey="students" name="Yangi o‘quvchilar" fill={CHART_COLORS.brand} {...CHART_BAR} />}
                    {/* Dars belgilanmagan kunlarda nuqta yo'q — chiziq uzilmaydi (connectNulls), lekin 0% deb ko'rsatilmaydi */}
                    {academy && (
                      <Line yAxisId="right" type="monotone" dataKey="attendanceRate" name="Davomat" stroke={CHART_COLORS.positive} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    )}
                    {!academy && <Bar yAxisId="left" dataKey="leads" name="Yangi leadlar" fill={CHART_COLORS.brand} {...CHART_BAR} />}
                    {!academy && <Bar yAxisId="left" dataKey="won" name="Sotildi" fill={CHART_COLORS.positive} {...CHART_BAR} />}
                    {!academy && showRevenue && (
                      <Line yAxisId="right" type="monotone" dataKey="revenue" name="Tushum" stroke={CHART_COLORS.warning} strokeWidth={2} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabPanel>
        </CardContent>
      </Tabs>
    </Card>
  );
}
