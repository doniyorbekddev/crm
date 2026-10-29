import { Combobox } from './Combobox';
import { normalizeOptionText } from './optionList';
import type { SelectOption } from './optionList';

const CUSTOM_PREFIX = 'custom:';

interface CustomizableSelectProps<Code extends string> {
  id?: string;
  order: readonly Code[];
  labels: Record<Code, string>;
  /** "Boshqa" kodi: o'z nomi faqat shu kod bilan saqlanadi (backend ham shunday tozalaydi) */
  otherCode: Code;
  code: Code;
  customLabel: string | null;
  onChange: (code: Code, customLabel: string | null) => void;
  /** Markazda avval yozilgan nomlar — ro'yxatda tayyor band bo'lib chiqadi */
  suggestions?: readonly string[];
  createLabel?: (text: string) => string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

/**
 * Tizim qiymatlari + markazning o'z qiymatlari. Tizim kodlari (masalan lavozim → KPI qoidasi) o'zgarmaydi:
 * yangi nom "Boshqa" kodiga bog'lanib saqlanadi, keyingi safar esa oddiy band sifatida tanlanadi.
 */
export function CustomizableSelect<Code extends string>({
  id,
  order,
  labels,
  otherCode,
  code,
  customLabel,
  onChange,
  suggestions = [],
  createLabel = (text) => `“${text}” — o‘zim qo‘shaman`,
  ...rest
}: CustomizableSelectProps<Code>) {
  const systemLabels = new Set(order.map((value) => normalizeOptionText(labels[value])));
  const customs: string[] = [];
  for (const label of customLabel ? [customLabel, ...suggestions] : suggestions) {
    const key = normalizeOptionText(label);
    if (!systemLabels.has(key) && !customs.some((existing) => normalizeOptionText(existing) === key)) customs.push(label);
  }

  const options: SelectOption[] = [
    ...order.filter((value) => value !== otherCode).map((value) => ({ value, label: labels[value] })),
    ...customs.map((label) => ({ value: `${CUSTOM_PREFIX}${label}`, label, description: 'Markazda qo‘shilgan' })),
    { value: otherCode, label: labels[otherCode] },
  ];

  return (
    <Combobox
      id={id}
      options={options}
      value={code === otherCode && customLabel ? `${CUSTOM_PREFIX}${customLabel}` : code}
      onChange={(value) => {
        if (!value) return;
        if (value.startsWith(CUSTOM_PREFIX)) onChange(otherCode, value.slice(CUSTOM_PREFIX.length));
        else onChange(value as Code, null);
      }}
      clearable={false}
      placeholder="Tanlang yoki o‘zingiz yozing"
      onCreate={(text) => Promise.resolve(`${CUSTOM_PREFIX}${text}`)}
      createLabel={createLabel}
      createHint="Ro‘yxatda yo‘q bo‘lsa — o‘zingiz yozing"
      commitOnBlur
      {...rest}
    />
  );
}
