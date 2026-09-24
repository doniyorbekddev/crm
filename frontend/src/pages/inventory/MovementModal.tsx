import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { expensesService, incomesService } from '@/services/finance.service';
import { inventoryService } from '@/services/inventory.service';
import type { Product, StockMovementType } from '@/types/inventory';
import { formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_ORDER } from '@/utils/inventoryLabels';

/**
 * Ombor harakati. Sotuv va xaridda pul yozuvini ham shu yerda yaratish mumkin —
 * u mavjud tushum/xarajat moduli orqali ketadi, ya'ni daftarda bitta yozuv bo'ladi.
 */
export function MovementModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const canRecordMoney = usePermission(PERMISSIONS.INCOME_MANAGE);
  const [type, setType] = useState<StockMovementType>('PURCHASE');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [reason, setReason] = useState('');
  const [withMoney, setWithMoney] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE'>('CASH');
  const [formError, setFormError] = useState<string | null>(null);

  const moneyPossible = canRecordMoney && (type === 'SALE' || type === 'PURCHASE');
  const categoriesQuery = useQuery({
    queryKey: type === 'SALE' ? queryKeys.incomes.categories : queryKeys.expenses.categories,
    queryFn: () => (type === 'SALE' ? incomesService.categories() : expensesService.categories()),
    enabled: moneyPossible && withMoney,
  });

  const save = useMutation({
    mutationFn: () =>
      inventoryService.move({
        productId: product.id,
        type,
        quantity: Number(quantity),
        ...(unitPrice ? { unitPrice: Number(unitPrice) } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(moneyPossible && withMoney && categoryId ? { money: { categoryId, method } } : {}),
      }),
    onSuccess: (result) => {
      toast.success(`${result.message} — qoldiq: ${formatNumber(result.data.balanceAfter)} ${product.unit}`);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const amount = Number(quantity || 0) * Number(unitPrice || (type === 'SALE' ? product.price : product.cost));
  const canSubmit = Number(quantity) > 0 && (!withMoney || !moneyPossible || categoryId !== '');

  return (
    <Modal
      open
      title="Ombor harakati"
      description={`${product.name} · hozirgi qoldiq ${formatNumber(product.quantity)} ${product.unit}`}
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

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Harakat turi</span>
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as StockMovementType);
              setFormError(null);
            }}
            aria-label="Harakat turi"
          >
            {STOCK_MOVEMENT_ORDER.map((value) => (
              <option key={value} value={value}>
                {STOCK_MOVEMENT_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Miqdor ({product.unit})</span>
            <Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Bir dona narxi</span>
            <Input
              type="number"
              min={0}
              value={unitPrice}
              placeholder={String(type === 'SALE' ? product.price : product.cost)}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-fg-muted">Sabab / izoh</span>
          <Input value={reason} placeholder="Masalan: yangi partiya, singan" onChange={(event) => setReason(event.target.value)} />
        </label>

        {moneyPossible && (
          <div className="rounded-lg border border-border bg-surface-muted p-3">
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={withMoney} onChange={(event) => setWithMoney(event.target.checked)} />
              {type === 'SALE' ? 'Tushum ham yozilsin' : 'Xarajat ham yozilsin'} ({formatMoney(amount)})
            </label>
            {withMoney && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-muted">Kategoriya</span>
                  <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Kategoriya">
                    <option value="">Tanlang</option>
                    {(categoriesQuery.data ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-muted">To‘lov usuli</span>
                  <Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} aria-label="To‘lov usuli">
                    <option value="CASH">Naqd</option>
                    <option value="CARD">Karta</option>
                    <option value="TRANSFER">O‘tkazma</option>
                    <option value="ONLINE">Onlayn</option>
                  </Select>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
