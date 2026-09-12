import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-6xl font-bold tracking-tight text-brand-600">404</p>
      <div>
        <h1 className="text-xl font-semibold">Sahifa topilmadi</h1>
        <p className="mt-2 max-w-sm text-sm text-fg-muted">
          Siz qidirayotgan sahifa mavjud emas yoki boshqa manzilga ko‘chirilgan.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Bosh sahifaga qaytish
      </Link>
    </main>
  );
}
