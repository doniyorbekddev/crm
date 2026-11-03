import type { BadgeTone } from '@/components/ui/Badge';
import type { AssetStatus, CandidateStage, ChecklistStatus, ComplaintCategory, ComplaintSeverity, ComplaintSource, ComplaintStatus, KnowledgeCategory, KnowledgeStatus } from '@/types/org';

/** ORG tizimi: holat va turkum nomlari */

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = { NEW: 'Yangi', UNDER_REVIEW: 'Ko‘rib chiqilmoqda', RESOLVED: 'Hal etildi', CLOSED: 'Yopildi' };
export const COMPLAINT_STATUS_TONES: Record<ComplaintStatus, BadgeTone> = { NEW: 'blue', UNDER_REVIEW: 'yellow', RESOLVED: 'green', CLOSED: 'gray' };
export const COMPLAINT_SOURCE_LABELS: Record<ComplaintSource, string> = { STUDENT: 'O‘quvchi', PARENT: 'Ota-ona', STAFF: 'Xodim', OTHER: 'Boshqa' };
export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  SERVICE: 'Xizmat sifati',
  TEACHER: 'O‘qituvchi',
  PAYMENT: 'To‘lov',
  SCHEDULE: 'Dars jadvali',
  SAFETY: 'Xavfsizlik',
  STAFF_CONFLICT: 'Xodimlar o‘rtasidagi nizo',
  SUGGESTION: 'Taklif',
  OTHER: 'Boshqa',
};
export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = { NORMAL: 'Oddiy', HIGH: 'Muhim', CRITICAL: 'Jiddiy' };
export const COMPLAINT_SEVERITY_TONES: Record<ComplaintSeverity, BadgeTone> = { NORMAL: 'gray', HIGH: 'yellow', CRITICAL: 'red' };

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  IN_USE: 'Foydalanishda',
  IN_STORAGE: 'Omborda',
  UNDER_REPAIR: 'Ta’mirda',
  WRITTEN_OFF: 'Hisobdan chiqarilgan',
  LOST: 'Yo‘qolgan',
};
export const ASSET_STATUS_TONES: Record<AssetStatus, BadgeTone> = { IN_USE: 'green', IN_STORAGE: 'blue', UNDER_REPAIR: 'yellow', WRITTEN_OFF: 'gray', LOST: 'red' };

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  JOB_DESCRIPTION: 'Lavozim yo‘riqnomasi',
  POLICY: 'Ichki qoida',
  VIDEO_GUIDE: 'Video qo‘llanma',
  SALES_SCRIPT: 'Savdo skripti',
  LESSON_STANDARD: 'Dars standarti',
  MATERIAL: 'O‘quv materiali',
  OTHER: 'Boshqa',
};
export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = { DRAFT: 'Qoralama', PUBLISHED: 'E’lon qilingan', ARCHIVED: 'Arxivda' };
export const KNOWLEDGE_STATUS_TONES: Record<KnowledgeStatus, BadgeTone> = { DRAFT: 'yellow', PUBLISHED: 'green', ARCHIVED: 'gray' };

export const CANDIDATE_STAGE_LABELS: Record<CandidateStage, string> = {
  NEW: 'Yangi',
  INTERVIEW: 'Suhbat',
  DEMO: 'Demo dars',
  OFFER: 'Taklif',
  HIRED: 'Ishga olindi',
  REJECTED: 'Rad etildi',
  WITHDRAWN: 'Voz kechdi',
};
export const CANDIDATE_STAGE_TONES: Record<CandidateStage, BadgeTone> = { NEW: 'blue', INTERVIEW: 'blue', DEMO: 'yellow', OFFER: 'yellow', HIRED: 'green', REJECTED: 'red', WITHDRAWN: 'gray' };
export const CANDIDATE_PIPELINE: readonly CandidateStage[] = ['NEW', 'INTERVIEW', 'DEMO', 'OFFER'];

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = { OPEN: 'Jarayonda', COMPLETED: 'Yakunlangan', CANCELLED: 'Bekor qilingan' };
export const CHECKLIST_STATUS_TONES: Record<ChecklistStatus, BadgeTone> = { OPEN: 'yellow', COMPLETED: 'green', CANCELLED: 'gray' };

export const personName = (person: { firstName: string; lastName: string } | null | undefined): string => (person ? `${person.firstName} ${person.lastName}`.trim() : '—');
