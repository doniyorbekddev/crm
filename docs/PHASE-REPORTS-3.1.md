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

---

# ACADEMY CRM 3.1 — PHASE 3

Sana: 2026-09-25. GAP-03 "Table column visibility". Batafsil: [table-columns.md](table-columns.md).

## Implemented

- "Ustunlar" oynasi 8 ta asosiy jadvalda (o'quvchilar, leadlar, to'lovlar, qarzdorlar, guruhlar, ota-onalar, o'qituvchilar, xodimlar): ko'rsatish/yashirish, tartib (yuqoriga/pastga), kenglik (Avto/Tor/O'rta/Keng), "Standart holat".
- Har xodim uchun profilda saqlanadi (table, column, visible, order = massiv tartibi, width), optimistik yangilanish.
- Majburiy ustun (qator egasi) yashirilmaydi; amallar ustuni sozlanmaydi, doim oxirida; yangi/olib tashlangan ustunlar saqlangan sozlamani buzmaydi.

## Existing Code Reused

`UserPreference` + `PUT /auth/me/preferences/:key` (qat'iy whitelist), `usePreference` (optimistik saqlash), `Table`/`TH`/`TD`, `Modal` (fokus tutqichi), `Checkbox`, `Select`. Jadval kataklari **o'zgarishsiz** ustun ta'riflariga ko'chirildi (skript bilan) — ko'rinish va E2E tanlagichlari saqlandi.

## New Files

Frontend: `utils/tableColumns(.test).ts`, `hooks/useTableColumns.ts`, `components/ColumnSettings(.test).tsx`, `components/ui/ColumnTable.tsx`. E2E: `e2e/specs/columns.spec.ts`. Docs: `table-columns.md`.

## Modified Files

Backend: `validators/preference.validator.ts` (`table.<nom>.columns`, 8 ta jadval), `tests/preferences.test.ts`.
Frontend: `services/preferences.service.ts`, `pages/students/StudentsPage.tsx`, `leads/LeadsTable.tsx`, `payments/PaymentsPage.tsx`, `debts/DebtsPage.tsx`, `groups/GroupsPage.tsx`, `parents/ParentsPage.tsx`, `teachers/TeachersPage.tsx`, `employees/EmployeesPage.tsx`.

## Database Changes

Yo'q (`UserPreference` Json qiymati).

## API Changes

Yangi endpoint yo'q; `PUT /api/auth/me/preferences/:key` 8 ta yangi kalitni qabul qiladi (qat'iy sxema).

## Telegram Changes

Yo'q.

## Permissions

Yo'q — sozlama har xodimning o'ziga (autentifikatsiya yetarli, endpoint allaqachon `endpointSecurity` inventarida).

## Security

- **Faqat ko'rinish**: API javobi va ruxsatlar sozlamaga bog'liq emas (test: sozlama saqlagan o'qituvchi `/api/payments` — 403).
- Qat'iy sxema: kalit formati, takror, kenglik 60–640, ≤ 40 ustun, qo'shimcha maydon, ro'yxatda yo'q jadval — 422 (test).
- Xodim boshqa xodim sozlamasini o'qimaydi/yozmaydi (test).

## Tests

Backend **806** (+1; to'liq yurishda 805 o'tdi — `broadcast.test.ts` bitta testi mashina yuklamasida 5 s limitdan oshdi, alohida 5/5 o'tadi, fazaga aloqasiz), frontend **119/119** (+5), E2E **35/35** (+1; o'zgartirilgan jadvallarga tayangan mavjud E2E ham o'tdi). TypeScript, lint (0 xato), build — o'tdi.

## Performance

Sozlamalar bitta so'rov (`staleTime: Infinity`), ustunlar `useMemo` bilan hisoblanadi; server tomonda qo'shimcha yuk yo'q.

## Documentation

`docs/table-columns.md` (yangi jadval qo'shish yo'riqnomasi bilan).

## Known Issues

- Kenglik tayyor variantlardan tanlanadi (sichqoncha bilan sudrab o'zgartirish yo'q) — mobil va klaviatura uchun qulayroq.
- Boshqa jadvallar (maosh, hisobotlar, moliya tablari) hali eski ko'rinishda — `table-columns.md` dagi yo'riqnoma bilan bir xil usulda qo'shiladi.

## Next Phase

**PHASE 4 — Business overview filters (GAP-04)**: allaqachon bajarilgan (audit); "O'tgan yil" preseti, kalendar yili oralig'i va regressiya testlari.

---

# ACADEMY CRM 3.1 — PHASE 4

Sana: 2026-09-25. GAP-04 "Business overview date filters".

## Implemented

- Audit tasdiqladi: TZ davrlari (Bugun, Kecha, Shu/O'tgan hafta, Shu/O'tgan oy, Shu yil, Oraliq) 3.0 dan beri direktor panelida; `from > to` rad etiladi; oldingi davr bilan solishtirish ishlaydi.
- Qo'shildi: **"O'tgan yil"** davri (to'liq kalendar yili, kabisa yili ham) — umumiy davr tanlagichi orqali direktor paneli, moliya, analitika, hisobotlar va faoliyat sahifalarida.
- Regressiya testlari: bir kunlik oraliq, butun yil (365) va kabisa yili (366), bir yildan uzun oraliq rad, oldingi teng davr, mavjud oy tanlovi.

## Existing Code Reused

`resolveDateRange`/`STANDARD_PRESETS`, `DateRangePicker`, `executiveService.resolvePeriod` (oldingi teng oraliq), `executiveQuerySchema` (tartib va ≤ 366 kun) — backend o'zgarmadi.

## New Files

E2E: `e2e/specs/dateFilters.spec.ts`.

## Modified Files

Frontend: `utils/dateRange.ts` (+`last_year`), `utils/dateRange.test.ts`, `pages/dashboard/ExecutivePage.tsx` (preset ro'yxati). Backend: `tests/executiveInsights.test.ts` (+1 regressiya testi).

## Database Changes

Yo'q.

## API Changes

Yo'q — mavjud `?from&to` (≤ 366 kun) butun kalendar yilini qabul qiladi.

## Telegram Changes

Yo'q.

## Permissions

Yo'q.

## Security

Yo'q (faqat davr hisoblash).

## Tests

Backend **807/807** (+1), frontend **120/120** (+1), E2E **36/36** (+1). TypeScript, lint (0 xato), build — o'tdi.

## Performance

O'zgarmadi (bir yillik oraliq mavjud chegarada).

## Documentation

Ushbu hisobot.

## Known Issues

- Noto'g'ri oraliq — **422** (TZ 400 deydi): loyihadagi barcha validatsiya xatolari 422 (audit qarori #2), bittasini o'zgartirish konventsiyani buzadi.

## Next Phase

**PHASE 5 — Assessment final audit (GAP-05)**: bir guruhdagi B o'quvchi A urinishiga kira olmasligi va savol/variant tartibi aralashishi testlari; xodim yo'lida `Math.random` saralashi va jonli bank bo'yicha baholash (S7).

---

# ACADEMY CRM 3.1 — PHASE 5

Sana: 2026-09-25. GAP-05 "Assessment 2.0 final audit". Batafsil: [assessment.md](assessment.md) §4.

## Implemented

- Audit: savollar banki, qiyinlik, mavzu, blueprint, tasodifiy tanlash, har o'quvchiga variant, snapshot, savol va variant tartibi, server taymeri, urinishlar, avto va qo'lda baholash — kabinet yo'lida bajarilgan (mavjud testlar bilan).
- **Tuzatildi (S7, xodim yo'li):**
  - xodim qo'lda kiritgan natija endi snapshot bilan muzlatiladi (oldin bank tahriridan keyin tekshiruv oynasi yangi matnni ko'rsatardi);
  - kabinetda boshlangan urinishni xodim yopsa — o'quvchining varianti va boshlangandagi kalit bo'yicha baholanadi (oldin jonli bank: kalit o'zgargan bo'lsa to'g'ri javob 0 ball); variantda yo'q savol — 422;
  - tasodifiy savol biriktirish `sort(Math.random)` o'rniga kriptografik Fisher–Yates (`examBlueprint.shuffle`);
  - tekshiruv oynasida mavzu nomi ham snapshot'dan.
- Yangi testlar: bir guruhdagi B → A urinishi (ko'rish, javob, fayl, topshirish) — 404; savol/variant tartibi har o'quvchida aralashadi, to'plam bir xil.

## Existing Code Reused

`AttemptQuestion` snapshot modeli va shakli (kabinet `start` bilan bir xil), `gradeAnswer`, `AnswerKey`, `examBlueprint.shuffle`, `toAttemptDto` (snapshot ustuvor). Exam engine qayta yozilmadi — faqat xodim `submit` baholash manbai snapshot'ga o'tkazildi.

## New Files

`backend/tests/assessmentFinal.test.ts`.

## Modified Files

`backend/src/services/examAttempt.service.ts`, `docs/assessment.md`.

## Database Changes

Yo'q (mavjud `attempt_questions` jadvaliga xodim urinishlari uchun ham yoziladi).

## API Changes

Javob shakli o'zgarmadi. `POST /exams/:id/attempts/:studentId`: ochiq urinish variantida yo'q savolga javob — 422 (yangi, to'g'rilik uchun).

## Telegram Changes

Yo'q (bot kabinet `examTakingService` dan foydalanadi — allaqachon snapshot bilan).

## Permissions

Yo'q.

## Security

Egalik: urinish `{ id, studentId }` bilan — bir guruhdagi boshqa o'quvchi ham 404 (test). Javob faqat urinish snapshot'idagi variant id lari bilan (mavjud test). Baholash manbai endi hamma yo'lda muzlatilgan kalit — keyingi tahrir natijani o'zgartira olmaydi.

## Tests

Backend **811/811** (+4), frontend o'zgarmadi (120/120), E2E **36/36**. TypeScript, lint (0 xato), build — o'tdi. Ikki test (tahrirlangan matn va o'zgargan kalit) tuzatishdan oldingi kodda yiqilgan bo'lardi.

## Performance

Xodim `submit` — +1 `attemptQuestion.findMany` (ochiq urinish bo'lsa) va snapshot yozish bitta `nested create` bilan (tranzaksiya ichida).

## Documentation

`docs/assessment.md` §4 — xodim yo'li snapshot va egalik.

## Known Issues

- Blueprint variant savollari umumiy `exam_questions` ga ham yoziladi (xodim "Savollar" ro'yxatida barcha variantlar birlashmasi) — mavjud xatti-harakat, izolyatsiyaga ta'sir qilmaydi.

## Next Phase

**PHASE 6 — Telegram online exam (GAP-06)**: tafsilot va tasdiq ekrani, har callbackda imtihon holati/oyna/o'quvchi holatini qayta tekshirish (S6), qolgan vaqt, testlar (vaqt tugashi, fayl, begona urinish, ota-ona).
