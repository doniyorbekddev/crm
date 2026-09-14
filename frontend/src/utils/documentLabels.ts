import type { BadgeTone } from '@/components/ui/Badge';
import type { DocumentCategory, StaffDocumentCategory } from '@/types/document';

export const STAFF_DOCUMENT_CATEGORY_ORDER = ['CONTRACT', 'PASSPORT', 'CERTIFICATE', 'OTHER'] as const satisfies readonly StaffDocumentCategory[];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  CONTRACT: 'Shartnoma',
  PASSPORT: 'Pasport nusxasi',
  CERTIFICATE: 'Sertifikat',
  RECEIPT: 'Chek',
  OTHER: 'Boshqa hujjat',
};

export interface ExpiryState {
  label: string;
  tone: BadgeTone;
}

/** Amal qilish muddati holati: o‘tgan, 30 kun ichida tugaydi yoki amalda */
export function documentExpiryState(expiresAt: string | null, today: Date = new Date()): ExpiryState | null {
  if (!expiresAt) return null;
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = expiresAt.split('-').map(Number) as [number, number, number];
  const days = Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000);
  if (days < 0) return { label: `Muddati o‘tgan (${-days} kun)`, tone: 'red' };
  if (days === 0) return { label: 'Bugun tugaydi', tone: 'red' };
  if (days <= 30) return { label: `${days} kun qoldi`, tone: 'yellow' };
  return { label: 'Amalda', tone: 'green' };
}
