# Academy CRM 3.0 — PHASE 0: CURRENT STATE hisoboti

Sana: 2026-09-24. Manba: `promt3.md` (81 bo'lim, 16 faza). Tekshiruv usuli: **faqat manba kod** (TZ §2 — PDF emas, kod haqiqiy holat). Har bir xulosa `fayl:qator` bilan berilgan. Bu bosqichda **kod yozilmadi** (TZ §79).

Belgilar: ✅ bor va ishlaydi · 🟡 qisman · ❌ yo'q · ♻️ qayta ishlatiladi

---

## 0. Qisqa xulosa

| Soha | Holat | Izoh |
|---|---|---|
| Backend arxitektura, auth, RBAC, audit | ✅ | Kuchli poydevor, qayta yozish kerak emas |
| Student / Parent auth | ✅ | Bitta `User` modeli, `STUDENT`/`PARENT` rollari, staff ochadi |
| Student portal API | ✅ | 15 endpoint, ownership servisda tekshiriladi |
| Student portal UI | 🟡 | Bitta sahifa; 7 ta API'ga UI yo'q (vazifa, imtihon, davomat, to'lov, XP) |
| Parent portal | 🟡 | Farzand tanlash bor, alohida sahifa/hisobot yo'q |
| LMS (Module → Topic) | 🟡 | `Lesson`, `Material` modeli yo'q; mavzu darsga bog'lanmaydi |
| Uy vazifasi | 🟡 | Guruhga; javob matni/fayl saqlanadi, lekin **o'qituvchi ko'ra olmaydi**; RETURNED, rubric, AI yo'q |
| Imtihon | 🟡 | Savol banki, urinish, avto-baholash bor; **o'quvchi o'zi topshira olmaydi**; blueprint, variant, vaqt oynasi yo'q |
| Progress / mastery | 🟡 | Kurs %, mavzu holati qo'lda; mastery ball yo'q; snapshot jadvali **hech qachon yozilmaydi** |
| Risk engine | ✅ | 6 omil, 4 daraja, 30 daqiqada qayta hisob |
| Teacher control center | 🟡 | Alohida o'qituvchi paneli yo'q; xodim sahifalari scope bilan |
| AI | 🟡 | LLM **yo'q**; kalit so'z → tool (14 ta, biznes); akademik AI yo'q |
| Notifications | 🟡 | 19 tur, in-app + Telegram; deadline, kech kelish, past ball, risk (oilaga) yo'q |
| Telegram | ✅ | 6 handler, ruxsatga qarab menyu; 11 band qolgan (§43) |
| Search | ✅ | 10 entity, portalda yo'q |
| Analytics | 🟡 | Biznes analitika kuchli; mavzu/savol/uy vazifasi analitikasi yo'q |
| Automation | 🟡 | 7 ta qattiq qoida; builder, Task modeli yo'q |
| UX/PWA/dark | ✅ | Tailwind 4, PWA, dark mode; focus-trap yo'q |
| Testlar | ✅/🟡 | Backend 96 fayl (684 test); frontend 9 fayl; E2E 14 |
| Observability | 🟡 | pino, request-id, slow-log, health; Sentry/metrics yo'q |

---

## 1. CURRENT ARCHITECTURE

**Monorepo** (npm workspaces): `backend/` + `frontend/` + `e2e/`.

| Qatlam | Texnologiya | Manba |
|---|---|---|
| Runtime | Node 22.12, TypeScript strict, ESM | `package.json` engines |
| Framework | Express 5.2 | `backend/src/app.ts` |
| ORM | Prisma 7.10 + `@prisma/adapter-pg` | `backend/prisma/schema.prisma` (3229 qator) |
| DB | PostgreSQL 17.11 | |
| Auth | JWT access + rotatsiyalanuvchi refresh (httpOnly cookie) | `services/auth.service.ts` |
| Validation | zod 4.6 — 46 validator fayl | `backend/src/validators/` |
| Logging | pino + pino-http, request-id, redaction | `utils/logger.ts`, `middleware/requestLogger.ts` |
| Rate limit | express-rate-limit: api 300/min, auth 10/15min, heavy 30/min, webhook 1200/min | `middleware/rateLimiter.ts` |
| Security headers | helmet (CSP, HSTS prod), CORS credentials | `app.ts:25-42` |
| Jobs | 10 ta in-process `setInterval` | `backend/src/jobs/` |
| Queue | DB outbox `NotificationDelivery` (5 urinish, kvadratik backoff) | `services/notificationDelivery.service.ts` |
| Frontend | React 19.3, Vite 8, react-router 7 (lazy), TanStack Query 5, zustand 5, RHF + zod, Tailwind 4, recharts | `frontend/package.json` |
| E2E | Playwright (desktop + Pixel 7) | `playwright.config.ts` |
| CI/CD | GitHub Actions (typecheck, lint, test, build, e2e) + deploy | `.github/workflows/` |
| Docker | multi-stage backend (node 24-alpine), nginx frontend | `backend/Dockerfile`, `frontend/Dockerfile` |

**Qatlamlar:** `routes → middleware(authenticate, requirePermission) → controllers (45) → services (76) → prisma`. Repository qatlami yo'q (Prisma bevosita servisda). Biznes mantiq faqat servisda — Telegram va portal ham shu servislarni chaqiradi (TZ §0.2 bajarilgan).

**Fayl soni:** controllers 45, services 76, routes 42, validators 46, middleware 7, jobs 10, telegram 9.

---

## 2. CURRENT DATABASE

92 model, 63 enum, 43 migration, 210 `@@index` + 22 `@@unique`. Soft delete: `User`, `Student` (`deletedAt`). Audit: `AuditLog` (before/after/metadata, IP, UA).

### TZ §3.3 da so'ralgan modellar

| TZ modeli | Kodda | Holat | Izoh |
|---|---|---|---|
| User | `User` | ✅ | role, status, branch, passwordChangedAt |
| Student | `Student` | ✅ | `userId?` → portal hisobi; risk maydonlari |
| Parent | `Parent` + `StudentParent` | ✅ | `userId?` → portal hisobi; relation, isPrimary |
| Teacher | `User(role TEACHER)` + `TeacherProfile` | ✅ | Guruhga `Group.teacherId` (bitta o'qituvchi) |
| Course | `Course` | ✅ | |
| Group | `Group` | ✅ | scheduleDays, start/endTime, capacity, branch |
| Lesson | `AttendanceSession` | 🟡 | Bu **dars sessiyasi** (sana, mavzu, holat), LMS kontenti emas |
| Attendance | `Attendance` | ✅ | PRESENT/ABSENT/LATE/EXCUSED |
| Homework | `Homework` | 🟡 | title, description, course?, group, teacher?, deadline, maxPoints, xpReward, attachmentPath (API yozmaydi), status DRAFT/PUBLISHED/CLOSED |
| HomeworkSubmission | `HomeworkSubmission` | 🟡 | PENDING/SUBMITTED/LATE/GRADED/MISSED; answerText, attachmentPath, score, feedback |
| Exam | `Exam` | 🟡 | date (faqat sana), maxScore, passScore, durationMinutes, maxAttempts; **tur enum yo'q** |
| ExamQuestion | `Question` + `QuestionOption` + `ExamQuestion` | ✅ | Savol banki: course, topic?, difficulty, points |
| ExamAttempt | `ExamAttempt` + `ExamAnswer` | ✅ | IN_PROGRESS/EXPIRED/SUBMITTED/NEEDS_REVIEW/GRADED |
| Payment | `Payment`, `Debt`, `PaymentInstallment`, `PaymentIntent` | ✅ | |
| Notification | `Notification` + `NotificationDelivery` + `NotificationSetting` | ✅ | priority, dedupeKey |
| Certificate | `Certificate` | ✅ | verifyToken, revoke |
| Curriculum | `CourseModule` → `CourseTopic` → `StudentTopicProgress` | 🟡 | Mavzu holati qo'lda; **Lesson/Material yo'q** |
| XP | `GamificationProfile`, `XpRule`, `XpTransaction`, `Streak` | ✅ | |
| Level | `Level`, `Badge`, `StudentBadge` | ✅ | |

**Ishlatilmayotgan model:** `StudentProgressSnapshot` — jadval bor, `src/` da unga hech kim yozmaydi (Agent tekshiruvi: 0 ta murojaat).

**Yo'q modellar (TZ talab qiladi):** Lesson (LMS), Material, Rubric, ExamBlueprint, TopicMastery (ball), AiAnalysis / AiReview, Task, AcademySettings.

---

## 3. CURRENT API

Jami **368 endpoint**, 42 route fayl, `/api` prefiksi (`routes/index.ts`). Hammasi `authenticate` + `requirePermission` bilan (auth, health, verify va webhook bundan mustasno).

### Akademik yo'nalish (TZ uchun muhim)

| Method | Endpoint | Ruxsat | Vazifa |
|---|---|---|---|
| GET/POST | `/homework` | homework.view / manage | ro'yxat, yaratish (guruhga) |
| PUT/DELETE | `/homework/:id` | homework.manage | |
| PUT | `/homework/:id/submissions` | homework.grade | ommaviy baholash |
| PATCH | `/homework/:id/submissions/:studentId` | homework.grade | bitta baholash |
| GET/POST/PUT/DELETE | `/exams(/:id)` | exam.view/manage | |
| PUT | `/exams/:id/results` | exam.grade | qo'lda natija |
| POST/GET | `/exams/:id/questions` | exam.manage/view | savol biriktirish (random: count+topic+difficulty) |
| POST | `/exams/:id/attempts/:studentId/start` | **exam.grade** | urinish boshlash — o'quvchi ruxsati yo'q |
| POST | `/exams/:id/attempts/:studentId` | **exam.grade** | topshirish |
| GET | `/exams/:id/attempts`, `/exams/attempts/:id` | exam.view | |
| POST | `/exams/attempts/:id/grade` | exam.grade | matnli javobni baholash |
| GET/POST/PUT | `/questions` | exam.view/manage | savol banki (delete yo'q) |
| GET | `/courses/:id/curriculum`, POST `/courses/:id/modules` | course.view/manage | |
| PUT/POST | `/curriculum/modules/:id`, `/curriculum/modules/:id/topics`, `/curriculum/topics/:id` | course.manage | |
| POST | `/curriculum/topics/:id/mark` | course.manage yoki attendance.mark | mavzuni bajarildi deb belgilash |
| GET | `/students/:id/profile|homework|exams|risk|curriculum` | student.view / homework.view / exam.view | |
| GET | `/students/at-risk` | student.view | |
| GET | `/gamification/*` | gamification.view/manage | |
| GET/POST | `/ai/tools`, `/ai/history`, `/ai/ask` | ai.assistant | |
| GET/PUT/POST | `/automation`, `/automation/runs`, `/automation/:key`, `/automation/run` | alert.view/manage | yaratish yo'q |
| GET | `/search` | (ruxsatga qarab guruhlanadi) | 10 entity |

### Portal API (`/api/portal`, ruxsat `portal.student` yoki `portal.parent`)

`GET /me, /profile, /schedule, /lessons, /curriculum, /certificates, /homework, /exams, /attendance/calendar, /gamification, /payments, /feedback` · `POST /homework/:id/submit, /homework/:id/attachment, /feedback`.

Ownership: `resolvePortalScope(actor)` (`portal.service.ts:74-108`) → student: `Student.userId = actor.id`; parent: `StudentParent` orqali farzandlar; `requireOwnStudent` (`:111-121`) begona `studentId` ga 403.

**Frontend chaqirmaydigan portal endpointlar (7 ta):** `/homework`, `/homework/:id/submit`, `/homework/:id/attachment`, `/exams`, `/attendance/calendar`, `/gamification`, `/payments` (`frontend/src/services/portal.service.ts` 45 qator, faqat me/profile/schedule/lessons/curriculum/certificates).

---

## 4. CURRENT AUTH

| Talab (TZ §5) | Holat | Manba |
|---|---|---|
| Login / logout / session | ✅ | `auth.routes.ts:15-25`; access JWT + refresh cookie (httpOnly, sameSite strict); refresh oilasi, reuse-detection 30 s grace, `auth.refresh_token_reuse` audit |
| Forgot / reset password | ✅ | `PasswordResetToken` (hash, bir martalik), email orqali; reset → barcha refresh bekor |
| Change password | ✅ | boshqa sessiyalar bekor, `passwordChangedAt` dan oldingi tokenlar rad |
| Lockout | ✅ | 15 daqiqada 8 xato (audit `auth.login_failed`), IP limit ustiga |
| Student auth | ✅ | Alohida mexanizm **yo'q va kerak emas**: `User(role STUDENT)`, `POST /students/:id/portal-account` (portal.manage) — vaqtinchalik parol bir marta qaytadi |
| Parent auth | ✅ | `User(role PARENT)`, `POST /parents/:id/portal-account`; farzandsiz ota-onaga hisob ochilmaydi |
| Teacher auth | ✅ | Oddiy xodim (`TEACHER` roli) |
| Sessiya boshqaruvi | ✅ | `POST /auth/logout-all` |
| 2FA | ❌ | TZ talab qilmaydi |

**Xulosa:** TZ §5 "mavjud auth yetarli bo'lsa qayta yozma" — **yetarli**. PHASE 1 da auth kodi o'zgarmaydi.

---

## 5. CURRENT RBAC

- 90 ruxsat (`config/permissions.ts`), rol → ruxsat DB'da (`RolePermission`), `npm run db:sync-permissions` bilan sinxron.
- Rollar: OWNER, ADMIN, MANAGER, CALL_CENTER, TEACHER, ACCOUNTANT, HR, STUDENT, PARENT (va h.k.).
- `STUDENT` roli faqat `portal.student`, `PARENT` faqat `portal.parent`; xodim portalga kira olmaydi (`portal.test.ts:164`).
- Frontend `PermissionGate` — faqat UI, backend haqiqiy nazorat (TZ §6 "hidden button security emas" — bajarilgan).

### TZ §3.5 ruxsatlar moslashuvi

| TZ nomi | Kodda | Holat |
|---|---|---|
| student.read.self | `portal.student` | ✅ (nom farq qiladi) |
| student.read | `student.view` | ✅ |
| homework.create / read / grade | `homework.manage` / `homework.view` / `homework.grade` | ✅ |
| exam.create / grade | `exam.manage` / `exam.grade` | ✅ |
| exam.start | ❌ | O'quvchi imtihon boshlash ruxsati yo'q (`exam.grade` talab qilinadi) |
| parent.read.child | `portal.parent` | ✅ |

**Duplicate yaratmaslik:** yangi ruxsat faqat `exam.start`-ga o'xshash haqiqiy bo'shliqlar uchun; qolganlari mavjud.

### Ownership (TZ §6)

| Sub'ekt | Qoida | Qayerda | Holat |
|---|---|---|---|
| Student | faqat o'zi | `portal.service.ts:74-121` | ✅ |
| Parent | faqat farzandlari | o'sha yerda | ✅ |
| Teacher | faqat o'z guruhlari | `homework.service.ts:176-190` (`getTeachingAccess`, `assertGroupVisible`) + 7 servisda **alohida nusxa** | 🟡 |
| Manager | faqat o'z leadlari | `services/leadAccess.ts` | ✅ |
| Owner / Admin | filial scope | `services/branchAccess.ts` (13 servisda) | ✅ |

**Topilgan nomuvofiqliklar:**
1. **`examAttempt.service.ts` guruh scope tekshirmaydi** — `exam.grade` ruxsati bor har kim istalgan imtihon urinishini boshlashi/baholashi mumkin (Agent A, B6).
2. Teaching scope 8 servisda ko'chirilgan: homework/exam `!GROUP_MANAGE` bo'yicha, boshqalari (`group`, `student`, `attendance`, `attendanceSession`, `attendanceAnalytics`, `parent`, `search`) `!manage && ATTENDANCE_MARK` bo'yicha — bitta modulga yig'ish kerak (TZ §0.2).
3. `debtService.list` va `alertService.list` filial scope olmaydi — veb'da ham, botda ham (`payment.controller.ts:73`, `telegram/handlers/owner.ts:109,156`).

---

## 6. CURRENT STUDENT SYSTEM

| TZ §7 bo'lim | Backend | Frontend (portal) |
|---|---|---|
| 🏠 Dashboard | ✅ `/portal/profile` (davomat %, vazifa %, imtihon o'rtacha, XP, level, qarz, 6 oylik trend) | 🟡 `PortalPage.tsx` — bitta sahifa, kartalar |
| 📚 My Course | ✅ profile ichida | 🟡 |
| 📅 Schedule | ✅ `/portal/lessons` (14 kun) | ✅ `LessonsCard` |
| ✅ Attendance | ✅ `/portal/attendance/calendar` | ❌ UI yo'q |
| 📝 Homework | ✅ list + submit (matn, fayl PDF/PNG/JPG/WEBP ≤ MAX_UPLOAD_MB) | ❌ UI yo'q (faqat Telegram) |
| 🎯 Exams | 🟡 `/portal/exams` — faqat natijalar | ❌ UI yo'q; **topshirish yo'q** |
| 📊 Progress | ✅ profile trend | 🟡 faqat stat |
| 📈 Curriculum | ✅ `/portal/curriculum` | ✅ `CurriculumCard` |
| ⭐ XP / 🏆 Achievements | ✅ `/portal/gamification` | 🟡 `AchievementsCard` (profile'dan) |
| 💳 Payments | ✅ `/portal/payments`, `/portal/schedule` | ❌ UI yo'q |
| 📜 Certificates | ✅ | ✅ `MyCertificatesCard` |
| 🔔 Notifications | ✅ `/notifications/*` (ruxsat talab qilmaydi) | ❌ `PortalLayout` da qo'ng'iroq yo'q |
| 👨‍🏫 Teacher | ✅ lessons ichida ism + mutaxassislik | 🟡 |
| ⚙️ Settings | ✅ change-password, notification settings, Telegram link | 🟡 faqat `TelegramLinkCard` |
| Streak, Risk status, Next exam, Pending homework (§8) | 🟡 risk faqat xodimga (`/students/:id/risk`), portalda yo'q | ❌ |

`PortalLayout.tsx` — sarlavha + chiqish, **navigatsiya yo'q**, bitta marshrut `/portal`.

---

## 7. CURRENT PARENT SYSTEM

- Farzandlar: `GET /portal/me` → `children[]`; `?studentId=` bilan almashtirish; begona farzand → 403 (`portal.test.ts:62,92`).
- Frontend: `PortalPage` ichida farzand tanlash (`activeChild`), o'sha kartalar.
- Telegram: `/farzand` tanlash, `activeStudentId` sessiyada saqlanadi, CHILD_ABSENT, to'lov eslatmalari.
- **Yo'q:** haftalik hisobot (TZ §11), alohida parent dashboard, ota-onaga in-app xabar portali, o'qituvchi fikri.

---

## 8. CURRENT HOMEWORK SYSTEM

| TZ | Holat | Dalil |
|---|---|---|
| §15 maydonlar: Topic, Lesson, Difficulty, Attachments | ❌ topic/lesson/difficulty yo'q; `attachmentPath` API orqali **hech qachon yozilmaydi** (`homework.validator.ts:29-53`) | 🟡 |
| §15 Target: guruh / tanlangan / bitta o'quvchi | ❌ faqat butun guruh (`ensureSubmissions`, `homework.service.ts:196-209`); keyin qo'shilgan o'quvchiga submission yaratilmaydi | 🟡 |
| §16 guruhga avtomatik + notification | ✅ `HOMEWORK_CREATED` oilaga (in-app + TG) | ✅ |
| §17 statuslar | PENDING≈NOT_STARTED, SUBMITTED, LATE, GRADED≈CHECKED, MISSED; **IN_PROGRESS, RETURNED yo'q**; MISSED avtomatik qo'yilmaydi | 🟡 |
| §18 topshirish: Text, Image, PDF, File, Link, Code | Text ✅, Image/PDF ✅ (magic-byte tekshiruv), File (boshqa) ❌, Link ❌, Code ❌ (matn sifatida mumkin); bitta fayl | 🟡 |
| §19 o'qituvchi ko'radi: javob, fayl | ❌ **`SubmissionDto` da `answerText`/`attachmentPath` yo'q** (`homework.service.ts:52-64`), faylni beruvchi endpoint yo'q | ❌ |
| §19 Return / resubmission | ❌ GRADED bo'lsa qayta topshirish rad (`:305`) | ❌ |
| §20 Rubric | ❌ | ❌ |
| §34 AI checker | ❌ | ❌ |
| Baholash + XP + notification | ✅ `grade`/`bulkGrade`, `HOMEWORK_GRADED`, XP faqat o'z vaqtida topshirilganga | ✅ |
| Telegram topshirish (matn/rasm/hujjat) | ✅ `handlers/student.ts:431-449` → `submitByStudent` (bitta servis, TZ §44 bajarilgan) | ✅ |
| Portal topshirish UI | ❌ | ❌ |

---

## 9. CURRENT EXAM SYSTEM

| TZ | Holat | Dalil |
|---|---|---|
| §21 Assessment turlari | ❌ tur enum yo'q | |
| §22 Savol banki | ✅ `Question` (course, topic?, difficulty, points, answerHint, isActive), `QuestionOption` | |
| §22 Savol turlari | SINGLE_CHOICE, MULTIPLE_CHOICE, TEXT ✅; TRUE_FALSE (SINGLE bilan), SHORT/LONG_TEXT (TEXT bilan), CODE ❌, FILE_UPLOAD ❌ | 🟡 |
| §22 Tags, Explanation | ❌ | |
| §23 Random | 🟡 **bor**: biriktirishda `random {count, topicId?, difficulty?}` (`examAttempt.service.ts:188-207`) — bitta filtr, imtihon darajasida. **Har o'quvchiga alohida variant yo'q** | 🟡 |
| §24 Blueprint (mavzu % + qiyinlik %) | ❌ | |
| §25 duration, maxAttempts | ✅ | `Exam.durationMinutes`, `maxAttempts`; vaqt o'tsa EXPIRED |
| §25 startAt / endAt | ❌ faqat `date` | |
| §25 savol/javob tartibini aralashtirish | ❌ `sortOrder` bo'yicha | |
| §25 snapshot | 🟡 faqat `ExamQuestion.points`; savol matni ko'chirilmaydi; urinish boshlangach tarkib qulflanadi (`:185-187`) | |
| Avto-baholash | ✅ tanlovli — to'liq mos bo'lsa ball (qisman yo'q); TEXT → NEEDS_REVIEW; qo'lda `grade` | ✅ |
| Natija → `ExamResult`, baho 5/4/3/2, XP, `EXAM_RESULT` | ✅ | |
| Mavzu bo'yicha kuchli/zaif (60/85) | ✅ hisoblanadi, saqlanmaydi, chegaralar qattiq | 🟡 |
| **O'quvchi o'zi topshirishi** | ❌ start/submit `exam.grade` talab qiladi; portal/bot faqat natija | ❌ |
| Frontend | O'qituvchi: `ExamsPage`, `ExamQuestionsModal`, `QuestionsPage` ✅; **o'quvchi UI yo'q** | 🟡 |

**Oldingi hisobotga tuzatish:** `docs/TZ.html` da "tasodifiy savol tanlash topilmadi" deyilgan edi — bu noto'g'ri, imtihon darajasida mavjud. Yo'q bo'lgani: o'quvchi-variant, blueprint, tartib aralashtirish.

---

## 10. CURRENT TELEGRAM

Bot backend ichida modul (`backend/src/telegram/`), 6 handler, ruxsatga qarab menyu, sessiya oqimlari, rate-limit, audit. Batafsil: `docs/telegram-architecture.md`, `docs/TELEGRAM-BOT-AUDIT.md`.

### TZ §43 prioritet ro'yxati

| Band | Holat |
|---|---|
| Online Exam | ❌ (`/imtihon` faqat natija) |
| Search | ❌ |
| Settings | ❌ |
| Teacher KPI | ❌ (faqat owner panelida `salaryDue`) |
| Marketing | ❌ |
| Reports | ❌ |
| Homework Attachments (o'qituvchi tomon) | ❌ (o'quvchi tomoni ✅) |
| Homework baholash botdan | ❌ |
| Broadcast Media | ❌ |
| Call logging | ❌ |
| Follow-up creation | ❌ (faqat ro'yxat + bajarish) |

Mavjud: `/start /menu /help /holat /uzish /profil /davomat /vazifa (+topshirish) /imtihon /xp /sertifikat /qarz /farzand /guruhlar /bugun (+davomat) vazifa yaratish /leadlar /followup /panel /qarzdorlar xavf ogohlantirish /xabar (broadcast) /taklif /ai to'lov holati`.

---

## 11. CURRENT AI

- `services/ai/assistant.service.ts` + `tools.ts`: **til modeli yo'q** — savol normalizatsiya → kalit so'z bo'yicha tool tanlash → mavjud servis → matnli javob. Deterministik, tashqi API kalitsiz.
- 14 tool, har birida o'z ruxsati (`revenue_today, revenue_month, period_comparison, debt_summary, top_courses_revenue, at_risk_students, manager_conversion, marketing_channels, students_count, attendance_summary, low_stock, nps_summary, today_followups, new_leads`).
- Xavfsizlik (TZ §58) ✅: whitelist toollar, raw SQL yo'q, filial konteksti, ruxsat qayta tekshiriladi, `AiQuery` log (parol/token yo'q).
- Ishlatilish: `/assistant` sahifa, Telegram `/ai`.
- **Yo'q (TZ §30–41):** student analysis + sabab, homework checker, code review, similarity, teacher assistant (akademik savollar), group analysis, owner academic analysis, parent summary, remedial learning. Provayder sozlamasi (`ANTHROPIC_API_KEY` va h.k.) yo'q.

---

## 12. CURRENT NOTIFICATIONS

19 tur, `priority` LOW/NORMAL/HIGH, per-user `NotificationSetting` (in-app / Telegram), `notifyFamily` (o'quvchi + ota-ona, in-app + TG).

| TZ §42 hodisa | Holat |
|---|---|
| Homework created | ✅ HOMEWORK_CREATED |
| Homework deadline | ❌ job yo'q |
| Homework graded | ✅ |
| Exam scheduled | ❌ |
| Exam result | ✅ |
| Low score | ❌ |
| Attendance absent | ✅ (TG ota-ona + o'quvchi, in-app xodim) |
| Attendance late | ❌ faqat ABSENT (`attendance.service.ts:269`) |
| Risk increased | 🟡 faqat CRITICAL → xodimga (automation); oilaga yo'q |
| Certificate issued | ✅ |
| Payment due | 🟡 automation orqali; **ota-onaga TG bormaydi** (`findChats` faqat `studentId`, `notificationDelivery.service.ts:41-52`); portal in-app yo'q |

---

## 13. CURRENT ANALYTICS

Bor: dashboard (rolga qarab bloklar), executive (health score, forecast, insights), analytics (unit-economics, profitability course/group/teacher, cohorts, sources), attendance (stats, ranking, teacher overview), 15 turdagi hisobot (teachers KPI, retention, groups, courses...), student profile trend, risk.

| TZ §46–49 | Holat |
|---|---|
| Student analytics | ✅ profile |
| Group analytics (davomat, vazifa, imtihon, progress) | 🟡 davomat + profitability; vazifa/imtihon/progress birga yo'q |
| Course analytics + zaif mavzular | ❌ |
| Teacher analytics | ✅ `teachersReport` (davomat, imtihon o'rtacha, vazifa %, retention) |
| Topic analytics | ❌ |
| Homework analytics | ❌ (faqat o'quvchi/o'qituvchi kesimida) |
| Exam analytics (cross-exam) | ❌ (faqat imtihon ichida) |
| Group comparison | 🟡 profitability by group; akademik taqqoslash yo'q |

---

## 14. CURRENT TEST COVERAGE

| Tur | Soni | Izoh |
|---|---|---|
| Backend integration (vitest + supertest, real DB `crm_test`) | 86 fayl + 10 unit = 96 fayl, **684 test** | 403 tekshiruvi ~60 faylda |
| Frontend (vitest + RTL) | 9 fayl, 55 test | faqat `utils/` va `components/ui/` |
| E2E (Playwright, desktop + mobile) | 10 spec, 14 test | auth, rbac, leads, payments, finance, attendance.mobile, theme... |
| Security | `security`, `securityAudit`, `securityHardening`, `branchIsolation`, `portal`, `rateLimit` | ✅ |
| Performance | `perf:bench` (servis benchmark), `telegram:load` | HTTP load test yo'q |
| Telegram | 6 fayl (~75 test) | ✅ |

### TZ §63 majburiy xavfsizlik testlari

| Sinov | Holat |
|---|---|
| Student A → Student B | ✅ `portal.test.ts:62` |
| Parent A → Child B | ✅ `portal.test.ts:92` (faqat profile); barcha portal endpointlar uchun kengaytirish kerak |
| Teacher A → Group B | ✅ homework/groups/attendance; ❌ **examAttempt uchun yo'q** (scope ham yo'q) |
| Manager A → Lead B | ✅ `leads.test.ts` |

---

## 15. EXISTING FEATURES TO REUSE ♻️

- Auth (JWT, refresh, reset, lockout) — o'zgarmaydi.
- `resolvePortalScope` / `requireOwnStudent` — barcha yangi portal endpointlar uchun.
- `getTeachingAccess` / `assertGroupVisible` — bitta modulga ko'chirib, hamma joyda ishlatish.
- `homeworkService.submitByStudent`, `examAttemptService` (start/submit/grade), `questionService`, `curriculumService`, `studentProgressService`, `studentRiskService`, `gamificationHooks`, `notifyFamily`, `notificationService`, `auditService.recordInTransaction`, `fileStorage` (magic-byte), `branchAccess`, `search.service`, `automation.service` (qoida ijrosi), `AiQuery` log, `NotificationDelivery` outbox.
- Frontend: `PortalLayout`, `PortalRoute`, `Skeleton/EmptyState/ErrorState/Pagination/Modal/ConfirmDialog/Table`, `usePreference`, `TelegramLinkCard`, `NotificationBell`, `queryKeys`, `api.ts` (refresh rotation).

---

## 16. MISSING FEATURES (fazalar bo'yicha)

| Faza | Yo'q / qisman |
|---|---|
| 1 Auth + Portal foundation | portal navigatsiya, portal sozlamalar sahifasi, portal bildirishnoma qo'ng'irog'i, teaching scope birlashtirish, examAttempt scope, §63 testlarni to'ldirish |
| 2 Student portal | dashboard (streak, risk, keyingi dars/imtihon, kutilayotgan vazifa), vazifa ro'yxati + topshirish UI, imtihon natijalari UI, davomat kalendari UI, to'lovlar UI, XP sahifasi, profil tablari |
| 3 Parent portal | farzand bo'yicha alohida ko'rinish, haftalik hisobot (web/TG/PDF), ota-onaga to'lov TG |
| 4 LMS | `Lesson` (topic → lesson, DRAFT/PUBLISHED/ARCHIVED, video/fayl/resurs), `Material`, mavzu ↔ dars sessiyasi progress avtomatlashtirish |
| 5 Homework | target (tanlangan/bitta o'quvchi), topic/lesson/difficulty, ko'p fayl + link + kod, RETURNED/IN_PROGRESS, o'qituvchi javobni ko'rishi + fayl endpoint, rubric, deadline eslatma, MISSED job |
| 6 Assessment 2.0 | exam type, TRUE_FALSE/CODE/FILE, tags/explanation, blueprint, o'quvchi-variant, tartib aralashtirish, savol snapshot, startAt/endAt, **o'quvchi topshirishi (portal + bot)**, `exam.start` ruxsati, qisman ball |
| 7 Progress | topic mastery ball (0–100, konfiguratsiya), `StudentProgressSnapshot` job, mastery ↔ imtihon/vazifa bog'lash |
| 8 Teacher control | `/teaching` paneli: guruhlar jadvali (davomat, vazifa, imtihon, progress, risk, oxirgi faollik) |
| 9 AI | LLM provayder (Claude API), akademik toollar (getStudentProgress, getHomework, getExamResults, getGroupAnalytics...), student analysis + sabab (FACT/OBSERVATION/RECOMMENDATION), homework checker (suggested score, teacher accept/edit/return), teacher/owner assistant, parent summary, remedial, `AiAnalysis` modeli |
| 10 Notifications | deadline, exam scheduled, low score, late, risk (oilaga), payment due ota-onaga, portal in-app |
| 11 Telegram 2.0 | §43 11 band |
| 12 Analytics | topic/course/homework/exam analytics, group comparison |
| 13 Automation | builder (trigger/condition/action/channel/schedule), `Task` modeli, actions: create alert, assign homework, recommend quiz |
| 14 Security/perf | Sentry, latency metrics, HTTP load test, cursor pagination (kerak bo'lsa) |
| 15 Testing | frontend page testlari, homework/exam/AI E2E (§64–66) |
| Docs (§69) | `student-portal, parent-portal, lms, homework, assessment, ai-academic, teacher-control, permissions, security, testing` — yo'q; `architecture, telegram, deployment` — bor |

---

## 17. RISKS

| # | Xavf | Ta'sir | Chora |
|---|---|---|---|
| 1 | `examAttempt.service` guruh scope tekshirmaydi | `exam.grade` bor o'qituvchi begona guruh urinishini boshqaradi | PHASE 1 da `assertGroupVisible` qo'shish + test |
| 2 | Teaching scope 8 nusxa, 2 xil mezon | Yangi modul (LMS, mastery) yana nusxa ko'paytiradi | Bitta `teachingAccess.ts` |
| 3 | `debt`/`alert` list filial scope'siz | Ko'p filialda ma'lumot oqishi | Alohida topshiriq (moliya — TZ §0.1 "keraksiz o'zgartirma", lekin bu xavfsizlik) |
| 4 | Homework submission mazmuni o'qituvchiga ko'rinmaydi | Baholash "ko'r" | PHASE 5 birinchi ish |
| 5 | Portal 7 endpoint UI'siz | O'quvchi veb'dan vazifa topshira olmaydi | PHASE 2 |
| 6 | O'quvchi imtihon topshira olmaydi | Assessment 2.0 asosiy oqimi yo'q | PHASE 6, `exam.start` ruxsati |
| 7 | Jobs in-process, lock yo'q | 2+ instance'da ikki marta ishlaydi | Hozircha 1 instance; kelajakda advisory lock |
| 8 | AI'da LLM yo'q — TZ §30–41 asosan yangi ish | Eng katta hajm | Claude API, whitelist tool, `AiAnalysis` jadval; o'qituvchi yakuniy hokim (TZ §0.4) |
| 9 | Frontend test qamrovi tor (9 fayl) | Portal regressiyasi | Har fazada sahifa testi |
| 10 | Mavzu ↔ dars sessiyasi bog'liqligi kodda yo'q (schema izohi yolg'on) | Progress qo'lda | PHASE 4/7 |
| 11 | Migration'da `now()` vaqt zonasi xatosi (oldin bo'lgan) | 5 soat siljish | Qoida: migrationda `now()` ishlatilmaydi, oldin `pg_dump` |
| 12 | `StudentProgressSnapshot` yozilmaydi | Trend har safar qayta hisoblanadi | PHASE 7 job |

---

## 18. RECOMMENDED DEVELOPMENT ORDER

TZ §78 tartibi saqlanadi. Har faza mustaqil ishlaydigan holatda yakunlanadi, testlar o'tadi, `PHASE X COMPLETE` hisoboti (§70) beriladi.

```
PHASE 1  Auth + Portal foundation      (auth o'zgarmaydi; portal karkas, scope, xavfsizlik testlari)
PHASE 2  Student portal                (7 endpointga UI, dashboard, profil tablari)
PHASE 3  Parent portal                 (farzand ko'rinishi, haftalik hisobot)
PHASE 4  LMS foundation                (Lesson, Material; progress avtomat)
PHASE 5  Daily homework                (target, statuslar, ko'rish, rubric, eslatma)
PHASE 6  Assessment 2.0                (turlar, blueprint, variant, o'quvchi topshirishi)
PHASE 7  Progress / mastery            (mastery ball, snapshot job)
PHASE 8  Teacher control center
PHASE 9  AI academic control center    (LLM + akademik toollar)
PHASE 10 Notifications
PHASE 11 Telegram 2.0
PHASE 12 Analytics
PHASE 13 Automation builder
PHASE 14 Security + performance
PHASE 15 Full testing
PHASE 16 Production
```

---

## 19. §79 savollariga qisqa javob

1. **Nima bor?** — 1–15 bo'limlarda.
2. **Nima ishlayapti?** — auth, RBAC, portal API, homework/exam backend, risk, gamification, Telegram, notifications, analytics, automation (qattiq), search, PWA.
3. **Nima qisman?** — portal UI, LMS, homework (ko'rish/target/return), exam (o'quvchi topshirishi/blueprint), mastery, AI, notification hodisalari.
4. **Nima yo'q?** — Lesson/Material, Rubric, Blueprint, TopicMastery, AI akademik, automation builder, Task, haftalik ota-ona hisoboti, 10 ta hujjat.
5. **Nima qayta ishlatiladi?** — 15-bo'lim.
6. **Modellar** — 2-bo'lim (92 ta).
7. **API** — 3-bo'lim (368 ta).
8. **Ruxsatlar** — 5-bo'lim (90 ta).
9. **Frontend sahifalar** — 148 fayl, 45 marshrut; portal 1 marshrut.
10. **Testlar** — 14-bo'lim.
11. **Qaysi migration kerak?** — PHASE 1: **yo'q**. PHASE 4+: `lessons`, `lesson_materials`, `homework_targets`, `rubrics`, `exam_blueprints`, `exam_question_snapshots`, `topic_mastery`, `ai_analyses`, `tasks`, enum kengaytmalari (SubmissionStatus +RETURNED/IN_PROGRESS, QuestionType +TRUE_FALSE/CODE/FILE_UPLOAD, ExamType, NotificationType +5). Hammasi additive.
12. **Xavflar** — 17-bo'lim.

---

# PHASE 1 — AUTH + PORTAL FOUNDATION: implementation plan

**Maqsad:** o'quvchi/ota-ona/o'qituvchi uchun xavfsiz, kengaytiriladigan karkas — keyingi fazalar shu ustiga qo'yiladi. Auth **o'zgarmaydi** (yetarli). DB migration **yo'q**.

### 1.1 Backend

| # | Ish | Fayllar | Nega |
|---|---|---|---|
| B1 | `services/teachingAccess.ts` — `getTeachingAccess`, `assertGroupVisible`, `teachingGroupFilter` ni `homework.service.ts` dan ko'chirish; homework/exam import yo'lini yangilash (xatti-harakat o'zgarmaydi) | yangi + 2 fayl | TZ §0.2 — bitta joy |
| B2 | `examAttempt.service.ts` — `attachQuestions`, `start`, `submit`, `attempts`, `attempt`, `grade` da `assertGroupVisible` | 1 fayl | Risk #1 |
| B3 | `GET /portal/me` ga `permissions`, `hasTelegram`, `unreadNotifications` qo'shish (mavjud servislardan) | `portal.service.ts` | Portal layout uchun bitta so'rov |
| B4 | Portal uchun `PATCH /auth/change-password` va `GET/PUT /notifications/settings` — allaqachon ochiq; test bilan tasdiqlash | test | |
| B5 | Testlar: `examAttempt` begona guruh → 403 (o'qituvchi A → guruh B); parent A → child B **barcha** 12 portal endpoint; student → `/exams/:id/attempts/...` → 403 | `tests/examEngine.test.ts`, `tests/portal.test.ts` | TZ §63 |

### 1.2 Frontend

| # | Ish | Fayllar |
|---|---|---|
| F1 | `PortalLayout` — pastki/yon navigatsiya (mobil: bottom tabs; desktop: yon): Bosh sahifa · Vazifalar · Imtihonlar · Davomat · To'lovlar · Sozlamalar; `NotificationBell`; ota-ona uchun farzand tanlash layoutda | `layouts/PortalLayout.tsx`, `layouts/PortalNav.tsx` (yangi) |
| F2 | Marshrutlar: `/portal` (dashboard), `/portal/homework`, `/portal/exams`, `/portal/attendance`, `/portal/payments`, `/portal/settings`, `/portal/notifications` — hozircha 2–5 placeholder emas, **skeleton + mavjud ma'lumot** (PHASE 2 to'ldiradi) | `routes/index.tsx` |
| F3 | `services/portal.service.ts` — 7 ta yetishmayotgan chaqiruv + tiplar (`types/portal.ts`) | 2 fayl |
| F4 | `/portal/settings`: parol o'zgartirish (mavjud endpoint), bildirishnoma sozlamalari (`NotificationSettingsModal` qayta ishlatiladi), Telegram (`TelegramLinkCard`), mavzu | `pages/portal/SettingsPage.tsx` |
| F5 | `/portal/notifications`: mavjud `NotificationsPage` mantiqini portal ko'rinishida | `pages/portal/NotificationsPage.tsx` |
| F6 | Farzand tanlovi `usePreference('portal.activeChild')` orqali saqlanadi | hook |
| F7 | Testlar: `PortalNav.test.tsx` (ruxsatga qarab bandlar), `portal.service` tiplari; E2E: `portal.spec.ts` (student login → navigatsiya → sozlamalar; parent → farzand almashtirish) | 3 fayl |

### 1.3 Hujjatlar (TZ §69)

`docs/student-portal.md` (arxitektura, marshrutlar, ownership), `docs/parent-portal.md`, `docs/permissions.md` (90 ruxsat × rol jadvali — `config/permissions.ts` dan generatsiya), `docs/security.md` (auth, scope, testlar).

### 1.4 O'zgarmaydi

Auth servisi, DB sxemasi, mavjud API kontraktlari, RBAC ruxsatlari (yangi ruxsat yo'q), Telegram, moliya.

### 1.5 Qabul mezonlari

- `npm run typecheck && npm run lint && npm test` — 0 xato, mavjud 684 + yangi testlar o'tadi.
- O'qituvchi A begona guruh imtihon urinishiga 403.
- Ota-ona A farzand B'ning 12 endpointiga 403.
- O'quvchi kirganda portal navigatsiyasi, bildirishnoma qo'ng'irog'i, sozlamalar ishlaydi (Playwright).
- `PHASE 1 COMPLETE` hisoboti §70 formatida.

**Taxminiy hajm:** backend 5 fayl (~250 qator), frontend 9 fayl (~700 qator), test 5 fayl, hujjat 4 fayl.
