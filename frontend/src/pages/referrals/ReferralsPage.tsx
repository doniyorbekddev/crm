import { DataTable } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
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
import { TableSkeleton } from '@/components/ui/Table';
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

function Stat({ icon, label, value, hint }: { icon: typeof Gift; label: string; value: string; hint?: string }) {
  return <StatCard size="sm" icon={icon} title={label} value={value} {...(hint ? { description: hint } : {})} />;
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
          <Stat icon={UserPlus} label="Takliflar" value={formatNumber(stats.total)} />
          <Stat
            icon={TrendingUp}
            label="O‘quvchiga aylandi"
            value={formatNumber(stats.converted)}
            hint={`${stats.conversionPercent}% konversiya`}
          />
          <Stat icon={Gift} label="Berilgan bonus" value={formatMoney(stats.bonusTotal)} hint={`${stats.rewarded} ta taklif uchun`} />
          <Stat icon={HandCoins} label="Taklif tushumi" value={formatMoney(stats.referralRevenue)} hint="taklif bo‘yicha kelganlardan" />
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
            <DataTable
              bare
              label="Takliflar"
              rows={listQuery.data.items}
              rowKey={(item) => item.id}
              mobileLayout="cards"
              columns={[
                {
                  key: 'c0',
                  label: 'Kim taklif qildi',
                  cell: (item) => (
                    <>
                      <Link to={`/students/${item.referrer.id}`} className="text-fg hover:text-brand-600 hover:underline">
                        {item.referrer.name}
                      </Link>
                      {item.referrer.code && <span className="ml-2 font-mono text-xs text-fg-subtle">{item.referrer.code}</span>}
                    </>
                  ),
                },
                {
                  key: 'c1',
                  label: 'Kimni',
                  tdClassName: 'text-fg-muted',
                  cell: (item) => (
                    <>
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
                    </>
                  ),
                },
                {
                  key: 'c2',
                  label: 'Holat',
                  cell: (item) => (
                    <>
                      <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                    </>
                  ),
                },
                {
                  key: 'c3',
                  label: 'Bonus',
                  tdClassName: 'whitespace-nowrap tabular-nums text-fg-muted',
                  cell: (item) => (
                    <>
                      {item.bonusAmount > 0 ? formatMoney(item.bonusAmount) : '—'}
                      {item.rewardedBy && <span className="block text-xs text-fg-subtle">{item.rewardedBy}</span>}
                    </>
                  ),
                },
                {
                  key: 'c4',
                  label: 'Sana',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (item) => (
                    <>
                      {formatDate(item.createdAt)}
                      {canReward && item.status === 'CONVERTED' && (
                        <Button size="sm" variant="secondary" className="ml-3" onClick={() => setRewardId(item.id)}>
                          Bonus berish
                        </Button>
                      )}
                    </>
                  ),
                },
              ]}
            />
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
