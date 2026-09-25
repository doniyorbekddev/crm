# Academy CRM 3.0 — faza hisobotlari

Format: `promt3.md` §70. Har faza yakunida shu faylga qo‘shiladi. Reja: [ROADMAP-3.0.md](ROADMAP-3.0.md) · Audit: [ACADEMY-3.0-AUDIT.md](ACADEMY-3.0-AUDIT.md).

---

# PHASE 1 COMPLETE — Auth + Portal foundation

Sana: 2026-09-24.

## 1. Implemented

- **Auth** — o‘zgarmadi (audit: yetarli). Kabinet hisoblari mavjud `/auth/*` bilan ishlaydi.
- **Teaching scope bitta modulda** — `services/teachingAccess.ts` (`getTeachingAccess`, `assertGroupVisible`, `teachingGroupFilter`); `homework.service` va `exam.service` undan foydalanadi (eski import yo‘li qayta eksport bilan saqlangan).
- **Xavfsizlik tuzatish** — `examAttempt.service` endi o‘qituvchi doirasini tekshiradi: savol biriktirish, o‘quvchi savollari, urinish boshlash/topshirish/baholash, urinishlar ro‘yxati va bittasi — begona guruh uchun **404**.
- **`GET /portal/me`** — `unreadNotifications`, `telegramLinked` qo‘shildi (kabinet sarlavhasi uchun).
- **Kabinet karkasi** — `PortalLayout`: tablar (desktop) + pastki panel (mobil), bildirishnoma qo‘ng‘irog‘i, mavzu, chiqish; ota-ona farzand tanlovi layoutda, tanlov serverda saqlanadi (`portal.activeChild`).
- **7 ta marshrut**: `/portal` (bosh), `/portal/homework`, `/portal/exams`, `/portal/attendance`, `/portal/payments`, `/portal/settings`, `/portal/notifications`.
- **Sozlamalar sahifasi** — parol, bildirishnoma sozlamalari, Telegram, mavzu (hammasi mavjud endpointlar).
- **Frontend servis** — 7 ta yetishmayotgan `/portal/*` chaqiruv + tiplar.
- **Umumiy komponentlar** — `AttendanceCalendarView` (xodim modali + kabinet), `ChangePasswordCard` (profil + kabinet) — dublikat yo‘q.
- **Hujjatlar** — `student-portal.md`, `parent-portal.md`, `security.md`, `permissions.md` (koddan avtomatik).

## 2. Changed Files

Backend: `services/homework.service.ts`, `services/exam.service.ts`, `services/examAttempt.service.ts`, `services/portal.service.ts`, `controllers/question.controller.ts`, `validators/preference.validator.ts`, `tests/portal.test.ts`, `tests/examEngine.test.ts`, `tests/telegramSales.test.ts` (vaqtga bog‘liq tebranish tuzatildi).

Frontend: `layouts/PortalLayout.tsx`, `layouts/NotificationBell.tsx` (`listPath`), `routes/index.tsx`, `pages/portal/PortalPage.tsx`, `pages/ProfilePage.tsx`, `pages/students/StudentAttendanceModal.tsx`, `services/portal.service.ts`, `services/preferences.service.ts`, `types/portal.ts`, `lib/queryKeys.ts`.

## 3. New Files

Backend: `services/teachingAccess.ts`.
Frontend: `layouts/PortalContext.tsx`, `layouts/PortalNav.tsx`, `layouts/PortalNav.test.tsx`, `components/AttendanceCalendarView.tsx`, `components/ChangePasswordCard.tsx`, `pages/portal/PortalHomeworkPage.tsx`, `PortalExamsPage.tsx`, `PortalAttendancePage.tsx`, `PortalPaymentsPage.tsx`, `PortalSettingsPage.tsx`.
E2E: `e2e/specs/portal.spec.ts`.
Docs: `student-portal.md`, `parent-portal.md`, `security.md`, `permissions.md`, `PHASE-REPORTS-3.0.md`.

## 4. Database Changes

Yo‘q. (`UserPreference` ga yangi kalit `portal.activeChild` — sxema o‘zgarmaydi, validator ro‘yxati kengaydi.)

## 5. API Changes

- `GET /api/portal/me` — javobga `unreadNotifications: number`, `telegramLinked: boolean` qo‘shildi (qo‘shimcha, moslik buzilmaydi).
- `PUT /api/auth/me/preferences/portal.activeChild` — yangi ruxsat etilgan kalit.
- `/api/exams/:id/questions`, `/attempts*` — xatti-harakat: begona guruh uchun 404 (oldin 200 — bo‘shliq).

## 6. Permission Changes

Yo‘q.

## 7. AI Changes

Yo‘q.

## 8. Tests

