import { headerSort } from '@/utils/tableSort';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { useTableDensity } from '@/hooks/useTableDensity';
import { DataTable } from '@/components/ui/DataTable';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LeadPriorityBadge, LeadStatusBadge, LeadTemperatureBadge } from '@/components/leads/LeadStatusBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Select } from '@/components/ui/Select';
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
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS: ReadonlyArray<{ value: `${LeadSortBy}:${'asc' | 'desc'}`; label: string }> = [
  { value: 'createdAt:desc', label: 'Avval yangilari' },
  { value: 'createdAt:asc', label: 'Avval eskilari' },
  { value: 'nextFollowUpAt:asc', label: 'Yaqin keyingi aloqa' },
  { value: 'priority:desc', label: 'Muhimlik bo‘yicha' },
  { value: 'score:desc', label: 'Eng qizigan leadlar' },
  { value: 'updatedAt:desc', label: 'Oxirgi o‘zgarganlar' },
  { value: 'firstName:asc', label: 'Ism (A–Z)' },
];

/** Ustun kaliti → API `sortBy` (sarlavha bosilganda server saralaydi) */
const SORT_COLUMNS = { lead: 'firstName', nextFollowUp: 'nextFollowUpAt', createdAt: 'createdAt' } as const;

export function LeadsTable({ filters }: { filters: LeadFilters }) {
  const navigate = useNavigate();
  const now = useNow();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState<string>('createdAt:desc');
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

  type LeadTableRow = NonNullable<typeof listQuery.data>['items'][number];
  const leadTableColumns: Array<ColumnDef<LeadTableRow>> = [
    {
      key: 'lead',
      sortable: true,
      label: 'Lead',
      required: true,
      cell: (lead: LeadTableRow) => (
        <>
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
            <p className="text-caption text-fg-muted">
              {lead.code} · {formatPhone(lead.phone)}
            </p>
          </div>
        </>
      ),
    },
    {
      key: 'status',
      label: 'Holat',
      cell: (lead: LeadTableRow) => (
        <>
          <LeadStatusBadge status={lead.status} />
        </>
      ),
    },
    {
      key: 'temperature',
      label: 'Daraja',
      cell: (lead: LeadTableRow) => (
        <>
          <LeadTemperatureBadge temperature={lead.temperature} score={lead.score} />
        </>
      ),
    },
    {
      key: 'course',
      label: 'Kurs',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (lead: LeadTableRow) => (
        <>
          {lead.course?.name ?? '—'}
        </>
      ),
    },
    {
      key: 'source',
      label: 'Manba',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (lead: LeadTableRow) => (
        <>
          {lead.source.name}
        </>
      ),
    },
    {
      key: 'assignee',
      label: 'Mas’ul',
      cell: (lead: LeadTableRow) => (
        <>
          {lead.assignedTo ? (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Avatar firstName={lead.assignedTo.firstName} lastName={lead.assignedTo.lastName} size="xs" />
              <span className="text-fg-muted">
                {lead.assignedTo.firstName} {lead.assignedTo.lastName}
              </span>
            </div>
          ) : (
            <span className="text-caption text-fg-subtle">Biriktirilmagan</span>
          )}
        </>
      ),
    },
    {
      key: 'nextFollowUp',
      sortable: true,
      label: 'Keyingi aloqa',
      tdClassName: (lead: LeadTableRow) => {
        const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < now;
        return cn('whitespace-nowrap', overdue ? 'font-medium text-danger' : 'text-fg-muted');
      },
      cell: (lead: LeadTableRow) => {
        const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < now;
        return (
          <>
            {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '—'}
            {overdue && <span className="block text-[11px] font-normal">kechikkan</span>}
          </>
        );
      },
    },
    {
      key: 'createdAt',
      sortable: true,
      label: 'Qo‘shilgan',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (lead: LeadTableRow) => (
        <>
          {formatDate(lead.createdAt)}
        </>
      ),
    },
  ];
  const leadTable = useTableColumns('leads', leadTableColumns);
  const density = useTableDensity();

  return (
    <DataTable
      {...headerSort(sort, SORT_COLUMNS, 'createdAt:desc', (value) => {
          setSort(value);
          setPage(1);
        })}
      label="Leadlar"
      columns={leadTable.visibleColumns}
      rows={listQuery.data?.items}
      rowKey={(lead) => lead.id}
      onRowClick={(lead) => navigate(`/leads/${lead.id}`)}
      loading={listQuery.isPending}
      error={listQuery.error}
      onRetry={() => void listQuery.refetch()}
      retrying={listQuery.isFetching}
      stale={listQuery.isPlaceholderData}
      empty={{ icon: Target, title: 'Lead topilmadi', description: 'Qidiruv yoki filtrlarni o‘zgartirib ko‘ring yoki yangi lead qo‘shing' }}
      header={
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value as typeof status);
            setPage(1);
          }}
          panels={false}
        >
          <TabList label="Status bo‘yicha filtr" className="px-4">
            {tabs.map((tab) => (
              <Tab key={tab} value={tab} {...(summary ? { count: summary[tab] } : {})}>
                {tab === 'ALL' ? 'Barchasi' : LEAD_STATUS_LABELS[tab]}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      }
      toolbarActions={
        <>
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            aria-label="Saralash"
            wrapperClassName="w-44 sm:w-56"
          >
            {!SORT_OPTIONS.some((option) => option.value === sort) && <option value={sort}>Ustun bo‘yicha</option>}
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {canExport && (
            <ExportMenu
              loading={exporting}
              onExport={(format) => void runExport('/leads/export', { ...filters, sortBy, sortOrder, ...(status === 'ALL' ? {} : { status }) }, 'leadlar', format)}
            />
          )}
          <ColumnSettings control={leadTable} />
        </>
      }
      {...density}
      mobileLayout="cards"
      {...(listQuery.data
        ? {
            pagination: {
              page: listQuery.data.meta.page,
              totalPages: listQuery.data.meta.totalPages,
              total: listQuery.data.meta.total,
              limit: listQuery.data.meta.limit,
              onPageChange: setPage,
              disabled: listQuery.isFetching,
            },
          }
        : {})}
    />
  );
}
