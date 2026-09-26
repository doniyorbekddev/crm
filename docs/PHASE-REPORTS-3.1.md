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

---

# ACADEMY CRM 3.1 — PHASE 6

Sana: 2026-09-26. GAP-06 "Telegram online exam". Batafsil: [telegram.md](telegram.md), [assessment.md](assessment.md).

## Implemented

- Bot oqimi TZ bo'yicha: **Imtihonlarim → ro'yxat → tafsilot** (savollar, vaqt, urinishlar, oyna, qoidalar) **→ Boshlash → Tasdiq → savollar → Tugatish → natija**. Tasdiqdan oldin urinish ochilmaydi (taymer boshlanmaydi); ochiq urinish tasdiqsiz davom etadi.
- Navigatsiya: `⬅️ Oldingi`, `➡️ Keyingi`, `💾 Saqlash` (javoblar avtomatik saqlanadi — tugma holatni serverdan qayta o'qib ko'rsatadi), `🏁 Tugatish` (tasdiq bilan). Qolgan vaqt har ekranda serverdagi muddatdan.
- **S6 — har callbackda qayta tekshiruv** (`examTakingService`, bot va kabinet uchun bitta joyda): urinish egasi va holati (mavjud) + **imtihon holati** (bekor/yopilgan — javob va topshirish rad), **o'quvchi faolligi** (muzlatilgan/ketgan — rad), **o'quvchi hali shu guruhda**. Boshlashda ham faol bo'lmagan o'quvchi rad etiladi.
- Tekshiruv davomida topilgan va tuzatilgan eski nuqson: **davomat obzori/statistikasida "bugun" UTC bo'yicha** edi — Toshkentda 00:00–05:00 oralig'ida o'qituvchi (bot "Bugungi darslar", dashboard) kechagi kun darslarini ko'rardi. Endi o'quv markaz sanasi (`businessDateString`); hafta va oy boshlanishi ham.

## Existing Code Reused

`examTakingService` (available, start, view, saveAnswer, saveAnswerFile, submit — bot o'z imtihon mantiqiga ega emas), `telegramService.downloadFile` + `saveAnswerFile` (fayl CRM xotirasiga, PDF/rasm siyosati), `telegramSessionService` (urinish id sessiyada — callback'ga ishonilmaydi), `businessDateString`.

## New Files

`backend/tests/telegramExam.test.ts`, `backend/tests/attendanceBusinessDate.test.ts`.

## Modified Files

Backend: `telegram/handlers/exam.ts`, `services/examTaking.service.ts`, `services/attendanceAnalytics.service.ts`, `tests/telegramV2.test.ts` (tasdiq qadami qo'shildi — qat'iyroq), `tests/staffDocuments.test.ts` (sana yordamchisi markaz sanasiga).
E2E: `e2e/specs/flows.spec.ts` (+§35), `e2e/flows.ts` (`linkStudentTelegram`, `telegramPress`), `e2e/env.ts`, `playwright.config.ts` (alohida test webhook siri). Docs: `telegram.md`.

## Database Changes

Yo'q.

## API Changes

Yo'q. Kabinet `PUT/POST /portal/attempts/*` endi bekor qilingan imtihon, faol bo'lmagan yoki guruhdan chiqqan o'quvchi uchun 422.

## Telegram Changes

Yangi callbacklar: `ex_info:<examId>`, `ex_go:<examId>`, `ex_save`; `ex_start` endi yangi urinish uchun tasdiq so'raydi; ro'yxat tugmasi tafsilotga olib boradi. Callback'da urinish id yo'q (sessiyada), savol/variant indeksi har safar serverdagi urinishdan o'qiladi.

## Permissions

Yo'q (faqat o'quvchining o'zi; ota-ona va xodim — rad, test).

## Security

§29: har callbackda foydalanuvchi (scope qayta), egalik (`{id, studentId}`), urinish holati, imtihon holati, o'quvchi holati va guruhi. Begona guruh imtihoni — topilmaydi, urinish yaratilmaydi; soxta indeks — hech narsa yozilmaydi; ota-ona — boshlay olmaydi (testlar). Timer server tomonda: mijoz vaqtiga ishonilmaydi (test: boshlanish vaqti surilganda keyingi callbackda urinish yakunlanadi).

