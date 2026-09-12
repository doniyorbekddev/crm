import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PageLoader } from '@/components/PageLoader';
import RouteErrorPage from '@/pages/RouteErrorPage';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GuestRoute, PermissionGate, ProtectedRoute } from './guards';

/** Har bir sahifa/layout alohida chunk sifatida yuklanadi (code splitting). */
function lazyComponent(loader: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await loader()).default });
}

export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      {
        lazy: lazyComponent(() => import('@/layouts/AuthLayout')),
        children: [
          {
            element: <GuestRoute />,
            children: [
              { path: 'login', lazy: lazyComponent(() => import('@/pages/auth/LoginPage')) },
              { path: 'register', lazy: lazyComponent(() => import('@/pages/auth/RegisterPage')) },
              { path: 'forgot-password', lazy: lazyComponent(() => import('@/pages/auth/ForgotPasswordPage')) },
            ],
          },
          // Emaildagi havola tizimga kirgan holatda ham ochilishi mumkin
          { path: 'reset-password', lazy: lazyComponent(() => import('@/pages/auth/ResetPasswordPage')) },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            lazy: lazyComponent(() => import('@/layouts/AppLayout')),
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              { path: 'profile', lazy: lazyComponent(() => import('@/pages/ProfilePage')) },
              { path: 'notifications', lazy: lazyComponent(() => import('@/pages/notifications/NotificationsPage')) },
              {
                element: <PermissionGate permission={PERMISSIONS.DASHBOARD_VIEW} />,
                children: [{ path: 'dashboard', lazy: lazyComponent(() => import('@/pages/dashboard/DashboardPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.LEAD_VIEW} />,
                children: [
                  { path: 'leads', lazy: lazyComponent(() => import('@/pages/leads/LeadsPage')) },
                  { path: 'leads/:id', lazy: lazyComponent(() => import('@/pages/leads/LeadProfilePage')) },
                ],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.FOLLOWUP_VIEW} />,
                children: [
                  { path: 'follow-ups', lazy: lazyComponent(() => import('@/pages/followups/FollowUpsPage')) },
                ],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.COURSE_VIEW} />,
                children: [{ path: 'courses', lazy: lazyComponent(() => import('@/pages/courses/CoursesPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.GROUP_VIEW} />,
                children: [{ path: 'groups', lazy: lazyComponent(() => import('@/pages/groups/GroupsPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.STUDENT_VIEW} />,
                children: [{ path: 'students', lazy: lazyComponent(() => import('@/pages/students/StudentsPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.ATTENDANCE_VIEW} />,
                children: [{ path: 'attendance', lazy: lazyComponent(() => import('@/pages/attendance/AttendancePage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.GAMIFICATION_VIEW} />,
                children: [{ path: 'gamification', lazy: lazyComponent(() => import('@/pages/gamification/GamificationPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.PAYMENT_VIEW} />,
                children: [{ path: 'payments', lazy: lazyComponent(() => import('@/pages/payments/PaymentsPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.DEBT_VIEW} />,
                children: [{ path: 'debts', lazy: lazyComponent(() => import('@/pages/debts/DebtsPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.REPORT_VIEW} />,
                children: [{ path: 'reports', lazy: lazyComponent(() => import('@/pages/reports/ReportsPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.USER_VIEW} />,
                children: [{ path: 'users', lazy: lazyComponent(() => import('@/pages/users/UsersPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.ROLE_MANAGE} />,
                children: [{ path: 'roles', lazy: lazyComponent(() => import('@/pages/roles/RolesPage')) }],
              },
              {
                element: <PermissionGate permission={PERMISSIONS.AUDIT_VIEW} />,
                children: [{ path: 'audit-logs', lazy: lazyComponent(() => import('@/pages/audit/AuditLogPage')) }],
              },
              { path: 'status', lazy: lazyComponent(() => import('@/pages/SystemStatusPage')) },
            ],
          },
        ],
      },
      { path: '*', lazy: lazyComponent(() => import('@/pages/NotFoundPage')) },
    ],
  },
]);
