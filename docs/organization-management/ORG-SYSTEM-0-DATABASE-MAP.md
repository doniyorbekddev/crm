# ORG SYSTEM — Phase 0: Ma'lumotlar bazasi xaritasi

Sana: 2026-11-06, `main` = `9dbb232`. Manba: `backend/prisma/schema.prisma`. Qavs ichidagi raqam — model boshlanadigan qator.
Barcha modellar va bog'lanishlarning to'liq ro'yxati: [01-DATABASE-MAP.md](01-DATABASE-MAP.md).

Belgilar: **Q** — qayta ishlatiladi; **K** — kengaytirilgan; **Y** — yangi yaratilgan; **⚠️** — qisman mos.

## 1. Spetsifikatsiya §5 ↔ haqiqiy modellar

| Spetsifikatsiya modeli | Haqiqiy model (qator) | Turi | Izoh / farq |
|---|---|---|---|
| 5.1 Organization | `Branch` (537) | Q | Alohida "Organization" jadvali kerak emas. Barcha ORG yozuvlarida `branchId` bor (masalan `Asset.branchId`, `Department.branchId`) |
| 5.2 Department | `Department` (4999) | Y | `parentId`, `headUserId`, `monthlyExpenseLimit`. Spetsifikatsiyadagi `managerEmployeeId` o'rnida `headUserId` (User) ishlatiladi |
| 5.3 Position | `Position` (5035) | Y | `key` — `EmployeePosition` qiymati yoki `"TEACHER"`. KPI va maosh shu kalitga bog'liq |
| 5.4 Employee | `Employee` (3235) + `TeacherProfile` (2049) + `User` (254) | K ⚠️ | HR profili ikki jadvalda: o'qituvchidan tashqari xodimlar `Employee` da, o'qituvchilar `TeacherProfile` da. Ikkalasi ham ixtiyoriy ravishda `User` ga bog'lanadi (`Employee.userId` — ixtiyoriy, `TeacherProfile.userId` — majburiy) |
| 5.5 EmploymentHistory | `EmploymentHistory` (5093) | Y | O'zgarmas, `approvedBy` bilan. `employeeId` yoki `userId` (o'qituvchi uchun) |
| 5.6 Responsibility | `PositionResponsibility` (5065) | Y | — |
| 5.7 Permission | `Permission` (468) | Q | `action` alohida ustun emas, kalit ichida (`payment.refund`) |
| 5.8 RolePermission | `RolePermission` (482) | Q ⚠️ | **`scope` yo'q**. Doira kodda: `services/branchAccess.ts`, `*.view_all` kalitlari |
| 5.9 Attendance | `StaffAttendanceDay` (4423) + `StaffAttendanceEvent` (4453) + `StaffAttendanceCorrection` (4482) | Q/K | Hodisalar o'zgarmaydi (`voidedAt`). Manba: QR, qo'lda, `AUTO` |
| — QR | `StaffQrToken` (4501) | Q | Faqat SHA-256 hash, qisqa muddatli, bir martalik |
| 5.10 WorkSchedule | `StaffWorkSchedule` (4361) + `StaffScheduleException` (4404) + `StaffHoliday` (4393) | K | Versiyalangan (`effectiveFrom`), `autoMark`. O'qituvchi jadvali `Lesson` (894) dan olinadi |
| 5.11 Task | `Task` (3955) + `TaskComment` (4234) + `TaskAssignment` (4249) | K | `OVERDUE` saqlanmaydi, hisoblanadi (`task.service.ts:41`). `startDate` yo'q |
| 5.12 LeaveRequest | `EmployeeLeave` (3388) + `StaffPermissionRequest` (4520) | Q ⚠️ | `EmployeeLeave` faqat `Employee` ga bog'langan, o'qituvchilarga emas |
| 5.13 Complaint | `Complaint` (4595) + `ComplaintEvent` (4651) | Y | Maxfiylik, eskalatsiya, o'zgarmas tarix |
| 5.14 KpiDefinition | `KpiDefinition` (3324) | Q | Lavozim enum'iga bog'langan (`position`), `positionId` ga emas |
| 5.14 KpiResult | `KpiManualResult` (3349) + `PerformanceReview` (5135) | ⚠️ | Avtomatik KPI natijasi saqlanmaydi, har safar hisoblanadi. Faqat qo'lda kiritilganlari va choraklik baholash saqlanadi |
| 5.15 PayrollPeriod / PayrollRecord | `TeacherSalaryPeriod` (2103) | Q | Nomiga qaramay xodimlarni ham qamraydi (`teacherProfileId` XOR `employeeId`, bazada CHECK). Holatlar: `SalaryPeriodStatus` (1772) |
| 5.15 PayrollComponent | `TeacherSalaryRule` (2076) + `Employee.baseSalary` / `kpiBonusPool` + `PayrollAdjustment` (3179) | Q | Bonus va jarima sabab bilan, tasdiqlanadi, bekor qilinadi (`voidedAt`) |
| — Maosh to'lovi | `TeacherSalaryPayment` (2169) | Q | — |
| 5.16 Asset | `Asset` (4853) | Y | `inventoryNumber`, `responsibleId`, `roomId`, `condition` |
| 5.17 AssetAssignment | `AssetEvent` (4891) | Y | Alohida jadval o'rniga voqealar tarixi (biriktirish, qaytarish, ko'chirish, ta'mir) |
| 5.18 KnowledgeArticle | `KnowledgeArticle` (4929) + `KnowledgeArticleVersion` (4961) + `KnowledgeAcknowledgement` (4979) | Y | Versiyalar o'zgarmas |
| 5.19 CareerPath | `Position.nextPositionId`, `careerRequirements`, `minimumKpiScore`, `minimumMonths` | Y | Alohida jadval kerak emas: har lavozimda bitta keyingi bosqich |
| 5.20 AuditLog | `AuditLog` (1681) | Q | `before`, `after`, `metadata`, `ip`, `userAgent`. API orqali o'zgartirib yoki o'chirib bo'lmaydi |

