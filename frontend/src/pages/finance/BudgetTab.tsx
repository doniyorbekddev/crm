import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Save } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { BudgetLine } from '@/types/finance';
import { BUDGET_STATUS_LABELS, BUDGET_STATUS_TONES } from '@/utils/financeLabels';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { MONTH_OPTIONS } from '@/utils/teacherLabels';

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

const COLORS = { planned: '#94a3b8', actual: '#3354ec', over: '#ef4444' };

/** Bajarilishga qarab progress rangi */
function usageTone(line: BudgetLine): string {
  if (line.status === 'OVER' || line.status === 'UNPLANNED') return 'bg-red-500';
  if (line.status === 'WARNING') return 'bg-amber-500';
  if (line.status === 'OK') return 'bg-emerald-500';
  return 'bg-slate-300 dark:bg-slate-600';
}

/** Y o‘qi uchun qisqa summa: 5 000 000 → "5 mln" */
function shortMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10} mln`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} ming`;
  return String(value);
}

function Summary({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'danger' | 'success'; hint?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-semibold tabular-nums sm:text-lg',
          tone === 'danger' && 'text-red-600 dark:text-red-400',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'default' && 'text-fg',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Oylik budjet: reja va fakt, farq, bajarilish foizi va grafik (promt 23–24-bo‘limlar) */
export function BudgetTab() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.BUDGET_MANAGE);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  /** Faqat qo‘lda o‘zgartirilgan qatorlar; qolganlari serverdagi rejadan ko‘rsatiladi */
  const [draft, setDraft] = useState<Record<string, string>>({});

  const budgetQuery = useQuery({
    queryKey: queryKeys.finance.budget({ year, month }),
    queryFn: () => financeService.budget({ year, month }),
  });

  const budget = budgetQuery.data;
  const plannedOf = (line: BudgetLine): number => Number(draft[line.categoryId] ?? line.planned ?? 0);

  /** Oy almashganda tahrirlar bekor qilinadi — yangi oyning rejasi ko‘rsatiladi */
  const changePeriod = (apply: () => void) => {
    apply();
    setDraft({});
  };

  const refresh = () => {
    setDraft({});
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  };

  const save = useMutation({
    mutationFn: () =>
      financeService.saveBudget({
        year,
        month,
        lines: (budget?.lines ?? []).map((line) => ({ categoryId: line.categoryId, plannedAmount: plannedOf(line) })),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const copy = useMutation({
    mutationFn: () => financeService.copyBudget({ year, month }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const lines = budget?.lines ?? [];
  const plannedTotal = lines.reduce((sum, line) => sum + plannedOf(line), 0);
  const difference = (budget?.totalActual ?? 0) - plannedTotal;
  const chartData = lines
    .filter((line) => plannedOf(line) > 0 || line.actual > 0)
    .map((line) => ({ name: line.categoryName, planned: plannedOf(line), actual: line.actual, over: line.actual > plannedOf(line) }));
  const hasDraft = Object.keys(draft).length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Oylik budjet</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={month}
              onChange={(event) => changePeriod(() => setMonth(Number(event.target.value)))}
              aria-label="Oy"
              wrapperClassName="w-36"
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={year}
              onChange={(event) => changePeriod(() => setYear(Number(event.target.value)))}
              aria-label="Yil"
              wrapperClassName="w-28"
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            {canManage && budget && budget.totalPlanned === 0 && !hasDraft && (
              <Button variant="secondary" leftIcon={<Copy className="size-4" aria-hidden />} loading={copy.isPending} onClick={() => copy.mutate()}>
                O‘tgan oydan nusxa
              </Button>
            )}
            {canManage && (
              <Button leftIcon={<Save className="size-4" aria-hidden />} loading={save.isPending} disabled={!hasDraft} onClick={() => save.mutate()}>
                Saqlash
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {budgetQuery.isPending ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : budgetQuery.isError ? (
            <ErrorState error={budgetQuery.error} onRetry={() => void budgetQuery.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Summary label="Reja" value={formatMoney(plannedTotal)} />
              <Summary
                label="Fakt"
                value={formatMoney(budget?.totalActual ?? 0)}
                hint={plannedTotal > 0 ? `${Math.round(((budget?.totalActual ?? 0) / plannedTotal) * 100)}% bajarildi` : undefined}
              />
              <Summary
                label={difference > 0 ? 'Rejadan oshgan' : 'Tejalgan'}
                value={`${difference > 0 ? '+' : ''}${formatMoney(Math.abs(difference))}`}
                tone={difference > 0 ? 'danger' : plannedTotal > 0 ? 'success' : 'default'}
              />
              <Summary label="Kutilayotgan" value={formatMoney(budget?.totalCommitted ?? 0)} hint="Tasdiq kutayotgan va to‘lanmagan" />
            </div>
          )}
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reja va fakt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full" style={{ height: Math.max(chartData.length * 44 + 60, 180) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" horizontal={false} />
                  <XAxis type="number" tickFormatter={shortMoney} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={124} />
                  <Tooltip formatter={(value, name) => [formatMoney(typeof value === 'number' ? value : Number(value ?? 0)), String(name ?? '')]} />
                  <Legend />
                  <Bar dataKey="planned" name="Reja" fill={COLORS.planned} radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="actual" name="Fakt" fill={COLORS.actual} radius={[0, 4, 4, 0]} barSize={12}>
                    {chartData.map((row) => (
                      <Cell key={row.name} fill={row.over ? COLORS.over : COLORS.actual} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        {budgetQuery.isPending || budgetQuery.isError ? null : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Kategoriya</TH>
                  <TH className="text-right">Reja</TH>
                  <TH className="text-right">Fakt</TH>
                  <TH className="text-right">Farq</TH>
                  <TH>Bajarilish</TH>
                  <TH className="text-right">Kutilayotgan</TH>
                </tr>
              </THead>
              <TBody>
                {lines.map((line) => {
                  const planned = plannedOf(line);
                  const usage = planned === 0 ? 0 : Math.round((line.actual / planned) * 100);
                  const diff = line.actual - planned;
                  return (
                    <TR key={line.categoryId}>
                      <TD>
                        <p className="font-medium text-fg">{line.categoryName}</p>
                        {line.status !== 'NONE' && line.status !== 'OK' && (
                          <Badge tone={BUDGET_STATUS_TONES[line.status]} className="mt-1">
                            {BUDGET_STATUS_LABELS[line.status]}
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        {canManage ? (
                          <Input
                            inputMode="numeric"
                            aria-label={`${line.categoryName} rejasi`}
                            className="ml-auto w-36 text-right"
                            value={draft[line.categoryId] ?? (line.planned ? String(line.planned) : '')}
                            placeholder="0"
                            onChange={(event) => setDraft((current) => ({ ...current, [line.categoryId]: event.target.value.replace(/\D/g, '') }))}
                          />
                        ) : (
                          <span className="whitespace-nowrap tabular-nums text-fg">{formatMoney(line.planned)}</span>
                        )}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(line.actual)}</TD>
                      <TD
                        className={cn(
                          'text-right whitespace-nowrap tabular-nums',
                          planned === 0 && line.actual === 0 ? 'text-fg-subtle' : diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {planned === 0 && line.actual === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatMoney(diff)}`}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
                            <div className={cn('h-full rounded-full', usageTone(line))} style={{ width: `${Math.min(Math.max(usage, planned === 0 ? 0 : 2), 100)}%` }} />
                          </div>
                          <span className="text-xs whitespace-nowrap tabular-nums text-fg-muted">{planned > 0 ? `${usage}%` : '—'}</span>
                        </div>
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{line.committed > 0 ? formatMoney(line.committed) : '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}
