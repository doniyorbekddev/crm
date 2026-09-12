import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { gamificationService } from '@/services/gamification.service';
import { formatDateTime, formatNumber } from '@/utils/format';
import { XP_SOURCE_LABELS, XP_SOURCE_TONES, formatXp } from '@/utils/gamificationLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface StudentXpModalProps {
  studentId: string;
  onClose: () => void;
}

export function StudentXpModal({ studentId, onClose }: StudentXpModalProps) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.GAMIFICATION_MANAGE);

  const [showAward, setShowAward] = useState(false);
  const [points, setPoints] = useState('50');
  const [description, setDescription] = useState('');
  const [badgeId, setBadgeId] = useState('');

  const profileQuery = useQuery({
    queryKey: queryKeys.gamification.profile(studentId),
    queryFn: () => gamificationService.profile(studentId),
  });
  const badgesQuery = useQuery({
    queryKey: queryKeys.gamification.badges,
    queryFn: gamificationService.badges,
    enabled: canManage,
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.gamification.all });
  };

  const awardXp = useMutation({
    mutationFn: () => gamificationService.awardXp({ studentId, points: Number(points), description: description.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setDescription('');
      setShowAward(false);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const awardBadge = useMutation({
    mutationFn: () => gamificationService.awardBadge(studentId, badgeId),
    onSuccess: (result) => {
      toast.success(result.message);
      setBadgeId('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const profile = profileQuery.data;
  const manualBadges = (badgesQuery.data ?? []).filter(
    (badge) => badge.rule === 'MANUAL' && !profile?.badges.some((owned) => owned.key === badge.key),
  );

  return (
    <Modal
      open
      size="lg"
      title="XP va yutuqlar"
      description={profile ? `${profile.firstName} ${profile.lastName} · ${profile.code}` : 'Yuklanmoqda'}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      {profileQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : profileQuery.isError ? (
        <Alert tone="error">{getErrorMessage(profileQuery.error)}</Alert>
      ) : !profile ? null : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  <span className="text-xl">{profile.level.icon ?? '⭐'}</span>
                  {profile.level.number}-daraja · {profile.level.name}
                </p>
                <p className="mt-1 text-2xl font-bold text-fg">{formatXp(profile.totalXp)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fg-muted">Reytingdagi o‘rni</p>
                <p className="text-xl font-semibold text-fg">{profile.rank ? `#${profile.rank}` : '—'}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span>{profile.level.name}</span>
                <span>
                  {profile.nextLevel
                    ? `${profile.nextLevel.name}gacha ${formatNumber(profile.nextLevel.xpLeft)} XP`
                    : 'Eng yuqori daraja'}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${profile.progress}%` }} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={profile.streak.current > 0 ? 'yellow' : 'gray'}>
                <Flame className="size-3" aria-hidden />
                Joriy seriya: {profile.streak.current}
              </Badge>
              <Badge>Eng uzun: {profile.streak.longest}</Badge>
              <Badge tone="purple">{profile.badges.length} nishon</Badge>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-fg">Nishonlar</p>
            {profile.badges.length === 0 ? (
              <p className="text-xs text-fg-muted">Hali nishon yo‘q — davomat va uy vazifalari orqali yig‘iladi.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.badges.map((badge) => (
                  <span
                    key={badge.id}
                    title={`${badge.description} · ${formatDateTime(badge.awardedAt)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg"
                  >
                    <span className="text-base">{badge.icon}</span>
                    {badge.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-fg">So‘nggi XP harakatlari</p>
            {profile.recentXp.length === 0 ? (
              <p className="text-xs text-fg-muted">XP yozuvlari yo‘q.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {profile.recentXp.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{item.description}</p>
                      <p className="text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={XP_SOURCE_TONES[item.source]}>{XP_SOURCE_LABELS[item.source]}</Badge>
                      <span className={cn('text-sm font-semibold', item.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                        {item.points >= 0 ? '+' : ''}
                        {item.points}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              {!showAward ? (
                <Button variant="secondary" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setShowAward(true)}>
                  Qo‘lda XP berish
                </Button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                  <FormField label="Ball" htmlFor="manual-xp-points" hint="Manfiy ham bo‘lishi mumkin">
                    <Input
                      id="manual-xp-points"
                      type="number"
                      value={points}
                      onChange={(event) => setPoints(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Izoh" htmlFor="manual-xp-note">
                    <Input
                      id="manual-xp-note"
                      value={description}
                      placeholder="Masalan: olimpiadada g‘olib"
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </FormField>
                  <Button
                    leftIcon={<Sparkles className="size-4" aria-hidden />}
                    loading={awardXp.isPending}
                    disabled={description.trim().length < 3 || Number(points) === 0}
                    onClick={() => awardXp.mutate()}
                  >
                    Berish
                  </Button>
                </div>
              )}

              {manualBadges.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <FormField label="Nishon berish" htmlFor="manual-badge">
                    <Select id="manual-badge" value={badgeId} onChange={(event) => setBadgeId(event.target.value)}>
                      <option value="">Nishonni tanlang</option>
                      {manualBadges.map((badge) => (
                        <option key={badge.id} value={badge.id}>
                          {badge.icon} {badge.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <Button variant="secondary" loading={awardBadge.isPending} disabled={!badgeId} onClick={() => awardBadge.mutate()}>
                    Nishon berish
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
