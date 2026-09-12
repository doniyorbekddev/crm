import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { ForbiddenState } from '@/components/ForbiddenState';
import { PageLoader } from '@/components/PageLoader';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/store/auth.store';
import { safeRedirectPath } from '@/utils/url';

/** Faqat tizimga kirganlar uchun. Sessiya tiklanayotganda loader, kirilmagan bo‘lsa — login’ga. */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'checking') return <PageLoader />;

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

/**
 * Sahifa uchun permission tekshiruvi. Bu faqat interfeys qulayligi — haqiqiy himoya backend’da
 * (har bir endpoint `requirePermission` bilan).
 */
export function PermissionGate({ permission }: { permission: string }) {
  const allowed = usePermission(permission);
  return allowed ? <Outlet /> : <ForbiddenState />;
}
