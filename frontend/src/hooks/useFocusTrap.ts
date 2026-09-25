import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true');
}

/** Ochiq oynalar steki — ichma-ich oynalarda (Modal ichidan ConfirmDialog) faqat eng ustkisi fokusni ushlaydi */
const stack: HTMLElement[] = [];

/**
 * Oxirgi fokuslangan elementlar tarixi. Kerak, chunki oyna ichidagi `autoFocus` React commit
 * paytida — effektdan **oldin** — fokusni ko'chiradi; effekt ichida `activeElement` endi ochgan
 * tugma emas. Shu tarixdan oyna tashqarisidagi eng oxirgi element topiladi.
 */
const history: HTMLElement[] = [];
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      history.push(event.target);
      if (history.length > 10) history.shift();
    },
    true,
  );
}

function findOpener(container: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !container.contains(active)) return active;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const element = history[index]!;
    if (element.isConnected && !container.contains(element)) return element;
  }
  return null;
}

/** Esc kabi klaviatura amallari faqat eng ustki oynaga tegishli */
export function isTopDialog(element: HTMLElement | null): boolean {
  return element !== null && stack[stack.length - 1] === element;
}

/**
 * Oyna ichida fokusni ushlab turadi (TZ 3.0 §54, WAI-ARIA dialog pattern):
 *  - ochilganda fokus oynaga o'tadi (ichida `autoFocus` bo'lsa — o'sha qoladi);
 *  - Tab / Shift+Tab oyna chegarasidan chiqmaydi;
 *  - yopilganda fokus oynani ochgan elementga qaytadi.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    if (!container) return undefined;
    const opener = findOpener(container);
    stack.push(container);

    if (!container.contains(document.activeElement)) {
      (focusables(container)[0] ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || stack[stack.length - 1] !== container) return;
      const items = focusables(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.lastIndexOf(container);
      if (index !== -1) stack.splice(index, 1);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [ref, active]);
}