| Suite | Natija |
|---|---|
| Backend (vitest, real DB) | **688/688** ✅ (yangi: 4 ta — teaching scope 7 endpoint; `/me` maydonlari + bildirishnoma kirishi; ota-ona → begona farzand 13 endpoint; kabinet → imtihon endpointlari) |
| Frontend (vitest) | **57/57** ✅ (yangi: `PortalNav.test.tsx`, 2 ta) |
| E2E (Playwright, desktop) | `portal.spec.ts` ✅ (o‘quvchi kirish → 5 bo‘lim → sozlamalar → bildirishnoma → xodim sahifasi yopiq) |
| Lint / typecheck | 0 xato (frontend'da 1 ta avvaldan mavjud ogohlantirish) |

Failed: 0.

## 9. Security Review

- Yopilgan: `examAttempt` guruh doirasi (Risk #1, audit §17).
- Qoida bitta joyda: `teachingAccess.ts`; TZ §63 juftliklari `security.md` §6 jadvalida, har biri testda.
- Kabinet foydalanuvchisi `/notifications/*` va `/auth/me/preferences/*` ga kira oladi — bu ataylab (o‘z ma’lumoti), test bilan tasdiqlangan; xodim endpointlari 403.
- Yangi maxfiy ma’lumot oshkor qilinmaydi: `/me` faqat son va boolean qo‘shdi.

## 10. Performance

- `/portal/me` — 3 so‘rov parallel (`Promise.all`), N+1 yo‘q.
- Frontend: sahifalar lazy chunk; `me` bitta so‘rov, sahifalar o‘z so‘rovini `activeChild` bo‘yicha keshlaydi (`queryKeys.portal.*`).
- Kabinet ro‘yxatlari (vazifa, imtihon) hozircha butun ro‘yxat — o‘quvchi uchun hajm kichik; sahifalash PHASE 2 da kerak bo‘lsa qo‘shiladi.

## 11. Known Issues

- Vazifa **topshirish** va imtihon **topshirish** UI hali yo‘q (PHASE 2 / 6) — hozir faqat ro‘yxat.
- Bosh sahifada streak/risk/keyingi imtihon yo‘q (PHASE 2).
- Teaching scope boshqa 6 servisda hali o‘z nusxasi (mezon farqi) — bosqichma-bosqich.
- `debt`/`alert` ro‘yxatlari filial doirasisiz (PHASE 14).

## 12. Next Phase

**PHASE 2 — Student portal**: `GET /portal/dashboard` (streak, risk, keyingi dars/imtihon, kutilayotgan vazifa), vazifa detali + topshirish (matn + fayl), imtihon detali (mavzu bo‘yicha kuchli/zaif), XP sahifasi, profil tablari, sahifa testlari, E2E "vazifa topshirish".

---

# PHASE 2 COMPLETE — Student portal

Sana: 2026-09-24. Kommit: `bee22ab`.

## 1. Implemented

- **Bosh sahifa** — `GET /portal/overview`: kurs progressi, risk (yumshoq: daraja + eng past 3 sabab, ball yo‘q), keyingi dars, kutilayotgan vazifalar (soni + eng yaqini), keyingi imtihon. Frontend `OverviewCards`; 4 asosiy ko‘rsatkich endi bo‘limlarga havola (Daraja → `/portal/xp`).
- **Vazifa detali va topshirish** — `GET /portal/homework/:id` (tavsif, o‘z topshirig‘i, izoh, `canSubmit`, `isLate`), `GET /portal/homework/:id/attachment` (o‘z faylini yuklab olish). Sahifa: matn + fayl formasi, muddat o‘tgan ogohlantirish, baholangan — forma yashiriladi, ball va izoh ko‘rinadi. Topshirish mavjud `homeworkService.submitByStudent` orqali — Telegram bilan bitta mantiq (TZ §44).
- **Imtihon detali** — `GET /portal/exams/:id`: natija + o‘z urinishlari (`examAttemptService.listForStudent`), mavzu bo‘yicha chiziqlar, zaif mavzular, javoblar va o‘qituvchi izohlari.
- **XP sahifasi** — `/portal/xp`: daraja progressi, keyingi daraja, seriya, reyting, nishonlar, so‘nggi XP (mavjud `/portal/gamification`).
- `buildUpcomingLessons` — darslar quruvchisi alohida funksiyaga ajratildi (bosh sahifa va `/lessons` umumiy).

## 2. Changed Files

Backend: `services/portal.service.ts`, `services/examAttempt.service.ts` (`listForStudent`), `controllers/portal.controller.ts`, `routes/portal.routes.ts`, `tests/portal.test.ts`.
Frontend: `pages/portal/PortalPage.tsx`, `PortalHomeworkPage.tsx`, `PortalExamsPage.tsx`, `layouts/PortalContext.tsx` (kontekst eksporti), `services/portal.service.ts`, `types/portal.ts`, `lib/queryKeys.ts`, `routes/index.tsx`.
E2E: `e2e/specs/portal.spec.ts`. Docs: `student-portal.md`.

## 3. New Files

Frontend: `pages/portal/OverviewCards.tsx`, `PortalHomeworkDetailPage.tsx`, `PortalHomeworkDetailPage.test.tsx`, `PortalExamDetailPage.tsx`, `PortalXpPage.tsx`.

## 4. Database Changes

Yo‘q.

## 5. API Changes

Yangi (hammasi `portal.student`/`portal.parent` + `requireOwnStudent`): `GET /portal/overview`, `GET /portal/homework/:id`, `GET /portal/homework/:id/attachment`, `GET /portal/exams/:id`. Mavjudlar o‘zgarmadi.

## 6. Permission Changes

Yo‘q.

## 7. AI Changes

Yo‘q.

## 8. Tests

| Suite | Natija |
|---|---|
| Backend | **691/691** ✅ (yangi 3: overview; vazifa detali + matn + PNG fayl + yuklab olish + begona 404; imtihon detali + urinish + begona 404) |
| Frontend | **59/59** ✅ (yangi 2: topshirish formasi servis argumentlari; baholangan vazifada forma yo‘q) |
| E2E | `portal.spec.ts` 2/2 ✅ (yangi: admin vazifa beradi → o‘quvchi bosh sahifada ko‘radi → ochadi → topshiradi → "Topshirdi") |
| Lint / typecheck | 0 xato |

Failed: 0.

## 9. Security Review

- Vazifa/imtihon detali va fayl — faqat o‘z topshirig‘i (`homeworkId + studentId` yozuvi; begona → 404, testda). Imtihon: o‘quvchi guruhi yoki o‘z natijasi/urinishi bo‘lgan imtihon.
- Urinishlar: faqat o‘z javoblari; to‘g‘ri variantlar berilmaydi.
- Fayl: `resolveStoredPath` (papkadan tashqariga chiqilmaydi), MIME faqat 4 tur, `Cache-Control: private, no-store`.
- Risk o‘quvchiga ball va og‘irliksiz — faqat daraja va sabablar.

## 10. Performance

- `overview` — so‘rovlar `Promise.all`; `lessons` quruvchisi qayta ishlatiladi.
- Frontend: bosh sahifa qo‘shimcha 1 so‘rov (`overview`), keshlanadi; detal sahifalar lazy chunk.

## 11. Known Issues

- Vazifada bitta fayl (PHASE 5 — ko‘p fayl, link, kod).
- Imtihonni kabinetdan **boshlash** yo‘q (PHASE 6).
- Alohida "profil tablari" sahifasi qilinmadi — bosh sahifa + bo‘limlar shu vazifani bajaradi.

## 12. Next Phase

**PHASE 3 — Parent portal**: farzand kartalari, haftalik hisobot (`/portal/weekly-report`, web + Telegram + PDF), ota-onaga to‘lov eslatmasi Telegramda.

---

# PHASE 3 COMPLETE — Parent portal

Sana: 2026-09-25.

## 1. Implemented

- **Ota-ona kirishi** — telefon raqami bilan (istalgan yozuvda); emailsiz kabinet; takror telefon — 409, email bilan ochiladi.
- **Ota-onalarga ommaviy kabinet** (`POST /parents/portal-accounts/bulk`) va **parolni tiklash**; Ota-onalar sahifasida "Kabinetlar ochish", amallar menyusida ochish/tiklash; chop etish kartochkalari va CSV.
- **Majburiy parol almashtirish** (o‘quvchi va ota-ona) — `User.mustChangePassword`; backend `authenticate` da bloklaydi, frontend `/change-password` sahifasi.
- **"Farzandlarim"** (`GET /portal/children`) — har farzand kartasi: davomat, vazifa, imtihon, daraja, qarz, holat, keyingi dars; karta → farzandni tanlash.
- **Progress grafigi** kabinet bosh sahifasida (6 oy).
- **Haftalik hisobot** (TZ §11) — `weeklyReport.service`: davomat, vazifa, imtihon, XP, progress, kuchli/zaif mavzular, o‘qituvchi izohlari, yumshoq xulosa. Kanallar: web (`/portal/weekly-report`, PDF/chop etish), xodim (profil → oyna, `GET /students/:id/weekly-report`), Telegram (`/hisobot` + menyu), avtomatik yakshanba 18:00 (`weeklyReport.job`, `WEEKLY_REPORT` bildirishnoma, bir marta).
- **Avtomatik eslatmalar ota-onaga** — `PARENT` auditoriyali qoidalar endi ota-onaga (ilova + Telegram) yetadi; oldin faqat o‘quvchi Telegramiga ketardi (audit topilmasi).
- Umumiy komponentlar: `PortalAccountModal`, `BulkPortalAccountsModal`, `lib/portalCredentials` (o‘quvchi va ota-ona uchun bitta), `WeeklyReportView` (kabinet va xodim uchun bitta).

## 2. Changed Files

Backend: `prisma/schema.prisma`, `middleware/authenticate.ts`, `services/auth.service.ts`, `services/portalAccount.service.ts`, `services/portal.service.ts`, `services/parent.service.ts` (`hasPortalAccount`), `services/studentNotify.service.ts`, `services/automation.service.ts`, `services/studentProgress.service.ts`, `controllers/portal.controller.ts`, `controllers/student.controller.ts`, `routes/portal.routes.ts`, `routes/parent.routes.ts`, `routes/student.routes.ts`, `routes/lookup.routes.ts`, `validators/auth.validator.ts`, `validators/portal.validator.ts`, `config/notificationTypes.ts`, `utils/dates.ts`, `telegram/handlers/student.ts`, `telegram/handlers/menu.ts`, `services/telegramCommand.service.ts`, `server.ts`; testlar: `portal`, `feedback`, `certificates`, `telegramStudent`, `telegramFoundation`, `helpers/auth.ts`.
Frontend: `routes/guards.tsx`, `routes/index.tsx`, `lib/api.ts`, `lib/validation.ts`, `lib/queryKeys.ts`, `pages/auth/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `pages/parents/ParentsPage.tsx`, `pages/students/StudentsPage.tsx`, `StudentProfilePage.tsx`, `profile/ParentsTab.tsx`, `pages/portal/PortalPage.tsx`, `layouts/PortalLayout.tsx`, `PortalNav.tsx`, `services/*`, `types/*`, `utils/notificationLabels.ts`, `components/TelegramLinkCard.tsx`. E2E: `fixtures.ts`, `specs/portal.spec.ts`.

## 3. New Files

Backend: `migrations/20260925090000_parent_portal_must_change_password`, `services/weeklyReport.service.ts`, `jobs/weeklyReport.job.ts`, `tests/parentPortal.test.ts`.
Frontend: `pages/auth/ChangePasswordRequiredPage.tsx`, `pages/portal/ChildrenCards.tsx`, `PortalWeeklyReportPage.tsx`, `components/weekly/WeeklyReportView.tsx`, `WeeklyReportModal.tsx`, `week.ts`, `week.test.ts`; ko‘chirildi: `components/PortalAccountModal.tsx`, `BulkPortalAccountsModal.tsx`, `lib/portalCredentials(.test).ts`.

## 4. Database Changes

Migration `20260925090000_parent_portal_must_change_password` (additive, oldin `pg_dump`):
- `users.mustChangePassword BOOLEAN NOT NULL DEFAULT false` — mavjud hisoblar o‘zgarmaydi.
- `NotificationType` + `WEEKLY_REPORT`.

## 5. API Changes

Yangi: `GET /portal/children`, `GET /portal/weekly-report`, `GET /students/:id/weekly-report`, `POST /parents/portal-accounts/bulk`, `POST /parents/:id/portal-account/reset-password`.
O‘zgargan (moslik saqlangan): `POST /parents/:id/portal-account` — email ixtiyoriy; `POST /auth/login` — telefon ham qabul qilinadi; auth DTO + `mustChangePassword`; `ParentDto` + `hasPortalAccount`; `/lookups/student-form` — `portal.manage` ham.

## 6. Permission Changes

Yangi ruxsat yo‘q. `/lookups/student-form` ga `portal.manage` qo‘shildi (faqat kurs/guruh nomlari).

## 7. AI Changes

Yo‘q (haftalik xulosa deterministik; PHASE 9 da AI matni qo‘shiladi).

## 8. Tests

| Suite | Natija |
|---|---|
| Backend | **705/705** ✅ (yangi: `parentPortal.test.ts` 9 ta, Telegram `/hisobot` 1 ta; kabinet testlari vaqtinchalik parol qadami bilan) |
| Frontend | **61/61** ✅ (`week.test.ts`, CSV yangilandi) |
| E2E | **18/18** ✅ (yangi: ota-ona telefon → parol almashtirish → Farzandlarim → Hisobot; barcha kabinet oqimlari parol almashtirish bilan) |
| Lint / typecheck | 0 xato |

## 9. Security Review

- Vaqtinchalik parol endi **server tomonidan** majburiy — qog‘ozdagi parol bilan faqat parol almashtirish mumkin.
- Telefon bilan kirish noaniq bo‘lsa (bir telefon — bir nechta kabinet) rad etiladi; lockout va rate-limit o‘sha.
- Hisobot: kabinetda `requireOwnStudent`; xodimda `studentService.getById` (o‘qituvchi — o‘z guruhi, begona 404); Telegramda doira `chatId` dan, tugmadagi sana tekshiriladi.
- Ommaviy ochish filial doirasida; audit `portal.parent_accounts_bulk_created`, `portal.parent_password_reset`.

## 10. Performance

- Hisobot: 7 so‘rov `Promise.all`, indekslangan ustunlar (`attendances(studentId,date)`, `homework_submissions(studentId,status)`, `exam_results(studentId)`).
- Job: faqat qabul qiluvchisi bor faol o‘quvchilar; yakshanba bir marta (dedupe).
- `children`: farzand soni kichik (1–3) — har biri uchun mavjud profil quruvchisi.

## 11. Known Issues

- Haftalik hisobot PDF — brauzer chop etish orqali (serverda PDF generatsiya kutubxonasi yo‘q; sertifikat bilan bir xil yondashuv).
- Hisobotdagi mavzu kesimi faqat mavzuga bog‘langan imtihon savollaridan; vazifalar mavzuga PHASE 5 da bog‘lanadi.

## 12. Next Phase

**PHASE 4 — LMS foundation**: `Lesson` (mavzu → dars, DRAFT/PUBLISHED/ARCHIVED, video/fayl/resurs), `LessonMaterial`, dars sessiyasi mavzusi → progress avtomat, kabinetda "Kurs" bo‘limi.

---

# PHASE 4 COMPLETE — LMS foundation

Sana: 2026-09-25. Batafsil: [lms.md](lms.md).

## 1. Implemented

- **Dars (Lesson)** — TZ §14 ning barcha maydonlari: nom, tavsif, konspekt, o‘qituvchi, mavzu, davomiylik, video, fayllar, resurslar, tartib, `publishedAt`; holat DRAFT/PUBLISHED/ARCHIVED.
- **Materiallar** — fayl (mavjud fayl siyosati), havola, video; yuklab olish; xavfli havolalar rad.
- **O‘qituvchi doirasi** — yangi `lesson.manage`; o‘qituvchi faqat o‘z kurslarida, admin — hammasida.
- **Kabinetda "Kurs"** — faqat o‘z kursining nashr qilingan darslari; dars sahifasi (YouTube embed, konspekt, materiallar); "O‘rgandim" (`LessonProgress`) va kurs darslari progressi; ota-ona ko‘radi, belgilamaydi.
- **Dars sessiyasi → progress** — davomatda "O‘tilgan mavzu" tanlansa kelganlarda `IN_PROGRESS` (schema izohidagi, lekin kodda yo‘q bo‘lgan bog‘lanish amalga oshirildi).
- Mobil kabinet navigatsiyasi: 4 asosiy + "Yana" (bo‘limlar 9 taga yetdi).
- Fayl berish yagona yordamchida (`sendStoredFile`) — hujjat, vazifa fayli, material.

## 2–3. Files

Backend yangi: `services/lesson.service.ts`, `controllers/lesson.controller.ts`, `routes/lesson.routes.ts`, `validators/lesson.validator.ts`, `utils/sendStoredFile.ts`, `tests/lessons.test.ts`, migration `20260925120000_lms_lessons`. O‘zgargan: `schema.prisma`, `config/permissions.ts`, `services/portal.service.ts`, `curriculum.service.ts`, `attendance.service.ts`, `attendanceSession.service.ts`, `controllers/portal.controller.ts`, `document.controller.ts`, routes (`index`, `course`, `curriculum`, `portal`), validators (`attendance`, `attendanceSession`, `portal`).
Frontend yangi: `pages/courses/CourseLessonsPage.tsx`, `LessonEditorModal.tsx`, `pages/portal/PortalCoursePage.tsx`, `PortalLessonPage.tsx`, `components/lesson/LessonBody.tsx`, `services/lessons.service.ts`, `types/lesson.ts`, `utils/lessonLabels(.test).ts`. O‘zgargan: `CoursesPage`, `AttendancePage`, `PortalNav(.test)`, `routes/index.tsx`, `services/portal.service.ts`, `lib/queryKeys.ts`, `types/attendance.ts`, `utils/permissionKeys.ts`. E2E: `portal.spec.ts`. Docs: `lms.md`, `permissions.md`.

## 4. Database Changes

`lessons`, `lesson_materials`, `lesson_progress`; enumlar `LessonStatus`, `LessonMaterialKind`. Hammasi yangi jadval — mavjud ma’lumot o‘zgarmaydi. (`schema.prisma` `prisma format` bilan tekislandi — faqat bo‘shliqlar.)

## 5. API Changes

Yangi: 7 ta xodim + 4 ta kabinet endpointi (lms.md §6). Kengaygan: davomat va seans `topicId` (ixtiyoriy), seans DTO `curriculumTopic`.

## 6. Permission Changes

`lesson.manage` (91-ruxsat) — TEACHER, SUPER_ADMIN, OWNER, ADMIN. `npm run db:sync-permissions` bilan qo‘llandi.

## 7. AI Changes

Yo‘q.

## 8. Tests

Backend **710/710** (+5 `lessons.test.ts`), frontend **65/65** (+3 lessonLabels, +2 nav), E2E **19/19** (+1 LMS). Lint/typecheck 0 xato.

## 9. Security Review

- Tahrirlash doirasi servisda (o‘qituvchi begona kursda — 403), kabinetda faqat PUBLISHED + o‘z kursi (begona dars/material — 404).
- Havolalar faqat http(s); YouTube embed faqat qat’iy regex bilan (`[\w-]{6,20}`) va `youtube-nocookie`; dars matni HTML sifatida render qilinmaydi (XSS yo‘q).
- Fayl: magic-byte, `resolveStoredPath`, `no-store`.
- Ota-ona farzandi nomidan "o‘rgandim" qo‘ya olmaydi (403).

## 10. Performance

- Daraxt bitta so‘rovda (modul → mavzu → dars + `_count`), indeks `lessons(topicId,status,sortOrder)`.
- Kabinet progressi: bitta `lesson_progress` so‘rovi, indeks `(studentId, lastViewedAt)`.

## 11. Known Issues

- Faqat PDF/rasm fayl (mavjud siyosat); boshqa formatlar havola sifatida.
- Dars matni oddiy matn (Markdown/rich-text yo‘q — xavfsizlik va soddalik uchun).

## 12. Next Phase

**PHASE 5 — Daily homework**: target (guruh/tanlangan/bitta), mavzu/dars/qiyinlik, ko‘p fayl + link + kod, IN_PROGRESS/RETURNED, o‘qituvchi javobni ko‘radi, rubric, deadline eslatma, MISSED job.

---

# PHASE 5 COMPLETE — Daily homework

Sana: 2026-09-25. Batafsil: [homework.md](homework.md).

## 1. Implemented

- **§15** mavzu, dars, qiyinlik, o‘qituvchi fayl/havolalari; **kimga**: butun guruh / tanlangan / bitta o‘quvchi.
- **§16** butun guruhga — keyin qo‘shilgan o‘quvchilar ham oladi; "yangi vazifa" xabari faqat nishonga.
- **§17** holatlar: `IN_PROGRESS` (qoralama), `RETURNED` (qaytarilgan) qo‘shildi; TZ nomlari xaritasi docs'da.
- **§18** javob: matn, havola, kod, 5 tagacha fayl; qoralama saqlash.
- **§19** o‘qituvchi to‘liq javobni ko‘radi (oldin **ko‘rmas edi** — audit topilmasi), kechikishni ko‘radi, baholaydi, izoh beradi, qaytaradi.
- **§20** rubrika: sozlanadigan mezonlar, ball serverda hisoblanadi.
- Deadline eslatmasi (24 soat) va `MISSED` fon vazifasi (TZ §42 ning bir qismi).

## 2–3. Files

Backend yangi: `services/rubric.service.ts`, `controllers/rubric.controller.ts`, `jobs/homeworkReminder.job.ts`, `tests/homeworkV2.test.ts`, migration `20260925150000_homework_v2`. O‘zgargan: `schema.prisma`, `services/homework.service.ts`, `portal.service.ts`, `studentNotify.service.ts`, `studentGroupHistory.ts`, `controllers/homework.controller.ts`, `portal.controller.ts`, `routes/homework.routes.ts`, `portal.routes.ts`, `index.ts`, `validators/homework.validator.ts`, `portal.validator.ts`, `config/notificationTypes.ts`, `telegram/handlers/student.ts`, `server.ts`.
Frontend yangi: `pages/homework/SubmissionReviewModal.tsx`, `RubricsModal.tsx`. O‘zgargan: `HomeworkFormModal`, `HomeworkDetailModal`, `HomeworkPage`, `PortalHomeworkDetailPage(.test)`, `PortalHomeworkPage`, `services/homework.service.ts`, `portal.service.ts`, `types/homework.ts`, `portal.ts`, `utils/homeworkLabels.ts`, `lib/queryKeys.ts`. E2E: `portal.spec.ts`. Docs: `homework.md`.

## 4. Database Changes

Migration `20260925150000_homework_v2` (oldin `pg_dump`): enum `HomeworkTarget`; `SubmissionStatus` + IN_PROGRESS, RETURNED; `NotificationType` + HOMEWORK_DEADLINE, HOMEWORK_RETURNED; `homework` + topicId, lessonId, difficulty, targetType (default GROUP), rubricId; `homework_submissions` + linkUrl, codeText, codeLanguage, rubricScores, returnedAt; yangi `homework_attachments`, `submission_attachments`, `rubrics`. Eski `attachmentPath` fayllari `submission_attachments` ga **ko‘chirildi** (ustun saqlangan, `now()` ishlatilmagan).

## 5. API Changes

Yangi: 7 xodim, 3 rubrika, 5 kabinet endpointi (homework.md §7). Kengaygan (moslik saqlangan): `POST /homework`, `PATCH …/submissions/:studentId` (`rubricScores`), `POST /portal/homework/:id/submit` (matn endi ixtiyoriy — havola/kod/fayl ham yetarli), vazifa va topshiriq DTO'lari.

## 6. Permission Changes

Yo‘q (mavjud `homework.view/manage/grade`).

## 7. AI Changes

Yo‘q (baholash oynasida AI uchun joy — PHASE 9).

## 8. Tests

Backend **718/718** (+8), frontend **68/68** (+3), E2E **19/19**. Lint/typecheck 0 xato.

## 9. Security Review

- Nishon tekshiruvi: tanlangan o‘quvchilar shu guruhning faol a’zosi; begona o‘quvchi — 422.
- O‘quvchi fayllari: faqat o‘zi va o‘z guruhi o‘qituvchisi (begona o‘qituvchi — 404); o‘qituvchi fayli — faqat nishondagi o‘quvchi; qoralama vazifa kabinetda ko‘rinmaydi.
- Havola faqat http(s); kod faqat matn sifatida ko‘rsatiladi (bajarilmaydi, `<pre><code>`).
- Rubrika ballari serverda hisoblanadi (klient hisobiga ishonilmaydi), to‘liqlik tekshiriladi.

## 10. Performance

- Nishon yozuvlari `createMany skipDuplicates`; keyin qo‘shilganlar bitta so‘rovda.
- Ro‘yxatdagi belgilar `_count` bilan (N+1 yo‘q); job ≤ 2000 yozuv/yurish, MISSED — bitta `updateMany`.

## 11. Known Issues

- Kod faylini (`.js`, `.zip`) yuklab bo‘lmaydi — mavjud fayl siyosati; kod matn maydoni yoki havola orqali.
- Nishonni vazifa yaratilgandan keyin o‘zgartirish yo‘q (yangi vazifa beriladi).

## 12. Next Phase

**PHASE 6 — Assessment 2.0**: imtihon turlari, savol turlari (TRUE_FALSE, SHORT/LONG_TEXT, CODE, FILE_UPLOAD), teglar/izoh, blueprint (mavzu % × qiyinlik %), har o‘quvchiga alohida variant + snapshot, savol/javob tartibini aralashtirish, startAt/endAt, **o‘quvchi o‘zi topshiradi** (kabinet + bot), qisman ball, `EXAM_SCHEDULED`.

---

# PHASE 6 COMPLETE — Assessment 2.0

Sana: 2026-09-25. Batafsil: [assessment.md](assessment.md).

## 1. Implemented

- **§21** imtihon turlari (7 ta), ro‘yxat va formada.
- **§22** savol turlari: `TRUE_FALSE`, `SHORT_TEXT` (qabul qilinadigan javoblar, mos kelmasa o‘qituvchiga), `LONG_TEXT`, `CODE`, `FILE_UPLOAD`; `explanation`, `tags`. Eski `TEXT` saqlandi.
- **§23** har o‘quvchiga bankdan alohida tasodifiy variant (`crypto.randomInt`), qiyinlik bo‘yicha taqsimlash.
- **§24** blueprint: mavzu % × qiyinlik %, ikki bosqichli aniq taqsimlash, yetmasa to‘ldirish qoidasi va aniq xato, saqlashdan oldin "Bankni tekshirish".
- **§25** `startAt/endAt` oynasi, davomiylik, `maxAttempts`, savol va variant tartibini aralashtirish, **snapshot** (`attempt_questions`: matn, variant tartibi, ball, javob kaliti).
- **O‘quvchi imtihonni o‘zi topshiradi**: boshlash/davom ettirish, avtosaqlash, taymer, topshirish, natija + tushuntirish; vaqt tugasa avtomatik topshirish (ochilganda va har daqiqalik job).
- O‘qituvchi uchun **baholash oynasi** (oldin "Baholash kerak" belgisi bor edi, lekin UI yo‘q edi — audit topilmasi): esse/kod/fayl, ball + izoh.
- Baholash qoidasi bitta joyda (`gradeAnswer`) — xodim va kabinet urinishlari uchun bir xil (TZ §0.2 "takroriy biznes-mantiq yo‘q").

## 2–3. Files

Backend yangi: `services/examBlueprint.ts`, `services/examTaking.service.ts`, `jobs/examAttempt.job.ts`, `tests/unit/examBlueprint.test.ts`, `tests/onlineExam.test.ts`, migration `20260925180000_assessment_v2`. O‘zgargan: `schema.prisma`, `services/exam.service.ts`, `examAttempt.service.ts`, `question.service.ts`, `portal.service.ts`, `homework.service.ts` (MIME yordamchisi umumiy `fileStorage` ga), `controllers/portal.controller.ts`, `homework.controller.ts`, `question.controller.ts`, `routes/portal.routes.ts`, `homework.routes.ts`, `validators/homework.validator.ts`, `question.validator.ts`, `portal.validator.ts`, `utils/fileStorage.ts`, `server.ts`.
Frontend yangi: `pages/homework/BlueprintEditor(.test)`, `AttemptReviewModal`, `pages/portal/PortalAttemptPage(.test)`, `OnlineExamsCard`, `pages/questions/QuestionFormModal.test`, `utils/questionLabels.ts`. O‘zgargan: `ExamFormModal`, `ExamQuestionsModal`, `ExamsPage`, `QuestionFormModal`, `QuestionsPage`, `PortalExamsPage`, `components/ui/Checkbox` (ixtiyoriy `label`), `routes/index.tsx`, `services/homework.service.ts`, `questions.service.ts`, `portal.service.ts`, `types/homework.ts`, `question.ts`, `portal.ts`, `utils/homeworkLabels.ts`, `lib/queryKeys.ts`. E2E: `portal.spec.ts`. Docs: `assessment.md`, `student-portal.md`.

## 4. Database Changes

Migration `20260925180000_assessment_v2` (oldin `pg_dump`, faqat qo‘shish): enum `ExamType`; `QuestionType` + TRUE_FALSE, SHORT_TEXT, LONG_TEXT, CODE, FILE_UPLOAD; `exams` + type (default MONTHLY_EXAM), isOnline (false), startAt, endAt, shuffleQuestions, shuffleOptions, blueprint; `questions` + explanation, tags, acceptedAnswers; `exam_answers` + filePath; yangi `attempt_questions` (unique attemptId+examQuestionId). Mavjud imtihonlar o‘zgarmaydi (oflayn, eski tur).

## 5. API Changes

Yangi: 2 xodim, 6 kabinet endpointi ([assessment.md §7](assessment.md)). Kengaygan (moslik saqlangan): imtihon va savol yaratish/tahrirlash, urinish DTO (`questionType`, `hasFile`, snapshot matn/ball). Kabinet urinishi boshlanmagan (IN_PROGRESS) holatda xodim baholay olmaydi — 422.

## 6. Permission Changes

Yo‘q. Rejadagi `exam.start` kerak bo‘lmadi: `portal.student` + egalik + "faqat o‘quvchining o‘zi" tekshiruvi.

## 7. AI Changes

Yo‘q (AI tekshiruv yordamchisi — PHASE 9).

## 8. Tests

Backend **732/732** (+14: blueprint unit 7, onlayn imtihon 7), frontend **77/77** (+9), E2E **20/20** (+1: o‘quvchi onlayn imtihon topshiradi). Lint/typecheck 0 xato (1 eski ogohlantirish).

## 9. Security Review

- Javob kaliti, `isCorrect`, tushuntirish va qabul qilinadigan javoblar o‘quvchiga **topshirilgunga qadar yuborilmaydi** (testda JSON tekshiriladi); NEEDS_REVIEW holatida ham to‘g‘ri javob yashirin.
- Imtihon faqat o‘quvchi guruhida, onlayn va ochiq bo‘lsa ko‘rinadi; begona o‘quvchi — 404; ota-ona boshlay/javob bera olmaydi — 403.
- Javob validatsiyasi: variant snapshotdagi savolga tegishli bo‘lishi, bitta javobli savolda bitta variant; fayl turi baytlar bo‘yicha.
- Muddatdan keyingi javob qabul qilinmaydi; urinish chegarasi serverda.
- Variant tasodifi kriptografik; baholash faqat serverda, snapshot kaliti bo‘yicha.
- Fayl javobi: faqat o‘z guruhi o‘qituvchisi (begonasi — 404), `no-store`.

## 10. Performance

- Variant generatsiyasi xotirada (bank bir so‘rovda), snapshot `createMany`.
- Job: har daqiqa, ≤ 500 ochiq urinish, faqat kabinet (snapshotli) urinishlari; parallel yurish bloklangan.
- Avtosaqlash: matn 800 ms debounce, variant — darhol; bitta `upsert`.

## 11. Known Issues

- Blueprint variant savollari `exam_questions` ga qo‘shiladi (javoblar shu jadvalga bog‘langan) — "Savollar" ro‘yxatida barcha o‘quvchilar variantlarining birlashmasi ko‘rinadi.
- Brauzer yopilganda "tab almashtirish" nazorati (proctoring) yo‘q — TZ talab qilmaydi.
- Tarmoq uzilsa saqlanmagan javob "Saqlanmadi" deb ko‘rsatiladi; keyingi o‘zgarishda qayta yuboriladi (lokal navbat yo‘q).

## 12. Next Phase

**PHASE 7 — Progress / mastery**: `topic_mastery` (0–100, NOT_STARTED/LEARNING/PRACTICING/MASTERED), sozlanadigan chegaralar 40/60/80, manbalar (imtihon mavzu kesimi, mavzuli vazifa, davomat), qayta hisoblash hooklari, oylik `StudentProgressSnapshot` job, profil/kabinet/guruh ko‘rinishlari.

---

# PHASE 7 COMPLETE — Progress / mastery

Sana: 2026-09-26. Batafsil: [progress.md](progress.md).

## 1. Implemented

- **§26** mavzu darajasidagi progress: har mavzu 0–100, modul va umumiy o‘rtacha; xodim profili, guruh matritsasi, kabinet "Progress".
- **§27** holatlar NOT_STARTED / LEARNING / PRACTICING / MASTERED; darajalar 0–39 / 40–59 / 60–79 / 80–100; **chegaralar sozlanadi** (va og‘irliklar).
- Manbalar: imtihon mavzu kesimi (PHASE 6 snapshot bilan), mavzuli vazifa (PHASE 5), mavzuli davomat va LMS darslari (PHASE 4).
- Qayta hisoblash hooklari + tungi to‘liq qayta hisob; `StudentProgressSnapshot` birinchi marta yoziladi (oylik).

## 2–3. Files

Backend yangi: `services/mastery.service.ts`, `services/progressSnapshot.service.ts`, `controllers/mastery.controller.ts`, `routes/mastery.routes.ts`, `validators/mastery.validator.ts`, `jobs/progress.job.ts`, `tests/mastery.test.ts`, `tests/unit/mastery.test.ts`, migratsiyalar `20260926090000_topic_mastery`, `20260926091000_progress_snapshot_mastery`. O‘zgargan (hooklar): `examAttempt.service.ts`, `examTaking.service.ts`, `exam.service.ts`, `homework.service.ts`, `attendance.service.ts`, `attendanceSession.service.ts`, `lesson.service.ts`; `portal.service/controller/routes`, `student.routes.ts`, `group.routes.ts`, `routes/index.ts`, `server.ts`, `schema.prisma`.
Frontend yangi: `components/mastery/MasteryView(.test)`, `pages/students/profile/MasteryTab`, `pages/portal/PortalProgressPage`, `pages/groups/GroupMasteryModal(.test)`, `MasterySettingsModal`, `services/mastery.service.ts`, `types/mastery.ts`, `utils/masteryLabels.ts`. O‘zgargan: `StudentProfilePage`, `GroupsPage` (amallar menyusi endi o‘qituvchiga ham — "O‘zlashtirish"), `PortalNav` (+Progress), `routes/index.tsx`, `components/ui/Modal` (`xl` o‘lcham), `services/portal.service.ts`, `lib/queryKeys.ts`. E2E: `portal.spec.ts`. Docs: `progress.md`.

## 4. Database Changes

(oldin `pg_dump`, faqat qo‘shish) enum `MasteryStatus`; jadval `topic_mastery` (unique studentId+topicId, indeks topicId+status); `student_progress_snapshots` + `masteryScore`, `topicsMastered`.

## 5. API Changes

Yangi: 6 endpoint ([progress.md §6](progress.md)). Mavjudlari o‘zgarmadi.

## 6. Permission Changes

Yo‘q. Ko‘rish — mavjud `student.view` / `group.view` + o‘qituvchi doirasi; sozlash — mavjud `settings.manage`.

## 7. AI Changes

Yo‘q. Mastery va snapshot — PHASE 9 AI tahlilining asosiy kirish ma’lumoti (TZ §31 "Topic mastery").

## 8. Tests

Backend **741/741** (+9: formula unit 4, integratsiya 5), frontend **80/80** (+3), E2E **21/21** (+1). Lint/typecheck 0 xato.

## 9. Security Review

- O‘qituvchi faqat o‘z guruhi o‘quvchilari va matritsasini ko‘radi (begona — 404); kabinet — faqat o‘zi/farzandi (begona `studentId` — 403).
- Sozlamalarni faqat Owner / Super Admin o‘zgartiradi; audit oldin/keyin qiymati bilan.
- Hook xatosi asosiy amalni (baholash, davomat) buzmaydi — log + tungi tuzatish.

## 10. Performance

- Hisob bir guruh o‘quvchi uchun ~7 so‘rovda (N+1 yo‘q); faqat o‘zgargan qatorlar yoziladi.
- Davomat hooki faqat mavzuli darsda; tungi job 200 tadan bo‘laklab; snapshot 300 tadan, `groupBy` bilan.
- Chegara o‘zgarishi — 3 ta `updateMany`, qayta hisobsiz.

## 11. Known Issues

- Mavzusiz savollar/vazifalar o‘zlashtirishga kirmaydi (mavzu belgilash tavsiya etiladi — formalarda bor).
- Snapshotdagi XP/daraja/qarz — yozilgan paytdagi qiymat (o‘tgan oy uchun oy boshidagi yurishda yakunlanadi).

## 12. Next Phase

**PHASE 8 — Teacher control center**: `/teaching` — guruhlar kartalari (o‘quvchilar, davomat %, vazifa %, imtihon o‘rtachasi, progress %), guruh jadvali (davomat, vazifa, imtihon, progress, risk, oxirgi faollik), risk sabablari (§29: past davomat, vazifa yo‘q, imtihon pasaymoqda, faollik past, qarz, kirmagan, topshirmagan) — mavjud risk engine bilan birlashtirilgan.

---

# PHASE 8 COMPLETE — Teacher control center

Sana: 2026-09-26. Batafsil: [teacher-control.md](teacher-control.md).

## 1. Implemented

- **§28** `/teaching`: "Mening guruhlarim" — har guruh: o‘quvchilar, davomat %, vazifa %, imtihon o‘rtachasi, progress %; yig‘indi plitkalari; bugungi dars va davomat holati; tez amallar (davomat — guruh oldindan tanlangan, baholash kutayotgan vazifa/urinishlar).
- **§28** guruh jadvali: o‘quvchi | davomat | vazifa | imtihon | progress | risk | oxirgi faollik (+ kabinetga kirish), eng xavflisi tepada, mavzular matritsasiga o‘tish.
- **§29** risk sabablari mavjud engine ichida kengaytirildi: imtihon pasaymoqda, ketma-ket topshirilmagan vazifa, faollik past, kabinetga kirmagan (mavjud 6 omil o‘zgarmagan). Risk kartasi va at-risk ro‘yxati avtomatik yangi sabablarni ko‘rsatadi.
- Admin/rahbar o‘qituvchi bo‘yicha filtrlaydi; o‘qituvchi faqat o‘z guruhlari.

## 2–3. Files

Backend yangi: `services/teaching.service.ts`, `controllers/teaching.controller.ts`, `routes/teaching.routes.ts`, `tests/teaching.test.ts`. O‘zgargan: `services/studentRisk.service.ts` (+4 omil, `forStudents` ommaviy hisob + ko‘rsatkichlar), `routes/index.ts`, `tests/studentRisk.test.ts` (omillar soni o‘rniga aniq kalitlar ro‘yxati — qat‘iyroq).
Frontend yangi: `pages/teaching/TeachingPage`, `TeachingGroupPage`, `TeachingPage.test`, `services/teaching.service.ts`, `types/teaching.ts`. O‘zgargan: `layouts/navigation.ts` (+O‘qituvchi markazi), `routes/index.tsx`, `pages/attendance/AttendancePage` (`?groupId=`), `types/student.ts` (risk kalitlari), `lib/queryKeys.ts`. E2E: `specs/teaching.spec.ts`. Docs: `teacher-control.md`.

## 4. Database Changes

Yo‘q (mavjud jadvallar: `users.lastLoginAt`, `lesson_progress`, `exam_attempts`, `topic_mastery`).

## 5. API Changes

Yangi: `GET /teaching/overview`, `GET /teaching/groups/:id`. `GET /students/:id/risk` — `factors` 6 tadan 10 taga (qo‘shimcha kalitlar; mavjudlari o‘zgarmagan).

## 6. Permission Changes

Yo‘q. Mavjud `attendance.mark` / `homework.manage` / `group.manage` + `teachingAccess`.

## 7. AI Changes

Yo‘q. Yangi risk omillari — PHASE 9 AI tahlili uchun tushuntiriladigan (FACT) dalillar.

## 8. Tests

Backend **745/745** (+4), frontend **82/82** (+2), E2E **23/23** (+2). Lint/typecheck 0 xato.

## 9. Security Review

- O‘qituvchi `teacherId` parametri bilan begona guruhlarni ololmaydi (testda tekshirilgan); begona guruh jadvali — 404; buxgalter — 403 (API va sahifa).
- Jadval faqat akademik ko‘rsatkichlarni beradi; qarz summasi yo‘q (risk sababi sifatida faqat ulush).

## 10. Performance

- Butun sahifa bitta signal yig‘imi: ~20 so‘rov guruhlar sonidan qat‘i nazar (N+1 yo‘q); oxirgi faollik `groupBy _max` bilan, ketma-ket topshirmaganlik — bitta oynali SQL.
- Risk yangidan hisoblanadi, lekin saqlanmaydi (tungi risk job o‘zgarmadi).

## 11. Known Issues

- "Bugun dars" guruh jadvali kunlariga qaraydi; bayram/ko‘chirilgan darslar hisobga olinmaydi.
- Tez amallardagi "Vazifalar/Imtihonlar" umumiy sahifaga olib boradi (guruh filtri o‘sha sahifalarda qo‘lda tanlanadi).

## 12. Next Phase

**PHASE 9 — AI academic control center** (§30–40): o‘quvchi tahlili (Academic/Attendance/Engagement/Homework/Assessment score, sabablar FACT/OBSERVATION/RECOMMENDATION), deterministik engine bilan to‘qnashmaydi; vazifa tekshiruvchi yordamchi (taklif balli, o‘qituvchi tasdiqlaydi), o‘qituvchi/rahbar yordamchisi, ota-ona uchun xulosa, remedial tavsiyalar; Claude API + graceful fallback, `ai.academic` ruxsati, `AiAnalysis` modeli.

---

# PHASE 9 COMPLETE — AI academic control center

Sana: 2026-09-26. Batafsil: [ai-academic.md](ai-academic.md).

## 1. Implemented

- **§30–33** o‘quvchi tahlili: 5 ball (akademik, davomat, faollik, vazifa, baholash), deterministik risk fakt sifatida (o‘zgartirilmaydi), sabablar trend raqamlari bilan.
- **§34–35** vazifa tekshiruvi: mezonlar, xatolar, tavsiyalar, taklif balli; kod tekshiruvi (xavfsizlik, best practice, accessibility, tugallanmaganlik); o‘qituvchi *Qabul qilish / Ballni tahrirlash / Qaytarish*.
- **§36** o‘xshashlik signali (lokal, modelsiz) — hukm emas.
- **§37, §39** yordamchiga 8 akademik tool (o‘qituvchi doirasida) + model bilan niyat aniqlash (faqat ruxsat etilgan toollar).
- **§38** guruh tahlili; **§41** remedial reja (dars → qoralama vazifa → onlayn quiz → qayta test → mastery), o‘qituvchi tasdiqlaydi.
- **§40** haftalik hisobotga yumshoq tavsiyalar va (model bo‘lsa) iliq xulosa — kabinet, xodim va Telegram.
- **§58–61** whitelist, maxfiylik, FACT/OBSERVATION/RECOMMENDATION, sxema bilan tekshiruv, graceful fallback (kalitsiz to‘liq ishlaydi).

## 2–3. Files

Backend yangi: `services/ai/llm.ts`, `ai/academic.service.ts`, `ai/academicTools.ts`, `ai/similarity.ts`, `controllers/aiAcademic.controller.ts`, `routes/aiAcademic.routes.ts`, `validators/aiAcademic.validator.ts`, `tests/aiAcademic.test.ts`, `tests/unit/aiSimilarity.test.ts`, migratsiyalar `20260926120000_ai_academic`, `20260926121000_ai_analysis_subject_length`. O‘zgargan: `ai/assistant.service.ts` (akademik toollar, niyat aniqlash), `ai/tools.ts` (`dropout` kalit so‘zi), `routes/ai.routes.ts`, `config/permissions.ts` (+`ai.academic`), `config/env.ts`, `.env.example`, `weeklyReport.service.ts` (+tavsiyalar, AI xulosa), `portal.service.ts`, `studentProgress.service.ts`, `jobs/weeklyReport.job.ts`, `telegram/handlers/student.ts`, `schema.prisma`.
Frontend yangi: `components/ai/InsightList`, `AiReviewPanel(.test)`, `pages/students/profile/AiAnalysisTab`, `pages/teaching/GroupAiModal(.test)`, `services/aiAcademic.service.ts`, `types/aiAcademic.ts`. O‘zgargan: `SubmissionReviewModal`, `StudentProfilePage`, `TeachingGroupPage`, `WeeklyReportView`, `layouts/navigation.ts` + `routes/guards.tsx` + `utils/permissions.ts` + `hooks/usePermission.ts` (ruxsat ro‘yxati — istalgan biri), `routes/index.tsx`, `types/portal.ts`, `utils/permissionKeys.ts`, `lib/queryKeys.ts`. E2E: `teaching.spec.ts`. Docs: `ai-academic.md`, `permissions.md`.

## 4. Database Changes

(oldin `pg_dump`, faqat qo‘shish) enumlar `AiAnalysisKind`, `AiAnalysisStatus`, `AiAnalysisSource`; jadval `ai_analyses`; `subjectId` 80 belgiga kengaytirildi (vazifa+o‘quvchi kaliti).

## 5. API Changes

Yangi: 12 endpoint `/api/ai/academic/*`. `/api/ai/ask|tools|history` — `ai.assistant` yoki `ai.academic`. Haftalik hisobot DTO: `recommendations`, `aiSummary`.

## 6. Permission Changes

Yangi `ai.academic` (92-ruxsat): O‘qituvchi, Admin, Owner, Super Admin. `docs/permissions.md` qayta yaratildi.

## 7. AI Changes

Claude API qatlami (fetch, timeout, sxema tekshiruvi, graceful fallback), `AI_MODEL` sozlanadi. Kalit berilmagan — hozir qoidalar rejimi. **Kalitni foydalanuvchi o‘zi serverdagi `.env` ga qo‘yadi**.

## 8. Tests

Backend **756/756** (+11: 6 integratsiya — soxta model bilan, 5 unit), frontend **85/85** (+3), E2E **24/24** (+1). Lint/typecheck 0 xato.

## 9. Security Review

- Promptda ism/familiya/telefon yo‘qligi testda tekshiriladi; faktlar model javobidan qat’i nazar o‘zgarmaydi (test).
- Model ruxsatsiz toolni tanlasa — rad etiladi (test); begona guruh/o‘quvchi/vazifa — 404; buxgalter — 403.
- Taklif balli chegaradan oshsa — sxema rad etadi; qabul qilish takrorlanmaydi (422).
- O‘xshashlik — faqat signal, "ko‘chirgan" degan xulosa yo‘q (test).

## 10. Performance

- Yordamchi toollari bitta ommaviy risk hisobi bilan (guruhlar soniga bog‘liq emas).
- Ota-ona xulosasi hafta bo‘yicha keshlanadi (bitta model chaqiruvi); yangi tahlillar rate-limit bilan.
- Model chaqiruvi `AI_TIMEOUT_MS` bilan cheklangan; xatoda darhol qoidalar natijasi.

## 11. Known Issues

- Rasm/PDF javoblar avtomatik tahlil qilinmaydi (izoh ko‘rsatiladi).
- Rubrikali vazifada "Ballni tahrirlash" ball maydoniga yozadi, rubrika maydonlari qo‘lda.
- Remedial vazifa qoralama bo‘lib yaratiladi — o‘qituvchi tahrirlab e’lon qiladi (ataylab).

## 12. Next Phase

**PHASE 10 — Notification integration** (§42): Homework created/deadline/graded (bor), Exam scheduled, Exam result (bor), Low score, Attendance absent (bor)/late, Risk increased, Certificate issued (tekshirish), Payment due — web + Telegram + mavjud tizim.

---

# PHASE 10 COMPLETE — Notification integration

Sana: 2026-09-26. Batafsil: [notifications.md](notifications.md).

## 1. Implemented

- §42 ro‘yxatidagi 11 hodisa tekshirildi: 7 tasi oldingi bosqichlarda bor edi (vazifa yaratildi/muddat/baholandi, imtihon natijasi, kelmadi, sertifikat, to‘lov muddati — standart `payment_due` qoidasi ota-onaga).
- Yangi: **Exam scheduled** (kelgusi imtihon, sana o‘zgarsa qayta), **Low score** (faqat ota-onaga, yumshoq tavsiya), **Attendance late** (ota-onaga), **Risk increased** (guruh o‘qituvchisiga, sabablar bilan).
- Web + Telegram: mavjud `notifyFamily` / `notificationService` orqali (foydalanuvchi sozlamalari va dedupe ishlaydi).
- Audit topilmasi tuzatildi: frontend’da `HOMEWORK_DEADLINE` va `HOMEWORK_RETURNED` nomlari yo‘q edi; kabinetdagi bildirishnoma havolalari xodim sahifalariga olib borardi — endi kabinet sahifalariga.

## 2–3. Files

Backend: `services/studentNotify.service.ts` (+`notifyExamScheduled`, `notifyLowScore`, `notifyAttendanceLate`), `exam.service.ts`, `attendance.service.ts`, `studentRisk.service.ts`, `config/notificationTypes.ts`, `schema.prisma`, migratsiya `20260926140000_notification_events`, `tests/notificationEvents.test.ts`.
Frontend: `types/notification.ts`, `utils/notificationLabels.ts` (+kabinet havolalari), `layouts/NotificationBell.tsx`, `pages/notifications/NotificationsPage.tsx`, `utils/labels.test.ts`. Docs: `notifications.md`.

## 4. Database Changes

(oldin `pg_dump`) `NotificationType` + `EXAM_SCHEDULED`, `LOW_SCORE`, `ATTENDANCE_LATE`, `RISK_INCREASED` (faqat qo‘shish).

## 5. API Changes

Yo‘q (yangi turlar mavjud bildirishnoma API’larida ko‘rinadi). `studentRiskService.recalculateAll` natijasiga `increased` qo‘shildi.

## 6. Permission Changes

Yo‘q.

## 7. AI Changes

Yo‘q.

## 8. Tests

Backend **760/760** (+4), frontend **86/86** (+1), E2E **24/24**. Lint/typecheck 0 xato.

## 9. Security Review

- Past natija va kechikish — faqat ota-onaga (o‘quvchi natijani baribir oladi), matn ayblamaydi.
- Risk oshdi — faqat guruh o‘qituvchisiga (ota-onaga "xavf" so‘zi yuborilmaydi).
- Birinchi risk hisobida ommaviy xabar yo‘q (joriy qilish xavfsiz).

## 10. Performance

- Imtihon e’loni — guruh bo‘yicha bitta tranzaksiya; o‘tgan sanali imtihonlarga umuman ishlamaydi.
- Risk xabari mavjud tungi yurish ichida, faqat daraja oshganlar uchun.

## 11. Known Issues

- Imtihon e’loni guruh o‘quvchilariga (onlayn/oflayn farqi matnda); bekor qilinganda alohida "bekor qilindi" xabari yo‘q.

## 12. Next Phase

**PHASE 11 — Telegram 2.0** (§43–44): onlayn imtihon botda, qidiruv, sozlamalar, o‘qituvchi KPI, marketing, hisobotlar, vazifa biriktirmalari, broadcast media, qo‘ng‘iroq yozish, follow-up yaratish; web bilan izchillik.

---

# PHASE 11 COMPLETE — Telegram 2.0

Sana: 2026-09-26. Batafsil: [telegram.md](telegram.md).

## 1. Implemented

§43 prioritetlari (bot qayta yozilmadi — mavjud handlerlarga qo‘shildi):

1. **Online Exam** — o‘quvchi botda boshlaydi/davom ettiradi, variant tugmalari (bitta javobda avtomatik keyingisi), matn va fayl javob, taymer, tasdiq bilan topshirish, natija.
2. **Search** — global qidiruv, natijalar ruxsatga qarab, CRM havolalari bilan.
3. **Settings** — ovozsiz rejim (hamma uchun), xodimga tur bo‘yicha Telegram xabarlari, farzand tanlash, uzish.
4. **Teacher KPI** — o‘qituvchi markazi raqamlari botda.
5. **Marketing** — kanallar bo‘yicha lead, konversiya, xarajat, ROI.
6. **Reports** — joriy oy KPI’lari, ruxsat web bilan bitta ro‘yxatdan.
7. **Homework Attachments** — o‘qituvchi vazifaga fayl/rasm biriktiradi; o‘quvchi fayllarini botda oladi.
8. **Broadcast Media** — rasm/hujjat + izoh.
9. **Call logging** — lead kartasidan natija + izoh.
10. **Follow-up creation** — tayyor muddatlar yoki o‘z sanasi.

Qo‘shimcha: botdan **baholash va qaytarish**, **AI tekshiruv** (PHASE 9) va qabul qilish; o‘qituvchiga akademik AI yordamchi; §44 izchillik (bitta servislar).

Audit topilmasi tuzatildi: broadcast matni ikki marta HTML-escape qilinardi.

## 2–3. Files

Yangi: `telegram/handlers/exam.ts`, `telegram/handlers/workspace.ts`, `config/reportPermissions.ts`, `tests/telegramV2.test.ts`, migratsiya `20260926160000_telegram_v2`. O‘zgargan: `telegram/router.ts`, `handlers/menu.ts`, `handlers/sales.ts`, `handlers/teacher.ts`, `handlers/broadcast.ts`, `handlers/student.ts`, `handlers/extras.ts`, `telegram/format.ts`, `services/telegram.service.ts` (`sendMedia`), `notificationDelivery.service.ts`, `broadcast.service.ts`, `examTaking.service.ts` (aktor ixtiyoriy), `telegramCommand.service.ts`, `controllers/report.controller.ts`, `schema.prisma`; testlar `telegramFoundation.test.ts` (menyu ro‘yxati yangilandi), `telegramExtras.test.ts` (AI ruxsatsiz rol — buxgalter; o‘qituvchiga ochiqligi alohida test). Docs: `telegram.md`.

## 4. Database Changes

(oldin `pg_dump`, faqat qo‘shish) `telegram_links.muted`; `telegram_broadcasts.mediaKind/mediaFileId`; `notification_deliveries.mediaKind/mediaFileId`.

## 5. API Changes

HTTP API o‘zgarmadi. Botga yangi buyruqlar: `/onlayn`, `/sozlamalar`, `/qidir`, `/kpi`, `/tekshirish`, `/hisobotlar`, `/marketing` (Telegram menyusiga ham qo‘shildi).

## 6. Permission Changes

Yo‘q (mavjud ruxsatlar; hisobot ruxsatlari endi bitta faylda).

## 7. AI Changes

Botda AI tekshiruv va akademik yordamchi — PHASE 9 servislari orqali.

## 8. Tests

Backend **767/767** (+7), frontend **86/86**, E2E **24/24** (o‘zgarishsiz). Lint/typecheck 0 xato.

## 9. Security Review

- Callback’ga ishonilmaydi: indekslar serverdagi urinishdan, hisobot turi ro‘yxat va ruxsatdan, topshiriq — o‘qituvchi doirasidan tekshiriladi (begona o‘qituvchi — xato, test).
- Onlayn imtihonni faqat o‘quvchi topshiradi; ota-ona ro‘yxatni ko‘radi.
- Ovozsiz rejim faqat o‘z chatini o‘zgartiradi; xodim sozlamasi faqat o‘ziga.
- Fayllar Telegramdan olinganda hajm va tur baytlar bo‘yicha tekshiriladi (web bilan bir xil servis).

## 10. Performance

- Broadcast media qayta yuklanmaydi (`file_id`).
- Tekshirish navbati 10 tadan, eng eskisidan; KPI — o‘qituvchi markazining bitta ommaviy hisobi.

## 11. Known Issues

- Botda onlayn imtihon natijasida to‘g‘ri javob va tushuntirish ko‘rsatilmaydi — kabinetga yo‘naltiriladi (xabar hajmi).
- Hisobotlar botda faqat KPI’lar; jadval CRM’da.

## 12. Next Phase

**PHASE 12 — Search + Analytics** (§45–49): kabinet/o‘qituvchi/manager/owner uchun rolga mos qidiruv, akademik analitika (guruh/kurs/o‘qituvchi kesimi, trendlar).

---

# PHASE 12 COMPLETE — Search + Academic analytics

Sana: 2026-09-26. Batafsil: [academic-analytics.md](academic-analytics.md).

## 1. Implemented

- **§45 Qidiruv**: kabinet qidiruvi (vazifa, imtihon, dars, sertifikat; ota-onaga — farzandlar), o‘qituvchi qidiruviga vazifa va imtihonlar (o‘z guruhlari); manager/owner — mavjud global qidiruv.
- **§46 Akademik analitika**: 7 kesim × 8 metrika (davomat, vazifa, o‘rtacha ball, imtihon, o‘zlashtirish, progress, retention, risk).
- **§47** kurs kartasi zaif mavzular bilan; **§48** guruh taqqoslash (grafik, tavsifiy saralash); **§49** o‘qituvchi analitikasi o‘quvchi fikri bilan, faqat raqamli kuzatuvlar.
- Audit topilmasi: frontend qidiruvida `certificates` guruhi ikonkasi yo‘q edi (oyna yiqilishi mumkin edi) — tuzatildi.

## 2–3. Files

Backend yangi: `services/academicAnalytics.service.ts`, `controllers/academicAnalytics.controller.ts`, `routes/academicAnalytics.routes.ts`, `tests/academicAnalytics.test.ts`, `tests/searchAcademic.test.ts`, migratsiya `20260926180000_academic_analytics_indexes`. O‘zgargan: `search.service.ts` (+vazifa, imtihon, `portal()`), `portal.service/controller/routes`, `routes/index.ts`, `schema.prisma`.
Frontend yangi: `pages/analytics/AcademicAnalyticsPage(.test)`, `services/academicAnalytics.service.ts`, `types/academicAnalytics.ts`, `lib/csv.ts`. O‘zgargan: `components/GlobalSearch.tsx` (qayta ishlatiladigan), `layouts/PortalLayout.tsx` (qidiruv), `types/search.ts`, `services/portal.service.ts`, `lib/portalCredentials.ts` (umumiy CSV), `layouts/navigation.ts`, `routes/index.tsx`, `lib/queryKeys.ts`. E2E: `teaching.spec.ts`, `portal.spec.ts`. Docs: `academic-analytics.md`.

## 4. Database Changes

(oldin `pg_dump`) indekslar: `homework_submissions(homeworkId, status)`, `topic_mastery(topicId, score)`.

## 5. API Changes

Yangi: `GET /api/analytics/academic`, `GET /api/portal/search`. `GET /api/search` — yangi guruhlar `homework`, `exams`.

## 6. Permission Changes

Yo‘q (`analytics.view` yoki `attendance.mark` + doira).

## 7. AI Changes

Yo‘q (analitika — AI tahlillari uchun qo‘shimcha manba bo‘lishi mumkin).

## 8. Tests

Backend **772/772** (+5), frontend **87/87** (+1), E2E **26/26** (+2). Lint/typecheck 0 xato.

## 9. Security Review

- O‘qituvchi analitikada faqat o‘z guruhlari (test), filial doirasi rahbar uchun; buxgalter — 403.
- Kabinet qidiruvi faqat o‘z ma’lumotlari: boshqa guruh vazifasi chiqmaydi, begona `studentId` — 403, qoralama darslar ko‘rinmaydi (test).

## 10. Performance

- Barcha kesim bitta o‘quvchilar ro‘yxati va ~8 ta `groupBy` so‘rovi bilan hisoblanadi; vazifa/imtihon kesimi 200 tagacha.
- Yangi indekslar baholash navbati va mavzu kesimini tezlashtiradi; so‘rov `heavyLimiter` bilan.

## 11. Known Issues

- Retention o‘quvchining hozirgi guruh/kurs bog‘lanishi bo‘yicha (guruh almashgan o‘quvchi yangi guruhida hisoblanadi).
- Analitika eksporti CSV (brauzerda); XLSX — umumiy hisobotlarda.

## 12. Next Phase

**PHASE 13 — Automation builder** (§50–51): akademik trigger/harakatlar (past natija, topshirmagan, xavf oshdi → xabar, vazifa/remedial taklif, vazifa (Task) yaratish), qoidalar muharriri.
