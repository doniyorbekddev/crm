import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Aurora tugmasi. Asosiy — gradient, hoverda yorug'lik (glow) va ustidan o'tuvchi nur; bosilganda `scale(.97)`,
 * qo'yib yuborilganda prujina bilan qaytadi. Faqat transform/opacity/soya animatsiya qilinadi.
 */
const variantClasses = {
  primary:
    'bg-gradient-primary text-white shadow-on-color hover:shadow-glow before:pointer-events-none before:absolute before:inset-0 before:-translate-x-full before:bg-(image:--app-sheen) before:transition-transform before:duration-slower before:ease-out hover:before:translate-x-full',
  secondary: 'border border-border bg-surface text-fg shadow-highlight hover:border-primary-border hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger-solid text-white shadow-on-color hover:bg-danger-solid-hover',
} as const;

const sizeClasses = {
  sm: 'h-8 gap-1.5 px-3 text-caption',
  md: 'h-9 gap-2 px-3.5 text-body',
  lg: 'h-11 gap-2 px-5 text-body',
  icon: 'size-9',
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  /** O'ngdagi ikonka (masalan strelka) — hoverda 3px oldinga siljiydi */
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = 'button',
  title,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Uzun matn "…" bilan qisqaradi — to'liq matn maslahatda
      title={title ?? (typeof children === 'string' ? children : undefined)}
      className={cn(
        'group/button focus-ring relative isolate inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden rounded-control font-medium whitespace-nowrap',
        'transition-[transform,box-shadow,background-color,border-color,color] duration-slow ease-spring active:scale-[0.97] active:duration-fast active:ease-out',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : leftIcon}
      {typeof children === 'string' ? <span className="min-w-0 truncate">{children}</span> : children}
      {rightIcon && (
        <span aria-hidden className="inline-flex shrink-0 transition-transform duration-normal ease-out group-hover/button:translate-x-[3px]">
          {rightIcon}
        </span>
      )}
    </button>
  );
}
