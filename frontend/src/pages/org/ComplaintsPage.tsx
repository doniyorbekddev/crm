import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Inbox, MessageSquareWarning, Plus, ShieldAlert, Siren } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Combobox } from '@/components/ui/Combobox';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import { studentsService } from '@/services/students.service';
import type { Complaint, ComplaintCategory, ComplaintDetail, ComplaintSeverity, ComplaintSource, ComplaintStatus } from '@/types/org';
import { formatDateTime } from '@/utils/format';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_TONES,
  COMPLAINT_SOURCE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_TONES,
  personName,
} from '@/utils/orgLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const CATEGORIES = Object.keys(COMPLAINT_CATEGORY_LABELS) as ComplaintCategory[];
const SEVERITIES = Object.keys(COMPLAINT_SEVERITY_LABELS) as ComplaintSeverity[];

/**
 * Murojaat va shikoyatlar (ORG §7): Yangi → Ko‘rib chiqilmoqda → Hal etildi → Yopildi.
 * Har bir xodim o‘zi kiritgan va o‘ziga biriktirilganini ko‘radi; rahbar — filialdagi hammasini (maxfiylaridan tashqari).
 */
export default function ComplaintsPage() {
  const canCreate = usePermission(PERMISSIONS.COMPLAINT_CREATE);
  const canView = usePermission(PERMISSIONS.COMPLAINT_VIEW);
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const [status, setStatus] = useState<ComplaintStatus | 'open' | ''>('open');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<'complaint' | 'appeal' | null>(null);

  const query = useQuery({
    queryKey: queryKeys.org.complaints({
      status,
      category,
      scope,
      overdue,
      search,
    }),
    queryFn: () =>
      orgService.complaints({
        ...(status && status !== 'open' ? { status } : {}),
        ...(category ? { category } : {}),
        ...(overdue ? { overdue: 'true' } : {}),
        ...(search ? { search } : {}),
        scope,
        limit: 100,
      }),
    placeholderData: keepPreviousData,
  });
  const counts = query.data?.counts;
  // "Ochiqlar" — server holat bo'yicha filtrlaydi; ochiqlar (Yangi + Ko'rib chiqilmoqda) shu yerda ajratiladi
  const items = (query.data?.items ?? []).filter((item) => status !== 'open' || item.status === 'NEW' || item.status === 'UNDER_REVIEW');
  const open = (id: string | null) => setParams(id ? { id } : {}, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Murojaatlar"
        description="O‘quvchi, ota-ona va xodimlarning shikoyat va murojaatlari"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating('appeal')}>
              Mening murojaatim
            </Button>
            {canCreate && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating('complaint')}>
                Murojaat kiritish
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard size="sm" title="Yangi" value={counts?.NEW ?? 0} icon={Inbox} tone="primary" loading={query.isPending} />
        <StatCard size="sm" title="Ko‘rib chiqilmoqda" value={counts?.UNDER_REVIEW ?? 0} icon={MessageSquareWarning} tone="warning" loading={query.isPending} />
        <StatCard size="sm" title="Muddati o‘tgan" value={counts?.overdue ?? 0} icon={AlarmClock} tone={counts?.overdue ? 'danger' : 'neutral'} loading={query.isPending} />
        <StatCard size="sm" title="Rahbarga ko‘tarilgan" value={counts?.escalated ?? 0} icon={Siren} tone={counts?.escalated ? 'danger' : 'neutral'} loading={query.isPending} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Holat" value={status} onChange={(event) => setStatus(event.target.value as ComplaintStatus | 'open' | '')} wrapperClassName="w-48">
          <option value="open">Ochiqlar</option>
          {(Object.keys(COMPLAINT_STATUS_LABELS) as ComplaintStatus[]).map((key) => (
            <option key={key} value={key}>
              {COMPLAINT_STATUS_LABELS[key]}
            </option>
          ))}
          <option value="">Hammasi</option>
        </Select>
        <Select aria-label="Turkum" value={category} onChange={(event) => setCategory(event.target.value as ComplaintCategory | '')} wrapperClassName="w-52">
          <option value="">Barcha turkumlar</option>
          {CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {COMPLAINT_CATEGORY_LABELS[key]}
            </option>
          ))}
        </Select>
        {canView && (
          <Select aria-label="Kimniki" value={scope} onChange={(event) => setScope(event.target.value as 'all' | 'mine')} wrapperClassName="w-48">
            <option value="all">Barcha murojaatlar</option>
            <option value="mine">Men kiritgan / menga biriktirilgan</option>
          </Select>
        )}
        <label className="flex items-center gap-2 text-body text-fg">
          <Checkbox checked={overdue} onChange={(event) => setOverdue(event.target.checked)} />
          Faqat muddati o‘tganlar
        </label>
        <SearchInput label="Murojaat qidirish" placeholder="Raqam, mavzu yoki ism" value={search} onChange={setSearch} className="w-full sm:ml-auto sm:w-64" />
      </div>

      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-32" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={MessageSquareWarning} title="Murojaat yo‘q" description="Kiritilgan murojaatlar va shikoyatlar shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <ComplaintRow key={item.id} item={item} onOpen={() => open(item.id)} />
            ))}
          </ul>
        )}
      </Card>

      <ComplaintDrawer id={openId} onClose={() => open(null)} />
      {creating && (
        <ComplaintFormModal
          mode={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            open(id);
          }}
        />
      )}
    </div>
  );
}

