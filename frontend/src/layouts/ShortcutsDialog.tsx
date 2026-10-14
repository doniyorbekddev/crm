import { Modal } from '@/components/ui/Modal';

const SHORTCUTS: ReadonlyArray<{ keys: string[]; label: string }> = [
  { keys: ['Ctrl', 'K'], label: 'Global qidiruv va tez amallar' },
  { keys: ['/'], label: 'Global qidiruv' },
  { keys: ['↑', '↓'], label: 'Qidiruv natijalari va menyular bo‘ylab yurish' },
  { keys: ['Enter'], label: 'Tanlanganini ochish' },
  { keys: ['Esc'], label: 'Oyna yoki menyuni yopish' },
  { keys: ['?'], label: 'Shu ro‘yxatni ochish' },
];

/** Klaviatura yorliqlari ro'yxati — `?` bilan ochiladi */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Klaviatura yorliqlari" description="macOS’da Ctrl o‘rniga ⌘ ishlaydi" size="sm">
      <ul className="divide-y divide-border">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-body text-fg">{shortcut.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className="min-w-6 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-center font-sans text-caption text-fg-muted">
                  {key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
