import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { ExportMenu } from '@/components/ExportMenu';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { useExport } from '@/hooks/useExport';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { analyticsService } from '@/services/analytics.service';
import type { AnalyticsRangeParams, ProfitabilityDimension, UnitEconomics } from '@/types/analytics';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

// ---------------------------------------------------------------------
// Davr
// ---------------------------------------------------------------------

type Preset = 'last30' | 'month' | 'previousMonth' | 'quarter' | 'year';

const PRESETS: ReadonlyArray<{ value: Preset; label: string }> = [
  { value: 'last30', label: 'So‘nggi 30 kun' },
  { value: 'month', label: 'Shu oy' },
  { value: 'previousMonth', label: 'O‘tgan oy' },
  { value: 'quarter', label: 'So‘nggi 3 oy' },
  { value: 'year', label: 'So‘nggi 12 oy' },
];

const pad = (value: number) => String(value).padStart(2, '0');
const toDateString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function rangeFor(preset: Preset): Required<AnalyticsRangeParams> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (preset) {
    case 'last30':
      return { from: toDateString(new Date(year, month, today.getDate() - 29)), to: toDateString(today) };
    case 'month':
      return { from: toDateString(new Date(year, month, 1)), to: toDateString(today) };
    case 'previousMonth':
      return { from: toDateString(new Date(year, month - 1, 1)), to: toDateString(new Date(year, month, 0)) };
    case 'quarter':
      return { from: toDateString(new Date(year, month - 2, 1)), to: toDateString(today) };
    case 'year':
      return { from: toDateString(new Date(year, month - 11, 1)), to: toDateString(today) };
  }
}

const DIMENSIONS: ReadonlyArray<{ value: ProfitabilityDimension; label: string; column: string }> = [
  { value: 'course', label: 'Kurslar', column: 'Kurs' },
  { value: 'group', label: 'Guruhlar', column: 'Guruh' },
  { value: 'teacher', label: 'O‘qituvchilar', column: 'O‘qituvchi' },
];

const COHORT_MONTHS = [3, 6, 12] as const;

const moneyOrDash = (value: number | null) => (value === null ? '—' : formatMoney(value));
const signedMoney = (value: number) => (value < 0 ? `−${formatMoney(Math.abs(value))}` : formatMoney(value));

// ---------------------------------------------------------------------
// Bloklar
// ---------------------------------------------------------------------

function Metric({ label, value, hint, tone = 'default' }: { label: string; value: string; hint: string; tone?: 'default' | 'good' | 'bad' }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-semibold tabular-nums sm:text-xl',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'default' && 'text-fg',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    </Card>
  );
}

function UnitEconomicsBlock({ data }: { data: UnitEconomics }) {
  const ratioTone = data.ltvToCac === null ? 'default' : data.ltvToCac >= 3 ? 'good' : data.ltvToCac < 1 ? 'bad' : 'default';
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="CAC — jalb qilish narxi" value={moneyOrDash(data.cac)} hint={`${formatMoney(data.marketingSpend)} reklama / ${formatNumber(data.newStudents)} yangi o‘quvchi`} />
      <Metric label="LTV — o‘quvchi qiymati" value={moneyOrDash(data.ltv)} hint={`${formatNumber(data.payingStudents)} ta to‘lov qilgan o‘quvchi, butun davr`} />
      <Metric
        label="LTV / CAC"
        value={data.ltvToCac === null ? '—' : `${data.ltvToCac}×`}
        hint={data.ltvToCac === null ? 'reklama xarajati yoki yangi o‘quvchi yo‘q' : '3× va undan yuqori — sog‘lom'}
        tone={ratioTone}
      />
      <Metric label="Qoplanish muddati" value={data.paybackMonths === null ? '—' : `${data.paybackMonths} oy`} hint="CAC necha oylik tushumda qaytadi" />
      <Metric label="Lead narxi" value={moneyOrDash(data.costPerLead)} hint={`${formatNumber(data.leads)} lead, ${formatNumber(data.wonLeads)} sotuv`} />
      <Metric label="Oylik ARPU" value={moneyOrDash(data.monthlyArpu)} hint={`so‘nggi 90 kun, ${formatNumber(data.activeStudents)} faol o‘quvchi`} />
      <Metric label="O‘rtacha o‘qish muddati" value={data.avgLifetimeMonths === null ? '—' : `${data.avgLifetimeMonths} oy`} hint="ketgan va yakunlaganlar bo‘yicha" />
      <Metric label="Reklama xarajati" value={formatMoney(data.marketingSpend)} hint={`${formatDate(data.from)} — ${formatDate(data.to)}`} />
    </div>
  );
}

