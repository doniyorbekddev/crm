import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
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
        className="focus-ring flex items-center gap-2.5 rounded-control p-1 transition-colors hover:bg-surface-muted sm:pr-2"
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-body-sm font-medium text-fg">
            {user.firstName} {user.lastName}
          </span>
          <span className="block max-w-40 truncate text-caption text-fg-muted">{user.role.name}</span>
        </span>
        <ChevronDown className="hidden size-4 text-fg-subtle sm:block" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-dropdown mt-2 w-60 animate-fade-in overflow-hidden rounded-control border border-border bg-surface-elevated py-1 shadow-md"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-body font-medium text-fg">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-caption text-fg-muted">{user.email}</p>
          </div>
          {/* Telefonda mavzu tanlovi shu yerda (yuqori panelda joy tejaladi) */}
          <div className="border-b border-border px-4 py-2.5 sm:hidden">
            <ThemeToggle />
          </div>
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-body text-fg outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted"
          >
            <UserRound className="size-4 text-fg-muted" aria-hidden />
            Profil
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body text-danger outline-none transition-colors hover:bg-danger-subtle focus-visible:bg-danger-subtle disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden />
            Chiqish
          </button>
        </div>
      )}
    </div>
  );
}
