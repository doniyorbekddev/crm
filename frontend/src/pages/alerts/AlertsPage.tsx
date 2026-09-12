import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, RefreshCw, Siren } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { alertsService } from '@/services/alerts.service';
import type { AlertListParams, AlertSeverity, AlertStatusFilter, AlertType } from '@/types/alert';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/utils/format';
import {
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_ORDER,
  ALERT_SEVERITY_TONES,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_ORDER,
} from '@/utils/alertLabels';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: ReadonlyArray<{ value: AlertStatusFilter; label: string }> = [
  { value: 'open', label: 'Ochiq' },
  { value: 'resolved', label: 'Yopilgan' },
  { value: 'all', label: 'Barchasi' },
];

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  WARNING: 'border-l-amber-500',
  INFO: 'border-l-brand-500',
  SUCCESS: 'border-l-emerald-500',
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AlertStatusFilter>('open');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [type, setType] = useState<AlertType | ''>('');
  const [page, setPage] = useState(1);

  const params: AlertListParams = {
    page,
    limit: PAGE_SIZE,
    status,
    ...(severity ? { severity } : {}),
    ...(type ? { type } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.alerts.list(params),
    queryFn: () => alertsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({ queryKey: queryKeys.alerts.summary, queryFn: alertsService.summary });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.executive });
  };

  const evaluate = useMutation({
    mutationFn: alertsService.evaluate,
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => alertsService.resolve(id),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const summary = summaryQuery.data;

  return (
    <>
      <PageHeader
        title="Ogohlantirishlar"
        description="Qarz, davomat, chiqib ketish xavfi, maosh, budjet va sotuv rejalari bo‘yicha avtomatik signallar"
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="size-4" aria-hidden />}
            loading={evaluate.isPending}
            onClick={() => evaluate.mutate()}
          >
            Hozir tekshirish
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ALERT_SEVERITY_ORDER.map((item) => {
          const active = severity === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => changeFilter(() => setSeverity(active ? '' : item))}
              className={cn(
                'rounded-xl border border-l-4 bg-surface p-4 text-left transition-colors hover:bg-surface-muted',
                SEVERITY_BORDER[item],
                active ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-border',
              )}
            >
              <p className="text-xs text-fg-muted">{ALERT_SEVERITY_LABELS[item]}</p>
              {summaryQuery.isPending ? (
                <Skeleton className="mt-2 h-6 w-10" />
              ) : (
                <p className="mt-1 text-xl font-semibold text-fg">{formatNumber(summary?.bySeverity[item] ?? 0)}</p>
              )}
              <p className="mt-1 text-xs text-fg-subtle">ochiq</p>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <div role="tablist" aria-label="Holat" className="flex gap-1">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeFilter(() => setStatus(option.value))}
                  className={cn(
                    'h-9 rounded-lg px-3 text-sm font-medium transition-colors',
                    active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <Select
            value={type}
            onChange={(event) => changeFilter(() => setType(event.target.value as AlertType | ''))}
            aria-label="Tur"
            wrapperClassName="sm:ml-auto sm:w-56"
          >
            <option value="">Barcha turlar</option>
            {ALERT_TYPE_ORDER.map((item) => (
              <option key={item} value={item}>
                {ALERT_TYPE_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>

        {listQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={status === 'open' ? CheckCircle2 : Siren}
            title={status === 'open' ? 'Ochiq ogohlantirish yo‘q' : 'Ogohlantirish topilmadi'}
            description={status === 'open' ? 'Hammasi joyida — tizim har 30 daqiqada qayta tekshiradi' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <ul className={cn('divide-y divide-border transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              {listQuery.data.items.map((alert) => (
                <li key={alert.id} className={cn('flex flex-col gap-3 border-l-4 px-4 py-3 sm:flex-row sm:items-center', SEVERITY_BORDER[alert.severity], alert.resolvedAt && 'opacity-70')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ALERT_SEVERITY_TONES[alert.severity]}>{ALERT_SEVERITY_LABELS[alert.severity]}</Badge>
                      <span className="text-xs text-fg-muted">{ALERT_TYPE_LABELS[alert.type]}</span>
                      <span className="text-xs text-fg-subtle" title={formatDateTime(alert.createdAt)}>
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-fg">{alert.title}</p>
                    <p className="text-sm text-fg-muted">{alert.message}</p>
                    {alert.resolvedAt && (
                      <p className="mt-1 text-xs text-fg-subtle">
                        Yopildi: {formatDateTime(alert.resolvedAt)}
                        {alert.resolvedBy ? ` · ${alert.resolvedBy.firstName} ${alert.resolvedBy.lastName}` : ' · avtomatik (holat to‘g‘rilandi)'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {alert.link && (
                      <Link
                        to={alert.link}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-fg hover:bg-surface-muted"
                      >
                        Ochish
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                    {!alert.resolvedAt && (
                      <Button size="sm" variant="secondary" loading={resolve.isPending && resolve.variables === alert.id} onClick={() => resolve.mutate(alert.id)}>
                        Hal qilindi
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              disabled={listQuery.isPlaceholderData}
            />
          </>
        )}
      </Card>
    </>
  );
}
