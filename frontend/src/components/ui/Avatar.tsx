import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
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
        'inline-grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200',
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
