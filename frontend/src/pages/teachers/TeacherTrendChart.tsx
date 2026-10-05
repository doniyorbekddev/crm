import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_AXIS, CHART_BAR, CHART_COLORS, CHART_GRID, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, chartLegendFormatter } from '@/components/charts/chartTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';

const MONTHS = 6;
const PERCENT_SERIES = new Set(['Davomat', 'Vazifa topshirilishi', 'Imtihon o‘rtachasi']);

/** Oxirgi 6 oy dinamikasi: o'tkazilgan darslar (ustun) va foizli ko'rsatkichlar (chiziq). Ma'lumotsiz oyda nuqta yo'q. */
export function TeacherTrendChart({ teacherId }: { teacherId: string }) {
  const query = useQuery({
    queryKey: queryKeys.teachers.performanceHistory(teacherId, MONTHS),
    queryFn: () => teachersService.performanceHistory(teacherId, MONTHS),
  });
  const hasData = (query.data ?? []).some((point) => point.lessonsHeld > 0 || point.attendanceRate !== null || point.homework > 0 || point.exams > 0);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Oxirgi {MONTHS} oy dinamikasi</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
        ) : !hasData ? (
          <EmptyState size="sm" icon={BarChart3} title="Dinamika uchun ma’lumot yo‘q" description="Darslar, vazifalar yoki imtihonlar qayd etilgach grafik chiziladi" />
        ) : (
          <div className="h-64 w-full text-fg-muted">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={query.data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" {...CHART_AXIS} tickFormatter={(value: string) => value.split(' ').at(-1) ?? value} />
                <YAxis yAxisId="left" {...CHART_AXIS} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" {...CHART_AXIS} domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'var(--color-surface-muted)' }}
                  formatter={(value, name) => [PERCENT_SERIES.has(String(name)) ? `${String(value)}%` : String(value), String(name)]}
                />
                <Legend wrapperStyle={CHART_LEGEND_STYLE} formatter={chartLegendFormatter} />
                <Bar yAxisId="left" dataKey="lessonsHeld" name="O‘tkazilgan darslar" fill={CHART_COLORS.neutral} {...CHART_BAR} />
                <Line yAxisId="right" type="monotone" dataKey="attendanceRate" name="Davomat" stroke={CHART_COLORS.positive} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="homeworkCompletionRate" name="Vazifa topshirilishi" stroke={CHART_COLORS.brand} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="examAveragePercent" name="Imtihon o‘rtachasi" stroke={CHART_COLORS.warning} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
