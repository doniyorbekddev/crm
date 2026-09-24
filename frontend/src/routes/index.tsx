import type { ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PageLoader } from "@/components/PageLoader";
import RouteErrorPage from "@/pages/RouteErrorPage";
import { PERMISSIONS } from "@/utils/permissionKeys";
import {
  GuestRoute,
  PermissionGate,
  PortalRoute,
  ProtectedRoute,
  StaffRoute,
} from "./guards";

/** Har bir sahifa/layout alohida chunk sifatida yuklanadi (code splitting). */
function lazyComponent(loader: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await loader()).default });
}

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      {
        lazy: lazyComponent(() => import("@/layouts/AuthLayout")),
        children: [
          {
            element: <GuestRoute />,
            children: [
              {
                path: "login",
                lazy: lazyComponent(() => import("@/pages/auth/LoginPage")),
              },
              {
                path: "register",
                lazy: lazyComponent(() => import("@/pages/auth/RegisterPage")),
              },
              {
                path: "forgot-password",
                lazy: lazyComponent(
                  () => import("@/pages/auth/ForgotPasswordPage"),
                ),
              },
            ],
          },
          // Emaildagi havola tizimga kirgan holatda ham ochilishi mumkin
          {
            path: "reset-password",
            lazy: lazyComponent(() => import("@/pages/auth/ResetPasswordPage")),
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            // Kabinet — o'quvchi va ota-ona uchun alohida, soddalashtirilgan ko'rinish
            element: <PortalRoute />,
            children: [
              {
                lazy: lazyComponent(() => import("@/layouts/PortalLayout")),
                children: [
                  {
                    path: "portal",
                    lazy: lazyComponent(
                      () => import("@/pages/portal/PortalPage"),
                    ),
                  },
                ],
              },
            ],
          },
          {
            element: <StaffRoute />,
            children: [
              {
                lazy: lazyComponent(() => import("@/layouts/AppLayout")),
                children: [
                  {
                    index: true,
                    element: <Navigate to="/dashboard" replace />,
                  },
                  {
                    path: "profile",
                    lazy: lazyComponent(() => import("@/pages/ProfilePage")),
                  },
                  {
                    path: "notifications",
                    lazy: lazyComponent(
                      () => import("@/pages/notifications/NotificationsPage"),
                    ),
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.DASHBOARD_VIEW} />
                    ),
                    children: [
                      {
                        path: "dashboard",
                        lazy: lazyComponent(
                          () => import("@/pages/dashboard/DashboardPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.ANALYTICS_VIEW} />
                    ),
                    children: [
                      {
                        path: "executive",
                        lazy: lazyComponent(
                          () => import("@/pages/dashboard/ExecutivePage"),
                        ),
                      },
                      {
                        path: "analytics",
                        lazy: lazyComponent(
                          () => import("@/pages/analytics/AnalyticsPage"),
                        ),
                      },
                      {
                        path: "activity",
                        lazy: lazyComponent(
                          () => import("@/pages/activity/ActivityPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.ALERT_VIEW} />
                    ),
                    children: [
                      {
                        path: "alerts",
                        lazy: lazyComponent(
                          () => import("@/pages/alerts/AlertsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.TARGET_VIEW} />
                    ),
                    children: [
                      {
                        path: "targets",
                        lazy: lazyComponent(
                          () => import("@/pages/alerts/TargetsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.LEAD_VIEW} />
                    ),
                    children: [
                      {
                        path: "leads",
                        lazy: lazyComponent(
                          () => import("@/pages/leads/LeadsPage"),
                        ),
                      },
                      {
                        path: "leads/:id",
                        lazy: lazyComponent(
                          () => import("@/pages/leads/LeadProfilePage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.FOLLOWUP_VIEW} />
                    ),
                    children: [
                      {
                        path: "follow-ups",
                        lazy: lazyComponent(
                          () => import("@/pages/followups/FollowUpsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.COURSE_VIEW} />
                    ),
                    children: [
                      {
                        path: "courses",
                        lazy: lazyComponent(
                          () => import("@/pages/courses/CoursesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.GROUP_VIEW} />
                    ),
                    children: [
                      {
                        path: "groups",
                        lazy: lazyComponent(
                          () => import("@/pages/groups/GroupsPage"),
                        ),
                      },
                      {
                        path: "rooms",
                        lazy: lazyComponent(
                          () => import("@/pages/rooms/RoomsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.BRANCH_MANAGE} />
                    ),
                    children: [
                      {
                        path: "branches",
                        lazy: lazyComponent(
                          () => import("@/pages/branches/BranchesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.INVENTORY_VIEW} />
                    ),
                    children: [
                      {
                        path: "inventory",
                        lazy: lazyComponent(
                          () => import("@/pages/inventory/InventoryPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.FEEDBACK_VIEW} />
                    ),
                    children: [
                      {
                        path: "feedback",
                        lazy: lazyComponent(
                          () => import("@/pages/feedback/FeedbackPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.REFERRAL_VIEW} />
                    ),
                    children: [
                      {
                        path: "referrals",
                        lazy: lazyComponent(
                          () => import("@/pages/referrals/ReferralsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.DISCOUNT_VIEW} />
                    ),
                    children: [
                      {
                        path: "discounts",
                        lazy: lazyComponent(
                          () => import("@/pages/discounts/DiscountsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.STUDENT_VIEW} />
                    ),
                    children: [
                      {
                        path: "students",
                        lazy: lazyComponent(
                          () => import("@/pages/students/StudentsPage"),
                        ),
                      },
                      {
                        path: "students/:id",
                        lazy: lazyComponent(
                          () => import("@/pages/students/StudentProfilePage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.PARENT_VIEW} />
                    ),
                    children: [
                      {
                        path: "parents",
                        lazy: lazyComponent(
                          () => import("@/pages/parents/ParentsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate
                        permission={PERMISSIONS.ATTENDANCE_VIEW}
                      />
                    ),
                    children: [
                      {
                        path: "attendance",
                        lazy: lazyComponent(
                          () => import("@/pages/attendance/AttendancePage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.HOMEWORK_VIEW} />
                    ),
                    children: [
                      {
                        path: "homework",
                        lazy: lazyComponent(
                          () => import("@/pages/homework/HomeworkPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.EXAM_VIEW} />
                    ),
                    children: [
                      {
                        path: "exams",
                        lazy: lazyComponent(
                          () => import("@/pages/homework/ExamsPage"),
                        ),
                      },
                    
                      {
                        path: "questions",
                        lazy: lazyComponent(
                          () => import("@/pages/questions/QuestionsPage"),
                        ),
                      },],
                  },
                  {
                    element: (
                      <PermissionGate
                        permission={PERMISSIONS.GAMIFICATION_VIEW}
                      />
                    ),
                    children: [
                      {
                        path: "gamification",
                        lazy: lazyComponent(
                          () => import("@/pages/gamification/GamificationPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.TEACHER_VIEW} />
                    ),
                    children: [
                      {
                        path: "teachers",
                        lazy: lazyComponent(
                          () => import("@/pages/teachers/TeachersPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.SALARY_VIEW} />
                    ),
                    children: [
                      {
                        path: "salaries",
                        lazy: lazyComponent(
                          () => import("@/pages/teachers/SalariesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate
                        permission={PERMISSIONS.COMMISSION_VIEW_OWN}
                      />
                    ),
                    children: [
                      {
                        path: "my-earnings",
                        lazy: lazyComponent(
                          () => import("@/pages/teachers/MyEarningsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.PAYMENT_VIEW} />
                    ),
                    children: [
                      {
                        path: "payments",
                        lazy: lazyComponent(
                          () => import("@/pages/payments/PaymentsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.DEBT_VIEW} />
                    ),
                    children: [
                      {
                        path: "debts",
                        lazy: lazyComponent(
                          () => import("@/pages/debts/DebtsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.FINANCE_VIEW} />
                    ),
                    children: [
                      {
                        path: "finance",
                        lazy: lazyComponent(
                          () => import("@/pages/finance/FinancePage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.INCOME_VIEW} />
                    ),
                    children: [
                      {
                        path: "incomes",
                        lazy: lazyComponent(
                          () => import("@/pages/finance/IncomesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.EXPENSE_VIEW} />
                    ),
                    children: [
                      {
                        path: "expenses",
                        lazy: lazyComponent(
                          () => import("@/pages/finance/ExpensesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.REPORT_VIEW} />
                    ),
                    children: [
                      {
                        path: "reports",
                        lazy: lazyComponent(
                          () => import("@/pages/reports/ReportsPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.USER_VIEW} />
                    ),
                    children: [
                      {
                        path: "users",
                        lazy: lazyComponent(
                          () => import("@/pages/users/UsersPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.EMPLOYEE_VIEW} />
                    ),
                    children: [
                      {
                        path: "employees",
                        lazy: lazyComponent(
                          () => import("@/pages/employees/EmployeesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.ROLE_MANAGE} />
                    ),
                    children: [
                      {
                        path: "roles",
                        lazy: lazyComponent(
                          () => import("@/pages/roles/RolesPage"),
                        ),
                      },
                    ],
                  },
                  {
                    element: (
                      <PermissionGate permission={PERMISSIONS.AUDIT_VIEW} />
                    ),
                    children: [
                      {
                        path: "audit-logs",
                        lazy: lazyComponent(
                          () => import("@/pages/audit/AuditLogPage"),
                        ),
                      },
                    ],
                  },
                  {
                    path: "status",
                    lazy: lazyComponent(
                      () => import("@/pages/SystemStatusPage"),
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        // Ochiq sahifa: sertifikatni QR orqali tekshirish (kirish talab qilinmaydi)
        path: "verify/:token",
        lazy: lazyComponent(
          () => import("@/pages/certificates/VerifyCertificatePage"),
        ),
      },
      { path: "*", lazy: lazyComponent(() => import("@/pages/NotFoundPage")) },
    ],
  },
]);