## Tests

Backend **816** (+5; oxirgi to'liq yurishda 815 o'tdi — `examEngine.test.ts` bitta testi yuklama ostida HTTP "Parse Error", alohida 12/12 o'tadi; oldingi yurishda ham o'tgan), E2E **37/37** (+1: §35 bot → CRM → web kabinet), frontend o'zgarmadi. TypeScript, lint (0 xato), build — o'tdi.
Birinchi to'liq yurish tunda (00:33) ikkita **eski** sanaga bog'liq nuqsonni ochdi (o'zgarishlarsiz kodda ham yiqilishi tekshirildi): biri mahsulotda (yuqorida tuzatildi, regressiya testi vaqtni 00:30 ga qo'yib eski kodda yiqilishi tasdiqlandi), biri testning UTC sana yordamchisida.

## Performance

Har javobda qo'shimcha so'rov yo'q (holat `loadAttempt` ichida bitta so'rovda). Bot tafsilot ekrani mavjud `available` so'rovidan.

## Documentation

`docs/telegram.md` (imtihon oqimi va xavfsizlik).

## Known Issues

- Botda natijadan keyin to'g'ri javoblar va tushuntirish ko'rsatilmaydi — kabinetga yo'naltiriladi (xabar hajmi).
- "Jonli" teskari sanash yo'q (Telegram xabari o'zi yangilanmaydi) — qolgan vaqt har bosishda serverdan yangilanadi.

## Next Phase

