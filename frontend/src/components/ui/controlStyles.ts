/**
 * Matn kiritiladigan boshqaruvlar (Input, Select, Textarea, Combobox …) uchun umumiy ko'rinish.
 * Fokus: chegara + halqa (ko'rinadigan indikator — shuning uchun `outline-none` joiz).
 * Mobil'da 16px: iOS kichik shriftli maydonga fokus berilganda sahifani kattalashtirib yuboradi.
 */
export const controlClass =
  'w-full rounded-control border border-border bg-surface text-body-lg text-fg outline-none transition-colors sm:text-body ' +
  'placeholder:text-fg-subtle hover:border-fg-subtle/60 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/20 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60';

export const controlInvalidClass =
  'border-danger-solid hover:border-danger-solid focus:border-danger-solid focus:ring-danger-solid/20';
