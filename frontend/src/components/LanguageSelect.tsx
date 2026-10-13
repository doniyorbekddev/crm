import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useLanguageStore } from '@/i18n/language.store';
import { LANGUAGES, isLanguage } from '@/i18n/languages';

/**
 * Interfeys tili. Til nomlari har doim o'z tilida yoziladi va tarjima qilinmaydi (`data-no-translate`) —
 * foydalanuvchi tushunmaydigan tilga o'tib qolsa ham o'z tilini topa oladi.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const language = useLanguageStore((state) => state.language);
  const loading = useLanguageStore((state) => state.loading);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <label data-no-translate className={cn('focus-within:focus-ring relative inline-flex h-8 items-center gap-1 rounded-control border border-border bg-surface-muted pl-2 text-caption text-fg-muted hover:text-fg', loading && 'opacity-60', className)}>
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">Til / Язык / Language</span>
      <select
        aria-label="Til / Язык / Language"
        value={loading ?? language}
        disabled={loading !== null}
        onChange={(event) => {
          if (isLanguage(event.target.value)) void setLanguage(event.target.value).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Xatolik'));
        }}
        className="h-full cursor-pointer appearance-none rounded-control bg-transparent pr-2 pl-1 font-medium text-fg outline-none"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code} lang={item.htmlLang}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
