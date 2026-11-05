# 05 — Test rejasi va qamrov

Har o'zgarishdan keyin to'liq regressiya: backend vitest (integratsion, test bazasi), frontend vitest + `tsc`, eslint, Playwright E2E.

| Qabul mezoni (spetsifikatsiya §12) | Testlar (`backend/tests`, `frontend/src`, `e2e/specs`) |
|---|---|
| CEO barcha modullarni ko'radi; xodim — faqat o'z ruxsatidagini | `orgOverview.test.ts`, `roles.test.ts`, `endpointSecurity.test.ts`, `securityAudit.test.ts`, `roleDashboard.test.ts` |
| QR noto'g'ri / takroriy yozuvni oldini oladi | `staffAttendance.test.ts` (eskirgan, begona, ikki marta ishlatilgan QR, parallel so'rovlar, replay) |
| Avtomatik davomat | `staffAutoAttendance.test.ts` (08:00/17:30, QR ustun, bekor qilingan yozuv qaytmaydi, bayram/ruxsat, dars bekor, ommaviy qo'llash) |
| Vazifalar va muddatlar | `tasks.test.ts`, `taskEvidence.test.ts`, `telegramTasks.test.ts`, `frontend/src/pages/tasks/*.test.tsx` |
| KPI tekshiriladigan | `payrollKpi.test.ts`, `telegramTeacherKpi.test.ts`, `orgPerformance.test.ts` |
| Maosh tasdiqlash jarayoni | `payroll.test.ts`, `historicalData.test.ts` (tasdiqlangan maosh o'zgarmaydi) |
| Aktiv berish tarixi, offboarding kirishni bekor qiladi | `orgOperations.test.ts` |
| Audit log | `audit.test.ts`, `auditRetention.test.ts` va har modul testidagi audit tekshiruvlari |
| Telegram xatoga chidamli | `notifications.test.ts`, `notificationEvents.test.ts` |
| Umumiy kalendar | `orgCalendar.test.ts`, `frontend/src/pages/org/teamCalendar.test.tsx` |
| Boshqaruv xulosasi | `tests/unit/managementSummary.test.ts`, `orgOverview.test.ts` |
| Mavjud CRM regressiyasi | butun to'plam + E2E (73 stsenariy) |

So'nggi natijalar va raqamlar — 08-CHANGELOG.
