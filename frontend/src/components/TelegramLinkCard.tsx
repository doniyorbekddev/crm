import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { telegramService } from '@/services/telegram.service';
import { formatDateTime } from '@/utils/format';

/** Botning buyruqlari — serverdagi `BOT_COMMAND_MENU` bilan bir xil tartibda */
const PORTAL_COMMANDS = [
  ['/qarz', 'qarz va keyingi to‘lov muddati'],
  ['/darslar', 'yaqin 7 kundagi darslar'],
  ['/davomat', 'oxirgi 10 dars davomati'],
  ['/holat', 'bog‘lanish holati'],
  ['/uzish', 'bog‘lanishni uzish'],
] as const;

const STAFF_COMMANDS = [
  ['/holat', 'bog‘lanish holati'],
  ['/uzish', 'bog‘lanishni uzish'],
] as const;

/**
 * Telegramni ulash. Bot tokeni sozlanmagan bo‘lsa ham ko‘rinadi — kod beriladi,
 * lekin xabar yuborilmasligi haqida ogohlantiriladi.
 *
 * `audience` — buyruqlar ro‘yxati kimga ko‘rsatilishi. Kabinetda o‘quvchi/ota-ona
 * buyruqlari bor, xodimda esa faqat bog‘lanishni boshqarish: ma’lumot buyruqlari
 * xodim chatida ishlamaydi va ularni taklif qilish chalkashlik bo‘lardi.
 */
export function TelegramLinkCard({ audience = 'staff' }: { audience?: 'staff' | 'portal' }) {
  const queryClient = useQueryClient();
  const linkQuery = useQuery({ queryKey: queryKeys.telegram.me, queryFn: () => telegramService.myLink() });

  const unlink = useMutation({
    mutationFn: () => telegramService.unlink(),
    onSuccess: (message) => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.telegram.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <Send className="size-4 text-fg-muted" aria-hidden />
      </CardHeader>
      <CardContent>
        {linkQuery.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : linkQuery.isError ? (
          <ErrorState error={linkQuery.error} onRetry={() => void linkQuery.refetch()} />
        ) : linkQuery.data.verifiedAt ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">Ulangan</Badge>
              {linkQuery.data.chatTitle && <span className="text-sm text-fg">{linkQuery.data.chatTitle}</span>}
              <span className="text-xs text-fg-muted">{formatDateTime(linkQuery.data.verifiedAt)}</span>
            </div>
            <p className="text-sm text-fg-muted">Eslatmalar Telegramga ham yuboriladi.</p>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="mb-2 text-xs font-medium text-fg-muted">Botga yuborish mumkin bo‘lgan buyruqlar</p>
              <ul className="space-y-1">
                {(audience === 'portal' ? PORTAL_COMMANDS : STAFF_COMMANDS).map(([command, description]) => (
                  <li key={command} className="text-sm text-fg-muted">
                    <code className="font-mono text-fg">{command}</code> — {description}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="secondary" onClick={() => unlink.mutate()} loading={unlink.isPending}>
              Uzish
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {!linkQuery.data.enabled && (
              <Alert tone="warning">
                Telegram boti hali sozlanmagan — kodni saqlab qo‘yishingiz mumkin, lekin xabarlar bot
                ulangandan keyin kela boshlaydi.
              </Alert>
            )}
            <p className="text-sm text-fg-muted">
              Botga quyidagi buyruqni yuboring — shundan keyin eslatmalar Telegramga ham keladi:
            </p>
            <code className="block rounded-lg border border-border bg-surface-muted p-3 font-mono text-sm text-fg">
              /start {linkQuery.data.linkCode}
            </code>
            {linkQuery.data.deepLink && (
              <a
                href={linkQuery.data.deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Telegramda ochish
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
