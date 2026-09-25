# ACADEMY CRM 3.1 — PHASE 0 AUDIT

> Sana: 2026-09-25. Manba: `promt3.1.md` §5, §51. Tekshiruv **source code** bo'yicha (PDF emas) — har band
> fayl va qator raqami bilan tasdiqlangan. Hech qanday kod o'zgartirilmadi.
> Reja: [ROADMAP-3.1.md](ROADMAP-3.1.md).

## 1. Current State

CRM 3.0 to'liq ishlaydi (backend 793, frontend 105, E2E 32 test). `promt3.1.md` dagi GAP ro'yxati **2026-09-24**
hisobotidan olingan — 3.0 fazalari (ayniqsa PHASE 6 va PHASE 11) ulardan ko'pini qisman yoki to'liq yopgan.
Shuning uchun 19 GAP'dan: **1 ta COMPLETE, 13 ta PARTIAL, 4 ta MISSING, 1 ta qisman BLOCKED**.

Audit davomida GAP ro'yxatida yo'q, lekin **xavfsizlik va to'g'rilik** jihatidan muhim 9 ta muammo topildi (§11) —
ulardan biri (Telegram amallarida ruxsat tekshirilmaydi) 3.1 ning boshqa fazalaridan oldin yopilishi kerak.

## 2. GAP Matrix

