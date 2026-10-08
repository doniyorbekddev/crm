import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/** Server chegarasi bilan bir xil: ko'pi bilan 30 kun */
const MAX_DAYS = 30;
const HOUR = 3_600_000;

/** Keyingi kun ertalab 09:00 (qurilma vaqti bo'yicha) */
function tomorrowMorning(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

/** Keyingi dushanba 09:00 */
function nextMonday(now: Date): Date {
  const next = new Date(now);
  const offset = (8 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + offset);
  next.setHours(9, 0, 0, 0);
  return next;
}

export function snoozePresets(now: Date = new Date()): Array<{ key: string; label: string; until: Date }> {
  return [
    { key: 'hour', label: '1 soatdan keyin', until: new Date(now.getTime() + HOUR) },
    { key: 'evening', label: '3 soatdan keyin', until: new Date(now.getTime() + 3 * HOUR) },
    { key: 'tomorrow', label: 'Ertaga ertalab (09:00)', until: tomorrowMorning(now) },
    { key: 'monday', label: 'Dushanba ertalab (09:00)', until: nextMonday(now) },
    { key: 'week', label: '1 haftadan keyin', until: new Date(now.getTime() + 7 * 24 * HOUR) },
  ];
}

/** `datetime-local` qiymati → sana; noto'g'ri yoki chegaradan tashqari bo'lsa xato matni */
export function validateSnooze(value: string, now: Date = new Date()): { until: Date } | { error: string } {
  if (!value) return { error: 'Vaqtni tanlang' };
  const until = new Date(value);
  if (Number.isNaN(until.getTime())) return { error: 'Vaqt noto‘g‘ri' };
  if (until.getTime() <= now.getTime()) return { error: 'Vaqt kelajakda bo‘lishi kerak' };
  if (until.getTime() > now.getTime() + MAX_DAYS * 24 * HOUR) return { error: `Ko‘pi bilan ${MAX_DAYS} kunga kechiktiriladi` };
  return { until };
}

interface SnoozeModalProps {
  open: boolean;
  /** Nima kechiktirilayotgani (oyna tavsifida ko'rinadi) */
  subject: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (until: Date) => void;
}

/** Kechiktirish vaqtini tanlash: tayyor variantlar yoki aniq sana va vaqt */
export function SnoozeModal({ open, subject, pending = false, onClose, onConfirm }: SnoozeModalProps) {
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submitCustom = () => {
    const result = validateSnooze(custom);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onConfirm(result.until);
  };

  return (
    <Modal open={open} title="Kechiktirish" description={subject} onClose={onClose} closeDisabled={pending} size="sm">
      <div className="space-y-4">
        <div className="grid gap-2">
          {snoozePresets().map((preset) => (
            <Button key={preset.key} variant="secondary" disabled={pending} onClick={() => onConfirm(preset.until)} className="justify-start">
              {preset.label}
            </Button>
          ))}
        </div>
        <FormField label="Yoki aniq vaqt" htmlFor="snooze-custom" error={error} hint={`Ko‘pi bilan ${MAX_DAYS} kun`}>
          <div className="flex gap-2">
            <Input
              id="snooze-custom"
              type="datetime-local"
              value={custom}
              invalid={Boolean(error)}
              aria-describedby={error ? fieldErrorId('snooze-custom') : undefined}
              onChange={(event) => {
                setCustom(event.target.value);
                setError(undefined);
              }}
            />
            <Button onClick={submitCustom} loading={pending} disabled={!custom}>
              Kechiktirish
            </Button>
          </div>
        </FormField>
      </div>
    </Modal>
  );
}
