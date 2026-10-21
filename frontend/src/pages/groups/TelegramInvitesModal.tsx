import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { groupsService } from '@/services/groups.service';
import { pendingInviteRows, printTelegramInvites } from '@/lib/telegramInvites';

/**
 * Guruh uchun Telegram taklifnomalari: o'quvchi va ota-onalar QR kodi bilan chop etiladigan kartochkalar.
 * Ochilganda kodlar yaratiladi (14 kun, bir martalik) — shu sabab so'rov bir marta yuboriladi.
 */
export function TelegramInvitesModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['groups', 'telegram-invites', groupId],
    queryFn: () => groupsService.telegramInvites(groupId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const data = query.data;
  const pending = data ? pendingInviteRows(data) : [];
  const studentsLinked = data?.rows.filter((row) => row.link.linked).length ?? 0;
  const parents = new Map((data?.rows ?? []).flatMap((row) => row.parents.map((parent) => [parent.id, parent] as const)));
  const parentsLinked = [...parents.values()].filter((parent) => parent.link.linked).length;
  const withoutParent = data?.rows.filter((row) => row.parents.length === 0).length ?? 0;

  return (
    <Modal
      open
      size="lg"
      title="Telegram taklifnomalari"
      description="O‘quvchi va ota-onalar QR kodni skanerlab Telegram botga ulanadi — davomat, vazifa va to‘lov xabarlari keladi"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
          <Button
            leftIcon={<Printer className="size-4" aria-hidden />}
            disabled={!data?.enabled || pending.length === 0}
            onClick={() => {
              if (data && !printTelegramInvites(data)) toast.error('Brauzer chop etish oynasini to‘sib qo‘ydi — qalqib chiquvchi oynalarga ruxsat bering');
            }}
          >
            Chop etish ({pending.length})
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          {!data!.enabled && <Alert tone="warning">Telegram bot sozlanmagan — havola yaratib bo‘lmaydi. Sozlamalar → Telegram.</Alert>}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">O‘quvchilar ulangan</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">
                {studentsLinked} / {data!.rows.length}
              </dd>
            </div>
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">Ota-onalar ulangan</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">
                {parentsLinked} / {parents.size}
              </dd>
            </div>
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">Ota-onasi kiritilmagan</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">{withoutParent}</dd>
            </div>
          </dl>
          {withoutParent > 0 && (
            <Alert tone="info">
              {withoutParent} ta o‘quvchining ota-onasi profilga kiritilmagan — ular uchun faqat o‘quvchi QR kodi chiqadi.{' '}
              <Link to="/parents" className="font-medium underline">
                Ota-onalar → O‘quvchilardan import
              </Link>
            </Alert>
          )}
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-control border border-border">
            {data!.rows.map((row) => (
              <li key={row.student.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body">
                <span className="min-w-0">
                  <span className="text-fg">{row.student.name}</span> <span className="font-mono text-caption text-fg-subtle">{row.student.code}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={row.link.linked ? 'success' : 'neutral'}>O‘quvchi: {row.link.linked ? 'ulangan' : 'ulanmagan'}</Badge>
                  {row.parents.map((parent) => (
                    <Badge key={parent.id} tone={parent.link.linked ? 'success' : 'neutral'}>
                      Ota-ona: {parent.link.linked ? 'ulangan' : 'ulanmagan'}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">Kod 14 kun amal qiladi va bir marta ishlaydi. Ulanganlar varaqqa chiqmaydi.</p>
        </div>
      )}
    </Modal>
  );
}
