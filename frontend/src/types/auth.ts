export type UserStatus = 'ACTIVE' | 'PENDING' | 'BLOCKED';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; key: string; name: string };
  permissions: string[];
}

export interface AuthSession {
  accessToken: string;
  /** Access token amal qilish muddati (soniya) */
  expiresIn: number;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface RegisterResult {
  id: string;
  email: string;
  status: UserStatus;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}
