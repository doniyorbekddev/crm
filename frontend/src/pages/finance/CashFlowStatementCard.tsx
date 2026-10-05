import { DataTable } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { FinanceRangeParams } from '@/types/finance';
import { formatDate, formatMoney } from '@/utils/format';

interface Row {
  label: string;
  value: number;
}

/** Nolga teng qatorlar yashiriladi — hisobot qisqa va o‘qiladigan bo‘lsin */
function FlowList({ title, icon, rows, total, tone }: { title: string; icon: React.ReactNode; rows: Row[]; total: number; tone: 'in' | 'out' }) {
  const visible = rows.filter((row) => row.value !== 0);
  return (
    <div className="rounded-xl border border-border">
      <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-fg">
        {icon}
        {title}
      </p>
      <ul className="divide-y divide-border text-sm">
        {visible.length === 0 ? (
          <li className="px-3 py-2.5 text-fg-muted">Harakat yo‘q</li>
        ) : (
          visible.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-fg-muted">{row.label}</span>
              <span className="whitespace-nowrap tabular-nums text-fg">{formatMoney(row.value)}</span>
            </li>
          ))
        )}
        <li className="flex items-center justify-between gap-3 bg-surface-muted px-3 py-2 font-semibold">
          <span className="text-fg">Jami</span>
          <span className={cn('whitespace-nowrap tabular-nums', tone === 'in' ? 'text-success' : 'text-danger')}>
            {signed(tone === 'in' ? total : -total)}
          </span>
        </li>
      </ul>
    </div>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  return <StatCard size="sm" title={label} value={value} valueTone={tone === 'positive' ? 'success' : tone === 'negative' ? 'danger' : 'default'} />;
}

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`;

/** Pul harakati hisoboti: boshlang‘ich → kirim − chiqim → yakuniy qoldiq, kassalar kesimi va 30 kunlik prognoz */
export function CashFlowStatementCard({ range }: { range: FinanceRangeParams }) {
  const statementQuery = useQuery({
    queryKey: queryKeys.finance.cashFlowStatement(range),
    queryFn: () => financeService.cashFlowStatement(range),
  });

  if (statementQuery.isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (statementQuery.isError) {
    return <ErrorState error={statementQuery.error} retrying={statementQuery.isFetching} onRetry={() => void statementQuery.refetch()} />;
  }

  const data = statementQuery.data;
  const { forecast } = data;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="min-w-0 xl:col-span-2">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Pul harakati hisoboti</CardTitle>
          <span className="text-xs text-fg-muted">
            {formatDate(data.from)} — {formatDate(data.to)}
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Davr boshida" value={formatMoney(data.openingBalance)} />
            <Metric label="Faoliyatdan sof oqim" value={signed(data.operatingNet)} tone={data.operatingNet >= 0 ? 'positive' : 'negative'} />
            <Metric label="Qoldiq o‘zgarishi" value={signed(data.netChange)} tone={data.netChange >= 0 ? 'positive' : 'negative'} />
            <Metric label="Davr oxirida" value={formatMoney(data.closingBalance)} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FlowList
              title="Kirim"
              tone="in"
              icon={<ArrowDownLeft className="size-4 text-success" aria-hidden />}
              total={data.inflow.total}
              rows={[
                { label: 'O‘quvchi to‘lovlari', value: data.inflow.studentPayments },
                { label: 'Boshqa tushumlar', value: data.inflow.otherIncome },
                { label: 'Kassalar o‘rtasida o‘tkazma', value: data.inflow.transfers },
                { label: 'Boshqa kirim', value: data.inflow.other },
              ]}
            />
            <FlowList
              title="Chiqim"
              tone="out"
              icon={<ArrowUpRight className="size-4 text-danger" aria-hidden />}
              total={data.outflow.total}
              rows={[
                { label: 'Xarajatlar', value: data.outflow.expenses },
                { label: 'Maoshlar', value: data.outflow.salaries },
                { label: 'Qaytarilgan to‘lovlar', value: data.outflow.refunds },
                { label: 'Kassalar o‘rtasida o‘tkazma', value: data.outflow.transfers },
                { label: 'Boshqa chiqim', value: data.outflow.other },
              ]}
            />
          </div>

          {data.unassigned !== 0 && (
            <Alert tone="warning">
              Kassaga bog‘lanmagan yozuvlar: {signed(data.unassigned)} — ular kassa qoldig‘iga kirmaydi.
            </Alert>
          )}

          <DataTable
            bare
            label="Kassalar bo‘yicha pul harakati"
            rows={data.accounts}
            rowKey={(account) => account.id}
            className="rounded-xl border border-border"
            mobileLayout="cards"
            columns={[
              {
                key: 'c0',
                label: 'Kassa',
                cell: (account) => (
                  <>
                    <span className="flex items-center gap-2 font-medium whitespace-nowrap text-fg">
                      {account.name}
                      {!account.isActive && <Badge tone="gray">Faolsiz</Badge>}
                    </span>
                  </>
                ),
              },
              {
                key: 'c1',
                label: 'Boshida',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg-muted',
                cell: (account) => <>{formatMoney(account.opening)}</>,
              },
              {
                key: 'c2',
                label: 'Kirim',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-success',
                cell: (account) => (
                  <>
                    {account.inflow > 0 ? `+${formatMoney(account.inflow)}` : '—'}
                  </>
                ),
              },
              {
                key: 'c3',
                label: 'Chiqim',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-danger',
                cell: (account) => (
                  <>
                    {account.outflow > 0 ? `−${formatMoney(account.outflow)}` : '—'}
                  </>
                ),
              },
              {
                key: 'c4',
                label: 'Oxirida',
                thClassName: 'text-right',
                tdClassName: 'text-right font-semibold whitespace-nowrap tabular-nums text-fg',
                cell: (account) => <>{formatMoney(account.closing)}</>,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-fg-subtle" aria-hidden />
            Keyingi {forecast.days} kun
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="text-fg-muted">Hozirgi qoldiq</span>
              <span className="font-medium whitespace-nowrap tabular-nums text-fg">{formatMoney(forecast.currentBalance)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-fg-muted">
                Kutilayotgan xarajatlar
                {forecast.upcomingExpenseCount > 0 && <span className="text-fg-subtle"> · {forecast.upcomingExpenseCount} ta</span>}
              </span>
              <span className="whitespace-nowrap tabular-nums text-danger">{signed(-forecast.upcomingExpenses)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-fg-muted">To‘lanmagan maoshlar</span>
              <span className="whitespace-nowrap tabular-nums text-danger">{signed(-forecast.unpaidSalaries)}</span>
            </li>
            <li className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <span className="font-medium text-fg">Taxminiy qoldiq</span>
              <span
                className={cn(
                  'text-lg font-semibold whitespace-nowrap tabular-nums',
                  forecast.projectedBalance < 0 ? 'text-danger' : 'text-fg',
                )}
              >
                {formatMoney(forecast.projectedBalance)}
              </span>
            </li>
          </ul>
          {forecast.projectedBalance < 0 && (
            <Alert tone="error" className="mt-3">
              Majburiyatlar uchun mablag‘ yetmaydi — to‘lovlarni rejalashtiring yoki qarzlarni undiring.
            </Alert>
          )}
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">
            O‘quvchilar qarzi: <span className="font-medium text-fg">{formatMoney(forecast.receivables)}</span> — tushishi mumkin, lekin prognozga
            qo‘shilmagan.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
