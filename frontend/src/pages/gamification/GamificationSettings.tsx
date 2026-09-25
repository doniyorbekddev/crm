import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { gamificationService } from '@/services/gamification.service';
import { formatNumber } from '@/utils/format';
import { BADGE_CATEGORY_LABELS, BADGE_RULE_LABELS, BADGE_RULE_UNITS, XP_SOURCE_LABELS, XP_SOURCE_TONES } from '@/utils/gamificationLabels';
import { BadgeFormModal } from './BadgeFormModal';

/** Tahrirlanadigan raqamli maydon — o‘zgargandagina saqlash tugmasi ochiladi */
function NumberField({
  value,
  onSave,
  saving,
  suffix,
  ariaLabel,
}: {
  value: number;
  onSave: (next: number) => void;
  saving: boolean;
  suffix?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const changed = draft !== String(value) && draft.trim() !== '';

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={ariaLabel}
        className="w-28"
      />
      {suffix && <span className="text-xs text-fg-muted">{suffix}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={!changed || saving}
        loading={saving}
        onClick={() => onSave(Number(draft))}
        aria-label="Saqlash"
      >
        <Save className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function GamificationSettings() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const rulesQuery = useQuery({ queryKey: queryKeys.gamification.rules, queryFn: gamificationService.rules });
  const levelsQuery = useQuery({ queryKey: queryKeys.gamification.levels, queryFn: gamificationService.levels });
  const badgesQuery = useQuery({ queryKey: queryKeys.gamification.badges, queryFn: gamificationService.badges });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.gamification.all });
  };

  const saveRule = useMutation({
    mutationFn: ({ id, points, isActive }: { id: string; points?: number; isActive?: boolean }) =>
      gamificationService.updateRule(id, { ...(points === undefined ? {} : { points }), ...(isActive === undefined ? {} : { isActive }) }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveLevel = useMutation({
    mutationFn: ({ id, minXp }: { id: string; minXp: number }) => gamificationService.updateLevel(id, { minXp }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveBadge = useMutation({
    mutationFn: ({ id, threshold, isActive }: { id: string; threshold?: number; isActive?: boolean }) =>
      gamificationService.updateBadge(id, {
        ...(threshold === undefined ? {} : { threshold }),
        ...(isActive === undefined ? {} : { isActive }),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const recalculate = useMutation({
    mutationFn: () => gamificationService.recalculate(),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>XP qoidalari</CardTitle>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="size-4" aria-hidden />}
            loading={recalculate.isPending}
            onClick={() => recalculate.mutate()}
          >
            Hammasini qayta hisoblash
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rulesQuery.isPending ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : rulesQuery.isError ? (
            <ErrorState error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
          ) : (
            <ul className="divide-y divide-border">
              {rulesQuery.data.map((rule) => (
                <li key={rule.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !rule.isActive && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-fg">
                      {rule.name}
                      <Badge tone={XP_SOURCE_TONES[rule.source]}>{XP_SOURCE_LABELS[rule.source]}</Badge>
                    </p>
                    {rule.description && <p className="text-xs text-fg-muted">{rule.description}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(event) => saveRule.mutate({ id: rule.id, isActive: event.target.checked })}
                      className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
                    />
                    Faol
                  </label>
                  <NumberField
                    key={`${rule.id}-${rule.points}`}
                    value={rule.points}
                    suffix="XP"
                    ariaLabel={`${rule.name} ballari`}
                    saving={saveRule.isPending}
                    onSave={(points) => saveRule.mutate({ id: rule.id, points })}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Darajalar</CardTitle>
            <span className="text-xs text-fg-muted">XP chegarasi o‘zgarsa, profillar qayta hisoblanadi</span>
          </CardHeader>
          <CardContent className="p-0">
            {levelsQuery.isPending ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : levelsQuery.isError ? (
              <ErrorState error={levelsQuery.error} onRetry={() => void levelsQuery.refetch()} />
            ) : (
              <ul className="divide-y divide-border">
                {levelsQuery.data.map((level) => (
                  <li key={level.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-lg">{level.icon ?? '⭐'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">
                        {level.number}-daraja · {level.name}
                      </p>
                      <p className="text-xs text-fg-muted">{formatNumber(level.students)} ta o‘quvchi</p>
                    </div>
                    <NumberField
                      key={`${level.id}-${level.minXp}`}
                      value={level.minXp}
                      suffix="XP"
                      ariaLabel={`${level.number}-daraja chegarasi`}
                      saving={saveLevel.isPending}
                      onSave={(minXp) => saveLevel.mutate({ id: level.id, minXp })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Nishonlar</CardTitle>
            <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              Nishon yaratish
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {badgesQuery.isPending ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : badgesQuery.isError ? (
              <ErrorState error={badgesQuery.error} onRetry={() => void badgesQuery.refetch()} />
            ) : (
              <ul className="divide-y divide-border">
                {badgesQuery.data.map((badge) => (
                  <li key={badge.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !badge.isActive && 'opacity-60')}>
                    <span className="text-xl">{badge.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{badge.name}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {BADGE_CATEGORY_LABELS[badge.category]} · {BADGE_RULE_LABELS[badge.rule]} · {formatNumber(badge.awarded)} ta berilgan
                        {badge.xpReward > 0 && ` · +${badge.xpReward} XP`}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      <input
                        type="checkbox"
                        checked={badge.isActive}
                        onChange={(event) => saveBadge.mutate({ id: badge.id, isActive: event.target.checked })}
                        className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
                      />
                      Faol
                    </label>
                    {badge.rule !== 'MANUAL' && badge.rule !== 'COURSE_COMPLETED' && (
                      <NumberField
                        key={`${badge.id}-${badge.threshold ?? 0}`}
                        value={badge.threshold ?? 0}
                        suffix={BADGE_RULE_UNITS[badge.rule]}
                        ariaLabel={`${badge.name} chegarasi`}
                        saving={saveBadge.isPending}
                        onSave={(threshold) => saveBadge.mutate({ id: badge.id, threshold })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {creating && <BadgeFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
