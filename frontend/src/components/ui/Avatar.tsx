import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'size-6 text-overline tracking-normal',
  sm: 'size-8 text-caption',
  md: 'size-10 text-body',
  lg: 'size-16 text-h2',
} as const;

interface AvatarProps {
  firstName: string;
  lastName?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ firstName, lastName, size = 'md', className }: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-primary-subtle font-semibold text-primary ring-1 ring-primary-border ring-inset',
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
