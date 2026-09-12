import type { PersonRef } from './lead';

export type CallDirection = 'OUTGOING' | 'INCOMING';
export type CallStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type CallResult = 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'WRONG_NUMBER' | 'INTERESTED' | 'NOT_INTERESTED' | 'CALLBACK';

export interface CallLeadRef {
  id: string;
  code: string;
  firstName: string;
  lastName: string | null;
  phone: string;
}

export interface CallItem {
  id: string;
  leadId: string;
  direction: CallDirection;
  status: CallStatus;
  result: CallResult | null;
  calledAt: string;
  durationSec: number;
  notes: string | null;
  nextCallAt: string | null;
  createdAt: string;
  manager: PersonRef | null;
  lead: CallLeadRef;
}

export interface CallListParams {
  page: number;
  limit: number;
  leadId?: string;
  /** "me" yoki xodim ID */
  managerId?: string;
  result?: CallResult;
  status?: CallStatus;
  direction?: CallDirection;
}

export interface CallPayload {
  direction: CallDirection;
  status: CallStatus;
  result?: CallResult;
  calledAt?: string;
  durationSec: number;
  notes?: string;
  nextCallAt?: string;
}

export interface CreateCallPayload extends CallPayload {
  leadId: string;
}
