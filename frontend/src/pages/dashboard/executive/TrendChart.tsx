import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_AXIS, CHART_BAR, CHART_COLORS, CHART_GRID, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, formatMillions } from '@/components/charts/chartTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ExecutiveSummary } from '@/types/dashboard';
import { formatMoney } from '@/utils/format';

/** Oxirgi 6 oy: sof tushum va xarajat (ustun), sof foyda (chiziq) */
export function TrendChart({ trend }: { trend: ExecutiveSummary['trend'] }) {
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>Tushum va xarajat dinamikasi</CardTitle>
        <span className="text-caption text-fg-muted">oxirgi 6 oy</span>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full text-fg-muted">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" {...CHART_AXIS} />
              <YAxis {...CHART_AXIS} tickFormatter={formatMillions} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'var(--color-surface-muted)' }}
                formatter={(value, name) => [formatMoney(typeof value === 'number' ? value : Number(value ?? 0)), String(name ?? '')]}
              />
              <Legend wrapperStyle={CHART_LEGEND_STYLE} />
              <Bar dataKey="revenue" name="Sof tushum" fill={CHART_COLORS.positive} {...CHART_BAR} />
              <Bar dataKey="expense" name="Xarajat" fill={CHART_COLORS.negative} {...CHART_BAR} />
              <Line type="monotone" dataKey="profit" name="Sof foyda" stroke={CHART_COLORS.brand} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
