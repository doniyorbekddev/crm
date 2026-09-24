import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { notificationsService } from '@/services/notifications.service';
import type { NotificationSetting } from '@/types/notification';
import {
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_PRIORITY_TONES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_ORDER,
} from '@/utils/notificationLabels';

/**
 * Bildirishnoma sozlamalari: har bir tur uchun ilova ichidagi qo'ng'iroqcha va Telegram
 * alohida yoqib-o'chiriladi.
 *
 * Tizim xabarlari (parol, ruxsat va h.k.) ataylab o'chirilmaydi — ular xavfsizlikka taalluqli,
 * shuning uchun ro'yxatda ko'rinadi, lekin qulflangan holda.
 *
 * O'chirilgan tur bo'yicha bildirishnoma **umuman yaratilmaydi**, shuning uchun keyin ham
 * ro'yxatda paydo bo'lmaydi — bu ataylab: xodim "kerak emas" degan xabar keyin ham bezovta
 * qilmasligi kerak.
 */
export function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  // Serverdagi holat nusxalanmaydi — faqat **o'zgartirilganlari** saqlanadi va ko'rsatishda
  // server qiymati ustiga qo'yiladi. Shu tufayli ma'lumot qayta yuklansa ham forma eskirmaydi.
  const [changes, setChanges] = useState<Record<string, { inApp: boolean; telegram: boolean }>>({});

  const query = useQuery({ queryKey: queryKeys.notifications.settings, queryFn: notificationsService.settings });

  const valueOf = (item: NotificationSetting) => changes[item.type] ?? { inApp: item.inApp, telegram: item.telegram };

  const save = useMutation({
    mutationFn: () => {
      const mutable = (query.data ?? []).filter((item) => item.canMute);
      return notificationsService.saveSettings(
        mutable.map((item) => ({ type: item.type, ...valueOf(item) })),
      );
    },
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggle = (item: NotificationSetting, channel: 'inApp' | 'telegram', value: boolean) => {
    const current = valueOf(item);
    setChanges((previous) => ({ ...previous, [item.type]: { ...current, [channel]: value } }));
  };

  // Ro'yxat tartibi bildirishnomalar filtri bilan bir xil bo'lsin; serverda yangi tur paydo
  // bo'lsa-yu, tartibda bo'lmasa — oxiriga qo'shiladi, ya'ni ko'rinmay qolmaydi.
  const ordered = (query.data ?? []).slice().sort((a, b) => {
    const left = NOTIFICATION_TYPE_ORDER.indexOf(a.type);
    const right = NOTIFICATION_TYPE_ORDER.indexOf(b.type);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });

  return (
    <Modal
      open
      size="lg"
      title="Bildirishnoma sozlamalari"
      description="Qaysi turdagi xabarlarni qayerda olishni o‘zingiz tanlaysiz"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={query.isPending || query.isError} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 pr-3 font-medium">Tur</th>
                <th className="w-24 py-2 text-center font-medium">Ilovada</th>
                <th className="w-24 py-2 text-center font-medium">Telegram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordered.map((item: NotificationSetting) => (
                <tr key={item.type}>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-fg">{NOTIFICATION_TYPE_LABELS[item.type]}</span>
                      {item.priority !== 'NORMAL' && (
                        <Badge tone={NOTIFICATION_PRIORITY_TONES[item.priority]}>{NOTIFICATION_PRIORITY_LABELS[item.priority]}</Badge>
                      )}
                      {!item.canMute && (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                          <Lock className="size-3" aria-hidden />
                          har doim yoqiq
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 text-center">
                    <Checkbox
                      checked={valueOf(item).inApp}
                      disabled={!item.canMute}
                      aria-label={`${NOTIFICATION_TYPE_LABELS[item.type]} — ilovada`}
                      onChange={(event) => toggle(item, 'inApp', event.target.checked)}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <Checkbox
                      checked={valueOf(item).telegram}
                      disabled={!item.canMute}
                      aria-label={`${NOTIFICATION_TYPE_LABELS[item.type]} — Telegram`}
                      onChange={(event) => toggle(item, 'telegram', event.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-fg-subtle">
            O‘chirilgan tur bo‘yicha xabar umuman yaratilmaydi — keyin ham ro‘yxatda ko‘rinmaydi. Amalning o‘zi (to‘lov,
            biriktirish va h.k.) baribir bajariladi.
          </p>
        </div>
      )}
    </Modal>
  );
}
