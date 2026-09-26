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
  /** To'lov sahifasi — faqat PENDING va provayder sozlangan bo'lsa */
  checkoutUrl: string | null;
}

/** `sandbox` — ichki sinov, `test` — provayderning sinov kassasi, `production` — haqiqiy */
export type PaymentProviderMode = 'sandbox' | 'test' | 'production';

export interface PaymentProviderInfo {
  key: PaymentProviderKey;
  /** Maxfiy kalit sozlanganmi — sozlanmagan provayder webhookni qabul qilmaydi */
  configured: boolean;
  mode: PaymentProviderMode;
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
