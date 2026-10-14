import { CalendarCheck, Lightbulb, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { RiskLevel } from '@/types/student';
import { RISK_LEVEL_LABELS } from '@/utils/studentLabels';

/** Profil sarlavhasidagi "Davomat" ko'rsatkichi bilan bir xil chegara */
const ATTENDANCE_OK = 85;

export interface NextStep {
  key: string;
  icon: LucideIcon;
  text: string;
  action: string;
  onSelect: () => void;
}

interface NextStepsInput {
  riskLevel: RiskLevel | null;
  attendance: { total: number; rate: number };
  can: { message: boolean; attendance: boolean };
  open: { message: () => void; calendar: () => void };
}

/**
 * O'quvchi profilidagi tavsiya etilgan keyingi qadamlar — faqat profilda allaqachon ko'rinib turgan signallardan
 * (ketib qolish xavfi, davomat) va mavjud amallardan; yangi biznes qoidasi yo'q. Qarz uchun "To'lov qabul qilish"
 * sarlavhaning o'zida asosiy tugma — bu yerda takrorlanmaydi.
 */
export function buildNextSteps({ riskLevel, attendance, can, open }: NextStepsInput): NextStep[] {
  const steps: NextStep[] = [];
  if (riskLevel && riskLevel !== 'HEALTHY' && can.message) {
    steps.push({
      key: 'risk',
      icon: MessageSquare,
      text: `Ketib qolish xavfi: ${RISK_LEVEL_LABELS[riskLevel]}`,
      action: 'Xabar yuborish',
      onSelect: open.message,
    });
  }
  if (attendance.total > 0 && attendance.rate < ATTENDANCE_OK && can.attendance) {
    steps.push({
      key: 'attendance',
      icon: CalendarCheck,
      text: `Davomat ${attendance.rate}% — ${ATTENDANCE_OK}% dan past`,
      action: 'Davomat kalendari',
      onSelect: open.calendar,
    });
  }
  return steps;
}

export function NextStepsCard({ steps }: { steps: NextStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section aria-label="Keyingi qadamlar" className="mb-4 rounded-card border border-warning-border bg-warning-subtle/60 px-4 py-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-overline text-warning uppercase">
        <Lightbulb className="size-3.5" aria-hidden />
        Keyingi qadamlar
      </p>
      <ul className="divide-y divide-warning-border/60">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <span className="inline-flex min-w-0 items-center gap-2 text-body text-fg">
              <step.icon className="size-4 shrink-0 text-warning" aria-hidden />
              {step.text}
            </span>
            <Button size="sm" variant="secondary" onClick={step.onSelect}>
              {step.action}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
