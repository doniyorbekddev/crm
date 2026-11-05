import type { EmployeePosition, EmployeeStatus } from '@/types/employee';

/** ORG tizimi: tashkiliy tuzilma va umumiy turlar */
export interface OrgPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface OrgStaffUser extends OrgPerson {
  roleName: string;
}

export interface OrgMember {
  kind: 'employee' | 'teacher';
  id: string;
  userId: string | null;
  name: string;
  position: string;
  positionKey: EmployeePosition | 'TEACHER';
  status: EmployeeStatus;
  manager: OrgPerson | null;
  hireDate: string | null;
  probationEndDate: string | null;
  probationDaysLeft: number | null;
  onLeaveToday: boolean;
}

export interface OrgStructure {
  leaders: OrgStaffUser[];
  departments: Array<{ name: string; members: OrgMember[] }>;
  vacancies: Array<{ position: EmployeePosition; label: string }>;
  summary: { members: number; employees: number; teachers: number; onProbation: number; onLeave: number; withoutAccount: number };
}

// ---------------------------------------------------------------- murojaatlar
export type ComplaintSource = 'STUDENT' | 'PARENT' | 'STAFF' | 'OTHER';
export type ComplaintCategory = 'SERVICE' | 'TEACHER' | 'PAYMENT' | 'SCHEDULE' | 'SAFETY' | 'STAFF_CONFLICT' | 'SUGGESTION' | 'OTHER';
export type ComplaintSeverity = 'NORMAL' | 'HIGH' | 'CRITICAL';
export type ComplaintStatus = 'NEW' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface Complaint {
  id: string;
  number: number;
  source: ComplaintSource;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  title: string;
  description: string;
  contactName: string | null;
  contactPhone: string | null;
  confidential: boolean;
  dueAt: string | null;
  overdue: boolean;
  escalatedAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string } | null;
  subjectUser: OrgPerson | null;
  reporter: OrgPerson | null;
  assignee: OrgPerson | null;
}

export interface ComplaintDetail extends Complaint {
  events: Array<{ id: string; type: 'CREATED' | 'ASSIGNED' | 'STATUS_CHANGED' | 'ESCALATED' | 'COMMENT'; fromStatus: ComplaintStatus | null; toStatus: ComplaintStatus | null; note: string | null; actor: OrgPerson | null; createdAt: string }>;
  can: { manage: boolean; work: boolean; close: boolean; escalate: boolean };
}

export interface ComplaintList {
  items: Complaint[];
  total: number;
  counts: Record<ComplaintStatus, number> & { overdue: number; escalated: number };
}

export interface ComplaintPayload {
  source: ComplaintSource;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  title: string;
  description: string;
  studentId?: string;
  contactName?: string;
  contactPhone?: string;
  subjectUserId?: string;
  assigneeId?: string;
  confidential?: boolean;
}

// ---------------------------------------------------------------- aktivlar
export type AssetStatus = 'IN_USE' | 'IN_STORAGE' | 'UNDER_REPAIR' | 'WRITTEN_OFF' | 'LOST';
export type AssetEventType = 'CREATED' | 'UPDATED' | 'ASSIGNED' | 'MOVED' | 'STATUS_CHANGED' | 'REPAIR';

