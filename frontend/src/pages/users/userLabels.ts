import type { BadgeTone } from '@/components/ui/Badge';
import type { UserStatus } from '@/types/auth';

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Faol',
  PENDING: 'Tasdiqlanmagan',
  BLOCKED: 'Bloklangan',
};

export const USER_STATUS_TONES: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'green',
  PENDING: 'yellow',
  BLOCKED: 'red',
};
