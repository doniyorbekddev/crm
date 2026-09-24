import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { auditService } from '@/services/audit.service';

/**
 * Audit jurnali saqlash muddati. Muhim amallar (to'lov, maosh, rol o'zgarishi va h.k.)
 * alohida, uzunroq muddat bilan saqlanadi — ular tekshiruvda kerak bo'ladi.
 *
 * Yozuvni qo'lda o'chirish imkoni yo'q: eskilarini faqat tizim, shu muddat bo'yicha o'chiradi.
 */
export function RetentionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [retentionDays, setRetentionDays] = useState<string | null>(null);
  const [criticalDays, setCriticalDays] = useState<string | null>(null);

  const query = useQuery({ queryKey: queryKeys.audit.settings, queryFn: auditService.settings });

  const save = useMutation({
    mutationFn: () =>
      auditService.saveSettings({
        retentionDays: Number(retentionDays ?? query.data?.retentionDays ?? 365),
        criticalRetentionDays: Number(criticalDays ?? query.data?.criticalRetentionDays ?? 1825),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.audit.all });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal
      open
      title="Saqlash muddati"
      description="Muddati o‘tgan yozuvlarni tizim kuniga bir marta o‘chiradi."
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-3">
          <Alert tone="info">Audit yozuvini qo‘lda o‘chirib bo‘lmaydi — faqat shu muddat bo‘yicha eskirgani olib tashlanadi.</Alert>
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Oddiy yozuvlar (kun)</span>
            <Input
              type="number"
              min={0}
              max={3650}
              value={retentionDays ?? String(query.data?.retentionDays ?? 365)}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
            <span className="mt-1 block text-xs text-fg-subtle">0 — hech qachon o‘chirilmaydi</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Muhim amallar (kun)</span>
            <Input
              type="number"
              min={0}
              max={3650}
              value={criticalDays ?? String(query.data?.criticalRetentionDays ?? 1825)}
              onChange={(event) => setCriticalDays(event.target.value)}
            />
            <span className="mt-1 block text-xs text-fg-subtle">To‘lov, maosh, rol o‘zgarishi va boshqa muhim amallar</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
