import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Dizayn tokenlari (index.css) tailwind-merge'ga tanishtiriladi — aks holda `text-h1` rang deb olinib
 * `text-fg` bilan "to'qnashadi", `rounded-card` esa `rounded-lg` ni almashtirmaydi.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'h1', 'h2', 'h3', 'h4', 'body-lg', 'body', 'body-sm', 'caption', 'label', 'overline'],
      radius: ['chip', 'control', 'card', 'dialog'],
      ease: ['standard'],
      animate: ['fade-in', 'pop-in', 'slide-in-right', 'slide-in-left', 'slide-in-up'],
    },
    classGroups: {
      z: [{ z: ['sticky', 'header', 'overlay', 'drawer', 'modal', 'command', 'dropdown', 'toast', 'tooltip'] }],
      duration: [{ duration: ['fast', 'normal', 'slow'] }],
    },
  },
});

/** Tailwind klasslarini shartli birlashtiradi va to‘qnashganlarini to‘g‘ri hal qiladi. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
