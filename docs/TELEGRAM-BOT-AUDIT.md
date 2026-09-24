# Telegram Bot — PHASE 0: mavjud CRM auditi

> `telegramBot.md` §70 talab qilgan formatda. Kod yozishdan **oldin** bajarildi.
> Sana: 2026-09-24. Tekshirilgan holat: `ca45bf0`.

---

## 1. CURRENT ARCHITECTURE

```text
Monorepo (npm workspaces)
├── backend/    Node 24 · TypeScript (strict) · Express 5 · Prisma 7.10 + @prisma/adapter-pg
│               PostgreSQL 17 · zod 4 · pino · vitest + supertest
├── frontend/   React 19 · Vite 8 · Tailwind 4 · TanStack Query 5 · Zustand 5 · RHF+zod
└── e2e/        Playwright (14 ta ssenariy)
```

Qatlamlar: `routes → middleware (authenticate, requirePermission, rateLimiter) → controllers
(zod validatsiya) → services (biznes mantiq) → Prisma → PostgreSQL`.

Fon vazifalari (`src/jobs/`, 11 ta): follow-up eslatmalari, qarz eslatmalari, ogohlantirishlar,
o'quvchi xavfi, **bildirishnoma yetkazish navbati**, lead skoring, avtomatlashtirish, audit
tozalash, takrorlanuvchi xarajatlar, kunlik xulosa.

**Testlar:** 603 backend + 55 frontend + 14 E2E. Hammasi o'tadi.

---

## 2. CURRENT DATABASE

90 jadval, 37 migratsiya. Telegram uchun muhimlari:

| Model | Vazifasi |
|---|---|
| `User` | Xodim/kabinet hisobi. `roleId`, `branchId`, `status`, `deletedAt` |
| `Role`, `Permission`, `RolePermission` | RBAC (9 rol, 100 ruxsat) |
| `Student` | `userId?` (kabinet hisobi ixtiyoriy), `groupId`, `courseId`, `contractPrice`, `healthScore`, `riskLevel` |
| `Parent`, `StudentParent` | Ota-ona **hisobsiz ham bo'lishi mumkin** (`userId?`) — M:N bog'lanish |
| `Group` | `teacherId`, `scheduleDays[]`, `startTime`, `endTime`, `roomId` |
| `Attendance`, `AttendanceSession` | Davomat + dars seansi (`PLANNED/HELD/CANCELLED`) |
| `Homework`, `HomeworkSubmission` | `status`: PENDING/SUBMITTED/LATE/GRADED/MISSED, `attachmentPath` |
| `Exam`, `ExamAttempt`, `ExamAnswer`, `Question` | Imtihon dvigateli, avtomatik baholash |
| `Payment`, `Debt`, `PaymentInstallment`, `Transaction` | Har pul harakati = **aynan bitta** `Transaction` |
| `PaymentIntent` | Onlayn to'lov so'rovi (provayder abstraksiyasi tayyor) |
| `XpTransaction`, `Level`, `Badge` | Gamifikatsiya |
| `Certificate` | QR bilan ochiq tekshiruv |
| `Lead`, `FollowUp`, `Call` | Sotuv voronkasi, lead skoring |
| **`TelegramLink`** | **Mavjud** — chat ↔ CRM bog'lanishi |
| **`NotificationDelivery`** | **Mavjud** — yetkazish navbati (outbox) |
| **`Notification`** | **Mavjud** — ilova ichidagi xabar + `priority` |
| **`NotificationSetting`** | **Mavjud** — tur × kanal bo'yicha sozlama |
| `AuditLog` | `before`/`after` ustunlari, saqlash muddati |
| `Branch` | Multi-branch, `branchAccess.ts` orqali izolyatsiya |

---

## 3. CURRENT API

**346 endpoint**, 41 router. Javob formati allaqachon standart (`telegramBot.md` §50 ga mos):

```json
{ "success": true, "data": {}, "message": null, "meta": {} }
```

Xato: `{ "success": false, "message": "...", "errors": [...] }` + HTTP status.

### Telegram uchun eng muhimlari

