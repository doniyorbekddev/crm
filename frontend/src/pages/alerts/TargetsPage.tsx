import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { targetsService } from '@/services/alerts.service';
import type { TargetCell, TargetType } from '@/types/alert';
import { formatMoney, formatNumber } from '@/utils/format';
import { TARGET_TYPE_LABELS, TARGET_TYPE_ORDER } from '@/utils/alertLabels';
import { MONTH_OPTIONS } from '@/utils/teacherLabels';

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 3 }, (_, index) => now.getFullYear() - 1 + index);

function formatValue(type: TargetType, value: number): string {
  return type === 'REVENUE' ? formatMoney(value) : formatNumber(value);
}

function ProgressCell({ type, cell }: { type: TargetType; cell: TargetCell }) {
  return (
    <div className="min-w-[9rem]">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-fg">{formatValue(type, cell.actual)}</span>
        <span className="text-fg-muted">{cell.target > 0 ? `${cell.progress}%` : 'reja yo‘q'}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn('h-full rounded-full', cell.progress >= 100 ? 'bg-emerald-500' : cell.progress >= 70 ? 'bg-amber-500' : 'bg-brand-500')}
          style={{ width: `${cell.target > 0 ? Math.min(Math.max(cell.progress, 2), 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

export default function TargetsPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  /** Tahrirlangan qiymatlar: `${userId}:${type}` → qiymat */
  const [draft, setDraft] = useState<Record<string, string>>({});

  const overviewQuery = useQuery({
    queryKey: queryKeys.targets.overview(year, month),
    queryFn: () => targetsService.overview({ year, month }),
  });

  const save = useMutation({
    mutationFn: async (entries: Array<{ userId: string; type: TargetType; value: number }>) => {
      let last = null;
      for (const entry of entries) {
        last = await targetsService.save({ year, month, userId: entry.userId, type: entry.type, targetValue: entry.value });
      }
      return last;
    },
    onSuccess: () => {
      toast.success('Rejalar saqlandi');
      setDraft({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.targets.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changePeriod = (apply: () => void) => {
    apply();
    setDraft({});
  };

  const data = overviewQuery.data;
  const entries = Object.entries(draft).flatMap(([key, value]) => {
    const [userId, type] = key.split(':') as [string, TargetType];
    return value === '' ? [] : [{ userId, type, value: Number(value) }];
  });

  return (
    <>
      <PageHeader
        title="Sotuv rejalari"
        description="Managerlar bo‘yicha oylik lead, sotuv va tushum rejasi va bajarilishi"
        actions={
          data?.canManage ? (
            <Button leftIcon={<Save className="size-4" aria-hidden />} loading={save.isPending} disabled={entries.length === 0} onClick={() => save.mutate(entries)}>
              Saqlash{entries.length > 0 && ` (${entries.length})`}
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Select value={month} onChange={(event) => changePeriod(() => setMonth(Number(event.target.value)))} aria-label="Oy" wrapperClassName="w-40">
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select value={year} onChange={(event) => changePeriod(() => setYear(Number(event.target.value)))} aria-label="Yil" wrapperClassName="w-28">
          {YEAR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        {data && (
          <div className="ml-auto flex flex-wrap gap-4 text-sm">
            {TARGET_TYPE_ORDER.map((type) => (
              <span key={type} className="text-fg-muted">
                {TARGET_TYPE_LABELS[type]}:{' '}
                <strong className={cn(data.totals[type].progress >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg')}>
                  {data.totals[type].target > 0 ? `${data.totals[type].progress}%` : '—'}
                </strong>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card>
        {overviewQuery.isPending ? (
          <TableSkeleton rows={4} columns={4} />
        ) : overviewQuery.isError ? (
          <ErrorState error={overviewQuery.error} retrying={overviewQuery.isFetching} onRetry={() => void overviewQuery.refetch()} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={Crosshair} title="Reja yo‘q" description="Bu oy uchun reja yoki biriktirilgan lead yo‘q" />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Manager</TH>
                  {TARGET_TYPE_ORDER.map((type) => (
                    <TH key={type}>{TARGET_TYPE_LABELS[type]}</TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.userId}>
                    <TD>
                      <p className="font-medium text-fg">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="text-xs text-fg-muted">{row.roleName}</p>
                    </TD>
                    {TARGET_TYPE_ORDER.map((type) => {
                      const cell = row.targets[type];
                      const key = `${row.userId}:${type}`;
                      return (
                        <TD key={type}>
                          <ProgressCell type={type} cell={cell} />
                          {data.canManage && (
                            <Input
                              value={draft[key] ?? (cell.target ? String(cell.target) : '')}
                              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, '') }))}
                              inputMode="numeric"
                              placeholder="Reja"
                              aria-label={`${row.firstName} ${TARGET_TYPE_LABELS[type]} rejasi`}
                              className="mt-2 h-8 w-36 text-xs"
                            />
                          )}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </>
  );
}
