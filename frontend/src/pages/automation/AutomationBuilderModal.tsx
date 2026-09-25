import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { automationService } from '@/services/automation.service';
import { coursesService } from '@/services/courses.service';
import type { AutomationRule, AutomationSchedule, BuilderAction, BuilderChannel, BuilderTrigger } from '@/types/automation';

export const BUILDER_TRIGGER_LABELS: Record<BuilderTrigger, { label: string; threshold: string | null; unit: string; days: boolean; defaults: { threshold: number; days: number } }> = {
  STUDENT_ABSENT_STREAK: { label: 'Ketma-ket darsga kelmadi', threshold: 'Nechta dars', unit: 'ta', days: false, defaults: { threshold: 3, days: 30 } },
  HOMEWORK_COMPLETION_LOW: { label: 'Vazifa topshirish past', threshold: 'Chegara', unit: '%', days: true, defaults: { threshold: 60, days: 30 } },
  EXAM_SCORE_LOW: { label: 'Imtihon natijasi past', threshold: 'Chegara', unit: '%', days: true, defaults: { threshold: 60, days: 7 } },
  MASTERY_LOW: { label: 'Mavzu o‘zlashtirishi past', threshold: 'Chegara', unit: '%', days: false, defaults: { threshold: 40, days: 30 } },
  NO_LOGIN_DAYS: { label: 'Kabinetga kirmagan', threshold: 'Necha kun', unit: 'kun', days: false, defaults: { threshold: 7, days: 7 } },
  NO_SUBMISSION_DAYS: { label: 'Vazifa topshirmagan', threshold: 'Necha kun', unit: 'kun', days: false, defaults: { threshold: 14, days: 14 } },
  STUDENT_RISK_CRITICAL: { label: 'Xavf darajasi kritik', threshold: null, unit: '', days: false, defaults: { threshold: 0, days: 1 } },
};

export const ACTION_LABELS: Record<BuilderAction['type'], string> = {
  NOTIFY: 'Xabar yuborish',
  CREATE_TASK: 'Ish yaratish',
  CREATE_ALERT: 'Ogohlantirish yaratish',
  ASSIGN_HOMEWORK: 'Vazifa (qoralama) tayyorlash',
  RECOMMEND_QUIZ: 'Quiz tavsiya qilish',
};

const AUDIENCES = [
  ['TEACHER', 'O‘qituvchiga'],
  ['MANAGER', 'Rahbarlarga'],
  ['STUDENT', 'O‘quvchiga'],
  ['PARENT', 'Ota-onaga'],
] as const;
const CHANNELS: Array<[BuilderChannel, string]> = [
  ['BOTH', 'Ilova + Telegram'],
  ['IN_APP', 'Faqat ilova'],
  ['TELEGRAM', 'Faqat Telegram'],
];
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

interface Draft {
  name: string;
  trigger: BuilderTrigger;
  threshold: string;
  days: string;
  courseId: string;
  notify: Record<(typeof AUDIENCES)[number][0], boolean>;
  channel: BuilderChannel;
  task: boolean;
  taskAssignee: 'TEACHER' | 'MANAGER';
  alert: boolean;
  homework: boolean;
  quiz: boolean;
  schedule: AutomationSchedule;
  hour: string;
  weekday: string;
  isActive: boolean;
}

function draftFrom(rule?: AutomationRule): Draft {
  const trigger = (rule?.trigger as BuilderTrigger | undefined) ?? 'STUDENT_ABSENT_STREAK';
  const actions = rule?.actions ?? [{ type: 'NOTIFY', audience: 'TEACHER', channel: 'BOTH' }];
  const notify = actions.filter((action): action is Extract<BuilderAction, { type: 'NOTIFY' }> => action.type === 'NOTIFY');
  const task = actions.find((action) => action.type === 'CREATE_TASK') as Extract<BuilderAction, { type: 'CREATE_TASK' }> | undefined;
  return {
    name: rule?.name ?? '',
    trigger,
    threshold: String(rule?.conditions?.threshold ?? BUILDER_TRIGGER_LABELS[trigger].defaults.threshold),
    days: String(rule?.conditions?.days ?? BUILDER_TRIGGER_LABELS[trigger].defaults.days),
    courseId: rule?.conditions?.courseId ?? '',
    notify: { TEACHER: notify.some((item) => item.audience === 'TEACHER'), MANAGER: notify.some((item) => item.audience === 'MANAGER'), STUDENT: notify.some((item) => item.audience === 'STUDENT'), PARENT: notify.some((item) => item.audience === 'PARENT') },
    channel: notify[0]?.channel ?? 'BOTH',
    task: Boolean(task),
    taskAssignee: task?.assignee ?? 'TEACHER',
    alert: actions.some((action) => action.type === 'CREATE_ALERT'),
    homework: actions.some((action) => action.type === 'ASSIGN_HOMEWORK'),
    quiz: actions.some((action) => action.type === 'RECOMMEND_QUIZ'),
    schedule: rule?.schedule ?? 'DAILY',
    hour: String(rule?.scheduleHour ?? 9),
    weekday: String(rule?.scheduleWeekday ?? 1),
    isActive: rule?.isActive ?? true,
  };
}

