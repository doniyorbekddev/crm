import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, LineChart as ChartIcon } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { downloadCsv, toCsv } from '@/lib/csv';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { academicAnalyticsService } from '@/services/academicAnalytics.service';
import type { AcademicDimension, AcademicRow } from '@/types/academicAnalytics';

const DIMENSIONS: Array<{ value: AcademicDimension; label: string }> = [
  { value: 'course', label: 'Kurslar' },
  { value: 'group', label: 'Guruhlar' },
  { value: 'teacher', label: 'O‘qituvchilar' },
  { value: 'topic', label: 'Mavzular' },
  { value: 'homework', label: 'Vazifalar' },
  { value: 'exam', label: 'Imtihonlar' },
  { value: 'student', label: 'O‘quvchilar' },
];

type MetricKey = Exclude<keyof AcademicRow, 'key' | 'label' | 'sublabel' | 'weakTopics'>;

const METRIC_LABELS: Record<MetricKey, string> = {
  students: 'O‘quvchi',
  attendanceRate: 'Davomat',
  homeworkRate: 'Vazifa',
  averageScore: 'O‘rt. ball',
  examAverage: 'Imtihon',
  passRate: 'O‘tganlar',
  mastery: 'O‘zlashtirish',
  progress: 'Progress',
  retention: 'Retention',
  atRisk: 'Xavfda',
  feedback: 'Fikr (1–5)',
  lateRate: 'Kech',
  missedRate: 'Topshirmagan',
  masteredShare: 'O‘zlashtirganlar',
};

/** Kesimga mos ustunlar — ma'nosiz (bo'sh) ustun ko'rsatilmaydi */
const COLUMNS: Record<AcademicDimension, MetricKey[]> = {
  course: ['students', 'attendanceRate', 'homeworkRate', 'averageScore', 'examAverage', 'mastery', 'progress', 'retention', 'atRisk'],
  group: ['students', 'attendanceRate', 'homeworkRate', 'examAverage', 'mastery', 'progress', 'retention', 'atRisk', 'feedback'],
  teacher: ['students', 'attendanceRate', 'homeworkRate', 'examAverage', 'mastery', 'progress', 'retention', 'feedback'],
  topic: ['students', 'mastery', 'masteredShare'],
  homework: ['students', 'homeworkRate', 'averageScore', 'lateRate', 'missedRate'],
  exam: ['students', 'examAverage', 'passRate'],
  student: ['attendanceRate', 'homeworkRate', 'averageScore', 'examAverage', 'mastery', 'progress', 'atRisk'],
};

const COUNT_METRICS: ReadonlySet<MetricKey> = new Set(['students', 'atRisk', 'feedback']);

function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return COUNT_METRICS.has(key) ? String(value) : `${value}%`;
}

function tone(key: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined || COUNT_METRICS.has(key)) return 'text-fg';
  const inverted = key === 'lateRate' || key === 'missedRate';
  const good = inverted ? value <= 10 : value >= 80;
  const bad = inverted ? value >= 30 : value < 60;
  return good ? 'text-emerald-600 dark:text-emerald-400' : bad ? 'text-red-600 dark:text-red-400' : 'text-fg';
}

/**
 * Akademik analitika (TZ §46–49): kesim bo'yicha jadval, taqqoslash grafigi va faqat raqamli
 * kuzatuvlar. Tartib — tanlangan ko'rsatkich bo'yicha saralash (tavsif, baho emas).
 */
