import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { inventoryService } from '@/services/inventory.service';
import type { Product, ProductCategory } from '@/types/inventory';

/** Mahsulot kartochkasi. Qoldiq bu yerda o'zgartirilmaydi — u faqat harakat orqali o'zgaradi. */
export function ProductFormModal({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product?: Product;
  categories: readonly ProductCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category.id ?? categories[0]?.id ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'dona');
  const [price, setPrice] = useState(String(product?.price ?? 0));
  const [cost, setCost] = useState(String(product?.cost ?? 0));
  const [minQuantity, setMinQuantity] = useState(String(product?.minQuantity ?? 0));
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      inventoryService.save({
        ...(product ? { id: product.id } : {}),
        sku: sku.trim(),
        name: name.trim(),
        categoryId,
        unit: unit.trim() || 'dona',
        price: Number(price || 0),
        cost: Number(cost || 0),
        minQuantity: Number(minQuantity || 0),
        isActive,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const canSubmit = sku.trim().length > 0 && name.trim().length >= 2 && categoryId !== '';

  return (
    <Modal
      open
      title={product ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
      description="Qoldiq bu yerda o‘zgartirilmaydi — u faqat ombor harakati orqali o‘zgaradi."
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={!canSubmit} loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Kod</span>
          <Input value={sku} placeholder="KITOB-01" onChange={(event) => setSku(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Nomi</span>
          <Input value={name} placeholder="Ingliz tili darsligi" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Turkum</span>
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Turkum">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">O‘lchov birligi</span>
          <Input value={unit} placeholder="dona" onChange={(event) => setUnit(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Sotish narxi</span>
          <Input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Tannarx</span>
          <Input type="number" min={0} value={cost} onChange={(event) => setCost(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Kam qoldi chegarasi</span>
          <Input type="number" min={0} value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} />
          <span className="mt-1 block text-xs text-fg-subtle">0 — kuzatilmaydi</span>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-fg">
          <Checkbox checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Faol
        </label>
      </div>
    </Modal>
  );
}
