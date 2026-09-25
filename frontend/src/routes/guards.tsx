import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { ForbiddenState } from '@/components/ForbiddenState';
import { PageLoader } from '@/components/PageLoader';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { useAuthStore } from '@/store/auth.store';
import { safeRedirectPath } from '@/utils/url';

export const CHANGE_PASSWORD_PATH = '/change-password';

/** Faqat tizimga kirganlar uchun. Sessiya tiklanayotganda loader, kirilmagan bo‘lsa — login’ga. */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword ?? false);
  const location = useLocation();

  if (status === 'checking') return <PageLoader />;

  // Vaqtinchalik parol — avval o'z parolini o'rnatadi (backend ham boshqa so'rovlarni rad etadi)
  if (status === 'authenticated' && mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  if (status === 'guest') {
    const target = `${location.pathname}${location.search}`;
    const loginPath = target === '/' ? '/login' : `/login?redirect=${encodeURIComponent(target)}`;
    return <Navigate to={loginPath} replace />;
  }

  return <Outlet />;
}

/** Login, register kabi sahifalar: tizimga kirgan foydalanuvchi ichkariga yo‘naltiriladi. */
export function GuestRoute() {
  const status = useAuthStore((state) => state.status);
  const [searchParams] = useSearchParams();

  if (status === 'checking') return <PageLoader />;

  if (status === 'authenticated') {
    return <Navigate to={safeRedirectPath(searchParams.get('redirect'))} replace />;
  }

  return <Outlet />;
}

/** Kabinet (o‘quvchi/ota-ona) foydalanuvchisimi */
export function useIsPortalUser(): boolean {
  const isStudent = usePermission(PERMISSIONS.PORTAL_STUDENT);
  const isParent = usePermission(PERMISSIONS.PORTAL_PARENT);
  return isStudent || isParent;
}

/**
 * Kabinet foydalanuvchisi xodim sahifalariga kira olmaydi va aksincha.
 * Bu faqat qulaylik uchun — haqiqiy himoya backendda.
 */
export function PortalRoute() {
  const status = useAuthStore((state) => state.status);
  const isPortal = useIsPortalUser();

  if (status === 'checking') return <PageLoader />;
  return isPortal ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

/** Xodim sahifalari: kabinet foydalanuvchisi kabinetga qaytariladi */
export function StaffRoute() {
  const status = useAuthStore((state) => state.status);
  const isPortal = useIsPortalUser();

  if (status === 'checking') return <PageLoader />;
  return isPortal ? <Navigate to="/portal" replace /> : <Outlet />;
}

/**
 * Sahifa uchun permission tekshiruvi. Bu faqat interfeys qulayligi — haqiqiy himoya backend’da
 * (har bir endpoint `requirePermission` bilan).
 */
export function PermissionGate({ permission }: { permission: string }) {
  const allowed = usePermission(permission);
  return allowed ? <Outlet /> : <ForbiddenState />;
}
