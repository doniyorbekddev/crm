export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'CALLBACK'
  | 'INTERESTED'
  | 'TRIAL_BOOKED'
  | 'TRIAL_ATTENDED'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type LeadTemperature = 'COLD' | 'WARM' | 'HOT' | 'VERY_HOT';

export type LeadScoreFactorKey = 'status' | 'calls' | 'engagement' | 'course' | 'followUp' | 'source' | 'recency';

export interface LeadScoreFactor {
  key: LeadScoreFactorKey;
  label: string;
  points: number;
  detail: string;
}

/** `GET /leads/:id/score` javobi */
export interface LeadScoreResult {
  score: number;
  temperature: LeadTemperature;
  factors: LeadScoreFactor[];
  reasons: string[];
}

export interface AssignmentRule {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  weight: number;
  dailyLimit: number;
  isActive: boolean;
  lastAssignedAt: string | null;
  assignedToday: number;
}

export interface AssignmentRulePayload {
  userId: string;
  weight: number;
  dailyLimit: number;
  isActive: boolean;
}

export type Gender = 'MALE' | 'FEMALE';

export type LeadActivityType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNED'
  | 'NOTE_ADDED'
  | 'CALL_LOGGED'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_COMPLETED'
  | 'DOCUMENT_UPLOADED'
  | 'CONVERTED_TO_STUDENT';

export type LeadFollowUpFilter = 'overdue' | 'today' | 'upcoming' | 'none';

export type LeadSortBy = 'createdAt' | 'updatedAt' | 'nextFollowUpAt' | 'firstName' | 'priority' | 'score' | 'number';

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface LeadListItem {
  id: string;
  number: number;
  code: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  telegram: string | null;
  email: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  /** Qiziqish bahosi 0–100 va undan kelib chiqadigan daraja (fon vazifasi hisoblaydi) */
  score: number | null;
  temperature: LeadTemperature | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: { id: string; key: string; name: string };
  course: { id: string; name: string } | null;
  assignedTo: PersonRef | null;
  student: { id: string; number: number } | null;
}

export interface LeadDetail extends LeadListItem {
  age: number | null;
  gender: Gender | null;
  address: string | null;
  notes: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  createdBy: PersonRef | null;
  counts: { notes: number; activities: number; calls: number; followUps: number };
}

export interface LeadFilters {
  search?: string;
  sourceId?: string;
  courseId?: string;
  /** "me", "unassigned" yoki xodim ID */
  assignedTo?: string;
  priority?: LeadPriority;
  temperature?: LeadTemperature;
  followUp?: LeadFollowUpFilter;
}

export interface LeadListParams extends LeadFilters {
  page: number;
  limit: number;
  status?: LeadStatus[];
  sortBy?: LeadSortBy;
  sortOrder?: 'asc' | 'desc';
}

export type LeadStatusSummary = Record<'ALL' | LeadStatus, number>;

export interface LeadKanbanColumn {
  status: LeadStatus;
  total: number;
  items: LeadListItem[];
}

export interface LeadActivity {
  id: string;
  type: LeadActivityType;
  description: string;
  metadata: unknown;
  createdAt: string;
  user: PersonRef | null;
}

export interface LeadNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: PersonRef | null;
}

export interface LeadPayload {
  firstName: string;
  lastName?: string;
  phone: string;
  telegram?: string;
  email?: string;
  age?: number;
  gender?: Gender;
  address?: string;
  sourceId: string;
  courseId?: string;
  priority: LeadPriority;
  notes?: string;
}

export interface CreateLeadPayload extends LeadPayload {
  assignedToId?: string;
  allowDuplicate?: boolean;
}

export interface UpdateLeadStatusPayload {
  status: LeadStatus;
  lostReason?: string;
  comment?: string;
}

export interface LeadFormLookups {
  sources: Array<{ id: string; key: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}
