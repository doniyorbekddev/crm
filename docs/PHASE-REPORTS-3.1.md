# Academy CRM 3.1 — faza hisobotlari

> Format: `promt3.1.md` §53. Reja: [ROADMAP-3.1.md](ROADMAP-3.1.md), audit: [ACADEMY-3.1-AUDIT.md](ACADEMY-3.1-AUDIT.md).
> PHASE 0.5 (xavfsizlik hotfix) foydalanuvchi qarori bilan qilinmadi — S1 bandlari PHASE 7–9, S4 — PHASE 9, S2/S3 — PHASE 14 ichida yopiladi.

---

# ACADEMY CRM 3.1 — PHASE 1

Sana: 2026-09-25. GAP-01 "Markaz ma'lumotlari". Batafsil: [academy-settings.md](academy-settings.md).

## Implemented

- "Markaz ma'lumotlari" sahifasi: nom, logo, telefon, email, manzil, ish vaqti (7 kun), valyuta, o'quv yili, vaqt mintaqasi, standart til.
- Brend butun ilovada: menyu, kirish sahifasi, brauzer sarlavhasi va `<html lang>` sozlamadan (`useBranding`, `useBrandingSync`).
- Ochiq brend endpointi (kirishdan oldin) — faqat nom, logo, valyuta, til.
- Faqat OWNER va SUPER_ADMIN o'zgartiradi; har o'zgarish auditda (kim, oldingi/yangi, vaqt, IP, brauzer), muhim amal sifatida.

## Existing Code Reused

`Setting` modeli, `settings.manage` ruxsati (ADMIN'dan allaqachon chiqarilgan), `auditService.recordInTransaction` (audit sozlamalari naqshi), `detectFileType`/`saveFile`/`removeStoredFile`, `uploadBody`, `sendStoredFile` (ixtiyoriy kesh parametri qo'shildi), `phoneSchema`/`emailSchema`/`optionalField`, `PermissionGate`, `usePermission` menyu filtri.

## New Files

Backend: `validators/academySettings.validator.ts`, `services/academySettings.service.ts`, `controllers/academySettings.controller.ts`, `routes/settings.routes.ts`, `tests/academySettings.test.ts`.
Frontend: `types/settings.ts`, `services/academySettings.service.ts`, `hooks/useBranding.ts`, `pages/settings/AcademySettingsPage(.test).tsx`, `components/BrandMark.test.tsx`.
E2E: `e2e/specs/settings.spec.ts`. Docs: `academy-settings.md`, ushbu hisobot.

## Modified Files