function ComplaintRow({ item, onOpen }: { item: Complaint; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 p-4 text-left hover:bg-surface-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
            <span className="text-fg-subtle">#{item.number}</span>
            {item.title}
            <Badge tone={COMPLAINT_STATUS_TONES[item.status]}>{COMPLAINT_STATUS_LABELS[item.status]}</Badge>
            {item.severity !== 'NORMAL' && <Badge tone={COMPLAINT_SEVERITY_TONES[item.severity]}>{COMPLAINT_SEVERITY_LABELS[item.severity]}</Badge>}
            {item.overdue && <Badge tone="red">Muddati o‘tgan</Badge>}
            {item.escalatedAt && <Badge tone="red">CEOda</Badge>}
            {item.confidential && <Badge tone="gray">Maxfiy</Badge>}
          </p>
          <p className="text-caption text-fg-muted">
            {COMPLAINT_SOURCE_LABELS[item.source]} · {COMPLAINT_CATEGORY_LABELS[item.category]}
            {item.student ? ` · ${personName(item.student)}` : item.contactName ? ` · ${item.contactName}` : ''}
            {` · mas’ul: ${item.assignee ? personName(item.assignee) : 'biriktirilmagan'}`}
          </p>
        </div>
        <span className="shrink-0 text-caption text-fg-subtle">{formatDateTime(item.createdAt)}</span>
      </button>
    </li>
  );
}

