import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-surface-muted text-fg-subtle">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-fg">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