**PHASE 7 — Telegram teacher homework file (GAP-07)** + S1 (bot amallarida `homework.manage` tekshiruvi): TZ tartibidagi oqim, fayl turi qabul paytida, atomik yaratish (fayl xatosida vazifa e'lon qilinmaydi).

---

# ACADEMY CRM 3.1 — PHASE 7

Sana: 2026-09-26. GAP-07 "Telegram teacher homework file" + audit **S1** (vazifa uchun).

## Implemented

- Bot oqimi TZ tartibida: **Guruh → Sarlavha → Tavsif → Muddat → Fayl → Tasdiq → Yaratish** (4 qadam + tasdiq; `➡️ Faylsiz davom etish` / `➡️ Davom etish (N fayl)`).
- Fayl **qabul qilingan zahoti**: Telegram'dan yuklab olinadi (hajm chegarasi `MAX_UPLOAD_MB`) → tur baytlar bo'yicha (PDF, JPG, PNG, WEBP — mavjud siyosat) → **CRM xotirasiga** saqlanadi; sessiyada faqat CRM yo'li, Telegram `file_id` emas. Noto'g'ri tur — darhol rad; 5 tagacha.
- **Atomik e'lon**: qoralama → fayllar biriktiriladi → hammasi muvaffaqiyatli bo'lsagina e'lon (topshiriqlar + bildirishnoma). Xato bo'lsa vazifa qoralamada qoladi — o'quvchilarga ko'rinmaydi (oldin vazifa avval e'lon qilinib, fayl xatosi faqat xabarda aytilardi).
- **S1**: `homework.manage` botda ham (REST `POST /homework` bilan bir xil kalit) — boshlashda, **har qadamda** va tasdiqda; ruxsatsiz xodimga "Vazifa berish" tugmasi ko'rinmaydi. Umumiy yordamchi `telegram/permissions.ts` (`botCan`, `scopeCan`) — PHASE 8–9 da qo'ng'iroq va follow-up uchun ishlatiladi.

## Existing Code Reused

`homeworkService.create/update` (qoralama → e'lon: `ensureSubmissions` + `notifyHomeworkCreated`), `storeUpload` siyosati (`prepareAttachment` orqali), `telegramService.downloadFile`, `groupService.getById` (o'qituvchi doirasi), `permissionService`.

## New Files

`backend/src/telegram/permissions.ts`, `backend/tests/telegramHomework.test.ts`.

## Modified Files

Backend: `telegram/handlers/teacher.ts`, `services/homework.service.ts` (`prepareAttachment`, `attachStoredFile`; `uploadAttachment` shular orqali — xatti-harakati o'zgarmagan), `tests/telegramTeacher.test.ts`, `tests/telegramV2.test.ts` (yangi qadam tartibi; barcha tekshiruvlar saqlandi + fayl bosqichi).
E2E: `e2e/specs/flows.spec.ts` (+§36), `e2e/flows.ts` (`linkStaffTelegram`, `telegramMessage`), `e2e/specs/portal.spec.ts` (ommaviy kabinet testi kabinetsiz o'quvchili guruhni tanlaydi — boshqa testlar bilan to'qnashmasin). Docs: `telegram.md`.

## Database Changes

Yo'q.

## API Changes

Yo'q (REST o'zgarmadi).

## Telegram Changes

Yangi callback `tc_hwnext`; qadam tartibi o'zgardi; `tc_hw`/`tc_hwnext`/`tc_hwok` va matn qadamlari `homework.manage` ni tekshiradi.

## Permissions

Yangi ruxsat yo'q — mavjud `homework.manage` botda qo'llanildi.

## Security

- S1: ruxsatsiz xodim (guruhga biriktirilgan bo'lsa ham) — rad, vazifa yaratilmaydi (test); oqim o'rtasida ruxsat olinsa — keyingi qadamda to'xtaydi (test).
- Begona guruh — `groupService` doirasi, "topilmadi" (test). Fayl yo'li saqlash papkasidan tashqariga chiqolmaydi (`resolveStoredPath`).

## Tests

Backend **820** (+4; to'liq yurishda 818 o'tdi — `endpointSecurity` va `telegramStudent` bitta testdan, E2E bilan parallel yurgan paytdagi vaqt tugashi; alohida 21/21 o'tadi), E2E **38/38** (+1 §36: bot → web topshirish → web baholash). TypeScript, lint (0 xato), build — o'tdi.

## Performance

Fayl yuklab olish qabul paytida (tasdiqda kutish yo'q); e'londa fayllar allaqachon diskda.

## Documentation

`docs/telegram.md`.

## Known Issues

- Oqim bekor qilinsa oldindan saqlangan fayllar diskda qoladi (bazaga bog'lanmagan, o'lchami chegaralangan) — tozalash vazifasi PHASE 21 da (production hardening).
- E2E'da fayl bosqichi yo'q (E2E serverida bot tokeni yo'q — Telegram'dan yuklab olib bo'lmaydi); backend testlarida qoplangan.

## Next Phase

**PHASE 8 — Telegram sales call (GAP-08)** + S1 (`call.create`, `lead.view`): qo'ng'iroq turi, natija, davomiylik, izoh, keyingi qadam.

---

# ACADEMY CRM 3.1 — PHASE 8

Sana: 2026-09-26. GAP-08 "Telegram sales call log" + audit **S1** (sotuv amallari).

## Implemented

- Lead kartasi (ism, telefon, kurs, status — mavjud) → **📞 Qo'ng'iroq yozish**: 5 qadam — **tur** (📤 chiquvchi / 📥 kiruvchi) → **natija** (mavjud `CallResult`: javob berdi, javob bermadi, band, noto'g'ri raqam, qiziqdi, qiziqmadi, qayta qo'ng'iroq) → **davomiylik** (tugma yoki daqiqa yoziladi; javob bo'lmagan natijada o'tkazib yuboriladi) → **izoh** (yoki izohsiz) → **keyingi qadam** (saqlash / ertaga 10:00 yoki 3 kundan keyin qayta qo'ng'iroq — `Call.nextCallAt` / saqlash va follow-up).
- Oldin tur doim "chiquvchi", davomiylik 0, keyingi qadam bo'sh edi — endi hammasi CRM qo'ng'irog'ida.
- **S1 (sotuv botida to'liq)**: har sotuv amali REST bilan bir xil kalitlar bilan — leadlar/karta `lead.view`, status `lead.update`, qo'ng'iroq `call.create`, follow-up ro'yxati `followup.view`, bajarildi `followup.update`, yaratish `followup.create`. Tugmada **va** matnli qadamda (router) — oqim o'rtasida ruxsat olinsa ham to'xtaydi.

## Existing Code Reused

`callService.create` (lead doirasi `leadAccess`, faollik `CALL_LOGGED`, `lastContactedAt`, audit), `CallResult`/`CallDirection`/`CallStatus` enumlari, `leadService.getById`, `localDayAt`, `telegram/permissions.ts` (PHASE 7).

## New Files

`backend/tests/telegramCall.test.ts`.

## Modified Files

`backend/src/telegram/handlers/sales.ts` (qo'ng'iroq oqimi, `SALES_ACTION_PERMISSIONS`, `SALES_FLOW_PERMISSIONS`), `backend/src/telegram/router.ts` (matnli sotuv oqimlari ruxsat bilan), `backend/tests/telegramV2.test.ts` (5 qadamli oqim; oldingi tekshiruvlar + tur va davomiylik), `docs/telegram.md`.

## Database Changes

Yo'q (`calls` jadvalining mavjud maydonlari: direction, durationSec, nextCallAt).

## API Changes

Yo'q.

## Telegram Changes

Yangi callbacklar: `sl_ct:<OUT|IN>`, `sl_cd:<soniya>`, `sl_cn:<none|t10|d3|fu>`; `sl_cr` va `sl_cs` endi oqim ichida (sessiyani yopmaydi); qo'ng'iroq sessiyasi `call_note` bosqichlari: type → result → duration → note → next.

## Permissions

Yangi ruxsat yo'q — mavjudlari botda qo'llanildi.

## Security

- Ruxsatsiz xodim (o'qituvchi) va `call.create` siz rol — rad (test); oqim o'rtasida ruxsat olinsa matnli qadam ham, tugma ham rad (test).
- Boshqa menejerning leadi — `leadAccess` doirasi, soxta callback bilan ham qo'ng'iroq yozilmaydi (test).
- Callback'da faqat lead id va tanlov; tur, natija, davomiylik sessiyada, har qadamda lead qayta tekshiriladi.

## Tests

Backend **824/824** (+4, to'liq toza), E2E **38/38**. TypeScript, lint (0 xato), build — o'tdi. §37 E2E (lead → qo'ng'iroq → follow-up → **eslatma**) PHASE 9 da — eslatma qismi (S4) shu fazada tuzatiladi.

## Performance

Har amalda bitta kesh qilingan ruxsat o'qish (`permissionService` keshi).

## Documentation

`docs/telegram.md`.

## Known Issues

- Qo'ng'iroq statusi botda doim `COMPLETED` (rejalashtirilgan qo'ng'iroq — web'da).

## Next Phase

**PHASE 9 — Telegram follow-up (GAP-09)** + **S4**: follow-up maydonlari (sana, vaqt, izoh, muhimlik — migratsiya), eslatma Telegram navbatiga (`notificationService` orqali, foydalanuvchi sozlamasi bilan), E2E §37.

---

# ACADEMY CRM 3.1 — PHASE 9

Sana: 2026-09-26. GAP-09 "Telegram follow-up" + audit **S4** (eslatma Telegramga) + S1 (follow-up).

## Implemented

- Bot follow-up TZ maydonlari bilan: **Lead → Sana va vaqt** (tayyor tugma yoki `25.12.2026 15:30`) **→ Izoh** (yoki izohsiz) **→ Muhimlik** (past / o'rta / yuqori / shoshilinch) → yaratish. Oldin sarlavha va izoh doim bir xil ("Telegram bot orqali"), muhimlik yo'q edi.
- **S4 — eslatma Telegramga**: `followUpReminder.job` endi `notificationService.createManyInTransaction` orqali — ilova ichida va Telegram `NotificationDelivery` navbatiga (qayta urinish), xodimning tur sozlamasi va "ovozsiz" rejimi hurmat qilinadi. Oldin job bildirishnomani to'g'ridan-to'g'ri yozardi — **Telegramga eslatma ketmasdi**, bot esa "shu chatga keladi" deyardi. Muhim follow-up xabarida 🔴/🟠.
- **Muhimlik** web'da ham: follow-up formasi (standart "O'rta") va ro'yxatda yuqori/shoshilinch belgisi; REST `priority` (yaratish/tahrir).
- S1: "Saqlash va follow-up" (qo'ng'iroqdan keyin) ham `followup.create` ni tekshiradi — oldin qo'ng'iroq ruxsati bilan follow-up oqimi ochilib ketardi.

## Existing Code Reused

`followUpService.create/update` (lead doirasi, mas'ul, `remindAt` = muddatdan 30 daqiqa oldin, faollik), `notificationService` (sozlama filtri + Telegram navbati), `NotificationDelivery` va uning job'i, mavjud `LeadPriority` enumi (yangi enum yaratilmadi), `FOLLOWUP_PRESETS`, `telegram/permissions.ts`.

## New Files

Backend: migratsiya `20260927110000_follow_up_priority`, `tests/followUpReminderTelegram.test.ts`. Frontend: `pages/leads/FollowUpFormModal.test.tsx`.

## Modified Files

Backend: `schema.prisma`, `jobs/followUpReminder.job.ts`, `services/followUp.service.ts`, `validators/followUp.validator.ts`, `telegram/handlers/sales.ts`, `tests/telegramV2.test.ts` (3 qadamli follow-up + chat chegarasini qayta boshlash), `tests/telegramCall.test.ts` (+follow-up ruxsati).
Frontend: `types/followUp.ts`, `pages/leads/FollowUpFormModal.tsx`, `pages/followups/FollowUpsPage.tsx`. E2E: `flows.spec.ts` (+§37). Docs: `telegram.md`, `notifications.md`.

## Database Changes

(oldin `pg_dump`) `follow_ups.priority "LeadPriority" NOT NULL DEFAULT 'MEDIUM'` — faqat qo'shish; dev va test bazalarida qo'llandi.

## API Changes

`POST/PUT /api/follow-ups` — ixtiyoriy `priority` (LOW/MEDIUM/HIGH/URGENT; noto'g'ri — 422; tahrirda berilmasa o'zgarmaydi); javobda `priority`.

## Telegram Changes

Yangi callbacklar `sl_fs` (izohsiz), `sl_fp:<muhimlik>`; `sl_fw` endi darhol yaratmaydi — izoh va muhimlik so'raladi; follow-up sessiyasi bosqichlari date → note → priority.

## Permissions

Yangi yo'q; `followup.create` qo'ng'iroqdan keyingi follow-up'da ham.

## Security

S4: xodim tur sozlamasi (`telegram: false`) va "ovozsiz" chat — Telegramga ketmaydi, ilova ichida bor (test). S1: `followup.create` siz rol — follow-up oqimi ham, qo'ng'iroqdan keyingi taklif ham yo'q (test).

## Tests

Backend **827/827** (+3, to'liq toza), frontend **121/121** (+1), E2E **39/39** (+1 §37: bot lead → qo'ng'iroq → follow-up → eslatma ilovada va Telegram navbatida — job haqiqatan kutiladi). S4 testi eski job kodida yiqilishi tekshirildi. TypeScript, lint (0 xato), build — o'tdi.

## Performance

Eslatma — har follow-up uchun bitta tranzaksiya (avvalgidek); sozlama filtri bitta so'rov.

## Documentation

`docs/telegram.md`, `docs/notifications.md` ("Xodim eslatmalari — bitta yo'l").

## Known Issues

- Telegram eslatmasi haqiqiy yuborilishi bot tokeni bilan (production); E2E'da navbatga yozilishi tekshiriladi.

## Next Phase

**PHASE 10 — Owner Telegram Teacher KPI (GAP-10)**: o'qituvchilar ro'yxati va tanlangan o'qituvchi KPI (guruh, o'quvchi, davomat, vazifa, imtihon, progress, retention, fikr) — mavjud `academicAnalyticsService` (dimension=teacher) orqali.

---

# ACADEMY CRM 3.1 — PHASE 10

## Implemented

- Rahbar "📈 KPI" → **o'qituvchilar ro'yxati**: har o'qituvchi — guruhlar, o'quvchilar, davomat, vazifa, imtihon, progress; umumiy qator (+ retention); o'qituvchi tugmasi.
- O'qituvchini tanlash (`ws_kt:<id>`) → **tafsilot**: guruhlar, o'quvchilar, davomat, vazifa bajarilishi, imtihon o'rtachasi, progress, retention, fikr-mulohaza (x/5), xavf ostida, baholash navbati, guruhlar kesimi; "⬅️ O'qituvchilar".
- TZ talabi "Telegram uchun alohida KPI calculation yaratma": botda hisob-kitob yo'q — `academicAnalyticsService.build(dimension: 'teacher')` (web "Akademik analitika" bilan bir xil) va `teachingService.overview` (guruhlar).
- O'qituvchining o'zi uchun mavjud ko'rinish (o'z guruhlari) o'zgarmadi.

## Existing Code Reused

`academicAnalyticsService`, `teachingService.overview(actor, { teacherId })`, `teachingAccessFrom` qoidasi (`group.manage` = barcha guruhlar), workspace yordamchilari (`requireActor`, `safely`, `pct`, `menuRow`).

## New Files

`backend/tests/telegramTeacherKpi.test.ts`.

## Modified Files

`backend/src/telegram/handlers/workspace.ts` (`showTeacherList`, `showTeacherKpi`, `canViewTeacherKpi`, ruxsat tekshiruvi `showKpi` da), `backend/src/telegram/handlers/menu.ts` (KPI tugmasi `analytics.view` bo'lsa ham), `e2e/specs/flows.spec.ts`, `docs/telegram.md`.

## Database Changes

Yo'q.

## API Changes

Yo'q (REST o'zgarmadi).

## Telegram Changes

Yangi callback `ws_kt:<teacherId>`; `ws_kpi` rahbar uchun ro'yxat, o'qituvchi uchun avvalgidek.

## Permissions

REST `/api/analytics/academic` bilan bir xil: KPI — `analytics.view` yoki `attendance.mark` (aks holda ⛔). Boshqa o'qituvchilar (ro'yxat va tafsilot) — `analytics.view` + `group.manage`; aks holda servislar o'z guruhlariga cheklaydi. Yangi ruxsat yo'q.

## Security

Audit S1 davomi: `ws_kpi` avval ruxsatsiz ham ochilardi (ma'lumot o'z guruhlari bilan cheklangan edi) — endi ruxsat tekshiriladi. `ws_kt` qo'lda yuborilgan callback bilan: o'qituvchi → boshqa o'qituvchi, buxgalter, sotuv menejeri — rad, ma'lumot chiqmaydi (test).

## Tests

Backend **830/830** (+3: rahbar ro'yxat va tafsilot — raqamlar REST bilan solishtiriladi; o'qituvchi faqat o'zi, begona tafsilot rad; buxgalter/sotuv rad). To'liq yugurishda 1 ta `examEngine` testi mashina yuklamasida 5 s timeout (E2E bilan parallel) — alohida 12/12 o'tdi. Frontend **121/121**, E2E **40/40** (+1: rahbar botda KPI → tafsilot to'liq stekda, REST parity, menejer 403). TypeScript, lint (0 xato), build — o'tdi.

## Performance

Ro'yxat: bitta analitika + bitta overview so'rovi (parallel); ko'rsatish 12 o'qituvchi bilan cheklangan, qolgani — CRM havolasi.

## Documentation

`docs/telegram.md` — "Rahbar: O'qituvchilar KPI" qatori.

## Known Issues

- Davr — analitika standarti (joriy oy); botda davr tanlash yo'q (web'da bor).
- Filial doirasi (Branch A → Branch B) analitikada hali yo'q — audit S3, PHASE 14.
- E2E'da bot javob matni ko'rinmaydi (token yo'q) — matn backend integratsiya testida tekshiriladi.

## Next Phase

**PHASE 11 — Owner Telegram marketing (GAP-11)**: manba bo'yicha daromad, xarajat, ROI, foyda; davr tanlash; CSV havolasi — mavjud `analyticsService` orqali.
