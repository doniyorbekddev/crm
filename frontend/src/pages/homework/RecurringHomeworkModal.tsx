import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import { recurringHomeworkService } from '@/services/homework.service';
import type { RecurringFrequency, RecurringHomework, RecurringHomeworkPayload, WeekDay } from '@/types/recurringHomework';
import { formatDate } from '@/utils/format';

const DAYS: ReadonlyArray<{ value: WeekDay; short: string }> = [
  { value: 'MONDAY', short: 'Du' },
  { value: 'TUESDAY', short: 'Se' },
  { value: 'WEDNESDAY', short: 'Ch' },
  { value: 'THURSDAY', short: 'Pa' },
  { value: 'FRIDAY', short: 'Ju' },
  { value: 'SATURDAY', short: 'Sh' },
  { value: 'SUNDAY', short: 'Ya' },
];
const WORKDAYS: WeekDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export function scheduleLabel(item: Pick<RecurringHomework, 'frequency' | 'weekdays'>): string {
  if (item.frequency === 'DAILY') return 'Har kuni';
  const names = DAYS.filter((day) => item.weekdays.includes(day.value)).map((day) => day.short);
  if (item.frequency === 'WEEKLY') return `Har hafta: ${names.join(', ')}`;
  if (names.length === 5 && WORKDAYS.every((day) => item.weekdays.includes(day))) return 'Ish kunlari (Du–Ju)';
  return names.join(', ');
}

interface Draft {
  groupId: string;
  title: string;
  description: string;
  maxPoints: string;
  frequency: RecurringFrequency;
  weekdays: WeekDay[];
  startDate: string;
  endDate: string;
  publishTime: string;
  deadlineTime: string;
  deadlineOffsetDays: string;
}

function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
}

/** Brauzerda tezkor tekshiruv — server bilan bir xil qoidalar (yakuniy tekshiruv serverda) */
export function validateRecurring(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.groupId) errors.groupId = 'Guruhni tanlang';
  if (draft.title.trim().length < 3) errors.title = 'Kamida 3 belgi';
  if (draft.frequency === 'WEEKLY' && draft.weekdays.length !== 1) errors.weekdays = 'Haftalik uchun bitta kunni tanlang';
  if (draft.frequency === 'WEEKDAYS' && draft.weekdays.length === 0) errors.weekdays = 'Kamida bitta kunni tanlang';
  if (!draft.startDate) errors.startDate = 'Boshlanish sanasini tanlang';
  if (draft.endDate && draft.endDate < draft.startDate) errors.endDate = 'Tugash boshlanishdan oldin bo‘lmasin';
  if (Number(draft.deadlineOffsetDays) === 0 && draft.deadlineTime <= draft.publishTime) errors.deadlineTime = 'Muddat e’lon vaqtidan keyin bo‘lsin';
  return errors;
}

function toPayload(draft: Draft): RecurringHomeworkPayload {
  return {
    groupId: draft.groupId,
    title: draft.title.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    maxPoints: Number(draft.maxPoints) || 100,
    frequency: draft.frequency,
    weekdays: draft.frequency === 'DAILY' ? [] : draft.weekdays,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    publishTime: draft.publishTime,
    deadlineTime: draft.deadlineTime,
    deadlineOffsetDays: Number(draft.deadlineOffsetDays) || 0,
  };
}

function ScheduleForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>({
    groupId: '',
    title: '',
    description: '',
    maxPoints: '100',
    frequency: 'WEEKDAYS',
    weekdays: WORKDAYS,
    startDate: today(),
    endDate: '',
    publishTime: '08:00',
    deadlineTime: '23:59',
    deadlineOffsetDays: '0',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    queryFn: () => groupsService.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    staleTime: 60_000,
  });
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const save = useMutation({
    mutationFn: () => recurringHomeworkService.create(toPayload(draft)),
    onSuccess: (result) => {
      toast.success(result.message);
      onDone();
    },
    onError: (error) => {
      setErrors(Object.fromEntries(getFieldErrors(error).map((item) => [item.field, item.message])));
      toast.error(getErrorMessage(error));
    },
  });
  const submit = () => {
    const found = validateRecurring(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <div className="space-y-3">
      <FormField label="Guruh" htmlFor="rh-group" error={errors.groupId} required>
        <Select id="rh-group" value={draft.groupId} invalid={Boolean(errors.groupId)} onChange={(event) => update({ groupId: event.target.value })}>
          <option value="">— tanlang —</option>
          {(groupsQuery.data?.items ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Vazifa" htmlFor="rh-title" error={errors.title} required>
        <Input id="rh-title" value={draft.title} maxLength={200} placeholder="JavaScript Practice" onChange={(event) => update({ title: event.target.value })} />
      </FormField>
      <FormField label="Tavsif" htmlFor="rh-description">
        <Textarea id="rh-description" rows={2} value={draft.description} onChange={(event) => update({ description: event.target.value })} />
      </FormField>
      <FormField label="Takrorlanish" htmlFor="rh-frequency" error={errors.weekdays} required>
        <Select
          id="rh-frequency"
          value={draft.frequency}
          onChange={(event) => {
            const frequency = event.target.value as RecurringFrequency;
            update({ frequency, weekdays: frequency === 'WEEKDAYS' ? WORKDAYS : frequency === 'WEEKLY' ? ['MONDAY'] : [] });
          }}
        >
          <option value="DAILY">Har kuni</option>
          <option value="WEEKDAYS">Tanlangan kunlar</option>
          <option value="WEEKLY">Haftada bir marta</option>
        </Select>
      </FormField>
      {draft.frequency !== 'DAILY' && (
        <div className="flex flex-wrap gap-3" role="group" aria-label="Hafta kunlari">
          {DAYS.map((day) => (
            <Checkbox
              key={day.value}
              label={day.short}
              checked={draft.weekdays.includes(day.value)}
              onChange={(event) => {
                if (draft.frequency === 'WEEKLY') update({ weekdays: event.target.checked ? [day.value] : [] });
                else update({ weekdays: event.target.checked ? [...draft.weekdays, day.value] : draft.weekdays.filter((item) => item !== day.value) });
              }}
            />
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Boshlanish" htmlFor="rh-start" error={errors.startDate} required>
          <Input id="rh-start" type="date" value={draft.startDate} onChange={(event) => update({ startDate: event.target.value })} />
        </FormField>
        <FormField label="Tugash (ixtiyoriy)" htmlFor="rh-end" error={errors.endDate}>
          <Input id="rh-end" type="date" value={draft.endDate} onChange={(event) => update({ endDate: event.target.value })} />
        </FormField>
        <FormField label="E’lon vaqti" htmlFor="rh-publish" required>
          <Input id="rh-publish" type="time" value={draft.publishTime} onChange={(event) => update({ publishTime: event.target.value })} />
        </FormField>
        <FormField label="Muddat vaqti" htmlFor="rh-deadline" error={errors.deadlineTime} required>
          <Input id="rh-deadline" type="time" value={draft.deadlineTime} onChange={(event) => update({ deadlineTime: event.target.value })} />
        </FormField>
        <FormField label="Muddat — necha kundan keyin" htmlFor="rh-offset" hint="0 — o‘sha kuni">
          <Input id="rh-offset" type="number" min={0} max={14} value={draft.deadlineOffsetDays} onChange={(event) => update({ deadlineOffsetDays: event.target.value })} />
        </FormField>
        <FormField label="Maksimal ball" htmlFor="rh-points">
          <Input id="rh-points" type="number" min={1} max={1000} value={draft.maxPoints} onChange={(event) => update({ maxPoints: event.target.value })} />
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Bekor qilish
        </Button>
        <Button loading={save.isPending} onClick={submit}>
          Saqlash
        </Button>
      </div>
    </div>
  );
}

/** Takrorlanuvchi vazifalar: ro'yxat (keyingi e'lon, yaratilganlar soni, to'xtatish/o'chirish) va yangi jadval */
export function RecurringHomeworkModal({ canManage, onClose }: { canManage: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<RecurringHomework | null>(null);
  const listQuery = useQuery({ queryKey: queryKeys.homework.recurring, queryFn: () => recurringHomeworkService.list() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.homework.all });
  const toggle = useMutation({
    mutationFn: (item: RecurringHomework) => recurringHomeworkService.setActive(item.id, !item.isActive),
    onSuccess: refresh,
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => recurringHomeworkService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      setRemoving(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal open title="Takrorlanuvchi vazifalar" description="Jadval bo‘yicha har kuni (yoki tanlangan kunlarda) avtomatik beriladi — bir kunda bitta." size="lg" onClose={onClose}>
      {creating ? (
        <ScheduleForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : (
        <div className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
                Yangi jadval
              </Button>
            </div>
          )}
          {listQuery.isPending ? (
            <Skeleton className="h-24" />
          ) : listQuery.isError ? (
            <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
          ) : listQuery.data.length === 0 ? (
            <EmptyState icon={Repeat} title="Jadval yo‘q" description="Masalan: “Frontend A — ish kunlari — JavaScript Practice — muddat 23:59”." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {listQuery.data.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {item.title}
                      <Badge tone="gray">{item.group.name}</Badge>
                      {!item.isActive && <Badge tone="yellow">to‘xtatilgan</Badge>}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {scheduleLabel(item)} · e’lon {item.publishTime} · muddat {item.deadlineOffsetDays > 0 ? `+${item.deadlineOffsetDays} kun ` : ''}
                      {item.deadlineTime} · {formatDate(item.startDate)}
                      {item.endDate ? ` — ${formatDate(item.endDate)}` : ' dan'}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      Berildi: {item.generated} ta{item.nextOccurrence ? ` · keyingisi: ${formatDate(item.nextOccurrence)}` : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={item.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                        loading={toggle.isPending && toggle.variables?.id === item.id}
                        onClick={() => toggle.mutate(item)}
                      >
                        {item.isActive ? 'To‘xtatish' : 'Davom ettirish'}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`${item.title} jadvalini o‘chirish`} onClick={() => setRemoving(item)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Jadvalni o‘chirish"
        description={removing ? `“${removing.title}” jadvali o‘chiriladi. Allaqachon berilgan ${removing.generated} ta vazifa qoladi.` : ''}
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  );
}
