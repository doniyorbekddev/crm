import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS } from '@/utils/paymentLabels';
import { INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES } from '@/utils/scheduleLabels';

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={tone === 'danger' ? 'mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400' : 'mt-1 text-2xl font-semibold tabular-nums text-fg'}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/** To‘lov jadvali va tarixi. Onlayn to‘lov tugmasi — Telegram botda (`/qarz`). */
export default function PortalPaymentsPage() {
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.payments(activeChild), queryFn: () => portalService.payments(activeChild) });

  return (
    <div>
      <PageHeader title="To‘lovlar" description="Shartnoma, to‘lov jadvali va tarix" />

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Shartnoma" value={formatMoney(query.data.schedule.contractTotal)} />
            <Tile label="To‘langan" value={formatMoney(query.data.schedule.paid)} />
            <Tile
              label="Qolgan"
              value={formatMoney(query.data.schedule.contractTotal - query.data.schedule.paid)}
              hint={
                query.data.schedule.overdueAmount > 0
                  ? `Muddati o‘tgan: ${formatMoney(query.data.schedule.overdueAmount)} (${query.data.schedule.overdueDays} kun)`
                  : query.data.schedule.nextDue
                    ? `Keyingi muddat: ${formatDate(query.data.schedule.nextDue.dueDate)}`
                    : undefined
              }
              tone={query.data.schedule.overdueAmount > 0 ? 'danger' : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>To‘lov jadvali</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {query.data.schedule.installments.length === 0 ? (
                <EmptyState icon={Wallet} title="Jadval tuzilmagan" description="To‘lov jadvali o‘quv markaz tomonidan tuziladi" />
              ) : (
                <ul className="divide-y divide-border">
                  {query.data.schedule.installments.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div>
                        <p className="text-fg">
                          {item.sequence}-qism · {formatDate(item.dueDate)}
                        </p>
                        {item.note && <p className="text-xs text-fg-muted">{item.note}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-fg">
                          {formatMoney(item.paid)} / {formatMoney(item.amount)}
                        </span>
                        <Badge tone={INSTALLMENT_STATUS_TONES[item.status]}>{INSTALLMENT_STATUS_LABELS[item.status]}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>To‘lovlar tarixi</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {query.data.history.length === 0 ? (
                <EmptyState icon={Wallet} title="To‘lov yo‘q" description="To‘lov qabul qilinganda shu yerda ko‘rinadi" />
              ) : (
                <ul className="divide-y divide-border">
                  {query.data.history.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="text-fg-muted">{formatDateTime(item.paidAt)}</span>
                      <span className="flex items-center gap-3">
                        <Badge>{PAYMENT_METHOD_LABELS[item.method]}</Badge>
                        <span className="tabular-nums font-medium text-fg">{formatMoney(item.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
