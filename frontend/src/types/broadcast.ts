export type BroadcastAudience = 'STUDENTS' | 'PARENTS' | 'TEACHERS' | 'STAFF' | 'GROUP' | 'COURSE';

export interface BroadcastButton {
  text: string;
  url: string;
}

export interface BroadcastPayload {
  audience: BroadcastAudience;
  targetId?: string;
  includeParents: boolean;
  message: string;
  buttons: BroadcastButton[];
  mediaToken?: string;
}

export interface BroadcastPreview {
  audience: BroadcastAudience;
  label: string;
  recipients: number;
}

/** `delivered` — Telegram qabul qilgani (Bot API "yetkazildi" tasdig'ini bermaydi) */
export interface BroadcastItem extends BroadcastPreview {
  id: string;
  message: string;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  pending: number;
  mediaKind: 'photo' | 'document' | null;
  buttons: BroadcastButton[];
  createdAt: string;
  createdBy: string | null;
}

export interface BroadcastMedia {
  token: string;
  kind: 'photo' | 'document';
  fileName: string;
  size: number;
}
