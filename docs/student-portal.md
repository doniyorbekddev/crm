# O‘quvchi kabineti (Student Portal)

> Academy CRM 3.0 — PHASE 2 holati. Manba: `backend/src/services/portal.service.ts`, `frontend/src/layouts/PortalLayout.tsx`, `frontend/src/pages/portal/`.
> Bog‘liq: [parent-portal.md](parent-portal.md) · [permissions.md](permissions.md) · [security.md](security.md) · [telegram-architecture.md](telegram-architecture.md)

## 1. Nima bu

O‘quvchi (va ota-ona) uchun CRM ichidagi **soddalashtirilgan ko‘rinish**: xodim paneli, sidebar va global qidiruv yo‘q. Alohida ilova emas — bitta SPA, bitta backend, bitta auth. Farqi faqat **rol** va **egalik doirasi**da.

```
Login (/login, umumiy)
   │  role = STUDENT (portal.student)
   ▼
/portal  ──▶ PortalLayout ──▶ PortalProvider (me, activeChild)
                │
   ┌────────────┼────────────┬──────────────┬──────────────┬──────────────┐
   ▼            ▼            ▼              ▼              ▼              ▼
 Bosh sahifa  Vazifalar   Imtihonlar     Davomat       To‘lovlar     Sozlamalar
 /portal      /homework   /exams         /attendance   /payments     /settings
   │          /homework/:id /exams/:id                              + /notifications
   └─ /xp     (detal +       (natija +
   (XP)       topshirish)    urinishlar)
```

## 2. Hisob va kirish

| Qadam | Qayerda | Izoh |
|---|---|---|
| Hisob ochish | `POST /api/students/:id/portal-account` (`portal.manage`) | Xodim ochadi; `User(role STUDENT)` yaratiladi, `Student.userId` bog‘lanadi. Vaqtinchalik parol **faqat shu javobda** qaytadi |
| Kirish | `POST /api/auth/login` | Xodim bilan bir xil: JWT access + httpOnly refresh cookie |
| Parolni unutdim / o‘zgartirish | `/auth/forgot-password`, `/auth/reset-password`, `PATCH /auth/change-password` | Bir xil oqim; o‘zgartirilgach boshqa sessiyalar yopiladi |
| Chiqish | `POST /auth/logout` | |

Frontend: `PortalRoute` kabinet foydalanuvchisini xodim sahifalaridan `/portal` ga qaytaradi, `StaffRoute` — aksincha. Bu **qulaylik**, himoya backendda.

## 3. Egalik (ownership)

Kabinetda **xodim ruxsatlari ishlatilmaydi**. Har so‘rovda `resolvePortalScope(actor)`:

- `STUDENT` → `Student.userId = actor.id` bo‘lgan **bitta** o‘quvchi;
- `PARENT` → `Parent.userId = actor.id` → `StudentParent` orqali farzandlar.

`requireOwnStudent(actor, ?studentId)` — so‘ralgan `studentId` doirada bo‘lmasa **403**. `studentId` berilmasa — birinchisi. Test: `backend/tests/portal.test.ts` (o‘quvchi → begona 403; ota-ona → begona farzand **barcha** endpointlarda 403; xodim → portal 403; kabinet egasi → xodim endpointlari 403).

## 4. API (`/api/portal`, ruxsat `portal.student` yoki `portal.parent`)

| Method | Endpoint | Qaytaradi | Frontend |
|---|---|---|---|
| GET | `/me` | kind, fullName, children[], **unreadNotifications**, **telegramLinked** | `PortalLayout` |
| GET | `/profile` | to‘liq profil (davomat, vazifa, imtihon, XP, to‘lovlar, 6 oylik trend, hodisalar) | Bosh sahifa |
| GET | `/schedule` | to‘lov jadvali | Bosh sahifa |
| GET | `/lessons` | 14 kunlik darslar + o‘qituvchi (faqat ism, mutaxassislik) | `LessonsCard` |
| GET | `/curriculum` | kurs dasturi progressi | `CurriculumCard` |
| GET | `/certificates` | sertifikatlar (bekor qilinganlar yo‘q) | `MyCertificatesCard` |
| GET | `/overview` | kurs progressi, risk (yumshoq: daraja + sabablar), keyingi dars, kutilayotgan vazifalar, keyingi imtihon | Bosh sahifa `OverviewCards` |
| GET | `/homework` | vazifalar ro‘yxati (holat, ball, izoh) | `/portal/homework` |
| GET | `/homework/:id` | vazifa detali: tavsif, o‘z topshirig‘i, izoh, `canSubmit`, `isLate` | `/portal/homework/:id` |
| POST | `/homework/:id/submit` | matnli javob (1–2000) | detal sahifa formasi |
| POST | `/homework/:id/attachment` | fayl (PDF/PNG/JPG/WEBP, magic-byte, ≤ `MAX_UPLOAD_MB`) | detal sahifa formasi |
| GET | `/homework/:id/attachment` | o‘z faylini yuklab olish (stream, `no-store`) | detal sahifa |
| GET | `/exams` | imtihon natijalari | `/portal/exams` |
| GET | `/exams/:id` | imtihon detali: natija + o‘z urinishlari (mavzu kesimi, javoblar, izohlar) | `/portal/exams/:id` |
| GET | `/attendance/calendar?year&month` | oylik kalendar | `/portal/attendance` |
| GET | `/gamification` | XP, daraja, seriya, nishonlar, so‘nggi XP | `/portal/xp` |
| GET | `/payments` | jadval + so‘nggi 20 to‘lov | `/portal/payments` |
| GET/POST | `/feedback` | fikr holati / yuborish | `FeedbackCard` |

