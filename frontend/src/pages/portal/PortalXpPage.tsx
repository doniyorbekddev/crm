import { useQuery } from '@tanstack/react-query';
import { Award, Flame, Sparkles, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { XP_SOURCE_LABELS, XP_SOURCE_TONES } from '@/utils/gamificationLabels';

/** XP, daraja, seriya, reyting, nishonlar va so‘nggi XP tarixi */
export default function PortalXpPage() {
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.gamification(activeChild), queryFn: () => portalService.gamification(activeChild) });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const profile = query.data;

  return (
    <div>
      <PageHeader
        title="XP va yutuqlar"
        description={profile.rank === null ? `${formatNumber(profile.totalXp)} XP` : `Reytingda ${profile.rank}-o‘rin · ${formatNumber(profile.totalXp)} XP`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-fg-muted" aria-hidden />
                {profile.level.icon ? `${profile.level.icon} ` : ''}
                {profile.level.number}-daraja · {profile.level.name}
              </CardTitle>
              <CardDescription>
                {profile.nextLevel
                  ? `Keyingi daraja «${profile.nextLevel.name}» uchun yana ${formatNumber(profile.nextLevel.xpLeft)} XP`
                  : 'Eng yuqori daraja!'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-3 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={profile.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Daraja progressi">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${profile.progress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-3">
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Flame className="size-3.5" aria-hidden />
                  Ketma-ketlik
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{profile.streak.current} kun</p>
                <p className="text-xs text-fg-subtle">eng uzun: {profile.streak.longest} kun</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Trophy className="size-3.5" aria-hidden />
                  Reyting
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{profile.rank === null ? '—' : `${profile.rank}-o‘rin`}</p>
                <p className="text-xs text-fg-subtle">{formatNumber(profile.totalXp)} XP</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-4 text-fg-muted" aria-hidden />
              Nishonlar
            </CardTitle>
            <span className="text-xs text-fg-muted">{profile.badges.length} ta</span>
          </CardHeader>
          <CardContent>
            {profile.badges.length === 0 ? (
              <EmptyState icon={Award} title="Nishon yo‘q" description="Darsga muntazam qatnashing va uy vazifalarini bajaring" />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {profile.badges.map((badge) => (
                  <li key={badge.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="text-2xl" aria-hidden>
                      {badge.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{badge.name}</span>
                      <span className="block truncate text-xs text-fg-subtle">{badge.description}</span>
                      <span className="block text-xs text-fg-subtle">{formatDate(badge.awardedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>So‘nggi XP</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {profile.recentXp.length === 0 ? (
              <EmptyState icon={Sparkles} title="XP hali yo‘q" description="Davomat, vazifa va imtihon uchun XP beriladi" />
            ) : (
              <ul className="divide-y divide-border">
                {profile.recentXp.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-fg">{item.description}</p>
                      <p className="text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={XP_SOURCE_TONES[item.source]}>{XP_SOURCE_LABELS[item.source]}</Badge>
                      <span className="tabular-nums font-medium text-fg">+{item.points}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
