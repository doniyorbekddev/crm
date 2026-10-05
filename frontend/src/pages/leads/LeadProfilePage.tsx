import { ProfileHeader } from '@/components/ProfileHeader';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, GraduationCap, Mail, Pencil, Phone, SearchX, Send, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LeadPriorityBadge, LeadStatusBadge, LeadTemperatureBadge } from '@/components/leads/LeadStatusBadge';
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
import { LeadScoreCard } from './LeadScoreCard';
import { LeadTimeline } from './LeadTimeline';
import { LostReasonModal } from './LostReasonModal';

type Dialog = 'edit' | 'assign' | 'lost' | 'delete' | 'convert' | null;
type Tab = 'timeline' | 'calls' | 'followups' | 'notes';

function InfoList({ children }: { children: ReactNode }) {
  return <dl className="space-y-3">{children}</dl>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-body">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-28 rounded-card" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card lg:col-span-2" />
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
          <Link to="/leads" className="text-label text-primary hover:underline">
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
      <ProfileHeader
        back={{ to: '/leads', label: 'Leadlar' }}
        firstName={lead.firstName}
        lastName={lead.lastName}
        title={name}
        badges={
          <>
            <span className="font-mono text-caption text-fg-subtle">{lead.code}</span>
            <LeadStatusBadge status={lead.status} />
            <LeadPriorityBadge priority={lead.priority} />
            {lead.temperature !== null && <LeadTemperatureBadge temperature={lead.temperature} score={lead.score} />}
            {lead.student && <Badge tone="success">O‘quvchi</Badge>}
          </>
        }
        meta={[
          {
            name: 'Telefon',
            icon: Phone,
            label: (
              <a href={`tel:${lead.phone}`} className="focus-ring rounded-sm transition-colors hover:text-primary">
                {formatPhone(lead.phone)}
              </a>
            ),
          },
          ...(lead.telegram
            ? [
                {
                  name: 'Telegram',
                  icon: Send,
                  label: (
                    <a href={`https://t.me/${lead.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="focus-ring rounded-sm transition-colors hover:text-primary">
                      {lead.telegram}
                    </a>
                  ),
                },
              ]
            : []),
        ]}
        actions={
          <>
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
                <Trash2 className="size-4 text-danger" aria-hidden />
              </Button>
            )}
          </>
        }
      />

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
                    <span className={cn(overdue && 'font-medium text-danger')}>
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

          <LeadScoreCard leadId={lead.id} />

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
                <p className="text-body whitespace-pre-wrap text-fg">{lead.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} panels={false}>
            <TabList label="Lead tarixi" className="px-4">
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
                  <Tab key={item.value} value={item.value} count={item.count}>
                    {item.label}
                  </Tab>
                ))}
            </TabList>
          </Tabs>
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

      <p className="mt-6 text-caption text-fg-subtle">Oxirgi o‘zgarish: {formatDate(lead.updatedAt)}</p>

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
