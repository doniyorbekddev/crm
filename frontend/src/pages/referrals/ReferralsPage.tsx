import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, HandCoins, TrendingUp, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { referralsService } from '@/services/referrals.service';
import type { ReferralStatus } from '@/types/referral';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<ReferralStatus, string> = {
  PENDING: 'Kutilmoqda',
  CONVERTED: 'O‘quvchiga aylandi',
  REWARDED: 'Bonus berildi',
  CANCELLED: 'Bekor qilingan',
};

const STATUS_TONES: Record<ReferralStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  PENDING: 'blue',
  CONVERTED: 'green',
  REWARDED: 'green',
  CANCELLED: 'gray',
};

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Gift; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
        </div>
        <Icon className="size-5 shrink-0 text-fg-subtle" aria-hidden />
      </div>
    </Card>
  );
}

/**
 * "Do'stingni olib kel" — kim kimni taklif qilgani, qanchasi o'quvchiga aylangani va
 * bonus berilgani. Bonus avtomatik berilmaydi: xodim tugma bosadi, audit yoziladi.
 */
export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const canReward = usePermission(PERMISSIONS.REFERRAL_REWARD);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | ReferralStatus>('');
  const [rewardId, setRewardId] = useState<string | null>(null);

  const params = { page, limit: PAGE_SIZE, ...(status ? { status } : {}) };
  const listQuery = useQuery({
    queryKey: queryKeys.referrals.list(params),
    queryFn: () => referralsService.list(params),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({ queryKey: queryKeys.referrals.stats, queryFn: referralsService.stats });

  const reward = useMutation({
    mutationFn: () => referralsService.reward(rewardId!),
    onSuccess: (result) => {
      toast.success(`${result.message} — ${formatMoney(result.data.bonusAmount)}`);
      setRewardId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.discounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const stats = statsQuery.data;

  return (
    <>
      <PageHeader title="Takliflar" description="O‘quvchilar o‘z kodi bilan olib kelgan mijozlar va berilgan bonuslar" />

      {statsQuery.isPending ? (
        <Skeleton className="mb-6 h-24 w-full rounded-xl" />
      ) : statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => void statsQuery.refetch()} />
      ) : stats ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={UserPlus} label="Takliflar" value={formatNumber(stats.total)} />
          <StatCard
            icon={TrendingUp}
            label="O‘quvchiga aylandi"
            value={formatNumber(stats.converted)}
            hint={`${stats.conversionPercent}% konversiya`}
          />
          <StatCard icon={Gift} label="Berilgan bonus" value={formatMoney(stats.bonusTotal)} hint={`${stats.rewarded} ta taklif uchun`} />
          <StatCard icon={HandCoins} label="Taklif tushumi" value={formatMoney(stats.referralRevenue)} hint="taklif bo‘yicha kelganlardan" />
        </div>
      ) : null}

      {stats && stats.top.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Eng ko‘p do‘st olib kelganlar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {stats.top.map((item) => (
                <li key={item.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link to={`/students/${item.studentId}`} className="min-w-0 truncate text-fg hover:text-brand-600 hover:underline">
                    {item.name}
                    {item.code && <span className="ml-2 font-mono text-xs text-fg-subtle">{item.code}</span>}
                  </Link>
                  <span className="shrink-0 text-fg-muted">
                    {item.converted}/{item.total} · {formatMoney(item.bonus)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-border p-3">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as '' | ReferralStatus);
              setPage(1);
            }}
            aria-label="Holat"
            wrapperClassName="w-56"
          >
            <option value="">Barcha holatlar</option>
            {(Object.keys(STATUS_LABELS) as ReferralStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABELS[key]}
              </option>
            ))}
          </Select>
        </div>

        {listQuery.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="Taklif yo‘q"
            description="Lead qo‘shishda o‘quvchining taklif kodi (R00045) kiritilsa, bu yerda ko‘rinadi"
          />
        ) : (
          <>
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Kim taklif qildi</TH>
                    <TH>Kimni</TH>
                    <TH>Holat</TH>
                    <TH>Bonus</TH>
                    <TH>Sana</TH>
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <Link to={`/students/${item.referrer.id}`} className="text-fg hover:text-brand-600 hover:underline">
                          {item.referrer.name}
                        </Link>
                        {item.referrer.code && <span className="ml-2 font-mono text-xs text-fg-subtle">{item.referrer.code}</span>}
                      </TD>
                      <TD className="text-fg-muted">
                        {item.referred ? (
                          <Link to={`/students/${item.referred.id}`} className="hover:text-brand-600 hover:underline">
                            {item.referred.name}
                          </Link>
                        ) : item.lead ? (
                          <Link to={`/leads/${item.lead.id}`} className="hover:text-brand-600 hover:underline">
                            {item.lead.name} <span className="text-xs text-fg-subtle">(lead)</span>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums text-fg-muted">
                        {item.bonusAmount > 0 ? formatMoney(item.bonusAmount) : '—'}
                        {item.rewardedBy && <span className="block text-xs text-fg-subtle">{item.rewardedBy}</span>}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDate(item.createdAt)}
                        {canReward && item.status === 'CONVERTED' && (
                          <Button size="sm" variant="secondary" className="ml-3" onClick={() => setRewardId(item.id)}>
                            Bonus berish
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={listQuery.data.meta.page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={listQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={listQuery.isFetching}
            />
          </>
        )}
      </Card>

      {rewardId && (
        <ConfirmDialog
          open
          title="Bonus berilsinmi?"
          description="Taklif qilgan o‘quvchiga chegirma qoidasidagi bonus chegirma sifatida beriladi va shartnoma summasi kamayadi."
          confirmLabel="Berish"
          loading={reward.isPending}
          onConfirm={() => reward.mutate()}
          onCancel={() => setRewardId(null)}
        />
      )}
    </>
  );
}
