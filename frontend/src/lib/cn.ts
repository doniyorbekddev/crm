import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind klasslarini shartli birlashtiradi va to‘qnashganlarini to‘g‘ri hal qiladi. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