function ComplaintFormModal({ mode, onClose, onCreated }: { mode: 'complaint' | 'appeal'; onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const appeal = mode === 'appeal';
  const [source, setSource] = useState<ComplaintSource>('PARENT');
  const [category, setCategory] = useState<ComplaintCategory>(appeal ? 'STAFF_CONFLICT' : 'SERVICE');
  const [severity, setSeverity] = useState<ComplaintSeverity>('NORMAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [subjectUserId, setSubjectUserId] = useState('');
  const [confidential, setConfidential] = useState(appeal);
  const students = useQuery({
    queryKey: ['students', 'lookup', studentSearch],
    queryFn: () => studentsService.list({ page: 1, limit: 20, search: studentSearch }),
    enabled: !appeal && studentSearch.trim().length >= 2,
  });
  const people = useQuery({
    queryKey: queryKeys.org.people,
    queryFn: orgService.people,
    enabled: appeal,
    staleTime: 60_000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () =>
      appeal
        ? orgService.createAppeal({
            category,
            severity,
            title: title.trim(),
            description: description.trim(),
            ...(subjectUserId ? { subjectUserId } : {}),
            confidential,
          })
        : orgService.createComplaint({
            source,
            category,
            severity,
            title: title.trim(),
            description: description.trim(),
            ...(studentId ? { studentId } : {}),
            ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
            ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
            confidential,
          }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onCreated(result.data.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const valid = title.trim().length >= 3 && description.trim().length >= 5;

  return (
    <Modal
      open
      size="lg"
      title={appeal ? 'Mening murojaatim' : 'Murojaat kiritish'}
      description={appeal ? 'Rasmiy murojaat: faqat siz va rahbariyat ko‘radi. Nizo va xavfsizlik — har doim maxfiy.' : 'Murojaat mas’ulga yo‘naltiriladi; jiddiy holat darhol rahbarga yetkaziladi.'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="complaint-form" disabled={!valid} loading={save.isPending}>
            Yuborish
          </Button>
        </>
      }
    >
      <form id="complaint-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          {!appeal && (
            <FormField label="Kimdan" htmlFor="complaint-source">
              <Select id="complaint-source" value={source} onChange={(event) => setSource(event.target.value as ComplaintSource)}>
                {(Object.keys(COMPLAINT_SOURCE_LABELS) as ComplaintSource[]).map((key) => (
                  <option key={key} value={key}>
                    {COMPLAINT_SOURCE_LABELS[key]}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Turkum" htmlFor="complaint-category">
            <Select id="complaint-category" value={category} onChange={(event) => setCategory(event.target.value as ComplaintCategory)}>
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {COMPLAINT_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Jiddiylik" htmlFor="complaint-severity" hint={category === 'SAFETY' ? 'Xavfsizlik — har doim jiddiy' : undefined}>
            <Select
              id="complaint-severity"
              value={category === 'SAFETY' ? 'CRITICAL' : severity}
              disabled={category === 'SAFETY'}
              onChange={(event) => setSeverity(event.target.value as ComplaintSeverity)}
            >
              {SEVERITIES.map((key) => (
                <option key={key} value={key}>
                  {COMPLAINT_SEVERITY_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Mavzu" htmlFor="complaint-title" required>
          <Input id="complaint-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </FormField>
        <FormField label="Murojaat matni" htmlFor="complaint-description" required>
          <Textarea id="complaint-description" rows={4} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        {appeal ? (
          <FormField label="Kim haqida (ixtiyoriy)" htmlFor="complaint-subject" hint="U murojaatni ko‘rmaydi">
            <Select id="complaint-subject" value={subjectUserId} onChange={(event) => setSubjectUserId(event.target.value)}>
              <option value="">Tanlanmagan</option>
              {(people.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {personName(person)} · {person.roleName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="O‘quvchi" htmlFor="complaint-student">
              <Combobox
                id="complaint-student"
                placeholder="Ism yoki telefon"
                options={(students.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.firstName} ${item.lastName}`,
                  description: item.phone ?? undefined,
                }))}
                value={studentId}
                onChange={setStudentId}
                onSearchChange={setStudentSearch}
                loading={students.isFetching}
              />
            </FormField>
            <FormField label="Murojaatchi ismi" htmlFor="complaint-contact">
              <Input id="complaint-contact" value={contactName} maxLength={150} onChange={(event) => setContactName(event.target.value)} />
            </FormField>
            <FormField label="Telefon" htmlFor="complaint-phone">
              <Input id="complaint-phone" value={contactPhone} inputMode="tel" onChange={(event) => setContactPhone(event.target.value)} />
            </FormField>
          </div>
        )}
        {!(category === 'STAFF_CONFLICT' || category === 'SAFETY') && (
          <label className="flex items-center gap-2 text-body text-fg">
            <Checkbox checked={confidential} onChange={(event) => setConfidential(event.target.checked)} />
            Maxfiy (faqat mas’ul va markaz rahbari ko‘radi)
          </label>
        )}
      </form>
    </Modal>
  );
}

function ComplaintDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.org.complaint(id ?? ''),
    queryFn: () => orgService.complaint(id!),
    enabled: Boolean(id),
  });
  const complaint = query.data;
  const assignees = useQuery({
    queryKey: ['org', 'complaint-assignees'],
    queryFn: orgService.complaintAssignees,
    enabled: Boolean(complaint?.can.manage),
    staleTime: 60_000,
  });
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [action, setAction] = useState<'RESOLVED' | 'CLOSED' | 'UNDER_REVIEW' | 'escalate' | 'comment' | null>(null);

  const run = useMutation({
    mutationFn: async (kind: 'assign' | 'RESOLVED' | 'CLOSED' | 'UNDER_REVIEW' | 'escalate' | 'comment') => {
      const text = note.trim() || undefined;
      if (kind === 'assign') return orgService.assignComplaint(id!, assigneeId, text);
      if (kind === 'escalate') return orgService.escalateComplaint(id!, text ?? '');
      if (kind === 'comment') return orgService.commentComplaint(id!, text ?? '');
      return orgService.complaintStatus(id!, kind, text);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setNote('');
      setAction(null);
      setAssigneeId('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openStatus = complaint && (complaint.status === 'NEW' || complaint.status === 'UNDER_REVIEW');
  const needsNote =
    action === 'RESOLVED' || action === 'escalate' || action === 'comment' || (action === 'CLOSED' && complaint?.status !== 'RESOLVED') || (action === 'UNDER_REVIEW' && complaint?.status !== 'NEW');
  const ACTION_TITLES = {
    RESOLVED: 'Qanday hal etildi?',
    CLOSED: 'Yopish sababi',
    UNDER_REVIEW: 'Qayta ochish sababi',
    escalate: 'Nega rahbarga ko‘tarilmoqda?',
    comment: 'Izoh',
  } as const;

  return (
    <Drawer open={Boolean(id)} title={complaint ? `#${complaint.number} · ${complaint.title}` : 'Murojaat'} onClose={onClose} size="lg">
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : complaint ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={COMPLAINT_STATUS_TONES[complaint.status]}>{COMPLAINT_STATUS_LABELS[complaint.status]}</Badge>
            <Badge tone={COMPLAINT_SEVERITY_TONES[complaint.severity]}>{COMPLAINT_SEVERITY_LABELS[complaint.severity]}</Badge>
            <Badge tone="gray">{COMPLAINT_CATEGORY_LABELS[complaint.category]}</Badge>
            {complaint.overdue && <Badge tone="red">Muddati o‘tgan</Badge>}
            {complaint.escalatedAt && (
              <Badge tone="red">
                <ShieldAlert className="mr-1 inline size-3.5" aria-hidden />
                Rahbarga ko‘tarilgan
              </Badge>
            )}
            {complaint.confidential && <Badge tone="gray">Maxfiy</Badge>}
          </div>
          <p className="whitespace-pre-line text-body text-fg">{complaint.description}</p>
          <dl className="grid grid-cols-2 gap-3 text-body">
            <Info
              label="Kimdan"
              value={`${COMPLAINT_SOURCE_LABELS[complaint.source]}${complaint.contactName ? ` · ${complaint.contactName}` : ''}${complaint.contactPhone ? ` · ${complaint.contactPhone}` : ''}`}
            />
            <Info
              label="O‘quvchi"
              value={
                complaint.student ? (
                  <Link to={`/students/${complaint.student.id}`} className="text-primary hover:underline">
                    {personName(complaint.student)}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Info label="Kiritdi" value={personName(complaint.reporter)} />
            <Info label="Mas’ul" value={complaint.assignee ? personName(complaint.assignee) : 'Biriktirilmagan'} />
            <Info label="Kim haqida" value={complaint.subjectUser ? personName(complaint.subjectUser) : '—'} />
            <Info label="Javob muddati" value={complaint.dueAt ? formatDateTime(complaint.dueAt) : '—'} />
          </dl>
          {complaint.resolution && (
            <div className="rounded-md border border-border p-3">
              <p className="text-caption text-fg-subtle">Yechim</p>
              <p className="mt-1 whitespace-pre-line text-body text-fg">{complaint.resolution}</p>
            </div>
          )}

          {complaint.can.manage && openStatus && (
            <section aria-label="Yo‘naltirish" className="flex items-end gap-2">
              <div className="flex-1">
                <FormField label="Mas’ulga yo‘naltirish" htmlFor="complaint-assignee">
                  <Select id="complaint-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                    <option value="">Xodimni tanlang…</option>
                    {(assignees.data ?? [])
                      .filter((person) => person.id !== complaint.assignee?.id && person.id !== complaint.subjectUser?.id)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {personName(person)} · {person.roleName}
                        </option>
                      ))}
                  </Select>
                </FormField>
              </div>
              <Button variant="secondary" disabled={!assigneeId} loading={run.isPending && run.variables === 'assign'} onClick={() => run.mutate('assign')}>
                Yo‘naltirish
              </Button>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {complaint.can.work && complaint.status === 'NEW' && (
              <Button size="sm" variant="secondary" loading={run.isPending && run.variables === 'UNDER_REVIEW'} onClick={() => run.mutate('UNDER_REVIEW')}>
                Ko‘rib chiqishni boshlash
              </Button>
            )}
            {complaint.can.work && openStatus && (
              <Button size="sm" onClick={() => setAction('RESOLVED')}>
                Hal etildi
              </Button>
            )}
            {complaint.can.close && complaint.status !== 'CLOSED' && (
              <Button size="sm" variant="secondary" onClick={() => (complaint.status === 'RESOLVED' ? run.mutate('CLOSED') : setAction('CLOSED'))}>
                Murojaatni yopish
              </Button>
            )}
            {complaint.can.manage && (complaint.status === 'RESOLVED' || complaint.status === 'CLOSED') && (
              <Button size="sm" variant="ghost" onClick={() => setAction('UNDER_REVIEW')}>
                Qayta ochish
              </Button>
            )}
            {complaint.can.escalate && (
              <Button size="sm" variant="danger" onClick={() => setAction('escalate')}>
                Rahbarga ko‘tarish
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setAction('comment')}>
              Izoh
            </Button>
          </div>
          {action && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                run.mutate(action);
              }}
            >
              <Textarea aria-label={ACTION_TITLES[action]} placeholder={ACTION_TITLES[action]} rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={needsNote && !note.trim()} loading={run.isPending}>
                  Saqlash
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
                  Bekor
                </Button>
              </div>
            </form>
          )}

          <section>
            <h3 className="mb-2 text-label font-medium text-fg">Tarix</h3>
            <ol className="space-y-2">
              {complaint.events.map((event) => (
                <li key={event.id} className="rounded-md bg-surface-muted p-3 text-body">
                  <p className="text-caption text-fg-subtle">
                    {formatDateTime(event.createdAt)} · {personName(event.actor)}
                  </p>
                  <p className="text-fg">
                    {eventText(event)}
                    {event.note ? ` — ${event.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}

function eventText(event: ComplaintDetail['events'][number]): string {
  switch (event.type) {
    case 'CREATED':
      return 'Murojaat kiritildi';
    case 'ASSIGNED':
      return 'Mas’ulga yo‘naltirildi';
    case 'ESCALATED':
      return 'Markaz rahbariga ko‘tarildi';
    case 'COMMENT':
      return 'Izoh';
    case 'STATUS_CHANGED':
      return `${event.fromStatus ? COMPLAINT_STATUS_LABELS[event.fromStatus] : ''} → ${event.toStatus ? COMPLAINT_STATUS_LABELS[event.toStatus] : ''}`;
  }
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
