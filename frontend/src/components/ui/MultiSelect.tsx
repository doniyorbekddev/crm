import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAnchorPosition } from '@/hooks/useAnchorPosition';
import { cn } from '@/lib/cn';
import { controlClass, controlInvalidClass } from './controlStyles';
import { filterOptions, nextEnabledIndex } from './optionList';
import type { SelectOption } from './optionList';

interface MultiSelectProps {
  options: readonly SelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Ekran o'quvchi uchun nom (yoki `id` + tashqi `<label htmlFor>`) */
  label?: string;
  id?: string;
  placeholder?: string;
  emptyText?: string;
  /** Standart: 8 tadan ko'p band bo'lsa qidiruv chiqadi */
  searchable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Bir nechta qiymat tanlash. Tugma tanlanganlarni qisqa ko'rsatadi ("3 ta tanlangan"),
 * ro'yxat `aria-multiselectable`. ↑/↓ — band, Enter (yoki bo'sh joy) — belgilash, Esc — yopish.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  id,
  placeholder = 'Tanlang',
  emptyText = 'Hech narsa topilmadi',
  searchable,
  invalid = false,
  disabled = false,
  className,
}: MultiSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const style = useAnchorPosition(triggerRef, open, { minWidth: 220 });

  const withSearch = searchable ?? options.length > 8;
  const visible = filterOptions(options, query);
  const selectedLabels = options.filter((option) => value.includes(option.value)).map((option) => option.label);
  const summary = selectedLabels.length === 0 ? null : selectedLabels.length <= 2 ? selectedLabels.join(', ') : `${selectedLabels.length} ta tanlangan`;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    if (returnFocus) triggerRef.current?.focus();
  };
  const toggle = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value]);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Panel joylashgach fokus ichkariga o'tadi (qidiruv yoki ro'yxat)
  const positioned = style !== null;
  useEffect(() => {
    if (open && positioned) (searchRef.current ?? listRef.current)?.focus();
  }, [open, positioned]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(nextEnabledIndex(visible, active, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target !== searchRef.current)) {
      event.preventDefault();
      const option = visible[active];
      if (option) toggle(option);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(controlClass, 'flex h-10 items-center justify-between gap-2 px-3 text-left', invalid && controlInvalidClass, className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !summary && 'text-fg-subtle')}>{summary ?? placeholder}</span>
        {value.length > 0 && (
          <span className="rounded-chip bg-primary-subtle px-1.5 text-caption font-medium text-primary tabular-nums" aria-hidden>
            {value.length}
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            onKeyDown={onPanelKeyDown}
            className="z-dropdown flex animate-fade-in flex-col overflow-hidden rounded-control border border-border bg-surface-elevated shadow-md"
          >
            {withSearch && (
              <div className="border-b border-border p-2">
                <input
                  ref={searchRef}
                  type="text"
                  aria-label="Ro‘yxatdan qidirish"
                  aria-controls={listId}
                  aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                  placeholder="Qidirish…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  className={cn(controlClass, 'h-8 px-2.5')}
                />
              </div>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              aria-label={label}
              aria-activedescendant={!withSearch && active >= 0 ? `${listId}-${active}` : undefined}
              tabIndex={withSearch ? -1 : 0}
              className="flex-1 overflow-y-auto py-1 outline-none"
            >
              {visible.length === 0 ? (
                <li role="presentation" className="px-3 py-2 text-body text-fg-muted">
                  {emptyText}
                </li>
              ) : (
                visible.map((option, index) => {
                  const checked = value.includes(option.value);
                  return (
                    <li
                      key={option.value}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={checked}
                      aria-disabled={option.disabled || undefined}
                      onClick={() => toggle(option)}
                      onMouseEnter={() => !option.disabled && setActive(index)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-body text-fg',
                        index === active && 'bg-surface-muted',
                        option.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded-sm border',
                          checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-fg-subtle bg-surface',
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description && <span className="block truncate text-caption text-fg-muted">{option.description}</span>}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
            {value.length > 0 && (
              <div className="flex justify-end border-t border-border p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange([]);
                    // Tugma yo'qoladi — fokus panel ichida qolsin (aks holda Esc/strelkalar ishlamay qoladi)
                    (searchRef.current ?? listRef.current)?.focus();
                  }}
                  className="focus-ring h-7 rounded-chip px-2 text-caption font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                >
                  Tozalash
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