export default function AcademicAnalyticsPage() {
  const [dimension, setDimension] = useState<AcademicDimension>('course');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<MetricKey | 'label'>('label');
  const params = { dimension, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const query = useQuery({
    queryKey: queryKeys.academicAnalytics(params),
    queryFn: () => academicAnalyticsService.build(params),
    placeholderData: keepPreviousData,
  });

  const columns = COLUMNS[dimension];
  const chartMetric = columns.find((key) => !COUNT_METRICS.has(key)) ?? 'mastery';
  const rows = [...(query.data?.rows ?? [])].sort((a, b) =>
    sortKey === 'label' ? a.label.localeCompare(b.label) : ((b[sortKey] as number | null) ?? -1) - ((a[sortKey] as number | null) ?? -1),
  );

  const exportCsv = () => {
    if (!query.data) return;
    downloadCsv(
      toCsv(
        ['Nomi', 'Izoh', ...columns.map((key) => METRIC_LABELS[key])],
        rows.map((row) => [row.label, row.sublabel ?? '', ...columns.map((key) => (row[key] as number | null | undefined) ?? '')]),
      ),
      `akademik-${dimension}-${query.data.from}_${query.data.to}.csv`,
    );
  };

  return (
    <div>
      <PageHeader
        title="Akademik analitika"
        description="Davomat, vazifa, imtihon, o‘zlashtirish, progress va retention — kesimlar bo‘yicha"
        actions={
          <Button variant="secondary" leftIcon={<Download className="size-4" aria-hidden />} onClick={exportCsv} disabled={!query.data || rows.length === 0}>
            CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Kesim" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {DIMENSIONS.map((item) => (
            <button
              key={item.value}
              role="tab"
              aria-selected={dimension === item.value}
              className={cn('rounded-md px-3 py-1.5 text-sm', dimension === item.value ? 'bg-brand-600 text-white' : 'text-fg-muted hover:bg-surface-muted')}
              onClick={() => {
                setDimension(item.value);
                setSortKey('label');
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <FormField label="Dan" htmlFor="aa-from">
          <Input id="aa-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </FormField>
        <FormField label="Gacha" htmlFor="aa-to">
          <Input id="aa-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </FormField>
        <FormField label="Saralash" htmlFor="aa-sort">
          <Select id="aa-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as MetricKey | 'label')}>
            <option value="label">Nomi bo‘yicha</option>
            {columns.map((key) => (
              <option key={key} value={key}>
                {METRIC_LABELS[key]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          {query.data && query.data.observations.length > 0 && (
            <Alert tone="info" title="Kuzatuvlar (oldingi teng davr bilan)">
              <ul className="list-disc pl-4">
                {query.data.observations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Alert>
          )}

          {rows.length > 1 && (dimension === 'group' || dimension === 'course' || dimension === 'teacher') && (
            <Card>
              <CardHeader>
                <CardTitle>Taqqoslash: {METRIC_LABELS[chartMetric]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full text-fg-muted" aria-label={`${METRIC_LABELS[chartMetric]} bo‘yicha taqqoslash grafigi`} role="img">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows.map((row) => ({ name: row.label, value: row[chartMetric] }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} vertical={false} />
                      <XAxis dataKey="name" stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} stroke="currentColor" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12, color: 'var(--color-fg)' }}
                        formatter={(value) => [value === null || value === undefined ? '—' : `${String(value)}%`, METRIC_LABELS[chartMetric]]}
                      />
                      <Bar dataKey="value" fill="#3354ec" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            {query.isPending ? (
              <TableSkeleton rows={5} columns={columns.length + 1} />
            ) : rows.length === 0 ? (
              <EmptyState icon={ChartIcon} title="Ma’lumot yo‘q" description="Tanlangan davr va doirada ko‘rsatkich topilmadi" />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Nomi</TH>
                      {columns.map((key) => (
                        <TH key={key} className="text-right">
                          {METRIC_LABELS[key]}
                        </TH>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.key}>
                        <TD>
                          <p className="font-medium text-fg">{row.label}</p>
                          {row.sublabel && <p className="text-xs text-fg-subtle">{row.sublabel}</p>}
                          {row.weakTopics && row.weakTopics.length > 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">Zaif mavzular: {row.weakTopics.map((topic) => `${topic.title} (${topic.mastery}%)`).join(', ')}</p>
                          )}
                        </TD>
                        {columns.map((key) => (
                          <TD key={key} className={cn('text-right tabular-nums', tone(key, row[key] as number | null | undefined))}>
                            {formatMetric(key, row[key] as number | null | undefined)}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </Card>
          {query.data && (
            <p className="text-xs text-fg-subtle">
              Davr: {query.data.from} — {query.data.to}. Foizlar yig‘ma (jami qatnashish / jami belgilar). Tartib faqat tavsif uchun — xulosa emas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
