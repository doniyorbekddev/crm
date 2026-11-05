# 02 — API xaritasi (ORG)

Route fayllaridan avtomatik yig'ilgan (2026-11-05). Barcha yo'llar autentifikatsiya talab qiladi; ruxsat serverda tekshiriladi.
"Router darajasi / servisda" — ruxsat butun router uchun yoki servisda (doira, egasi) tekshiriladi.

### /api/roles  (`backend/src/routes/role.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/roles` | requireAnyPermission(USER_VIEW, ROLE_MANAGE) |
| POST | `/roles` | requirePermission(ROLE_MANAGE) |
| PUT | `/roles/:id` | requirePermission(ROLE_MANAGE) |
| PUT | `/roles/:id/permissions` | requirePermission(ROLE_MANAGE) |
| DELETE | `/roles/:id` | requirePermission(ROLE_MANAGE) |

### /api/permissions  (`backend/src/routes/role.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/permissions` | requirePermission(ROLE_MANAGE) |

### /api/discounts  (`backend/src/routes/discount.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/discounts/settings` | requirePermission(DISCOUNT_VIEW) |
| PUT | `/discounts/settings` | requirePermission(DISCOUNT_MANAGE) |
| GET | `/discounts/rules` | requirePermission(DISCOUNT_VIEW) |
| PUT | `/discounts/rules` | requirePermission(DISCOUNT_MANAGE) |
| GET | `/discounts/promo-codes` | requirePermission(DISCOUNT_VIEW) |
| POST | `/discounts/promo-codes` | requirePermission(DISCOUNT_MANAGE) |
| PATCH | `/discounts/promo-codes/:id` | requirePermission(DISCOUNT_MANAGE) |
| GET | `/discounts/requests` | requirePermission(DISCOUNT_VIEW) |
| POST | `/discounts/requests/:id/approve` | requirePermission(DISCOUNT_APPROVE) |
| POST | `/discounts/requests/:id/reject` | requirePermission(DISCOUNT_APPROVE) |
| POST | `/discounts/requests/:id/cancel` | requirePermission(DISCOUNT_GRANT) |
| GET | `/discounts/students/:id` | requirePermission(DISCOUNT_VIEW) |
| POST | `/discounts/students/:id` | requirePermission(DISCOUNT_GRANT) |
| POST | `/discounts/:id/revoke` | requirePermission(DISCOUNT_GRANT) |

### /api/tasks  (`backend/src/routes/task.routes.ts`)

Butun router uchun: `authenticate, requireStaff()`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/tasks` | — (router darajasi / servisda) |
| GET | `/tasks/assignees` | — (router darajasi / servisda) |
| POST | `/tasks` | requirePermission(TASK_CREATE) |
| GET | `/tasks/:id` | — (router darajasi / servisda) |
| PATCH | `/tasks/:id` | — (router darajasi / servisda) |
| POST | `/tasks/:id/assign` | requirePermission(TASK_ASSIGN) |
| POST | `/tasks/:id/comments` | — (router darajasi / servisda) |

### /api/my-work  (`backend/src/routes/myWork.routes.ts`)

Butun router uchun: `authenticate, requireStaff()`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/my-work` | — (router darajasi / servisda) |

### /api/teachers  (`backend/src/routes/teacher.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/teachers/me` | — (router darajasi / servisda) |
| GET | `/teachers` | view |
| GET | `/teachers/candidates` | manage |
| GET | `/teachers/:id` | view |
| GET | `/teachers/:id/performance-history` | view |
| POST | `/teachers` | manage |
| PUT | `/teachers/:id` | manage |
| GET | `/teachers/:id/documents` | requirePermission(STAFF_DOCUMENT_VIEW) |
| POST | `/teachers/:id/documents` | — (router darajasi / servisda) |
| GET | `/teachers/:id/salary-rules` | — (router darajasi / servisda) |
| POST | `/teachers/:id/salary-rules` | manage |
| GET | `/teachers/:id/salary-periods` | — (router darajasi / servisda) |

### /api/salaries  (`backend/src/routes/teacher.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/salaries/periods` | — (router darajasi / servisda) |
| GET | `/salaries/summary` | — (router darajasi / servisda) |
| GET | `/salaries/periods/:id` | — (router darajasi / servisda) |
| POST | `/salaries/calculate` | requirePermission(SALARY_CALCULATE) |
| PATCH | `/salaries/periods/:id` | requirePermission(SALARY_CALCULATE) |
| POST | `/salaries/periods/:id/approve` | requirePermission(SALARY_APPROVE) |
| POST | `/salaries/periods/:id/payments` | requirePermission(SALARY_PAY) |
| POST | `/salaries/periods/:id/unlock` | requirePermission(SALARY_UNLOCK) |
| POST | `/salaries/adjustments` | requirePermission(SALARY_CALCULATE) |
| POST | `/salaries/adjustments/:id/void` | requirePermission(SALARY_CALCULATE) |
| POST | `/salaries/periods/:id/submit` | requirePermission(SALARY_CALCULATE) |
| POST | `/salaries/periods/:id/reject` | requirePermission(SALARY_APPROVE) |
| POST | `/salaries/submit` | requirePermission(SALARY_CALCULATE) |
| GET | `/salaries/profile` | — (router darajasi / servisda) |
| GET | `/salaries/kpi` | — (router darajasi / servisda) |
| GET | `/salaries/kpi/preview` | — (router darajasi / servisda) |
| POST | `/salaries/kpi` | requirePermission(SALARY_APPROVE) |
| PUT | `/salaries/kpi/settings` | requirePermission(SALARY_APPROVE) |
| PUT | `/salaries/kpi/pool/:id` | requirePermission(SALARY_APPROVE) |
| POST | `/salaries/kpi/results` | requirePermission(SALARY_CALCULATE) |
| PUT | `/salaries/kpi/:id` | requirePermission(SALARY_APPROVE) |

