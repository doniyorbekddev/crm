export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
  createdAt: string;
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  description: string;
}

export interface CreateRolePayload {
  key: string;
  name: string;
  description?: string;
  permissionKeys: string[];
}

export interface UpdateRolePayload {
  name: string;
  description?: string;
}
