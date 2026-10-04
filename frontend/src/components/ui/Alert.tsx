import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const TONES: Record<'info' | 'success' | 'warning' | 'error', { classes: string; icon: LucideIcon }> = {
  info: { classes: 'border-info-border bg-info-subtle text-info', icon: Info },
  success: { classes: 'border-success-border bg-success-subtle text-success', icon: CheckCircle2 },
  warning: { classes: 'border-warning-border bg-warning-subtle text-warning', icon: AlertTriangle },
  error: { classes: 'border-danger-border bg-danger-subtle text-danger', icon: XCircle },
};

export type AlertTone = keyof typeof TONES;

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { classes, icon: Icon } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-control border px-4 py-3 text-body', classes, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}