export interface Asset {
  id: string;
  inventoryNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  status: AssetStatus;
  condition: string | null;
  room: { id: string; name: string } | null;
  location: string | null;
  responsible: OrgPerson | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetail extends Asset {
  events: Array<{ id: string; type: AssetEventType; fromValue: string | null; toValue: string | null; cost: number | null; note: string | null; actor: OrgPerson | null; occurredAt: string }>;
  repairCost: number;
  repairCount: number;
}

export interface AssetList {
  items: Asset[];
  total: number;
  summary: { count: number; value: number; byStatus: Record<AssetStatus, number> };
  categories: string[];
}

export type AssetEventPayload =
  | { type: 'ASSIGNED'; responsibleId?: string; condition?: string; note?: string }
  | { type: 'MOVED'; roomId?: string; location?: string; note?: string }
  | { type: 'STATUS_CHANGED'; status: AssetStatus; note?: string }
  | { type: 'REPAIR'; cost?: number; note: string };

// ---------------------------------------------------------------- bilimlar bazasi
export type KnowledgeCategory = 'JOB_DESCRIPTION' | 'POLICY' | 'VIDEO_GUIDE' | 'SALES_SCRIPT' | 'LESSON_STANDARD' | 'MATERIAL' | 'OTHER';
export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface KnowledgeItem {
  id: string;
  title: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  position: EmployeePosition | null;
  version: number;
  requiresAck: boolean;
  acknowledged: boolean;
  audience: Array<{ id: string; name: string }>;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: OrgPerson | null;
}

export interface KnowledgeDetail extends KnowledgeItem {
  body: string;
  videoUrl: string | null;
  versions: Array<{ version: number; title: string; changeNote: string | null; editor: OrgPerson | null; createdAt: string }>;
  acknowledgements: Array<{ user: OrgPerson; acknowledgedAt: string }> | null;
  can: { manage: boolean };
}

export interface KnowledgePayload {
  title: string;
  category: KnowledgeCategory;
  body: string;
  videoUrl: string | null;
  audienceRoleIds: string[];
  position: EmployeePosition | null;
  requiresAck: boolean;
  changeNote?: string;
}

// ---------------------------------------------------------------- HR jarayonlari
export type CandidateStage = 'NEW' | 'INTERVIEW' | 'DEMO' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  position: EmployeePosition | null;
  isTeacher: boolean;
  positionTitle: string | null;
  positionLabel: string;
  source: string | null;
  stage: CandidateStage;
  interviewAt: string | null;
  demoAt: string | null;
  score: number | null;
  notes: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  employeeId: string | null;
  decidedBy: OrgPerson | null;
  createdBy: OrgPerson | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDetail extends Candidate {
  events: Array<{ id: string; fromStage: CandidateStage | null; toStage: CandidateStage | null; note: string | null; actor: OrgPerson | null; createdAt: string }>;
  can: { manage: boolean; decide: boolean };
}

export interface CandidatePayload {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  position?: EmployeePosition;
  isTeacher: boolean;
  positionTitle?: string;
  source?: string;
  interviewAt?: string | null;
  demoAt?: string | null;
  score?: number | null;
  notes?: string;
}

export type ChecklistKind = 'ONBOARDING' | 'OFFBOARDING';
export type ChecklistStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';

export interface ChecklistItem {
  id: string;
  key: string | null;
  title: string;
  responsible: OrgPerson | null;
  done: boolean;
  doneAt: string | null;
  doneBy: OrgPerson | null;
  note: string | null;
  system: boolean;
}

export interface Checklist {
  id: string;
  kind: ChecklistKind;
  status: ChecklistStatus;
  employeeId: string | null;
  userId: string | null;
  subjectName: string;
  reason: string | null;
  lastWorkingDay: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: OrgPerson | null;
  completedBy: OrgPerson | null;
  progress: { done: number; total: number };
  items: ChecklistItem[];
}

export interface ChecklistDetail extends Checklist {
  facts: {
    openWork: { tasks: number; followUps: number; complaints: number };
    assets: Array<{ id: string; inventoryNumber: string; name: string }>;
    account: { exists: boolean; active: boolean };
    contractSigned: boolean;
  };
}

// ---------------------------------------------------------------- tuzilma katalogi
export interface Department {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  head: OrgPerson | null;
  monthlyExpenseLimit: number | null;
  isActive: boolean;
  sortOrder: number;
  employees: number;
  positions: number;
}

export interface Responsibility {
  id: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  expectedResult: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Position {
  id: string;
  key: string;
  title: string;
  department: { id: string; name: string } | null;
  description: string | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'HOURLY';
  probationMonths: number;
  nextPosition: { id: string; key: string; title: string } | null;
  careerRequirements: string | null;
  minimumKpiScore: number | null;
  minimumMonths: number | null;
  isActive: boolean;
  holders: number;
  responsibilities: Responsibility[];
}

export interface EmploymentHistoryEntry {
  id: string;
  type: 'HIRED' | 'POSITION_CHANGED' | 'DEPARTMENT_CHANGED' | 'PROMOTED' | 'STATUS_CHANGED' | 'TERMINATED';
  positionKey: string;
  positionTitle: string;
  department: string | null;
  effectiveDate: string;
  changeReason: string | null;
  approvedBy: OrgPerson | null;
  createdBy: OrgPerson | null;
  createdAt: string;
}

// ---------------------------------------------------------------- natija va rivojlanish
export type ReviewCriterion = 'quality' | 'discipline' | 'teamwork' | 'initiative' | 'results';
export type PerformanceRating = 'BELOW' | 'MEETS' | 'EXCEEDS';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

export interface PerformanceReview {
  id: string;
  year: number;
  quarter: number;
  positionKey: string;
  positionTitle: string;
  kpiAverage: number | null;
  attendanceRate: number | null;
  scores: Record<ReviewCriterion, number>;
  overallScore: number;
  rating: PerformanceRating;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  recommendPromotion: boolean;
  status: ReviewStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  user: OrgPerson;
  reviewer: OrgPerson | null;
  approvedBy: OrgPerson | null;
}

export type AwardType = 'EMPLOYEE_OF_MONTH' | 'EMPLOYEE_OF_QUARTER' | 'SPECIAL' | 'TRAINING';

export interface StaffAward {
  id: string;
  type: AwardType;
  year: number;
  period: number | null;
  title: string;
  reason: string;
  amount: number | null;
  salaryPeriodId: string | null;
  createdAt: string;
  user: OrgPerson;
  createdBy: OrgPerson | null;
}

export interface CareerStatus {
  employeeId: string;
  name: string;
  position: { key: string; title: string };
  next: { key: string; title: string; requirements: string | null; minimumKpiScore: number | null; minimumMonths: number | null } | null;
  monthsInPosition: number;
  kpiAverage: number | null;
  meetsKpi: boolean;
  meetsTenure: boolean;
  eligible: boolean;
  pendingPromotion: boolean;
}

export interface Promotion {
  id: string;
  employee: OrgPerson;
  from: { key: string; title: string };
  to: { key: string; title: string };
  reason: string;
  kpiAverage: number | null;
  monthsInPosition: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  effectiveDate: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  recommendedBy: OrgPerson | null;
  decidedBy: OrgPerson | null;
}

// ---------------------------------------------------------------- CEO paneli
export interface OrgOverview {
  date: string;
  attendance: { expected: number; working: number; onTime: number; late: number; notArrived: number; absent: number; excused: number; review: number; lateNames: string[] } | null;
  team: { employees: number; teachers: number; onLeave: number; onProbation: number; withoutAccount: number; vacancies: number } | null;
  tasks: { open: number; inProgress: number; review: number; overdue: number; doneThisMonth: number; overdueItems: Array<{ id: string; title: string; assignee: string; dueAt: string }> } | null;
  kpi: { month: string; evaluated: number; averageAchievement: number | null; below: Array<{ name: string; achievement: number }> } | null;
  academic: { activeStudents: number; activeGroups: number; attendanceRate: number; newStudents: number; droppedStudents: number } | null;
  sales: { newLeads: number; wonLeads: number; conversionRate: number } | null;
  marketing: { spend: number; leads: number; costPerLead: number | null; cac: number | null; roi: number | null } | null;
  /** `dueDebt` — muddati kelgan qarz; `totalDebt` — shartnoma qoldig'i */
  payments: { revenue: number; totalDebt: number; dueDebt: number; dueDebtors: number } | null;
  /** Boshqaruv xulosasi — bloklardan qoida bo'yicha, har fikr manba ko'rsatkichi bilan */
  summary: ManagementInsight[];
  payroll: { accrued: number; paid: number; remaining: number } | null;
  expenses: { total: number; pendingApprovals: number; overLimit: Array<{ name: string; spent: number; limit: number }> } | null;
  complaints: { open: number; newCount: number; overdue: number; escalated: number; critical: number } | null;
  assets: { count: number; value: number; underRepair: number } | null;
  approvals: { expenses: number; discounts: number; reviews: number; promotions: number; candidates: number } | null;
}

/** Umumiy kalendar (bayram, ta'til, ruxsat, istisno) */
export type CalendarItemKind = 'HOLIDAY' | 'LEAVE' | 'ABSENCE' | 'LATE_ARRIVAL' | 'EARLY_LEAVE' | 'DAY_OFF' | 'CUSTOM_HOURS';

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  person: { id: string; name: string } | null;
  startDate: string;
  endDate: string;
  detail: string | null;
  /** Faqat rahbarga */
  reason: string | null;
}

export interface CalendarMonth {
  month: string;
  from: string;
  to: string;
  canSeeReasons: boolean;
  items: CalendarItem[];
}

export interface ManagementInsight {
  key: string;
  tone: 'negative' | 'neutral' | 'positive';
  area: string;
  text: string;
  metric: { label: string; value: string };
  link: string;
}
