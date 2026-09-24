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
