import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
}

export function ErrorState({ error, onRetry, retrying = false, title = 'Ma’lumotlarni yuklab bo‘lmadi' }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-card border border-danger-border bg-danger-subtle text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-body-lg font-medium text-fg">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-body text-fg-muted">{getErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" loading={retrying} leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}
