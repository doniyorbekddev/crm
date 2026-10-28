import { useEffect } from 'react';

/** Foydalanuvchi harakatni kamaytirishni so'raganmi (brauzer sozlamasi) */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Ildizda bir marta: sahifa effektlari uchun yagona kuzatuvchilar.
 *
 * - `data-reveal` / `data-reveal="stagger"` — element ekranga kirganda paydo bo'ladi. Yashirish faqat
 *   `html[data-reveal-ready]` dan keyin va faqat hozir ekranda **bo'lmagan** elementlarga (`data-reveal-pending`):
 *   JS bo'lmasa, element allaqachon ko'rinib turgan bo'lsa yoki reduced-motion'da — hech qachon yashirilmaydi.
 * - Yangi qo'shilgan tugunlar `MutationObserver` bilan topiladi (sahifa o'tishi, yuklangan ma'lumot).
 * - `data-spotlight` — sichqoncha o'rni `--mx`/`--my` o'zgaruvchilariga (rAF bilan, kadrga bir marta).
 *
 * CRM'da reveal faqat dashboard va hisobot kartalarida — jadval qatorlarida emas.
 */
export function MotionEffects(): null {
  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const seen = new WeakSet<Element>();

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.removeAttribute('data-reveal-pending');
          entry.target.setAttribute('data-revealed', '');
          reveal.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
    );

    const register = (element: Element) => {
      if (seen.has(element)) return;
      seen.add(element);
      const rect = element.getBoundingClientRect();
      // Allaqachon ekranda — yashirilmaydi (miltillash yo'q)
      if (rect.top < window.innerHeight && rect.bottom > 0) return;
      if (element.getAttribute('data-reveal') === 'stagger') {
        Array.from(element.children).forEach((child, index) => (child as HTMLElement).style.setProperty('--reveal-index', String(Math.min(index, 8))));
      }
      element.setAttribute('data-reveal-pending', '');
      reveal.observe(element);
    };
    const scan = (node: ParentNode) => node.querySelectorAll('[data-reveal]').forEach(register);

    scan(document);
    root.setAttribute('data-reveal-ready', '');
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.hasAttribute('data-reveal')) register(node);
          scan(node);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    const onPointerMove = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-spotlight]');
      if (!el) return;
      pending = { el, x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        const rect = pending.el.getBoundingClientRect();
        pending.el.style.setProperty('--mx', `${pending.x - rect.left}px`);
        pending.el.style.setProperty('--my', `${pending.y - rect.top}px`);
      });
    };
    document.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      reveal.disconnect();
      mutations.disconnect();
      document.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frame);
      root.removeAttribute('data-reveal-ready');
      // Kuzatuv to'xtasa — hech narsa yashirin qolmasin
      document.querySelectorAll('[data-reveal-pending]').forEach((element) => element.removeAttribute('data-reveal-pending'));
    };
  }, []);
  return null;
}
