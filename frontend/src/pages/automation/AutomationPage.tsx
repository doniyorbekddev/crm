import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { automationService } from '@/services/automation.service';
import type { AutomationAudience } from '@/types/automation';
import { formatDateTime, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { AutomationRule, BuilderTrigger } from '@/types/automation';
import { ACTION_LABELS, AutomationBuilderModal, BUILDER_TRIGGER_LABELS } from './AutomationBuilderModal';

const PARAM_LABELS: Record<string, string> = {
  absences: 'Ketma-ket kelmaslik soni',
  daysBefore: 'Necha kun oldin',
  minDaysOverdue: 'Kechikish (kun)',
  minHoursOverdue: 'Kechikish (soat)',
};

const AUDIENCE_LABELS: Record<AutomationAudience, string> = {
  STAFF: 'Xodimlar',
  RESPONSIBLE: 'Mas’ul xodim',
  STUDENT: 'O‘quvchi',
  PARENT: 'Ota-ona',
};

/**
 * Avtomatlashtirish qoidalari: "shart bo'lsa — xabar bering".
 *
 * Qoidani o'chirib qo'yish yoki parametrini o'zgartirish mumkin — kod o'zgarmaydi.
 * Har bir yurish yozib boriladi, shuning uchun "nega xabar kelmadi?" degan savolga
 * javob shu sahifada.
 */
export default function AutomationPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.ALERT_MANAGE);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [builder, setBuilder] = useState<{ rule?: AutomationRule } | null>(null);
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);

  const rulesQuery = useQuery({ queryKey: queryKeys.automation.list, queryFn: automationService.list });
  const runParams = { page: 1, limit: 15 };
  const runsQuery = useQuery({ queryKey: queryKeys.automation.runs(runParams), queryFn: () => automationService.runs(runParams) });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.automation.all });
  }

  const update = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: Parameters<typeof automationService.update>[1] }) =>
      automationService.update(key, payload),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (key: string) => automationService.remove(key),
    onSuccess: (message) => {
      toast.success(message);
      setDeleting(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const runNow = useMutation({
    mutationFn: () => automationService.run(),
    onSuccess: (result) => {
      toast.success(`${result.message} — ${result.data.notified} ta yangi xabar`);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Avtomatlashtirish"
        description="Shart bajarilganda tizim o‘zi xabar beradi — qoidalarni shu yerda sozlaysiz"
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setBuilder({})}>
                Yangi qoida
              </Button>
              <Button
                variant="secondary"
                leftIcon={<Play className="size-4" aria-hidden />}
                loading={runNow.isPending}
                onClick={() => runNow.mutate()}
              >
                Hozir ishga tushirish
              </Button>
            </div>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Qoidalar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rulesQuery.isPending ? (
            <Skeleton className="m-4 h-40" />
          ) : rulesQuery.isError ? (
            <ErrorState error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
          ) : rulesQuery.data.length === 0 ? (
            <EmptyState icon={Workflow} title="Qoida yo‘q" description="Avtomatlashtirish qoidalari sozlanmagan" />
          ) : (
            <ul className="divide-y divide-border">
              {rulesQuery.data.map((rule) => {
                const draft = drafts[rule.key] ?? {};
                const paramKeys = Object.keys(rule.params);
                const changed = paramKeys.some((key) => draft[key] !== undefined && Number(draft[key]) !== rule.params[key]);
                return (
                  <li key={rule.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                        {rule.name}
                        <Badge tone={rule.isActive ? 'green' : 'gray'}>{rule.isActive ? 'Yoqilgan' : 'O‘chirilgan'}</Badge>
                        {rule.isCustom ? <Badge tone="purple">Maxsus</Badge> : <Badge tone="gray">{AUDIENCE_LABELS[rule.audience]}</Badge>}
                      </p>
                      {rule.description && <p className="text-xs text-fg-subtle">{rule.description}</p>}
                      {rule.isCustom && (
                        <p className="text-xs text-fg-muted">
                          {BUILDER_TRIGGER_LABELS[rule.trigger as BuilderTrigger]?.label ?? rule.trigger} → {(rule.actions ?? []).map((action) => ACTION_LABELS[action.type]).join(', ')}
                          {rule.nextRunAt ? ` · keyingi: ${formatDateTime(rule.nextRunAt)}` : ''}
                        </p>
                      )}
                      <p className="text-xs text-fg-subtle">
                        {rule.lastRunAt
                          ? `Oxirgi yurish: ${formatDateTime(rule.lastRunAt)} · ${formatNumber(rule.lastMatched)} ta holat`
                          : 'Hali ishga tushmagan'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      {paramKeys.map((key) => (
                        <label key={key} className="w-40">
                          <span className="mb-1 block text-xs text-fg-muted">{PARAM_LABELS[key] ?? key}</span>
                          <Input
                            type="number"
                            min={0}
                            disabled={!canManage}
                            value={draft[key] ?? String(rule.params[key] ?? 0)}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [rule.key]: { ...current[rule.key], [key]: event.target.value },
                              }))
                            }
                          />
                        </label>
                      ))}

                      {canManage && changed && (
                        <Button
                          size="sm"
                          loading={update.isPending && update.variables?.key === rule.key}
                          onClick={() =>
                            update.mutate({
                              key: rule.key,
                              payload: {
                                params: Object.fromEntries(
                                  paramKeys.map((key) => [key, Number(draft[key] ?? rule.params[key] ?? 0)]),
                                ),
                              },
                            })
                          }
                        >
                          Saqlash
                        </Button>
                      )}

                      {rule.isCustom && canManage && (
                        <>
                          <Button size="sm" variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setBuilder({ rule })}>
                            Tahrirlash
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`${rule.name} — o‘chirish`} onClick={() => setDeleting(rule)}>
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </>
                      )}
                      <label className="flex items-center gap-2 pb-2 text-sm text-fg">
                        <Checkbox
                          checked={rule.isActive}
                          disabled={!canManage || update.isPending}
                          onChange={(event) => update.mutate({ key: rule.key, payload: { isActive: event.target.checked } })}
                        />
                        Yoqilgan
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>So‘nggi yurishlar</CardTitle>
          <span className="text-xs text-fg-muted">nechta holat topildi va nechta xabar ketdi</span>
        </CardHeader>
        <CardContent className="p-0">
          {runsQuery.isPending ? (
            <Skeleton className="m-4 h-24" />
          ) : runsQuery.isError ? (
            <ErrorState error={runsQuery.error} onRetry={() => void runsQuery.refetch()} />
          ) : runsQuery.data.items.length === 0 ? (
            <EmptyState icon={Workflow} title="Yurish yo‘q" description="Qoidalar hali ishga tushmagan" />
          ) : (
            <ul className="divide-y divide-border">
              {runsQuery.data.items.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-fg">{run.ruleName}</p>
                    <p className="text-xs text-fg-subtle">{formatDateTime(run.startedAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {run.error ? (
                      <Badge tone="red">Xatolik</Badge>
                    ) : (
                      <span className="text-fg-muted">
                        {run.matched} holat · {run.notified} xabar
                      </span>
                    )}
                    {run.error && <p className="mt-0.5 max-w-xs truncate text-xs text-red-600 dark:text-red-400">{run.error}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {builder && (
        <AutomationBuilderModal
          {...(builder.rule ? { rule: builder.rule } : {})}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Qoida o‘chirilsinmi?"
        description={deleting ? `«${deleting.name}» o‘chiriladi. Yaratilgan ishlar va ogohlantirishlar saqlanib qoladi.` : ''}
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.key)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
