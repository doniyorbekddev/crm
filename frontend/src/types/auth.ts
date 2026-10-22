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
  /** Vaqtinchalik parol bilan kirilgan — avval o‘z parolini o‘rnatishi kerak */
  mustChangePassword: boolean;
  /** Profil rasmi (API bazasiga nisbatan yo'l) */
  avatarUrl?: string | null;
  /** Ikki bosqichli kirish yoqilgan */
  twoFactorEnabled?: boolean;
}

/** Parol to'g'ri, 2FA yoqilgan — sessiya o'rniga ilovadagi kod so'raladi */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  /** Tasdiqlash tokeni muddati (soniya) */
  expiresIn: number;
}

export type LoginResponse = AuthSession | TwoFactorChallenge;

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
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
