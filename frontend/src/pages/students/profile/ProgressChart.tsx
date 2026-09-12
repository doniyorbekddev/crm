import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProgressPoint } from '@/types/studentProfile';

/** Grafik ranglari — ikkala mavzuda ham o‘qiladigan to‘q ranglar */
const COLORS = { attendance: '#10b981', homework: '#3354ec', exam: '#f59e0b' };

export function ProgressChart({ data }: { data: ProgressPoint[] }) {
  const hasData = data.some((point) => point.attendanceRate !== null || point.homeworkRate !== null || point.examAverage !== null);
  if (!hasData) {
    return <p className="py-16 text-center text-sm text-fg-muted">Oxirgi 6 oyda baholangan faoliyat yo‘q</p>;
  }

  return (
    <div className="h-64 w-full text-fg-muted">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} vertical={false} />
          <XAxis dataKey="label" stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            domain={[0, 100]}
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--color-fg)',
            }}
            formatter={(value, name) => [value === null || value === undefined ? '—' : `${String(value)}%`, String(name ?? '')]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="attendanceRate" name="Davomat" stroke={COLORS.attendance} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          <Line type="monotone" dataKey="homeworkRate" name="Uy vazifasi" stroke={COLORS.homework} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          <Line type="monotone" dataKey="examAverage" name="Imtihon" stroke={COLORS.exam} strokeWidth={2} connectNulls dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
