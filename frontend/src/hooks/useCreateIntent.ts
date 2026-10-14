import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL'dagi "yaratish" niyati: `/leads?create=1` — sahifa ochilishi bilan yaratish oynasi ochiladi */
export const CREATE_INTENT_PARAM = 'create';

/**
 * Topbar'dagi "Yaratish" menyusi yoki global qidiruv amallari sahifani `?create=1` bilan ochadi.
 * Sahifa niyatni bir marta bajaradi va parametrni URL'dan olib tashlaydi — orqaga qaytish yoki
 * yangilash oynani qayta ochmaydi. Ruxsat bo'lmasa niyat jimgina tashlab yuboriladi.
 */
export function useCreateIntent(open: () => void, allowed = true): void {
  const [params, setParams] = useSearchParams();
  const requested = params.get(CREATE_INTENT_PARAM) === '1';
  const openDialog = useEffectEvent(open);

  useEffect(() => {
    if (!requested) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(CREATE_INTENT_PARAM);
        return next;
      },
      { replace: true },
    );
    if (allowed) openDialog();
  }, [requested, allowed, setParams]);
}

/** Yaratish niyati bilan sahifa manzili */
export function createIntentUrl(path: string): string {
  return `${path}?${CREATE_INTENT_PARAM}=1`;
}
