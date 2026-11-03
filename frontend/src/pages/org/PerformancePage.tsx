import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, BarChart3, Plus, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
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
import { orgService } from '@/services/org.service';
import type { AwardType, CareerStatus, PerformanceRating, PerformanceReview, ReviewCriterion, ReviewStatus } from '@/types/org';
import { formatDate, formatMoney } from '@/utils/format';
import { personName } from '@/utils/orgLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

export const CRITERIA_LABELS: Record<ReviewCriterion, string> = { quality: 'Ish sifati', discipline: 'Intizom va punktuallik', teamwork: 'Jamoaviylik', initiative: 'Tashabbus', results: 'Natija' };
const CRITERIA = Object.keys(CRITERIA_LABELS) as ReviewCriterion[];
export const RATING_LABELS: Record<PerformanceRating, string> = { BELOW: 'Talabdan past', MEETS: 'Talabga mos', EXCEEDS: 'Talabdan yuqori' };
export const RATING_TONES: Record<PerformanceRating, BadgeTone> = { BELOW: 'red', MEETS: 'blue', EXCEEDS: 'green' };
const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { DRAFT: 'Qoralama', SUBMITTED: 'Tasdiq kutmoqda', APPROVED: 'Tasdiqlangan' };
export const AWARD_LABELS: Record<AwardType, string> = { EMPLOYEE_OF_MONTH: 'Oy xodimi', EMPLOYEE_OF_QUARTER: 'Chorak xodimi', SPECIAL: 'Natijaviy mukofot', TRAINING: 'Malaka oshirish' };

type View = 'reviews' | 'awards' | 'career';

function currentQuarter(): { year: number; quarter: number } {
  // Baholash odatda o'tgan chorak bo'yicha
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  return quarter === 0 ? { year: now.getFullYear() - 1, quarter: 4 } : { year: now.getFullYear(), quarter };
}

/**
 * Natija va rivojlanish (ORG §5, §6.2, §13): choraklik baholash (attestatsiya), taqdirlash va karyera yo‘li.
 * Yakuniy tasdiq — markaz rahbari.
 */
export default function PerformancePage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('tab') as View | null) ?? 'reviews';
  return (
    <div className="space-y-6">
      <PageHeader title="Baholash va rivojlanish" description="Choraklik attestatsiya, taqdirlash va lavozimga ko‘tarilish" />
      <Tabs value={view} onValueChange={(value) => setParams({ tab: value }, { replace: true })} panels={false}>
        <TabList label="Bo‘limlar">
          <Tab value="reviews" icon={<BarChart3 className="size-4" aria-hidden />}>
            Baholash
          </Tab>
          <Tab value="awards" icon={<Award className="size-4" aria-hidden />}>
            Taqdirlash
          </Tab>
          <Tab value="career" icon={<TrendingUp className="size-4" aria-hidden />}>
            Karyera
          </Tab>
        </TabList>
      </Tabs>
      {view === 'reviews' && <Reviews />}
      {view === 'awards' && <Awards />}
      {view === 'career' && <Career />}
    </div>
  );
}

