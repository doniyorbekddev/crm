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

/**
 * Telegramni ulash. Bot tokeni sozlanmagan bo‘lsa ham ko‘rinadi — kod beriladi,
 * lekin xabar yuborilmasligi haqida ogohlantiriladi.
 */
export function TelegramLinkCard() {
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
