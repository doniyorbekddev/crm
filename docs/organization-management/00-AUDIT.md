# 00 — Kod auditi (joriy holat)

Sana: 2026-11-05. Asos: `main` (`95806c9` + shu kungi o'zgarishlar). Audit kodni o'qib qilingan, hujjatga ishonib emas.

## Arxitektura
- **Monorepo:** `backend/` (Express 5, Prisma 7, PostgreSQL), `frontend/` (React 19, Vite, Tailwind 4, React Router 7,
  TanStack Query, react-hook-form, Zod), `e2e/` (Playwright). Docker Compose bilan deploy (`deploy/deploy.sh`).
- **API:** `backend/src/routes/*.routes.ts` → `controllers/` → `services/`; validatsiya — Zod (`validators/`), xato formati — `AppError`.
- **Autentifikatsiya:** JWT (access + refresh), 2FA, `authenticate` middleware; `requireStaff()` kabinet hisoblarini (o'quvchi/ota-ona) to'sadi.
- **Ruxsatlar:** `config/permissions.ts` (kalitlar, tizim rollari), `requirePermission`/`requireAnyPermission` — serverda; frontend
  `usePermission` faqat ko'rinish uchun.
- **Filial doirasi:** `branchAccess.ts` / `branchScope.ts` — har ro'yxat va hisobotda.
- **Audit:** `auditService.record/recordInTransaction` — muhim amallar; audit jurnali faqat o'qiladi.
- **Fon vazifalari:** `jobs/*.job.ts` + `withJobLease` (bir nechta nusxada takrorlanmaydi).
- **Telegram:** bot (webhook), bildirishnomalar navbati (`notificationDelivery.job.ts`).

## A. Qayta ishlatilgan
User/Role/Permission, Employee/TeacherProfile, Task, Notification + Telegram, AuditLog, maosh (TeacherSalaryPeriod), KPI, guruh dars jadvali.

## B. Kengaytirilgan
Task (holatlar, kutilgan natija, tekshiruv, dalil), Employee (lavozim, rahbar, sinov), xodim davomati (avtomatik rejim), Tashkilot paneli.

## C. Yangi yaratilgan
Department, Position(+Responsibility), EmploymentHistory, Complaint(+Event), Asset(+Event), KnowledgeArticle(+Version, Acknowledgement),
PerformanceReview, StaffAward, DiscountRequest, umumiy kalendar (yangi jadvalsiz), boshqaruv xulosasi (yangi jadvalsiz).

## D. Buzuvchi o'zgarishlar
Yo'q. Barcha migratsiyalar faqat qo'shadi; mavjud API kontraktlari saqlangan (yangi maydonlar ixtiyoriy).
Xulq o'zgargan joylar (foydalanuvchi qarori bilan): qarz = muddati kelgan oy majburiyatlari; avtomatik davomat yoqilgan xodimda vaqt
jadvaldan yoziladi (QR ustun).

## E. Xavfsiz migratsiya ketma-ketligi
`20261103100000_org_foundation` → `…110000_org_operations` → `…120000_org_structure_catalog` → `…130000_org_performance` →
`…140000_historical_snapshots` → `20261104090000_monthly_billing` → `20261105090000_staff_auto_attendance` → `20261105100000_task_evidence`.
2026-11-05 da eski (30-oktabr holatidagi) nusxaga hammasi ketma-ket qo'llanib tekshirildi — 07-DEPLOYMENT-GUIDE.

## Risklar
06-SECURITY-REVIEW va [../ORG-SYSTEM.md](../ORG-SYSTEM.md) §4 (ataylab qilinmaganlar).
