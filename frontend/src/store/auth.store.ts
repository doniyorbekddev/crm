import { create } from 'zustand';
import type { AuthSession, AuthUser } from '@/types/auth';

/** checking — sahifa ochilganda sessiya tiklanmoqda; guest — tizimga kirilmagan */
export type AuthStatus = 'checking' | 'authenticated' | 'guest';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
}

/**
 * Access token faqat xotirada saqlanadi (localStorage’da emas) — XSS orqali o‘g‘irlanmasligi uchun.
 * Sahifa yangilanganda sessiya httpOnly refresh cookie orqali tiklanadi.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  status: 'checking',
  accessToken: null,
  user: null,
  setSession: (session) => set({ status: 'authenticated', accessToken: session.accessToken, user: session.user }),
  setUser: (user) => set({ user }),
  clearSession: () => set({ status: 'guest', accessToken: null, user: null }),
}));
