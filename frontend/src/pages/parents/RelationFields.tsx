import { Checkbox } from '@/components/ui/Checkbox';
import { CustomizableSelect } from '@/components/ui/CustomizableSelect';
import { FormField } from '@/components/ui/FormField';
import { useCustomLabels } from '@/hooks/useCustomLabels';
import type { RelationChoice } from '@/types/parent';
import { PARENT_RELATION_LABELS, PARENT_RELATION_ORDER } from '@/utils/parentLabels';

interface RelationFieldsProps {
  idPrefix: string;
  value: RelationChoice;
  isPrimary: boolean;
  onChange: (value: RelationChoice) => void;
  onPrimaryChange: (isPrimary: boolean) => void;
}

/** Qarindoshlik ("Buvi", "Aka" — o'zingiz yozasiz) va "asosiy vakil" belgisi — biriktirish modallarida umumiy */
export function RelationFields({ idPrefix, value, isPrimary, onChange, onPrimaryChange }: RelationFieldsProps) {
  const suggestions = useCustomLabels('parent-relation');

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
      <FormField label="Qarindoshlik" htmlFor={`${idPrefix}-relation`} required>
        <CustomizableSelect
          id={`${idPrefix}-relation`}
          order={PARENT_RELATION_ORDER}
          labels={PARENT_RELATION_LABELS}
          otherCode="OTHER"
          code={value.relation}
          customLabel={value.relationLabel}
          suggestions={suggestions}
          onChange={(relation, relationLabel) => onChange({ relation, relationLabel })}
        />
      </FormField>
      <label className="flex h-10 items-center gap-2 text-body text-fg">
        <Checkbox checked={isPrimary} onChange={(event) => onPrimaryChange(event.target.checked)} />
        Asosiy vakil (eslatmalar shu raqamga)
      </label>
    </div>
  );
}
