import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, BookOpenCheck, ClipboardList, FileCheck, GraduationCap, Layers, ScrollText, Search, Target, UserCog, Users, UsersRound, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { getErrorMessage } from '@/lib/api';
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global qidiruv"
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
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
            className="h-14 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div id={listId} className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">Qidirish uchun kamida 2 ta belgi kiriting</p>
          ) : searchQuery.isPending ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">Qidirilmoqda…</p>
          ) : searchQuery.isError ? (
            <p className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400">{getErrorMessage(searchQuery.error)}</p>
          ) : searchQuery.data.total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              «{searchQuery.data.query}» bo‘yicha hech narsa topilmadi
            </p>
          ) : (
            searchQuery.data.groups.map((group) => {
              // Noma'lum guruh (server yangiroq bo'lsa) — oynani yiqitmasin
              const Icon = GROUP_ICONS[group.key] ?? Search;
              return (
                <div key={group.key}>
                  <p className="bg-surface-muted/60 px-4 py-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                    {group.label}
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
                              'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              active ? 'bg-brand-50 dark:bg-brand-950/60' : 'hover:bg-surface-muted',
                            )}
                          >
                            <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-fg">{hit.title}</span>
                              <span className="block truncate text-xs text-fg-muted">{hit.subtitle}</span>
                            </span>
                            {hit.code && <span className="shrink-0 font-mono text-xs text-fg-subtle">{hit.code}</span>}
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

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
          <span>
            <kbd className="rounded border border-border px-1">↑</kbd> <kbd className="rounded border border-border px-1">↓</kbd> tanlash
            · <kbd className="rounded border border-border px-1">Enter</kbd> ochish
          </span>
          <span>
            <kbd className="rounded border border-border px-1">Esc</kbd> yopish
          </span>
        </div>
      </div>
    </div>
  );
}
