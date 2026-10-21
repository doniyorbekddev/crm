import { useMutation, useQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { parentsService } from '@/services/parents.service';
import { formatPhone } from '@/utils/format';

/**
 * O'quvchilarning "Ota-onasining telefon raqami" maydonidan ota-ona profillarini yaratish.
 * Avval reja ko'rsatiladi (hech narsa yozilmaydi), tasdiqlangandan keyin bajariladi.
 */
export function ImportParentsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const plan = useQuery({
    queryKey: ['parents', 'import-plan'],
    queryFn: () => parentsService.importFromStudents(true).then((result) => result.data),
    staleTime: 0,
    gcTime: 0,
  });
  const run = useMutation({
    mutationFn: () => parentsService.importFromStudents(false),
    onSuccess: (result) => {
      toast.success(result.message);
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const data = plan.data;

  return (
    <Modal
      open
      size="lg"
      title="O‘quvchilardan ota-onalarni import qilish"
      description="O‘quvchi kartasidagi ota-ona telefonidan ota-ona profillari yaratiladi — shunda ularga Telegram va kabinet orqali xabar yuborish mumkin"
      onClose={onClose}
      closeDisabled={run.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
            Bekor qilish
          </Button>
          <Button loading={run.isPending} disabled={!data || data.items.length === 0} onClick={() => run.mutate()}>
            Tasdiqlash
          </Button>
        </>
      }
    >
      {plan.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : plan.isError ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Import qilinadigan ma’lumot yo‘q"
          description={`Ota-ona telefoni kiritilgan barcha o‘quvchilar (${data!.skippedAlreadyLinked}) allaqachon ota-onaga bog‘langan`}
        />
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">Yangi ota-ona</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">{data!.created}</dd>
            </div>
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">Mavjud ota-onaga bog‘lanadi</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">{data!.linkedToExisting}</dd>
            </div>
            <div className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-caption text-fg-muted">Allaqachon bog‘langan</dt>
              <dd className="text-body-lg font-semibold text-fg tabular-nums">{data!.skippedAlreadyLinked}</dd>
            </div>
          </dl>
          <Alert tone="info">
            Ism-familiya ma’lum emas — profil “Ali Valiyevning ota-onasi” deb nomlanadi va izohda belgilanadi; keyin tahrirlab to‘g‘rilaysiz.
            Bir telefon raqami — bitta ota-ona (aka-uka, opa-singillar bitta profilga bog‘lanadi).
          </Alert>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-control border border-border">
            {data!.items.map((item) => (
              <li key={item.phone} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body">
                <span className="min-w-0">
                  <span className="text-fg">{item.parentName}</span>{' '}
                  <span className="text-caption text-fg-muted tabular-nums">{formatPhone(item.phone)}</span>
                  <span className="block text-caption text-fg-subtle">{item.students.map((student) => student.name).join(', ')}</span>
                </span>
                <Badge tone={item.action === 'CREATE' ? 'primary' : 'neutral'}>{item.action === 'CREATE' ? 'Yangi' : 'Mavjudga bog‘lanadi'}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
