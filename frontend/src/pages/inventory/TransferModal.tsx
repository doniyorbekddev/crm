import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { branchesService } from '@/services/branches.service';
import { inventoryService } from '@/services/inventory.service';
import type { Product } from '@/types/inventory';
import { formatNumber } from '@/utils/format';

/**
 * Filiallararo ko'chirish.
 *
 * Bu oddiy harakatdan ataylab ajratilgan: chiqim va kirim serverda **bitta tranzaksiyada**
 * yoziladi. Bir tomonlama yozuv qilinsa, tovar bir filialdan chiqib ikkinchisiga kirmay
 * qolishi — ya'ni hisobdan yo'qolishi mumkin edi.
 *
 * Qabul qiluvchi filialda shu kodli mahsulot bo'lmasa, server uni o'zi ochadi.
 */
export function TransferModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [toBranchId, setToBranchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const branchesQuery = useQuery({ queryKey: queryKeys.branches.list, queryFn: branchesService.list });
  // O'z filiali ro'yxatda ko'rinmaydi — o'ziga ko'chirish ma'nosiz
  const targets = (branchesQuery.data ?? []).filter((branch) => branch.id !== product.branchId && branch.isActive);

  const transfer = useMutation({
    mutationFn: () =>
      inventoryService.transfer({
        productId: product.id,
        toBranchId,
        quantity: Number(quantity),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(`${result.message} — bu filialda qoldiq: ${formatNumber(result.data.out.balanceAfter)} ${product.unit}`);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const amount = Number(quantity || 0);
  const canSubmit = toBranchId !== '' && amount > 0 && amount <= product.quantity;

  return (
    <Modal
      open
      title="Boshqa filialga ko‘chirish"
      description={`${product.name} · hozirgi qoldiq ${formatNumber(product.quantity)} ${product.unit}`}
      onClose={onClose}
      closeDisabled={transfer.isPending}
      footer={
        <>
          <Button variant="secondary" disabled={transfer.isPending} onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={!canSubmit} loading={transfer.isPending} onClick={() => transfer.mutate()}>
            Ko‘chirish
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      {!branchesQuery.isPending && targets.length === 0 ? (
        <p className="text-sm text-fg-muted">Ko‘chirish uchun boshqa filial yo‘q.</p>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Qabul qiluvchi filial</span>
            <Select
              value={toBranchId}
              onChange={(event) => {
                setToBranchId(event.target.value);
                setFormError(null);
              }}
              aria-label="Qabul qiluvchi filial"
            >
              <option value="">Tanlang</option>
              {targets.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <span className="mt-1 block text-xs text-fg-subtle">Bu kodli mahsulot u yerda bo‘lmasa, o‘zi ochiladi</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Miqdor ({product.unit})</span>
            <Input type="number" min={1} max={product.quantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            {amount > product.quantity && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">Omborda bunchasi yo‘q</span>}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Sabab / izoh</span>
            <Input value={reason} placeholder="Masalan: u filialda tugab qolgan" onChange={(event) => setReason(event.target.value)} />
          </label>

          <p className="text-xs text-fg-subtle">
            Bu markaz ichidagi harakat — tushum ham, xarajat ham yozilmaydi. Ikkala filial tarixida yozuv qoladi.
          </p>
        </div>
      )}
    </Modal>
  );
}
