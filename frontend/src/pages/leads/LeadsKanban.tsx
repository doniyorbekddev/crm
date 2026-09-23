import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useNow } from '@/hooks/useNow';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import type { LeadFilters, LeadKanbanColumn, LeadListItem, LeadStatus } from '@/types/lead';
import { formatDateTime, formatPhone } from '@/utils/format';
import { LEAD_PRIORITY_LABELS, LEAD_STATUS_DOTS, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, leadFullName } from '@/utils/leadLabels';
import { LeadTemperatureBadge } from '@/components/leads/LeadStatusBadge';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { LostReasonModal } from './LostReasonModal';

const PRIORITY_DOTS = {
  LOW: 'bg-slate-300 dark:bg-slate-600',
  MEDIUM: 'bg-brand-400',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
} as const;

function LeadCard({ lead, now, overlay = false }: { lead: LeadListItem; now: number; overlay?: boolean }) {
  const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < now;

  return (
    <article
      className={cn(
        'rounded-lg border border-border bg-surface p-3 shadow-xs transition-shadow hover:shadow-sm',
        overlay && 'rotate-2 cursor-grabbing shadow-lg ring-2 ring-brand-500/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/leads/${lead.id}`} className="min-w-0 text-sm font-medium text-fg hover:text-brand-600 hover:underline">
          <span className="block truncate">{leadFullName(lead)}</span>
        </Link>
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRIORITY_DOTS[lead.priority])}
          title={`Muhimlik: ${LEAD_PRIORITY_LABELS[lead.priority]}`}
        />
      </div>
      <p className="mt-0.5 truncate text-xs text-fg-muted">
        {lead.code} · {formatPhone(lead.phone)}
      </p>
      {lead.temperature !== null && lead.temperature !== 'COLD' && (
        <p className="mt-1.5">
          <LeadTemperatureBadge temperature={lead.temperature} score={lead.score} />
        </p>
      )}
      {lead.course && (
        <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-fg-muted">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          {lead.course.name}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {lead.nextFollowUpAt ? (
          <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>
            <Clock className="size-3.5" aria-hidden />
            {formatDateTime(lead.nextFollowUpAt)}
          </span>
        ) : (
          <span className="truncate text-xs text-fg-subtle">{lead.source.name}</span>
        )}
        {lead.assignedTo ? (
          <span title={`${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`}>
            <Avatar firstName={lead.assignedTo.firstName} lastName={lead.assignedTo.lastName} size="xs" />
          </span>
        ) : (
          <span className="text-[11px] whitespace-nowrap text-fg-subtle">Biriktirilmagan</span>
        )}
      </div>
    </article>
  );
}

function DraggableLeadCard({ lead, now, disabled }: { lead: LeadListItem; now: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="Sudraladigan lead kartasi"
      className={cn(!disabled && 'cursor-grab', isDragging && 'opacity-40')}
    >
      <LeadCard lead={lead} now={now} />
    </div>
  );
}

function KanbanColumnView({ column, canDrop, children }: { column: LeadKanbanColumn; canDrop: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status, disabled: !canDrop });
  const hidden = column.total - column.items.length;

  return (
    <section
      aria-label={LEAD_STATUS_LABELS[column.status]}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-muted/60 transition-colors',
        isOver && 'border-brand-400 bg-brand-50/70 dark:bg-brand-950/40',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className={cn('size-2 rounded-full', LEAD_STATUS_DOTS[column.status])} aria-hidden />
          {LEAD_STATUS_LABELS[column.status]}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted tabular-nums">{column.total}</span>
      </header>
      <div ref={setNodeRef} className="flex max-h-[calc(100vh-19rem)] min-h-32 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {column.total === 0 && <p className="py-6 text-center text-xs text-fg-subtle">Lead yo‘q</p>}
        {hidden > 0 && (
          <p className="py-2 text-center text-xs text-fg-muted">va yana {hidden} ta — to‘liq ro‘yxat jadval ko‘rinishida</p>
        )}
      </div>
    </section>
  );
}

function moveLead(columns: LeadKanbanColumn[], lead: LeadListItem, status: LeadStatus): LeadKanbanColumn[] {
  return columns.map((column) => {
    if (column.status === lead.status) {
      return { ...column, total: column.total - 1, items: column.items.filter((item) => item.id !== lead.id) };
    }
    if (column.status === status) {
      return { ...column, total: column.total + 1, items: [{ ...lead, status }, ...column.items] };
    }
    return column;
  });
}

