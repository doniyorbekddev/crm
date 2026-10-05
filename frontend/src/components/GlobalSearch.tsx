import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, BookOpenCheck, ClipboardList, FileCheck, GraduationCap, Layers, ScrollText, Search, Target, UserCog, Users, UsersRound, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { searchService } from '@/services/search.service';
import type { SearchGroupKey, SearchHit, SearchResult } from '@/types/search';

const GROUP_ICONS: Record<SearchGroupKey, LucideIcon> = {
  leads: Target,
  students: GraduationCap,
  parents: UsersRound,
  teachers: UserCog,
  transactions: ScrollText,
  courses: BookOpen,
  groups: Layers,
  payments: Wallet,
  users: Users,
  certificates: Award,
  homework: ClipboardList,
  exams: FileCheck,
  lessons: BookOpenCheck,
  children: UsersRound,
};

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  /** Kabinet uchun: o'z qidiruv funksiyasi (standart — xodim global qidiruvi) */
  search?: (query: string) => Promise<SearchResult>;
  /** Kesh kaliti nomlar maydoni — kabinet va xodim natijalari aralashmasin */
  scopeKey?: string;
  placeholder?: string;
}

/** Ctrl+K / Cmd+K bilan ochiladigan global qidiruv oynasi */
export function GlobalSearch({ open, onClose, search = searchService.search, scopeKey = 'staff', placeholder = 'Ism, telefon, L-000123, ST-000045, kurs yoki guruh…' }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Fokus oynada qoladi; yopilganda qidiruvni ochgan elementga qaytadi
  useFocusTrap(dialogRef, open);
  const listId = useId();

  const [value, setValue] = useState('');
  const query = useDebounce(value.trim(), 300);
  /** Tanlangan qator natijalar to‘plamiga bog‘lanadi: yangi natija kelsa avtomatik birinchisiga qaytadi */
  const [selection, setSelection] = useState<{ key: string; index: number }>({ key: '', index: 0 });

  const searchQuery = useQuery({
    queryKey: [...queryKeys.search.query(query), scopeKey],
    queryFn: () => search(query),
    enabled: open && query.length >= 2,
    staleTime: 30_000,
  });

  /** Klaviatura bilan yurish uchun yassilangan ro‘yxat */
  const flatHits = useMemo<SearchHit[]>(
    () => (searchQuery.data?.groups ?? []).flatMap((group) => group.hits),
    [searchQuery.data],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const resultsKey = searchQuery.data ? `${searchQuery.data.query}:${flatHits.length}` : query;
  const activeIndex = selection.key === resultsKey ? selection.index : 0;
  const setActiveIndex = (next: number) => setSelection({ key: resultsKey, index: next });

  if (!open) return null;

  const goTo = (hit: SearchHit) => {
    onClose();
    setValue('');
    navigate(hit.url);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatHits.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % flatHits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((activeIndex - 1 + flatHits.length) % flatHits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flatHits[activeIndex];
      if (hit) goTo(hit);
    }
  };

  let flatIndex = -1;

  return createPortal(
    <div className="fixed inset-0 z-command flex items-start justify-center p-3 pt-[8vh] sm:p-4 sm:pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden />

      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label="Global qidiruv"
        className="relative flex w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-dialog border border-border bg-surface-elevated shadow-md outline-none"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-label="Qidiruv"
            aria-controls={listId}
            className="h-13 flex-1 bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-subtle sm:text-body [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="focus-ring grid size-8 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div id={listId} className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <p className="px-4 py-10 text-center text-body text-fg-muted">Qidirish uchun kamida 2 ta belgi kiriting</p>
          ) : searchQuery.isPending ? (
            <div className="space-y-3 px-4 py-4" aria-busy="true" aria-label="Qidirilmoqda">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-control" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery.isError ? (
            <ErrorState error={searchQuery.error} title="Qidiruv bajarilmadi" retrying={searchQuery.isFetching} onRetry={() => void searchQuery.refetch()} />
          ) : searchQuery.data.total === 0 ? (
            <p className="px-4 py-10 text-center text-body text-fg-muted">
              «{searchQuery.data.query}» bo‘yicha hech narsa topilmadi
            </p>
          ) : (
            searchQuery.data.groups.map((group) => {
              // Noma'lum guruh (server yangiroq bo'lsa) — oynani yiqitmasin
              const Icon = GROUP_ICONS[group.key] ?? Search;
              return (
                <div key={group.key}>
                  <p className="flex items-center justify-between bg-surface-muted px-4 py-1.5 text-overline text-fg-muted uppercase">
                    {group.label}
                    <span className="tabular-nums">{group.hits.length}</span>
                  </p>
                  <ul>
                    {group.hits.map((hit) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      const active = index === activeIndex;
                      return (
                        <li key={`${group.key}-${hit.id}`}>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => goTo(hit)}
                            className={cn(
                              'flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors',
                              active ? 'bg-primary-subtle' : 'hover:bg-surface-muted',
                            )}
                          >
                            <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-fg-muted')} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body text-fg">{hit.title}</span>
                              <span className="block truncate text-caption text-fg-muted">{hit.subtitle}</span>
                            </span>
                            {hit.code && <span className="shrink-0 font-mono text-caption text-fg-subtle">{hit.code}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden items-center justify-between gap-2 border-t border-border px-4 py-2 text-caption text-fg-subtle sm:flex">
          <span>
            <kbd className="rounded-sm border border-border bg-surface px-1 font-sans">↑</kbd> <kbd className="rounded-sm border border-border bg-surface px-1 font-sans">↓</kbd> tanlash
            · <kbd className="rounded-sm border border-border bg-surface px-1 font-sans">Enter</kbd> ochish
          </span>
          <span>
            <kbd className="rounded-sm border border-border bg-surface px-1 font-sans">Esc</kbd> yopish
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
