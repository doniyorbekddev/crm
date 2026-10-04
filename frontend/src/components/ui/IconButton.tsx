import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

const variantClasses = {
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  secondary: 'border border-border bg-surface text-fg-muted shadow-sm hover:bg-surface-muted hover:text-fg',
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
  danger: 'text-fg-muted hover:bg-danger-subtle hover:text-danger',
} as const;

const sizeClasses = {
  sm: 'size-7 [&_svg]:size-4',
  md: 'size-8 [&_svg]:size-4',
  lg: 'size-9 [&_svg]:size-5',
} as const;

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label' | 'children'> {
  /** Majburiy: ekran o'quvchi uchun nom va (standart holatda) maslahat matni */
  label: string;
  /** Ikonka (`lucide-react`) */
  children: ReactNode;
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  loading?: boolean;
  /** `false` — maslahat ko'rsatilmaydi (masalan, yonida ko'rinadigan matn bor) */
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

/** Faqat ikonkali tugma. Xom `<button>` o'rniga: nom, fokus halqasi va maslahat kafolatlanadi. */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  size = 'md',
  loading = false,
  tooltip = true,
  tooltipSide = 'top',
  className,
  disabled,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-grid shrink-0 place-items-center rounded-chip transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} side={tooltipSide} describe={false} disabled={disabled || loading}>
      {button}
    </Tooltip>
  );
}
