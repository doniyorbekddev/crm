import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { auditService } from '@/services/audit.service';
import type { AuditListParams, AuditLogItem } from '@/types/audit';
import { formatDateTime, formatRelativeTime } from '@/utils/format';

const PAGE_SIZE = 25;

/** Metadata kalitlari uchun o‘zbekcha nomlar (qolgani o‘z nomi bilan ko‘rsatiladi) */
const META_LABELS: Record<string, string> = {
  from: 'Oldin',
  to: 'Keyin',
  reason: 'Sabab',
  receipt: 'Kvitansiya',
  amount: 'Summa',
  method: 'Usul',
  remaining: 'Qolgan qarz',
  number: 'Raqam',
  name: 'Nomi',
  email: 'Email',
  status: 'Holat',
  priority: 'Muhimlik',
  count: 'Soni',
  date: 'Sana',
  group: 'Guruh',
  leadId: 'Lead',
  leadNumber: 'Lead raqami',
  studentId: 'O‘quvchi',
  courseId: 'Kurs',
  contractPrice: 'Shartnoma narxi',
  priceFrom: 'Narx (oldin)',
  priceTo: 'Narx (keyin)',
  familyId: 'Sessiya oilasi',
};

function metaLabel(key: string): string {
  return META_LABELS[key] ?? key;
}

function metaValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ha' : 'yo‘q';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function MetadataView({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') {
    return <p className="text-xs text-fg-muted">Qo‘shimcha ma’lumot yo‘q</p>;
  }
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-fg-muted">Qo‘shimcha ma’lumot yo‘q</p>;
  }

  return (
    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs">
          <dt className="shrink-0 text-fg-muted">{metaLabel(key)}:</dt>
          <dd className="min-w-0 break-all text-fg">{metaValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuditLogPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params: AuditListParams = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(criticalOnly ? { criticalOnly: 'true' as const } : {}),
  };

  const logsQuery = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => auditService.list(params),
    placeholderData: keepPreviousData,
  });
  const filtersQuery = useQuery({
    queryKey: queryKeys.audit.filters,
    queryFn: auditService.filters,
    staleTime: 5 * 60_000,
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const renderRow = (log: AuditLogItem) => {
    const open = expanded === log.id;
    return (
      <li key={log.id} className={cn(log.isCritical && 'bg-red-50/40 dark:bg-red-950/20')}>
        <button
          type="button"
          onClick={() => setExpanded(open ? null : log.id)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
        >
          <span className="mt-0.5 text-fg-subtle">
            {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </span>
          {log.user ? (
            <Avatar firstName={log.user.firstName} lastName={log.user.lastName} size="sm" />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
              <ShieldAlert className="size-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-fg">{log.actionLabel}</span>
              <Badge tone={log.isCritical ? 'red' : 'gray'}>{log.entityLabel}</Badge>
              {log.isCritical && <Badge tone="red">Muhim</Badge>}
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim / noma’lum'}
              {log.ip && ` · ${log.ip}`}
              {log.entityId && ` · ${log.entityId}`}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs text-fg-subtle">
            <span className="block">{formatRelativeTime(log.createdAt)}</span>
            <span className="block">{formatDateTime(log.createdAt)}</span>
          </span>
        </button>

        {open && (
          <div className="space-y-2 border-t border-border bg-surface-muted/60 px-4 py-3 pl-11">
            <MetadataView metadata={log.metadata} />
            <p className="text-[11px] break-all text-fg-subtle">
              {log.user?.email && `${log.user.email} · `}
              {log.action}
              {log.userAgent && ` · ${log.userAgent}`}
            </p>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Audit jurnali"
        description="Kim, nimani va qachon o‘zgartirgani — IP manzili bilan"
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Xodim, IP yoki obyekt ID"
              className="sm:max-w-xs"
            />
            <Select
              value={userId}
              onChange={(event) => changeFilter(() => setUserId(event.target.value))}
              aria-label="Xodim"
              wrapperClassName="sm:w-52"
            >
              <option value="">Barcha xodimlar</option>
              {filtersQuery.data?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} ({user.count})
                </option>
              ))}
            </Select>
            <Select
              value={action}
              onChange={(event) => changeFilter(() => setAction(event.target.value))}
              aria-label="Amal"
              wrapperClassName="sm:w-56"
            >
              <option value="">Barcha amallar</option>
              {filtersQuery.data?.actions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.count})
                </option>
              ))}
            </Select>
            <Select
              value={entityType}
              onChange={(event) => changeFilter(() => setEntityType(event.target.value))}
              aria-label="Obyekt turi"
              wrapperClassName="sm:w-44"
            >
              <option value="">Barcha obyektlar</option>
              {filtersQuery.data?.entityTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.count})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={from}
              onChange={(event) => changeFilter(() => setFrom(event.target.value))}
              aria-label="Boshlanish sanasi"
              className="sm:w-44"
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => changeFilter(() => setTo(event.target.value))}
              aria-label="Tugash sanasi"
              className="sm:w-44"
            />
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={criticalOnly}
                onChange={(event) => changeFilter(() => setCriticalOnly(event.target.checked))}
                className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              Faqat muhim amallar
            </label>
          </div>
        </div>

        {logsQuery.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : logsQuery.isError ? (
          <ErrorState error={logsQuery.error} retrying={logsQuery.isFetching} onRetry={() => void logsQuery.refetch()} />
        ) : logsQuery.data.items.length === 0 ? (
          <EmptyState icon={ScrollText} title="Yozuv topilmadi" description="Filtrlarni o‘zgartirib ko‘ring" />
        ) : (
          <>
            <ul className={cn('divide-y divide-border transition-opacity', logsQuery.isPlaceholderData && 'opacity-60')}>
              {logsQuery.data.items.map(renderRow)}
            </ul>
            <Pagination
              page={logsQuery.data.meta.page}
              totalPages={logsQuery.data.meta.totalPages}
              total={logsQuery.data.meta.total}
              limit={logsQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={logsQuery.isFetching}
            />
          </>
        )}
      </Card>
    </>
  );
}
