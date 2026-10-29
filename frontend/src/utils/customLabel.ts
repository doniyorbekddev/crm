/** "Boshqa" tanlanib o'z nomi yozilgan bo'lsa — o'sha nom, aks holda tizim yorlig'i */
export function withCustomLabel<Code extends string>(labels: Record<Code, string>, code: Code, customLabel?: string | null): string {
  return customLabel?.trim() ? customLabel : labels[code];
}
