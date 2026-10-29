import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAnchorPosition } from '@/hooks/useAnchorPosition';
import { cn } from '@/lib/cn';
import { controlClass, controlInvalidClass } from './controlStyles';
import { filterOptions, nextEnabledIndex, normalizeOptionText } from './optionList';
import type { SelectOption } from './optionList';

interface ComboboxProps {
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  /** Ko'rinadigan label bo'lmasa (FormField ichida `id` yetarli) */
  'aria-label'?: string;
  'aria-describedby'?: string;
  placeholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  /** Server qidiruvi: berilsa ichki filtr ishlamaydi — `options` ni chaqiruvchi yangilaydi */
  onSearchChange?: (query: string) => void;
  /**
   * Ro'yxat oxirida "＋ yangi qo'shish" bandi: yozilgan matn bilan chaqiriladi, yaratilgan qiymatni qaytaradi
   * (u darhol tanlanadi). Xato bo'lsa ro'yxat ochiq qoladi — xabarni chaqiruvchi ko'rsatadi.
   */
  onCreate?: (label: string) => Promise<string | null>;
  /** Yaratish bandi matni, masalan `q => \`“${q}” kategoriyasini qo‘shish\`` */
  createLabel?: (query: string) => string;
  /** Hali hech narsa yozilmaganda yaratish bandida ko'rinadigan maslahat */
  createHint?: string;
  className?: string;
}

/**
 * Qidiruvli tanlash (WAI-ARIA combobox). Ro'yxat uzun bo'lganda (`o'quvchi`, `guruh`) oddiy `Select` o'rniga.
 * ↑/↓ — band, Enter — tanlash, Esc — yopish; fokus doim maydonda qoladi.
 */
export function Combobox({
  options,
  value,
  onChange,
  id,
  placeholder = 'Tanlang yoki qidiring',
  emptyText = 'Hech narsa topilmadi',
  invalid = false,
  disabled = false,
  clearable = true,
  loading = false,
  autoFocus = false,
  onSearchChange,
  onCreate,
  createLabel = (text) => `“${text}” qo‘shish`,
  createHint = 'Yangisini qo‘shish uchun nomini yozing',
  className,
  ...aria
}: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const style = useAnchorPosition(wrapperRef, open);

  const [creating, setCreating] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  const visible = onSearchChange ? [...options] : filterOptions(options, query);
  const typed = query.trim().replace(/\s+/g, ' ');
  // Aynan shu nom bor bo'lsa yaratish taklif qilinmaydi — mavjudini tanlash kerak
  const canCreate = Boolean(onCreate) && typed.length >= 2 && !options.some((option) => normalizeOptionText(option.label) === normalizeOptionText(typed));
  /** Yaratish bandi klaviaturada oddiy band kabi: ro'yxatdagi oxirgi indeks */
  const createIndex = canCreate ? visible.length : -1;

  const openList = () => {
    if (disabled || open) return;
    setQuery('');
    onSearchChange?.('');
    setActive(selected ? options.findIndex((option) => option.value === selected.value) : -1);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const select = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };
  const create = async () => {
    if (!onCreate || !canCreate || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(typed);
      if (created) {
        onChange(created);
        close();
      }
    } catch {
      // Xabar chaqiruvchida; ro'yxat ochiq qoladi, matnni tuzatib qayta urinish mumkin
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      // Yaratish bandi ro'yxat oxiridagi oddiy band kabi aylanadi
      const navigable = createIndex >= 0 ? [...visible, { value: '', label: typed }] : visible;
      setActive(nextEnabledIndex(navigable, active, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (active === createIndex && createIndex >= 0) {
        void create();
        return;
      }
      const option = visible[active];
      if (option) select(option);
      // Mos band yo'q, lekin yangi nom yozilgan — Enter uni qo'shadi
      else if (canCreate && visible.length === 0) void create();
    } else if (event.key === 'Escape' && open) {
      // Faqat ro'yxat yopiladi — tashqi Modal/Drawer ochiq qoladi
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onChange={(event) => {
          setQuery(event.target.value);
          onSearchChange?.(event.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onClick={openList}
        onKeyDown={onKeyDown}
        className={cn(controlClass, 'h-10 pr-16 pl-3', invalid && controlInvalidClass)}
        {...aria}
      />
      <span className="absolute inset-y-0 right-2 flex items-center gap-0.5 text-fg-subtle">
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {clearable && selected && !disabled && (
          <button
            type="button"
            aria-label="Tanlovni tozalash"
            onClick={() => {
              onChange(null);
              inputRef.current?.focus();
            }}
            className="focus-ring grid size-6 place-items-center rounded-chip transition-colors hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
        <ChevronDown className="pointer-events-none size-4" aria-hidden />
      </span>
      {open &&
        style &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={style}
            // Fokus maydonda qolsin: ro'yxatni bosish blur chaqirmaydi
            onMouseDown={(event) => event.preventDefault()}
            className="z-dropdown animate-menu-in overflow-y-auto rounded-control border border-border bg-surface-elevated py-1 shadow-highlight shadow-md"
          >
            {visible.length === 0 ? (
              !canCreate && (
                <li role="presentation" className="px-3 py-2 text-body text-fg-muted">
                  {loading ? 'Yuklanmoqda…' : emptyText}
                </li>
              )
            ) : (
              visible.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  onClick={() => select(option)}
                  onMouseEnter={() => !option.disabled && setActive(index)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-fg',
                    index === active && 'bg-surface-muted',
                    option.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && <span className="block truncate text-caption text-fg-muted">{option.description}</span>}
                  </span>
                  {option.value === value && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </li>
              ))
            )}
            {onCreate &&
              (canCreate ? (
                <li
                  id={`${listId}-${createIndex}`}
                  role="option"
                  aria-selected={false}
                  aria-busy={creating || undefined}
                  onClick={() => void create()}
                  onMouseEnter={() => setActive(createIndex)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-body font-medium text-primary',
                    active === createIndex && 'bg-primary-subtle',
                  )}
                >
                  {creating ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <Plus className="size-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{createLabel(typed)}</span>
                  <kbd className="shrink-0 font-mono text-caption text-fg-subtle">Enter</kbd>
                </li>
              ) : (
                typed.length < 2 && (
                  <li role="presentation" className="flex items-center gap-2 border-t border-border px-3 py-2 text-caption text-fg-muted">
                    <Plus className="size-3.5 shrink-0" aria-hidden />
                    {createHint}
                  </li>
                )
              ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