export function LeadsKanban({ filters }: { filters: LeadFilters }) {
  const queryClient = useQueryClient();
  const canUpdate = usePermission(PERMISSIONS.LEAD_UPDATE);
  const now = useNow();
  const kanbanKey = queryKeys.leads.kanban(filters);
  const kanbanQuery = useQuery({ queryKey: kanbanKey, queryFn: () => leadsService.kanban(filters) });

  const [activeLead, setActiveLead] = useState<LeadListItem | null>(null);
  const [pendingLost, setPendingLost] = useState<LeadListItem | null>(null);

  // Sichqoncha — 6px siljigandan keyin; sensorli ekran — bosib turish (sahifani aylantirish buzilmasligi uchun)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const changeStatus = useMutation({
    mutationFn: ({ lead, status, lostReason }: { lead: LeadListItem; status: LeadStatus; lostReason?: string }) =>
      leadsService.setStatus(lead.id, { status, ...(lostReason ? { lostReason } : {}) }),
    onMutate: async ({ lead, status }) => {
      await queryClient.cancelQueries({ queryKey: kanbanKey });
      const previous = queryClient.getQueryData<LeadKanbanColumn[]>(kanbanKey);
      queryClient.setQueryData<LeadKanbanColumn[]>(kanbanKey, (columns) => (columns ? moveLead(columns, lead, status) : columns));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(kanbanKey, context.previous);
      toast.error(getErrorMessage(error));
    },
    onSuccess: (_result, { lead, status }) => {
      toast.success(`${leadFullName(lead)}: ${LEAD_STATUS_LABELS[status]}`);
    },
    onSettled: () => {
      setPendingLost(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
  });

  const findLead = (id: string): LeadListItem | null =>
    kanbanQuery.data?.flatMap((column) => column.items).find((item) => item.id === id) ?? null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveLead(findLead(String(event.active.id)));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const lead = findLead(String(event.active.id));
    const target = LEAD_STATUS_ORDER.find((status) => status === event.over?.id);
    if (!lead || !target || target === lead.status) return;
    if (target === 'LOST') {
      setPendingLost(lead);
      return;
    }
    changeStatus.mutate({ lead, status: target });
  };

  if (kanbanQuery.isPending) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="w-72 shrink-0 space-y-2 rounded-xl border border-border bg-surface-muted/60 p-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (kanbanQuery.isError) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <ErrorState error={kanbanQuery.error} onRetry={() => void kanbanQuery.refetch()} />
      </div>
    );
  }

  return (
    <>
      {!canUpdate && (
        <p className="mb-3 text-xs text-fg-muted">Statusni o‘zgartirish uchun ruxsatingiz yo‘q — kartalar faqat ko‘rish uchun.</p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveLead(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `${findLead(String(active.id))?.firstName ?? 'Lead'} olindi`,
            onDragOver: ({ over }) => (over ? `${LEAD_STATUS_LABELS[over.id as LeadStatus] ?? ''} ustida` : 'Ustundan tashqarida'),
            onDragEnd: ({ over }) => (over ? `${LEAD_STATUS_LABELS[over.id as LeadStatus] ?? ''} ustuniga qo‘yildi` : 'Bekor qilindi'),
            onDragCancel: () => 'Bekor qilindi',
          },
        }}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {kanbanQuery.data.map((column) => (
            <KanbanColumnView key={column.status} column={column} canDrop={canUpdate}>
              {column.items.map((lead) => (
                <DraggableLeadCard key={lead.id} lead={lead} now={now} disabled={!canUpdate || changeStatus.isPending} />
              ))}
            </KanbanColumnView>
          ))}
        </div>
        <DragOverlay>{activeLead ? <LeadCard lead={activeLead} now={now} overlay /> : null}</DragOverlay>
      </DndContext>

      {pendingLost && (
        <LostReasonModal
          leadName={leadFullName(pendingLost)}
          loading={changeStatus.isPending}
          onClose={() => setPendingLost(null)}
          onConfirm={(reason) => changeStatus.mutate({ lead: pendingLost, status: 'LOST', lostReason: reason })}
        />
      )}
    </>
  );
}
