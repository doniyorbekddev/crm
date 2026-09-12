import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AtSign, GraduationCap, Mail, Pencil, Phone, SearchX, Send, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LeadPriorityBadge, LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useNow } from '@/hooks/useNow';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage, getErrorStatus } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import { lookupsService } from '@/services/lookups.service';
import { useAuthStore } from '@/store/auth.store';
import type { LeadDetail, LeadStatus } from '@/types/lead';
import { formatDate, formatDateTime, formatPhone } from '@/utils/format';
import { GENDER_LABELS, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, leadFullName } from '@/utils/leadLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { AssignLeadModal } from './AssignLeadModal';
import { ConvertLeadModal } from './ConvertLeadModal';
import { LeadCalls } from './LeadCalls';
import { LeadFollowUps } from './LeadFollowUps';
import { LeadFormModal } from './LeadFormModal';
import { LeadNotes } from './LeadNotes';
import { LeadTimeline } from './LeadTimeline';
import { LostReasonModal } from './LostReasonModal';

type Dialog = 'edit' | 'assign' | 'lost' | 'delete' | 'convert' | null;
type Tab = 'timeline' | 'calls' | 'followups' | 'notes';

function InfoList({ children }: { children: ReactNode }) {
  return <dl className="space-y-3">{children}</dl>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

export default function LeadProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const now = useNow();
  const canUpdate = usePermission(PERMISSIONS.LEAD_UPDATE);
  const canAssign = usePermission(PERMISSIONS.LEAD_ASSIGN);
  const canDelete = usePermission(PERMISSIONS.LEAD_DELETE);
  const canViewAll = usePermission(PERMISSIONS.LEAD_VIEW_ALL);
  const canCallView = usePermission(PERMISSIONS.CALL_VIEW);
  const canCallCreate = usePermission(PERMISSIONS.CALL_CREATE);
  const canCallUpdate = usePermission(PERMISSIONS.CALL_UPDATE);
  const canCallDelete = usePermission(PERMISSIONS.CALL_DELETE);
  const canFollowUpView = usePermission(PERMISSIONS.FOLLOWUP_VIEW);
  const canFollowUpCreate = usePermission(PERMISSIONS.FOLLOWUP_CREATE);
  const canFollowUpUpdate = usePermission(PERMISSIONS.FOLLOWUP_UPDATE);
  const canFollowUpDelete = usePermission(PERMISSIONS.FOLLOWUP_DELETE);
  const canConvert = usePermission(PERMISSIONS.STUDENT_CONVERT);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<Tab>('timeline');

  const leadQuery = useQuery({ queryKey: queryKeys.leads.detail(id), queryFn: () => leadsService.get(id), enabled: id.length > 0 });
  const lookupsQuery = useQuery({ queryKey: queryKeys.lookups.leadForm, queryFn: lookupsService.leadForm, staleTime: 5 * 60_000 });

  const applyUpdate = (lead: LeadDetail) => {
    queryClient.setQueryData(queryKeys.leads.detail(id), lead);
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    setDialog(null);
  };

  const statusMutation = useMutation({
    mutationFn: ({ status, lostReason }: { status: LeadStatus; lostReason?: string }) =>
      leadsService.setStatus(id, { status, ...(lostReason ? { lostReason } : {}) }),
    onSuccess: (result) => {
      toast.success(result.message);
      applyUpdate(result.data);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToId: string | null) => leadsService.assign(id, assignedToId),
    onSuccess: (result) => {
      toast.success(result.message);
      applyUpdate(result.data);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => leadsService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      navigate('/leads', { replace: true });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  if (leadQuery.isPending) return <ProfileSkeleton />;

  if (leadQuery.isError) {
    return getErrorStatus(leadQuery.error) === 404 ? (
      <EmptyState
        icon={SearchX}
        title="Lead topilmadi"
        description="Lead o‘chirilgan yoki sizga ko‘rinmaydi"
        action={
          <Link to="/leads" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
            Leadlar ro‘yxatiga qaytish
          </Link>
        }
      />
    ) : (
      <ErrorState error={leadQuery.error} onRetry={() => void leadQuery.refetch()} />
    );
  }

  const lead = leadQuery.data;
  const name = leadFullName(lead);
  const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < now;
  const statusLocked = lead.student !== null;

  return (
    <>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Leadlar
      </Link>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar firstName={lead.firstName} lastName={lead.lastName} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
                <span className="font-mono text-xs text-fg-subtle">{lead.code}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <LeadStatusBadge status={lead.status} />
                <LeadPriorityBadge priority={lead.priority} />
                {lead.student && <Badge tone="green">O‘quvchi</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-brand-600">
                  <Phone className="size-4" aria-hidden />
                  {formatPhone(lead.phone)}
                </a>
                {lead.telegram && (
                  <a
                    href={`https://t.me/${lead.telegram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-fg-muted hover:text-brand-600"
                  >
                    <Send className="size-4" aria-hidden />
                    {lead.telegram}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canUpdate && (
              <Select
                aria-label="Statusni o‘zgartirish"
                value={lead.status}
                disabled={statusLocked || statusMutation.isPending}
                onChange={(event) => {
                  const status = event.target.value as LeadStatus;
                  if (status === 'LOST') setDialog('lost');
                  else statusMutation.mutate({ status });
                }}
                wrapperClassName="w-56"
              >
                {LEAD_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
            {canUpdate && (
              <Button variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} disabled={!lookupsQuery.data} onClick={() => setDialog('edit')}>
                Tahrirlash
              </Button>
            )}
            {canAssign && (
              <Button variant="secondary" leftIcon={<UserCheck className="size-4" aria-hidden />} disabled={!lookupsQuery.data} onClick={() => setDialog('assign')}>
                Mas’ul
              </Button>
            )}
            {canConvert && !lead.student && (
              <Button leftIcon={<GraduationCap className="size-4" aria-hidden />} onClick={() => setDialog('convert')}>
                O‘quvchiga aylantirish
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon" aria-label="Leadni o‘chirish" onClick={() => setDialog('delete')}>
                <Trash2 className="size-4 text-red-600" aria-hidden />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sotuv ma’lumotlari</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoList>
                <InfoRow label="Mas’ul xodim">
                  {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : <span className="text-fg-subtle">Biriktirilmagan</span>}
                </InfoRow>
                <InfoRow label="Qiziqqan kurs">{lead.course?.name ?? '—'}</InfoRow>
                <InfoRow label="Manba">{lead.source.name}</InfoRow>
                <InfoRow label="Keyingi aloqa">
                  {lead.nextFollowUpAt ? (
                    <span className={cn(overdue && 'font-medium text-red-600 dark:text-red-400')}>
                      {formatDateTime(lead.nextFollowUpAt)}
                      {overdue && ' — kechikkan'}
                    </span>
                  ) : (
                    '—'
                  )}
                </InfoRow>
                <InfoRow label="Oxirgi aloqa">{formatDateTime(lead.lastContactedAt)}</InfoRow>
                {lead.status === 'LOST' && <InfoRow label="Yo‘qotilish sababi">{lead.lostReason ?? '—'}</InfoRow>}
                <InfoRow label="Qo‘shgan">{lead.createdBy ? `${lead.createdBy.firstName} ${lead.createdBy.lastName}` : '—'}</InfoRow>
                <InfoRow label="Qo‘shilgan sana">{formatDateTime(lead.createdAt)}</InfoRow>
              </InfoList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shaxsiy va aloqa</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoList>
                <InfoRow label="Yosh">{lead.age ?? '—'}</InfoRow>
                <InfoRow label="Jins">{lead.gender ? GENDER_LABELS[lead.gender] : '—'}</InfoRow>
                <InfoRow label="Manzil">{lead.address ?? '—'}</InfoRow>
                <InfoRow label="Telefon">{formatPhone(lead.phone)}</InfoRow>
                <InfoRow label="Telegram">
                  {lead.telegram ? (
                    <span className="inline-flex items-center gap-1">
                      <AtSign className="size-3.5 text-fg-subtle" aria-hidden />
                      {lead.telegram.replace(/^@/, '')}
                    </span>
                  ) : (
                    '—'
                  )}
                </InfoRow>
                <InfoRow label="Email">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                      <Mail className="size-3.5 text-fg-subtle" aria-hidden />
                      {lead.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </InfoRow>
              </InfoList>
            </CardContent>
          </Card>

          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Umumiy izoh</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-fg">{lead.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <div role="tablist" aria-label="Lead tarixi" className="flex gap-1 border-b border-border px-3 pt-3">
            {(
              [
                { value: 'timeline', label: 'Timeline', count: lead.counts.activities, visible: true },
                { value: 'calls', label: 'Qo‘ng‘iroqlar', count: lead.counts.calls, visible: canCallView },
                { value: 'followups', label: 'Follow-up', count: lead.counts.followUps, visible: canFollowUpView },
                { value: 'notes', label: 'Izohlar', count: lead.counts.notes, visible: true },
              ] as const
            )
              .filter((item) => item.visible)
              .map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                onClick={() => setTab(item.value)}
                className={cn(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition-colors',
                  tab === item.value ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
                <span className="rounded-full bg-surface-muted px-1.5 text-xs tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>
          {tab === 'timeline' && <LeadTimeline leadId={lead.id} />}
          {tab === 'calls' && (
            <LeadCalls leadId={lead.id} canCreate={canCallCreate} canUpdate={canCallUpdate} canDelete={canCallDelete} />
          )}
          {tab === 'followups' && (
            <LeadFollowUps leadId={lead.id} canCreate={canFollowUpCreate} canUpdate={canFollowUpUpdate} canDelete={canFollowUpDelete} />
          )}
          {tab === 'notes' && (
            <LeadNotes leadId={lead.id} canAdd={canUpdate} canDeleteAny={canDelete} currentUserId={currentUser?.id ?? ''} />
          )}
        </Card>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">Oxirgi o‘zgarish: {formatDate(lead.updatedAt)}</p>

      {dialog === 'edit' && lookupsQuery.data && (
        <LeadFormModal mode="edit" lead={lead} lookups={lookupsQuery.data} onClose={() => setDialog(null)} onSaved={applyUpdate} />
      )}
      {dialog === 'assign' && lookupsQuery.data && currentUser && (
        <AssignLeadModal
          lead={lead}
          managers={lookupsQuery.data.managers}
          canViewAll={canViewAll}
          currentUserId={currentUser.id}
          loading={assignMutation.isPending}
          onClose={() => setDialog(null)}
          onAssign={(assignedToId) => assignMutation.mutate(assignedToId)}
        />
      )}
      {dialog === 'convert' && (
        <ConvertLeadModal
          lead={lead}
          onClose={() => setDialog(null)}
          onConverted={() => {
            setDialog(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
            navigate('/students');
          }}
        />
      )}
      {dialog === 'lost' && (
        <LostReasonModal
          leadName={name}
          loading={statusMutation.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => statusMutation.mutate({ status: 'LOST', lostReason: reason })}
        />
      )}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Lead o‘chirilsinmi?"
        description={`${name} (${lead.code}) ro‘yxatdan o‘chiriladi. Uning tarixi hisobotlarda saqlanib qoladi.`}
        confirmLabel="O‘chirish"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
