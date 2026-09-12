import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TBody, TH, THead, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { rolesService } from '@/services/roles.service';
import type { Permission, Role } from '@/types/role';
import { SUPER_ADMIN_ROLE_KEY } from '@/utils/permissionKeys';
import { permissionModuleLabel } from '@/utils/permissions';
import { RoleFormModal } from './RoleFormModal';

interface PermissionModuleGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

type RoleDialog = { type: 'create' } | { type: 'edit' | 'delete'; role: Role } | null;

function groupByModule(permissions: readonly Permission[]): PermissionModuleGroup[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.module) ?? [];
    list.push(permission);
    groups.set(permission.module, list);
  }
  return Array.from(groups, ([module, items]) => ({ module, label: permissionModuleLabel(module), permissions: items }));
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((key, index) => key === sortedB[index]);
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: queryKeys.roles.list, queryFn: rolesService.list });
  const permissionsQuery = useQuery({ queryKey: queryKeys.roles.permissions, queryFn: rolesService.permissions, staleTime: 10 * 60_000 });

  /** Saqlanmagan o‘zgarishlar: roleId → yangi ruxsatlar ro‘yxati (faqat o‘zgargan rollar) */
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState<RoleDialog>(null);

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const groups = useMemo(() => groupByModule(permissionsQuery.data ?? []), [permissionsQuery.data]);
  const effective = useMemo(
    () => new Map(roles.map((role) => [role.id, new Set(drafts[role.id] ?? role.permissions)])),
    [roles, drafts],
  );
  const dirtyCount = Object.keys(drafts).length;

  const updateDraft = (role: Role, change: (keys: Set<string>) => void) => {
    setDrafts((previous) => {
      const keys = new Set(previous[role.id] ?? role.permissions);
      change(keys);
      const next = [...keys];
      const copy = { ...previous };
      if (sameKeys(next, role.permissions)) {
        delete copy[role.id];
      } else {
        copy[role.id] = next;
      }
      return copy;
    });
  };

  const refreshRoles = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
    // Joriy foydalanuvchining o‘z ruxsatlari ham o‘zgargan bo‘lishi mumkin
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
  };

  const save = useMutation({
    mutationFn: async () => {
      for (const [roleId, keys] of Object.entries(drafts)) {
        await rolesService.setPermissions(roleId, keys);
      }
    },
    onSuccess: () => {
      toast.success('Ruxsatlar saqlandi');
      setDrafts({});
      refreshRoles();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      refreshRoles();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => rolesService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      setDialog(null);
      refreshRoles();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const isLoading = rolesQuery.isPending || permissionsQuery.isPending;
  const error = rolesQuery.error ?? permissionsQuery.error;

  return (
    <>
      <PageHeader
        title="Rollar va ruxsatlar"
        description="Har bir rol qaysi bo‘limlarni ko‘ra olishi va qanday amallarni bajarishi mumkinligi"
        actions={
          <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
            Yangi rol
          </Button>
        }
      />

      <Alert tone="info" className="mb-4">
        Super Admin roli har doim barcha ruxsatlarga ega va uni o‘zgartirib bo‘lmaydi. Saqlangan o‘zgarishlar xodimlarga darhol
        ta’sir qiladi.
      </Alert>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void rolesQuery.refetch();
              void permissionsQuery.refetch();
            }}
          />
        ) : roles.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Rollar topilmadi" description="Seed ishga tushirilganini tekshiring" />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH className="sticky left-0 z-10 min-w-72 bg-surface-muted">Ruxsat</TH>
                  {roles.map((role) => (
                    <TH
                      key={role.id}
                      className={cn('min-w-36 text-center align-top', drafts[role.id] && 'bg-amber-50 dark:bg-amber-950/40')}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="flex items-center gap-1 font-semibold text-fg">
                          {role.key === SUPER_ADMIN_ROLE_KEY && <Lock className="size-3.5 text-fg-subtle" aria-label="O‘zgartirib bo‘lmaydi" />}
                          {role.name}
                        </span>
                        <span className="text-xs font-normal text-fg-muted">
                          {role.userCount} xodim · {effective.get(role.id)?.size ?? 0} ruxsat
                        </span>
                        {role.key !== SUPER_ADMIN_ROLE_KEY && (
                          <ActionMenu
                            label={`${role.name} roli — amallar`}
                            items={[
                              { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', role }) },
                              ...(!role.isSystem
                                ? [{ label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', role }) }]
                                : []),
                            ]}
                          />
                        )}
                      </div>
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {groups.map((group) => (
                  <Fragment key={group.module}>
                    <tr className="border-t border-border bg-surface-muted/60">
                      <td className="sticky left-0 z-10 bg-surface-muted px-4 py-2 text-xs font-semibold tracking-wide text-fg uppercase">
                        {group.label}
                      </td>
                      {roles.map((role) => {
                        const keys = effective.get(role.id);
                        const checkedCount = group.permissions.filter((permission) => keys?.has(permission.key)).length;
                        return (
                          <td key={role.id} className="px-4 py-2 text-center">
                            <Checkbox
                              checked={checkedCount === group.permissions.length}
                              indeterminate={checkedCount > 0 && checkedCount < group.permissions.length}
                              disabled={role.key === SUPER_ADMIN_ROLE_KEY || save.isPending}
                              aria-label={`${role.name}: ${group.label} — barchasi`}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                updateDraft(role, (draft) => {
                                  for (const permission of group.permissions) {
                                    if (checked) draft.add(permission.key);
                                    else draft.delete(permission.key);
                                  }
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {group.permissions.map((permission) => (
                      <tr key={permission.key} className="border-t border-border hover:bg-surface-muted/40">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                          <p className="text-sm text-fg">{permission.description}</p>
                          <p className="font-mono text-[11px] text-fg-subtle">{permission.key}</p>
                        </td>
                        {roles.map((role) => (
                          <td key={role.id} className={cn('px-4 py-2.5 text-center', drafts[role.id] && 'bg-amber-50/50 dark:bg-amber-950/20')}>
                            <Checkbox
                              checked={effective.get(role.id)?.has(permission.key) ?? false}
                              disabled={role.key === SUPER_ADMIN_ROLE_KEY || save.isPending}
                              aria-label={`${role.name}: ${permission.description}`}
                              onChange={() =>
                                updateDraft(role, (draft) => {
                                  if (draft.has(permission.key)) draft.delete(permission.key);
                                  else draft.add(permission.key);
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {dirtyCount > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{dirtyCount} ta rolda saqlanmagan o‘zgarish bor</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={save.isPending} onClick={() => setDrafts({})}>
              Bekor qilish
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
              O‘zgarishlarni saqlash
            </Button>
          </div>
        </div>
      )}

      {dialog?.type === 'create' && (
        <RoleFormModal
          mode="create"
          roles={roles}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refreshRoles();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <RoleFormModal
          mode="edit"
          role={dialog.role}
          roles={roles}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refreshRoles();
          }}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          title={`«${dialog.role.name}» roli o‘chirilsinmi?`}
          description={
            dialog.role.userCount > 0
              ? `Bu rolda ${dialog.role.userCount} ta xodim bor — avval ularni boshqa rolga o‘tkazing.`
              : 'Rol va uning ruxsatlari butunlay o‘chiriladi.'
          }
          confirmLabel="O‘chirish"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(dialog.role.id)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
