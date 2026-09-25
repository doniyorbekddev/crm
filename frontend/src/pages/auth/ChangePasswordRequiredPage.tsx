import { LogOut } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLogout } from '@/hooks/useLogout';
import { useAuthStore } from '@/store/auth.store';

/**
 * Vaqtinchalik parol bilan kirilganda: o‘z parolini o‘rnatmaguncha boshqa sahifa ochilmaydi.
 * Backend ham shunday (`authenticate` → 403 PASSWORD_CHANGE_REQUIRED) — bu sahifa qulaylik.
 */
export default function ChangePasswordRequiredPage() {
  useDocumentTitle('Yangi parol');
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  // Parol almashtirildi — `setSession` yangi foydalanuvchini yozadi, bayroq tushadi
  if (user && !user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh bg-app">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" leftIcon={<LogOut className="size-4" aria-hidden />} onClick={() => logout.mutate()} loading={logout.isPending}>
              Chiqish
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Xush kelibsiz{user ? `, ${user.firstName}` : ''}!</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Sizga vaqtinchalik parol berilgan. Davom etish uchun faqat o‘zingiz biladigan yangi parol o‘rnating.
          </p>
        </div>
        <ChangePasswordCard />
      </main>
    </div>
  );
}
