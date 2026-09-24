import { Award, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PortalProfile } from '@/types/portal';
import { formatDate, formatNumber } from '@/utils/format';

/**
 * Nishonlar va reyting o'rni.
 *
 * Ma'lumot profil so'rovida allaqachon keladi (`gamification.badges`, `gamification.rank`) —
 * shuning uchun qo'shimcha so'rov yo'q.
 */
export function AchievementsCard({ profile }: { profile: PortalProfile }) {
  const { badges, rank, totalXp } = profile.gamification;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-fg-subtle" aria-hidden />
          Yutuqlar
        </CardTitle>
        <span className="text-xs text-fg-muted">
          {rank === null ? `${formatNumber(totalXp)} XP` : `Reytingda ${rank}-o‘rin · ${formatNumber(totalXp)} XP`}
        </span>
      </CardHeader>
      <CardContent>
        {badges.length === 0 ? (
          <EmptyState icon={Award} title="Nishon yo‘q" description="Darsga muntazam qatnashing va uy vazifalarini bajaring" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <li
                key={badge.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                title={`${badge.description} · ${formatDate(badge.awardedAt)}`}
              >
                <span className="text-lg" aria-hidden>
                  {badge.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-fg">{badge.name}</span>
                  <span className="block text-xs text-fg-subtle">{formatDate(badge.awardedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
