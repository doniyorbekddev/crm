import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { gamificationService } from '@/services/gamification.service';
import type { BadgeCategory, BadgeRule } from '@/types/gamification';
import { BADGE_CATEGORY_LABELS, BADGE_RULE_LABELS, BADGE_RULE_UNITS, BADGE_THRESHOLD_RANGE } from '@/utils/gamificationLabels';

const RULES = Object.keys(BADGE_RULE_LABELS) as BadgeRule[];
const CATEGORIES = Object.keys(BADGE_CATEGORY_LABELS) as BadgeCategory[];
/** Talab turiga mos standart toifa (admin o'zgartirishi mumkin) */
const DEFAULT_CATEGORY: Record<BadgeRule, BadgeCategory> = {
  MANUAL: 'SPECIAL',
  STREAK_DAYS: 'ATTENDANCE',
  ATTENDANCE_RATE: 'ATTENDANCE',
  HOMEWORK_COUNT: 'ACADEMIC',
  EXAM_SCORE: 'ACADEMIC',
  COURSE_COMPLETED: 'ACADEMIC',
  XP_TOTAL: 'ACTIVITY',
  REFERRAL: 'SOCIAL',
};

interface Draft {
  name: string;
  description: string;
  icon: string;
  rule: BadgeRule;
  category: BadgeCategory;
  threshold: string;
  xpReward: string;
  isActive: boolean;
}

function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim().length < 2) errors.name = 'Kamida 2 belgi';
  if (draft.description.trim().length < 2) errors.description = 'Tavsif yozing';
  if (!draft.icon.trim()) errors.icon = 'Belgi (emoji) kiriting';
  const range = BADGE_THRESHOLD_RANGE[draft.rule];
  if (range) {
    const value = Number(draft.threshold);
    if (!/^\d+$/.test(draft.threshold) || value < range.min || value > range.max) errors.threshold = `${range.min}–${range.max} oralig‘ida butun son`;
  }
  if (!/^\d+$/.test(draft.xpReward) || Number(draft.xpReward) > 10_000) errors.xpReward = '0–10 000';
  return errors;
}

/** TZ 3.1 GAP-02 — yangi nishon: nom, tavsif, belgi, XP, toifa, talab, faollik */
export function BadgeFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ name: '', description: '', icon: '🏅', rule: 'HOMEWORK_COUNT', category: 'ACADEMIC', threshold: '5', xpReward: '50', isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const range = BADGE_THRESHOLD_RANGE[draft.rule];

  const create = useMutation({
    mutationFn: () =>
      gamificationService.createBadge({
        name: draft.name.trim(),
        description: draft.description.trim(),
        icon: draft.icon.trim(),
        category: draft.category,
        rule: draft.rule,
        ...(range ? { threshold: Number(draft.threshold) } : {}),
        xpReward: Number(draft.xpReward),
        isActive: draft.isActive,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gamification.all });
      toast.success(result.message);
      onClose();
    },
    onError: (error) => {
      const fields = Object.fromEntries(getFieldErrors(error).flatMap((detail) => (detail.field ? [[detail.field, detail.message]] : [])));
      setErrors(fields);
      if (Object.keys(fields).length === 0) toast.error(getErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  };

  return (
    <Modal
      open
      title="Yangi nishon"
      description="Avtomatik nishon talab bajarilganda beriladi; qo‘lda beriladigani — o‘quvchi profilidan"
      onClose={onClose}
      closeDisabled={create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="badge-form" loading={create.isPending}>
            Yaratish
          </Button>
        </>
      }
    >
      <form id="badge-form" className="grid gap-4 sm:grid-cols-[6rem_1fr]" onSubmit={submit} noValidate>
        <FormField label="Belgi" htmlFor="badge-icon" error={errors.icon} required>
          <Input id="badge-icon" value={draft.icon} maxLength={16} className="text-center text-xl" onChange={(event) => patch({ icon: event.target.value })} />
        </FormField>
        <FormField label="Nomi" htmlFor="badge-name" error={errors.name} required>
          <Input id="badge-name" value={draft.name} maxLength={100} invalid={Boolean(errors.name)} onChange={(event) => patch({ name: event.target.value })} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Tavsif" htmlFor="badge-description" error={errors.description} required>
            <Textarea id="badge-description" rows={2} maxLength={255} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <FormField label="Talab" htmlFor="badge-rule" error={errors.rule} required>
            <Select
              id="badge-rule"
              value={draft.rule}
              onChange={(event) => {
                const rule = event.target.value as BadgeRule;
                const next = BADGE_THRESHOLD_RANGE[rule];
                patch({ rule, category: DEFAULT_CATEGORY[rule], threshold: next ? String(Math.min(Math.max(Number(draft.threshold) || next.min, next.min), next.max)) : '' });
              }}
            >
              {RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {BADGE_RULE_LABELS[rule]}
                </option>
              ))}
            </Select>
          </FormField>
          {range ? (
            <FormField label={`Chegara (${BADGE_RULE_UNITS[draft.rule]})`} htmlFor="badge-threshold" error={errors.threshold} hint={`${range.min}–${range.max}`} required>
              <Input id="badge-threshold" inputMode="numeric" value={draft.threshold} invalid={Boolean(errors.threshold)} onChange={(event) => patch({ threshold: event.target.value.replace(/\D/g, '') })} />
            </FormField>
          ) : (
            <p className="self-end pb-2 text-xs text-fg-muted">{draft.rule === 'MANUAL' ? 'Xodim o‘quvchi profilidan beradi' : 'O‘quvchi kursni tugatganda (holat “Tugatdi”) beriladi'}</p>
          )}
          <FormField label="Toifa" htmlFor="badge-category" required>
            <Select id="badge-category" value={draft.category} onChange={(event) => patch({ category: event.target.value as BadgeCategory })}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {BADGE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="XP mukofoti" htmlFor="badge-xp" error={errors.xpReward}>
            <Input id="badge-xp" inputMode="numeric" value={draft.xpReward} invalid={Boolean(errors.xpReward)} onChange={(event) => patch({ xpReward: event.target.value.replace(/\D/g, '') })} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <Checkbox label="Faol (darhol beriladi)" checked={draft.isActive} onChange={(event) => patch({ isActive: event.target.checked })} />
        </div>
      </form>
    </Modal>
  );
}