| Method | Endpoint | Rol | Vazifasi |
|---|---|---|---|
| POST | `/api/telegram/webhook` | — | Telegram update (imzo bilan) |
| GET/DELETE | `/api/telegram/me` | har kim | O'z bog'lanishi |
| GET | `/api/portal/me` | STUDENT, PARENT | Kim + farzandlar ro'yxati |
| GET | `/api/portal/profile` | STUDENT, PARENT | Profil + davomat/vazifa/imtihon/to'lov jamlanmasi |
| GET | `/api/portal/schedule` | STUDENT, PARENT | To'lov jadvali (qarz, kechikish, keyingi muddat) |
| GET | `/api/portal/lessons` | STUDENT, PARENT | Kelgusi 14 kun darslari + o'qituvchi |
| GET | `/api/portal/curriculum` | STUDENT, PARENT | Kurs dasturi progressi |
| GET | `/api/portal/certificates` | STUDENT, PARENT | Sertifikatlar |
| GET/POST | `/api/portal/feedback` | STUDENT, PARENT | Fikr bildirish |
| GET | `/api/students/:id/attendance/calendar` | `attendance.view` | **Kalendar ko'rinishi** (§10 uchun tayyor) |
| GET | `/api/students/:id/homework` | `homework.view` | Vazifalar ro'yxati |
| GET | `/api/students/:id/exams` | `exam.view` | Imtihon natijalari |
| GET | `/api/students/:id/risk` | `student.view` | Xavf bahosi va sabablari |
| GET | `/api/teachers/me` | TEACHER | O'z profili |
| GET | `/api/groups` , `/api/groups/:id` | `group.view` | Guruhlar (o'qituvchi — faqat o'ziniki) |
| GET/POST | `/api/groups/:id/attendance` | `attendance.mark` | **Davomat olish** (§17 uchun tayyor) |
| POST/PUT | `/api/homework` | `homework.manage` | Vazifa berish |
| PATCH | `/api/homework/:id/submissions/:studentId` | `homework.grade` | Baholash |
| GET | `/api/leads`, `/:id`, `/:id/score` | `lead.view` | Leadlar + skor |
| PATCH | `/api/leads/:id/status`, `/:id/assign` | `lead.manage` | Status va biriktirish |
| GET/PATCH | `/api/follow-ups`, `/:id/complete` | `lead.view` | Follow-up |
| GET | `/api/dashboard/summary`, `/executive` | `dashboard.view` | Rahbar paneli |
| GET | `/api/finance/*`, `/api/reports/*` | `finance.view` | Moliya va hisobotlar |
| GET | `/api/students/at-risk` | `student.view` | Xavf ostidagilar |
| GET | `/api/gamification/leaderboard`, `/students/:id` | `gamification.view` | XP, reyting, nishonlar |
| GET | `/api/search` | har kim | Global qidiruv (ruxsat bo'yicha filtr) |
| POST | `/api/ai/ask` | `ai.assistant` | AI yordamchi (14 xavfsiz tool) |
| GET | `/api/notifications`, `/summary`, `/settings` | har kim | Bildirishnomalar |

---

## 4. CURRENT AUTH & RBAC

**Autentifikatsiya:** `Authorization: Bearer <accessToken>` (JWT) + refresh token httpOnly cookie'da.
Parol — bcrypt, brute-force himoyasi bor (test bilan).

**RBAC:** 9 rol — `telegramBot.md` §5 dagi ro'yxat bilan **aynan bir xil**:

```text
SUPER_ADMIN  OWNER  ADMIN  SALES_MANAGER  CALL_CENTER
TEACHER  ACCOUNTANT  STUDENT  PARENT
```

100 ruxsat, 33 modul (`ai, alerts, analytics, attendance, audit, branches, calls, courses,
dashboard, debts, discounts, employees, exams, feedback, finance, gamification, groups,
homework, hr, inventory, leads, parents, payments, portal, referrals, reports, roles,
salary, settings, students, targets, teachers, users`).

**Ownership** — servis qatlamida, controllerga tashlab qo'yilmagan:

| Kim | Doira | Qayerda |
|---|---|---|
| O'quvchi | faqat o'zi | `resolvePortalScope` → `Student.userId` |
| Ota-ona | faqat o'z farzandlari | `resolvePortalScope` → `StudentParent` |
| O'qituvchi | faqat o'ziga biriktirilgan guruhlar | `teachingAccess.onlyOwnGroups` |
| Manager | o'ziga biriktirilgan leadlar | `leadAccess.ts` |
| Filial | `branch.view_all` bo'lmasa — o'z filiali | `branchAccess.ts` |

---

## 5. CURRENT NOTIFICATION SYSTEM

Bu — auditning eng muhim qismi: **`telegramBot.md` §24–§26 talab qilgan tizim allaqachon bor.**

```text
CRM hodisa
   ↓
notificationService.createManyInTransaction()   ← asosiy amal bilan BIR tranzaksiyada
   ↓
   ├─ Notification (ilova ichida)  ← NotificationSetting.inApp tekshiriladi
   └─ NotificationDelivery (navbat) ← NotificationSetting.telegram tekshiriladi
         ↓
   notificationDelivery.job (har 60 s, 25 talik partiya)
         ↓
   telegramService.sendMessage()
         ↓
   PENDING → SENT | FAILED | SKIPPED
   Qayta urinish: 5 marta, eksponensial backoff (nextAttemptAt)
```

- **14 bildirishnoma turi**, har biri uchun **muhimlik darajasi** (LOW/NORMAL/HIGH) serverda turga qarab qo'yiladi.
- **Sozlama:** har bir tur uchun ilova va Telegram **alohida** yoqib-o'chiriladi (`NotificationSetting`).
  Qator yo'q = yoqilgan. `SYSTEM` turi o'chirilmaydi.
- **Takrorlanmaslik:** `dedupeKey` (`Notification`) va `<dedupeKey>:<channel>` (`NotificationDelivery`).
- **Hisobsiz qabul qiluvchi:** o'quvchi/ota-ona uchun `notifyExternalInTransaction` — faqat tashqi kanal.
- **Telegram o'chirilgan rejim:** token yo'q bo'lsa butun zanjir ishlaydi, faqat yuborilmaydi va logga yoziladi.

**Mavjud bot buyruqlari** (`telegramCommand.service.ts`): `/qarz`, `/darslar`, `/davomat`,
`/holat`, `/uzish`, `/help` + `setMyCommands` menyusi.

---

## 6. WHAT TELEGRAM CAN REUSE

`telegramBot.md` ning talab qilgan ishining **taxminan 60% i allaqachon bor**. Qayta yozilmaydi:

| TZ bandi | Mavjud yechim | Holat |
|---|---|---|
| §6 Account linking (deep link, token) | `TelegramLink` + `/start <kod>` + `t.me/<bot>?start=<kod>` | ✅ bor (lekin **xavfsizligi zaif** — §12 ga qarang) |
| §7 `telegram_accounts` | `TelegramLink` — **kuchliroq**: hisobsiz o'quvchi/ota-onani ham qo'llab-quvvatlaydi | ✅ dublikat yaratilmaydi |
| §7 `telegram_notification_preferences` | `NotificationSetting` — **kuchliroq**: 6 ta qat'iy bayroq emas, 14 tur × 2 kanal | ✅ dublikat yaratilmaydi |
| §7 `telegram_notifications` | `NotificationDelivery` (PENDING/SENT/FAILED/SKIPPED + attempts + backoff) | ✅ dublikat yaratilmaydi |
| §24 Notification events | 14 tur + 7 avtomatlashtirish triggeri | ✅ |
| §25 Notification preferences | Kabinetda va profilda sozlama oynasi | ✅ |
| §26 Queue + retry | `notificationDelivery.job` | ✅ |
| §5 Role system | 9 rol, 100 ruxsat | ✅ |
| §31 Authorization / ownership | `branchAccess`, `leadAccess`, `teachingAccess`, `resolvePortalScope` | ✅ |
| §33 Audit log | `AuditLog` + `before`/`after` | ✅ |
| §35 Branch support | `branchAccess.ts` | ✅ |
| §36 Online payment | `PaymentIntent` + provayder abstraksiyasi + webhook | ✅ arxitektura tayyor |
| §37 Certificate + QR | `Certificate` + ochiq `/verify/:token` | ✅ |
| §38 Referral | `Referral` + kod + bonus | ✅ |
| §39 At-risk engine | `studentRisk.service.ts` (6 signal) | ✅ |
| §40 AI assistant | `POST /api/ai/ask` (14 tool, ruxsat doirasida) | ✅ |
| §50 API response standard | Allaqachon shu format | ✅ |
| §51 Validation | zod 4, har endpointda | ✅ |

---

## 7. WHAT NEW APIs ARE REQUIRED

Faqat **haqiqatan yo'q** bo'lganlari. Mavjudi bilan qoplanadigani ro'yxatga kiritilmadi.

| # | Endpoint | Nega kerak | Bosqich |
|---|---|---|---|
| A1 | `POST /api/portal/homework/:id/submit` | **Hozir o'quvchi vazifa topshira olmaydi** — hech qayerda yo'q. Topshiriq faqat `PENDING` bo'lib ochiladi, o'qituvchi baholaydi | 3 |
| A2 | `GET /api/portal/homework` | Kabinetda ro'yxat yo'q (faqat jamlanma). `students/:id/homework` — xodim ruxsati talab qiladi | 3 |
| A3 | `GET /api/portal/exams` | Xuddi shunday | 3 |
| A4 | `GET /api/portal/attendance` va `/attendance/calendar` | Kalendar ko'rinishi (§10) kabinet ruxsati bilan | 3 |
| A5 | `GET /api/portal/payments` | To'lov tarixi (jadval bor, tarix yo'q) | 3 |
| A6 | `GET /api/portal/gamification` | XP, daraja, streak, reyting o'rni, nishonlar | 3 |
| A7 | `GET /api/teachers/me/today-lessons` | Bugungi darslar (guruh jadvalidan hisoblanadi) | 5 |
| A8 | `POST /api/telegram/broadcast` + `GET /:id` | Ommaviy xabar (§34) — umuman yo'q | 9 |