function Reviews() {
  const canManage = usePermission(PERMISSIONS.PERFORMANCE_MANAGE);
  const canApprove = usePermission(PERMISSIONS.PERFORMANCE_APPROVE);
  const queryClient = useQueryClient();
  const initial = currentQuarter();
  const [year, setYear] = useState(initial.year);
  const [quarter, setQuarter] = useState(initial.quarter);
  const [editing, setEditing] = useState<{ userId: string; review: PerformanceReview | null } | null>(null);
  const query = useQuery({ queryKey: ['org', 'reviews', year, quarter], queryFn: () => orgService.reviews({ year, quarter }) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, enabled: canManage, staleTime: 60_000, retry: false });
  const approve = useMutation({
    mutationFn: (id: string) => orgService.approveReview(id),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ['org', 'reviews'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const reviewed = new Set((query.data ?? []).map((item) => item.user.id));
  const [newUser, setNewUser] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Yil" htmlFor="review-year">
          <Input id="review-year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || initial.year)} className="w-28" />
        </FormField>
        <FormField label="Chorak" htmlFor="review-quarter">
          <Select id="review-quarter" value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value}-chorak
              </option>
            ))}
          </Select>
        </FormField>
        {canManage && (
          <div className="flex items-end gap-2 sm:ml-auto">
            <FormField label="Xodimni baholash" htmlFor="review-new">
              <Select id="review-new" value={newUser} onChange={(event) => setNewUser(event.target.value)}>
                <option value="">Tanlang</option>
                {(people.data ?? [])
                  .filter((person) => !reviewed.has(person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {personName(person)} · {person.roleName}
                    </option>
                  ))}
              </Select>
            </FormField>
            <Button leftIcon={<Plus className="size-4" aria-hidden />} disabled={!newUser} onClick={() => setEditing({ userId: newUser, review: null })}>
              Baholash
            </Button>
          </div>
        )}
      </div>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={BarChart3} title="Baholash yo‘q" description="Chorak bo‘yicha xodimlarni baholang: KPI va davomat avtomatik olinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {personName(item.user)}
                    <Badge tone={RATING_TONES[item.rating]}>{RATING_LABELS[item.rating]}</Badge>
                    <Badge tone={item.status === 'APPROVED' ? 'green' : item.status === 'SUBMITTED' ? 'yellow' : 'gray'}>{REVIEW_STATUS_LABELS[item.status]}</Badge>
                    {item.recommendPromotion && <Badge tone="blue">Ko‘tarilishga tavsiya</Badge>}
                  </p>
                  <p className="text-caption text-fg-muted">
                    {item.positionTitle} · baho {item.overallScore} / 5{item.kpiAverage !== null ? ` · KPI ${item.kpiAverage}%` : ''}
                    {item.attendanceRate !== null ? ` · davomat ${item.attendanceRate}%` : ''}
                    {item.reviewer ? ` · baholovchi: ${personName(item.reviewer)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canManage && item.status !== 'APPROVED' && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ userId: item.user.id, review: item })}>
                      Tahrirlash
                    </Button>
                  )}
                  {canApprove && item.status === 'SUBMITTED' && (
                    <Button size="sm" loading={approve.isPending && approve.variables === item.id} onClick={() => approve.mutate(item.id)}>
                      Tasdiqlash
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ReviewModal year={year} quarter={quarter} userId={editing.userId} review={editing.review} onClose={() => { setEditing(null); setNewUser(''); }} />}
    </div>
  );
}

function ReviewModal({ year, quarter, userId, review, onClose }: { year: number; quarter: number; userId: string; review: PerformanceReview | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const prefill = useQuery({ queryKey: ['org', 'review-prefill', userId, year, quarter], queryFn: () => orgService.reviewPrefill(userId, year, quarter) });
  const [scores, setScores] = useState<Record<ReviewCriterion, number>>(review?.scores ?? { quality: 3, discipline: 3, teamwork: 3, initiative: 3, results: 3 });
  const [strengths, setStrengths] = useState(review?.strengths ?? '');
  const [improvements, setImprovements] = useState(review?.improvements ?? '');
  const [goals, setGoals] = useState(review?.goals ?? '');
  const [recommendPromotion, setRecommendPromotion] = useState(review?.recommendPromotion ?? false);
  const save = useMutation({
    mutationFn: (submit: boolean) =>
      orgService.saveReview({
        userId,
        year,
        quarter,
        scores,
        ...(strengths.trim() ? { strengths: strengths.trim() } : {}),
        ...(improvements.trim() ? { improvements: improvements.trim() } : {}),
        ...(goals.trim() ? { goals: goals.trim() } : {}),
        recommendPromotion,
        submit,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ['org', 'reviews'] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const overall = Math.round((CRITERIA.reduce((sum, key) => sum + scores[key], 0) / CRITERIA.length) * 100) / 100;

  return (
    <Modal
      open
      size="lg"
      title={`${year}-yil ${quarter}-chorak baholash`}
      description={prefill.data ? `${prefill.data.position.title}${prefill.data.kpiAverage !== null ? ` · KPI o‘rtachasi ${prefill.data.kpiAverage}%` : ''}${prefill.data.attendanceRate !== null ? ` · davomat ${prefill.data.attendanceRate}%` : ''}` : undefined}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => save.mutate(false)} loading={save.isPending && save.variables === false}>
            Qoralama
          </Button>
          <Button onClick={() => save.mutate(true)} loading={save.isPending && save.variables === true}>
            Tasdiqqa yuborish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CRITERIA.map((key) => (
            <FormField key={key} label={CRITERIA_LABELS[key]} htmlFor={`score-${key}`}>
              <Select id={`score-${key}`} value={scores[key]} onChange={(event) => setScores({ ...scores, [key]: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </FormField>
          ))}
          <div className="self-end rounded-md bg-surface-muted p-3 text-body">
            O‘rtacha: <span className="font-medium text-fg">{overall} / 5</span>
          </div>
        </div>
        <FormField label="Kuchli tomonlari" htmlFor="review-strengths">
          <Textarea id="review-strengths" rows={2} maxLength={2000} value={strengths} onChange={(event) => setStrengths(event.target.value)} />
        </FormField>
        <FormField label="Rivojlantirish kerak" htmlFor="review-improvements">
          <Textarea id="review-improvements" rows={2} maxLength={2000} value={improvements} onChange={(event) => setImprovements(event.target.value)} />
        </FormField>
        <FormField label="Keyingi chorak maqsadlari" htmlFor="review-goals">
          <Textarea id="review-goals" rows={2} maxLength={2000} value={goals} onChange={(event) => setGoals(event.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-body text-fg">
          <Checkbox checked={recommendPromotion} onChange={(event) => setRecommendPromotion(event.target.checked)} />
          Lavozimga ko‘tarishga tavsiya qilaman
        </label>
      </div>
    </Modal>
  );
}

function Awards() {
  const canManage = usePermission(PERMISSIONS.PERFORMANCE_MANAGE);
  const canPayroll = usePermission(PERMISSIONS.SALARY_CALCULATE);
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ['org', 'awards', year], queryFn: () => orgService.awards(year) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, enabled: creating, staleTime: 60_000, retry: false });
  const [form, setForm] = useState({ userId: '', type: 'EMPLOYEE_OF_MONTH' as AwardType, period: String(new Date().getMonth() + 1), title: '', reason: '', amount: '', addToPayroll: false });
  const save = useMutation({
    mutationFn: () =>
      orgService.addAward({
        userId: form.userId,
        type: form.type,
        year,
        ...(form.type === 'EMPLOYEE_OF_MONTH' || form.type === 'EMPLOYEE_OF_QUARTER' ? { period: Number(form.period) } : {}),
        title: form.title.trim(),
        reason: form.reason.trim(),
        ...(form.amount ? { amount: Number(form.amount), addToPayroll: form.addToPayroll } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['org', 'awards'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const periodic = form.type === 'EMPLOYEE_OF_MONTH' || form.type === 'EMPLOYEE_OF_QUARTER';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Yil" htmlFor="award-year">
          <Input id="award-year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())} className="w-28" />
        </FormField>
        {canManage && (
          <Button className="sm:ml-auto" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            Taqdirlash
          </Button>
        )}
      </div>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={Award} title="Taqdirlash yo‘q" description="Oy va chorak xodimi, mukofot va malaka oshirish shu yerda" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((item) => (
              <li key={item.id} className="p-4">
                <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                  {item.title}
                  <Badge tone="yellow">{AWARD_LABELS[item.type]}</Badge>
                  {item.amount !== null && <Badge tone="green">{formatMoney(item.amount)}</Badge>}
                </p>
                <p className="text-caption text-fg-muted">
                  {personName(item.user)} · {item.reason} · {formatDate(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && (
        <Modal
          open
          title="Xodimni taqdirlash"
          description="Mukofot oldindan belgilangan mezon va sabab bilan beriladi"
          onClose={() => setCreating(false)}
          closeDisabled={save.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={save.isPending}>
                Bekor qilish
              </Button>
              <Button disabled={!form.userId || form.title.trim().length < 3 || form.reason.trim().length < 5} loading={save.isPending} onClick={() => save.mutate()}>
                Saqlash
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Xodim" htmlFor="award-user" required>
              <Select id="award-user" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}>
                <option value="">Tanlang</option>
                {(people.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {personName(person)} · {person.roleName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Turi" htmlFor="award-type">
              <Select id="award-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AwardType, period: event.target.value === 'EMPLOYEE_OF_QUARTER' ? '1' : form.period })}>
                {(Object.keys(AWARD_LABELS) as AwardType[]).map((key) => (
                  <option key={key} value={key}>
                    {AWARD_LABELS[key]}
                  </option>
                ))}
              </Select>
            </FormField>
            {periodic && (
              <FormField label={form.type === 'EMPLOYEE_OF_MONTH' ? 'Oy' : 'Chorak'} htmlFor="award-period">
                <Select id="award-period" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}>
                  {Array.from({ length: form.type === 'EMPLOYEE_OF_MONTH' ? 12 : 4 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="Nomi" htmlFor="award-title" required>
              <Input id="award-title" value={form.title} maxLength={150} placeholder="Oktyabr oyi xodimi" onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Mezon va sabab" htmlFor="award-reason" required>
                <Textarea id="award-reason" rows={2} maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              </FormField>
            </div>
            <FormField label="Pul mukofoti (so‘m)" htmlFor="award-amount" hint="Ixtiyoriy">
              <Input id="award-amount" inputMode="numeric" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, '') })} />
            </FormField>
            {form.amount && (
              <label className="flex items-center gap-2 self-end text-body text-fg">
                <Checkbox checked={form.addToPayroll} disabled={!canPayroll} onChange={(event) => setForm({ ...form, addToPayroll: event.target.checked })} />
                Joriy oy maoshiga bonus sifatida qo‘shish
              </label>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Career() {
  const canManage = usePermission(PERMISSIONS.PERFORMANCE_MANAGE);
  const canApprove = usePermission(PERMISSIONS.PERFORMANCE_APPROVE);
  const queryClient = useQueryClient();
  const careers = useQuery({ queryKey: ['org', 'careers'], queryFn: orgService.careers });
  const promotions = useQuery({ queryKey: ['org', 'promotions'], queryFn: () => orgService.promotions('PENDING') });
  const [recommending, setRecommending] = useState<CareerStatus | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['org'] });
  const recommend = useMutation({
    mutationFn: () => orgService.recommend({ employeeId: recommending!.employeeId, toPositionKey: recommending!.next!.key, reason: reason.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setRecommending(null);
      setReason('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) => orgService.decidePromotion(id, decision, note.trim() || undefined),
    onSuccess: (result) => {
      toast.success(result.message);
      setRejecting(null);
      setNote('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      {(promotions.data?.length ?? 0) > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {promotions.data!.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-fg">
                    {personName(item.employee)}: {item.from.title} → {item.to.title}
                  </p>
                  <p className="text-caption text-fg-muted">
                    {item.reason} · lavozimda {item.monthsInPosition} oy{item.kpiAverage !== null ? ` · KPI ${item.kpiAverage}%` : ''} · tavsiya: {personName(item.recommendedBy)}
                  </p>
                </div>
                {canApprove && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" loading={decide.isPending && decide.variables?.id === item.id && decide.variables.decision === 'APPROVED'} onClick={() => decide.mutate({ id: item.id, decision: 'APPROVED' })}>
                      Tasdiqlash
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRejecting(item.id)}>
                      Rad etish
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        {careers.isPending ? (
          <Skeleton className="m-4 h-24" />
        ) : careers.isError ? (
          <ErrorState error={careers.error} onRetry={() => void careers.refetch()} />
        ) : careers.data.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Xodim yo‘q" description="Karyera yo‘li “Lavozimlar va bo‘limlar” katalogida belgilanadi" />
        ) : (
          <ul className="divide-y divide-border">
            {careers.data.map((item) => (
              <li key={item.employeeId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {item.name}
                    {item.eligible && !item.pendingPromotion && <Badge tone="green">Ko‘tarilishga tayyor</Badge>}
                    {item.pendingPromotion && <Badge tone="yellow">Tavsiya kutilmoqda</Badge>}
                  </p>
                  <p className="text-caption text-fg-muted">
                    {item.position.title}
                    {item.next ? ` → ${item.next.title}` : ' · karyera yo‘li belgilanmagan'} · lavozimda {item.monthsInPosition} oy
                    {item.next?.minimumMonths ? ` (kerak: ${item.next.minimumMonths})` : ''}
                    {item.kpiAverage !== null ? ` · KPI ${item.kpiAverage}%` : ''}
                    {item.next?.minimumKpiScore ? ` (kerak: ${item.next.minimumKpiScore}%)` : ''}
                  </p>
                </div>
                {canManage && item.next && !item.pendingPromotion && (
                  <Button size="sm" variant="secondary" onClick={() => setRecommending(item)}>
                    Tavsiya qilish
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {recommending && (
        <Modal
          open
          title="Lavozimga ko‘tarish tavsiyasi"
          description={`${recommending.name}: ${recommending.position.title} → ${recommending.next!.title}`}
          onClose={() => setRecommending(null)}
          closeDisabled={recommend.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRecommending(null)} disabled={recommend.isPending}>
                Bekor qilish
              </Button>
              <Button disabled={reason.trim().length < 5} loading={recommend.isPending} onClick={() => recommend.mutate()}>
                Yuborish
              </Button>
            </>
          }
        >
          {!recommending.eligible && <p className="mb-3 text-body text-warning">Karyera talablari hali to‘liq bajarilmagan — qarorni markaz rahbari qabul qiladi.</p>}
          {recommending.next?.requirements && <p className="mb-3 whitespace-pre-line text-caption text-fg-muted">Talablar: {recommending.next.requirements}</p>}
          <Textarea aria-label="Tavsiya sababi" rows={3} maxLength={1000} placeholder="Nega tavsiya qilinmoqda?" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Modal>
      )}
      {rejecting && (
        <Modal
          open
          title="Tavsiyani rad etish"
          onClose={() => setRejecting(null)}
          closeDisabled={decide.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejecting(null)} disabled={decide.isPending}>
                Yopish
              </Button>
              <Button variant="danger" disabled={!note.trim()} loading={decide.isPending} onClick={() => decide.mutate({ id: rejecting, decision: 'REJECTED' })}>
                Rad etish
              </Button>
            </>
          }
        >
          <Input aria-label="Rad etish sababi" placeholder="Sabab" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Modal>
      )}
    </div>
  );
}
