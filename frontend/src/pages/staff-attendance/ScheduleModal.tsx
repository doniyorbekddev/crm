import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { ScheduleRow } from '@/types/staffAttendance';
import { tashkentDate, WEEK_DAY_SHORT } from '@/utils/staffAttendanceLabels';

/**
 * Xodim ish jadvali. Har saqlash yangi versiya ("qaysi sanadan") — o'tgan kunlar eski jadval bo'yicha qoladi.
 * O'qituvchi uchun "Dars jadvali bo'yicha" — kelish vaqti guruh darslaridan olinadi.
 */
export function ScheduleModal({ row, onClose, onSaved }: { row: ScheduleRow; onClose: () => void; onSaved: () => void }) {
  const current = row.schedule;
  const [mode, setMode] = useState<'FIXED' | 'LESSONS'>(current?.mode ?? (row.kind === 'TEACHER' ? 'LESSONS' : 'FIXED'));
  const [workDays, setWorkDays] = useState<string[]>(current?.workDays.length ? current.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']);
  const [startTime, setStartTime] = useState(current?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(current?.endTime ?? '18:00');
  const [breakMinutes, setBreakMinutes] = useState(String(current?.breakMinutes ?? 60));
  const [graceMinutes, setGraceMinutes] = useState(String(current?.graceMinutes ?? 10));
  const [absentAfterMinutes, setAbsentAfterMinutes] = useState(String(current?.absentAfterMinutes ?? 120));
  const [lessonLeadMinutes, setLessonLeadMinutes] = useState(String(current?.lessonLeadMinutes ?? 15));
  const [effectiveFrom, setEffectiveFrom] = useState(tashkentDate());

  const save = useMutation({
    mutationFn: () =>
      staffAttendanceService.saveSchedule(row.userId, {
        mode,
        workDays: mode === 'FIXED' ? workDays : [],
        ...(mode === 'FIXED' ? { startTime, endTime } : {}),
        breakMinutes: Number(breakMinutes) || 0,
        graceMinutes: Number(graceMinutes) || 0,
        absentAfterMinutes: Number(absentAfterMinutes) || 0,
        lessonLeadMinutes: Number(lessonLeadMinutes) || 0,
        effectiveFrom,
      }),
    onSuccess: (response) => {
      toast.success(response.message);
      onSaved();
      onClose();
    },
  });
  const fieldError = (field: string) => getFieldErrors(save.error).find((item) => item.field === field)?.message;
  const toggleDay = (day: string) => setWorkDays((days) => (days.includes(day) ? days.filter((item) => item !== day) : [...days, day]));
  const number = (id: string, label: string, value: string, setValue: (value: string) => void, hint?: string) => (
    <FormField label={label} htmlFor={id} error={fieldError(id)} {...(hint ? { hint } : {})}>
      <Input id={id} type="number" inputMode="numeric" min={0} value={value} onChange={(event) => setValue(event.target.value)} />
    </FormField>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ish jadvali: ${row.name}`}
      description={row.position}
      size="lg"
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.isError && getFieldErrors(save.error).length === 0 && <Alert tone="error">{getErrorMessage(save.error)}</Alert>}
        <fieldset className="space-y-2">
          <legend className="text-label font-medium text-fg">Jadval turi</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: 'FIXED', title: 'Belgilangan soatlar', text: 'Har ish kuni bir xil vaqt (administrator, operator…)' },
                { value: 'LESSONS', title: 'Dars jadvali bo‘yicha', text: 'O‘qituvchi: birinchi darsdan oldin keladi, oxirgi darsdan keyin ketadi' },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn('flex cursor-pointer gap-2 rounded-card border p-3', mode === option.value ? 'border-primary bg-primary-subtle' : 'border-border')}
              >
                <input type="radio" name="schedule-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-1" />
                <span>
                  <span className="block text-body font-medium text-fg">{option.title}</span>
                  <span className="block text-caption text-fg-muted">{option.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'FIXED' ? (
          <>
            <fieldset>
              <legend className="mb-2 text-label font-medium text-fg">Ish kunlari</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_DAY_SHORT.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    aria-pressed={workDays.includes(day.key)}
                    onClick={() => toggleDay(day.key)}
                    className={cn(
                      'h-9 min-w-11 rounded-control border px-2 text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                      workDays.includes(day.key) ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-fg-muted hover:bg-surface-muted',
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {fieldError('workDays') && <p className="mt-1 text-caption text-danger">{fieldError('workDays')}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Ish boshlanishi" htmlFor="startTime" error={fieldError('startTime')}>
                <Input id="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </FormField>
              <FormField label="Ish tugashi" htmlFor="endTime" error={fieldError('endTime')}>
                <Input id="endTime" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </FormField>
              {number('breakMinutes', 'Tanaffus, daqiqa', breakMinutes, setBreakMinutes, 'Ish vaqtidan ayiriladi')}
            </div>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">{number('lessonLeadMinutes', 'Darsdan oldin, daqiqa', lessonLeadMinutes, setLessonLeadMinutes, 'Shuncha oldin kelishi kerak')}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {number('graceMinutes', 'Kechikish imtiyozi, daqiqa', graceMinutes, setGraceMinutes, 'Shu daqiqagacha kechikish hisoblanmaydi')}
          {number('absentAfterMinutes', '“Kelmagan” deyish, daqiqa', absentAfterMinutes, setAbsentAfterMinutes, 'Ish boshlanganidan keyin')}
          <FormField label="Qaysi sanadan" htmlFor="effectiveFrom" hint="O‘tgan kunlar eski jadval bo‘yicha qoladi" error={fieldError('effectiveFrom')}>
            <Input id="effectiveFrom" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