Backend: `routes/index.ts`, `config/auditLabels.ts`, `utils/sendStoredFile.ts`, `tests/endpointSecurity.test.ts` (ochiq ro'yxatga 2 endpoint sabab bilan).
Frontend: `App.tsx`, `components/BrandMark.tsx`, `hooks/useDocumentTitle.ts`, `lib/queryKeys.ts`, `layouts/navigation.ts`, `routes/index.tsx`.

## Database Changes

Yo'q — `Setting` kaliti `academy.profile` (Json). Migratsiya kerak bo'lmadi.

## API Changes

Yangi: `GET/PUT /api/settings/academy`, `POST/DELETE /api/settings/academy/logo` (`settings.manage`); `GET /api/public/branding`, `GET /api/public/branding/logo` (ochiq). Mavjud API o'zgarmadi.

## Telegram Changes

Yo'q.

## Permissions

Yangi ruxsat yo'q. `settings.manage` = OWNER + SUPER_ADMIN (TZ dagi DIRECTOR — tizimda OWNER "Direktor").

## Security

- ADMIN, TEACHER, SALES_MANAGER, CALL_CENTER, ACCOUNTANT — GET/PUT/logo 403 (test); tokensiz 401.
- Qat'iy sxema: noma'lum maydon (masalan `logo.path`) — 422, fayl yo'li foydalanuvchidan olinmaydi.
- Logo turi baytlar bo'yicha (PDF va matn rad), 2 MB chegara; eski fayl o'chiriladi.
- Ochiq endpoint telefon/manzil/email qaytarmaydi (test).
- Bazadagi buzilgan qiymat ilovani yiqitmaydi (test).

## Tests

Backend **799/799** (+6), frontend **111/111** (+6), E2E **33/33** (+1). TypeScript, lint (0 xato, frontendda 1 eski ogohlantirish), build (backend + frontend) — o'tdi.

## Performance

Brend so'rovi bitta `findUnique`, frontendda 10 daqiqa kesh; logo versiyalangan URL bilan 1 kun keshlanadi.

## Documentation

`docs/academy-settings.md`.

## Known Issues

- Valyuta — faqat UZS, til — faqat o'zbek: summalar/to'lov qoidalari so'mga bog'langan, interfeys o'zbekcha. Boshqasini "yoqilgan" deb ko'rsatish soxta funksiya bo'lardi.
- Vaqt mintaqasi faqat ko'rsatiladi; hisob-kitoblar `APP_UTC_OFFSET_MINUTES` bo'yicha (o'tgan hisobotlar sanasi siljimasligi uchun).
- Seed'dagi `admin@example.com` — SUPER_ADMIN (sozlamalarga ruxsati bor); oddiy ADMIN roli rad etiladi.

## Next Phase

**PHASE 2 — Badge creation (GAP-02)**: `POST /gamification/badges`, `category`, `REFERRAL` qoidasi (migratsiya), dublikat nazorati, yaratish oynasi.

---

# ACADEMY CRM 3.1 — PHASE 2

Sana: 2026-09-25. GAP-02 "Badge creation". Batafsil: [badges.md](badges.md).

## Implemented

- Admin (`gamification.manage`) yangi nishon yaratadi: belgi, nom, tavsif, XP mukofoti, toifa, talab (+ chegara), faol.
- Dublikat nom (katta-kichik harf farqsiz) va bir xil avtomatik talab (qoida + chegara) — **400** (TZ bo'yicha).
- Yangi talab turi **REFERRAL**: taklif qilingan do'st o'quvchi bo'lganda nishon darhol.
- **COURSE_COMPLETED** endi holat "Tugatdi/Bitirdi" bo'lganda darhol (oldin keyingi davomat/vazifagacha kechikardi).
- Toifalar (Davomat, O'qish, Faollik, Ijtimoiy, Maxsus); tahrirlashda toifa, chegara qoida oralig'ida tekshiriladi.

## Existing Code Reused

`evaluateBadges`/`badgeEarned` (qoida mantig'i, dedupe, XP), `recalculateProfile`, `auditService.recordInTransaction`, `referralService.onLeadConverted`, `studentService.setStatus`, `GamificationSettings` ro'yxati, `Modal`/`FormField`.

## New Files

Backend: migratsiya `20260927100000_badge_category_referral`, `tests/badgeCreation.test.ts`. Frontend: `pages/gamification/BadgeFormModal(.test).tsx`. E2E: `e2e/specs/badges.spec.ts`. Docs: `badges.md`.

## Modified Files

Backend: `schema.prisma`, `prisma/academySeed.ts` (toifa), `validators/gamification.validator.ts` (`createBadgeSchema`, `BADGE_THRESHOLD_RANGE`, update'da `category`), `services/gamification.service.ts` (`createBadge`, `onMilestone`, REFERRAL, nom tekshiruvi), `controllers/gamification.controller.ts`, `routes/gamification.routes.ts`, `services/referral.service.ts`, `services/student.service.ts`, `config/auditLabels.ts`.
Frontend: `types/gamification.ts`, `utils/gamificationLabels.ts`, `services/gamification.service.ts`, `pages/gamification/GamificationSettings.tsx`.

## Database Changes

(oldin `pg_dump`) `enum BadgeCategory`, `BadgeRule` + `REFERRAL`, `badges.category` NOT NULL DEFAULT `SPECIAL`; mavjud nishonlar qoidasiga qarab `UPDATE` bilan toifalandi (DROP/DELETE/`now()` yo'q). Dev va test bazalarida qo'llandi, natija tekshirildi (9 nishon).

## API Changes

Yangi: `POST /api/gamification/badges` (201). `PUT /badges/:id` — ixtiyoriy `category`, chegara qoida oralig'ida (422), band nom (400). `BadgeDto` + `category`.

## Telegram Changes

Yo'q.

## Permissions

Yangi yo'q — `gamification.manage` (o'qituvchi, buxgalter, sotuv — 403, test).

## Security

Qat'iy sxema (kalit/ID foydalanuvchidan olinmaydi — `key` maydoni 422), audit `gamification.badge_created` (to'liq qiymat), nishon bir o'quvchiga bir marta (unikal), XP dedupe.

## Tests

Backend **805** (+6; to'liq yurishda 804 o'tdi, `paymentSchedule.test.ts` bitta testi mashina yuklamasida 5 s limitdan oshdi — alohida 4/4 o'tadi, bu fazaga aloqasiz), frontend **114/114** (+3), E2E **34/34** (+1). TypeScript, lint (0 xato), build — o'tdi.

## Performance

Yaratish — 3 ta indeksli so'rov + tranzaksiya. REFERRAL tekshiruvi `referrals(referrerStudentId, status)` indeksidan foydalanadi.

## Documentation

`docs/badges.md` (TZ talab nomlari → tizim qoidalari xaritasi).

## Known Issues

- Yangi avtomatik nishon talabga allaqachon javob beradigan o'quvchilarga keyingi voqeada yoki "Qayta hisoblash" bilan beriladi (yaratishda butun bazani skanerlamaslik uchun).
- Nishonni o'chirish yo'q (berilganlar tarixi saqlanadi) — "Faol" belgisini olib tashlash yetarli.

## Next Phase

**PHASE 3 — Column visibility (GAP-03)**: jadval ustunlarini ko'rsatish/yashirish/tartib/kenglik/tiklash, har foydalanuvchi uchun saqlash (`UserPreference`).
