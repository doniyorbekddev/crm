import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { CashFlowPeriod, FinanceRangeParams } from '@/types/finance';
import { formatMoney, formatNumber } from '@/utils/format';
import { ACCOUNT_TYPE_LABELS } from '@/utils/financeLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { CashFlowChart } from './CashFlowChart';
import { CashFlowStatementCard } from './CashFlowStatementCard';
import { TransferModal } from './TransferModal';

interface FinanceOverviewProps {
  range: FinanceRangeParams;
}

function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold',
          tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'negative' && 'text-red-600 dark:text-red-400',
          tone === 'default' && 'text-fg',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </Card>
  );
}

/** Kategoriya kesimi — eng kattasiga nisbatan progress chizig‘i bilan */
function CategoryList({ rows, tone }: { rows: Array<{ name: string; total: number; count: number }>; tone: 'income' | 'expense' }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-fg-muted">Ma’lumot yo‘q</p>;
  }
  const max = Math.max(...rows.map((row) => row.total), 1);

  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 8).map((row) => (
        <li key={row.name} className="px-4 py-2.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-fg">{row.name}</span>
            <span className="shrink-0 font-medium text-fg">{formatMoney(row.total)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn('h-full rounded-full', tone === 'income' ? 'bg-emerald-500' : 'bg-red-500')}
                style={{ width: `${Math.max((row.total / max) * 100, 2)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs text-fg-muted">{formatNumber(row.count)} ta</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FinanceOverview({ range }: FinanceOverviewProps) {
  const canManage = usePermission(PERMISSIONS.FINANCE_MANAGE);
  const [period, setPeriod] = useState<CashFlowPeriod>('day');
  const [transferOpen, setTransferOpen] = useState(false);

  const summaryQuery = useQuery({
    queryKey: queryKeys.finance.summary(range),
    queryFn: () => financeService.summary(range),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts(range),
    queryFn: () => financeService.accounts(range),
  });

  if (summaryQuery.isError) {
    return <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />;
  }

  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      {summaryQuery.isPending || !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Tushum"
              value={formatMoney(summary.income)}
              hint={`O‘quv to‘lovi: ${formatMoney(summary.studentPayments)}${summary.refunds > 0 ? ` · qaytarilgan: ${formatMoney(summary.refunds)}` : ''}`}
              tone="positive"
            />
            <KpiCard
              label="Xarajat"
              value={formatMoney(summary.expense)}
              hint={`Maosh: ${formatMoney(summary.teacherSalary)}`}
              tone="negative"
            />
            <KpiCard
              label="Sof foyda"
              value={formatMoney(summary.netProfit)}
              hint={`Marja: ${summary.margin}%`}
              tone={summary.netProfit >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard label="Kassalardagi qoldiq" value={formatMoney(summary.totalBalance)} hint={`Qarzdorlik: ${formatMoney(summary.totalDebt)}`} />
          </div>

          <CashFlowChart range={range} period={period} onPeriodChange={setPeriod} />

          <CashFlowStatementCard range={range} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tushum kesimi</CardTitle>
                <span className="text-xs text-fg-muted">{formatMoney(summary.income)}</span>
              </CardHeader>
              <CardContent className="p-0">
                <CategoryList rows={summary.incomeByCategory} tone="income" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Xarajat kesimi</CardTitle>
                <span className="text-xs text-fg-muted">{formatMoney(summary.expense)}</span>
              </CardHeader>
              <CardContent className="p-0">
                <CategoryList rows={summary.expenseByCategory} tone="expense" />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kassalar</CardTitle>
          {canManage && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ArrowLeftRight className="size-4" aria-hidden />}
              onClick={() => setTransferOpen(true)}
            >
              O‘tkazma
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {accountsQuery.isPending ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : accountsQuery.isError ? (
            <ErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {accountsQuery.data.items.map((account) => (
                  <li key={account.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !account.isActive && 'opacity-60')}>
                    <Wallet className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        {account.name}
                        <Badge tone="gray">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
                        {!account.isActive && <Badge tone="red">Faolsiz</Badge>}
                      </p>
                      <p className="text-xs text-fg-muted">
                        Davrda: +{formatMoney(account.income)} · −{formatMoney(account.expense)} ·{' '}
                        {formatNumber(account.transactions)} yozuv
                      </p>
                    </div>
                    <p className="text-sm font-semibold whitespace-nowrap text-fg">{formatMoney(account.balance)}</p>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-sm font-medium text-fg">Jami qoldiq</span>
                <span className="text-base font-semibold text-fg">{formatMoney(accountsQuery.data.totalBalance)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {transferOpen && <TransferModal onClose={() => setTransferOpen(false)} />}
    </div>
  );
}
