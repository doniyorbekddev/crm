import { headerSort } from '@/utils/tableSort';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BulkPortalAccountsModal } from '@/components/BulkPortalAccountsModal';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { PageHeader } from '@/components/PageHeader';
import { PortalAccountModal } from '@/components/PortalAccountModal';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { parentsService } from '@/services/parents.service';
import { studentsService } from '@/services/students.service';
import type { ParentItem, ParentListParams } from '@/types/parent';
import { formatPhone } from '@/utils/format';
import { PARENT_RELATION_LABELS } from '@/utils/parentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { LinkStudentModal } from './LinkModals';
import { ParentFormModal } from './ParentFormModal';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Familiya (A–Z)' },
  { value: 'createdAt:desc', label: 'Yangi qo‘shilganlar' },
] as const;

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; parent: ParentItem }
  | { type: 'link'; parent: ParentItem }
  | { type: 'delete'; parent: ParentItem }
  | { type: 'portal' | 'portalReset'; parent: ParentItem }
  | { type: 'portalBulk' }
  | null;

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { parent: 'name' } as const;

export default function ParentsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.PARENT_MANAGE);
  const canManagePortal = usePermission(PERMISSIONS.PORTAL_MANAGE);
  const showActions = canManage || canManagePortal;

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [sort, setSort] = useState<string>('name:asc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [sortBy, sortOrder] = sort.split(':') as [ParentListParams['sortBy'], ParentListParams['sortOrder']];
  const params: ParentListParams = { page, limit: PAGE_SIZE, sortBy, sortOrder, ...(search ? { search } : {}) };

  const parentsQuery = useQuery({
    queryKey: queryKeys.parents.list(params),
    queryFn: () => parentsService.list(params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.parents.all });
    // Asosiy vakil telefoni o'quvchi kartasida ham ko'rinadi
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  };

  const remove = useMutation({
    mutationFn: (parent: ParentItem) => parentsService.remove(parent.id),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.studentForm,
    queryFn: studentsService.formLookups,
    staleTime: 60_000,
    enabled: canManagePortal,
  });

  const rowActions = (parent: ParentItem) => [
    ...(canManage
      ? [
          { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', parent }) },
          { label: 'Farzand biriktirish', icon: Link2, onSelect: () => setDialog({ type: 'link', parent }) },
        ]
      : []),
    ...(canManagePortal && parent.students.length > 0
      ? [
          parent.hasPortalAccount
            ? { label: 'Kabinet parolini tiklash', icon: KeyRound, onSelect: () => setDialog({ type: 'portalReset', parent }) }
            : { label: 'Kabinet ochish', icon: KeyRound, onSelect: () => setDialog({ type: 'portal', parent }) },
        ]
      : []),
    ...(canManage ? [{ label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', parent }) }] : []),
  ];

  const close = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    refresh();
  };

  type ParentTableRow = NonNullable<typeof parentsQuery.data>['items'][number];
  const parentTableColumns: Array<ColumnDef<ParentTableRow>> = [
    {
      key: 'parent',
      sortable: true,
      label: 'Ota-ona',
      required: true,
      cell: (parent: ParentTableRow) => (
        <>
          <p className="font-medium text-fg">
            {parent.firstName} {parent.lastName}
          </p>
          {parent.notes && <p className="max-w-[16rem] truncate text-caption text-fg-muted">{parent.notes}</p>}
        </>
      ),
    },
    {
      key: 'contact',
      label: 'Aloqa',
      tdClassName: 'whitespace-nowrap',
      cell: (parent: ParentTableRow) => (
        <>
          <a href={`tel:${parent.phone}`} className="text-fg hover:text-brand-600">
            {formatPhone(parent.phone)}
          </a>
          <p className="text-caption text-fg-muted">{[parent.telegram, parent.email].filter(Boolean).join(' · ') || '—'}</p>
        </>
      ),
    },
    {
      key: 'children',
      label: 'Farzandlar',
      cell: (parent: ParentTableRow) => (
        <>
          {parent.students.length === 0 ? (
            <span className="text-caption text-fg-subtle">Biriktirilmagan</span>
          ) : (
            <ul className="space-y-1">
              {parent.students.map((link) => (
                <li key={link.linkId} className="flex flex-wrap items-center gap-1.5 text-body">
                  <Link to={`/students/${link.studentId}`} className="font-medium text-fg hover:text-brand-600">
                    {link.firstName} {link.lastName}
                  </Link>
                  <Badge tone={link.status === 'ACTIVE' ? 'green' : 'gray'}>{PARENT_RELATION_LABELS[link.relation]}</Badge>
                  {link.isPrimary && <Badge tone="blue">Asosiy</Badge>}
                  {link.group && <span className="text-caption text-fg-muted">{link.group.name}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    ...(showActions ? [{
      key: 'actions',
      label: 'Amallar',
      header: <span className="sr-only">Amallar</span>,
      fixed: true,
      thClassName: 'w-12',
      tdClassName: 'text-right',
      cell: (parent: ParentTableRow) => (
        <>
          <ActionMenu label={`${parent.firstName} ${parent.lastName} amallari`} items={rowActions(parent)} />
        </>
      ),
    }] : []),
  ];
  const parentTable = useTableColumns('parents', parentTableColumns);
  const density = useTableDensity();

  return (
    <>
      <PageHeader
        title="Ota-onalar"
        description="Vakillar, aloqa ma’lumotlari va farzandlar"
        documentTitle="Ota-onalar"
        actions={
          showActions ? (
            <>
              {canManagePortal && (
                <Button variant="secondary" leftIcon={<KeyRound className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'portalBulk' })}>
                  Kabinetlar ochish
                </Button>
              )}
              {canManage && (
                <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
                  Ota-ona qo‘shish
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <DataTable
        {...headerSort(sort, SORT_COLUMNS, 'name:asc', (value) => {
          setSort(value);
          setPage(1);
        })}
        label="Ota-onalar"
        columns={parentTable.visibleColumns}
        rows={parentsQuery.data?.items}
        rowKey={(parent) => parent.id}
        loading={parentsQuery.isPending}
        error={parentsQuery.error}
        onRetry={() => void parentsQuery.refetch()}
        retrying={parentsQuery.isFetching}
        stale={parentsQuery.isPlaceholderData}
        empty={{
          icon: UsersRound,
          title: 'Ota-ona topilmadi',
          description: canManage ? 'Yangi ota-ona qo‘shing yoki o‘quvchi profilidan biriktiring' : 'Qidiruvni o‘zgartirib ko‘ring',
        }}
        toolbar={
          <FilterBar
            search={{
              value: searchInput,
              onChange: (value) => {
                setSearchInput(value);
                setPage(1);
              },
              placeholder: 'Ism, telefon yoki farzand ismi',
            }}
          />
        }
        toolbarActions={
          <>
            <Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Saralash" wrapperClassName="w-44">
              {!SORT_OPTIONS.some((option) => option.value === sort) && <option value={sort}>Ustun bo‘yicha</option>}
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <ColumnSettings control={parentTable} />
          </>
        }
        {...density}
        mobileLayout="cards"
        {...(parentsQuery.data
          ? {
              pagination: {
                page,
                totalPages: parentsQuery.data.meta.totalPages,
                total: parentsQuery.data.meta.total,
                limit: PAGE_SIZE,
                onPageChange: setPage,
                disabled: parentsQuery.isPlaceholderData,
              },
            }
          : {})}
      />

      {dialog?.type === 'create' && <ParentFormModal onClose={close} onSaved={saved} />}
      {dialog?.type === 'edit' && <ParentFormModal parent={dialog.parent} onClose={close} onSaved={saved} />}
      {dialog?.type === 'link' && <LinkStudentModal parent={dialog.parent} onClose={close} onSaved={saved} />}
      {(dialog?.type === 'portal' || dialog?.type === 'portalReset') && (
        <PortalAccountModal
          fullName={`${dialog.parent.firstName} ${dialog.parent.lastName}`}
          subtitle={dialog.parent.students.map((link) => `${link.firstName} ${link.lastName}`).join(', ') || null}
          loginHint={
            <>
              Ota-ona <b className="font-mono text-fg">{formatPhone(dialog.parent.phone)}</b> telefon raqami va tizim bergan parol bilan kiradi.
            </>
          }
          create={(email) => parentsService.createPortalAccount(dialog.parent.id, email)}
          reset={() => parentsService.resetPortalPassword(dialog.parent.id)}
          mode={dialog.type === 'portalReset' ? 'reset' : 'create'}
          onClose={close}
          onSaved={refresh}
        />
      )}
      {dialog?.type === 'portalBulk' && (
        <BulkPortalAccountsModal
          title="Ota-onalarga kabinet ochish"
          description="Har bir ota-ona o‘z telefon raqami va shaxsiy paroli bilan kiradi va farzandlarini ko‘radi"
          allLabel="Farzandi faol o‘qiyotgan barcha ota-onalar"
          groups={lookupsQuery.data?.groups ?? []}
          run={async (groupId) => {
            const result = await parentsService.bulkCreatePortalAccounts(groupId ? { groupId } : {});
            return {
              rows: result.data.created.map((row) => ({
                id: row.parentId,
                fullName: row.fullName,
                subtitle: row.children,
                login: row.login,
                temporaryPassword: row.temporaryPassword,
              })),
              skipped: result.data.skipped,
              warnings: result.data.duplicatePhones,
              message: result.message,
            };
          }}
          onClose={close}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Ota-onani o‘chirish"
        description={
          dialog?.type === 'delete' && dialog.parent.students.length > 0
            ? `${dialog.parent.students.length} ta farzanddan ajratiladi. Asosiy vakil bo‘lgan o‘quvchilarga keyingi ota-ona avtomatik tayinlanadi.`
            : 'Profil butunlay o‘chiriladi.'
        }
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.parent)}
        onCancel={close}
      />
    </>
  );
}
