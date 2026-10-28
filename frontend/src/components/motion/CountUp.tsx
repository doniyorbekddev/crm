import { useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './MotionEffects';

const DURATION_MS = 900;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

interface ParsedNumber {
  value: number;
  /** Sonni xuddi asl ko'rinishda (ming ajratgich, kasr, prefiks/qo'shimcha) qayta yozadi */
  format: (value: number) => string;
}

/**
 * Tayyor formatlangan matndagi birinchi sonni ajratadi: "400 000 so‘m", "-650 000 so‘m", "75%", "4,5 ball".
 * Son topilmasa — null (animatsiyasiz ko'rsatiladi). Modul darajasidagi funksiya: render'da qayta yaratilmaydi.
 */
export function parseFormattedNumber(text: string): ParsedNumber | null {
  const match = /^(\D*?)([-\u2212]?)(\d{1,3}(?:([ \u00a0\u202f])\d{3})+|\d+)(?:([.,])(\d+))?(.*)$/su.exec(text);
  if (!match) return null;
  const [, prefix = '', sign = '', integer = '', group = '', decimalSeparator = '', decimals = '', suffix = ''] = match;
  const value = Number(`${sign ? '-' : ''}${integer.replace(/\D/g, '')}${decimals ? `.${decimals}` : ''}`);
  if (!Number.isFinite(value)) return null;
  const places = decimals.length;
  return {
    value,
    format: (current) => {
      const fixed = Math.abs(current).toFixed(places);
      const [whole = '0', fraction] = fixed.split('.');
      const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole;
      const negative = current < 0 && Number(fixed) !== 0;
      return `${prefix}${negative ? sign || '-' : ''}${grouped}${fraction ? `${decimalSeparator}${fraction}` : ''}${suffix}`;
    },
  };
}

/**
 * Raqam birinchi ko'ringanda 0 dan sanaladi (0.9s, ease-out). Yakuniy qiymat har doim haqiqiy matn tugunida — ekran
 * o'quvchi va qidiruv uni ko'radi; sanalayotgan raqam faqat ko'rinadigan bezak (`::after` matni, DOM'da ikkinchi matn
 * yo'q). Animatsiya tugagach oddiy matnga qaytadi. Reduced-motion'da yoki IntersectionObserver bo'lmasa — darhol yakuniy.
 */
export function CountUp({ text, className }: { text: string; className?: string }) {
  const parsed = parseFormattedNumber(text);
  const ref = useRef<HTMLSpanElement>(null);
  const [animating, setAnimating] = useState(
    () => parsed !== null && parsed.value !== 0 && !prefersReducedMotion() && typeof IntersectionObserver !== 'undefined',
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!animating || !parsed || !element) return undefined;
    element.dataset.count = parsed.format(0);
    let frame = 0;
    let start = 0;
    const tick = (time: number) => {
      start ||= time;
      const progress = Math.min((time - start) / DURATION_MS, 1);
      element.dataset.count = parsed.format(parsed.value * easeOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setAnimating(false);
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      frame = requestAnimationFrame(tick);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // Faqat birinchi ko'rinishda: keyingi qiymat o'zgarishlari darhol ko'rsatiladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animating]);

  if (!animating) return <span className={className}>{text}</span>;
  return (
    <span ref={ref} className={className ? `${className} count-up` : 'count-up'}>
      <span className="sr-only">{text}</span>
    </span>
  );
}
