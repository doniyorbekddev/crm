import { create } from 'zustand';
import { setDomTranslator } from './domTranslator';
import { LANGUAGES, LANGUAGE_STORAGE_KEY, SOURCE_LANGUAGE, isLanguage } from './languages';
import type { Language } from './languages';
import { loadTranslator } from './translate';

interface LanguageState {
  language: Language;
  /** Lug'at yuklanayotgan til (tugma holatini ko'rsatish uchun) */
  loading: Language | null;
  setLanguage: (language: Language) => Promise<void>;
}

function stored(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : SOURCE_LANGUAGE;
  } catch {
    return SOURCE_LANGUAGE;
  }
}

/** Oxirgi so'ralgan til — sekin yuklangan eski lug'at yangisining ustidan yozilmasin */
let requested: Language = SOURCE_LANGUAGE;

async function apply(language: Language): Promise<void> {
  requested = language;
  const translator = await loadTranslator(language);
  if (requested !== language) return;
  setDomTranslator(translator);
  document.documentElement.lang = LANGUAGES.find((item) => item.code === language)?.htmlLang ?? 'uz';
}

export const useLanguageStore = create<LanguageState>()((set, get) => ({
  language: SOURCE_LANGUAGE,
  loading: null,
  setLanguage: async (language) => {
    if (language === get().language && get().loading === null) return;
    set({ loading: language });
    try {
      await apply(language);
      set({ language, loading: null });
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // Maxfiy rejim yoki to'lgan xotira — til shu sessiyada ishlaydi, faqat eslab qolinmaydi
      }
    } catch {
      // Lug'at yuklanmadi (tarmoq) — avvalgi til o'z holicha qoladi
      set({ loading: null });
      throw new Error('Til lug‘atini yuklab bo‘lmadi');
    }
  },
}));

/** Lug'at shu vaqtda yuklanmasa — ilova kutmasdan o'zbekchada ochiladi, tarjima yuklangach o'zi qo'llanadi */
const STARTUP_WAIT_MS = 2_000;

/**
 * Ilova ishga tushganda saqlangan tilni qo'llaydi. Qaytgan va'da bajarilgach ilovani chizish kerak:
 * shunda sahifa avval o'zbekcha chiqib, keyin tarjimaga "sakrab" almashmaydi. Standart tilda darhol bajariladi.
 */
export function initLanguage(): Promise<void> {
  const language = stored();
  if (language === SOURCE_LANGUAGE) return Promise.resolve();
  const applied = useLanguageStore.getState().setLanguage(language).catch(() => undefined);
  return Promise.race([applied, new Promise<void>((resolve) => setTimeout(resolve, STARTUP_WAIT_MS))]);
}
