import type { UserStatus } from './auth';

export interface RoleRef {
  id: string;
  key: string;
  name: string;
}

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  role: RoleRef;
}

export type UserStatusSummary = Record<'ALL' | UserStatus, number>;

export interface UserListParams {
  page: number;
  limit: number;
  search?: string;
  status?: UserStatus;
  roleId?: string;
}

export interface UserSummaryParams {
  search?: string;
  roleId?: string;
}

export interface UserFormPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleId: string;
}

export interface CreateUserPayload extends UserFormPayload {
  password: string;
}

export interface UpdateUserStatusPayload {
  status: 'ACTIVE' | 'BLOCKED';
  roleId?: string;
}
