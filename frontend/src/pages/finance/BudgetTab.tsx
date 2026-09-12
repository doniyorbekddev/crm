import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { MONTH_OPTIONS } from '@/utils/teacherLabels';

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

/** Reja bajarilishiga qarab rang: oshib ketgan bo‘lsa qizil */
function usageTone(usage: number, planned: number): string {
  if (planned === 0) return 'bg-slate-300 dark:bg-slate-600';
  if (usage > 100) return 'bg-red-500';
  if (usage > 85) return 'bg-amber-500';
  return 'bg-emerald-500';
}

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
  const plannedOf = (line: { categoryId: string; planned: number }): number =>
    Number(draft[line.categoryId] ?? line.planned ?? 0);

  /** Oy almashganda tahrirlar bekor qilinadi — yangi oyning rejasi ko‘rsatiladi */
  const changePeriod = (apply: () => void) => {
    apply();
    setDraft({});
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const plannedTotal = (budget?.lines ?? []).reduce((sum, line) => sum + plannedOf(line), 0);

  return (
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
          {canManage && (
            <Button leftIcon={<Save className="size-4" aria-hidden />} loading={save.isPending} onClick={() => save.mutate()}>
              Saqlash
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {budgetQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : budgetQuery.isError ? (
          <ErrorState error={budgetQuery.error} onRetry={() => void budgetQuery.refetch()} />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(budget?.lines ?? []).map((line) => {
                const planned = plannedOf(line);
                const usage = planned === 0 ? 0 : Math.round((line.actual / planned) * 100);
                return (
                  <li key={line.categoryId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{line.categoryName}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={cn('h-full rounded-full', usageTone(usage, planned))}
                            style={{ width: `${Math.min(Math.max(usage, planned === 0 ? 0 : 2), 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-fg-muted">
                          {formatMoney(line.actual)}
                          {planned > 0 && ` / ${formatMoney(planned)} · ${usage}%`}
                        </span>
                      </div>
                    </div>
                    {canManage ? (
                      <Input
                        inputMode="numeric"
                        aria-label={`${line.categoryName} rejasi`}
                        className="w-40"
                        value={draft[line.categoryId] ?? (line.planned ? String(line.planned) : '')}
                        placeholder="0"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, [line.categoryId]: event.target.value.replace(/\D/g, '') }))
                        }
                      />
                    ) : (
                      <span className="text-sm text-fg-muted">{formatMoney(line.planned)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
              <span className="font-medium text-fg">Jami</span>
              <span className="text-fg-muted">
                Reja: <strong className="text-fg">{formatMoney(plannedTotal)}</strong> · Fakt:{' '}
                <strong className={cn(budget && budget.totalActual > plannedTotal ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                  {formatMoney(budget?.totalActual ?? 0)}
                </strong>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
