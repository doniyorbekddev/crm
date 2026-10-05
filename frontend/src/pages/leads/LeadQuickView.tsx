import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LeadPriorityBadge, LeadStatusBadge, LeadTemperatureBadge } from '@/components/leads/LeadStatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import type { LeadListItem } from '@/types/lead';
import { formatDate, formatDateTime, formatPhone } from '@/utils/format';
import { leadFullName } from '@/utils/leadLabels';
import { LeadTimeline } from './LeadTimeline';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-body break-words text-fg">{children}</dd>
    </div>
  );
}

/**
 * Leadni ro'yxatdan chiqmasdan ko'rish: asosiy ma'lumot (ro'yxat qatoridan) va tarix.
 * Tahrir va boshqa amallar — to'liq sahifada.
 */
export function LeadQuickView({ lead, onClose }: { lead: LeadListItem; onClose: () => void }) {
  return (
    <Drawer
      open
      title={leadFullName(lead)}
      description={lead.code}
      onClose={onClose}
      footer={
        <Link
          to={`/leads/${lead.id}`}
          className="focus-ring inline-flex h-9 items-center justify-center rounded-control border border-border bg-surface px-3.5 text-body font-medium text-fg shadow-sm transition-colors hover:bg-surface-muted"
        >
          To‘liq sahifani ochish
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <LeadStatusBadge status={lead.status} />
        <LeadPriorityBadge priority={lead.priority} />
        <LeadTemperatureBadge temperature={lead.temperature} score={lead.score} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Telefon">
          <a href={`tel:${lead.phone}`} className="focus-ring rounded-chip hover:text-primary hover:underline">
            {formatPhone(lead.phone)}
          </a>
        </Field>
        <Field label="Telegram">{lead.telegram ?? '—'}</Field>
        <Field label="Kurs">{lead.course?.name ?? 'Tanlanmagan'}</Field>
        <Field label="Manba">{lead.source.name}</Field>
        <Field label="Mas’ul">{lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Biriktirilmagan'}</Field>
        <Field label="Keyingi aloqa">{lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '—'}</Field>
        <Field label="Oxirgi aloqa">{lead.lastContactedAt ? formatDateTime(lead.lastContactedAt) : '—'}</Field>
        <Field label="Qo‘shilgan">{formatDate(lead.createdAt)}</Field>
      </dl>

      <h3 className="mt-5 text-h4 text-fg">Tarix</h3>
      <div className="-mx-5">
        <LeadTimeline leadId={lead.id} />
      </div>
    </Drawer>
  );
}
