import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { masteryService } from '@/services/mastery.service';
import type { MasterySettings } from '@/types/mastery';

type Draft = Record<'developing' | 'good' | 'mastered' | 'exam' | 'homework' | 'attendance' | 'lessons', string>;

function toDraft(settings: MasterySettings): Draft {
  return {
    developing: String(settings.thresholds.developing),
    good: String(settings.thresholds.good),
    mastered: String(settings.thresholds.mastered),
    exam: String(settings.weights.exam),
    homework: String(settings.weights.homework),
    attendance: String(settings.weights.attendance),
    lessons: String(settings.weights.lessons),
  };
}

/** O'zlashtirish chegaralari (TZ §27: sozlanadi) va manba og'irliklari — Owner / Super Admin */
export function MasterySettingsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.mastery.settings, queryFn: () => masteryService.settings() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const values = draft ?? (query.data ? toDraft(query.data) : null);

  const save = useMutation({
    mutationFn: (current: Draft) =>
      masteryService.updateSettings({
        thresholds: { developing: Number(current.developing), good: Number(current.good), mastered: Number(current.mastered) },
        weights: { exam: Number(current.exam), homework: Number(current.homework), attendance: Number(current.attendance), lessons: Number(current.lessons) },
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.mastery.all });
      onClose();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const field = (key: keyof Draft, label: string) => (
    <FormField label={label} htmlFor={`mastery-${key}`}>
      <Input id={`mastery-${key}`} inputMode="numeric" value={values?.[key] ?? ''} onChange={(event) => setDraft({ ...values!, [key]: event.target.value })} />
    </FormField>
  );

  return (
    <Modal
      open
      title="O‘zlashtirish sozlamalari"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => values && save.mutate(values)} loading={save.isPending} disabled={!values}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      {!values ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-fg">Chegaralar (%)</p>
            <div className="grid grid-cols-3 gap-3">
              {field('developing', 'Rivojlanmoqda')}
              {field('good', 'Yaxshi')}
              {field('mastered', 'O‘zlashtirilgan')}
            </div>
            <p className="mt-1 text-xs text-fg-subtle">Chegaradan past — zaif. O‘zgartirish barcha o‘quvchilar holatiga darhol qo‘llanadi.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-fg">Manbalar og‘irligi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {field('exam', 'Imtihon')}
              {field('homework', 'Vazifa')}
              {field('attendance', 'Davomat')}
              {field('lessons', 'Darslar')}
            </div>
            <p className="mt-1 text-xs text-fg-subtle">Nisbiy og‘irlik: ma’lumoti yo‘q manba hisobga olinmaydi. O‘zgarsa baholar fon rejimida qayta hisoblanadi.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
