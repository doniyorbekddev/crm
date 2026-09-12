import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
        <ShieldAlert className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Bu sahifaga ruxsatingiz yo‘q</h1>
        <p className="mt-2 max-w-md text-sm text-fg-muted">
          Sizning rolingizga bu bo‘lim uchun ruxsat berilmagan. Kerak bo‘lsa, administrator bilan bog‘laning.
        </p>
      </div>
      <Link to="/profile" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
        Profilga qaytish
      </Link>
    </div>
  );
}
