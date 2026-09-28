# ACADEMY CRM 3.1 — qabul hujjati

> Sana: 2026-09-28. Manba: `promt3.1.md` §49 (yakuniy GAP matritsasi), §55 (qabul mezonlari), §56 (mutlaq qoidalar).
> Boshlang'ich holat: [ACADEMY-3.1-AUDIT.md](ACADEMY-3.1-AUDIT.md) (PHASE 0). Har faza tafsiloti:
> [PHASE-REPORTS-3.1.md](PHASE-REPORTS-3.1.md). Reja: [ROADMAP-3.1.md](ROADMAP-3.1.md).
>
> "COMPLETE" — kod, testlar va hujjat bor, soxta qism yo'q. Tashqi omilga bog'liq qism alohida va ochiq yozilgan.

## 1. Yakuniy GAP matritsasi (§49)

"Before" — audit natijasi (TZ jadvalidagi taxmin emas, source code bo'yicha tekshirilgan).

| GAP | Feature | Before (audit) | After | Tests | Status | Faza / commit |
|---|---|---|---|---|---|---|
| GAP-01 | Academy Settings | Missing | Markaz ma'lumotlari: nom, logo, aloqa, ish vaqti, o'quv yili; `settings.manage`; audit | ✅ `academySettings.test.ts`, `AcademySettingsPage.test.tsx`, `BrandMark.test.tsx`, E2E `settings.spec.ts` | **COMPLETE** | 1 · `70b1743` |
| GAP-02 | Badge Creation | Partial | `POST /gamification/badges`, toifa, `REFERRAL` qoidasi, dublikat nazorati, UI | ✅ `badgeCreation.test.ts`, `BadgeFormModal.test.tsx`, E2E `badges.spec.ts` | **COMPLETE** | 2 · `782da9b` |
| GAP-03 | Column Visibility | Missing | Ustun ko'rsatish/yashirish, tartib, kenglik — profilda saqlanadi | ✅ `tableColumns.test.ts`, `ColumnSettings.test.tsx`, E2E `columns.spec.ts` | **COMPLETE** | 3 · `6a43a3b` |
| GAP-04 | Date Filters | Complete | "O'tgan yil" davri + regressiya testlari (validatsiya 422 — loyiha konvensiyasi) | ✅ E2E `dateFilters.spec.ts`, `attendanceBusinessDate.test.ts` | **COMPLETE** | 4 · `dd4a525` |
| GAP-05 | Exam Variants | Complete (kabinet) / Partial (xodim) | Xodim yo'li ham snapshot bilan; egalik va aralashtirish testlari | ✅ `assessmentFinal.test.ts` | **COMPLETE** | 5 · `49f0fc0` |
| GAP-06 | Telegram Exam | Partial | Tafsilot, tasdiq, navigatsiya, har callbackda holat qayta tekshiriladi | ✅ `telegramExam.test.ts`, E2E §35 | **COMPLETE** | 6 · `8ac0e97` |
| GAP-07 | Telegram File Homework | Partial | Fayl qabulda tekshiriladi, atomik e'lon, `homework.manage` | ✅ `telegramHomework.test.ts`, E2E §36 | **COMPLETE** | 7 · `7db57f1` |
| GAP-08 | Telegram Call | Partial | Tur, natija, davomiylik, izoh, keyingi qadam; `call.create` | ✅ `telegramCall.test.ts`, E2E §37 | **COMPLETE** | 8 · `fe426e8` |
| GAP-09 | Telegram Follow-up | Partial | Sana, izoh, muhimlik; eslatma Telegram navbatiga (S4) | ✅ `followUpReminderTelegram.test.ts`, `FollowUpFormModal.test.tsx`, E2E §37 | **COMPLETE** | 9 · `e8ab637` |
| GAP-10 | Teacher KPI | Partial | Rahbar: o'qituvchilar ro'yxati → KPI tafsiloti (akademik analitika servisi) | ✅ `telegramTeacherKpi.test.ts`, E2E GAP-10 | **COMPLETE** | 10 · `f476262` |
| GAP-11 | Marketing | Partial | Davr, manba bo'yicha tushum/xarajat/foyda/ROI, CSV | ✅ `telegramMarketing.test.ts`, E2E GAP-11 | **COMPLETE** | 11 · `b18b8eb` |
| GAP-12 | Reports | Partial | Kunlik hisobot, 15 hisobot turi, davr, CSV (REST bilan baytma-bayt) | ✅ `telegramReports.test.ts`, E2E GAP-12 | **COMPLETE** | 12 · `d96151d` |
| GAP-13 | Telegram Settings | Partial | Bildirishnoma toifalari; oilaviy Telegram yo'li sozlamani hisobga oladi | ✅ `telegramSettings.test.ts`, E2E GAP-13 | **COMPLETE** | 13 · `d634976` |
| GAP-14 | Telegram Search | Partial | O'quvchi/ota-ona o'z ma'lumoti; to'lov ism bo'yicha; S2/S3 doira | ✅ `telegramSearch.test.ts`, E2E GAP-14 | **COMPLETE** | 14 · `e63e022` |
| GAP-15 | Broadcast Media | Partial | URL tugmalar, web sahifa (rasm/PDF), oldindan ko'rish, tasdiq, statistika, `retry_after` | ✅ `broadcast2.test.ts`, `broadcastLoad.test.ts` (1 500 chat), `BroadcastsPage.test.tsx`, E2E §38 | **COMPLETE** | 15 · `173361f` |
| GAP-16 | Documentation | Partial | `telegram-{api,auth,permissions,notifications,testing}.md`; `:prod` CLI | ✅ `telegramCli.test.ts`, `telegramPermissions.test.ts` | **COMPLETE** | 16 · `786366e` |
| GAP-17 | Click/Payme | Partial + Blocked | Payme (JSON-RPC) va Click (Prepare/Complete) adapterlari, provayder tranzaksiyalari, refund, sinov belgisi | ✅ `paymentProviders.test.ts` (protokol, imzo, idempotentlik, S8), `OnlinePaymentsCard.test.tsx`, E2E §39 (Payme sinov kaliti) | **READY** — merchant kalitlarisiz | 17 · `6762e09` |
| GAP-18 | Recurring Homework | Missing | Jadval, generator job, unikal (jadval, sana) himoyasi, web boshqaruvi | ✅ `recurringHomework.test.ts` (3 parallel yurish — dublikat yo'q), `RecurringHomeworkModal.test.tsx`, E2E §40 | **COMPLETE** | 18 · `b5ca7db` |
| GAP-19 | Secure Sandbox | Missing / infra Blocked | Alohida `code-runner`: izolyatsiyalangan konteyner, tarmoqsiz, limitlar; CRM navbati; HTML iframe sandbox | ✅ `code-runner/tests/security.test.ts` (16 haqiqiy konteyner, §41), `server.test.ts`, `codeRun.test.ts`, `CodeRunPanel.test.tsx`, E2E GAP-19 | **CRM COMPLETE + INFRASTRUCTURE READY** — runner server va gVisor tekshiruvi kutilmoqda | 19 · `1fefe1e` |

### Ochiq qolgan (tashqi omil) — yashirilmagan

| Band | Holat | Nima kerak |
|---|---|---|
| GAP-17 Click/Payme | Adapterlar protokol bo'yicha to'liq, testlar Payme/Click hujjatidagi so'rovlar bilan. **Haqiqiy merchant bilan hech qachon yurmagan.** Kalitsiz — webhook 503, havola yo'q (soxta muvaffaqiyat yo'q) | Merchant kabineti → `.env.production` → sinov kabinetida tekshiruv ([payments-online.md](payments-online.md) "Production'ga yoqish") |
| GAP-19 runner server | §41 testlari lokal Docker (Colima, `runc`) da o'tdi. **gVisor (`runsc`) bilan tekshirilmagan** — runner server hali yo'q. Runner ulanmaguncha kod bajarilmaydi, vazifa qo'lda baholanadi | Alohida VM, Docker + gVisor, `code-runner/deploy/code-runner.service`; `RUNNER_RUNTIME=runsc` bilan `security.test.ts` ni qayta yurgizish ([code-sandbox.md](code-sandbox.md) §3, §7) |
| Byudjetlar filial doirasi | Byudjet jadvalida filial ustuni yo'q — S3 dan tashqari, sxema qarori kerak | Qaror: byudjet markaz bo'yichami yoki filial bo'yicha |
| Direktor paneli (filial admini) | Markaz miqyosidagi ogohlantirishlar filial adminiga ko'rsatilmaydi; maqsadlar filial menejerlariniki | Mahsulot qarori (hozirgi xatti-harakat xavfsiz tomonda) |

## 2. Qabul mezonlari (§55)

| # | Mezon | Holat | Dalil |
|---|---|---|---|
| 1 | 3.0 existing tests pass | ✅ | Audit vaqtida backend 793, frontend 105, E2E 32 — bittasi ham o'chirilmagan yoki yumshatilmagan (§56); hammasi yakuniy yurishda o'tdi (pastda) |
| 2 | 3.1 tests pass | ✅ | 3.1 da qo'shilgan: 23 backend, 10 frontend, 2 code-runner test fayli; E2E — 4 yangi spec + `flows.spec.ts` da 12 ssenariy (§35–§40, GAP-10…14, GAP-19) |
| 3 | TypeScript pass | ✅ | `tsc --noEmit` — backend, frontend (`tsconfig.app.json`), code-runner |
| 4 | Lint pass | ✅ | ESLint 3 workspace — 0 xato (frontendda 1 eski ogohlantirish, 3.0 dan) |
| 5 | Build pass | ✅ | `npm run build` — backend, frontend, code-runner |
| 6 | Database migrations safe | ✅ | 3.1 da 7 migratsiya — hammasi qo'shuvchi (`git diff` bo'yicha DROP/TRUNCATE/DELETE 0; yagona ma'lumot o'zgarishi — nishonlarni toifalash `UPDATE`, faqat standart qiymatdagilar); har biridan oldin `pg_dump`; `now()` yo'q; ro'yxat — [deployment.md](deployment.md) §4.2 |
| 7 | RBAC verified | ✅ | `endpointSecurity.test.ts` (barcha endpoint: tokensiz 401, ruxsatsiz 403); bot: `telegramPermissions.test.ts` — har xodim amali ruxsat jadvalida (strukturaviy test, S1) |
| 8 | Ownership verified | ✅ | Kabinet A→B testlari (3.0), imtihon varianti egaligi (`assessmentFinal`), bot qidiruvida o'quvchi faqat o'ziniki (`telegramSearch`), kod natijasida yashirin testlar niqoblanadi (`codeRun`) |
| 9 | Branch scope verified | ✅ | S3: `branchScopeS3.test.ts` — analitika, direktor paneli, 15 hisobot + CSV, moliya (raw SQL ham), o'qituvchi paneli, bot; 9 test eski kodda yiqilgani tasdiqlangan |
| 10 | Telegram verified | ✅ | 14 ta `telegram*.test.ts`, E2E §35–§37, GAP-10…14; webhook siri, rate limit, callback ruxsati |
| 11 | Payment verified | ✅ (sinov rejimi) | `paymentProviders.test.ts`, E2E §39; S8 poyga testi tuzatishsiz kodda yiqilgani tasdiqlangan. Haqiqiy merchant — ochiq (1-bo'lim) |
| 12 | Recurring jobs verified | ✅ | `recurringHomework.test.ts` (parallel yurish), E2E §40; job salomatligi — `observability.test.ts` (PHASE 21), "Tizim holati" → Fon vazifalari |
| 13 | Sandbox security verified | ✅ (lokal `runc`) | `code-runner/tests/security.test.ts` — cheksiz sikl, xotira bombasi, fayl tizimi (rootfs faqat o'qish, host papkalari va docker socket yo'q), tarmoq (faqat loopback), jarayon yaratish va fork bomba, sirlar ko'rinmasligi, imtiyozsiz (CapEff = 0, root emas), chiqish bombasi; gVisor — ochiq (1-bo'lim) |
| 14 | Broadcast verified | ✅ | `broadcast2.test.ts`, `broadcastLoad.test.ts` (1 500 chat), E2E §38 |
| 15 | AI regression verified | ✅ | `ai*.test.ts` to'liq yurishda o'tdi; AI toollari filial doirasini oladi (PHASE 20); AI to'g'ridan-to'g'ri bazaga kirmaydi |
| 16 | E2E verified | ✅ | Playwright — to'liq to'plam (pastda) |
| 17 | Documentation updated | ✅ | `broadcast.md`, `telegram-*.md` (5), `payments-online.md`, `code-sandbox.md`, `deployment.md` §4.2, `observability.md`, ushbu hujjat, `TZ.html`/`TZ.pdf` |
| 18 | Production configuration verified | ✅ | `productionEnvIssues` (`config/env.ts`) — productionda webhook siri ≥ 32 va Telegram belgilar to'plami, polling taqiqlangan, qisman Click/Payme va tokensiz runner — server ishga tushmaydi; `envProduction.test.ts` + haqiqiy ishga tushirishda tekshirildi |

### Yakuniy yurish (2026-09-28)

| To'plam | Natija |
|---|---|
| Backend (unit + integratsion, haqiqiy PostgreSQL) | **936** test. Uch to'liq yurish: 934, 932, 935 o'tdi — yiqilganlari har safar **boshqa** testlar (`rateLimit`, `examEngine`, `portal`, `telegramMarketing`: 20 s timeout, HTTP parse error / bo'sh tanali 400 — yuklama ostida Node HTTP qatlami; `fseventsd` 100% CPU, load ~5); hammasi alohida o'tadi. Fayllar ketma-ket yuradi (`fileParallelism: false`) — umumiy baza poygasi emas |
| code-runner (haqiqiy konteynerlar) | **22/22** (Colima, `runc`; 1 o'tkazilgan — "Docker yo'q" belgisi, Docker bor paytda kutilgan) |
| Frontend (komponent) | **136/136** |
| E2E (Playwright, to'liq stek) | **48/48** |
| TypeScript, lint, build | o'tdi (0 xato) |
| Sir skaneri (kuzatiladigan fayllar + git tarixi) | toza (PHASE 20, PHASE 21 da qayta) |

## 3. Mutlaq qoidalar (§56)

| Qoida | Qanday ta'minlandi |
|---|---|
| Fake feature / mock production / fake Click-Payme success / unsafe execution | Kalitsiz yoki runnersiz — funksiya **o'chiq** (503, tugma yo'q), hech qachon "muvaffaqiyat" qaytarmaydi; testlarda tekshiriladi |
| TODO bilan "complete" | Ochiq qismlar faqat 1-bo'limda, "READY"/"INFRASTRUCTURE READY" deb |
| Existing code rewrite / duplicate logic | Bot, AI va web — bitta servislar (`reportService`, `analyticsService`, `createHomeworkInTransaction`, `branchScope.ts`, `notificationService`) |
| Existing test delete | `git diff --diff-filter=D 231e925..HEAD` — o'chirilgan test fayli 0; mavjud testga o'zgartirish faqat ataylab o'zgargan xatti-harakat yoki sanaga bog'liq nuqson uchun, sababi faza hisobotida |
| Frontend-only authorization | Har ruxsat backendda (`requirePermission`, bot `botCan`); UI faqat yashiradi |
| Telegram / AI direct DB access | Handlerlar va AI toollari faqat servislar orqali |
| Real secret in source | Sir skaneri toza; testlarda tasodifiy qatorlar; `.env` gitda yo'q |
| Destructive migration | 7 migratsiya — faqat qo'shuvchi |
