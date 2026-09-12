/**
 * Login’dan keyingi yo‘naltirish manzilini tekshiradi — faqat shu ilova ichidagi yo‘llar
 * (tashqi saytga yo‘naltirish — open redirect — hujumining oldini olish).
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
