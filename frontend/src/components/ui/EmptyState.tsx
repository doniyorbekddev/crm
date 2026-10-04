import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** `sm` — karta yoki drawer ichidagi ixcham variant */
  size?: 'md' | 'sm';
  className?: string;
}

/** Bo'sh holat: ikonka, sarlavha, izoh va (bo'lsa) keyingi qadam */
export function EmptyState({ icon: Icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 text-center', size === 'md' ? 'py-14' : 'py-8', className)}>
      <div className="grid size-11 place-items-center rounded-card border border-border bg-surface-muted text-fg-subtle">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-body-lg font-medium text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-body text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
