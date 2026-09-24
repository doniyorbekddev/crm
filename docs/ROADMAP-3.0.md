# Academy CRM 3.0 — Roadmap

Manba: `promt3.md` (81 bo'lim) + `docs/ACADEMY-3.0-AUDIT.md` (PHASE 0 audit). Sana: 2026-09-24.

Har faza: **maqsad → nima qilinadi → DB → API/ruxsat → test → hajm**. Har faza mustaqil ishlaydigan holatda tugaydi, `PHASE X COMPLETE` hisoboti (TZ §70) beriladi, keyingisi "davom et" bilan boshlanadi.

Qoidalar (TZ §0): mavjud kod qayta yozilmaydi · bitta biznes mantiq bitta joyda · migration faqat additive (`now()` yo'q, oldin `pg_dump`) · testlar o'chirilmaydi · AI yakuniy hokim emas · frontend security emas.

Hajm belgisi: S (1 sessiya) · M (2–3) · L (4+).

---

## Umumiy ko'rinish

| # | Faza | Asosiy natija | Migration | Yangi ruxsat | Hajm |
|---|---|---|---|---|---|
| 1 | Auth + Portal foundation | Portal karkas, scope birlashtirish, xavfsizlik testlari | — | — | S |
| 2 | Student portal | 7 API'ga UI, dashboard, tablar | — | — | M |
| 3 | Parent portal | Farzand ko'rinishi, haftalik hisobot | — | — | S |
| 4 | LMS foundation | Lesson + Material, progress avtomat | +2 jadval | — | M |
| 5 | Daily homework | Target, statuslar, ko'rish, rubric, eslatma | +3 jadval, enum | — | M |
| 6 | Assessment 2.0 | Turlar, blueprint, variant, o'quvchi topshirishi | +2 jadval, enum | `exam.start` | L |
| 7 | Progress / mastery | Mastery ball, snapshot job | +1 jadval | — | S |
| 8 | Teacher control center | `/teaching` paneli | — | — | M |
| 9 | AI academic | LLM + akademik toollar + tahlillar | +1 jadval | `ai.academic` | L |
| 10 | Notifications | 6 yangi hodisa, oilaga to'liq yetkazish | enum | — | S |
| 11 | Telegram 2.0 | §43 11 band | — | — | M |
| 12 | Analytics | Mavzu/kurs/guruh/vazifa/imtihon analitikasi | — | — | M |
| 13 | Automation builder | Trigger/condition/action, Task | +2 jadval | — | M |
| 14 | Security + performance | Sentry, metrics, load test, scope audit | — | — | S |
| 15 | Full testing | §63–66 E2E, frontend testlar | — | — | M |
| 16 | Production | Deploy, docs, monitoring | — | — | S |

---

## PHASE 1 — Auth + Portal foundation

**Maqsad:** o'quvchi/ota-ona/o'qituvchi uchun xavfsiz karkas. Auth o'zgarmaydi.

- `services/teachingAccess.ts` — `getTeachingAccess`, `assertGroupVisible` ni bitta modulga; homework/exam undan import.
- `examAttempt.service` — guruh scope (**xavfsizlik tuzatish**).
- `GET /portal/me` — `unreadNotifications`, `hasTelegram` qo'shiladi.
- `PortalLayout` — navigatsiya (mobil bottom-tabs / desktop yon), `NotificationBell`, ota-ona farzand tanlovi layoutda.
- Marshrutlar: `/portal`, `/portal/homework`, `/portal/exams`, `/portal/attendance`, `/portal/payments`, `/portal/notifications`, `/portal/settings`.
- `/portal/settings`: parol, bildirishnoma sozlamalari, Telegram, mavzu.
- Frontend `portal.service.ts` — 7 yetishmayotgan chaqiruv + tiplar.
- Testlar: o'qituvchi A → guruh B imtihon urinishi 403; ota-ona A → farzand B barcha 12 endpoint; E2E `portal.spec.ts`.
- Docs: `student-portal.md`, `parent-portal.md`, `permissions.md`, `security.md`.

## PHASE 2 — Student portal

**Maqsad:** TZ §7–9 dashboard va bo'limlar.

- Dashboard: kurs/guruh/o'qituvchi, davomat %, vazifa %, imtihon o'rtacha, kurs progress %, XP/level, **streak**, **risk holati** (o'quvchiga yumshoq ko'rinishda), keyingi dars, kutilayotgan vazifalar, keyingi imtihon, qarz.
- Backend: `GET /portal/dashboard` (mavjud `studentProgress` + `studentRisk` + `streak` dan yig'iladi, yangi hisob yo'q).
- Vazifalar: ro'yxat (filtr: kutilmoqda/topshirilgan/baholangan), detal, **topshirish** (matn + fayl — mavjud endpoint).
- Imtihonlar: ro'yxat + natija + mavzu bo'yicha kuchli/zaif.
- Davomat: oylik kalendar (mavjud endpoint).
- To'lovlar: jadval + tarix (mavjud endpoint).
- XP: reyting, nishonlar, tranzaksiyalar.
- Profil: tablar (shaxsiy, akademik, davomat, vazifa, imtihon, progress, gamification, to'lov, sertifikat) — `ProfileTabs` dan qayta ishlatiladi.
- Testlar: har sahifa uchun RTL test; E2E: vazifa topshirish oqimi.

## PHASE 3 — Parent portal

- Farzand kartalari (`/portal` ota-ona uchun), har farzand bo'yicha 2-fazadagi barcha bo'limlar (`?studentId=` bilan).
- **Haftalik hisobot**: `GET /portal/weekly-report?studentId&week` — davomat, vazifa, imtihon, XP, progress, zaif/kuchli mavzular, o'qituvchi fikri (`Feedback`/submission feedback'dan). Web ko'rinishi + Telegram (yakshanba kechqurun job) + PDF (mavjud sertifikat print mexanizmi).
- Ota-onaga to'lov eslatmasi Telegram'da (`findChats` — `parentId` ham) — 10-fazaga tegishli, lekin shu yerda kerak.
- Testlar: ota-ona hisobot faqat o'z farzandi; job dedupe.

## PHASE 4 — LMS foundation

**Maqsad:** Course → Module → Topic → **Lesson → Material**.

- DB: `lessons` (topicId, title, description, teacherId?, durationMinutes, videoUrl, sortOrder, status DRAFT/PUBLISHED/ARCHIVED, publishedAt), `lesson_materials` (lessonId, kind FILE/LINK/VIDEO, title, path/url, size). Enum `LessonStatus`.
- API: `/curriculum/topics/:id/lessons` (CRUD, `course.manage`), `/lessons/:id/materials` (upload — `fileStorage`), `GET /portal/lessons/:id` (faqat PUBLISHED, o'z kursi).
- Frontend: `CurriculumModal` ichida dars/material boshqaruvi; portalda "Kurs" bo'limi (modul → mavzu → dars → material).
- Avtomat: `AttendanceSession.topicId` belgilanganda `StudentTopicProgress` IN_PROGRESS (schema izohi bajariladi).
- Docs: `lms.md`.

## PHASE 5 — Daily homework

- DB: `Homework` +`topicId?`, `lessonId?`, `difficulty` (EASY/MEDIUM/HARD), `targetType` (GROUP/SELECTED/INDIVIDUAL); `homework_targets` (homeworkId, studentId); `homework_attachments` (homeworkId, path, name, size); `submission_attachments` (submissionId, path, name, mime, size) — ko'p fayl; `HomeworkSubmission` +`linkUrl`, `codeText`; `SubmissionStatus` +`IN_PROGRESS`, `RETURNED`; `rubrics` (teacherId, name, criteria JSON [{name, weight}]), `Homework.rubricId?`, `HomeworkSubmission.rubricScores JSON?`.
- Servis: `ensureSubmissions` target bo'yicha; keyin qo'shilgan o'quvchiga submission (guruh o'zgarganda hook); **`SubmissionDto` ga javob + fayllar**; `GET /homework/:id/submissions/:studentId/attachments/:attId` (teaching scope); `returnSubmission` (RETURNED, izoh, qayta topshirish ochiq); MISSED job (deadline + N kun); deadline eslatma job (24 soat oldin) — `HOMEWORK_DEADLINE`.
- Frontend: forma (target, mavzu/dars, qiyinlik, fayllar, rubric), baholash modali (javob, fayllar, rubric ballari, qaytarish).
- Portal/Telegram: ko'p fayl, link, kod; RETURNED holati.
- Docs: `homework.md`.

## PHASE 6 — Assessment 2.0

- DB: `ExamType` enum (DAILY_QUIZ, WEEKLY_TEST, MONTHLY_EXAM, MIDTERM, FINAL, PRACTICE, DIAGNOSTIC), `Exam` +`type`, `startAt?`, `endAt?`, `shuffleQuestions`, `shuffleOptions`, `perStudentVariant`; `QuestionType` +`TRUE_FALSE`, `SHORT_TEXT`, `LONG_TEXT`, `CODE`, `FILE_UPLOAD`; `Question` +`explanation`, `tags String[]`; `exam_blueprints` (examId, rules JSON [{topicId?, difficulty?, percent|count}], total); `attempt_questions` (attemptId, questionId, order, optionOrder JSON, snapshot JSON) — **o'quvchi-variant + snapshot**; `ExamAnswer` +`filePath`.
- Servis: blueprint generator (mavzu % × qiyinlik % → savol tanlash, yetmasa aniq xato); urinish boshlanganda snapshot; `submit` snapshot bo'yicha; qisman ball (MULTIPLE_CHOICE); vaqt oynasi tekshiruvi.
- Ruxsat: **`exam.start`** (STUDENT roliga); `POST /portal/exams/:id/start`, `GET /portal/exams/attempts/:id`, `PUT .../answers` (autosave), `POST .../submit` — hammasi `requireOwnStudent` + oynasi + maxAttempts.
- Frontend: o'qituvchi — blueprint tahrirlagich; portal — **imtihon topshirish** (taymer, autosave, tarmoq uzilsa davom etish).
- Telegram: `/imtihon` → boshlash → savol-javob tugmalar bilan (SINGLE/MULTIPLE/TRUE_FALSE), matnli savol matn bilan; §43 "Online Exam".
- Notification: `EXAM_SCHEDULED`.
- Docs: `assessment.md`.

## PHASE 7 — Progress / mastery

- DB: `topic_mastery` (studentId, topicId, score 0–100, status NOT_STARTED/LEARNING/PRACTICING/MASTERED, sources JSON {exam, homework, attendance}, updatedAt); `Setting` `mastery.settings` (chegaralar 40/60/80, og'irliklar).
- Servis: `masteryService.recalculate(studentId)` — imtihon (mavzu bo'yicha %), vazifa (mavzuli), davomat (mavzu sessiyasi) → ball; hook: imtihon baholanganda, vazifa baholanganda, davomat belgilanganda.
- `StudentProgressSnapshot` — oylik job (mavjud jadval, nihoyat yoziladi).
- API: `GET /students/:id/mastery`, `GET /portal/mastery`, `GET /groups/:id/mastery` (o'qituvchi).
- Frontend: mastery jadvali (profil, portal), sozlamalar (`AlertSettingsModal` uslubida).

## PHASE 8 — Teacher control center

- `/teaching` marshrut (`attendance.mark` yoki `homework.manage`): guruhlar kartasi (o'quvchilar, davomat %, vazifa %, imtihon o'rtacha, progress %), guruh ichida jadval: o'quvchi | davomat | vazifa | imtihon | progress | risk | oxirgi faollik.
- Backend: `GET /teaching/overview`, `GET /teaching/groups/:id` — `teachingAccess` scope, mavjud servislardan yig'iladi, N+1 yo'q (guruh bo'yicha bitta so'rov).
- Risk sabablari: mavjud 6 omilga **oxirgi faollik / kirish / topshirish** qo'shiladi (`studentRisk.service` kengaytma, og'irliklar `alerts.settings` da).
- Tez amallar: davomat, vazifa yaratish, baholash — mavjud sahifalarga havola.
- Docs: `teacher-control.md`.

## PHASE 9 — AI academic control center

**Eng katta faza.** TZ §30–41, §58–61.

- Provayder: Claude API (`@anthropic-ai/sdk`), `ANTHROPIC_API_KEY`, `AI_MODEL` env; kalit yo'q bo'lsa — mavjud kalit-so'z rejimi ishlayveradi (graceful).
- Arxitektura (§61): savol → intent → ruxsat → tool (whitelist) → CRM servis → LLM reasoning → javob **FACT / OBSERVATION / RECOMMENDATION** formatida (§60). LLM ma'lumot bazasiga tegmaydi, faqat tool natijasini ko'radi (§58). Promptga faqat kerakli maydonlar (§59), log'da parol/token/to'lov siri yo'q.
- Akademik toollar: `getStudentProgress`, `getAttendance`, `getHomework`, `getExamResults`, `getMastery`, `getGroupAnalytics`, `getCourseAnalytics`, `getRiskFactors` — har biri mavjud servis + scope.
- DB: `ai_analyses` (kind STUDENT_RISK/HOMEWORK_REVIEW/GROUP/PARENT_SUMMARY, subjectType/Id, input summary, output JSON, model, tokens, createdById, acceptedById?, acceptedAt?).
- Xususiyatlar:
  1. **Student analysis** — 5 ball (academic, attendance, engagement, homework, assessment), daraja, sabablar raqam bilan (92% → 74%); deterministik engine bilan **ziddiyat yo'q** — AI izohlaydi, `riskLevel` o'zgartirmaydi (§32).
  2. **Homework checker** — matn/kod: correctness, completeness, quality, errors, suggestions, **suggested score**; o'qituvchi Accept / Edit / Return (§34–35). Kod uchun: xato, sifat, xavfsizlik, accessibility.
  3. **Similarity** — submission'lar orasida o'xshashlik signali ("high similarity"), hukm emas (§36); dastlab lokal (shingling), LLM'siz.
  4. **Teacher assistant** — "kimga e'tibor", "qaysi mavzu zaif", guruh tahlili (§37–38).
  5. **Owner assistant** — akademik savollar (§39).
  6. **Parent summary** — haftalik hisobot matni, yumshoq ohang (§40); 3-faza hisobotiga qo'shiladi.
  7. **Remedial** — zaif mavzu → tavsiya (dars, vazifa, quiz); o'qituvchi tasdiqlaydi (§41).
- Ruxsat: `ai.academic` (o'qituvchi, admin, owner); o'quvchi/ota-ona faqat o'ziga tegishli tayyor tahlilni ko'radi.
- Frontend: `/assistant` kengaytma (rejim: biznes/akademik), baholash modalida AI paneli, profil/portal "AI izoh" kartasi.
- Testlar: LLM mock, tool whitelist, ruxsat, prompt'da sensitive maydon yo'qligi, hallucination format tekshiruvi.
- Docs: `ai-academic.md`.

## PHASE 10 — Notification integration

- Yangi turlar: `HOMEWORK_DEADLINE`, `EXAM_SCHEDULED`, `LOW_SCORE`, `ATTENDANCE_LATE`, `RISK_INCREASED`; `PAYMENT_DUE_SOON` oilaga.
- `findChats` — `parentId` bo'yicha ham; portal hisoblariga in-app (mavjud `notifyFamily`).
- Priority va sozlama (`notificationTypes.ts`, `NotificationSettingsModal`) yangilanadi.
- Testlar: har hodisa → kanal matritsasi.

## PHASE 11 — Telegram 2.0 (§43)

Botni qayta yozmasdan, mavjud handler'larga:
- Online exam (6-fazada), **Search** (`search.service`, ruxsatga qarab), **Settings** (bildirishnoma on/off, farzand, til), **Teacher KPI** (`teachersReport` → o'zi), **Marketing** (`sources` analitika), **Reports** (`report.service` qisqa ko'rinish, `report.view`), **Homework attachments** o'qituvchi tomon (fayl bilan vazifa, javob faylini ko'rish), **baholash botdan**, **Broadcast media** (rasm + izoh, `sendPhoto`), **Call logging** (`callService.create`), **Follow-up creation** (`followUpService.create`).
- Web ↔ Telegram bir xil servis (§44) — allaqachon shunday, test bilan mustahkamlanadi.
- Docs: `telegram.md` (mavjud 3 hujjat birlashtiriladi).

## PHASE 12 — Analytics (§46–49)

- `GET /analytics/academic` (kesim: student/group/course/teacher/topic/homework/exam; metrikalar: davomat, vazifa %, o'rtacha ball, imtihon, mastery, progress, retention, risk).
- Kurs analitikasi + zaif mavzular; guruh taqqoslash (descriptive, ranking faqat ko'rsatkich); o'qituvchi analitikasi (mavjud + mastery, feedback) — hukm emas, kuzatuv.
- Frontend: `AnalyticsPage` "Akademik" tabi (recharts), export (mavjud `analyticsExport`).
- Indekslar: `topic_mastery(topicId, score)`, `homework_submissions(homeworkId, status)`.

## PHASE 13 — Automation builder (§50–51)

- DB: `AutomationRule` — `trigger` enum kengayadi (HOMEWORK_COMPLETION_LOW, EXAM_SCORE_LOW, MASTERY_LOW, NO_LOGIN_DAYS, NO_SUBMISSION_DAYS), `conditions JSON`, `actions JSON [{type, channel, params}]`, `schedule` (cron-ga o'xshash: har soat/kun/hafta); `tasks` (title, assigneeId, dueAt, status, entityType/Id, createdByRule?).
- Actions: NOTIFY (in-app/TG, audience), CREATE_ALERT, CREATE_TASK, ASSIGN_HOMEWORK (shablon), RECOMMEND_QUIZ.
- API: `POST /automation` (yaratish — hozir yo'q), `DELETE`, `POST /automation/:id/test` (dry-run: nechta mos keladi).
- Frontend: builder formasi (trigger → condition → action → channel → schedule), run tarixi.
- Xavfsizlik: faqat whitelist trigger/action, JSON zod bilan.

## PHASE 14 — Security + performance

- Sentry (backend + frontend, DSN env, PII scrub), `/metrics` (prom-client: latency histogram, DB, AI, notification/telegram failures, queue size) (§68).
- Scope auditi: `debt`/`alert` list filial scope; barcha yangi endpointlar §57 ro'yxati bo'yicha.
- HTTP load test (autocannon/k6 skript) katta dataset bilan (`perfSeed`), N+1 tekshiruvi (Prisma query log), yangi indekslar.
- Modal focus-trap, `aria-live` (§54).

## PHASE 15 — Full testing (§62–66)

- E2E: Homework (o'qituvchi yaratadi → o'quvchi topshiradi → AI → baho → ota-ona → TG), Exam (blueprint → topshirish → avto-baho → natija → mastery → ota-ona), AI (tahlil → sabab → tavsiya → o'qituvchi amali).
- Security matritsa testi: 4 juftlik × barcha portal/teaching endpointlar (avtomatik generatsiya).
- Frontend: portal va teaching sahifalari RTL testlari; coverage `pages/portal`, `pages/teaching` qo'shiladi.
- `docs/testing.md`.

## PHASE 16 — Production

- `.env.production` yangi o'zgaruvchilar (AI, Sentry), migration deploy (`pg_dump` → `migrate deploy` → smoke), Telegram webhook, monitoring dashboard, backup verify.
- Docs yakuniy: `architecture.md` yangilanadi, `deployment.md`, TZ hisobot (HTML/PDF).

---

## Bog'liqliklar

```
1 → 2 → 3
1 → 4 → 5 → 6 → 7 → 8
7 → 9 (AI mastery'ga tayanadi)
5,6 → 10 → 11
7 → 12
10,12 → 13
* → 14 → 15 → 16
```

## Sizdan kerak bo'ladiganlar

| Qachon | Nima |
|---|---|
| PHASE 9 | Anthropic API kaliti (`ANTHROPIC_API_KEY`); byudjet chegarasi (oylik token limiti) |
| PHASE 14 | Sentry DSN (ixtiyoriy) |
| PHASE 16 | Production serverga kirish, domen (mavjud), Click/Payme merchant kalitlari (agar onlayn to'lov real bo'lsa) |
| Har faza | "davom et" tasdig'i |