function actionsFrom(draft: Draft): BuilderAction[] {
  const actions: BuilderAction[] = [];
  for (const [audience] of AUDIENCES) if (draft.notify[audience]) actions.push({ type: 'NOTIFY', audience, channel: draft.channel });
  if (draft.task) actions.push({ type: 'CREATE_TASK', assignee: draft.taskAssignee, dueDays: 2 });
  if (draft.alert) actions.push({ type: 'CREATE_ALERT', severity: 'WARNING' });
  if (draft.homework) actions.push({ type: 'ASSIGN_HOMEWORK', dueDays: 5 });
  if (draft.quiz) actions.push({ type: 'RECOMMEND_QUIZ' });
  return actions;
}

/**
 * Avtomatlashtirish quruvchisi (TZ §51): Trigger → Shart → Amal → Kanal → Jadval.
 * "Sinab ko‘rish" — hozir nechta holat mos kelishini ko‘rsatadi (hech narsa yuborilmaydi).
 */
export function AutomationBuilderModal({ rule, onClose, onSaved }: { rule?: AutomationRule; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(rule));
  const [formError, setFormError] = useState<string | null>(null);
  const meta = BUILDER_TRIGGER_LABELS[draft.trigger];
  const coursesQuery = useQuery({ queryKey: queryKeys.courses.list({ page: 1, limit: 100 }), queryFn: () => coursesService.list({ page: 1, limit: 100 }), staleTime: 60_000 });
  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const conditions = () => ({
    ...(meta.threshold ? { threshold: Number(draft.threshold) } : {}),
    ...(meta.days ? { days: Number(draft.days) } : {}),
    ...(draft.courseId ? { courseId: draft.courseId } : {}),
  });

  const dryRun = useMutation({
    mutationFn: () => automationService.test({ trigger: draft.trigger, conditions: conditions() }),
    onError: (error) => setFormError(getErrorMessage(error)),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name.trim(),
        trigger: draft.trigger,
        conditions: conditions(),
        actions: actionsFrom(draft),
        schedule: draft.schedule,
        scheduleHour: Number(draft.hour),
        scheduleWeekday: Number(draft.weekday),
        isActive: draft.isActive,
      };
      return rule ? automationService.updateCustom(rule.key, payload) : automationService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const actionCount = actionsFrom(draft).length;
  const notifySelected = Object.values(draft.notify).some(Boolean);

  return (
    <Modal
      open
      size="lg"
      title={rule ? 'Qoidani tahrirlash' : 'Yangi avtomatlashtirish'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" leftIcon={<FlaskConical className="size-4" aria-hidden />} loading={dryRun.isPending} onClick={() => dryRun.mutate()}>
            Sinab ko‘rish
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={draft.name.trim().length < 3 || actionCount === 0} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <div className="space-y-5">
        <FormField label="Nomi" htmlFor="ab-name" required>
          <Input id="ab-name" value={draft.name} placeholder="Masalan: 3 darsga kelmadi" onChange={(event) => patch({ name: event.target.value })} />
        </FormField>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">1. Trigger va shart</legend>
          <FormField label="Qachon (trigger)" htmlFor="ab-trigger">
            <Select
              id="ab-trigger"
              value={draft.trigger}
              onChange={(event) => {
                const trigger = event.target.value as BuilderTrigger;
                patch({ trigger, threshold: String(BUILDER_TRIGGER_LABELS[trigger].defaults.threshold), days: String(BUILDER_TRIGGER_LABELS[trigger].defaults.days) });
                dryRun.reset();
              }}
            >
              {(Object.keys(BUILDER_TRIGGER_LABELS) as BuilderTrigger[]).map((trigger) => (
                <option key={trigger} value={trigger}>
                  {BUILDER_TRIGGER_LABELS[trigger].label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-3 sm:grid-cols-3">
            {meta.threshold && (
              <FormField label={`${meta.threshold} (${meta.unit})`} htmlFor="ab-threshold">
                <Input id="ab-threshold" inputMode="numeric" value={draft.threshold} onChange={(event) => patch({ threshold: event.target.value.replace(/\D/g, '') })} />
              </FormField>
            )}
            {meta.days && (
              <FormField label="Davr (kun)" htmlFor="ab-days">
                <Input id="ab-days" inputMode="numeric" value={draft.days} onChange={(event) => patch({ days: event.target.value.replace(/\D/g, '') })} />
              </FormField>
            )}
            <FormField label="Kurs (ixtiyoriy)" htmlFor="ab-course">
              <Select id="ab-course" value={draft.courseId} onChange={(event) => patch({ courseId: event.target.value })}>
                <option value="">Barcha kurslar</option>
                {(coursesQuery.data?.items ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {dryRun.data && (
            <Alert tone={dryRun.data.matched ? 'info' : 'success'} title={`Hozir ${dryRun.data.matched} ta holat mos keladi`}>
              {dryRun.data.sample.length > 0 && (
                <ul className="list-disc pl-4">
                  {dryRun.data.sample.map((row, index) => (
                    <li key={index}>
                      {row.name}
                      {row.group ? ` (${row.group})` : ''} — {row.detail}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-fg">2. Amallar</legend>
          <p className="text-xs text-fg-muted">{ACTION_LABELS.NOTIFY}:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {AUDIENCES.map(([audience, label]) => (
              <Checkbox key={audience} label={label} checked={draft.notify[audience]} onChange={(event) => patch({ notify: { ...draft.notify, [audience]: event.target.checked } })} />
            ))}
          </div>
          {notifySelected && (
            <FormField label="Kanal" htmlFor="ab-channel">
              <Select id="ab-channel" value={draft.channel} onChange={(event) => patch({ channel: event.target.value as BuilderChannel })}>
                {CHANNELS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox label={ACTION_LABELS.CREATE_TASK} checked={draft.task} onChange={(event) => patch({ task: event.target.checked })} />
            {draft.task && (
              <Select aria-label="Ish kimga" value={draft.taskAssignee} onChange={(event) => patch({ taskAssignee: event.target.value as 'TEACHER' | 'MANAGER' })} wrapperClassName="w-40">
                <option value="TEACHER">O‘qituvchiga</option>
                <option value="MANAGER">Rahbarga</option>
              </Select>
            )}
          </div>
          <Checkbox label={ACTION_LABELS.CREATE_ALERT} checked={draft.alert} onChange={(event) => patch({ alert: event.target.checked })} />
          <Checkbox label={`${ACTION_LABELS.ASSIGN_HOMEWORK} — o‘qituvchi tasdiqlaydi`} checked={draft.homework} onChange={(event) => patch({ homework: event.target.checked })} />
          <Checkbox label={`${ACTION_LABELS.RECOMMEND_QUIZ} — o‘qituvchiga ish`} checked={draft.quiz} onChange={(event) => patch({ quiz: event.target.checked })} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">3. Jadval</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Qanchalik tez-tez" htmlFor="ab-schedule">
              <Select id="ab-schedule" value={draft.schedule} onChange={(event) => patch({ schedule: event.target.value as AutomationSchedule })}>
                <option value="HOURLY">Har soat</option>
                <option value="DAILY">Har kuni</option>
                <option value="WEEKLY">Har hafta</option>
              </Select>
            </FormField>
            {draft.schedule !== 'HOURLY' && (
              <FormField label="Soat" htmlFor="ab-hour">
                <Select id="ab-hour" value={draft.hour} onChange={(event) => patch({ hour: event.target.value })}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, '0')}:00
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {draft.schedule === 'WEEKLY' && (
              <FormField label="Kun" htmlFor="ab-weekday">
                <Select id="ab-weekday" value={draft.weekday} onChange={(event) => patch({ weekday: event.target.value })}>
                  {WEEKDAYS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
          <Checkbox label="Yoqilgan" checked={draft.isActive} onChange={(event) => patch({ isActive: event.target.checked })} />
        </fieldset>
      </div>
    </Modal>
  );
}