**Yangi ustun:** `HomeworkSubmission.answerText` (`VarChar(2000)`) — hozir faqat `attachmentPath` bor,
matnli javob saqlanmaydi.

---

## 8. WHAT NEW DATABASE TABLES ARE REQUIRED

TZ §7 dagi 6 ta jadvaldan **4 tasi dublikat** (§6 jadvaliga qarang). Haqiqatan kerak bo'lganlari:

| Jadval | Nega kerak | Bosqich |
|---|---|---|
| `TelegramSession` | Ko'p qadamli oqimlar uchun (o'qituvchi davomat olayotganda, broadcast yozayotganda qaysi qadamda ekani). Hozir bot **holatsiz** — faqat bitta buyruq ↔ bitta javob | 1 |
| `TelegramEvent` | Kiruvchi update jurnali (§7 `telegram_bot_events` + `telegram_message_logs`). Hozir faqat **chiquvchi** xabar yoziladi. Nosozlikni tekshirish uchun kerak | 1 |
| `TelegramRateLimit` yoki Redis | Bitta chat daqiqada N ta so'rov (§31 anti-abuse). Hozir HTTP darajasida limit bor, **chat darajasida yo'q** | 1 |
| `TelegramBroadcast`, `TelegramBroadcastTarget` | §34 — auditoriya, preview, navbat, statistika | 9 |

