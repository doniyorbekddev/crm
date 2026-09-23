import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { discountsService } from '@/services/discounts.service';
import type { GrantDiscountPayload } from '@/types/discount';
import { formatDate, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

type Mode = 'rule' | 'promo' | 'custom';

/**
 * O'quvchining chegirmalari: shartnoma narxi qanday shakllangani va kim bergani.
 * Chegirma o'chirilmaydi — bekor qilinadi, shunda summa shartnomaga qaytadi.
 */
export function DiscountsCard({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const canView = usePermission(PERMISSIONS.DISCOUNT_VIEW);
  const canGrant = usePermission(PERMISSIONS.DISCOUNT_GRANT);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('rule');
  const [ruleKey, setRuleKey] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const summaryQuery = useQuery({
    queryKey: queryKeys.discounts.student(studentId),
    queryFn: () => discountsService.forStudent(studentId),
    enabled: canView,
  });
  const rulesQuery = useQuery({
    queryKey: queryKeys.discounts.rules(false),
    queryFn: () => discountsService.rules(false),
    enabled: canGrant && open,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.discounts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
  }

  const grant = useMutation({
    mutationFn: () => {
      const payload: GrantDiscountPayload =
        mode === 'rule'
          ? { ruleKey }
          : mode === 'promo'
            ? { promoCode: promoCode.trim() }
            : { valueType: 'AMOUNT', value: Number(amount), note: note.trim() };
      return discountsService.grant(studentId, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setOpen(false);
      setRuleKey('');
      setPromoCode('');
      setAmount('');
      setNote('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: () => discountsService.revoke(revokeId!, revokeReason.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      setRevokeId(null);
      setRevokeReason('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // Chegirma ma'lumoti moliyaviy — ko'rish huquqi bo'lmagan xodimga kartochka umuman ko'rinmaydi
  if (!canView) return null;

  const summary = summaryQuery.data;
  const canSubmit =
    mode === 'rule' ? ruleKey !== '' : mode === 'promo' ? promoCode.trim().length >= 3 : Number(amount) > 0 && note.trim().length >= 3;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="size-4 text-fg-subtle" aria-hidden />
            Chegirmalar
          </CardTitle>
          {canGrant && (
            <Button size="sm" variant="secondary" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
              Chegirma berish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {summaryQuery.isPending ? (
            <Skeleton className="h-28 w-full" />
          ) : summaryQuery.isError ? (
            <ErrorState error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
          ) : summary ? (
            <>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-fg-muted">Chegirmasiz</dt>
                  <dd className="tabular-nums text-fg">{formatMoney(summary.basePrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Chegirma</dt>
                  <dd className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    {summary.discountTotal > 0 ? `−${formatMoney(summary.discountTotal)}` : '—'}
                    {summary.discountTotal > 0 && <span className="ml-1 text-xs text-fg-subtle">({summary.percent}%)</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Shartnoma</dt>
                  <dd className="font-medium tabular-nums text-fg">{formatMoney(summary.contractPrice)}</dd>
                </div>
              </dl>

              {summary.items.length === 0 ? (
                <p className="mt-3 text-sm text-fg-subtle">Chegirma berilmagan.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {summary.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm text-fg">
                          <span className="truncate">{item.label}</span>
                          {item.revokedAt && <Badge tone="gray">Bekor qilingan</Badge>}
                        </p>
                        <p className="text-xs text-fg-subtle">
                          {item.valueType === 'PERCENT' ? `${item.value}%` : formatMoney(item.value)} · {formatDate(item.createdAt)}
                          {item.grantedBy ? ` · ${item.grantedBy}` : ''}
                          {item.note ? ` · ${item.note}` : ''}
                        </p>
                        {item.revokedAt && (
                          <p className="text-xs text-fg-subtle">
                            Bekor: {formatDate(item.revokedAt)}
                            {item.revokeReason ? ` — ${item.revokeReason}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={item.revokedAt ? 'text-sm text-fg-subtle line-through' : 'text-sm tabular-nums text-fg'}>
                          −{formatMoney(item.amount)}
                        </span>
                        {canGrant && !item.revokedAt && (
                          <Button size="sm" variant="ghost" onClick={() => setRevokeId(item.id)}>
                            Bekor qilish
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canGrant && summary.remainingAllowance > 0 && (
                <p className="mt-3 text-xs text-fg-subtle">
                  Chegara {summary.maxPercent}%: yana {formatMoney(summary.remainingAllowance)} berish mumkin.
                </p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {open && (
        <Modal
          open
          title="Chegirma berish"
          description="Chegirma shartnoma summasini kamaytiradi va qarzdorlik qayta hisoblanadi."
          onClose={() => setOpen(false)}
          closeDisabled={grant.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={grant.isPending} onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button disabled={!canSubmit} loading={grant.isPending} onClick={() => grant.mutate()}>
                Berish
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Select value={mode} onChange={(event) => setMode(event.target.value as Mode)} aria-label="Chegirma turi">
              <option value="rule">Qoida bo‘yicha</option>
              <option value="promo">Promo kod</option>
              <option value="custom">Qo‘lda (sabab bilan)</option>
            </Select>

            {mode === 'rule' && (
              <Select value={ruleKey} onChange={(event) => setRuleKey(event.target.value)} aria-label="Chegirma qoidasi">
                <option value="">Qoidani tanlang</option>
                {(rulesQuery.data ?? []).map((rule) => (
                  <option key={rule.id} value={rule.key}>
                    {rule.name} — {rule.valueType === 'PERCENT' ? `${rule.value}%` : formatMoney(rule.value)}
                  </option>
                ))}
              </Select>
            )}

            {mode === 'promo' && (
              <label className="block">
                <span className="mb-1 block text-sm text-fg-muted">Promo kod</span>
                <Input value={promoCode} placeholder="KUZ2026" onChange={(event) => setPromoCode(event.target.value)} />
              </label>
            )}

            {mode === 'custom' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm text-fg-muted">Summa (so‘m)</span>
                  <Input type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-fg-muted">Sabab</span>
                  <Input value={note} placeholder="Masalan: direktor ruxsati bilan" onChange={(event) => setNote(event.target.value)} />
                </label>
              </>
            )}
          </div>
        </Modal>
      )}

      {revokeId && (
        <Modal
          open
          title="Chegirmani bekor qilish"
          description="Summa shartnomaga qaytariladi. Yozuv tarixda qoladi."
          onClose={() => setRevokeId(null)}
          closeDisabled={revoke.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={revoke.isPending} onClick={() => setRevokeId(null)}>
                Yopish
              </Button>
              <Button variant="danger" disabled={revokeReason.trim().length < 3} loading={revoke.isPending} onClick={() => revoke.mutate()}>
                Bekor qilish
              </Button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Sabab</span>
            <Input value={revokeReason} placeholder="Nega bekor qilinmoqda?" onChange={(event) => setRevokeReason(event.target.value)} />
          </label>
        </Modal>
      )}
    </>
  );
}
