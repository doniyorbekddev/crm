import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { AiAnalysis, GroupAnalysisResult, HomeworkReviewResult, RemedialResult, StudentAnalysisResult } from '@/types/aiAcademic';

export const aiAcademicService = {
  async status(): Promise<{ llm: boolean; mode: 'LLM' | 'RULES' }> {
    const response = await api.get<ApiSuccessResponse<{ llm: boolean; mode: 'LLM' | 'RULES' }>>('/ai/academic/status');
    return response.data.data;
  },

  async latestStudent(studentId: string): Promise<AiAnalysis<StudentAnalysisResult> | null> {
    const response = await api.get<ApiSuccessResponse<AiAnalysis<StudentAnalysisResult> | null>>(`/ai/academic/students/${studentId}`);
    return response.data.data;
  },

  async analyzeStudent(studentId: string): Promise<AiAnalysis<StudentAnalysisResult>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis<StudentAnalysisResult>>>(`/ai/academic/students/${studentId}`);
    return response.data.data;
  },

  async latestGroup(groupId: string): Promise<AiAnalysis<GroupAnalysisResult> | null> {
    const response = await api.get<ApiSuccessResponse<AiAnalysis<GroupAnalysisResult> | null>>(`/ai/academic/groups/${groupId}`);
    return response.data.data;
  },

  async analyzeGroup(groupId: string): Promise<AiAnalysis<GroupAnalysisResult>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis<GroupAnalysisResult>>>(`/ai/academic/groups/${groupId}`);
    return response.data.data;
  },

  async latestReview(homeworkId: string, studentId: string): Promise<AiAnalysis<HomeworkReviewResult> | null> {
    const response = await api.get<ApiSuccessResponse<AiAnalysis<HomeworkReviewResult> | null>>(`/ai/academic/submissions/${homeworkId}/${studentId}`);
    return response.data.data;
  },

  async review(homeworkId: string, studentId: string): Promise<AiAnalysis<HomeworkReviewResult>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis<HomeworkReviewResult>>>(`/ai/academic/submissions/${homeworkId}/${studentId}`);
    return response.data.data;
  },

  async remedial(payload: { groupId: string; topicId: string; studentIds?: string[] }): Promise<AiAnalysis<RemedialResult>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis<RemedialResult>>>('/ai/academic/remedial', payload);
    return response.data.data;
  },

  async accept(analysisId: string, payload: { score?: number; feedback?: string } = {}): Promise<MessageResult<AiAnalysis>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis>>(`/ai/academic/analyses/${analysisId}/accept`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async reject(analysisId: string): Promise<MessageResult<AiAnalysis>> {
    const response = await api.post<ApiSuccessResponse<AiAnalysis>>(`/ai/academic/analyses/${analysisId}/reject`);
    return { data: response.data.data, message: response.data.message };
  },
};
