# ORG SYSTEM — Phase 0: API xaritasi

Sana: 2026-11-06, `main` = `9dbb232`. Manba: `backend/src/routes/*.routes.ts`, router ulanishi — `routes/index.ts:99-121`.
Har yo'l uchun himoya darajasi bilan to'liq jadval: [02-API-MAP.md](02-API-MAP.md).

**Umumiy qoidalar** (spetsifikatsiya §7, oxiri):

| Talab | Holat | Dalil |
|---|---|---|
| Autentifikatsiya | ✅ | `authenticate` har router boshida |
| Ruxsat | ✅ | `requirePermission` / `requireAnyPermission` / `requireStaff`; doira servisda. Ruxsatsiz ochiq yo'llar `tests/endpointSecurity.test.ts` dagi ro'yxatda izoh bilan turadi |
| Validatsiya | ✅ | Zod: `backend/src/validators/` |
| Xato formati | ✅ | `AppError` + `middleware/errorHandler.ts` |
| Audit | ✅ | `auditService.record` / `recordInTransaction` |
| Cheklov | ✅ | `apiLimiter` (`app.ts:81`), `authLimiter` (`auth.routes.ts:18`) |

## Spetsifikatsiya §7 ↔ haqiqiy endpointlar

| Taklif qilingan | Haqiqiy | Fayl |
|---|---|---|
| `/api/organization/overview` | `GET /api/org/overview` (+ `summary` — boshqaruv xulosasi) | `org.routes.ts` |
| `/api/employees`, `/:id` | `GET/POST /api/employees`, `GET/PUT /api/employees/:id` | `employee.routes.ts` |
| `/api/employees/:id/history` | `GET /api/org/employees/:id/history`, `GET /api/org/users/:id/history` (o'qituvchi) | `org.routes.ts` |
| `/api/employees/:id/offboarding` | `POST /api/org/checklists` (kind=OFFBOARDING), `…/:id/handover`, `…/:id/revoke-access`, `…/:id/complete` | `org.routes.ts` |
| `/api/departments` | `GET/POST /api/org/departments`, `PUT /api/org/departments/:id`, `GET /api/org/departments/spending` | `org.routes.ts` |
| `/api/positions` | `GET /api/org/positions`, `PATCH /api/org/positions/:key` | `org.routes.ts` |
| `/api/responsibilities` | `POST /api/org/positions/:key/responsibilities`, `PUT …/:id` | `org.routes.ts` |
| `/api/roles`, `/api/permissions` | `GET/POST/PUT/DELETE /api/roles`, `PUT /api/roles/:id/permissions`, `GET /api/permissions` | `role.routes.ts` |
| `/api/attendance/check-in`, `check-out`, `qr` | `POST /api/staff-attendance/qr` (ekran), `POST /api/staff-attendance/scan/preview`, `POST /api/staff-attendance/scan` | `staffAttendance.routes.ts` |
| `/api/attendance` | `GET /api/staff-attendance/me/today`, `/me/month`, `/overview`, `/users/:userId/days/:date`, `POST …/corrections` | `staffAttendance.routes.ts` |
| `/api/attendance/reports` | `GET /api/staff-attendance/report`, `/report/export` | `staffAttendance.routes.ts` |
| — jadval | `GET /api/staff-attendance/schedules`, `PUT /schedules/:userId`, `POST /schedules/teachers/lessons`, `/exceptions`, `/holidays` | `staffAttendance.routes.ts` |
| `/api/tasks`, `/:id` | `GET/POST /api/tasks`, `GET/PATCH /api/tasks/:id`, `POST /:id/assign`, `POST /:id/comments` | `task.routes.ts` |
| `/api/tasks/:id/status` | `PATCH /api/tasks/:id` (`status`, `note`, `evidence`) | `task.routes.ts`, `validators/task.validator.ts` |
| `/api/kpi/definitions`, `results` | `GET/POST /api/salaries/kpi`, `PUT /kpi/:id`, `POST /kpi/results`, `GET /kpi/preview`, `PUT /kpi/settings`, `PUT /kpi/pool/:id` | `teacher.routes.ts:63-` (`salaryRouter`) |
| `/api/kpi/reviews` | `GET/POST /api/org/performance/reviews`, `POST …/:id/approve`, `GET …/prefill`, `GET /performance/me` | `org.routes.ts` |
| `/api/payroll/periods`, `records`, `approve` | Umumiy jadval: `GET /api/payroll`, `/summary`, `/:id`, `POST /calculate`, `/adjustments`, `/adjustments/:id/void`, `/:id/submit`, `/:id/reject`, `/:id/approve`, `/:id/pay`, `/:id/unlock`. O'qituvchi davri: `GET /api/salaries/periods`, `POST /periods/:id/approve` va h.k. | `teacher.routes.ts:43` (`salaryRouter`), `:75` (`payrollRouter`) |
| `/api/leave-requests` (+ approve/reject) | `GET/POST /api/employees/leaves`, `POST /api/employees/leaves/:id/decide`; ruxsatlar: `POST /api/staff-attendance/me/requests`, `POST /requests/:id/decide` | `employee.routes.ts`, `staffAttendance.routes.ts` |
| `/api/complaints`, `/:id` | `GET/POST /api/org/complaints`, `GET /:id`, `POST /:id/assign`, `/status`, `/escalate`, `/comments`, `POST /complaints/appeal` | `org.routes.ts` |
| `/api/assets` (+ assign / return) | `GET/POST /api/org/assets`, `GET/PATCH /:id`, `POST /:id/events` (biriktirish, qaytarish, ko'chirish, ta'mir) | `org.routes.ts` |
| `/api/knowledge`, `/:id` | `GET/POST /api/org/knowledge`, `GET/PUT /:id`, `GET /:id/versions/:version`, `POST /:id/status`, `POST /:id/acknowledge` | `org.routes.ts` |
| `/api/career-paths` | `GET /api/org/performance/careers`, `GET/POST /promotions`, `POST /promotions/:id/decide` | `org.routes.ts` |
| `/api/reports` | `GET /api/reports/*`, `GET /api/finance/periods`, `POST /api/finance/periods/close` | `report.routes.ts`, `finance.routes.ts` |
| `/api/audit-logs` | `GET /api/audit-logs`, `/filters`, `/export`, `GET/PUT /settings` (faqat saqlash muddati) | `audit.routes.ts` |

## Spetsifikatsiyada yo'q, qo'shimcha ORG endpointlari

| Endpoint | Maqsad |
|---|---|
| `GET /api/org/calendar?month=YYYY-MM` | Umumiy kalendar (har xodimga ochiq, filial bo'yicha; sabablar — rahbarga) |
| `GET /api/org/structure`, `/people` | Tashkiliy tuzilma va xodimlar ro'yxati |
| `GET/POST /api/org/candidates`, `/:id/stage`, `/:id/hire` | Nomzodlar |
| `GET/POST /api/org/performance/awards` | Taqdirlash |
| `GET /api/discounts/requests`, `POST /:id/approve` | 5% dan yuqori chegirma tasdig'i (`discount.routes.ts`) |
| `GET /api/my-work` | Xodimning "Mening ishlarim" (vazifalar, tasdiqlar) |

## Farqlar (qaror talab qilmaydi)

- **Prefiks.** Spetsifikatsiya "loyiha standartiga moslashtiriladi" deydi. ORG modullari `/api/org/*` ostida jamlangan;
  davomat `/api/staff-attendance` da. O'quvchi davomati (`/api/attendance`) bilan aralashmasligi uchun shunday qilingan.
- **Holat o'zgarishi.** Alohida `/status` yo'li o'rniga `PATCH /api/tasks/:id`. Qoidalar `task.service.ts` da.
- **Maosh.** `teacher.routes.ts` dagi `salaryRouter` (`/api/salaries`) va `payrollRouter` (`/api/payroll`) xodimlarni
  ham qamraydi (`routes/index.ts:103`, `:107`).
