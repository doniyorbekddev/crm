import type { CallLeadRef } from './call';
import type { LeadPriority, PersonRef } from './lead';

export type FollowUpStatus = 'PENDING' | 'DONE' | 'CANCELLED';
/** OVERDUE serverda hisoblanadi: muddati o‘tgan bajarilmagan vazifa */
export type FollowUpState = 'PENDING' | 'OVERDUE' | 'DONE' | 'CANCELLED';
export type FollowUpScope = 'all' | 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'done';

export interface FollowUpItem {
  id: string;
  leadId: string;
  title: string;
  notes: string | null;
  priority: LeadPriority;
  dueAt: string;
  remindAt: string | null;
  status: FollowUpStatus;
  state: FollowUpState;
  completedAt: string | null;
  createdAt: string;
  assignedTo: PersonRef | null;
  createdBy: PersonRef | null;
  lead: CallLeadRef;
}

export interface FollowUpSummary {
  overdue: number;
  today: number;
  tomorrow: number;
  upcoming: number;
}

export interface FollowUpListParams {
  page: number;
  limit: number;
  scope?: FollowUpScope;
  /** "me" yoki xodim ID */
  assignedTo?: string;
  leadId?: string;
}

export interface FollowUpPayload {
  title: string;
  dueAt: string;
  remindAt?: string;
  notes?: string;
  assignedToId?: string;
  priority?: LeadPriority;
}

export interface CreateFollowUpPayload extends FollowUpPayload {
  leadId: string;
}

export interface CompleteFollowUpPayload {
  comment?: string;
  nextDueAt?: string;
  nextTitle?: string;
}
