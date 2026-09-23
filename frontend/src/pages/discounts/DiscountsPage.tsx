import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Plus, Ticket } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { discountsService } from '@/services/discounts.service';
import type { DiscountType, DiscountValueType } from '@/types/discount';
import { formatDate, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const TYPE_LABELS: Record<DiscountType, string> = {
  FAMILY: 'Oila',
  REFERRAL: 'Taklif (referal)',
  PROMO_CODE: 'Promo kod',
  PREPAY_3: '3 oylik oldindan',
  PREPAY_6: '6 oylik oldindan',
  FIRST_PAYMENT: 'Birinchi to‘lov',
  CUSTOM: 'Maxsus',
};

interface RuleDraft {
  key: string;
  name: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: string;
  stackable: boolean;
  isActive: boolean;
  description: string;
}

const EMPTY_RULE: RuleDraft = {
  key: '',
  name: '',
  type: 'CUSTOM',
  valueType: 'PERCENT',
  value: '10',
  stackable: true,
  isActive: true,
  description: '',
};

/**
 * Chegirma qoidalari, promo kodlar va umumiy chegara. Qoida o'zgarsa allaqachon
 * berilgan chegirmalar o'zgarmaydi — ular qiymatni nusxa qilib olgan.
 */
export default function DiscountsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoDraft, setPromoDraft] = useState({ code: '', ruleKey: '', usageLimit: '0' });
  const [maxPercent, setMaxPercent] = useState<string | null>(null);

  const rulesQuery = useQuery({ queryKey: queryKeys.discounts.rules(true), queryFn: () => discountsService.rules(true) });
  const promoQuery = useQuery({ queryKey: queryKeys.discounts.promoCodes(true), queryFn: () => discountsService.promoCodes(true) });
  const settingsQuery = useQuery({ queryKey: queryKeys.discounts.settings, queryFn: discountsService.settings });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.discounts.all });
  }

  const saveRule = useMutation({
    mutationFn: () =>
      discountsService.saveRule({
        key: ruleDraft!.key.trim(),
        name: ruleDraft!.name.trim(),
        type: ruleDraft!.type,
        valueType: ruleDraft!.valueType,
        value: Number(ruleDraft!.value),
        stackable: ruleDraft!.stackable,
        priority: 0,
        isActive: ruleDraft!.isActive,
        sortOrder: 0,
        ...(ruleDraft!.description.trim() ? { description: ruleDraft!.description.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setRuleDraft(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const createPromo = useMutation({
    mutationFn: () =>
      discountsService.createPromoCode({
        code: promoDraft.code.trim(),
        ruleKey: promoDraft.ruleKey,
        usageLimit: Number(promoDraft.usageLimit),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setPromoOpen(false);
      setPromoDraft({ code: '', ruleKey: '', usageLimit: '0' });
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const togglePromo = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => discountsService.setPromoCodeActive(id, isActive),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      discountsService.saveSettings({
        maxPercent: Number(maxPercent),
        allowStacking: settingsQuery.data?.allowStacking ?? true,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setMaxPercent(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const toggleStacking = useMutation({
    mutationFn: (allowStacking: boolean) =>
      discountsService.saveSettings({ maxPercent: settingsQuery.data?.maxPercent ?? 30, allowStacking }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const settings = settingsQuery.data;

  return (
    <>
      <PageHeader
        title="Chegirmalar"
        description="Qoidalar, promo kodlar va umumiy chegirma chegarasi"
        actions={
          canManage && (
            <>
              <Button variant="secondary" leftIcon={<Ticket className="size-4" aria-hidden />} onClick={() => setPromoOpen(true)}>
                Promo kod
              </Button>
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setRuleDraft(EMPTY_RULE)}>
                Qoida
              </Button>
            </>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Chegara</CardTitle>
        </CardHeader>
        <CardContent>
          {settingsQuery.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : settingsQuery.isError ? (
            <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
          ) : settings ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="w-48">
                <span className="mb-1 block text-sm text-fg-muted">Maksimal chegirma (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!canManage}
                  value={maxPercent ?? String(settings.maxPercent)}
                  onChange={(event) => setMaxPercent(event.target.value)}
                />
              </label>
              {canManage && maxPercent !== null && Number(maxPercent) !== settings.maxPercent && (
                <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
                  Saqlash
                </Button>
              )}
              <label className="flex items-center gap-2 text-sm text-fg">
                <Checkbox
                  checked={settings.allowStacking}
                  disabled={!canManage || toggleStacking.isPending}
                  onChange={(event) => toggleStacking.mutate(event.target.checked)}
                />
                Bir nechta chegirmani birga qo‘llashga ruxsat
              </label>
              {settings.updatedAt && <span className="text-xs text-fg-subtle sm:ml-auto">Oxirgi o‘zgarish: {formatDate(settings.updatedAt)}</span>}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="size-4 text-fg-subtle" aria-hidden />
            Qoidalar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rulesQuery.isPending ? (
            <Skeleton className="m-4 h-32" />
          ) : rulesQuery.isError ? (
            <ErrorState error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
          ) : rulesQuery.data.length === 0 ? (
            <EmptyState icon={BadgePercent} title="Qoida yo‘q" description="Masalan «Oila chegirmasi — 10%» qoidasini qo‘shing" />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Nomi</TH>
                    <TH>Turi</TH>
                    <TH>Qiymati</TH>
                    <TH>Birga qo‘llash</TH>
                    <TH>Berilgan</TH>
                    <TH>Holat</TH>
                  </tr>
                </THead>
                <TBody>
                  {rulesQuery.data.map((rule) => (
                    <TR
                      key={rule.id}
                      className={canManage ? 'cursor-pointer' : undefined}
                      onClick={
                        canManage
                          ? () =>
                              setRuleDraft({
                                key: rule.key,
                                name: rule.name,
                                type: rule.type,
                                valueType: rule.valueType,
                                value: String(rule.value),
                                stackable: rule.stackable,
                                isActive: rule.isActive,
                                description: rule.description ?? '',
                              })
                          : undefined
                      }
                    >
                      <TD>
                        <span className="text-fg">{rule.name}</span>
                        <span className="ml-2 font-mono text-xs text-fg-subtle">{rule.key}</span>
                      </TD>
                      <TD className="text-fg-muted">{TYPE_LABELS[rule.type]}</TD>
                      <TD className="tabular-nums text-fg-muted">
                        {rule.valueType === 'PERCENT' ? `${rule.value}%` : formatMoney(rule.value)}
                      </TD>
                      <TD className="text-fg-muted">{rule.stackable ? 'Ha' : 'Yo‘q'}</TD>
                      <TD className="tabular-nums text-fg-muted">{rule.usedCount}</TD>
                      <TD>
                        <Badge tone={rule.isActive ? 'green' : 'gray'}>{rule.isActive ? 'Faol' : 'O‘chirilgan'}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-4 text-fg-subtle" aria-hidden />
            Promo kodlar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {promoQuery.isPending ? (
            <Skeleton className="m-4 h-24" />
          ) : promoQuery.isError ? (
            <ErrorState error={promoQuery.error} onRetry={() => void promoQuery.refetch()} />
          ) : promoQuery.data.length === 0 ? (
            <EmptyState icon={Ticket} title="Promo kod yo‘q" description="Aksiya uchun kod yarating: masalan KUZ2026" />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Kod</TH>
                    <TH>Qoida</TH>
                    <TH>Ishlatilgan</TH>
                    <TH>Muddat</TH>
                    <TH>Holat</TH>
                  </tr>
                </THead>
                <TBody>
                  {promoQuery.data.map((promo) => (
                    <TR key={promo.id}>
                      <TD className="font-mono text-fg">{promo.code}</TD>
                      <TD className="text-fg-muted">
                        {promo.ruleName} · {promo.valueType === 'PERCENT' ? `${promo.value}%` : formatMoney(promo.value)}
                      </TD>
                      <TD className="tabular-nums text-fg-muted">
                        {promo.usedCount}
                        {promo.usageLimit > 0 ? ` / ${promo.usageLimit}` : ' / ∞'}
                      </TD>
                      <TD className="text-fg-muted">{promo.expiresAt ? formatDate(promo.expiresAt) : '—'}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Badge tone={promo.isActive ? 'green' : 'gray'}>{promo.isActive ? 'Faol' : 'O‘chirilgan'}</Badge>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={togglePromo.isPending && togglePromo.variables?.id === promo.id}
                              onClick={() => togglePromo.mutate({ id: promo.id, isActive: !promo.isActive })}
                            >
                              {promo.isActive ? 'O‘chirish' : 'Yoqish'}
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {ruleDraft && (
        <Modal
          open
          title="Chegirma qoidasi"
          description="Kalit o‘zgarmaydi — mavjud kalit kiritilsa qoida yangilanadi."
          onClose={() => setRuleDraft(null)}
          closeDisabled={saveRule.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={saveRule.isPending} onClick={() => setRuleDraft(null)}>
                Bekor qilish
              </Button>
              <Button
                disabled={ruleDraft.key.trim().length < 2 || ruleDraft.name.trim().length < 2}
                loading={saveRule.isPending}
                onClick={() => saveRule.mutate()}
              >
                Saqlash
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Kalit (lotin, kichik harf)</span>
              <Input value={ruleDraft.key} placeholder="family" onChange={(event) => setRuleDraft({ ...ruleDraft, key: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Nomi</span>
              <Input value={ruleDraft.name} placeholder="Oila chegirmasi" onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm text-fg-muted">Turi</span>
                <Select value={ruleDraft.type} onChange={(event) => setRuleDraft({ ...ruleDraft, type: event.target.value as DiscountType })}>
                  {(Object.keys(TYPE_LABELS) as DiscountType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-fg-muted">O‘lchov</span>
                <Select
                  value={ruleDraft.valueType}
                  onChange={(event) => setRuleDraft({ ...ruleDraft, valueType: event.target.value as DiscountValueType })}
                >
                  <option value="PERCENT">Foiz</option>
                  <option value="AMOUNT">Summa</option>
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-fg-muted">Qiymati</span>
                <Input type="number" min={0} value={ruleDraft.value} onChange={(event) => setRuleDraft({ ...ruleDraft, value: event.target.value })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={ruleDraft.stackable} onChange={(event) => setRuleDraft({ ...ruleDraft, stackable: event.target.checked })} />
              Boshqa chegirmalar bilan birga qo‘llansin
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={ruleDraft.isActive} onChange={(event) => setRuleDraft({ ...ruleDraft, isActive: event.target.checked })} />
              Faol
            </label>
          </div>
        </Modal>
      )}

      {promoOpen && (
        <Modal
          open
          title="Promo kod"
          description="Kod katta harfda saqlanadi. Limit 0 bo‘lsa cheksiz."
          onClose={() => setPromoOpen(false)}
          closeDisabled={createPromo.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={createPromo.isPending} onClick={() => setPromoOpen(false)}>
                Bekor qilish
              </Button>
              <Button
                disabled={promoDraft.code.trim().length < 3 || promoDraft.ruleKey === ''}
                loading={createPromo.isPending}
                onClick={() => createPromo.mutate()}
              >
                Yaratish
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Kod</span>
              <Input value={promoDraft.code} placeholder="KUZ2026" onChange={(event) => setPromoDraft({ ...promoDraft, code: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Qoida</span>
              <Select value={promoDraft.ruleKey} onChange={(event) => setPromoDraft({ ...promoDraft, ruleKey: event.target.value })}>
                <option value="">Tanlang</option>
                {(rulesQuery.data ?? [])
                  .filter((rule) => rule.isActive)
                  .map((rule) => (
                    <option key={rule.id} value={rule.key}>
                      {rule.name} — {rule.valueType === 'PERCENT' ? `${rule.value}%` : formatMoney(rule.value)}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Ishlatilish limiti</span>
              <Input
                type="number"
                min={0}
                value={promoDraft.usageLimit}
                onChange={(event) => setPromoDraft({ ...promoDraft, usageLimit: event.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