/** 0–100% saqlanish — yashildan qizilga, ikkala mavzuda o‘qiladigan fon */
function retentionStyle(value: number): React.CSSProperties {
  const hue = Math.round((value / 100) * 140);
  return { backgroundColor: `hsl(${hue} 70% 45% / ${0.15 + (value / 100) * 0.35})` };
}

// ---------------------------------------------------------------------
// Sahifa
// ---------------------------------------------------------------------

export default function AnalyticsPage() {
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();
  const [preset, setPreset] = useState<Preset>('quarter');
  const [dimension, setDimension] = useState<ProfitabilityDimension>('course');
  const [months, setMonths] = useState<number>(6);
  const range = rangeFor(preset);

  const unitQuery = useQuery({ queryKey: queryKeys.analytics.unitEconomics(range), queryFn: () => analyticsService.unitEconomics(range) });
  const profitabilityParams = { ...range, dimension };
  const profitabilityQuery = useQuery({
    queryKey: queryKeys.analytics.profitability(profitabilityParams),
    queryFn: () => analyticsService.profitability(profitabilityParams),
    placeholderData: (previous) => previous,
  });
  const cohortQuery = useQuery({
    queryKey: queryKeys.analytics.cohorts(months),
    queryFn: () => analyticsService.cohorts(months),
    placeholderData: (previous) => previous,
  });
  const sourcesQuery = useQuery({ queryKey: queryKeys.analytics.sources(range), queryFn: () => analyticsService.sources(range) });

  const dimensionConfig = DIMENSIONS.find((item) => item.value === dimension) ?? DIMENSIONS[0]!;
  const profitability = profitabilityQuery.data;
  const chartRows = (profitability?.rows ?? [])
    .filter((row) => row.revenue !== 0 || row.teacherCost !== 0)
    .slice(0, 8)
    .map((row) => ({ name: row.name, revenue: row.revenue, cost: row.teacherCost }));

  return (
    <>
      <PageHeader
        title="Analitika"
        description="Unit economics, rentabellik, o‘quvchilar kohortlari va lead manbalari"
        documentTitle="Analitika"
        actions={
          <Select value={preset} onChange={(event) => setPreset(event.target.value as Preset)} aria-label="Davr" wrapperClassName="w-44">
            {PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="space-y-4">
        {unitQuery.isError ? (
          <ErrorState error={unitQuery.error} onRetry={() => void unitQuery.refetch()} />
        ) : unitQuery.data ? (
          <UnitEconomicsBlock data={unitQuery.data} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        )}

        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Rentabellik</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Kesim" className="flex gap-1">
                {DIMENSIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={dimension === item.value}
                    onClick={() => setDimension(item.value)}
                    className={cn(
                      'h-8 rounded-lg px-2.5 text-xs font-medium transition-colors',
                      dimension === item.value
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {canExport && (
                <ExportMenu
                  loading={exporting}
                  disabled={!profitability || profitability.rows.length === 0}
                  onExport={(format) => void runExport('/analytics/profitability/export', profitabilityParams, `rentabellik-${dimension}`, format)}
                />
              )}
            </div>
          </CardHeader>

          {profitabilityQuery.isError ? (
            <CardContent>
              <ErrorState error={profitabilityQuery.error} onRetry={() => void profitabilityQuery.refetch()} />
            </CardContent>
          ) : !profitability ? (
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-border p-4 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-fg-muted">Sof tushum</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-fg">{formatMoney(profitability.totals.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">O‘qituvchi xarajati</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-fg">{formatMoney(profitability.totals.teacherCost + profitability.totals.unallocatedCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Hissa (contribution)</p>
                  <p className={cn('mt-0.5 font-semibold tabular-nums', profitability.totals.contribution < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {signedMoney(profitability.totals.contribution)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Marja</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-fg">{profitability.totals.margin === null ? '—' : `${profitability.totals.margin}%`}</p>
                </div>
              </div>

              {chartRows.length > 0 && (
                <div className="border-b border-border p-4">
                  <div className="w-full text-fg-muted" style={{ height: Math.max(chartRows.length * 44 + 60, 180) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} horizontal={false} />
                        <XAxis type="number" stroke="currentColor" fontSize={11} tickFormatter={(value: number) => `${Math.round((value / 1_000_000) * 10) / 10}mln`} />
                        <YAxis type="category" dataKey="name" stroke="currentColor" fontSize={11} width={120} />
                        <Tooltip
                          contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12, color: 'var(--color-fg)' }}
                          formatter={(value, name) => [formatMoney(typeof value === 'number' ? value : Number(value ?? 0)), String(name ?? '')]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="revenue" name="Sof tushum" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
                        <Bar dataKey="cost" name="O‘qituvchi xarajati" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>{dimensionConfig.column}</TH>
                      <TH className="text-right">Sof tushum</TH>
                      <TH className="text-right">O‘qituvchi xarajati</TH>
                      <TH className="text-right">Hissa</TH>
                      <TH className="text-right">Marja</TH>
                      <TH className="text-right">Faol o‘quvchi</TH>
                      <TH className="text-right">O‘quvchi boshiga</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {profitability.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-fg-muted">
                          Tanlangan davrda ma’lumot yo‘q
                        </td>
                      </tr>
                    ) : (
                      profitability.rows.map((row) => (
                        <TR key={row.id}>
                          <TD>
                            <p className="font-medium whitespace-nowrap text-fg">{row.name}</p>
                            {row.subtitle && <p className="text-xs whitespace-nowrap text-fg-muted">{row.subtitle}</p>}
                          </TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(row.revenue)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{row.teacherCost > 0 ? formatMoney(row.teacherCost) : '—'}</TD>
                          <TD className={cn('text-right font-semibold whitespace-nowrap tabular-nums', row.contribution < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                            {signedMoney(row.contribution)}
                          </TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{row.margin === null ? '—' : `${row.margin}%`}</TD>
                          <TD className="text-right tabular-nums text-fg-muted">{formatNumber(row.activeStudents)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{moneyOrDash(row.revenuePerStudent)}</TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableContainer>
              <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
                O‘qituvchi maoshi kurs va guruhlarga o‘qituvchining shu davrdagi tushum ulushiga qarab taqsimlanadi.
                {profitability.totals.unallocatedCost > 0 &&
                  ` Davrda tushum keltirmagan o‘qituvchilar maoshi (${formatMoney(profitability.totals.unallocatedCost)}) taqsimlanmagan, lekin jami hissadan ayrilgan.`}
              </p>
            </>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>O‘quvchilar kohortlari</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={months} onChange={(event) => setMonths(Number(event.target.value))} aria-label="Kohort oylari" wrapperClassName="w-32">
                  {COHORT_MONTHS.map((value) => (
                    <option key={value} value={value}>
                      {value} oy
                    </option>
                  ))}
                </Select>
                {canExport && (
                  <ExportMenu
                    loading={exporting}
                    disabled={!cohortQuery.data}
                    onExport={(format) => void runExport('/analytics/cohorts/export', { months }, 'kohortlar', format)}
                  />
                )}
              </div>
            </CardHeader>
            {cohortQuery.isError ? (
              <CardContent>
                <ErrorState error={cohortQuery.error} onRetry={() => void cohortQuery.refetch()} />
              </CardContent>
            ) : !cohortQuery.data ? (
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            ) : (
              <>
                <TableContainer>
                  <table className="w-full border-separate border-spacing-0.5 text-xs">
                    <thead>
                      <tr className="text-fg-muted">
                        <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Qo‘shilgan oy</th>
                        <th className="px-2 py-1.5 text-right font-medium">Soni</th>
                        {cohortQuery.data.average.map((_, offset) => (
                          <th key={offset} className="px-1 py-1.5 text-center font-medium whitespace-nowrap">
                            {offset === 0 ? '0-oy' : `+${offset}`}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Boshiga tushum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortQuery.data.rows.map((row) => (
                        <tr key={row.key}>
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap text-fg">{row.label}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-fg">{formatNumber(row.size)}</td>
                          {cohortQuery.data.average.map((_, offset) => {
                            const value = row.retention[offset];
                            return (
                              <td
                                key={offset}
                                className="min-w-11 rounded px-1 py-1.5 text-center tabular-nums text-fg"
                                style={value === null || value === undefined ? undefined : retentionStyle(value)}
                              >
                                {value === undefined ? '' : value === null ? '—' : `${value}%`}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums text-fg-muted">{moneyOrDash(row.revenuePerStudent)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="px-2 py-1.5 text-fg">O‘rtacha</td>
                        <td />
                        {cohortQuery.data.average.map((value, offset) => (
                          <td key={offset} className="px-1 py-1.5 text-center tabular-nums text-fg">
                            {value === null ? '—' : `${value}%`}
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </TableContainer>
                <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
                  Har bir katak — kohortdagi o‘quvchilarning shu oy oxirida hali ketmaganlar ulushi. Yakunlaganlar ketgan hisoblanmaydi.
                </p>
              </>
            )}
          </Card>

          <Card className="min-w-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Lead manbalari</CardTitle>
              {canExport && (
                <ExportMenu
                  loading={exporting}
                  disabled={!sourcesQuery.data || sourcesQuery.data.rows.length === 0}
                  onExport={(format) => void runExport('/analytics/sources/export', range, 'lead-manbalari', format)}
                />
              )}
            </CardHeader>
            {sourcesQuery.isError ? (
              <CardContent>
                <ErrorState error={sourcesQuery.error} onRetry={() => void sourcesQuery.refetch()} />
              </CardContent>
            ) : !sourcesQuery.data ? (
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Manba</TH>
                      <TH className="text-right">Leadlar</TH>
                      <TH className="text-right">Konversiya</TH>
                      <TH className="text-right">O‘quvchilar</TH>
                      <TH className="text-right">Sof tushum</TH>
                      <TH className="text-right">Lead boshiga</TH>
                      <TH className="text-right">Sotuv tezligi</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {sourcesQuery.data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-fg-muted">
                          Tanlangan davrda lead yo‘q
                        </td>
                      </tr>
                    ) : (
                      sourcesQuery.data.rows.map((row) => (
                        <TR key={row.id}>
                          <TD className="font-medium whitespace-nowrap text-fg">{row.name}</TD>
                          <TD className="text-right tabular-nums text-fg">{formatNumber(row.leads)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">
                            {row.conversion}%<span className="ml-1 text-fg-subtle">({formatNumber(row.won)})</span>
                          </TD>
                          <TD className="text-right tabular-nums text-fg-muted">{formatNumber(row.students)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(row.revenue)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{moneyOrDash(row.revenuePerLead)}</TD>
                          <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{row.avgDaysToConvert === null ? '—' : `${row.avgDaysToConvert} kun`}</TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
