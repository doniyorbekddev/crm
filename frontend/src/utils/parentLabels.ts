import type { ParentRelation } from '@/types/parent';
import { withCustomLabel } from './customLabel';

export const PARENT_RELATION_ORDER = ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'] as const satisfies readonly ParentRelation[];

export const PARENT_RELATION_LABELS: Record<ParentRelation, string> = {
  MOTHER: 'Onasi',
  FATHER: 'Otasi',
  GUARDIAN: 'Vasiy',
  OTHER: 'Boshqa',
};

/** "Buvi" (o'z nomi) yoki tizim yorlig'i */
export const relationText = (choice: { relation: ParentRelation; relationLabel?: string | null }) =>
  withCustomLabel(PARENT_RELATION_LABELS, choice.relation, choice.relationLabel);

/** API uchun: o'z nomi faqat "Boshqa" bilan yuboriladi */
export const relationPayload = (choice: { relation: ParentRelation; relationLabel: string | null }) => ({
  relation: choice.relation,
  ...(choice.relation === 'OTHER' && choice.relationLabel ? { relationLabel: choice.relationLabel } : {}),
});
