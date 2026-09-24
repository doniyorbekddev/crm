export type PaymentProviderKey = 'CLICK' | 'PAYME' | 'UZUM' | 'SANDBOX';

export type PaymentIntentStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED' | 'REFUNDED';

export interface PaymentIntent {
  id: string;
  provider: PaymentProviderKey;
  /** Provayderdagi tranzaksiya raqami */
  externalId: string;
  amount: number;
  status: PaymentIntentStatus;
  paymentId: string | null;
  failureText: string | null;
  paidAt: string | null;
  createdAt: string;
  student: { id: string; number: number; name: string };
}

export interface PaymentProviderInfo {
  key: PaymentProviderKey;
  /** Maxfiy kalit sozlanganmi — sozlanmagan provayder webhookni qabul qilmaydi */
  configured: boolean;
}

export interface IntentListParams {
  page: number;
  limit: number;
  status?: PaymentIntentStatus;
  studentId?: string;
}

export interface CreateIntentPayload {
  provider: PaymentProviderKey;
  studentId: string;
  amount: number;
}
