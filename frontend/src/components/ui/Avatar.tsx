import { useState } from 'react';
import { cn } from '@/lib/cn';
import { appEnv } from '@/lib/env';

const SIZES = {
  xs: 'size-6 text-overline tracking-normal',
  sm: 'size-8 text-caption',
  md: 'size-10 text-body',
  lg: 'size-16 text-h2',
  xl: 'size-24 text-h1',
} as const;

interface AvatarProps {
  firstName: string;
  lastName?: string | null;
  /** Profil rasmi manzili (API bazasiga nisbatan, masalan "/public/avatars/…") — bo'lmasa bosh harflar */
  src?: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}

/** API javobidagi nisbiy rasm yo'li → to'liq manzil */
export function avatarSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^(https?:|data:|blob:)/.test(path) ? path : `${appEnv.apiUrl}${path}`;
}

export function Avatar({ firstName, lastName, src, size = 'md', className }: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase();
  const url = avatarSrc(src);
  // Rasm yuklanmasa (o'chirilgan, tarmoq) — bosh harflarga qaytiladi; manzil o'zgarsa qayta uriniladi
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = url !== null && failed !== url;

  return (
    <span
      aria-hidden
      className={cn(
        // Brend gradienti (oq matn bilan ≥ 5.4:1) — rasm bo'lsa uning ostida qoladi
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-brand-strong font-semibold text-white shadow-on-color',
        SIZES[size],
        className,
      )}
    >
      {showImage ? <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(url)} /> : initials}
    </span>
  );
}
