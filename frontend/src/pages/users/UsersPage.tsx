import { DataTable } from '@/components/ui/DataTable';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, KeyRound, Pencil, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { rolesService } from '@/services/roles.service';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/store/auth.store';
import type { UserStatus } from '@/types/auth';
import type { UpdateUserStatusPayload, UserListItem, UserListParams, UserSummaryParams } from '@/types/user';
import { formatDate, formatDateTime } from '@/utils/format';
import { PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from '@/utils/permissionKeys';
import { ApproveUserModal } from './ApproveUserModal';
import { ResetUserPasswordModal } from './ResetUserPasswordModal';
import { UserFormModal } from './UserFormModal';
import { USER_STATUS_LABELS, USER_STATUS_TONES } from './userLabels';
import { useInitialParam } from '@/hooks/useInitialParam';

type StatusFilter = 'ALL' | UserStatus;

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Barchasi' },
  { value: 'PENDING', label: 'Tasdiqlanmagan' },
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'BLOCKED', label: 'Bloklangan' },
];

const PAGE_SIZE = 20;

type DialogState =
  | { type: 'create' }
  | { type: 'edit' | 'approve' | 'reset-password' | 'block' | 'unblock' | 'delete'; user: UserListItem }
  | null;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const canManage = usePermission(PERMISSIONS.USER_MANAGE);
  const isSuperAdmin = currentUser?.role.key === SUPER_ADMIN_ROLE_KEY;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>(useInitialParam<StatusFilter>('status', ['ALL', 'ACTIVE', 'PENDING', 'BLOCKED'], 'ALL'));
  const [roleId, setRoleId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [dialog, setDialog] = useState<DialogState>(null);

  const summaryParams: UserSummaryParams = { ...(search ? { search } : {}), ...(roleId ? { roleId } : {}) };
  const listParams: UserListParams = {
    page,
    limit: PAGE_SIZE,
    ...summaryParams,
    ...(status !== 'ALL' ? { status } : {}),
  };

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(listParams),
    queryFn: () => usersService.list(listParams),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.users.summary(summaryParams),
    queryFn: () => usersService.summary(summaryParams),
  });
  const rolesQuery = useQuery({ queryKey: queryKeys.roles.list, queryFn: rolesService.list, staleTime: 5 * 60_000 });

  const roles = rolesQuery.data ?? [];
  const assignableRoles = isSuperAdmin ? roles : roles.filter((role) => role.key !== SUPER_ADMIN_ROLE_KEY);
  const summary = summaryQuery.data;

  const closeDialog = () => setDialog(null);
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserStatusPayload }) => usersService.setStatus(id, payload),
    onSuccess: (result) => {
      toast.success(result.message);
      closeDialog();
      void refreshUsers();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      closeDialog();
      void refreshUsers();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const actionsFor = (user: UserListItem): ActionMenuItem[] => {
    if (!canManage || user.id === currentUser?.id) return [];
    if (user.role.key === SUPER_ADMIN_ROLE_KEY && !isSuperAdmin) return [];

    const items: ActionMenuItem[] = [];
    if (user.status === 'PENDING') {
      items.push(
        { label: 'Tasdiqlash', icon: UserCheck, onSelect: () => setDialog({ type: 'approve', user }) },
        { label: 'Rad etish', icon: Ban, tone: 'danger', onSelect: () => setDialog({ type: 'block', user }) },
      );
    } else {
      items.push({ label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', user }) });
    }
    if (user.status === 'ACTIVE') {
      items.push(
        { label: 'Parolni tiklash', icon: KeyRound, onSelect: () => setDialog({ type: 'reset-password', user }) },
        { label: 'Bloklash', icon: Ban, tone: 'danger', onSelect: () => setDialog({ type: 'block', user }) },
      );
    }
    if (user.status === 'BLOCKED') {
      items.push({ label: 'Blokdan chiqarish', icon: CheckCircle2, onSelect: () => setDialog({ type: 'unblock', user }) });
    }
    items.push({ label: 'O‘chirish', icon: Trash2, tone: 'danger', onSelect: () => setDialog({ type: 'delete', user }) });
    return items;
  };

  const hasFilters = Boolean(search || roleId || status !== 'ALL');

  return (
    <>
      <PageHeader
        title="Foydalanuvchilar"
        description="Xodimlar, ularning rollari va hisob holati"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Xodim qo‘shish
            </Button>
          ) : undefined
        }
      />

      {canManage && summary && summary.PENDING > 0 && status !== 'PENDING' && (
        <Alert tone="warning" className="mb-4" title={`${summary.PENDING} ta xodim tasdiqlashni kutmoqda`}>
          <button type="button" className="font-medium underline" onClick={() => changeFilter(() => setStatus('PENDING'))}>
            Ro‘yxatni ko‘rish
          </button>
        </Alert>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={status} onValueChange={(value) => changeFilter(() => setStatus(value as typeof status))} variant="pill" panels={false}>
            <TabList label="Holat bo‘yicha filtr">
              {STATUS_TABS.map((tab) => (
                <Tab key={tab.value} value={tab.value} {...(summary ? { count: summary[tab.value] } : {})} {...(tab.value === 'PENDING' ? { countTone: 'warning' as const } : {})}>
                  {tab.label}
                </Tab>
              ))}
            </TabList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Ism, email yoki telefon"
              className="sm:w-72"
            />
            <Select
              value={roleId}
              onChange={(event) => changeFilter(() => setRoleId(event.target.value))}
              aria-label="Rol bo‘yicha filtr"
              wrapperClassName="sm:w-52"
            >
              <option value="">Barcha rollar</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {usersQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : usersQuery.isError ? (
          <ErrorState error={usersQuery.error} retrying={usersQuery.isFetching} onRetry={() => void usersQuery.refetch()} />
        ) : usersQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Xodim topilmadi"
            description={hasFilters ? 'Qidiruv yoki filtrlarni o‘zgartirib ko‘ring' : 'Hali xodimlar qo‘shilmagan'}
          />
        ) : (
          <>
            <DataTable
              bare
              label="Foydalanuvchilar"
              rows={usersQuery.data.items}
              rowKey={(user) => user.id}
              stale={usersQuery.isPlaceholderData}
              mobileLayout="cards"
              columns={[
                {
                  key: 'c0',
                  label: 'Xodim',
                  cell: (user) => (
                    <>
                      <div className="flex min-w-56 items-center gap-3">
                        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-fg">
                            <span className="truncate">
                              {user.firstName} {user.lastName}
                            </span>
                            {user.id === currentUser?.id && <Badge tone="blue">Siz</Badge>}
                          </p>
                          <p className="truncate text-caption text-fg-muted">{user.email}</p>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: 'c1',
                  label: 'Telefon',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (user) => <>{user.phone ?? '—'}</>,
                },
                {
                  key: 'c2',
                  label: 'Rol',
                  cell: (user) => (
                    <>
                      <Badge>{user.role.name}</Badge>
                    </>
                  ),
                },
                {
                  key: 'c3',
                  label: 'Holat',
                  cell: (user) => (
                    <>
                      <Badge tone={USER_STATUS_TONES[user.status]}>{USER_STATUS_LABELS[user.status]}</Badge>
                    </>
                  ),
                },
                {
                  key: 'c4',
                  label: 'Oxirgi kirish',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (user) => (
                    <>
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Hali kirmagan'}
                    </>
                  ),
                },
                {
                  key: 'c5',
                  label: 'Qo‘shilgan',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (user) => <>{formatDate(user.createdAt)}</>,
                },
                {
                  key: 'c6',
                  label: 'Amallar',
                  header: <span className="sr-only">Amallar</span>,
                  fixed: true,
                  thClassName: 'w-12',
                  tdClassName: 'text-right',
                  visible: canManage,
                  cell: (user) => (
                    <>
                      <ActionMenu items={actionsFor(user)} label={`${user.firstName} ${user.lastName} — amallar`} />
                    </>
                  ),
                },
              ]}
            />
            <Pagination
              page={usersQuery.data.meta.page}
              totalPages={usersQuery.data.meta.totalPages}
              total={usersQuery.data.meta.total}
              limit={usersQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={usersQuery.isFetching}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'create' && (
        <UserFormModal
          mode="create"
          roles={assignableRoles}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            void refreshUsers();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <UserFormModal
          mode="edit"
          user={dialog.user}
          roles={assignableRoles}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            void refreshUsers();
          }}
        />
      )}
      {dialog?.type === 'approve' && (
        <ApproveUserModal
          user={dialog.user}
          roles={assignableRoles}
          loading={statusMutation.isPending}
          onClose={closeDialog}
          onApprove={(selectedRoleId) =>
            statusMutation.mutate({ id: dialog.user.id, payload: { status: 'ACTIVE', roleId: selectedRoleId } })
          }
        />
      )}
      {dialog?.type === 'reset-password' && (
        <ResetUserPasswordModal user={dialog.user} onClose={closeDialog} onDone={closeDialog} />
      )}
      {(dialog?.type === 'block' || dialog?.type === 'unblock') && (
        <ConfirmDialog
          open
          tone={dialog.type === 'block' ? 'danger' : 'primary'}
          title={
            dialog.type === 'block'
              ? dialog.user.status === 'PENDING'
                ? 'So‘rov rad etilsinmi?'
                : 'Xodim bloklansinmi?'
              : 'Xodim blokdan chiqarilsinmi?'
          }
          description={
            dialog.type === 'block'
              ? `${dialog.user.firstName} ${dialog.user.lastName} tizimga kira olmaydi, ochiq sessiyalari darhol yopiladi.`
              : `${dialog.user.firstName} ${dialog.user.lastName} yana tizimga kira oladi.`
          }
          confirmLabel={dialog.type === 'block' ? 'Bloklash' : 'Blokdan chiqarish'}
          loading={statusMutation.isPending}
          onConfirm={() =>
            statusMutation.mutate({ id: dialog.user.id, payload: { status: dialog.type === 'block' ? 'BLOCKED' : 'ACTIVE' } })
          }
          onCancel={closeDialog}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          title="Xodim o‘chirilsinmi?"
          description={`${dialog.user.firstName} ${dialog.user.lastName} tizimdan o‘chiriladi. Uning leadlar va to‘lovlardagi tarixi saqlanib qoladi.`}
          confirmLabel="O‘chirish"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(dialog.user.id)}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