**`TelegramLink` ga qo'shiladigan ustunlar** (§6 xavfsizlik talabi uchun):

```text
codeExpiresAt  DateTime?   — kod muddati (short-lived)
codeUsedAt     DateTime?   — bir martalik (single-use, replay protection)
failedAttempts Int         — brute-force himoyasi
telegramUserId String?     — chat id emas, foydalanuvchi id (guruh chatida farqlanadi)
lastSeenAt     DateTime?
```

---

## 9. TELEGRAM BOT ARCHITECTURE

**Hal qilinishi kerak bo'lgan asosiy savol — 17-bo'limda.** Ikki variant:

### Variant A — CRM backend ichidagi modul (tavsiya etiladi)

```text
Telegram → webhook → backend/src/telegram/
                        ├── router (update → handler)
                        ├── middleware (auth, rate limit, session)
                        ├── handlers/ (student, parent, teacher, sales, owner)
                        ├── keyboards/ (inline, pagination)
                        └── facade/ → mavjud CRM SERVICE'lari
                                        ↓
                                    PostgreSQL
```

### Variant B — alohida servis (TZ §1 dagi diagramma)

```text
Telegram → telegram-bot (alohida konteyner) → HTTP → CRM REST API → services → PostgreSQL
```

Ikkalasida ham **biznes mantiq faqat bitta joyda** — mavjud CRM servislarida. Bot na XP, na
streak, na qarz, na bildirishnoma mantiqini takrorlamaydi (TZ §18, §58, §60).

