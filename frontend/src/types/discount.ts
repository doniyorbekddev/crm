export type DiscountType = 'FAMILY' | 'REFERRAL' | 'PROMO_CODE' | 'PREPAY_3' | 'PREPAY_6' | 'FIRST_PAYMENT' | 'CUSTOM';

export type DiscountValueType = 'PERCENT' | 'AMOUNT';

export interface DiscountSettings {
  /** Bitta o‘quvchiga berilishi mumkin bo‘lgan umumiy chegirma foizi */
  maxPercent: number;
  allowStacking: boolean;
}

export interface DiscountSettingsDto extends DiscountSettings {
  updatedAt: string | null;
}

export interface DiscountRule {
  id: string;
  key: string;
  name: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  stackable: boolean;
  priority: number;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  usedCount: number;
}

export interface DiscountRulePayload {
  key: string;
  name: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  stackable: boolean;
  priority: number;
  isActive: boolean;
  sortOrder: number;
  description?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  ruleId: string;
  ruleName: string;
  valueType: DiscountValueType;
  value: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export interface PromoCodePayload {
  code: string;
  ruleKey: string;
  usageLimit: number;
  expiresAt?: string;
  note?: string;
}

export interface StudentDiscount {
  id: string;
  studentId: string;
  label: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  amount: number;
  note: string | null;
  ruleKey: string | null;
  promoCode: string | null;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

export interface StudentDiscountSummary {
  studentId: string;
  /** Chegirmasiz shartnoma narxi */
  basePrice: number;
  discountTotal: number;
  contractPrice: number;
  percent: number;
  maxPercent: number;
  remainingAllowance: number;
  items: StudentDiscount[];
}

export interface GrantDiscountPayload {
  ruleKey?: string;
  promoCode?: string;
  valueType?: DiscountValueType;
  value?: number;
  label?: string;
  note?: string;
}
