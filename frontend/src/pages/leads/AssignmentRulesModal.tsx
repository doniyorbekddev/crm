import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import type { AssignmentRulePayload, LeadFormLookups } from '@/types/lead';
import { formatDateTime } from '@/utils/format';

interface RuleRow extends AssignmentRulePayload {
  fullName: string;
  lastAssignedAt: string | null;
  assignedToday: number;
}

/**
 * Yangi leadlarni avtomatik taqsimlash sozlamalari.
 *
 * Vazn — xodimning ulushi (2 vazn 1 vaznga nisbatan ikki barobar ko'p lead oladi),
 * kunlik limit — 0 bo'lsa cheklanmagan. Belgilanmagan xodim navbatga kirmaydi;
 * navbatda hech kim qolmasa lead biriktirilmagan holda qoladi va qo'lda olinadi.
 */
export function AssignmentRulesModal({ lookups, onClose }: { lookups: LeadFormLookups; onClose: () => void }) {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({ queryKey: queryKeys.leads.assignmentRules, queryFn: leadsService.assignmentRules });
  /** Foydalanuvchi o'zgartirgan maydonlar; qolgani serverdagi qoidadan olinadi */
  const [edits, setEdits] = useState<Record<string, Partial<AssignmentRulePayload>>>({});

  // Xodimlar ro'yxati va saqlangan qoidalar birlashtiriladi: qoidasi yo'q xodim ham
  // ro'yxatda turadi (o'chirilgan holatda), shunda uni bir belgilash bilan navbatga qo'shish mumkin.
  const list = useMemo<RuleRow[]>(() => {
    const saved = new Map((rulesQuery.data ?? []).map((rule) => [rule.userId, rule]));
    return lookups.managers.map((manager) => {
      const rule = saved.get(manager.id);
      return {
        userId: manager.id,
        fullName: `${manager.firstName} ${manager.lastName}`,
        weight: rule?.weight ?? 1,
        dailyLimit: rule?.dailyLimit ?? 0,
        isActive: rule?.isActive ?? false,
        lastAssignedAt: rule?.lastAssignedAt ?? null,
        assignedToday: rule?.assignedToday ?? 0,
        ...edits[manager.id],
      };
    });
  }, [rulesQuery.data, lookups.managers, edits]);

  const save = useMutation({
    mutationFn: () =>
      leadsService.saveAssignmentRules(
        list
          // Faqat navbatda qatnashadigan xodimlar saqlanadi — qolgan qoidalar o'chiriladi.
          .filter((row) => row.isActive)
          .map(({ userId, weight, dailyLimit, isActive }) => ({ userId, weight, dailyLimit, isActive })),
      ),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.assignmentRules });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const activeCount = list.filter((row) => row.isActive).length;

  function set(userId: string, patch: Partial<AssignmentRulePayload>) {
    setEdits((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
  }

  return (
    <Modal
      open
      size="lg"
      title="Leadlarni avtomatik taqsimlash"
      description="Navbatga kiradigan xodimlarni belgilang. Yangi lead eng uzoq vaqt lead olmagan xodimga tushadi."
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
      {rulesQuery.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : rulesQuery.isError ? (
        <ErrorState error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.map((row) => (
              <li key={row.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <Checkbox checked={row.isActive} onChange={(event) => set(row.userId, { isActive: event.target.checked })} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{row.fullName}</span>
                    <span className="block text-xs text-fg-subtle">
                      Bugun: {row.assignedToday} ta
                      {row.lastAssignedAt ? ` · oxirgi: ${formatDateTime(row.lastAssignedAt)}` : ' · hali lead olmagan'}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-end gap-2">
                  <label className="w-20">
                    <span className="mb-1 block text-xs text-fg-muted">Vazn</span>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={row.weight}
                      disabled={!row.isActive}
                      onChange={(event) => set(row.userId, { weight: Number(event.target.value) })}
                    />
                  </label>
                  <label className="w-24">
                    <span className="mb-1 block text-xs text-fg-muted">Kunlik limit</span>
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      value={row.dailyLimit}
                      disabled={!row.isActive}
                      onChange={(event) => set(row.userId, { dailyLimit: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle">
            {activeCount === 0
              ? 'Hech kim belgilanmagan — yangi leadlar biriktirilmagan holda keladi va ularni qo‘lda olish kerak.'
              : `Navbatda ${activeCount} xodim. Kunlik limit 0 bo‘lsa cheklanmagan.`}
          </p>
        </>
      )}
    </Modal>
  );
}
