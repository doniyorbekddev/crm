export interface SelectOption {
  value: string;
  label: string;
  /** Ikkinchi qator (masalan telefon yoki guruh) */
  description?: string;
  disabled?: boolean;
}

/** Katta-kichik harf va apostrof turlariga befarq qidiruv (o‘ / o' / oʻ) */
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[‘’ʻʼ`']/g, "'");

export function filterOptions<Option extends SelectOption>(options: readonly Option[], query: string): Option[] {
  const needle = normalize(query.trim());
  if (!needle) return [...options];
  return options.filter((option) => normalize(option.label).includes(needle) || (option.description ? normalize(option.description).includes(needle) : false));
}

/** Keyingi tanlash mumkin bo'lgan band (o'chirilganlar o'tkazib yuboriladi, chetda aylanadi) */
export function nextEnabledIndex(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  if (options.length === 0) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (from + step * offset + options.length * offset) % options.length;
    if (!options[index]!.disabled) return index;
  }
  return -1;
}
