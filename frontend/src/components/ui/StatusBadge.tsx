import { AlertTriangle, CheckCircle2, Circle, Info, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { resolveStatus } from '@/utils/statusRegistry';
import type { StatusKind, StatusOf } from '@/utils/statusRegistry';
import { Badge, semanticTone } from './Badge';
import type { SemanticTone } from './Badge';

const TONE_ICONS: Record<SemanticTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  primary: Circle,
  accent: Circle,
  neutral: Circle,
};

interface StatusBadgeProps<Kind extends StatusKind> {
  /** Holat turi — `utils/statusRegistry.ts` dagi kalit */
  kind: Kind;
  /** API qaytargan qiymat (o'zgartirilmaydi) */
  status: StatusOf<Kind> | (string & {});
  /** `true` — ohangga mos ikonka; yoki aniq ikonka. Rangni ko'rmaydigan foydalanuvchi uchun ikkinchi belgi. */
  icon?: boolean | LucideIcon;
  className?: string;
}

/** Holat belgisi: yorliq va rang markaziy registrdan — sahifalar o'z rangini tanlamaydi. */
export function StatusBadge<Kind extends StatusKind>({ kind, status, icon = false, className }: StatusBadgeProps<Kind>) {
  const { label, tone } = resolveStatus(kind, status);
  const Icon = icon === true ? TONE_ICONS[semanticTone(tone)] : icon || null;
  return (
    <Badge tone={tone} className={className}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {label}
    </Badge>
  );
}