### /api/payroll  (`backend/src/routes/teacher.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/payroll` | — (router darajasi / servisda) |
| GET | `/payroll/summary` | — (router darajasi / servisda) |
| POST | `/payroll/calculate` | requirePermission(SALARY_CALCULATE) |
| POST | `/payroll/adjustments` | requirePermission(SALARY_CALCULATE) |
| POST | `/payroll/adjustments/:id/void` | requirePermission(SALARY_CALCULATE) |
| GET | `/payroll/:id` | — (router darajasi / servisda) |
| POST | `/payroll/:id/submit` | requirePermission(SALARY_CALCULATE) |
| POST | `/payroll/:id/reject` | requirePermission(SALARY_APPROVE) |
| POST | `/payroll/:id/approve` | requirePermission(SALARY_APPROVE) |
| POST | `/payroll/:id/pay` | requirePermission(SALARY_PAY) |
| POST | `/payroll/:id/unlock` | requirePermission(SALARY_UNLOCK) |

### /api/employees  (`backend/src/routes/employee.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/employees` | view |
| GET | `/employees/candidates` | manage |
| GET | `/employees/leaves` | view |
| POST | `/employees/leaves` | manage |
| POST | `/employees/leaves/:id/decide` | manage |
| GET | `/employees/:id/leaves` | view |
| GET | `/employees/:id` | view |
| POST | `/employees` | manage |
| PUT | `/employees/:id` | manage |
| GET | `/employees/:id/documents` | requirePermission(STAFF_DOCUMENT_VIEW) |
| POST | `/employees/:id/documents` | — (router darajasi / servisda) |

### /api/org  (`backend/src/routes/org.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/org/overview` | staff |
| GET | `/org/calendar` | staff |
| GET | `/org/structure` | can(EMPLOYEE_VIEW) |
| GET | `/org/people` | can(EMPLOYEE_VIEW) |
| GET | `/org/departments` | can(EMPLOYEE_VIEW) |
| POST | `/org/departments` | can(ORG_MANAGE) |
| PUT | `/org/departments/:id` | can(ORG_MANAGE) |
| GET | `/org/departments/spending` | can(EXPENSE_VIEW) |
| GET | `/org/positions` | can(EMPLOYEE_VIEW) |
| PATCH | `/org/positions/:key` | can(ORG_MANAGE) |
| POST | `/org/positions/:key/responsibilities` | can(ORG_MANAGE) |
| PUT | `/org/positions/:key/responsibilities/:id` | can(ORG_MANAGE) |
| GET | `/org/employees/:id/history` | can(EMPLOYEE_VIEW) |
| GET | `/org/users/:id/history` | can(EMPLOYEE_VIEW) |
| GET | `/org/complaints` | staff |
| GET | `/org/complaints/assignees` | can(COMPLAINT_MANAGE) |
| POST | `/org/complaints` | can(COMPLAINT_CREATE) |
| POST | `/org/complaints/appeal` | staff |
| GET | `/org/complaints/:id` | staff |
| POST | `/org/complaints/:id/assign` | can(COMPLAINT_MANAGE) |
| POST | `/org/complaints/:id/status` | staff |
| POST | `/org/complaints/:id/escalate` | staff |
| POST | `/org/complaints/:id/comments` | staff |
| GET | `/org/assets` | can(ASSET_VIEW) |
| POST | `/org/assets` | can(ASSET_MANAGE) |
| GET | `/org/assets/:id` | can(ASSET_VIEW) |
| PATCH | `/org/assets/:id` | can(ASSET_MANAGE) |
| POST | `/org/assets/:id/events` | can(ASSET_MANAGE) |
| GET | `/org/knowledge` | staff |
| GET | `/org/knowledge/roles` | can(KNOWLEDGE_MANAGE) |
| POST | `/org/knowledge` | can(KNOWLEDGE_MANAGE) |
| GET | `/org/knowledge/:id` | staff |
| GET | `/org/knowledge/:id/versions/:version` | staff |
| PUT | `/org/knowledge/:id` | can(KNOWLEDGE_MANAGE) |
| POST | `/org/knowledge/:id/status` | can(KNOWLEDGE_MANAGE) |
| POST | `/org/knowledge/:id/acknowledge` | staff |
| GET | `/org/candidates` | can(HIRING_MANAGE) |
| POST | `/org/candidates` | can(HIRING_MANAGE) |
| GET | `/org/candidates/:id` | can(HIRING_MANAGE) |
| PUT | `/org/candidates/:id` | can(HIRING_MANAGE) |
| POST | `/org/candidates/:id/stage` | can(HIRING_MANAGE) |
| POST | `/org/candidates/:id/hire` | can(HIRING_DECIDE) |
| GET | `/org/checklists` | can(EMPLOYEE_MANAGE) |
| POST | `/org/checklists` | can(EMPLOYEE_MANAGE) |
| GET | `/org/checklists/:id` | can(EMPLOYEE_MANAGE) |
| POST | `/org/checklists/:id/items/:itemId` | staff |
| POST | `/org/checklists/:id/handover` | can(EMPLOYEE_MANAGE) |
| POST | `/org/checklists/:id/revoke-access` | can(EMPLOYEE_MANAGE) |
| POST | `/org/checklists/:id/complete` | can(EMPLOYEE_MANAGE) |
| POST | `/org/checklists/:id/cancel` | can(EMPLOYEE_MANAGE) |
| GET | `/org/performance/me` | staff |
| GET | `/org/performance/reviews` | can(PERFORMANCE_VIEW) |
| GET | `/org/performance/reviews/prefill` | can(PERFORMANCE_MANAGE) |
| POST | `/org/performance/reviews` | can(PERFORMANCE_MANAGE) |
| POST | `/org/performance/reviews/:id/approve` | can(PERFORMANCE_APPROVE) |
| GET | `/org/performance/awards` | can(PERFORMANCE_VIEW) |
| POST | `/org/performance/awards` | can(PERFORMANCE_MANAGE) |
| GET | `/org/performance/careers` | can(PERFORMANCE_VIEW) |
| GET | `/org/performance/promotions` | can(PERFORMANCE_VIEW) |
| POST | `/org/performance/promotions` | can(PERFORMANCE_MANAGE) |
| POST | `/org/performance/promotions/:id/decide` | can(PERFORMANCE_APPROVE) |

