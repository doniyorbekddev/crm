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
      <div className="grid size-12 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-fg">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{getErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" loading={retrying} leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}
