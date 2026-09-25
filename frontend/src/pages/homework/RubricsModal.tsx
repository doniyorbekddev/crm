import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { rubricsService } from '@/services/homework.service';

interface CriterionDraft {
  title: string;
  weight: string;
}

const TEMPLATE: CriterionDraft[] = [
  { title: 'To‘g‘rilik', weight: '40' },
  { title: 'Kod sifati', weight: '20' },
  { title: 'Tushunish', weight: '20' },
  { title: 'To‘liqlik', weight: '10' },
  { title: 'Taqdimot', weight: '10' },
];

/**
 * Baholash mezonlari (TZ §20). O‘qituvchi o‘zi sozlaydi: mezon nomi va og‘irligi (%),
 * yig‘indi 100%. Rubrika o‘chirilmaydi — vazifalarda ishlatilgan bo‘lishi mumkin, faolsizlantiriladi.
 */
export function RubricsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [name, setName] = useState('');
  const [criteria, setCriteria] = useState<CriterionDraft[]>(TEMPLATE);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({ queryKey: queryKeys.homework.rubrics(showInactive), queryFn: () => rubricsService.list(showInactive) });
  const total = criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.homework.all });

  const create = useMutation({
    mutationFn: () =>
      rubricsService.create({
        name: name.trim(),
        criteria: criteria.map((item, index) => ({ key: `c${index + 1}`, title: item.title.trim(), weight: Number(item.weight) })),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setName('');
      setCriteria(TEMPLATE);
      setFormError(null);
      refresh();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => rubricsService.update(id, { isActive }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const patch = (index: number, value: Partial<CriterionDraft>) => setCriteria((current) => current.map((item, i) => (i === index ? { ...item, ...value } : item)));

  return (
    <Modal
      open
      size="lg"
      title="Baholash rubrikalari"
      description="Vazifani mezonlar bo‘yicha baholash — ball avtomatik hisoblanadi"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-fg">Mavjud rubrikalar</p>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <Checkbox checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Faolsizlarini ham
            </label>
          </div>
          {query.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : (query.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">Hali rubrika yo‘q.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {query.data!.map((rubric) => (
                <li key={rubric.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-fg">
                      {rubric.name}
                      {!rubric.isActive && <Badge>Faolsiz</Badge>}
                    </p>
                    <p className="text-xs text-fg-muted">{rubric.criteria.map((item) => `${item.title} ${item.weight}%`).join(' · ')}</p>
                  </div>
                  <Button size="sm" variant="ghost" loading={toggle.isPending} onClick={() => toggle.mutate({ id: rubric.id, isActive: !rubric.isActive })}>
                    {rubric.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium text-fg">Yangi rubrika</p>
          {formError && <Alert tone="error">{formError}</Alert>}
          <FormField label="Nomi" htmlFor="rubric-name" required>
            <Input id="rubric-name" value={name} maxLength={150} placeholder="Frontend loyiha rubrikasi" onChange={(event) => setName(event.target.value)} />
          </FormField>
          <ul className="space-y-2">
            {criteria.map((item, index) => (
              <li key={index} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                <Input aria-label={`${index + 1}-mezon nomi`} value={item.title} onChange={(event) => patch(index, { title: event.target.value })} />
                <Input aria-label={`${index + 1}-mezon og‘irligi`} inputMode="numeric" value={item.weight} onChange={(event) => patch(index, { weight: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
                <button
                  type="button"
                  aria-label={`${index + 1}-mezonni o‘chirish`}
                  disabled={criteria.length === 1}
                  onClick={() => setCriteria((current) => current.filter((_, i) => i !== index))}
                  className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-muted disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Plus className="size-4" aria-hidden />}
              disabled={criteria.length >= 10}
              onClick={() => setCriteria((current) => [...current, { title: '', weight: '0' }])}
            >
              Mezon qo‘shish
            </Button>
            <span className={total === 100 ? 'text-sm text-emerald-600 dark:text-emerald-400' : 'text-sm text-red-600 dark:text-red-400'}>Jami: {total}%</span>
          </div>
          <div className="flex justify-end">
            <Button
              loading={create.isPending}
              disabled={name.trim().length < 2 || total !== 100 || criteria.some((item) => item.title.trim().length < 2)}
              onClick={() => create.mutate()}
            >
              Rubrika yaratish
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
