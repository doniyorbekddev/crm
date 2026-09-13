import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { parentsService } from '@/services/parents.service';
import type { ParentItem, ParentListParams } from '@/types/parent';
import { formatPhone } from '@/utils/format';
import { PARENT_RELATION_LABELS } from '@/utils/parentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { LinkStudentModal } from './LinkModals';
import { ParentFormModal } from './ParentFormModal';

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
  | null;

export default function ParentsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.PARENT_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('name:asc');
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

  const rowActions = (parent: ParentItem) => [
    { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', parent }) },
    { label: 'Farzand biriktirish', icon: Link2, onSelect: () => setDialog({ type: 'link', parent }) },
    { label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', parent }) },
  ];

  const close = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Ota-onalar"
        description="Vakillar, aloqa ma’lumotlari va farzandlar"
        documentTitle="Ota-onalar"
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
              Ota-ona qo‘shish
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              setPage(1);
            }}
            placeholder="Ism, telefon yoki farzand ismi"
            className="sm:max-w-xs"
          />
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(1);
            }}
            aria-label="Saralash"
            wrapperClassName="sm:w-52 sm:ml-auto"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {parentsQuery.isPending ? (
          <TableSkeleton rows={6} columns={4} />
        ) : parentsQuery.isError ? (
          <ErrorState error={parentsQuery.error} retrying={parentsQuery.isFetching} onRetry={() => void parentsQuery.refetch()} />
        ) : parentsQuery.data.items.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Ota-ona topilmadi"
            description={canManage ? 'Yangi ota-ona qo‘shing yoki o‘quvchi profilidan biriktiring' : 'Qidiruvni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', parentsQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Ota-ona</TH>
                    <TH>Aloqa</TH>
                    <TH>Farzandlar</TH>
                    {canManage && (
                      <TH className="w-12">
                        <span className="sr-only">Amallar</span>
                      </TH>
                    )}
                  </tr>
                </THead>
                <TBody>
                  {parentsQuery.data.items.map((parent) => (
                    <TR key={parent.id}>
                      <TD>
                        <p className="font-medium text-fg">
                          {parent.firstName} {parent.lastName}
                        </p>
                        {parent.notes && <p className="max-w-[16rem] truncate text-xs text-fg-muted">{parent.notes}</p>}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <a href={`tel:${parent.phone}`} className="text-fg hover:text-brand-600">
                          {formatPhone(parent.phone)}
                        </a>
                        <p className="text-xs text-fg-muted">{[parent.telegram, parent.email].filter(Boolean).join(' · ') || '—'}</p>
                      </TD>
                      <TD>
                        {parent.students.length === 0 ? (
                          <span className="text-xs text-fg-subtle">Biriktirilmagan</span>
                        ) : (
                          <ul className="space-y-1">
                            {parent.students.map((link) => (
                              <li key={link.linkId} className="flex flex-wrap items-center gap-1.5 text-sm">
                                <Link to={`/students/${link.studentId}`} className="font-medium text-fg hover:text-brand-600">
                                  {link.firstName} {link.lastName}
                                </Link>
                                <Badge tone={link.status === 'ACTIVE' ? 'green' : 'gray'}>{PARENT_RELATION_LABELS[link.relation]}</Badge>
                                {link.isPrimary && <Badge tone="blue">Asosiy</Badge>}
                                {link.group && <span className="text-xs text-fg-muted">{link.group.name}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TD>
                      {canManage && (
                        <TD className="text-right">
                          <ActionMenu label={`${parent.firstName} ${parent.lastName} amallari`} items={rowActions(parent)} />
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={page}
              totalPages={parentsQuery.data.meta.totalPages}
              total={parentsQuery.data.meta.total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              disabled={parentsQuery.isPlaceholderData}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'create' && <ParentFormModal onClose={close} onSaved={saved} />}
      {dialog?.type === 'edit' && <ParentFormModal parent={dialog.parent} onClose={close} onSaved={saved} />}
      {dialog?.type === 'link' && <LinkStudentModal parent={dialog.parent} onClose={close} onSaved={saved} />}

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