## 2. Spetsifikatsiyada yo'q, lekin ORG uchun qo'shilgan

| Model (qator) | Nima uchun |
|---|---|
| `DiscountRequest` (4669) | 5% dan yuqori chegirma — CEO tasdig'i (master §2.2) |
| `Candidate` (4713), `CandidateEvent` (4753) | Ishga qabul (master §3.1) |
| `HrChecklist` (4781), `HrChecklistItem` (4814) | Onboarding va offboarding (master §3.3, §12) |
| `StaffAward` (5187) | Taqdirlash → maosh bonusi (master §6.2) |
| `Budget` (2391), `ExpenseCategory` (2280), `Expense` (2329) | Moliya (avvaldan bor). `Expense.departmentId` (2349) bo'lim limiti uchun |

## 3. Bog'lanishlar (spetsifikatsiya §6 bo'yicha tekshiruv)

| Talab | Bajarilishi |
|---|---|
| Department → many Positions | `Position.departmentId` ✅ |
| Position → many Employees | Bevosita FK emas: `Employee.position` (enum) = `Position.key` ⚠️ |
| Employee → Attendance | `StaffAttendanceDay.userId` → `User` ✅. Davomat **User** bo'yicha, shuning uchun CRM hisobi yo'q xodimning davomati yo'q |
| Employee → Tasks | `Task.assigneeId` → `User` ✅ (xuddi shunday) |
| Employee → KPI Results | Hisoblanadi, saqlanmaydi ⚠️ |
| Employee → Payroll Records | `TeacherSalaryPeriod.employeeId` / `teacherProfileId` ✅ |
| Employee → Leave Requests | `EmployeeLeave.employeeId` ✅. O'qituvchi uchun — yo'q ⚠️ |
| Employee ↔ Assets | `Asset.responsibleId` → `User` + `AssetEvent` tarixi ✅ |
| Position → Responsibilities | `PositionResponsibility.positionId` ✅ |
| Role ↔ Permissions | `RolePermission` ✅ |
| Kelajakdagi filiallar | `branchId` barcha ORG jadvallarida ✅ |

## 4. Migratsiyalar (ORG bilan bog'liq, ketma-ket)

Hammasi faqat qo'shadi, hech biri ustun yoki jadval o'chirmaydi:

`20261103100000_org_foundation` → `20261103110000_org_operations` → `20261103120000_org_structure_catalog` →
`20261103130000_org_performance` → `20261103140000_historical_snapshots` → `20261104090000_monthly_billing` →
`20261105090000_staff_auto_attendance` → `20261105100000_task_evidence`.

Lokal sinov (2026-11-05): ushbu 8 ta migratsiya 30-oktabr holatidagi nusxaga qo'llandi, ma'lumotlar soni o'zgarmadi.
Batafsil — [07-DEPLOYMENT-GUIDE.md](07-DEPLOYMENT-GUIDE.md).
