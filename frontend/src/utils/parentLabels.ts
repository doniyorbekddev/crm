import type { ParentRelation } from '@/types/parent';

export const PARENT_RELATION_ORDER = ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'] as const satisfies readonly ParentRelation[];

export const PARENT_RELATION_LABELS: Record<ParentRelation, string> = {
  MOTHER: 'Onasi',
  FATHER: 'Otasi',
  GUARDIAN: 'Vasiy',
  OTHER: 'Boshqa',
};
