import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ClipboardCheck, LogOut, Plus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { employeesService } from '@/services/employees.service';
import { orgService } from '@/services/org.service';
import type { EmployeePosition } from '@/types/employee';
import type { Candidate, CandidateStage, ChecklistKind } from '@/types/org';
import { EMPLOYEE_POSITION_LABELS, EMPLOYEE_POSITION_ORDER } from '@/utils/employeeLabels';
import { formatDate, formatDateTime } from '@/utils/format';
import { CANDIDATE_PIPELINE, CANDIDATE_STAGE_LABELS, CANDIDATE_STAGE_TONES, CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_TONES, personName } from '@/utils/orgLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

type View = 'candidates' | 'onboarding' | 'offboarding';

/**
 * HR jarayonlari: ishga qabul qilish (ORG §3.1: suhbat → demo dars → CEO qarori), onboarding (§3.3) va offboarding (§12).
 */
export default function HrProcessPage() {
  const canHire = usePermission(PERMISSIONS.HIRING_MANAGE);
  const canChecklist = usePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const [params, setParams] = useSearchParams();
  const checklistId = params.get('checklist');
  const candidateId = params.get('candidate');
  const view: View = (params.get('tab') as View | null) ?? (canHire ? 'candidates' : 'onboarding');
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="HR jarayonlari" description="Ishga qabul qilish, onboarding va offboarding — har qadam mas’ul bilan" />
      <Tabs value={view} onValueChange={(value) => update({ tab: value })} panels={false}>
        <TabList label="HR bo‘limlari">
          {canHire && (
            <Tab value="candidates" icon={<UserPlus className="size-4" aria-hidden />}>
              Nomzodlar
            </Tab>
          )}
          {canChecklist && (
            <Tab value="onboarding" icon={<ClipboardCheck className="size-4" aria-hidden />}>
              Onboarding
            </Tab>
          )}
          {canChecklist && (
            <Tab value="offboarding" icon={<LogOut className="size-4" aria-hidden />}>
              Offboarding
            </Tab>
          )}
        </TabList>
      </Tabs>
      {view === 'candidates' && canHire && <Candidates onOpen={(id) => update({ candidate: id })} />}
      {view !== 'candidates' && canChecklist && <Checklists kind={view === 'onboarding' ? 'ONBOARDING' : 'OFFBOARDING'} onOpen={(id) => update({ checklist: id })} />}
      <CandidateDrawer id={candidateId} onClose={() => update({ candidate: null })} onChecklist={(id) => update({ candidate: null, tab: 'onboarding', checklist: id })} />
      <ChecklistDrawer id={checklistId} onClose={() => update({ checklist: null })} />
    </div>
  );
}

// ---------------------------------------------------------------- nomzodlar