### /api/staff-attendance  (`backend/src/routes/staffAttendance.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| POST | `/staff-attendance/qr` | display |
| GET | `/staff-attendance/qr/:id` | display |
| GET | `/staff-attendance/me/today` | staff |
| GET | `/staff-attendance/me/month` | staff |
| GET | `/staff-attendance/me/requests` | staff |
| POST | `/staff-attendance/me/requests` | staff |
| POST | `/staff-attendance/me/requests/:id/cancel` | staff |
| POST | `/staff-attendance/scan/preview` | staff |
| POST | `/staff-attendance/scan` | staff |
| GET | `/staff-attendance/overview` | view |
| GET | `/staff-attendance/report` | view |
| GET | `/staff-attendance/report/export` | view |
| GET | `/staff-attendance/users/:userId/days/:date` | view |
| POST | `/staff-attendance/users/:userId/days/:date/corrections` | manage |
| GET | `/staff-attendance/requests` | view |
| POST | `/staff-attendance/requests/:id/decide` | manage |
| POST | `/staff-attendance/users/:userId/requests` | manage |
| GET | `/staff-attendance/schedules` | view |
| POST | `/staff-attendance/schedules/teachers/lessons` | manage |
| PUT | `/staff-attendance/schedules/:userId` | manage |
| GET | `/staff-attendance/exceptions` | view |
| PUT | `/staff-attendance/schedules/:userId/exceptions` | manage |
| DELETE | `/staff-attendance/exceptions/:id` | manage |
| GET | `/staff-attendance/holidays` | view |
| POST | `/staff-attendance/holidays` | manage |
| DELETE | `/staff-attendance/holidays/:id` | manage |

### /api/notifications  (`backend/src/routes/notification.routes.ts`)

Butun router uchun: `authenticate`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/notifications` | — (router darajasi / servisda) |
| GET | `/notifications/summary` | — (router darajasi / servisda) |
| GET | `/notifications/settings` | — (router darajasi / servisda) |
| PUT | `/notifications/settings` | — (router darajasi / servisda) |
| PATCH | `/notifications/read-all` | — (router darajasi / servisda) |
| PATCH | `/notifications/:id/read` | — (router darajasi / servisda) |
| POST | `/notifications/:id/snooze` | — (router darajasi / servisda) |
| POST | `/notifications/:id/task` | requirePermission(TASK_CREATE) |
| DELETE | `/notifications/read` | — (router darajasi / servisda) |
| DELETE | `/notifications/:id` | — (router darajasi / servisda) |

### /api/audit-logs  (`backend/src/routes/audit.routes.ts`)

Butun router uchun: `authenticate, requirePermission(AUDIT_VIEW)`

| Metod | Yo'l | Yo'l darajasidagi himoya |
|---|---|---|
| GET | `/audit-logs/settings` | — (router darajasi / servisda) |
| PUT | `/audit-logs/settings` | requirePermission(SETTINGS_MANAGE) |
| GET | `/audit-logs` | — (router darajasi / servisda) |
| GET | `/audit-logs/filters` | — (router darajasi / servisda) |
| GET | `/audit-logs/export` | requirePermission(REPORT_EXPORT) |
