import axios from 'axios';
import { appEnv } from '@/lib/env';
import { useAuthStore } from '@/store/auth.store';
import type { ApiErrorDetail, ApiErrorResponse, ApiSuccessResponse } from '@/types/api';
import type { AuthSession } from '@/types/auth';

/** Yagona HTTP klient. `withCredentials` httpOnly refresh cookie yuborilishi uchun kerak. */
export const api = axios.create({
  baseURL: appEnv.apiUrl,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------
// Sessiyani yangilash (refresh token rotation)
// ---------------------------------------------------------------------

let refreshInFlight: Promise<AuthSession | null> | null = null;

async function performRefresh(): Promise<AuthSession | null> {
  try {
    const response = await api.post<ApiSuccessResponse<AuthSession>>('/auth/refresh', undefined, {
      skipAuthRefresh: true,
    });
    useAuthStore.getState().setSession(response.data.data);
    return response.data.data;
  } catch {
    useAuthStore.getState().clearSession();
    return null;
  }
}

/**
 * Access tokenni refresh cookie orqali yangilaydi. Bir vaqtda faqat bitta so‘rov ketadi:
 * tab ichida — umumiy promise, tablar orasida — Web Locks API (refresh token rotatsiyasi buzilmasligi uchun).
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshInFlight ??= (
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('crm-auth-refresh', performRefresh)
      : performRefresh()
  ).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (
    !axios.isAxiosError(error) ||
    error.response?.status !== 401 ||
    !error.config ||
    error.config.skipAuthRefresh ||
    error.config.authRetried
  ) {
    throw error;
  }

  const session = await refreshSession();
  if (!session) {
    throw error;
  }

  error.config.authRetried = true;
  error.config.headers.Authorization = `Bearer ${session.accessToken}`;
  return api.request(error.config);
});

// ---------------------------------------------------------------------
// Xatoliklar
// ---------------------------------------------------------------------

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** Istalgan xatolikdan foydalanuvchiga ko‘rsatiladigan tushunarli xabar oladi. */
export function getErrorMessage(error: unknown, fallback = 'Kutilmagan xatolik yuz berdi'): string {
  if (axios.isAxiosError(error)) {
    if (isApiErrorResponse(error.response?.data)) {
      return error.response.data.message;
    }
    if (error.code === 'ECONNABORTED') {
      return 'Server javob bermadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.';
    }
    if (!error.response) {
      return 'Serverga ulanib bo‘lmadi. Server ishlayotganini tekshiring.';
    }
    return fallback;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

/** HTTP status kodi (javob kelmagan bo‘lsa — undefined) */
export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** Validatsiya xatoliklarini (422, 409) maydonlar bo‘yicha qaytaradi — formalarda ko‘rsatish uchun. */
export function getFieldErrors(error: unknown): ApiErrorDetail[] {
  if (axios.isAxiosError(error) && isApiErrorResponse(error.response?.data)) {
    return error.response.data.errors;
  }
  return [];
}
