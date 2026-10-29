import { Combobox } from './Combobox';
import { normalizeOptionText } from './optionList';

interface SuggestInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Avval yozilgan qiymatlar (ko'p ishlatilgani birinchi) */
  suggestions: readonly string[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

/**
 * Erkin matn + takliflar (bo'lim, o'lchov birligi…): ro'yxatdan tanlash yoki yangisini yozish.
 * Bir xil nom turli yozilishda ko'payib ketmasin — mos taklif bo'lsa o'shani tanlash taklif qilinadi.
 */
export function SuggestInput({ value, onChange, suggestions, placeholder = 'Tanlang yoki yozing', ...rest }: SuggestInputProps) {
  const labels = value && !suggestions.some((label) => normalizeOptionText(label) === normalizeOptionText(value)) ? [value, ...suggestions] : suggestions;

  return (
    <Combobox
      options={labels.map((label) => ({ value: label, label }))}
      value={value || null}
      onChange={(next) => onChange(next ?? '')}
      placeholder={placeholder}
      emptyText="Taklif yo‘q — yozing"
      onCreate={(text) => Promise.resolve(text)}
      createLabel={(text) => `“${text}” — yangi`}
      createHint="Yangisini yozing"
      commitOnBlur
      {...rest}
    />
  );
}