| GAP | Feature | Holat | Asosiy dalil | Yetishmaydigan qism |
|---|---|---|---|---|
| 01 | Academy Settings | **MISSING** | `Setting` key/value modeli bor (`schema.prisma:1536`), `settings.manage` ruxsati bor (OWNER + SUPER_ADMIN) | Umumiy sozlamalar servisi/API/sahifa; logo; nom/valyuta/vaqt mintaqasi build-time yoki env'da qattiq |
| 02 | Badge Creation | **PARTIAL** | `Badge` + `BadgeRule` (7 qoida), tahrirlash va berish API | `POST /gamification/badges`, `category`, `REFERRAL` qoidasi, dublikat nazorati, UI |
| 03 | Column Visibility | **MISSING** | `UserPreference` + `usePreference` + `WidgetLayoutPanel` (dashboard vidjetlari) | Ustun ta'rifi abstraksiyasi, panel, `table.*.columns` kaliti, 36 jadval |
| 04 | Date Filters | **COMPLETE** | `EXECUTIVE_PRESETS` 9 ta (bugun…ixtiyoriy), backend `from>to` rad etadi, testlar bor | Faqat: status **422** (TZ 400 deydi) — loyiha konvensiyasi 422 |
| 05 | Exam Variants | **COMPLETE (kabinet)** / PARTIAL (xodim yo'li) | Har o'quvchiga variant, snapshot, savol/variant aralashtirish, server taymeri, 6 ta test | 2 test (bir guruhdagi B → A urinishi; tartib aralashishi), xodim `submit` jonli bankdan baholaydi |
| 06 | Telegram Exam | **PARTIAL** | `handlers/exam.ts` — boshlash, savollar, ◀️/▶️, fayl/matn javob, topshirish; faqat `examTakingService` | Tafsilot va tasdiq ekrani, imtihon holati har callbackda qayta tekshirilmaydi, testlar (vaqt, fayl, begona) |
| 07 | Telegram Homework File | **PARTIAL** | `teacher.ts:332-506` — fayl yuklab olinib CRM xotirasiga, PDF/rasm siyosati | **`homework.manage` tekshirilmaydi**, atomik emas (fayl xatosi — vazifa baribir e'lon), testlar |
| 08 | Telegram Call | **PARTIAL** | `sales.ts:343-395` → `callService.create`, `CallResult` enum qayta ishlatiladi | Qo'ng'iroq turi, davomiylik, keyingi qadam; **`call.create` tekshirilmaydi** |
| 09 | Telegram Follow-up | **PARTIAL** | `sales.ts:402-468` → `followUpService.create` | **Eslatma Telegramga bormaydi** (job `notificationService` ni chetlab o'tadi), izoh/muhimlik yo'q, `followup.create` tekshirilmaydi |
| 10 | Owner Teacher KPI | **PARTIAL** | `workspace.ts:200` → `teachingService.overview` (o'qituvchi uchun) | Rahbarga o'qituvchi tanlash/kesim yo'q; retention, feedback — `academicAnalyticsService` (dimension=teacher) bor, ishlatilmaydi |
| 11 | Owner Marketing | **PARTIAL** | `workspace.ts:233` → `analyticsService.sources` (web bilan bir xil) | Manba bo'yicha daromad/ROI/foyda chiqmaydi, davr tanlash, CSV havola; **Campaign modeli yo'q** |
| 12 | Owner Reports | **PARTIAL** | `workspace.ts:264` → `reportService.build`, 8 tur, `canViewReport` | Kunlik qisqa hisobot (vazifa %, imtihon o'rtacha, xavf), guruh/manba/retention turlari, CSV faylni botga yuborish |
| 13 | Telegram Settings | **PARTIAL** | `workspace.ts:133` — umumiy "ovozsiz" + xodim uchun tur bo'yicha (`NotificationSetting`) | Toifalar (davomat, to'lov, vazifa, imtihon, yutuq, tizim); o'quvchi/ota-ona oilaviy xabarlari tur bo'yicha o'chirilmaydi |
| 14 | Telegram Search | **PARTIAL** | `workspace.ts:95` → `searchService.search` (RBAC) | O'quvchi/ota-ona uchun o'z ma'lumoti; **guruh va sertifikat qidiruvi o'qituvchi doirasisiz**; to'lov faqat PM raqam |
| 15 | Broadcast 2.0 | **PARTIAL** | Matn + rasm/hujjat (bot), auditoriya 6 tur, oldindan ko'rish, navbat, statistika | **URL tugma yo'q**, web UI yo'q, "delivered" holati yo'q, leadlar auditoriya emas (Telegram bog'lanishi yo'q) |
| 16 | Telegram Docs | **PARTIAL** | 5 ta mavjud hujjat (telegram, -architecture, -security, -deployment, AUDIT) | 5 talab qilingan faylning hech biri yo'q; auth yaxshi yoritilgan, api/testing yo'q |
| 17 | Click/Payme | **PARTIAL + BLOCKED** | `PaymentIntent`, provayder interfeysi, sandbox HMAC, ikki qatlamli idempotentlik, 8 test | Interfeys bir martalik — Click (Prepare/Complete) va Payme (JSON-RPC) ko'p bosqichli; tiyin; xato kodlari; refund; fiskal chek. **Merchant kalitlari — BLOCKED** |
| 18 | Recurring Homework | **MISSING** | `RecurringExpense` naqshi (dedupe unique) takrorlash uchun tayyor | Model, generator job, API, UI, testlar |
| 19 | Secure Sandbox | **MISSING / infra BLOCKED** | Kod bajarilmaydi (faqat statik tekshiruv), VPS 4 vCPU/8 GB | Alohida runner konteyner (gVisor/nsjail), tarmoqsiz, limitlar, navbat, test-case modeli |

## 3. Existing Files (asosiy)

| Soha | Fayllar |
|---|---|
| Sozlamalar | `backend/src/services/audit.service.ts:69-146` (namuna: Setting + audit bitta tranzaksiyada), `mastery.service.ts:97`, `alert.service.ts:985`, `config/permissions.ts:60,206,337` |
| Brend | `frontend/src/lib/env.ts:12`, `components/BrandMark.tsx`, `hooks/useDocumentTitle.ts`, `utils/format.ts:28` (`so'm`) |
| Gamifikatsiya | `services/gamification.service.ts:211-290,678-762`, `routes/gamification.routes.ts`, `validators/gamification.validator.ts:31`, `pages/gamification/GamificationSettings.tsx` |
| Jadvallar | `components/ui/Table.tsx`, 36 sahifa `<TH>` bilan; `utils/widgetLayout.ts`, `components/WidgetLayoutPanel.tsx`, `hooks/usePreference.ts` |
| Direktor paneli | `pages/dashboard/ExecutivePage.tsx:52-75`, `utils/dateRange.ts`, `validators/dashboard.validator.ts:21-43`, `services/executive.service.ts:199-244` |
| Imtihon | `services/examTaking.service.ts`, `examBlueprint.ts`, `examAttempt.service.ts:282,431` |
| Telegram | `telegram/router.ts`, `handlers/{exam,teacher,sales,workspace,owner,broadcast,menu,student}.ts`, `services/telegramCommand.service.ts:80-127`, `telegram/rateLimit.ts` |
| Bildirishnoma | `services/notification.service.ts:124-190,247-289`, `notificationDelivery.service.ts`, `studentNotify.service.ts`, `jobs/followUpReminder.job.ts:22-86` |
| To'lov | `services/payments/{provider,sandbox.provider,onlinePayment.service}.ts`, `controllers/onlinePayment.controller.ts`, `app.ts:52-62` |
| Takrorlanuvchi | `services/recurringExpense.service.ts:172-238`, `jobs/recurringExpenses.job.ts`, `services/homework.service.ts:661-707` |

## 4. Existing APIs

| API | Ruxsat | Holat |
|---|---|---|
| `PUT /api/audit/settings`, `PUT /api/mastery/settings` | `settings.manage` | bor — umumiy `/api/settings` yo'q |
| `GET /api/gamification/badges`, `PUT /badges/:id`, `POST /badges/award` | view / manage | bor — `POST /badges` yo'q |
| `GET/PUT /api/auth/me/preferences[/:key]` | auth | bor, qat'iy whitelist (3 kalit) |
| `GET /api/dashboard/executive?from&to|year&month` | `analytics.view` | bor, from>to → 422 |
| `/api/portal/exams/*`, `/api/portal/attempts/*` | portal | bor |
| `GET/POST /api/telegram/broadcasts[/preview]` | `broadcast.send` | bor, faqat matn (web) |
| `POST /api/payments/webhook/:provider`, `/api/payments/online/*` | imzo / payment | bor, faqat SANDBOX |
| `GET /api/analytics/sources[/export]`, `GET /api/reports/:type[/export]` | analytics / report | bor |

## 5. Existing DB Models

`Setting`, `UserPreference`, `Badge`/`StudentBadge`/`BadgeRule`, `Exam`/`AttemptQuestion`/`ExamAttempt`,
`Call`/`CallResult`/`CallDirection`, `FollowUp` (priority **yo'q**), `NotificationSetting` (userId bo'yicha),
`NotificationDelivery` (PENDING/SENT/FAILED/SKIPPED — delivered **yo'q**), `TelegramBroadcast` (media bor, tugma **yo'q**),
`BroadcastAudience` (lead **yo'q**), `PaymentIntent`/`PaymentProviderKey` (CLICK, PAYME — kodsiz), `RecurringExpense` (namuna),
`Homework` (seriya/sana maydoni **yo'q**). **Campaign** va **DIRECTOR** roli mavjud emas.

## 6. Existing Services (qayta ishlatiladi)

`auditService.recordInTransaction`, `preferenceService`, `gamificationService.evaluateBadges`, `executiveService.summary`,
`examTakingService`, `homeworkService.create/uploadAttachment`, `callService.create`, `followUpService.create`,
`teachingService.overview`, `academicAnalyticsService.build(dimension='teacher')`, `teacherService` (performance),
`analyticsService.sources`, `reportService.build`, `dashboardService.summary`, `searchService.search`,
`notificationService.createManyInTransaction/settings/saveSettings`, `broadcastService`, `notificationDeliveryService`,
`onlinePaymentService.handleWebhook`, `paymentService.create/refund`, `recurringExpenseService.generate` (naqsh),
`telegramService.downloadFile/sendMedia`.

## 7. Existing Telegram Handlers

| Handler | Callbacklar | Nima qiladi |
|---|---|---|
| `exam.ts` | `ex_list`, `ex_start`, `ex_q`, `ex_a`, `ex_sub`, `ex_subok` | onlayn imtihon (sessiyada `attemptId`) |
| `teacher.ts` | `tc_hw`, `tc_hwok`, baholash | vazifa berish (fayl bilan), baholash |
| `sales.ts` | `sl_call`, `sl_cr`, `sl_cs`, `sl_fn`, `sl_fw`, `sl_fu*` | qo'ng'iroq, follow-up |
| `workspace.ts` | `ws_sr`, `ws_set`, `ws_mute`, `ws_st`, `ws_kpi`, `ws_mkt`, `ws_rep`, `ws_r` | qidiruv, sozlamalar, KPI, marketing, hisobot |
| `owner.ts` | `ow_dash`, `ow_debts`, `ow_risk`, `ow_alerts` | rahbar paneli |
| `broadcast.ts` | `bc_*` | ommaviy xabar (matn/media) |

Har yangilanishda `resolveCommandScope` qayta ishlaydi (bloklangan xodim darhol rad etiladi). Chat limiti 20/10 s,
webhook 1200/min, bog'lash kodi 5 xato → 15 daqiqa blok.

## 8. Existing Tests

`onlineExam.test.ts` (snapshot, variant, taymer, begona guruh), `examEngine.test.ts`, `unit/examBlueprint.test.ts`,
`gamification.test.ts`, `preferences.test.ts`, `executiveInsights.test.ts`, `telegramV2.test.ts` (imtihon, sotuv, sozlamalar,
qidiruv/KPI/hisobot/marketing, broadcast media, vazifa fayli), `telegramTeacher|Sales|Student|Foundation.test.ts`,
`broadcast.test.ts`, `onlinePayment.test.ts` (8 holat), `reminderJobs.test.ts`, `endpointSecurity.test.ts` (REST uchun — **bot amallarini qamramaydi**).

## 9. Required Changes

Har GAP uchun aniq ishlar — [ROADMAP-3.1.md](ROADMAP-3.1.md) da faza bo'yicha. Qisqa:
**yangi**: sozlamalar moduli, ustun paneli, takrorlanuvchi vazifa, Click/Payme adapterlari, sandbox runner, 5 Telegram hujjati;
**kengaytirish**: badge create, bot oqimlari (tasdiq, maydonlar, toifalar, tugmalar), web broadcast UI;
**tuzatish**: bot ruxsat tekshiruvi, follow-up eslatmasi Telegramga, qidiruv doirasi, bot vazifasi atomikligi.

## 10. Migration Plan (faqat qo'shuvchi, har biridan oldin `pg_dump`)

| Faza | Migratsiya |
|---|---|
| 2 | `badges.category` (VarChar, nullable), `BadgeRule` + `REFERRAL` |
| 9 | `follow_ups.priority` (enum, default NORMAL) |
| 15 | `telegram_broadcasts.buttons` (Json), `notification_deliveries.buttons` (Json) |
| 17 | `payment_intents` + provayder maydonlari (state, perform/cancel vaqtlari, prepare id, sabab) yoki `provider_transactions` jadvali; `PaymentIntentStatus` ishlatilmagan `REFUNDED` — ishga tushiriladi |
| 18 | `recurring_homeworks` jadvali; `homeworks.recurringHomeworkId` + `occurrenceDate`, unique `(recurringHomeworkId, occurrenceDate)` |
| 19 | `code_runs` (natija, limitlar, holat), vazifa test-case maydonlari |

1, 3, 4, 5, 6, 7, 8, 10–14, 16 fazalarda sxema o'zgarmaydi (Setting va UserPreference Json qiymatlari).

## 11. Security Risks (audit topgan — GAP ro'yxatidan tashqari)

| # | Xavf | Ta'siri | Qayerda |
|---|---|---|---|
| **S1** | Bot amallari REST'dagi `requirePermission` ni tekshirmaydi (`homework.manage`, `call.create`, `followup.create`, `lead.view`) — faqat ma'lumot doirasi | Ruxsati yo'q xodim (masalan o'qituvchi) botdan biriktirilmagan leadga qo'ng'iroq/follow-up yozadi; `homework.manage` siz guruh o'qituvchisi vazifa beradi | `telegram/handlers/{teacher,sales,workspace}.ts` |
| **S2** | Qidiruvda guruh va sertifikat natijalari o'qituvchi doirasisiz | O'qituvchi begona guruh nomi/sertifikatni ko'radi (web va bot) | `search.service.ts:296-310, ~447` |
| **S3** | Analitika, hisobot, qidiruv filial doirasisiz | Filialga bog'langan admin boshqa filial raqamlarini ko'radi | `analytics.service.ts:424`, `report.service.ts:1450`, `search.service.ts` |
| **S4** | Follow-up eslatmasi `tx.notification.createMany` bilan — Telegram navbatini chetlab o'tadi | Bot "eslatma shu chatga keladi" deydi, lekin kelmaydi; foydalanuvchi sozlamasi e'tiborsiz | `jobs/followUpReminder.job.ts:22-86` |
| **S5** | Botdan vazifa avval e'lon qilinadi, keyin fayllar yuklanadi | Fayl xatosida o'quvchilar faylsiz vazifa oladi | `teacher.ts:469-497` |
| **S6** | Imtihon holati urinish davomida qayta tekshirilmaydi | Bekor qilingan imtihonga javob saqlanaveradi | `examTaking.service.ts:165` |
| **S7** | Xodim tomonidagi urinish jonli bank bo'yicha baholanadi, tasodif `Math.random` sort | Savol keyin tahrirlansa natija o'zgarishi mumkin | `examAttempt.service.ts:282,431` |
| **S8** | Payme/Click ga o'tishda: parallel birinchi webhook P2002 → 500; urlencoded body'da raw body yo'q | Provayder qayta yuboradi, xato log | `onlinePayment.service.ts:175-209`, `app.ts:62` |
| **S9** | Production'da `telegram:webhook` skripti ishlamaydi (runtime image'da `tsx`/`scripts` yo'q) | Hujjatdagi buyruq xato beradi | `docs/telegram-deployment.md:38`, `backend/Dockerfile` |

Qo'shimcha kuzatuv bo'shliqlari (§44): to'lov metrikalari **yo'q**, job'lar uchun "oxirgi muvaffaqiyatli yurish" o'lchagichi yo'q,
webhook 401 va `handleUpdate` xatolari hisoblanmaydi; `PAYMENT_SANDBOX_SECRET` production compose'da yo'q; Telegram
sozlamalari uchun production tekshiruvi (token bo'lsa secret majburiy) yo'q.

## 12. Implementation Order

TZ §50 tartibi saqlanadi, bitta istisno bilan: **S1 (bot ruxsatlari) va S4 (follow-up eslatmasi)** — mavjud funksiyadagi
xavfsizlik/to'g'rilik nuqsoni, shuning uchun **PHASE 1 dan oldin "PHASE 0.5 — security hotfix"** sifatida tavsiya etiladi
(sxema o'zgarmaydi, kichik hajm). Qolgan S-bandlar tegishli fazaga biriktirilgan (ROADMAP'da).

**Qaror kerak bo'lgan savollar** (javob bo'lmasa — tavsiya etilgan variant bilan davom etiladi):
1. **DIRECTOR roli yo'q** → sozlamalar `settings.manage` bilan (OWNER + SUPER_ADMIN). *Tavsiya: yangi rol qo'shmaslik.*
2. **400 vs 422**: loyihada barcha validatsiya xatolari 422. *Tavsiya: 422 qoladi* (global o'zgarish 100+ testni buzadi); badge dublikati — 409 (Conflict) yoki TZ bo'yicha 400.
3. **Vaqt mintaqasi sozlamasi**: *tavsiya — sozlamalarda ko'rsatiladi, lekin hisoblashlar env (`APP_UTC_OFFSET_MINUTES`) bo'yicha qoladi* (runtime o'zgarishi hisobotlar tarixini buzadi).
4. **Campaign**: modeli yo'q. *Tavsiya: marketing Source bo'yicha; Campaign alohida funksiya (3.1 dan tashqari).*
5. **Leadlarga broadcast**: leadlarda Telegram bog'lanishi yo'q. *Tavsiya: BLOCKED/keyinroq* (lead botga yozishi kerak — alohida oqim).
6. **Click/Payme**: kalitlarsiz faqat adapter + test fixture'lar; production'da yoqilmaydi (fake success yo'q).
7. **Sandbox**: VPS'da gVisor (`runsc`) o'rnatish yoki alohida runner server kerak — infra qarori sizda.
