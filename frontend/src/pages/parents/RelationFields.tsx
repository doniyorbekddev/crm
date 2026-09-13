import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import type { ParentRelation } from '@/types/parent';
import { PARENT_RELATION_LABELS, PARENT_RELATION_ORDER } from '@/utils/parentLabels';

interface RelationFieldsProps {
  idPrefix: string;
  relation: ParentRelation;
  isPrimary: boolean;
  onRelationChange: (relation: ParentRelation) => void;
  onPrimaryChange: (isPrimary: boolean) => void;
}

/** Qarindoshlik va "asosiy vakil" belgisi — biriktirish modallarida umumiy */
export function RelationFields({ idPrefix, relation, isPrimary, onRelationChange, onPrimaryChange }: RelationFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
      <FormField label="Qarindoshlik" htmlFor={`${idPrefix}-relation`} required>
        <Select id={`${idPrefix}-relation`} value={relation} onChange={(event) => onRelationChange(event.target.value as ParentRelation)}>
          {PARENT_RELATION_ORDER.map((value) => (
            <option key={value} value={value}>
              {PARENT_RELATION_LABELS[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <label className="flex h-10 items-center gap-2 text-sm text-fg">
        <Checkbox checked={isPrimary} onChange={(event) => onPrimaryChange(event.target.checked)} />
        Asosiy vakil (eslatmalar shu raqamga)
      </label>
    </div>
  );
}
