import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { useLogout } from '@/hooks/useLogout';
import { useAuthStore } from '@/store/auth.store';

export function UserMenu() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg p-1 pr-2 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-fg">
            {user.firstName} {user.lastName}
          </span>
          <span className="block max-w-40 truncate text-xs text-fg-muted">{user.role.name}</span>
        </span>
        <ChevronDown className="hidden size-4 text-fg-subtle sm:block" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-fg">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          </div>
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg hover:bg-surface-muted"
          >
            <UserRound className="size-4 text-fg-muted" aria-hidden />
            Profil
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
          >
            <LogOut className="size-4" aria-hidden />
            Chiqish
          </button>
        </div>
      )}
    </div>
  );
}