---

## 10. ROLE/PERMISSION MATRIX

Yangi ruxsat **yaratilmaydi** (TZ §5). Har amal mavjud ruxsat orqali tekshiriladi.

| Bot amali | Mavjud ruxsat | Ownership |
|---|---|---|
| Profil, davomat, vazifa, imtihon, to'lov | `portal.student` | `Student.userId` = o'zi |
| Farzandlar, farzand tanlash | `portal.parent` | `StudentParent` |
| Guruhlar, bugungi darslar | `group.view` | `onlyOwnGroups` |
| Davomat olish | `attendance.mark` | `onlyOwnGroups` |
| Vazifa berish | `homework.manage` | `onlyOwnGroups` |
| Imtihon natijasi kiritish | `exam.grade` | `onlyOwnGroups` |
| Leadlar, follow-up | `lead.view` | `leadAccess` |
| Lead statusini o'zgartirish | `lead.manage` | `leadAccess` |
| Rahbar paneli | `dashboard.view` + `finance.view` | `branchAccess` |
| Qarzdorlar | `debt.view` | `branchAccess` |
| At-risk | `student.view` | `branchAccess` |
| AI yordamchi | `ai.assistant` | tool ichida ruxsat |
| Broadcast | **yangi** `settings.manage` ostida | `branchAccess` |

---

## 11. NOTIFICATION EVENT MATRIX

TZ §24 dagi hodisalarni mavjud turlar bilan solishtirish:

