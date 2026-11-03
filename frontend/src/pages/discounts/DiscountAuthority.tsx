import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { discountsService } from '@/services/discounts.service';
import { useAuthStore } from '@/store/auth.store';
import type { ApprovalStatus, DiscountRequest, DiscountSettingsDto } from '@/types/discount';
import { formatDateTime, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

export const REQUEST_STATUS_LABELS: Record<ApprovalStatus, string> = { PENDING: 'Kutilmoqda', APPROVED: 'Tasdiqlangan', REJECTED: 'Rad etilgan', CANCELLED: 'Bekor qilingan' };
const REQUEST_STATUS_TONES: Record<ApprovalStatus, BadgeTone> = { PENDING: 'yellow', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'gray' };

const name = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}`.trim() : '—');

/**
 * Chegirma vakolati (ORG §2.2): tasdiq chegarasi (standart 5%) va chegaradan yuqori chegirma so'rovlari.
 * Chegarani va so'rovlarni faqat `discount.approve` huquqi bor rahbar boshqaradi; boshqalar o'z so'rovlarini ko'radi.
 */
export function DiscountAuthority({ settings }: { settings: DiscountSettingsDto | undefined }) {
  const queryClient = useQueryClient();
  const canApprove = usePermission(PERMISSIONS.DISCOUNT_APPROVE);
  const userId = useAuthStore((state) => state.user?.id);
  const [status, setStatus] = useState<ApprovalStatus | 'ALL'>('PENDING');
  const [threshold, setThreshold] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<DiscountRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const query = useQuery({
    queryKey: queryKeys.discounts.requests(status),
    queryFn: () => discountsService.requests(status === 'ALL' ? undefined : status),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.discounts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: ['my-work'] });
  };
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject' | 'cancel'; note?: string }) => discountsService.decideRequest(id, decision, note),
    onSuccess: (result) => {
      toast.success(result.message);
      setRejecting(null);
      setRejectNote('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const saveAuthority = useMutation({
    mutationFn: (patch: { approvalThresholdPercent?: number; rulesPreapproved?: boolean }) =>
      discountsService.saveSettings({ maxPercent: settings?.maxPercent ?? 30, allowStacking: settings?.allowStacking ?? true, ...patch }),
    onSuccess: (result) => {
      toast.success(result.message);
      setThreshold(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const current = settings?.approvalThresholdPercent ?? 5;

  return (
    <Card className="mb-6" id="requests">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-fg-subtle" aria-hidden />
          Chegirma vakolati
          {query.data && query.data.pending > 0 && <Badge tone="yellow">{query.data.pending} ta kutilmoqda</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body text-fg-muted">
          O‘quvchining umumiy chegirmasi {current}% gacha bo‘lsa — xodim o‘zi beradi. Undan yuqori, maxsus aksiya va individual narx — rahbar tasdig‘idan keyin. Har bir so‘rov sababi bilan.
        </p>
        {settings && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="w-48">
              <span className="mb-1 block text-body text-fg-muted">Tasdiqsiz chegara (%)</span>
              <Input type="number" min={0} max={100} step="0.5" disabled={!canApprove} value={threshold ?? String(current)} onChange={(event) => setThreshold(event.target.value)} />
            </label>
            {canApprove && threshold !== null && Number(threshold) !== current && (
              <Button loading={saveAuthority.isPending} onClick={() => saveAuthority.mutate({ approvalThresholdPercent: Number(threshold) })}>
                Saqlash
              </Button>
            )}
            <label className="flex items-center gap-2 text-body text-fg">
              <Checkbox
                checked={settings.rulesPreapproved ?? false}
                disabled={!canApprove || saveAuthority.isPending}
                onChange={(event) => saveAuthority.mutate({ rulesPreapproved: event.target.checked })}
              />
              Rahbar sozlagan qoida va promo kodlar oldindan tasdiqlangan
            </label>
          </div>
        )}

        <Tabs value={status} onValueChange={(value) => setStatus(value as ApprovalStatus | 'ALL')} variant="pill" panels={false}>
          <TabList label="So‘rov holati">
            <Tab value="PENDING">Kutilmoqda</Tab>
            <Tab value="APPROVED">Tasdiqlangan</Tab>
            <Tab value="REJECTED">Rad etilgan</Tab>
            <Tab value="ALL">Hammasi</Tab>
          </TabList>
        </Tabs>
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="So‘rov yo‘q" description="Chegaradan yuqori chegirma so‘ralganda shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    <Link to={`/students/${item.student.id}`} className="hover:underline">
                      {name(item.student)}
                    </Link>
                    <Badge tone={REQUEST_STATUS_TONES[item.status]}>{REQUEST_STATUS_LABELS[item.status]}</Badge>
                  </p>
                  <p className="text-body text-fg-muted">
                    {item.label} — {formatMoney(item.amount)} · umumiy {item.percent}%
                  </p>
                  <p className="text-caption text-fg-subtle">
                    Sabab: {item.reason} · so‘radi: {name(item.requestedBy)} · {formatDateTime(item.createdAt)}
                    {item.decidedBy ? ` · qaror: ${name(item.decidedBy)}` : ''}
                    {item.decisionNote ? ` — ${item.decisionNote}` : ''}
                  </p>
                </div>
                {item.status === 'PENDING' && (
                  <div className="flex shrink-0 gap-2">
                    {query.data.canApprove && item.requestedBy?.id !== userId && (
                      <>
                        <Button size="sm" loading={decide.isPending && decide.variables?.id === item.id && decide.variables.decision === 'approve'} onClick={() => decide.mutate({ id: item.id, decision: 'approve' })}>
                          Tasdiqlash
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRejecting(item)}>
                          Rad etish
                        </Button>
                      </>
                    )}
                    {item.requestedBy?.id === userId && (
                      <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: item.id, decision: 'cancel' })}>
                        Qaytarib olish
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {rejecting && (
        <Modal
          open
          title="Chegirmani rad etish"
          description={`${name(rejecting.student)} · ${rejecting.label}`}
          onClose={() => setRejecting(null)}
          closeDisabled={decide.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejecting(null)} disabled={decide.isPending}>
                Yopish
              </Button>
              <Button variant="danger" disabled={rejectNote.trim().length < 3} loading={decide.isPending} onClick={() => decide.mutate({ id: rejecting.id, decision: 'reject', note: rejectNote.trim() })}>
                Rad etish
              </Button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1 block text-body text-fg-muted">Sabab</span>
            <Input value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Masalan: aksiya muddati tugagan" autoFocus />
          </label>
        </Modal>
      )}
    </Card>
  );
}
