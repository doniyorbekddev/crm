import { Check, Eye, EyeOff, Lock, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { FinanceCategory } from '@/types/finance';
import { formatNumber } from '@/utils/format';
import { useFinanceCategories } from './useFinanceCategories';

interface CategoriesModalProps {
  kind: 'income' | 'expense';
  canManage: boolean;
  onClose: () => void;
}

/**
 * Kategoriyalarni boshqarish: qo'shish, nomini o'zgartirish, yashirish/qayta yoqish.
 * O'chirish yo'q — eski yozuvlar o'z kategoriyasida qolishi kerak; yashirilgani formada chiqmaydi.
 */
export function CategoriesModal({ kind, canManage, onClose }: CategoriesModalProps) {
  const { query, create, creating, update } = useFinanceCategories(kind);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const categories = query.data ?? [];
  const active = categories.filter((category) => category.isActive);
  const hidden = categories.filter((category) => !category.isActive);

  const submitNew = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name.length < 2) return;
    try {
      await create(name);
      setNewName('');
    } catch {
      // Xabar useFinanceCategories ichida ko'rsatildi
    }
  };

  const save = (category: FinanceCategory, patch: { name?: string; isActive?: boolean }, success: string) => {
    update.mutate(
      { id: category.id, ...patch },
      {
        onSuccess: () => {
          toast.success(success);
          setEditing(null);
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );
  };

  const submitRename = (event: FormEvent, category: FinanceCategory) => {
    event.preventDefault();
    const name = editing?.name.trim() ?? '';
    if (name.length < 2 || name === category.name) {
      setEditing(null);
      return;
    }
    save(category, { name }, 'Nomi o‘zgartirildi');
  };

  const row = (category: FinanceCategory) => {
    const isEditing = editing?.id === category.id;
    const busy = update.isPending && update.variables?.id === category.id;
    return (
      <li key={category.id} className={cn('flex min-h-12 items-center gap-2 px-4 py-2', !category.isActive && 'bg-surface-muted/50')}>
        {isEditing ? (
          <form className="flex flex-1 items-center gap-1.5" onSubmit={(event) => submitRename(event, category)}>
            <Input
              autoFocus
              aria-label={`${category.name} — yangi nom`}
              value={editing.name}
              maxLength={100}
              onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  // Faqat tahrir bekor bo'ladi, oyna ochiq qoladi
                  event.stopPropagation();
                  setEditing(null);
                }
              }}
              className="h-9"
            />
            <IconButton type="submit" label="Saqlash" variant="primary" loading={busy}>
              <Check aria-hidden />
            </IconButton>
            <IconButton label="Bekor qilish" onClick={() => setEditing(null)}>
              <X aria-hidden />
            </IconButton>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-body font-medium', category.isActive ? 'text-fg' : 'text-fg-muted')}>
                {category.name}
                {category.isSystem && <Lock className="ml-1.5 inline size-3.5 text-fg-subtle" aria-label="Tizim kategoriyasi" />}
              </p>
              <p className="text-caption text-fg-muted">{category.usage > 0 ? `${formatNumber(category.usage)} ta yozuv` : 'Hali ishlatilmagan'}</p>
            </div>
            {!category.isActive && <Badge tone="neutral">Yashirilgan</Badge>}
            {canManage && (
              <div className="flex shrink-0 items-center">
                <IconButton label="Nomini o‘zgartirish" onClick={() => setEditing({ id: category.id, name: category.name })}>
                  <Pencil aria-hidden />
                </IconButton>
                {category.isActive ? (
                  !category.isSystem && (
                    <IconButton
                      label="Yashirish — formada chiqmaydi"
                      loading={busy}
                      onClick={() => save(category, { isActive: false }, `“${category.name}” yashirildi`)}
                    >
                      <EyeOff aria-hidden />
                    </IconButton>
                  )
                ) : (
                  <IconButton label="Qayta yoqish" loading={busy} onClick={() => save(category, { isActive: true }, `“${category.name}” qayta yoqildi`)}>
                    <Eye aria-hidden />
                  </IconButton>
                )}
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <Modal
      open
      title={kind === 'income' ? 'Tushum kategoriyalari' : 'Xarajat kategoriyalari'}
      description="Yashirilgan kategoriya yangi yozuvda tanlanmaydi, eski yozuvlar va hisobotlarda saqlanadi"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      {canManage && (
        <form onSubmit={(event) => void submitNew(event)} className="mb-4 flex gap-2">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="Yangi kategoriya nomi"
              placeholder="Masalan: Transport"
              value={newName}
              maxLength={100}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <Button type="submit" loading={creating} disabled={newName.trim().length < 2} leftIcon={<Plus className="size-4" aria-hidden />}>
            Qo‘shish
          </Button>
        </form>
      )}

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-control" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : categories.length === 0 ? (
        <EmptyState size="sm" icon={Plus} title="Kategoriya yo‘q" description="Birinchi kategoriyani yuqorida qo‘shing" />
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <ul className="divide-y divide-border" aria-label="Faol kategoriyalar">
            {active.map(row)}
          </ul>
          {hidden.length > 0 && (
            <>
              <p className="border-t border-border bg-surface-muted px-4 py-1.5 text-overline text-fg-muted">{`Yashirilgan · ${hidden.length}`}</p>
              <ul className="divide-y divide-border border-t border-border" aria-label="Yashirilgan kategoriyalar">
                {hidden.map(row)}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
