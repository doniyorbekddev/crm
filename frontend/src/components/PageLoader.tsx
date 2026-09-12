import { Loader2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center gap-2 text-fg-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">Yuklanmoqda...</span>
    </div>
  );
}
