export type ReferralStatus = 'PENDING' | 'CONVERTED' | 'REWARDED' | 'CANCELLED';

export interface Referral {
  id: string;
  status: ReferralStatus;
  bonusAmount: number;
  rewardedAt: string | null;
  rewardedBy: string | null;
  note: string | null;
  createdAt: string;
  referrer: { id: string; number: number; name: string; code: string | null };
  referred: { id: string; number: number; name: string } | null;
  lead: { id: string; number: number; name: string; status: string } | null;
}

export interface ReferralStats {
  total: number;
  converted: number;
  rewarded: number;
  conversionPercent: number;
  bonusTotal: number;
  /** Taklif orqali kelgan o‘quvchilardan tushgan to‘lovlar */
  referralRevenue: number;
  top: Array<{ studentId: string; name: string; code: string | null; total: number; converted: number; bonus: number }>;
}

export interface ReferralListParams {
  page: number;
  limit: number;
  status?: ReferralStatus;
  studentId?: string;
}

/** Kod bo‘yicha topilgan taklif qiluvchi */
export interface ReferralLookup {
  id: string;
  number: number;
  name: string;
  code: string;
}
