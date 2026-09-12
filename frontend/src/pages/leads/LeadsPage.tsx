import { useQuery } from '@tanstack/react-query';
import { Columns3, List, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { lookupsService } from '@/services/lookups.service';
import { useUiStore } from '@/store/ui.store';
import type { LeadsView } from '@/store/ui.store';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { EMPTY_LEAD_FILTERS, LeadFiltersBar, toLeadFilters } from './LeadFiltersBar';
import type { LeadFilterState } from './LeadFiltersBar';
import { LeadFormModal } from './LeadFormModal';
import { LeadsKanban } from './LeadsKanban';
import { LeadsTable } from './LeadsTable';

const VIEW_OPTIONS: ReadonlyArray<{ value: LeadsView; label: string; icon: typeof List }> = [
  { value: 'table', label: 'Jadval', icon: List },
  { value: 'kanban', label: 'Kanban', icon: Columns3 },
];

export default function LeadsPage() {
  const navigate = useNavigate();
  const view = useUiStore((state) => state.leadsView);
  const setView = useUiStore((state) => state.setLeadsView);
  const canCreate = usePermission(PERMISSIONS.LEAD_CREATE);
  const canViewAll = usePermission(PERMISSIONS.LEAD_VIEW_ALL);

  const [filterState, setFilterState] = useState<LeadFilterState>(EMPTY_LEAD_FILTERS);
  const search = useDebounce(filterState.search.trim(), 400);
  const filters = useMemo(() => toLeadFilters(filterState, search), [filterState, search]);
  const [createOpen, setCreateOpen] = useState(false);

  const lookupsQuery = useQuery({ queryKey: queryKeys.lookups.leadForm, queryFn: lookupsService.leadForm, staleTime: 5 * 60_000 });

  return (
    <>
      <PageHeader
        title="Leadlar"
        description={canViewAll ? 'Barcha potensial mijozlar va sotuv jarayoni' : 'Sizga biriktirilgan va biriktirilmagan leadlar'}
        actions={
          <>
            <div role="group" aria-label="Ko‘rinish" className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5">
              {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg',
                    view === value && 'bg-surface text-fg shadow-sm',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {canCreate && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} disabled={!lookupsQuery.data} onClick={() => setCreateOpen(true)}>
                Lead qo‘shish
              </Button>
            )}
          </>
        }
      />

      <LeadFiltersBar value={filterState} onChange={setFilterState} lookups={lookupsQuery.data} canViewAll={canViewAll} />

      {view === 'table' ? <LeadsTable key={JSON.stringify(filters)} filters={filters} /> : <LeadsKanban filters={filters} />}

      {createOpen && lookupsQuery.data && (
        <LeadFormModal
          mode="create"
          lookups={lookupsQuery.data}
          onClose={() => setCreateOpen(false)}
          onSaved={(lead) => {
            setCreateOpen(false);
            navigate(`/leads/${lead.id}`);
          }}
        />
      )}
    </>
  );
}
