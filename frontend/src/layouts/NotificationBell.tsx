import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
const PREVIEW_PARAMS: NotificationListParams = { page: 1, limit: 8 };

/** `listPath` — "Barchasini ko‘rish" havolasi (kabinetda o‘z sahifasi bor) */
export function NotificationBell({ listPath = '/notifications' }: { listPath?: string } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const summaryQuery = useQuery({
    queryKey: queryKeys.notifications.summary,
    queryFn: notificationsService.summary,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list(PREVIEW_PARAMS),
    queryFn: () => notificationsService.list(PREVIEW_PARAMS),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
    const link = notificationLink(item.entityType, item.entityId);
    setOpen(false);
    if (link) navigate(link);
  };

  const unread = summaryQuery.data?.unread ?? 0;
  // Muhim xabar bo'lsa qo'ng'iroqcha yonida ogohlantiruvchi nuqta turadi — raqamning o'zi
  // "shoshilinch ish bormi?" degan savolga javob bermaydi.
  const unreadHigh = summaryQuery.data?.unreadHigh ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Bildirishnomalar (${unread} ta o‘qilmagan${unreadHigh > 0 ? `, ${unreadHigh} tasi muhim` : ''})`
            : 'Bildirishnomalar'
        }
        className="relative grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            className={cn(
              'absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white',
              unreadHigh > 0 ? 'bg-red-600 ring-2 ring-red-300 dark:ring-red-900' : 'bg-brand-600',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-fg">
              Bildirishnomalar
              {unread > 0 && <span className="ml-1.5 text-xs text-fg-muted">({unread} ta yangi)</span>}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-300"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Hammasini o‘qish
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQuery.isPending ? (
              <p className="px-4 py-6 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
            ) : listQuery.isError ? (
              <p className="px-4 py-6 text-center text-sm text-red-600 dark:text-red-400">{getErrorMessage(listQuery.error)}</p>
            ) : listQuery.data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-fg-muted">Bildirishnoma yo‘q</p>
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
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted',
                          !item.isRead && 'bg-brand-50/40 dark:bg-brand-950/30',
                        )}
                      >
                        <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', NOTIFICATION_TYPE_CLASSES[item.type])}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn('truncate text-sm', item.isRead ? 'text-fg' : 'font-semibold text-fg')}>{item.title}</span>
                            {item.priority === 'HIGH' && (
                              <span className="shrink-0 rounded px-1 text-[10px] font-medium text-red-700 ring-1 ring-red-300 dark:text-red-300 dark:ring-red-800">
                                muhim
                              </span>
                            )}
                            {!item.isRead && <span className="size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-xs text-fg-muted">{item.message}</span>
                          <span className="mt-1 block text-[11px] text-fg-subtle">
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

          <Link
            to={listPath}
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-surface-muted dark:text-brand-300"
          >
            Barchasini ko‘rish
          </Link>
        </div>
      )}
    </div>
  );
}
