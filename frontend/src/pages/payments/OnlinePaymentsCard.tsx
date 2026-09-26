import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { onlinePaymentService } from '@/services/onlinePayment.service';
import type { PaymentIntent, PaymentIntentStatus, PaymentProviderMode } from '@/types/onlinePayment';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { formatDateTime, formatMoney } from '@/utils/format';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  PENDING: 'Kutilmoqda',
  PAID: 'To‘landi',
  CANCELLED: 'Bekor qilingan',
  FAILED: 'Amalga oshmadi',
  REFUNDED: 'Qaytarilgan',
};

const STATUS_TONES: Record<PaymentIntentStatus, 'gray' | 'blue' | 'green' | 'red' | 'yellow'> = {
  PENDING: 'blue',
  PAID: 'green',
  CANCELLED: 'gray',
  FAILED: 'red',
  REFUNDED: 'yellow',
};

const MODE_LABELS: Record<PaymentProviderMode, string> = { sandbox: 'ichki sinov', test: 'sinov kassasi', production: 'ishlab chiqarish' };

/**
 * Onlayn to'lov so'rovlari (Click, Payme va sinov provayderi).
 *
 * Bu ro'yxat provayder bilan yozishmani ko'rsatadi: so'rov yaratildi, to'landi yoki
 * amalga oshmadi. Pul kelgani — "To'lovlar" jadvalidagi kvitansiya; ikkisi bog'langan.
 */
export function OnlinePaymentsCard() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | PaymentIntentStatus>('');

  const providersQuery = useQuery({
    queryKey: queryKeys.onlinePayments.providers,
    queryFn: onlinePaymentService.providers,
    staleTime: 5 * 60_000,
  });

  const params = { page, limit: PAGE_SIZE, ...(status ? { status } : {}) };
  const listQuery = useQuery({
    queryKey: queryKeys.onlinePayments.list(params),
    queryFn: () => onlinePaymentService.list(params),
    placeholderData: keepPreviousData,
  });

  const configured = (providersQuery.data ?? []).filter((provider) => provider.configured);
  const modeOf = (key: string) => configured.find((provider) => provider.key === key)?.mode;
  const canRefund = usePermission(PERMISSIONS.PAYMENT_REFUND);
  const queryClient = useQueryClient();
  const [refunding, setRefunding] = useState<PaymentIntent | null>(null);
  const refund = useMutation({
    mutationFn: (id: string) => onlinePaymentService.refund(id),
    onSuccess: (result) => {
      toast.success(result.message);
      setRefunding(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.onlinePayments.all });
    },
    onError: (error) => {
      setRefunding(null);
      toast.error(getErrorMessage(error));
    },
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4 text-fg-subtle" aria-hidden />
          Onlayn to‘lovlar
        </CardTitle>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as '' | PaymentIntentStatus);
            setPage(1);
          }}
          aria-label="Holat"
          wrapperClassName="w-48"
        >
          <option value="">Barcha holatlar</option>
          {(Object.keys(STATUS_LABELS) as PaymentIntentStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_LABELS[key]}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        {configured.length > 0 && (
          <p className="flex flex-wrap gap-2 px-4 pt-3 text-xs text-fg-subtle">
            {configured.map((provider) => (
              <Badge key={provider.key} tone={provider.mode === 'production' ? 'green' : 'yellow'}>
                {provider.key} — {MODE_LABELS[provider.mode]}
              </Badge>
            ))}
          </p>
        )}
        {configured.length === 0 && !providersQuery.isPending && (
          <p className="px-4 pt-3 text-xs text-fg-subtle">
            Hech bir provayder sozlanmagan — webhook yo‘li yopiq. Kalit qo‘shilgach onlayn to‘lovlar shu yerda ko‘rinadi.
          </p>
        )}

        {listQuery.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState icon={Globe} title="Onlayn to‘lov yo‘q" description="Provayderdan kelgan to‘lovlar shu yerda ko‘rinadi" />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {listQuery.data.items.map((intent) => (
                <li key={intent.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                      <Link to={`/students/${intent.student.id}`} className="hover:text-brand-600 hover:underline">
                        {intent.student.name}
                      </Link>
                      <Badge tone={STATUS_TONES[intent.status]}>{STATUS_LABELS[intent.status]}</Badge>
                      <Badge tone="gray">{intent.provider}</Badge>
                      {modeOf(intent.provider) && modeOf(intent.provider) !== 'production' && <Badge tone="yellow">sinov</Badge>}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {formatDateTime(intent.createdAt)} · {intent.externalId}
                      {intent.failureText ? ` · ${intent.failureText}` : ''}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-fg">
                    {intent.checkoutUrl && (
                      <a href={intent.checkoutUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-300">
                        <ExternalLink className="size-3.5" aria-hidden /> To‘lov havolasi
                      </a>
                    )}
                    {canRefund && intent.status === 'PAID' && intent.provider === 'CLICK' && (
                      <Button variant="ghost" size="sm" leftIcon={<Undo2 className="size-3.5" />} onClick={() => setRefunding(intent)}>
                        Qaytarish
                      </Button>
                    )}
                    {formatMoney(intent.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              page={listQuery.data.meta.page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={listQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={listQuery.isFetching}
            />
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={refunding !== null}
        title="Onlayn to‘lov qaytarilsinmi?"
        description={refunding ? `${refunding.student.name} — ${formatMoney(refunding.amount)} Click orqali qaytariladi va CRM’da qaytarish yoziladi.` : ''}
        confirmLabel="Qaytarish"
        loading={refund.isPending}
        onConfirm={() => refunding && refund.mutate(refunding.id)}
        onCancel={() => setRefunding(null)}
      />
    </Card>
  );
}
