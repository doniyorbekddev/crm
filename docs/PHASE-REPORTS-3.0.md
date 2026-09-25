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