| TZ hodisasi | Mavjud `NotificationType` | Holat |
|---|---|---|
| ATTENDANCE_ABSENT, CHILD_ABSENT | `CHILD_ABSENT` | ✅ |
| HOMEWORK_CREATED / DEADLINE / GRADED | — | ❌ yangi |
| EXAM_CREATED / EXAM_RESULT | — | ❌ yangi |
| PAYMENT_RECEIVED | `NEW_PAYMENT` | ✅ |
| PAYMENT_DUE | `PAYMENT_DUE_SOON` | ✅ |
| PAYMENT_OVERDUE | `DEBT_REMINDER` | ✅ |
| XP_EARNED, BADGE_EARNED, LEVEL_UP | — | ❌ yangi |
| CERTIFICATE_ISSUED | — | ❌ yangi (avtomatlashtirishda `CERTIFICATE_ELIGIBLE` bor) |
| CHILD_AT_RISK | `STUDENT_RISK_CRITICAL` (avtomatlashtirish) | ✅ |
| NEW_LEAD, HOT_LEAD | `NEW_LEAD`, `LEAD_ASSIGNED` | ✅ |
| FOLLOW_UP_DUE / OVERDUE | `FOLLOW_UP_REMINDER`, `FOLLOW_UP_OVERDUE` | ✅ |
| TRIAL_BOOKED / REMINDER | `TRIAL_LESSON_REMINDER` | ✅ |
| DAILY_REPORT | `DAILY_DIGEST` | ✅ |
| SYSTEM_ALERT | `SYSTEM` | ✅ |
| NEGATIVE_FEEDBACK | `NEGATIVE_FEEDBACK` | ✅ (TZ da yo'q, bizda bor) |

**Xulosa:** 14 turdan 10 tasi qoplangan. Yangi 4–6 tur qo'shiladi (8-bosqich).

---

## 12. SECURITY PLAN

### ⚠️ Topilgan nuqson — bog'lash kodi o'g'irlanishi (JIDDIY)

`telegramLink.service.ts` da `/start <kod>` ishlovchisi `verifiedAt` ni **o'qiydi, lekin
tekshirmaydi**. Natija:

1. Kodning **muddati yo'q** — bir marta yaratilgan kod abadiy amal qiladi;
2. Kod **bir martalik emas** — allaqachon bog'langan kod bilan **boshqa chat** o'zini bog'lay oladi
   va eski chat uziladi;
3. Kod CRM interfeysida ochiq ko'rinadi (ekran surati, skrinshot ulashish) — bu real yo'l;
4. Urinishlar soni cheklanmagan — 16 belgili kodni izlash amalda qiyin, lekin himoya yo'q.

**Oqibat:** kodni ko'rgan har kim o'sha o'quvchi/ota-ona/xodimning barcha Telegram
bildirishnomalarini (qarz, davomat, farzand ma'lumoti) o'ziga burib yuborishi mumkin.

**Tuzatish (2-bosqich, birinchi navbatda):** `codeExpiresAt` (15 daqiqa), `codeUsedAt`
(bir martalik), `failedAttempts`, va `verifiedAt !== null` bo'lsa kodni rad etish.

> ✅ **Tuzatildi** (PHASE 2, `238f3c0`). Urinishlar chegarasi jadval ustuni emas, xotirada —
> CRM bitta jarayonda ishlaydi. To'liq holat: [telegram-security.md](telegram-security.md).

### Qolgan choralar

| Tahdid | Chora |
|---|---|
| Webhook soxtalashtirish | `X-Telegram-Bot-Api-Secret-Token` + `timingSafeEqual` — ✅ bor |
| Soxta callback (§32) | Callback `chatId` dan kelgan **egalik** qayta tekshiriladi, callback ichidagi ID ga ishonilmaydi |
| Chat darajasida flood | `TelegramRateLimit` / Redis — ❌ yangi |
| Begona chat | Tasdiqlanmagan chatga **buyruqlar ro'yxati ham** ko'rsatilmaydi — ✅ bor |
| Egasi o'chirilgan | Bog'lanish avtomatik yopiladi — ✅ bor |
| Maxfiy ma'lumot logda | Token, kod, parol loglanmaydi (§45) |
| Audit | Har bog'lash/uzish/davomat/lead amali `AuditLog` ga |

---

## 13. DEVELOPMENT PHASES

TZ §56 tartibi, mavjud holatga moslashtirilgan:

| Bosqich | Ish | Baho |
|---|---|---|
| **1. Poydevor** | Update router, session, inline keyboard infratuzilmasi, rate limit, event jurnali, xato ishlovchisi, `/start` + asosiy menyu | Katta |
| **2. Linking xavfsizligi** | Kod muddati, bir martalik, urinish chegarasi, `telegramUserId`, qayta bog'lash oqimi | O'rta |
| **3. Student bot** | Profil, jadval, davomat (kalendar), vazifa (+topshirish), imtihon, XP, to'lov, sertifikat | Katta |
| **4. Parent bot** | Farzandlar, farzand tanlash, barcha ko'rsatkichlar | O'rta |
| **5. Teacher bot** | Guruhlar, bugungi darslar, tezkor davomat, vazifa berish | Katta |
| **6. Sales bot** | Leadlar, hot leadlar, follow-up, status o'zgartirish | O'rta |
| **7. Owner bot** | Kunlik panel, moliya, qarzdorlar, at-risk, KPI | O'rta |
| **8. Notification** | Yangi turlar (homework, exam, XP, certificate) | Kichik |
| **9. Broadcast** | Auditoriya, preview, navbat, statistika | O'rta |
| **10–12** | To'lov, sertifikat/referral, AI — API lar tayyor, faqat bot interfeysi | Kichik |
| **13–15** | Xavfsizlik auditi, testlar, production | O'rta |

---

## 14. FILES THAT WILL BE CREATED/CHANGED

### PHASE 1 (faqat shu bosqich)

**Yangi:**
```text
backend/src/telegram/router.ts              — update → handler yo'naltirish
backend/src/telegram/context.ts             — chat konteksti (scope, session, reply)
backend/src/telegram/session.service.ts     — ko'p qadamli oqim holati
backend/src/telegram/rateLimit.ts           — chat darajasidagi chegara
backend/src/telegram/keyboards.ts           — inline keyboard + pagination
backend/src/telegram/handlers/menu.ts       — /start, /help, asosiy menyu
backend/src/telegram/errors.ts              — foydalanuvchiga xavfsiz xato matni
backend/prisma/migrations/*_telegram_foundation/
backend/tests/telegramFoundation.test.ts
docs/telegram-architecture.md
```

**O'zgaradi:**
```text
backend/prisma/schema.prisma                — TelegramSession, TelegramEvent, TelegramRateLimit
backend/src/services/telegram.service.ts    — answerCallbackQuery, editMessageText qo'shiladi
backend/src/services/telegramLink.service.ts— handleUpdate yangi routerga o'tadi
backend/src/services/telegramCommand.service.ts — mavjud buyruqlar menyuga ko'chadi
```

---

## 15. RISKS

| Xavf | Ehtimol | Yechim |
|---|---|---|
| **Bog'lash kodi o'g'irlanishi** (§12) | Yuqori | 2-bosqichda darhol tuzatiladi |
| Mavjud 603 test buzilishi | O'rta | Har bosqichda to'liq to'plam; mavjud test o'chirilmaydi/bo'shashtirilmaydi |
| Telegram rate limit (30 msg/s) | Yuqori | Navbat + chat darajasida chegara + partiyali yuborish |
| Ko'p qadamli oqimda holat yo'qolishi | O'rta | `TelegramSession` muddati bilan (30 daqiqa), tugamagan oqim bekor qilinadi |
| Guruh chatida bot | O'rta | Faqat shaxsiy chat; guruhda buyruq ishlamaydi |
| Bot javobida begona ma'lumot | Yuqori | Har javob `resolveCommandScope` orqali; testda tekshiriladi |
| Token `.env` da, GitHub'ga ketishi | Yuqori | `.gitignore` da; `.env.example` ga faqat nom |
| Telefon ekranida uzun xabar | O'rta | Pagination, `MAX_MESSAGE_LEN` bo'yicha bo'lish |

---

## 16. RECOMMENDED MVP

TZ §57 bo'yicha, lekin mavjud holatni hisobga olib. **MVP = 1, 2, 3, 5-bosqichlar:**

```text
Student:  /start · Profil · Jadval · Davomat · Vazifa (ko'rish + topshirish) · To'lov · Bildirishnoma
Parent:   Farzandlar · Farzand tanlash · Davomat · Vazifa · To'lov · Bildirishnoma
Teacher:  Guruhlar · Bugungi darslar · Tezkor davomat
```

Sales va Owner (6, 7) keyingi bosqichda — ular uchun xodim CRM'ga kira oladi, o'quvchi va
ota-ona esa kira olmaydi. **Shuning uchun eng katta qiymat — student/parent tomonda.**

---

## 17. NEXT IMPLEMENTATION STEP

**Hal qilinishi kerak:** 9-bo'limdagi Variant A yoki B.

| | Variant A — backend ichida modul | Variant B — alohida servis |
|---|---|---|
| TZ §1 diagrammasi | ✗ mos kelmaydi (bot servislarni to'g'ridan chaqiradi) | ✓ aynan mos |
| TZ §58/§60 (bitta source of truth) | ✓ | ✓ |
| Hisobsiz ota-ona | ✓ ishlaydi | ✗ JWT yo'q — **impersonatsiya kerak** |
| Xavfsizlik | ✓ mavjud ownership qatlamlari | ✗ botga "hamma narsaga" xizmat tokeni kerak — TZ §31 ga zid |
| Ish murakkabligi | O'rta | Yuqori (+konteyner, +Redis, +token oqimi, +monitoring) |
| Kechikish | Bitta jarayon | +1 HTTP sakrash |
| Kelajakda ajratish | Facade qatlami orqali mumkin | Allaqachon ajratilgan |

**Mening tavsiyam — Variant A**, quyidagi sabab bilan: TZ ning §1 dagi qoidasi **maqsadi**
(§58, §60 da aytilgan) — "biznes mantiq ikki joyda bo'lmasin". Variant A bunga to'liq amal qiladi:
bot faqat mavjud servislarni chaqiradi, hech nimani qayta yozmaydi.

Variant B esa yangi va **kattaroq** xavf tug'diradi: hisobi yo'q ota-onalar uchun bot
boshqa foydalanuvchi nomidan so'rov yuborishi kerak bo'ladi — ya'ni botga keng vakolatli
xizmat tokeni beriladi. Bu TZ §31 ("har request: User → Role → Permission → Ownership")
ning o'zini zaiflashtiradi.

Ajratish kerak bo'lsa, `telegram/facade/` qatlami tufayli keyin ham mumkin — faqat o'sha
qatlam HTTP ga o'tadi, handlerlar o'zgarmaydi.
