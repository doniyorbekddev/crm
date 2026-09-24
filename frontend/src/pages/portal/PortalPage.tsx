import { useQuery } from '@tanstack/react-query';
import { CalendarDays, GraduationCap, Wallet } from 'lucide-react';
import { useState } from 'react';
import { TelegramLinkCard } from '@/components/TelegramLinkCard';
import { AchievementsCard } from './AchievementsCard';
import { CurriculumCard } from './CurriculumCard';
import { FeedbackCard } from './FeedbackCard';
import { LessonsCard } from './LessonsCard';
import { MyCertificatesCard } from './MyCertificatesCard';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES } from '@/utils/scheduleLabels';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/**
 * O'quvchi va ota-ona kabineti. Ota-ona bo'lsa yuqorida farzandni tanlash paneli chiqadi.
 * Ma'lumot doirasi backendda aniqlanadi — bu yerda faqat ko'rsatiladi.
 */
export function PortalPage() {
  useDocumentTitle('Kabinet');
  const [childId, setChildId] = useState<string | undefined>(undefined);

  const meQuery = useQuery({ queryKey: queryKeys.portal.me, queryFn: () => portalService.me() });
  const activeChild = childId ?? meQuery.data?.children[0]?.studentId;

  const profileQuery = useQuery({
    queryKey: queryKeys.portal.profile(activeChild ?? ''),
    queryFn: () => portalService.profile(activeChild),
    enabled: Boolean(activeChild),
  });
  const scheduleQuery = useQuery({
    queryKey: queryKeys.portal.schedule(activeChild ?? ''),
    queryFn: () => portalService.schedule(activeChild),
    enabled: Boolean(activeChild),
  });

  if (meQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (meQuery.isError) {
    return <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />;
  }

  const me = meQuery.data;
  if (me.children.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Ma’lumot topilmadi"
        description="Hisobingizga o‘quvchi biriktirilmagan. O‘quv markazga murojaat qiling."
      />
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Salom, {me.fullName.split(' ')[0]}!</h1>
          <p className="text-sm text-fg-muted">
            {me.kind === 'PARENT' ? 'Farzandingiz ko‘rsatkichlari' : 'Sizning ko‘rsatkichlaringiz'}
          </p>
        </div>
        {me.kind === 'PARENT' && me.children.length > 1 && (
          <Select
            value={activeChild}
            onChange={(event) => setChildId(event.target.value)}
            aria-label="Farzandni tanlash"
            wrapperClassName="sm:w-60"
          >
            {me.children.map((child) => (
              <option key={child.studentId} value={child.studentId}>
                {child.firstName} {child.lastName}
              </option>
            ))}
          </Select>
        )}
      </div>

      {profileQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : profileQuery.isError ? (
        <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
      ) : profile ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Daraja"
              value={`${profile.gamification.level.number}-daraja`}
              hint={`${formatNumber(profile.gamification.totalXp)} XP · ${profile.gamification.streak.current} kun ketma-ket`}
            />
            <Tile
              label="Davomat"
              value={`${profile.attendance.rate}%`}
              hint={`${formatNumber(profile.attendance.total)} dars · ${formatNumber(profile.attendance.absent)} ta qoldirgan`}
            />
            <Tile
              label="Uy vazifasi"
              value={`${profile.homework.rate}%`}
              hint={`${formatNumber(profile.homework.submitted)}/${formatNumber(profile.homework.assigned)} topshirilgan`}
            />
            <Tile
              label="Imtihonlar"
              value={profile.exams.count ? `${profile.exams.averagePercent}%` : '—'}
              hint={profile.exams.count ? `${formatNumber(profile.exams.count)} ta imtihon` : 'Hali imtihon yo‘q'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>To‘lov holati</CardTitle>
                <Wallet className="size-4 text-fg-muted" aria-hidden />
              </CardHeader>
              <CardContent>
                {scheduleQuery.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : scheduleQuery.isError || !scheduleQuery.data ? (
                  <p className="text-sm text-fg-muted">To‘lov jadvali mavjud emas.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Tile label="To‘langan" value={formatMoney(scheduleQuery.data.paid)} />
                      <Tile
                        label="Qolgan"
                        value={formatMoney(scheduleQuery.data.contractTotal - scheduleQuery.data.paid)}
                        hint={
                          scheduleQuery.data.nextDue
                            ? `Keyingi muddat: ${formatDate(scheduleQuery.data.nextDue.dueDate)}`
                            : undefined
                        }
                      />
                    </div>
                    {scheduleQuery.data.installments.length > 0 && (
                      <ul className="mt-3 divide-y divide-border">
                        {scheduleQuery.data.installments.slice(0, 5).map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                            <span className="text-fg-muted">{formatDate(item.dueDate)}</span>
                            <span className="tabular-nums text-fg">{formatMoney(item.amount)}</span>
                            <Badge tone={INSTALLMENT_STATUS_TONES[item.status]}>
                              {INSTALLMENT_STATUS_LABELS[item.status]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>So‘nggi hodisalar</CardTitle>
                <CalendarDays className="size-4 text-fg-muted" aria-hidden />
              </CardHeader>
              <CardContent>
                {profile.activity.length === 0 ? (
                  <p className="text-sm text-fg-muted">Hozircha hodisa yo‘q.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {profile.activity.slice(0, 7).map((item, index) => (
                      <li key={`${item.date}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'truncate font-medium',
                              item.tone === 'negative' ? 'text-red-600 dark:text-red-400' : 'text-fg',
                            )}
                          >
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-fg-subtle">{item.description}</p>
                        </div>
                        <span className="shrink-0 text-xs text-fg-muted">{formatDate(item.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <LessonsCard studentId={activeChild} />

          <CurriculumCard studentId={activeChild} />

          {profileQuery.data && <AchievementsCard profile={profileQuery.data} />}

          <MyCertificatesCard studentId={activeChild} />

          <TelegramLinkCard audience="portal" />

          <FeedbackCard studentId={activeChild} />

          {profile.gamification.badges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Yutuqlar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {profile.gamification.badges.map((badge) => (
                    <span
                      key={badge.key}
                      className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-fg"
                      title={badge.description ?? undefined}
                    >
                      <span aria-hidden>{badge.icon}</span>
                      {badge.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

export default PortalPage;
