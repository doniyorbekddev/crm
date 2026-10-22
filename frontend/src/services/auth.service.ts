import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResult,
  ResetPasswordPayload,
  TwoFactorStatus,
} from '@/types/auth';

export interface MessageResult<T> {
  data: T;
  message: string;
}

export const authService = {
  /** 2FA yoqilgan bo'lsa sessiya o'rniga tasdiqlash so'rovi qaytadi (`twoFactorRequired`) */
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const response = await api.post<ApiSuccessResponse<LoginResponse>>('/auth/login', payload, { skipAuthRefresh: true });
    return response.data.data;
  },

  async loginTwoFactor(payload: { challengeToken: string; code: string }): Promise<AuthSession> {
    const response = await api.post<ApiSuccessResponse<AuthSession>>('/auth/login/2fa', payload, { skipAuthRefresh: true });
    return response.data.data;
  },

  async twoFactorStatus(): Promise<TwoFactorStatus> {
    const response = await api.get<ApiSuccessResponse<TwoFactorStatus>>('/auth/2fa');
    return response.data.data;
  },

  async twoFactorSetup(password: string): Promise<{ secret: string; otpauthUrl: string }> {
    const response = await api.post<ApiSuccessResponse<{ secret: string; otpauthUrl: string }>>('/auth/2fa/setup', { password });
    return response.data.data;
  },

  async twoFactorEnable(code: string): Promise<MessageResult<{ recoveryCodes: string[] }>> {
    const response = await api.post<ApiSuccessResponse<{ recoveryCodes: string[] }>>('/auth/2fa/enable', { code });
    return { data: response.data.data, message: response.data.message };
  },

  async twoFactorDisable(payload: { password: string; code: string }): Promise<string> {
    const response = await api.post<ApiSuccessResponse<null>>('/auth/2fa/disable', payload);
    return response.data.message;
  },

  async twoFactorRecoveryCodes(payload: { password: string; code: string }): Promise<MessageResult<{ recoveryCodes: string[] }>> {
    const response = await api.post<ApiSuccessResponse<{ recoveryCodes: string[] }>>('/auth/2fa/recovery-codes', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async register(payload: RegisterPayload): Promise<MessageResult<RegisterResult>> {
    const response = await api.post<ApiSuccessResponse<RegisterResult>>('/auth/register', payload, {
      skipAuthRefresh: true,
    });
    return { data: response.data.data, message: response.data.message };
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout', undefined, { skipAuthRefresh: true });
  },

  async logoutAll(): Promise<{ revokedSessions: number }> {
    const response = await api.post<ApiSuccessResponse<{ revokedSessions: number }>>('/auth/logout-all');
    return response.data.data;
  },

  /** Profil rasmi: tana — tayyorlangan rasm baytlari */
  async uploadAvatar(image: Blob): Promise<MessageResult<{ avatarUrl: string }>> {
    const response = await api.post<ApiSuccessResponse<{ avatarUrl: string }>>('/auth/me/avatar', image, { headers: { 'Content-Type': image.type || 'application/octet-stream' } });
    return { data: response.data.data, message: response.data.message };
  },

  async removeAvatar(): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>('/auth/me/avatar');
    return response.data.message;
  },

  async me(): Promise<AuthUser> {
    const response = await api.get<ApiSuccessResponse<AuthUser>>('/auth/me');
    return response.data.data;
  },

  async forgotPassword(email: string): Promise<string> {
    const response = await api.post<ApiSuccessResponse<null>>('/auth/forgot-password', { email }, { skipAuthRefresh: true });
    return response.data.message;
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<string> {
    const response = await api.post<ApiSuccessResponse<null>>('/auth/reset-password', payload, { skipAuthRefresh: true });
    return response.data.message;
  },

  async changePassword(payload: ChangePasswordPayload): Promise<MessageResult<AuthSession>> {
    const response = await api.patch<ApiSuccessResponse<AuthSession>>('/auth/change-password', payload);
    return { data: response.data.data, message: response.data.message };
  },
};
