import { AlertTriangle, RotateCcw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.status === 404 ? 'Sahifa topilmadi.' : `Xatolik: ${error.status} ${error.statusText}`;
  }
  // Yangi versiya deploy qilingandan keyin eski chunk fayllari topilmasligi mumkin.
  if (error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message)) {
    return 'Ilovaning yangi versiyasi chiqdi. Sahifani yangilang.';
  }
  return 'Sahifani ko‘rsatishda kutilmagan xatolik yuz berdi.';
}

export default function RouteErrorPage() {
  const error = useRouteError();

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Nimadir noto‘g‘ri ketdi</h1>
        <p className="mt-2 max-w-sm text-sm text-fg-muted">{describeError(error)}</p>
      </div>
      <Button leftIcon={<RotateCcw className="size-4" aria-hidden />} onClick={() => window.location.reload()}>
        Sahifani yangilash
      </Button>
    </main>
  );
}
