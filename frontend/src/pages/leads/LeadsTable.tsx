import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LeadPriorityBadge, LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import type { LeadFilters, LeadListParams, LeadSortBy, LeadStatus } from '@/types/lead';
import { formatDate, formatDateTime, formatPhone } from '@/utils/format';
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, leadFullName } from '@/utils/leadLabels';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissionKeys';

const PAGE_SIZE = 20;

const SORT_OPTIONS: ReadonlyArray<{ value: `${LeadSortBy}:${'asc' | 'desc'}`; label: string }> = [
  { value: 'createdAt:desc', label: 'Avval yangilari' },
  { value: 'createdAt:asc', label: 'Avval eskilari' },
  { value: 'nextFollowUpAt:asc', label: 'Yaqin keyingi aloqa' },
  { value: 'priority:desc', label: 'Muhimlik bo‘yicha' },
  { value: 'updatedAt:desc', label: 'Oxirgi o‘zgarganlar' },
  { value: 'firstName:asc', label: 'Ism (A–Z)' },
];

export function LeadsTable({ filters }: { filters: LeadFilters }) {
  const navigate = useNavigate();
  const now = useNow();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('createdAt:desc');
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();

  const [sortBy, sortOrder] = sort.split(':') as [LeadSortBy, 'asc' | 'desc'];
  const params: LeadListParams = {
    ...filters,
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(status !== 'ALL' ? { status: [status] } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.leads.list(params),
    queryFn: () => leadsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.leads.summary(filters),
    queryFn: () => leadsService.summary(filters),
  });
  const summary = summaryQuery.data;

  const tabs: ReadonlyArray<LeadStatus | 'ALL'> = ['ALL', ...LEAD_STATUS_ORDER];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Status bo‘yicha filtr" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {tabs.map((tab) => {
            const active = status === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStatus(tab);
                  setPage(1);
                }}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                {tab === 'ALL' ? 'Barchasi' : LEAD_STATUS_LABELS[tab]}
                {summary && (
                  <span className={cn('rounded-full px-1.5 tabular-nums', active ? 'bg-brand-100 dark:bg-brand-900' : 'bg-surface-muted')}>
                    {summary[tab]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 gap-2">
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(1);
            }}
            aria-label="Saralash"
            wrapperClassName="min-w-0 flex-1 lg:w-56"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {canExport && (
            <ExportMenu
              loading={exporting}
              onExport={(format) =>
                void runExport(
                  '/leads/export',
                  { ...filters, sortBy, sortOrder, ...(status === 'ALL' ? {} : { status }) },
                  'leadlar',
                  format,
                )
              }
            />
          )}
        </div>
      </div>

      {listQuery.isPending ? (
        <TableSkeleton rows={8} columns={7} />
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
      ) : listQuery.data.items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Lead topilmadi"
          description="Qidiruv yoki filtrlarni o‘zgartirib ko‘ring yoki yangi lead qo‘shing"
        />
      ) : (
        <>
          <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH>Lead</TH>
                  <TH>Holat</TH>
                  <TH>Kurs</TH>
                  <TH>Manba</TH>
                  <TH>Mas’ul</TH>
                  <TH>Keyingi aloqa</TH>
                  <TH>Qo‘shilgan</TH>
                </tr>
              </THead>
              <TBody>
                {listQuery.data.items.map((lead) => {
                  const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < now;
                  return (
                    <TR key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <TD>
                        <div className="min-w-52">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/leads/${lead.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="font-medium text-fg hover:text-brand-600 hover:underline"
                            >
                              {leadFullName(lead)}
                            </Link>
                            {lead.priority === 'URGENT' || lead.priority === 'HIGH' ? <LeadPriorityBadge priority={lead.priority} /> : null}
                          </div>
                          <p className="text-xs text-fg-muted">
                            {lead.code} · {formatPhone(lead.phone)}
                          </p>
                        </div>
                      </TD>
                      <TD>
                        <LeadStatusBadge status={lead.status} />
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{lead.course?.name ?? '—'}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">{lead.source.name}</TD>
                      <TD>
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar firstName={lead.assignedTo.firstName} lastName={lead.assignedTo.lastName} size="xs" />
                            <span className="text-fg-muted">
                              {lead.assignedTo.firstName} {lead.assignedTo.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-fg-subtle">Biriktirilmagan</span>
                        )}
                      </TD>
                      <TD className={cn('whitespace-nowrap', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>
                        {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '—'}
                        {overdue && <span className="block text-[11px] font-normal">kechikkan</span>}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDate(lead.createdAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
          <Pagination
            page={listQuery.data.meta.page}
            totalPages={listQuery.data.meta.totalPages}
            total={listQuery.data.meta.total}
            limit={listQuery.data.meta.limit}
            onPageChange={setPage}
            disabled={listQuery.isFetching}
          />
        </>
      )}
    </Card>
  );
}
