export type InsightType = 'FACT' | 'OBSERVATION' | 'RECOMMENDATION';

export interface Insight {
  type: InsightType;
  text: string;
}

export interface AiAnalysis<TResult = Record<string, unknown>> {
  id: string;
  kind: 'STUDENT' | 'GROUP' | 'HOMEWORK_REVIEW' | 'PARENT_SUMMARY' | 'REMEDIAL';
  subjectType: string;
  subjectId: string;
  status: 'READY' | 'ACCEPTED' | 'REJECTED';
  source: 'RULES' | 'LLM';
  summary: string;
  result: TResult & { items: Insight[] };
  model: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  decidedAt: string | null;
  decision: Record<string, unknown> | null;
}

export interface StudentAnalysisResult {
  scores: { academic: number | null; attendance: number | null; engagement: number | null; homework: number | null; assessment: number | null };
  riskLevel: 'HEALTHY' | 'ATTENTION' | 'AT_RISK' | 'CRITICAL' | null;
  healthScore: number | null;
  weakTopics: Array<{ id: string; title: string; score: number | null }>;
}

export interface GroupAnalysisResult {
  metrics: { students: number; attendanceRate: number | null; homeworkRate: number | null; examAverage: number | null; progress: number | null; atRisk: number };
  strongTopics: Array<{ id: string; title: string; average: number | null }>;
  weakTopics: Array<{ id: string; title: string; average: number | null }>;
  actions: Array<{ type: 'REMEDIAL'; topicId: string; title: string; text: string }>;
}

export interface HomeworkReviewResult {
  homeworkId: string;
  studentId: string;
  maxPoints: number;
  criteria: { correctness: number; completeness: number; quality: number; understanding: number } | null;
  suggestedScore: number | null;
  errors: string[];
  suggestions: string[];
  codeFindings: Array<{ area: string; text: string }>;
  similarity: Array<{ studentId: string; studentName: string; score: number; sameLink: boolean }>;
  filesNote: string | null;
}

export interface RemedialResult {
  groupId: string;
  topic: { id: string; title: string };
  studentIds: string[];
  steps: Array<{ kind: 'LESSON' | 'HOMEWORK' | 'QUIZ' | 'RETEST' | 'MASTERY'; title: string; detail: string }>;
  quiz: { questionCount: number; poolSize: number };
}
