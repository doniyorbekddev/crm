# ORG SYSTEM — Phase 0: Kod auditi

Sana: 2026-11-06. Asos: `main` = `9dbb232` (production'da ham shu). Audit kodni o'qib yozilgan; har xulosa yonida fayl va qator.
Kod, schema va migratsiyalar bu audit davomida **o'zgartirilmagan**.

> **Muhim kontekst.** Bu Phase 0 hujjati implementatsiyadan *keyin* yakunlanmoqda: ORG tizimining 4 bosqichi 2026-11-03 da,
> qo'shimcha bandlar 2026-11-05 da deploy qilingan (`04-IMPLEMENTATION-ROADMAP.md`). Shuning uchun audit "nima bor" va
> "spetsifikatsiyadan nima qolgan"ni ko'rsatadi, qayta qurish rejasini emas.

Bog'liq fayllar: [DATABASE-MAP](ORG-SYSTEM-0-DATABASE-MAP.md) · [API-MAP](ORG-SYSTEM-0-API-MAP.md) ·
[RISK-REGISTER](ORG-SYSTEM-0-RISK-REGISTER.md) · [IMPLEMENTATION-PLAN](ORG-SYSTEM-0-IMPLEMENTATION-PLAN.md).

---

## 1. Hozirgi CRM arxitekturasi

| Qatlam | Nima | Dalil |
|---|---|---|
| Monorepo | `backend/`, `frontend/`, `e2e/`, `deploy/`, `scripts/` | repo ildizi |
| Backend | Express 5, Prisma 7, Zod 4, pino, helmet, express-rate-limit, bcryptjs, jsonwebtoken | `backend/package.json` |
| Ma'lumotlar bazasi | PostgreSQL 17 (Docker), **145 model, 105 enum**, 5304 qatorli schema, **83 migratsiya** | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` |
| API | `/api` ostida 60+ router; `routes → controllers → services`; xato formati `AppError` | `backend/src/app.ts:81`, `backend/src/routes/index.ts:99-121` |
| Servislar | 148 fayl; ORG — `services/org/` (13 fayl), davomat — `services/staffAttendance/` (7 fayl) | `backend/src/services/` |
| Fon vazifalari | 22 job, har biri `withJobLease` bilan (bir nechta nusxada takrorlanmaydi) | `backend/src/jobs/*.job.ts`, `jobs/jobLease.ts` |
| Telegram | Bot (webhook) + yetkazish navbati (outbox, qayta urinish) | `backend/src/telegram/`, `jobs/notificationDelivery.job.ts`, schema `NotificationDelivery` (1478) |
| Frontend | React 19, Vite, Tailwind, React Router, TanStack Query; 97 sahifa | `frontend/src/pages/`, `frontend/src/routes/index.tsx` |
| Testlar | Backend 176 fayl (1176 test), frontend 89 fayl (315 test), E2E 30 spec | `backend/tests/`, `frontend/src/**/*.test.tsx`, `e2e/` |
| Deploy | Docker Compose; `deploy/deploy.sh` — backup → migratsiya → health → avtomatik rollback | `deploy/deploy.sh:107`, `docker-compose.prod.yml` |

**Autentifikatsiya.** Access token `Authorization: Bearer` sarlavhasida keladi (`middleware/authenticate.ts:24`).
Har so'rovda foydalanuvchi bazadan o'qiladi va `ACTIVE` bo'lmasa rad etiladi (`authenticate.ts:30-47`). Shu sabab
bloklangan xodim token muddatini kutmasdan darhol chiqariladi. 2FA (TOTP) bor: `User.totpSecret` (schema 268).

---

## 2. Role & Permission tizimi qanday ishlaydi

1. **Yagona manba** — `backend/src/config/permissions.ts`:
   - `PERMISSIONS` — **116 ta** kalit, format `modul.amal` (`:6`);
   - `PERMISSION_DEFINITIONS` — tavsiflar (`:179`);
   - `ROLE_KEYS` — 10 ta tizim roli (`:377`);
   - `SYSTEM_ROLES` — standart ruxsatlar (`:469`).
2. **Bazada** — `Role` (schema 451), `Permission` (468: `key`, `module`, `description`), `RolePermission` (482: faqat
   `roleId + permissionId`, **scope ustuni yo'q**). CEO "Rollar" sahifasida rollarni o'zgartiradi.
3. **Tekshiruv serverda:**
   - `requirePermission(...)` — hammasi kerak; `requireAnyPermission(...)` — bittasi yetarli (`middleware/requirePermission.ts:7`, `:24`);
   - `requireStaff()` — kabinet hisoblarini (o'quvchi/ota-ona) to'sadi (`:42`).
4. **Kesh.** Rol ruxsatlari jarayon xotirasida keshlanadi, standart TTL 60 soniya (`services/permission.service.ts:10`).
   Rol o'zgarsa kesh darhol tozalanadi (`role.service.ts:190`, `:221`).
5. **Doira (scope) kodda, ruxsat jadvalida emas:**
   - filial doirasi — `getBranchAccess` / `branchFilter` (`services/branchAccess.ts:24`, `:38`), `branch.view_all` ruxsati bilan;
   - "hammasini ko'rish" — alohida kalitlar orqali (`lead.view_all` va h.k.);
   - "faqat o'ziniki" (o'z vazifasi, o'z davomati) — servis ichida.
6. **Production'ga moslash.** `prisma/syncPermissions.ts:10-14` yangi ruxsatlarni yaratadi va **faqat shu yurishda yangi
   paydo bo'lganlarini** rollarga qo'shadi. Qo'lda o'zgartirilgan rollarga tegmaydi. Natijada standart roldagi keyingi
   o'zgarish production'dagi mavjud rolga avtomatik o'tmaydi (R-03).
7. **Frontend** — `usePermission` faqat ko'rinish uchun (`frontend/src/hooks/usePermission.ts`). Sahifalar
   `PermissionGate` bilan yopiladi (`routes/index.tsx:177`, `:224`).

Spetsifikatsiya §5.7–5.8 bilan farqi: `Permission.action` alohida ustun emas (kalit ichida), `RolePermission.scope` yo'q.
Bu ataylab saqlangan: doira kodda markazlashgan va `endpointSecurity.test.ts` bilan tekshiriladi.

---

## 3. Mavjud modellar: qayta ishlatish / kengaytirish / yangi

To'liq solishtirish — [DATABASE-MAP](ORG-SYSTEM-0-DATABASE-MAP.md). Qisqasi:

**A. To'g'ridan-to'g'ri qayta ishlatiladi (o'zgartirishsiz):**
- `User` (254) — kirish akkaunti;
- `Role` / `Permission` / `RolePermission` (451–493);
- `Branch` (537) — spetsifikatsiyadagi "Organization" o'rnida;
- `AuditLog` (1681) — `before` / `after` / `ip` / `userAgent` bilan;
- `Notification` (1519), `NotificationDelivery` (1478);
- `TeacherSalaryPeriod` (2103) va `PayrollAdjustment` (3179) — payroll;
- `StaffWorkSchedule` (4361), `StaffAttendanceDay` / `Event` (4423 / 4453), `StaffQrToken` (4501) — davomat va QR;
- `Lesson` (894), `Room` (997) — o'qituvchi dars jadvali.

**B. Kengaytirilgan (faqat ustun qo'shilgan):**

| Model | Qo'shilgan ustunlar |
|---|---|
| `Employee` (3235) | `managerId`, `departmentId`, `probationEndDate` |
| `Task` (3955) | `expectedResult`, `submittedAt`, `evidenceRequired`, `completionEvidence`, `priority`, `source`, `escalatedAt` |
| `TaskStatus` (3942) | `IN_PROGRESS`, `REVIEW` |
| `EmployeePosition` (3206) | `RECEPTIONIST`, `MARKETING_MANAGER`, `CONTENT_CREATOR`, kelajakdagi lavozimlar |
| `TeacherProfile` (2049) | `probationEndDate`, `employmentStatus` |
| `StaffWorkSchedule` | `autoMark` |

**C. Yangi yaratilgan:**
- `Department` (4999), `Position` (5035), `PositionResponsibility` (5065), `EmploymentHistory` (5093);
- `Complaint` / `ComplaintEvent` (4595 / 4651), `DiscountRequest` (4669);
- `Candidate` / `CandidateEvent` (4713 / 4753), `HrChecklist` / `HrChecklistItem` (4781 / 4814);
- `Asset` / `AssetEvent` (4853 / 4891), `KnowledgeArticle` / `Version` / `Acknowledgement` (4929 / 4961 / …);
- `PerformanceReview` (5135), `StaffAward` (5187).

**D. Hali yo'q yoki faqat qisman bor** — spetsifikatsiya bilan farqlar, §5 va RISK-REGISTER'ga qarang:
- o'qituvchi uchun ta'til yozuvi: `EmployeeLeave` faqat `Employee`'ga bog'langan (3388);
- KPI natijalari tarixi saqlanmaydi: KPI har safar `kpi.service.ts` da qayta hisoblanadi, saqlanadigani faqat qo'lda
  kiritilgan natijalar (`KpiManualResult`, 3349);
- bo'lim doirasidagi ruxsat (`scope=department`) yo'q;
- Content Creator va Kassir uchun tizim roli yo'q: lavozim enum'da bor (3219), lekin `ROLE_KEYS` da yo'q (`permissions.ts:377`).

---

## 4. Allaqachon mavjud funksiyalar (master hujjat bo'limlari bo'yicha)

| Master § | Funksiya | Holat | Dalil |
|---|---|---|---|
| 2 Tuzilma | Bo'limlar, lavozimlar katalogi, rahbar, tuzilma sahifasi | ✅ | `services/org/structure.service.ts`, `catalog.service.ts`; `GET /api/org/structure` |
| 3.1 Qabul | Nomzodlar, bosqichlar, ishga olish | ✅ | `org.routes.ts` `/candidates/*`; `hr.service.ts` |
| 3.2 Sinov muddati | `probationEndDate`, eslatma | ✅ | schema 3255; `jobs/org.job.ts` |
| 3.3 Onboarding | Tizim tekshiradigan bandlari bor checklist | ✅ | `HrChecklist` 4781 |
| 3.4 Davomat | QR (60 s, bir martalik, faqat hash), avtomatik rejim, tuzatish tarixi | ✅ | `StaffQrToken` 4501; `services/staffAttendance/auto.service.ts` |
| 3.5 Ta'til / kelmaslik | `EmployeeLeave`, `StaffPermissionRequest`, umumiy kalendar | ✅ (o'qituvchi ta'tili — ⚠️) | schema 3388, 4520; `services/org/calendar.service.ts` |
| 3.7 Topshiriqlar | Holatlar, tekshiruv, kutilgan natija, dalil, eskalatsiya | ✅ | `task.service.ts`; `jobs/escalation.job.ts` |
| 3.8 Ichki aloqa | Telegram bildirishnomalari, kunlik xulosa | ✅ (chat yo'q) | `jobs/dailyDigest.job.ts` |
| 4 Vakolat | Ruxsatlar; 5% chegirma chegarasi, yuqorisi CEO tasdig'ida | ✅ | `permissions.ts:489-507`; `discountApproval.service.ts` |
| 5 KPI | Lavozim KPI, vazn = 100, qo'lda natija, choraklik baholash | ✅ (tarix — ⚠️) | `KpiDefinition` 3324; `PerformanceReview` 5135 |
| 6 Maosh | Hisoblash → tekshiruv → tasdiq → qulf → to'lov; bonus va jarima sabab bilan | ✅ | `SalaryPeriodStatus` 1772; `teacher.routes.ts` `/periods/:id/approve` |
| 7 Murojaatlar | Kiritish, yo'naltirish, eskalatsiya, maxfiylik | ✅ | `services/org/complaints.service.ts` |
| 8–9 O'quvchi / retention | Xavf baholash, retention job | ✅ (avvaldan bor) | `jobs/studentRisk.job.ts`, `jobs/retention.job.ts` |
| 10 Moliya | Bo'lim oylik limiti, xarajat tasdig'i, oyni yopish | ✅ | `Department.monthlyExpenseLimit`; `finance.routes.ts` `/periods/close` |
| 11 Aktivlar | Reyestr, biriktirish/qaytarish tarixi | ✅ | `Asset` 4853, `AssetEvent` 4891 |
| 12 Offboarding | Ishlarni topshirish, kirishni bekor qilish (bloklash + sessiyalar) | ✅ | `hr.service.ts:621` (`revokeAccess`) |
| 13 Karyera | Keyingi lavozim, talablar, minimal KPI va muddat, tasdiq | ✅ | `Position.nextPositionId` / `minimumKpiScore` (5035) |
| 14 Bilimlar bazasi | Versiyalar, tanishib chiqish belgisi | ✅ | `KnowledgeArticleVersion` 4961 |
| 15 CEO panel | Tashkilot paneli, boshqaruv xulosasi | ✅ | `services/org/overview.service.ts`, `managementSummary.ts` |
| 16 Kelajak rollari | Lavozimlar enum'da, vakant bo'lishi mumkin | ✅ (rol — ❌) | schema 3221-3223 |

---

## 5. Spetsifikatsiyadan qolgan bo'shliqlar

1. **O'qituvchi ta'tili.** `EmployeeLeave.employeeId` → `Employee` (3388). O'qituvchilar `TeacherProfile` (2049) da, ularning
   `Employee` yozuvi yo'q. Shu sabab o'qituvchi ta'tili hozir faqat ruxsat so'rovi orqali yoziladi (`ABSENCE`).
2. **KPI tarixi.** Natija har safar jonli ma'lumotdan hisoblanadi (`kpi.service.ts:220`). Maosh tasdiqlangach bonus
   maosh davrida muzlaydi, lekin KPI natijasining o'zi alohida saqlanmaydi.
3. **Scope ustuni.** `RolePermission.scope` (own / department / all) yo'q (schema 482). Bo'lim rahbari faqat o'z bo'limini
   ko'radigan holat hali qo'llab-quvvatlanmaydi.
4. **Rollar.** Content Creator va Reception/Cashier uchun spetsifikatsiya §8 dagi ruxsat to'plami yo'q.
   Hozirgi `RECEPTION` roli faqat QR ekran uchun (`permissions.ts:589-593`).
5. **Ikki "bo'lim" maydoni.** `Employee.department` (matn) va `departmentId` (katalog) birga yashaydi (schema 3243, 3259).
   Matn moslik uchun saqlanadi va katalogdan yangilanadi.
6. **OVERDUE holati.** Holat sifatida saqlanmaydi, hisoblanadi: `isTaskOverdue` (`task.service.ts:41`). Bu spetsifikatsiya §5.11
   ruxsat bergan variant.

Xavflar va ularning darajasi — [RISK-REGISTER](ORG-SYSTEM-0-RISK-REGISTER.md); integratsiya tartibi va qolgan ish —
[IMPLEMENTATION-PLAN](ORG-SYSTEM-0-IMPLEMENTATION-PLAN.md).