Umumiy (ruxsat talab qilmaydi, faqat `authenticate`): `/api/notifications/*` (ro‘yxat, o‘qish, sozlamalar), `/api/auth/me/preferences/*` (`portal.activeChild`), `/api/telegram/me` (bog‘lash kodi).

## 5. Frontend tuzilishi

| Fayl | Vazifa |
|---|---|
| `layouts/PortalLayout.tsx` | sarlavha (brend, qo‘ng‘iroqcha, mavzu, chiqish), tablar (desktop), pastki panel (mobil), `me` so‘rovi, farzand tanlovi |
| `layouts/PortalNav.tsx` | `PORTAL_NAV_ITEMS` — bitta ro‘yxat, ikki ko‘rinish (`PortalTabs`, `PortalBottomBar`) |
| `layouts/PortalContext.tsx` | `usePortal()` → `{ me, activeChild, setActiveChild }`; tanlov `portal.activeChild` sozlamasida |
| `pages/portal/PortalPage.tsx` | bosh sahifa: 4 ko‘rsatkich (bo‘limlarga havola), `OverviewCards`, to‘lov holati, hodisalar, darslar, kurs, yutuqlar, sertifikat, fikr |
| `pages/portal/OverviewCards.tsx` | "bugun nima muhim": keyingi dars, kutilayotgan vazifa, keyingi imtihon, kurs progressi, holat (risk yumshoq so‘z bilan, `RISK_VIEW`) |
| `pages/portal/PortalHomeworkPage.tsx` | vazifalar (holat filtri, muddat, ball, izoh) → detal |
| `pages/portal/PortalHomeworkDetailPage.tsx` | tavsif, o‘z topshirig‘i, izoh, faylni ochish; **topshirish formasi** (matn + fayl; muddat o‘tgan ogohlantirish; baholangan — forma yo‘q) |
| `pages/portal/PortalExamsPage.tsx` | natijalar, o‘rtacha → detal |
| `pages/portal/PortalExamDetailPage.tsx` | natija, baho, o‘tdi/o‘tmadi, mavzu bo‘yicha chiziqlar, zaif mavzular, javoblar va izohlar |
| `pages/portal/PortalXpPage.tsx` | daraja progressi, keyingi daraja, seriya, reyting, nishonlar, so‘nggi XP |
| `pages/portal/PortalAttendancePage.tsx` | oylik kalendar (`AttendanceCalendarView` — xodim modali bilan umumiy) |
| `pages/portal/PortalPaymentsPage.tsx` | shartnoma, jadval, tarix |
| `pages/portal/PortalSettingsPage.tsx` | parol (`ChangePasswordCard` — profil bilan umumiy), bildirishnoma sozlamalari, Telegram, mavzu |
| `/portal/notifications` | xodim `NotificationsPage` komponentining o‘zi |
| `services/portal.service.ts` | barcha `/portal/*` chaqiruvlar |

Mobil: pastki panel `fixed`, `main` ga `pb-24`; `safe-area-inset-bottom` hisobga olinadi.

## 6. Testlar

| Tur | Fayl | Nima tekshiradi |
|---|---|---|
| Backend | `tests/portal.test.ts` | hisob ochish, o‘z/begona, xodim ↔ kabinet chegarasi, `/me` maydonlari, bildirishnoma kirishi, ota-ona 12 endpoint 403, imtihon urinishi endpointlari 403, **overview**, **vazifa detali + matn/fayl topshirish + fayl yuklab olish + begona 404**, **imtihon detali + urinish + begona 404** |
| Frontend | `layouts/PortalNav.test.tsx`, `pages/portal/PortalHomeworkDetailPage.test.tsx` | navigatsiya; topshirish formasi servisni to‘g‘ri chaqiradi, baholangan vazifada forma yo‘q |
| E2E | `e2e/specs/portal.spec.ts` | (1) kirish → bo‘limlar → sozlamalar → bildirishnoma → xodim sahifasi yopiq; (2) admin vazifa beradi → o‘quvchi bosh sahifada ko‘radi → ochadi → topshiradi → "Topshirdi" |

## 7. Keyingi bosqichlar (ROADMAP)

PHASE 3: ota-ona ko‘rinishi va haftalik hisobot. PHASE 5: ko‘p fayl/link/kod, RETURNED holati. PHASE 6: onlayn imtihon topshirish (kabinetdan urinish boshlash). PHASE 10: kabinetga in-app bildirishnomalar barcha akademik hodisalar bo‘yicha.
