import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCheck, CheckCircle2, Newspaper, RefreshCw, Settings2, Siren } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { alertsService } from '@/services/alerts.service';
import type { AlertListParams, AlertSeverity, AlertStatusFilter, AlertType, DailyDigest } from '@/types/alert';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatRelativeTime } from '@/utils/format';
import {
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_ORDER,
  ALERT_SEVERITY_TONES,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_ORDER,
} from '@/utils/alertLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { AlertSettingsModal } from './AlertSettingsModal';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: ReadonlyArray<{ value: AlertStatusFilter; label: string }> = [
  { value: 'open', label: 'Ochiq' },
  { value: 'unread', label: 'O‘qilmagan' },
  { value: 'resolved', label: 'Yopilgan' },
  { value: 'all', label: 'Barchasi' },
];

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  WARNING: 'border-l-amber-500',
  INFO: 'border-l-brand-500',
  SUCCESS: 'border-l-emerald-500',
};

const SEVERITY_CARD_TITLES: Record<AlertSeverity, string> = {
  CRITICAL: 'Yuqori muhimlik',
  WARNING: 'O‘rta muhimlik',
  INFO: 'Past muhimlik',
  SUCCESS: 'Yutuqlar',
};

function DigestCard({ digest }: { digest: DailyDigest }) {
  const items: Array<{ label: string; value: string; tone?: 'good' | 'bad' }> = [
    { label: 'Tushum', value: formatMoney(digest.revenue) },
    { label: 'Xarajat', value: formatMoney(digest.expenses) },
    { label: 'Sof natija', value: `${digest.netProfit < 0 ? '−' : ''}${formatMoney(Math.abs(digest.netProfit))}`, tone: digest.netProfit < 0 ? 'bad' : 'good' },
    { label: 'Yangi o‘quvchi', value: formatNumber(digest.newStudents) },
    { label: 'Sotuv / yangi lead', value: `${formatNumber(digest.wonLeads)} / ${formatNumber(digest.newLeads)}` },
    { label: 'Davomat', value: digest.attendanceRate === null ? '—' : `${digest.attendanceRate}%`, ...(digest.attendanceRate !== null && digest.attendanceRate < 70 ? { tone: 'bad' as const } : {}) },
    { label: 'Qarzdorlik', value: formatMoney(digest.totalDebt) },
    { label: 'Kritik ogohlantirish', value: formatNumber(digest.criticalAlerts), ...(digest.criticalAlerts > 0 ? { tone: 'bad' as const } : {}) },
  ];

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="size-4 text-fg-subtle" aria-hidden />
          Kechagi xulosa
        </CardTitle>
        <span className="text-xs text-fg-muted">{formatDate(digest.date)}</span>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-xs text-fg-muted">{item.label}</dt>
              <dd
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  item.tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
                  item.tone === 'bad' && 'text-red-600 dark:text-red-400',
                  !item.tone && 'text-fg',
                )}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.ALERT_MANAGE);
  const canViewDigest = usePermission(PERMISSIONS.ANALYTICS_VIEW);
  const [status, setStatus] = useState<AlertStatusFilter>('open');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [type, setType] = useState<AlertType | ''>('');
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const digestQuery = useQuery({ queryKey: queryKeys.alerts.digest, queryFn: alertsService.digest, enabled: canViewDigest, staleTime: 10 * 60_000 });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.executive });
  };

  const onError = (error: unknown) => toast.error(getErrorMessage(error));

  const evaluate = useMutation({
    mutationFn: alertsService.evaluate,
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError,
  });

  const resolve = useMutation({
    mutationFn: (id: string) => alertsService.resolve(id),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError,
  });

  const markRead = useMutation({ mutationFn: (id: string) => alertsService.read(id), onSuccess: refresh, onError });

  const readAll = useMutation({
    mutationFn: alertsService.readAll,
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError,
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const summary = summaryQuery.data;
  const unread = summary?.unread ?? 0;

  return (
    <>
      <PageHeader
        title="Ogohlantirishlar"
        description={
          summary
            ? `${formatNumber(summary.open)} ta ochiq, ${formatNumber(unread)} tasi o‘qilmagan — tizim har 30 daqiqada tekshiradi`
            : 'Qarz, davomat, ketish xavfi, konversiya, mablag‘, maosh, budjet va sotuv rejalari bo‘yicha avtomatik signallar'
        }
        documentTitle="Ogohlantirishlar"
        actions={
          <div className="flex flex-wrap gap-2">
            {unread > 0 && (
              <Button variant="secondary" leftIcon={<CheckCheck className="size-4" aria-hidden />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
                Hammasini o‘qildi
              </Button>
            )}
            <Button variant="secondary" leftIcon={<RefreshCw className="size-4" aria-hidden />} loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
              Hozir tekshirish
            </Button>
            {canManage && (
              <Button variant="secondary" leftIcon={<Settings2 className="size-4" aria-hidden />} onClick={() => setSettingsOpen(true)}>
                Sozlamalar
              </Button>
            )}
          </div>
        }
      />

      {canViewDigest && digestQuery.data && <DigestCard digest={digestQuery.data} />}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ALERT_SEVERITY_ORDER.map((item) => {
          const active = severity === item;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => changeFilter(() => setSeverity(active ? '' : item))}
              className={cn(
                'rounded-xl border border-l-4 bg-surface p-3 text-left transition-colors hover:bg-surface-muted sm:p-4',
                SEVERITY_BORDER[item],
                active ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-border',
              )}
            >
              <p className="text-xs text-fg-muted">{SEVERITY_CARD_TITLES[item]}</p>
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
          <div role="tablist" aria-label="Holat" className="-mx-1 flex gap-1 overflow-x-auto px-1">
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
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {option.label}
                  {option.value === 'unread' && unread > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-5 font-semibold text-white">{unread}</span>
                  )}
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
            icon={status === 'open' || status === 'unread' ? CheckCircle2 : Siren}
            title={status === 'unread' ? 'O‘qilmagan ogohlantirish yo‘q' : status === 'open' ? 'Ochiq ogohlantirish yo‘q' : 'Ogohlantirish topilmadi'}
            description={status === 'open' || status === 'unread' ? 'Hammasi joyida — tizim har 30 daqiqada qayta tekshiradi' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <ul className={cn('divide-y divide-border transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              {listQuery.data.items.map((alert) => {
                const isUnread = !alert.readAt && !alert.resolvedAt;
                return (
                  <li
                    key={alert.id}
                    className={cn(
                      'flex flex-col gap-3 border-l-4 px-4 py-3 sm:flex-row sm:items-center',
                      SEVERITY_BORDER[alert.severity],
                      alert.resolvedAt && 'opacity-70',
                      isUnread && 'bg-brand-50/40 dark:bg-brand-950/20',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isUnread && <span className="size-2 rounded-full bg-brand-500" aria-label="O‘qilmagan" />}
                        <Badge tone={ALERT_SEVERITY_TONES[alert.severity]}>{ALERT_SEVERITY_LABELS[alert.severity]}</Badge>
                        <span className="text-xs text-fg-muted">{ALERT_TYPE_LABELS[alert.type]}</span>
                        <span className="text-xs text-fg-subtle" title={formatDateTime(alert.createdAt)}>
                          {formatRelativeTime(alert.createdAt)}
                        </span>
                      </div>
                      <p className={cn('mt-1 text-sm text-fg', isUnread ? 'font-semibold' : 'font-medium')}>{alert.title}</p>
                      <p className="text-sm text-fg-muted">{alert.message}</p>
                      {alert.resolvedAt ? (
                        <p className="mt-1 text-xs text-fg-subtle">
                          Yopildi: {formatDateTime(alert.resolvedAt)}
                          {alert.resolvedBy ? ` · ${alert.resolvedBy.firstName} ${alert.resolvedBy.lastName}` : ' · avtomatik (holat to‘g‘rilandi)'}
                        </p>
                      ) : (
                        alert.readBy &&
                        alert.readAt && (
                          <p className="mt-1 text-xs text-fg-subtle">
                            O‘qidi: {alert.readBy.firstName} {alert.readBy.lastName} · {formatRelativeTime(alert.readAt)}
                          </p>
                        )
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {alert.link && (
                        <Link
                          to={alert.link}
                          onClick={() => {
                            if (isUnread) markRead.mutate(alert.id);
                          }}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-fg hover:bg-surface-muted"
                        >
                          Ochish
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      )}
                      {isUnread && (
                        <Button size="sm" variant="ghost" loading={markRead.isPending && markRead.variables === alert.id} onClick={() => markRead.mutate(alert.id)}>
                          O‘qildi
                        </Button>
                      )}
                      {!alert.resolvedAt && (
                        <Button size="sm" variant="secondary" loading={resolve.isPending && resolve.variables === alert.id} onClick={() => resolve.mutate(alert.id)}>
                          Yopish
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
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

      {settingsOpen && <AlertSettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