function Candidates({ onOpen }: { onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const query = useQuery({ queryKey: queryKeys.org.candidates({ showClosed }), queryFn: () => orgService.candidates(showClosed ? {} : { active: 'true' }) });
  const byStage = (stage: CandidateStage) => (query.data?.items ?? []).filter((item) => item.stage === stage);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
          Nomzod qo‘shish
        </Button>
        <label className="flex items-center gap-2 text-body text-fg">
          <Checkbox checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
          Yakunlanganlarni ham ko‘rsatish
        </label>
        {query.data && (
          <span className="text-caption text-fg-subtle sm:ml-auto">
            Ishga olingan: {query.data.counts.HIRED} · rad etilgan: {query.data.counts.REJECTED}
          </span>
        )}
      </div>
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CANDIDATE_PIPELINE.map((stage) => (
            <Card key={stage}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{CANDIDATE_STAGE_LABELS[stage]}</CardTitle>
                <Badge tone="gray">{byStage(stage).length}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {byStage(stage).length === 0 ? <p className="text-caption text-fg-subtle">Bo‘sh</p> : byStage(stage).map((item) => <CandidateCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showClosed && query.data && (
        <Card>
          <CardHeader>
            <CardTitle>Yakunlanganlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {query.data.items
              .filter((item) => !CANDIDATE_PIPELINE.includes(item.stage))
              .map((item) => (
                <CandidateCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />
              ))}
          </CardContent>
        </Card>
      )}
      {creating && <CandidateFormModal onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}

function CandidateCard({ item, onOpen }: { item: Candidate; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-md border border-border p-3 text-left hover:bg-surface-muted">
      <p className="flex items-center justify-between gap-2 font-medium text-fg">
        {personName(item)}
        {item.score !== null && <span className="text-caption text-fg-subtle">{item.score}/10</span>}
      </p>
      <p className="text-caption text-fg-muted">{item.positionLabel}</p>
      {!CANDIDATE_PIPELINE.includes(item.stage) && <Badge tone={CANDIDATE_STAGE_TONES[item.stage]}>{CANDIDATE_STAGE_LABELS[item.stage]}</Badge>}
      {item.stage === 'INTERVIEW' && item.interviewAt && <p className="text-caption text-fg-subtle">Suhbat: {formatDateTime(item.interviewAt)}</p>}
      {item.stage === 'DEMO' && item.demoAt && <p className="text-caption text-fg-subtle">Demo: {formatDateTime(item.demoAt)}</p>}
    </button>
  );
}

function toLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CandidateFormModal({ candidate, onClose, onSaved }: { candidate?: Candidate; onClose: () => void; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: candidate?.firstName ?? '',
    lastName: candidate?.lastName ?? '',
    phone: candidate?.phone ?? '',
    isTeacher: candidate?.isTeacher ?? false,
    position: (candidate?.position ?? '') as EmployeePosition | '',
    positionTitle: candidate?.positionTitle ?? '',
    source: candidate?.source ?? '',
    interviewAt: toLocal(candidate?.interviewAt ?? null),
    demoAt: toLocal(candidate?.demoAt ?? null),
    score: candidate?.score !== null && candidate?.score !== undefined ? String(candidate.score) : '',
    notes: candidate?.notes ?? '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      orgService.saveCandidate(candidate?.id ?? null, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        isTeacher: form.isTeacher,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(!form.isTeacher && form.position ? { position: form.position } : {}),
        ...(form.positionTitle.trim() ? { positionTitle: form.positionTitle.trim() } : {}),
        ...(form.source.trim() ? { source: form.source.trim() } : {}),
        interviewAt: form.interviewAt ? new Date(form.interviewAt).toISOString() : null,
        demoAt: form.demoAt ? new Date(form.demoAt).toISOString() : null,
        score: form.score ? Number(form.score) : null,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onSaved(result.data.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const valid = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && (form.isTeacher || form.position);

  return (
    <Modal
      open
      size="lg"
      title={candidate ? 'Nomzodni tahrirlash' : 'Nomzod qo‘shish'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="candidate-form" disabled={!valid} loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="candidate-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
        <FormField label="Ism" htmlFor="candidate-first" required>
          <Input id="candidate-first" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} autoFocus />
        </FormField>
        <FormField label="Familiya" htmlFor="candidate-last" required>
          <Input id="candidate-last" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} />
        </FormField>
        <FormField label="Telefon" htmlFor="candidate-phone">
          <Input id="candidate-phone" inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
        </FormField>
        <FormField label="Qayerdan keldi" htmlFor="candidate-source">
          <Input id="candidate-source" value={form.source} placeholder="Telegram, tanish orqali…" onChange={(event) => set('source', event.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-body text-fg sm:col-span-2">
          <Checkbox checked={form.isTeacher} onChange={(event) => set('isTeacher', event.target.checked)} />
          O‘qituvchi nomzodi (demo dars bilan)
        </label>
        {!form.isTeacher && (
          <FormField label="Lavozim" htmlFor="candidate-position" required>
            <Select id="candidate-position" value={form.position} onChange={(event) => set('position', event.target.value as EmployeePosition | '')}>
              <option value="">Tanlang</option>
              {EMPLOYEE_POSITION_ORDER.map((key) => (
                <option key={key} value={key}>
                  {EMPLOYEE_POSITION_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Lavozim nomi (ixtiyoriy)" htmlFor="candidate-title">
          <Input id="candidate-title" value={form.positionTitle} placeholder={form.isTeacher ? 'Frontend o‘qituvchi' : ''} onChange={(event) => set('positionTitle', event.target.value)} />
        </FormField>
        <FormField label="Suhbat vaqti" htmlFor="candidate-interview">
          <Input id="candidate-interview" type="datetime-local" value={form.interviewAt} onChange={(event) => set('interviewAt', event.target.value)} />
        </FormField>
        <FormField label="Demo dars vaqti" htmlFor="candidate-demo">
          <Input id="candidate-demo" type="datetime-local" value={form.demoAt} onChange={(event) => set('demoAt', event.target.value)} />
        </FormField>
        <FormField label="Umumiy baho (1–10)" htmlFor="candidate-score">
          <Input id="candidate-score" inputMode="numeric" value={form.score} onChange={(event) => set('score', event.target.value.replace(/\D/g, '').slice(0, 2))} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Suhbat va demo bo‘yicha izohlar" htmlFor="candidate-notes">
            <Textarea id="candidate-notes" rows={3} maxLength={4000} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}

function CandidateDrawer({ id, onClose, onChecklist }: { id: string | null; onClose: () => void; onChecklist: (id: string) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.org.candidate(id ?? ''), queryFn: () => orgService.candidate(id!), enabled: Boolean(id) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, enabled: Boolean(query.data?.can.decide), staleTime: 60_000, retry: false });
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<'hire' | 'REJECTED' | 'WITHDRAWN' | null>(null);
  const [note, setNote] = useState('');
  const [hire, setHire] = useState({ hireDate: new Date().toISOString().slice(0, 10), baseSalary: '', userId: '' });
  const candidate = query.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
  const move = useMutation({
    mutationFn: (stage: CandidateStage) => orgService.moveCandidate(id!, stage, note.trim() || undefined),
    onSuccess: (result) => {
      toast.success(result.message);
      setDecision(null);
      setNote('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const hireMutation = useMutation({
    mutationFn: () =>
      orgService.hireCandidate(id!, {
        hireDate: hire.hireDate,
        ...(hire.baseSalary ? { baseSalary: Number(hire.baseSalary) } : {}),
        ...(hire.userId ? { userId: hire.userId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      onChecklist(result.data.checklistId);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const final = candidate && !CANDIDATE_PIPELINE.includes(candidate.stage);
  const nextStage = candidate ? CANDIDATE_PIPELINE[CANDIDATE_PIPELINE.indexOf(candidate.stage) + 1] : undefined;

  return (
    <Drawer open={Boolean(id)} title={candidate ? personName(candidate) : 'Nomzod'} onClose={onClose} size="lg">
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : candidate ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={CANDIDATE_STAGE_TONES[candidate.stage]}>{CANDIDATE_STAGE_LABELS[candidate.stage]}</Badge>
            <Badge tone="gray">{candidate.positionLabel}</Badge>
            {candidate.score !== null && <Badge tone="blue">Baho: {candidate.score}/10</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-body">
            <Info label="Telefon" value={candidate.phone ?? '—'} />
            <Info label="Manba" value={candidate.source ?? '—'} />
            <Info label="Suhbat" value={candidate.interviewAt ? formatDateTime(candidate.interviewAt) : '—'} />
            <Info label="Demo dars" value={candidate.demoAt ? formatDateTime(candidate.demoAt) : '—'} />
          </dl>
          {candidate.notes && <p className="whitespace-pre-line text-body text-fg-muted">{candidate.notes}</p>}
          {candidate.decisionNote && <p className="text-body text-fg">Qaror izohi: {candidate.decisionNote}</p>}

          {!final && candidate.can.manage && (
            <div className="flex flex-wrap gap-2">
              {nextStage && (
                <Button size="sm" loading={move.isPending} onClick={() => move.mutate(nextStage)}>
                  {CANDIDATE_STAGE_LABELS[nextStage]} bosqichiga o‘tkazish
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Tahrirlash
              </Button>
              {candidate.can.decide && (
                <>
                  <Button size="sm" onClick={() => setDecision('hire')}>
                    Ishga olish
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDecision('REJECTED')}>
                    Rad etish
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDecision('WITHDRAWN')}>
                Voz kechdi
              </Button>
            </div>
          )}
          {!final && !candidate.can.decide && <p className="text-caption text-fg-subtle">Yakuniy qarorni (ishga olish yoki rad etish) markaz rahbari qabul qiladi.</p>}

          {decision && (
            <form
              className="space-y-3 rounded-md border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (decision === 'hire') hireMutation.mutate();
                else move.mutate(decision);
              }}
            >
              {decision === 'hire' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Ishga kirish sanasi" htmlFor="hire-date" required>
                    <Input id="hire-date" type="date" value={hire.hireDate} onChange={(event) => setHire((current) => ({ ...current, hireDate: event.target.value }))} />
                  </FormField>
                  {!candidate.isTeacher && (
                    <FormField label="Oylik maosh (so‘m)" htmlFor="hire-salary">
                      <Input id="hire-salary" inputMode="numeric" value={hire.baseSalary} onChange={(event) => setHire((current) => ({ ...current, baseSalary: event.target.value.replace(/\D/g, '') }))} />
                    </FormField>
                  )}
                  <FormField label="CRM hisobi (bo‘lsa)" htmlFor="hire-user">
                    <Select id="hire-user" value={hire.userId} onChange={(event) => setHire((current) => ({ ...current, userId: event.target.value }))}>
                      <option value="">Keyin bog‘lanadi</option>
                      {(people.data ?? []).map((person) => (
                        <option key={person.id} value={person.id}>
                          {personName(person)} · {person.roleName}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <p className="text-caption text-fg-subtle sm:col-span-2">Sinov muddati lavozim katalogidagi standart bo‘yicha qo‘yiladi; onboarding ro‘yxati avtomatik ochiladi.</p>
                </div>
              )}
              <Textarea aria-label="Izoh" rows={2} maxLength={500} placeholder={decision === 'REJECTED' ? 'Rad etish sababi (majburiy)' : 'Izoh'} value={note} onChange={(event) => setNote(event.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={decision === 'REJECTED' && !note.trim()} loading={move.isPending || hireMutation.isPending}>
                  Tasdiqlash
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecision(null)}>
                  Bekor
                </Button>
              </div>
            </form>
          )}

          <section>
            <h3 className="mb-2 text-label font-medium text-fg">Tarix</h3>
            <ol className="space-y-1 text-body">
              {candidate.events.map((event) => (
                <li key={event.id} className="text-fg-muted">
                  {formatDateTime(event.createdAt)} · {personName(event.actor)}: {event.fromStage ? `${CANDIDATE_STAGE_LABELS[event.fromStage]} → ` : ''}
                  {event.toStage ? CANDIDATE_STAGE_LABELS[event.toStage] : ''}
                  {event.note ? ` — ${event.note}` : ''}
                </li>
              ))}
            </ol>
          </section>
          {editing && <CandidateFormModal candidate={candidate} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
        </div>
      ) : null}
    </Drawer>
  );
}

// ---------------------------------------------------------------- onboarding / offboarding

function Checklists({ kind, onOpen }: { kind: ChecklistKind; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: queryKeys.org.checklists({ kind }), queryFn: () => orgService.checklists({ kind }) });
  return (
    <div className="space-y-4">
      <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
        {kind === 'ONBOARDING' ? 'Onboarding boshlash' : 'Offboarding boshlash'}
      </Button>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={Users} title="Ro‘yxat yo‘q" description={kind === 'ONBOARDING' ? 'Yangi xodim ishga olinganda onboarding shu yerda ochiladi' : 'Xodim ishdan ketayotganda offboarding ro‘yxatini oching'} />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpen(item.id)} className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-surface-muted">
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{item.subjectName}</span>
                    <span className="block text-caption text-fg-muted">
                      {formatDate(item.createdAt)}
                      {item.lastWorkingDay ? ` · oxirgi ish kuni: ${formatDate(item.lastWorkingDay)}` : ''}
                      {item.reason ? ` · ${item.reason}` : ''}
                    </span>
                  </span>
                  <Badge tone={CHECKLIST_STATUS_TONES[item.status]}>{CHECKLIST_STATUS_LABELS[item.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && <ChecklistFormModal kind={kind} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}

function ChecklistFormModal({ kind, onClose, onSaved }: { kind: ChecklistKind; onClose: () => void; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient();
  const employees = useQuery({ queryKey: ['employees', 'list', { page: 1, limit: 100, status: 'ACTIVE' }], queryFn: () => employeesService.list({ page: 1, limit: 100 }) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, staleTime: 60_000, retry: false });
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const [type, value] = subject.split(':');
      return orgService.createChecklist({
        kind,
        ...(type === 'employee' ? { employeeId: value } : { userId: value }),
        ...(kind === 'OFFBOARDING' ? { reason: reason.trim(), lastWorkingDay } : {}),
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onSaved(result.data.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const linkedUsers = new Set((employees.data?.items ?? []).map((item) => item.user?.id).filter(Boolean));
  const valid = subject && (kind === 'ONBOARDING' || (reason.trim().length >= 3 && lastWorkingDay));

  return (
    <Modal
      open
      title={kind === 'ONBOARDING' ? 'Onboarding boshlash' : 'Offboarding boshlash'}
      description={kind === 'OFFBOARDING' ? 'Vazifalar, jihozlar va kirish huquqlari CRM ma’lumotidan tekshiriladi.' : undefined}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Boshlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Xodim" htmlFor="checklist-subject" required>
          <Select id="checklist-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="">Tanlang</option>
            <optgroup label="Xodimlar">
              {(employees.data?.items ?? [])
                .filter((item) => item.status !== 'RESIGNED')
                .map((item) => (
                  <option key={item.id} value={`employee:${item.id}`}>
                    {personName(item)} · {EMPLOYEE_POSITION_LABELS[item.position]}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Kartasi yo‘q hisoblar (o‘qituvchilar)">
              {(people.data ?? [])
                .filter((person) => !linkedUsers.has(person.id))
                .map((person) => (
                  <option key={person.id} value={`user:${person.id}`}>
                    {personName(person)} · {person.roleName}
                  </option>
                ))}
            </optgroup>
          </Select>
        </FormField>
        {kind === 'OFFBOARDING' && (
          <>
            <FormField label="Ishdan ketish sababi" htmlFor="checklist-reason" required>
              <Input id="checklist-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
            </FormField>
            <FormField label="Oxirgi ish kuni" htmlFor="checklist-day" required>
              <Input id="checklist-day" type="date" value={lastWorkingDay} onChange={(event) => setLastWorkingDay(event.target.value)} />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}

function ChecklistDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canManageUsers = usePermission(PERMISSIONS.USER_MANAGE);
  const query = useQuery({ queryKey: queryKeys.org.checklist(id ?? ''), queryFn: () => orgService.checklist(id!), enabled: Boolean(id) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, enabled: Boolean(id), staleTime: 60_000, retry: false });
  const [assigneeId, setAssigneeId] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const checklist = query.data;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
  };
  const onDone = (result: { message: string }) => {
    toast.success(result.message);
    refresh();
  };
  const toggle = useMutation({ mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) => orgService.checklistItem(id!, itemId, done), onSuccess: onDone, onError: (error) => toast.error(getErrorMessage(error)) });
  const action = useMutation({
    mutationFn: ({ kind, body }: { kind: 'handover' | 'revoke-access' | 'complete' | 'cancel'; body?: Record<string, unknown> }) => orgService.checklistAction(id!, kind, body),
    onSuccess: (result) => {
      onDone(result);
      setAssigneeId('');
      setCancelling(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const open = checklist?.status === 'OPEN';
  const work = checklist ? checklist.facts.openWork.tasks + checklist.facts.openWork.followUps + checklist.facts.openWork.complaints : 0;

  return (
    <Drawer open={Boolean(id)} title={checklist ? `${checklist.kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} · ${checklist.subjectName}` : 'Ro‘yxat'} onClose={onClose} size="lg">
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : checklist ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CHECKLIST_STATUS_TONES[checklist.status]}>{CHECKLIST_STATUS_LABELS[checklist.status]}</Badge>
            <span className="text-body text-fg-muted">
              {checklist.progress.done} / {checklist.progress.total} bajarildi
            </span>
            {checklist.lastWorkingDay && <span className="text-caption text-fg-subtle">Oxirgi ish kuni: {formatDate(checklist.lastWorkingDay)}</span>}
          </div>
          <ul className="space-y-2">
            {checklist.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                {item.system ? (
                  item.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Bajarilgan" /> : <Circle className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-label="Bajarilmagan" />
                ) : (
                  <Checkbox checked={item.done} disabled={!open || toggle.isPending} aria-label={item.title} onChange={(event) => toggle.mutate({ itemId: item.id, done: event.target.checked })} />
                )}
                <div className="min-w-0">
                  <p className="text-body text-fg">{item.title}</p>
                  <p className="text-caption text-fg-subtle">
                    Mas’ul: {personName(item.responsible)}
                    {item.system ? ' · CRM ma’lumotidan tekshiriladi' : ''}
                    {item.doneAt && !item.system ? ` · ${formatDateTime(item.doneAt)} (${personName(item.doneBy)})` : ''}
                  </p>
                  {item.key === 'tasks' && !item.done && (
                    <p className="text-caption text-warning">
                      Ochiq: {checklist.facts.openWork.tasks} vazifa, {checklist.facts.openWork.followUps} follow-up, {checklist.facts.openWork.complaints} murojaat
                    </p>
                  )}
                  {item.key === 'assets' && !item.done && <p className="text-caption text-warning">Qaytarilmagan: {checklist.facts.assets.map((asset) => `${asset.inventoryNumber} ${asset.name}`).join(', ')}</p>}
                </div>
              </li>
            ))}
          </ul>

          {open && checklist.kind === 'OFFBOARDING' && (
            <div className="space-y-3 rounded-md bg-surface-muted p-3">
              {work > 0 && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <FormField label="Ishlarni kimga topshirish" htmlFor="handover-to">
                      <Select id="handover-to" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                        <option value="">Xodimni tanlang</option>
                        {(people.data ?? [])
                          .filter((person) => person.id !== checklist.userId)
                          .map((person) => (
                            <option key={person.id} value={person.id}>
                              {personName(person)} · {person.roleName}
                            </option>
                          ))}
                      </Select>
                    </FormField>
                  </div>
                  <Button variant="secondary" disabled={!assigneeId} loading={action.isPending && action.variables?.kind === 'handover'} onClick={() => action.mutate({ kind: 'handover', body: { assigneeId } })}>
                    Topshirish
                  </Button>
                </div>
              )}
              {checklist.facts.account.active && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="danger" size="sm" disabled={!canManageUsers} loading={action.isPending && action.variables?.kind === 'revoke-access'} onClick={() => action.mutate({ kind: 'revoke-access' })}>
                    CRM kirishini bekor qilish
                  </Button>
                  {!canManageUsers && <span className="text-caption text-fg-subtle">Foydalanuvchilarni boshqarish huquqi kerak</span>}
                </div>
              )}
              {checklist.facts.assets.length > 0 && <p className="text-caption text-fg-muted">Jihozlar “Aktivlar” bo‘limida omborga qaytariladi (holati bilan).</p>}
            </div>
          )}

          {open && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={checklist.progress.done !== checklist.progress.total} loading={action.isPending && action.variables?.kind === 'complete'} onClick={() => action.mutate({ kind: 'complete' })}>
                Yakunlash
              </Button>
              {!cancelling ? (
                <Button variant="ghost" onClick={() => setCancelling(true)}>
                  Bekor qilish
                </Button>
              ) : (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    action.mutate({ kind: 'cancel', body: { note: cancelNote.trim() } });
                  }}
                >
                  <Input aria-label="Bekor qilish sababi" placeholder="Sabab" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} autoFocus />
                  <Button type="submit" variant="danger" disabled={cancelNote.trim().length < 3}>
                    Tasdiqlash
                  </Button>
                </form>
              )}
            </div>
          )}
          {checklist.kind === 'OFFBOARDING' && open && <p className="text-caption text-fg-subtle">Yakunlanganda xodim kartasi “ishdan ketgan” bo‘ladi (oxirgi ish kuni bilan, ish tarixiga yoziladi).</p>}
        </div>
      ) : null}
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
