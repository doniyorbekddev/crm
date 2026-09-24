import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { notificationsService } from '@/services/notifications.service';
import type { NotificationItem, NotificationListParams, NotificationPriority, NotificationType } from '@/types/notification';
import { formatDateTime, formatRelativeTime } from '@/utils/format';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import {
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_PRIORITY_TONES,
  NOTIFICATION_TYPE_CLASSES,
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_ORDER,
  notificationLink,
} from '@/utils/notificationLabels';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const [type, setType] = useState<NotificationType | ''>('');
  /** '' — hammasi, 'unread' — o‘qilmagan, 'read' — o‘qilgan */
  const [readState, setReadState] = useState<'' | 'unread' | 'read'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [priority, setPriority] = useState<NotificationPriority | ''>('');
  const [page, setPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const params: NotificationListParams = {
    page,
    limit: PAGE_SIZE,
    ...(type ? { type } : {}),
    ...(priority ? { priority } : {}),
    ...(readState === 'unread' ? { unreadOnly: 'true' as const } : {}),
    ...(readState === 'read' ? { readOnly: 'true' as const } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.notifications.summary,
    queryFn: notificationsService.summary,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: refresh,
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => notificationsService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const clearRead = useMutation({
    mutationFn: () => notificationsService.clearRead(),
    onSuccess: (result) => {
      toast.success(result.message);
      setConfirmClear(false);
      setPage(1);
      refresh();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmClear(false);
    },
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const summary = summaryQuery.data;
  const unreadByType = new Map(summary?.byType.map((row) => [row.type, row.unread]) ?? []);

  const renderRow = (item: NotificationItem) => {
    const Icon = NOTIFICATION_TYPE_ICONS[item.type];
    const link = notificationLink(item.entityType, item.entityId);

    const body = (
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg', NOTIFICATION_TYPE_CLASSES[item.type])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('truncate text-sm', item.isRead ? 'text-fg' : 'font-semibold text-fg')}>{item.title}</p>
            {item.priority === 'HIGH' && (
              <Badge tone={NOTIFICATION_PRIORITY_TONES.HIGH}>{NOTIFICATION_PRIORITY_LABELS.HIGH}</Badge>
            )}
            {!item.isRead && <span className="size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">{item.message}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            {NOTIFICATION_TYPE_LABELS[item.type]} · {formatRelativeTime(item.createdAt)} · {formatDateTime(item.createdAt)}
          </p>
        </div>
      </div>
    );

    return (
      <li key={item.id} className={cn('flex items-start gap-2 px-4 py-3', !item.isRead && 'bg-brand-50/40 dark:bg-brand-950/30')}>
        {link ? (
          <Link to={link} onClick={() => !item.isRead && markRead.mutate(item.id)} className="flex min-w-0 flex-1 hover:opacity-80">
            {body}
          </Link>
        ) : (
          body
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!item.isRead && (
            <button
              type="button"
              onClick={() => markRead.mutate(item.id)}
              aria-label="O‘qilgan deb belgilash"
              title="O‘qilgan deb belgilash"
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              <CheckCheck className="size-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => remove.mutate(item.id)}
            aria-label="O‘chirish"
            title="O‘chirish"
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-red-600"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Bildirishnomalar"
        description={
          summary
            ? `${summary.unread} ta o‘qilmagan${summary.unreadHigh > 0 ? ` (${summary.unreadHigh} tasi muhim)` : ''} · jami ${summary.total} ta`
            : 'Yuklanmoqda'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              leftIcon={<CheckCheck className="size-4" aria-hidden />}
              loading={markAllRead.isPending}
              disabled={(summary?.unread ?? 0) === 0}
              onClick={() => markAllRead.mutate()}
            >
              Hammasini o‘qish
            </Button>
            <Button
              variant="ghost"
              leftIcon={<Trash2 className="size-4" aria-hidden />}
              disabled={(summary?.total ?? 0) === 0}
              onClick={() => setConfirmClear(true)}
            >
              O‘qilganlarni tozalash
            </Button>
            <Button variant="ghost" leftIcon={<Settings2 className="size-4" aria-hidden />} onClick={() => setSettingsOpen(true)}>
              Sozlamalar
            </Button>
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <Select
            value={type}
            onChange={(event) => changeFilter(() => setType(event.target.value as NotificationType | ''))}
            aria-label="Bildirishnoma turi"
            wrapperClassName="sm:w-60"
          >
            <option value="">Barcha turlar</option>
            {NOTIFICATION_TYPE_ORDER.map((item) => (
              <option key={item} value={item}>
                {NOTIFICATION_TYPE_LABELS[item]}
                {unreadByType.get(item) ? ` (${unreadByType.get(item)})` : ''}
              </option>
            ))}
          </Select>
          <Select
            value={priority}
            onChange={(event) => changeFilter(() => setPriority(event.target.value as NotificationPriority | ''))}
            aria-label="Muhimlik darajasi"
            wrapperClassName="sm:w-44"
          >
            <option value="">Barcha darajalar</option>
            <option value="HIGH">Faqat muhim</option>
            <option value="NORMAL">Oddiy</option>
            <option value="LOW">Ma’lumot uchun</option>
          </Select>
          <Select
            value={readState}
            onChange={(event) => changeFilter(() => setReadState(event.target.value as '' | 'unread' | 'read'))}
            aria-label="O‘qilganlik holati"
            wrapperClassName="sm:w-48"
          >
            <option value="">O‘qilgan va o‘qilmagan</option>
            <option value="unread">Faqat o‘qilmaganlar</option>
            <option value="read">Faqat o‘qilganlar</option>
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-fg-muted">
            <span className="sr-only sm:not-sr-only">Sana</span>
            <Input
              type="date"
              value={from}
              aria-label="Boshlanish sanasi"
              className="h-9 w-40"
              onChange={(event) => changeFilter(() => setFrom(event.target.value))}
            />
            <span aria-hidden>—</span>
            <Input
              type="date"
              value={to}
              aria-label="Tugash sanasi"
              className="h-9 w-40"
              onChange={(event) => changeFilter(() => setTo(event.target.value))}
            />
          </label>
        </div>

        {listQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Bildirishnoma yo‘q"
            description={readState === 'unread' ? 'Hammasi o‘qilgan' : 'Yangi hodisalar shu yerda paydo bo‘ladi'}
          />
        ) : (
          <>
            <ul className={cn('divide-y divide-border transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              {listQuery.data.items.map(renderRow)}
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
      </Card>

      {settingsOpen && <NotificationSettingsModal onClose={() => setSettingsOpen(false)} />}

      <ConfirmDialog
        open={confirmClear}
        title="O‘qilganlar tozalansinmi?"
        description="Barcha o‘qilgan bildirishnomalar o‘chiriladi. O‘qilmaganlari joyida qoladi."
        confirmLabel="Tozalash"
        loading={clearRead.isPending}
        onConfirm={() => clearRead.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}
