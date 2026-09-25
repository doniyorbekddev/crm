import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  Badge,
  CreateBadgePayload,
  GamificationProfile,
  LeaderboardParams,
  LeaderboardRow,
  Level,
  ManualXpPayload,
  XpRule,
} from '@/types/gamification';

export const gamificationService = {
  async leaderboard(params: LeaderboardParams): Promise<LeaderboardRow[]> {
    const response = await api.get<ApiSuccessResponse<LeaderboardRow[]>>('/gamification/leaderboard', { params });
    return response.data.data;
  },

  async profile(studentId: string): Promise<GamificationProfile> {
    const response = await api.get<ApiSuccessResponse<GamificationProfile>>(`/gamification/students/${studentId}`);
    return response.data.data;
  },

  async rules(): Promise<XpRule[]> {
    const response = await api.get<ApiSuccessResponse<XpRule[]>>('/gamification/rules');
    return response.data.data;
  },

  async updateRule(id: string, payload: Partial<Pick<XpRule, 'name' | 'description' | 'points' | 'isActive'>>): Promise<MessageResult<XpRule>> {
    const response = await api.put<ApiSuccessResponse<XpRule>>(`/gamification/rules/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async levels(): Promise<Level[]> {
    const response = await api.get<ApiSuccessResponse<Level[]>>('/gamification/levels');
    return response.data.data;
  },

  async updateLevel(id: string, payload: Partial<Pick<Level, 'name' | 'minXp' | 'icon' | 'color'>>): Promise<MessageResult<Level[]>> {
    const response = await api.put<ApiSuccessResponse<Level[]>>(`/gamification/levels/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async badges(): Promise<Badge[]> {
    const response = await api.get<ApiSuccessResponse<Badge[]>>('/gamification/badges');
    return response.data.data;
  },

  async createBadge(payload: CreateBadgePayload): Promise<MessageResult<Badge>> {
    const response = await api.post<ApiSuccessResponse<Badge>>('/gamification/badges', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateBadge(
    id: string,
    payload: Partial<Pick<Badge, 'name' | 'description' | 'icon' | 'threshold' | 'xpReward' | 'isActive' | 'category'>>,
  ): Promise<MessageResult<Badge[]>> {
    const response = await api.put<ApiSuccessResponse<Badge[]>>(`/gamification/badges/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async awardXp(payload: ManualXpPayload): Promise<MessageResult<GamificationProfile>> {
    const response = await api.post<ApiSuccessResponse<GamificationProfile>>('/gamification/xp', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async awardBadge(studentId: string, badgeId: string): Promise<MessageResult<GamificationProfile>> {
    const response = await api.post<ApiSuccessResponse<GamificationProfile>>('/gamification/badges/award', {
      studentId,
      badgeId,
    });
    return { data: response.data.data, message: response.data.message };
  },

  async recalculate(): Promise<MessageResult<{ students: number }>> {
    const response = await api.post<ApiSuccessResponse<{ students: number }>>('/gamification/recalculate');
    return { data: response.data.data, message: response.data.message };
  },
};
