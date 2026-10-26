import { ChevronDown, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useActiveIndicator } from '@/hooks/useActiveIndicator';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { hasPermission } from '@/utils/permissions';
import { NAV_SECTIONS, findNavEntry } from './navigation';

/**
 * Asosiy menyu: 240px (yig'ilganda 72px — faqat ikonkalar, nom maslahatda), telefonda — drawer.
 * Bo'limlar yig'iladi (tanlov saqlanadi); joriy sahifa bo'limi doim ochiq. Bandlar ruxsat bo'yicha ko'rinadi.
 */
export function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const closedSections = useUiStore((state) => state.collapsedNavSections);
  const toggleSection = useUiStore((state) => state.toggleNavSection);
  const { pathname } = useLocation();
  const activeSectionId = findNavEntry(pathname)?.section.id;
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(user, item.permission)),
  })).filter((section) => section.items.length > 0);

  // Faol bo'lim ustidagi yagona pill: bo'limdan bo'limga sirpanadi (hooks/useActiveIndicator)
  useActiveIndicator(navRef, pillRef, { selector: 'a[aria-current="page"]' }, [pathname, collapsed, closedSections, sections.length, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-overlay animate-fade-in bg-overlay lg:hidden" aria-hidden onClick={() => setMobileOpen(false)} />}
      <aside
        aria-label="Asosiy menyu"
        className={cn(
          'glass fixed inset-y-0 left-0 z-drawer flex w-60 flex-col border-r border-border transition-[transform,width] duration-normal ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          collapsed ? 'lg:w-18' : 'lg:w-60',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-muted px-4">
          <BrandMark showName={!collapsed} className={cn(collapsed && 'lg:mx-auto')} />
          <IconButton label="Menyuni yopish" tooltip={false} onClick={() => setMobileOpen(false)} className="lg:hidden">
            <X aria-hidden />
          </IconButton>
        </div>

        <nav ref={navRef} className="group/nav relative flex-1 overflow-y-auto px-3 py-3">
          {/* Sirpanuvchi pill: chap chetida gradient chiziq. Faqat transform/opacity animatsiya qilinadi */}
          <span
            ref={pillRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 rounded-control bg-primary-subtle opacity-0 shadow-highlight transition-[transform,opacity] duration-slow ease-out before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-pill before:bg-gradient-brand"
          />
          {sections.map((section, index) => {
            const listId = `nav-section-${section.id}`;
            // Yig'ilgan (ikonkali) ko'rinishda bo'lim sarlavhasi yo'q — hamma band ko'rinadi
            const open = collapsed || section.id === activeSectionId || !closedSections.includes(section.id);
            return (
              <div key={section.id} className={cn(index > 0 && 'mt-4')}>
                {collapsed ? (
                  <>
                    <p className="sr-only">{section.title}</p>
                    {index > 0 && <div aria-hidden className="mx-2 mb-3 hidden border-t border-border lg:block" />}
                    <p aria-hidden className="mb-1 px-2.5 text-overline text-fg-subtle uppercase lg:hidden">
                      {section.title}
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={open}
                    aria-controls={listId}
                    // Joriy sahifa shu bo'limda — yopib bo'lmaydi ("qayerdaman" yo'qolmasin)
                    disabled={section.id === activeSectionId}
                    className="focus-ring group mb-1 flex h-7 w-full items-center justify-between rounded-chip px-2.5 text-overline text-fg-subtle uppercase transition-colors hover:text-fg-muted disabled:pointer-events-none"
                  >
                    {section.title}
                    <ChevronDown
                      aria-hidden
                      className={cn('size-3.5 transition-transform duration-normal', !open && '-rotate-90', section.id === activeSectionId && 'opacity-0')}
                    />
                  </button>
                )}
                {open && (
                  <ul id={listId} className="space-y-0.5">
                    {section.items.map(({ to, label, icon: Icon }) => (
                      <li key={to}>
                        <Tooltip content={label} side="right" delay={150} describe={false} disabled={!collapsed} wrapperClassName="flex">
                          <NavLink
                            to={to}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                'focus-ring relative flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-body font-medium transition-colors',
                                collapsed && 'lg:justify-center lg:px-0',
                                isActive
                                  ? 'bg-primary-subtle text-primary group-data-[indicator=ready]/nav:bg-transparent'
                                  : 'text-fg-muted hover:bg-surface-muted/70 hover:text-fg',
                              )
                            }
                          >
                            <Icon className="size-4.5 shrink-0" aria-hidden />
                            <span className={cn('truncate', collapsed && 'lg:sr-only')}>{label}</span>
                          </NavLink>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
