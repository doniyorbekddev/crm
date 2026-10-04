import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { notificationsService } from '@/services/notifications.service';
import type { NotificationItem, NotificationListParams } from '@/types/notification';
import { formatRelativeTime } from '@/utils/format';
import {
  NOTIFICATION_TYPE_CLASSES,
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
  notificationLink,
} from '@/utils/notificationLabels';

/** O‘qilmaganlar soni shu oraliqda yangilanadi */
const POLL_MS = 60_000;

/** Paneldagi ko'rinishlar — mavjud API filtrlari (`unreadOnly`, `priority`) */
type Filter = 'all' | 'unread' | 'high';
const FILTER_PARAMS: Record<Filter, NotificationListParams> = {
  all: { page: 1, limit: 20 },
  unread: { page: 1, limit: 20, unreadOnly: 'true' },
  high: { page: 1, limit: 20, priority: 'HIGH' },
};
const EMPTY_TEXT: Record<Filter, { title: string; description: string }> = {
  all: { title: 'Bildirishnoma yo‘q', description: 'Yangi voqealar shu yerda ko‘rinadi' },
  unread: { title: 'Hammasi o‘qilgan', description: 'O‘qilmagan bildirishnoma qolmadi' },
  high: { title: 'Muhim bildirishnoma yo‘q', description: 'Shoshilinch e’tibor talab qiladigan xabar yo‘q' },
};

/**
 * Qo'ng'iroqcha va bildirishnomalar paneli (yon panel; telefonda pastdan).
 * `listPath` — "Barchasini ko‘rish" havolasi (kabinetda o‘z sahifasi bor).
 */
export function NotificationBell({ listPath = '/notifications' }: { listPath?: string } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const params = FILTER_PARAMS[filter];

  const summaryQuery = useQuery({
    queryKey: queryKeys.notifications.summary,
    queryFn: notificationsService.summary,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsService.list(params),
    enabled: open,
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

  const openNotification = (item: NotificationItem) => {
    if (!item.isRead) markRead.mutate(item.id);
    const link = notificationLink(item.entityType, item.entityId, listPath.startsWith('/portal') ? 'portal' : 'staff');
    setOpen(false);
    if (link) navigate(link);
  };

  const unread = summaryQuery.data?.unread ?? 0;
  // Muhim xabar bo'lsa qo'ng'iroqcha yonida ogohlantiruvchi nuqta turadi — raqamning o'zi
  // "shoshilinch ish bormi?" degan savolga javob bermaydi.
  const unreadHigh = summaryQuery.data?.unreadHigh ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Bildirishnomalar (${unread} ta o‘qilmagan${unreadHigh > 0 ? `, ${unreadHigh} tasi muhim` : ''})`
            : 'Bildirishnomalar'
        }
        className="focus-ring relative grid size-9 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            className={cn(
              'absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-overline leading-4 tracking-normal text-white ring-2 ring-surface',
              unreadHigh > 0 ? 'bg-danger-solid' : 'bg-brand-600',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <Drawer
        open={open}
        title="Bildirishnomalar"
        description={unread > 0 ? `${unread} ta o‘qilmagan${unreadHigh > 0 ? `, ${unreadHigh} tasi muhim` : ''}` : 'Hammasi o‘qilgan'}
        onClose={() => setOpen(false)}
        footer={
          <Link
            to={listPath}
            onClick={() => setOpen(false)}
            className="focus-ring inline-flex h-9 items-center justify-center rounded-control border border-border bg-surface px-3.5 text-body font-medium text-fg shadow-sm transition-colors hover:bg-surface-muted"
          >
            Barchasini ko‘rish
          </Link>
        }
      >
        <div className="-mx-5 -my-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} variant="pill">
              <TabList label="Bildirishnomalar filtri">
                <Tab value="all">Hammasi</Tab>
                <Tab value="unread" {...(unread > 0 ? { count: unread } : {})}>
                  O‘qilmagan
                </Tab>
                <Tab value="high" {...(unreadHigh > 0 ? { count: unreadHigh } : {})}>
                  Muhim
                </Tab>
              </TabList>
            </Tabs>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                loading={markAllRead.isPending}
                leftIcon={<CheckCheck className="size-3.5" aria-hidden />}
                onClick={() => markAllRead.mutate()}
              >
                Hammasini o‘qish
              </Button>
            )}
          </div>

          {listQuery.isPending ? (
            <div className="space-y-4 px-5 py-4" aria-busy="true" aria-label="Yuklanmoqda">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-control" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : listQuery.isError ? (
            <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} retrying={listQuery.isRefetching} />
          ) : listQuery.data.items.length === 0 ? (
            <EmptyState icon={BellOff} size="sm" {...EMPTY_TEXT[filter]} />
          ) : (
            <ul className="divide-y divide-border">
              {listQuery.data.items.map((item) => {
                const Icon = NOTIFICATION_TYPE_ICONS[item.type];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(item)}
                      className={cn(
                        'flex w-full items-start gap-3 px-5 py-3 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted',
                        !item.isRead && 'bg-primary-subtle/40',
                      )}
                    >
                      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-control', NOTIFICATION_TYPE_CLASSES[item.type])}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn('truncate text-body text-fg', !item.isRead && 'font-semibold')}>{item.title}</span>
                          {item.priority === 'HIGH' && (
                            <span className="shrink-0 rounded-sm bg-danger-subtle px-1 text-overline tracking-normal text-danger ring-1 ring-danger-border ring-inset">
                              muhim
                            </span>
                          )}
                          {!item.isRead && <span className="size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-caption text-fg-muted">{item.message}</span>
                        <span className="mt-1 block text-caption text-fg-subtle">
                          {NOTIFICATION_TYPE_LABELS[item.type]} · {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Drawer>
    </>
  );
}
