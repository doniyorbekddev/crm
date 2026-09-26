# ACADEMY CRM 3.1 — Roadmap

> Asos: [ACADEMY-3.1-AUDIT.md](ACADEMY-3.1-AUDIT.md). Tartib — `promt3.1.md` §50 (bitta qo'shimcha: PHASE 0.5).
> Har faza: `pg_dump` (migratsiya bo'lsa) → kod → testlar (unit, integratsion, xavfsizlik, E2E kerakli joyda) →
> typecheck + lint + to'liq to'plamlar → `docs/PHASE-REPORTS-3.1.md` (§53 formati) → commit + push → foydalanuvchi `continue`.
> Qoidalar: qayta yozmaslik, mavjud servislar orqali, faqat qo'shuvchi migratsiya, fake integratsiya yo'q, sir kodda yo'q.

## PHASE 0 — Audit ✅
`ACADEMY-3.1-AUDIT.md`, ushbu roadmap.

## PHASE 0.5 — Security hotfix (tavsiya, sxema o'zgarmaydi)
- **S1**: bot amallari uchun REST bilan bir xil ruxsat — `requireBotPermission(scope, ...keys)` yordamchisi (`permissionService`), `tc_hw*` → `homework.manage`, `sl_call/sl_cr/sl_cs` → `call.create` + `lead.view`, `sl_fn/sl_fw` → `followup.create`, `ws_kpi` → `attendance.mark` yoki `analytics.view`; menyu tugmalari ham shu funksiyadan.
- **S4**: `followUpReminder.job` → `notificationService.createManyInTransaction` (Telegram navbati + foydalanuvchi sozlamasi).
- **S2**: qidiruvda guruh va sertifikat — `isRosterLimited` doirasi.
- Testlar: ruxsatsiz xodim har bot amalida rad etiladi (S1 matritsasi); follow-up eslatmasi Telegram navbatiga tushadi; o'qituvchi begona guruhni qidiruvda topmaydi.

## PHASE 1 — Academy Settings (GAP-01)
- Backend: `academySettings.service` (`Setting` kaliti `academy.profile`, zod: nom, telefon, email, manzil, ish vaqti (kun × soat), valyuta, o'quv yili, vaqt mintaqasi (ko'rsatish), standart til); `GET /api/settings/academy` (auth), `PUT` (`settings.manage`); audit before/after + IP (`audit.service` naqshi).
- Logo: `POST /api/settings/academy/logo` (PNG/JPG/WEBP, `detectFileType`), ochiq `GET /api/public/branding` (nom + logo URL, login sahifasi uchun).
- Frontend: "Markaz ma'lumotlari" sahifasi (nav: Tizim), `BrandMark`, hujjat sarlavhasi va `formatMoney` sozlamadan.
- Testlar: ADMIN/TEACHER 403, OWNER/SUPER_ADMIN 200, audit old/new/IP, validatsiya, logo tur tekshiruvi, E2E.

## PHASE 2 — Badge creation (GAP-02)
- Migratsiya: `badges.category`, `BadgeRule.REFERRAL`.
- `POST /api/gamification/badges` (`gamification.manage`), `createBadgeSchema`, kalit nomdan avtomatik; nom/kalit dublikati → 400 (TZ) — `AppError.badRequest`.
- Talab xaritasi: ATTENDANCE→ATTENDANCE_RATE, HOMEWORK→HOMEWORK_COUNT, EXAM→EXAM_SCORE, XP→XP_TOTAL, STREAK→STREAK_DAYS, COURSE_COMPLETION→COURSE_COMPLETED, REFERRAL (yangi, referral oqimida `evaluateBadges`). Status COMPLETED bo'lganda ham baholash.
- Frontend: "Nishon yaratish" modal. Testlar: yaratish, dublikat 400, ruxsat, REFERRAL avtomatik berilishi.

## PHASE 3 — Column visibility (GAP-03)
- `utils/tableColumns.ts` (ustun ta'rifi: key, label, default visible, width), `useTableColumns(tableKey, columns)` (`usePreference`), `ColumnSettingsMenu` (ko'rsatish/yashirish, tartib, kenglik, "asl holatiga").
- Backend whitelist: `table.<name>.columns` kalitlari (qat'iy zod, maks. 40 ustun).
- Qo'llash: asosiy jadvallar — o'quvchilar, leadlar, to'lovlar, qarzdorlar, guruhlar, ota-onalar, o'qituvchilar, xodimlar; qolganlari keyin shu komponent bilan.
- Xavfsizlik: faqat UI (backend javobi o'zgarmaydi) — testda tasdiqlanadi. Testlar: saqlash/tiklash, noma'lum kalit 422, komponent testlari, E2E.

## PHASE 4 — Business overview filters (GAP-04)
- Allaqachon bajarilgan (9 preset, from>to rad). Qo'shimcha: "O'tgan yil" preseti, yil uchun 366 kun chegarasi o'rniga kalendar yili, regressiya testlari. Status 422 (qaror #2).

## PHASE 5 — Assessment final audit (GAP-05)
- Testlar: bir guruhdagi B o'quvchi A urinishiga (ko'rish/javob/topshirish) — 404; `shuffleQuestions`/`shuffleOptions` tartib farqi (deterministik sinov).
- **S7**: xodim yo'lida `Math.random` sort → `examBlueprint.shuffle`; xodim `submit` — snapshot bilan baholash (mavjud `AttemptQuestion` naqshi).

## PHASE 6 — Telegram online exam (GAP-06)
- Ro'yxat → **tafsilot** (savollar soni, vaqt, urinishlar, oyna) → **tasdiq** → savollar; ◀️/▶️, 💾 (joriy javob holati), 🏁 Tugatish.
- **S6**: har callbackda imtihon holati, oyna, o'quvchi guruhi va holati qayta tekshiriladi (`examTakingService` ichida — web ham foyda oladi).
- Qolgan vaqt har ekranda serverdan. Testlar: vaqt tugashi, ko'p tanlov, fayl javob, ota-ona rad, begona urinish, yopilgan imtihon, web bilan bitta urinish (E2E §35).

## PHASE 7 — Telegram homework file (GAP-07)
- Oqim TZ tartibida (guruh → sarlavha → tavsif → muddat → fayl → tasdiq); fayl turi/hajmi **qabul paytida** tekshiriladi.
- **S5**: avval fayllar yuklanadi (vaqtinchalik), keyin vazifa + biriktirmalar bitta tranzaksiyada (qoralama → e'lon); xato bo'lsa e'lon qilinmaydi.
- Testlar: noto'g'ri tur, 5 fayl chegarasi, ruxsatsiz o'qituvchi, begona guruh; E2E §36 (bot → web topshirish → baholash).

## PHASE 8 — Telegram call log (GAP-08)
- Tur (chiquvchi/kiruvchi), natija (`CallResult`), davomiylik (tugmalar: <1, 1–3, 3–5, 5+ daq yoki raqam), izoh, keyingi qadam (follow-up yoki `nextCallAt`).
- Testlar: to'liq oqim, begona lead, ruxsatsiz xodim, yopilgan lead.

## PHASE 9 — Telegram follow-up (GAP-09)
- Migratsiya: `follow_ups.priority`. Botda sana, vaqt, izoh, muhimlik; web formada ham muhimlik.
- Eslatma (PHASE 0.5 dagi tuzatish ustiga) — E2E §37: lead → qo'ng'iroq → follow-up → eslatma navbatda.

## PHASE 10 — Owner Telegram teacher KPI (GAP-10)
- `academicAnalyticsService.build(actor, {dimension:'teacher'})` → o'qituvchilar ro'yxati (guruh, o'quvchi, davomat, vazifa, imtihon, progress, retention, fikr), bittasini tanlash → tafsilot. O'qituvchining o'zi uchun mavjud ko'rinish qoladi.

## PHASE 11 — Owner Telegram marketing (GAP-11)
- `analyticsService.sources` to'liq: manba bo'yicha daromad, xarajat, ROI, foyda; davr (bu oy / o'tgan oy / 30 kun); CSV havolasi. Campaign — qaror #4.

## PHASE 12 — Owner Telegram reports (GAP-12)
- "📊 Kunlik hisobot" (dashboard + academyOverview: o'quvchi, lead, tushum, qarz, davomat, vazifa %, imtihon o'rtacha, xavf) — mavjud servislardan.
- Qolgan hisobot turlari (guruhlar, manbalar, retention…) ruxsatga qarab; CSV faylni botga `sendDocument` bilan (hisobot eksport servisi).

## PHASE 13 — Telegram settings (GAP-13)
- Toifalar: davomat, to'lov, vazifa, imtihon, yutuq, marketing/e'lon, tizim → `NotificationType` guruhlariga xarita (`config/notificationTypes.ts`).
- Kabinet hisobi bor o'quvchi/ota-ona — `NotificationSetting` (userId); oilaviy Telegram yo'li (`notifyFamily`) ham shu sozlamani hisobga oladi. Hisobsiz chat — mavjud "ovozsiz" (TelegramLink darajasida) + ixtiyoriy toifa maskasi (qaror: Json maydon yoki faqat mute).

## PHASE 14 — Telegram search (GAP-14)
- O'quvchi/ota-ona: o'z ma'lumoti (vazifa, imtihon, to'lov, sertifikat) — `searchService.portal`. Xodim: mavjud RBAC + S2 + to'lovni o'quvchi nomi bilan.
- **S3** (filial doirasi) — qidiruvda `branchFilter`. Testlar: §34 matritsasi qidiruv uchun.

## PHASE 15 — Broadcast 2.0 (GAP-15)
- Migratsiya: tugmalar (Json: `[{text, url}]`, https majburiy, maks. 3). Yetkazish worker'i `reply_markup` bilan.
- Web: "Ommaviy xabar" sahifasi — auditoriya, matn, rasm/hujjat yuklash (CRM xotirasi → Telegram'ga yuborishda fayl), tugmalar, oldindan ko'rish, tasdiq, tarix va statistika.
- Statistika: Telegram'da "delivered" tushunchasi yo'q — **qabul qilindi = SENT** (hujjatlanadi). `retry_after` hurmat qilinadi; katta auditoriya uchun navbat tezligi sozlanadi (yuk testi).
- Leadlar — qaror #5. Per-aktor broadcast limiti.

## PHASE 16 — Telegram documentation (GAP-16)
- `telegram-api.md`, `telegram-auth.md`, `telegram-permissions.md` (har bot amali × ruxsat), `telegram-notifications.md`, `telegram-testing.md`; mavjud 4 hujjat saqlanadi, dublikat o'rniga havola; eskirgan joylar (security §8) yangilanadi.
- **S9**: `telegram:webhook`/`check` production image'da ishlaydigan qilinadi (build'ga kiritish).

## PHASE 17 — Click/Payme (GAP-17) — kalitlarsiz "Ready"
- Provayder interfeysi kengayadi: `handle(req) → {status, body}` (ko'p bosqichli protokollar); sandbox mos holda qoladi.
- `click.provider.ts` (Prepare/Complete, MD5 imzo, -1…-9 xatolar), `payme.provider.ts` (JSON-RPC 6 metod, Basic auth, tiyin, -31xxx xatolar, 12 soat timeout, GetStatement).
- Migratsiya: provayder tranzaksiya holati maydonlari. Refund/void → `paymentService.refund` + `REFUNDED`. To'lov havolasi generatori.
- **S8**: parallel webhook P2002 → idempotent javob; urlencoded raw body.
- Env: `CLICK_*`, `PAYME_*` (bo'sh — provayder o'chiq, 503). Metrikalar: webhook qabul/rad/dublikat/imzo xatosi.
- Testlar: rasmiy test-case ketma-ketliklari (soxta kalit bilan), dublikat webhook → bitta to'lov (§39). Fiskal chek — merchant bilan kelishiladi (hujjatda).

## PHASE 18 — Recurring homework (GAP-18)
- Migratsiya: `recurring_homeworks`, `homeworks.recurringHomeworkId + occurrenceDate` (unique).
- Servis: CRUD + `generate(now)` (bugungi takrorlanish, `homeworkService.create` tranzaksiyasi orqali — submissions + bildirishnoma), job har 15 daq, `reportJobFailure`.
- Web: guruh vazifalari sahifasida "Takrorlanuvchi vazifa" (kunlik / haftalik / tanlangan kunlar, boshlanish/tugash, muddat soati).
- Testlar §40: ikki marta yurish → dublikat yo'q, tugash sanasidan keyin yaratilmaydi, ruxsat va doira.

## PHASE 19 — Secure code sandbox (GAP-19)
- Avval **arxitektura + infra talablari** (`docs/code-sandbox.md`): alohida `code-runner` servis, ichki tarmoq (`internal: true`), sirsiz, gVisor/nsjail, cgroup limitlari, read-only rootfs + tmpfs, vaqt/chiqish chegarasi.
- Keyin implementatsiya: navbat (DB `code_runs` + job), JS/TS/Python runner, HTML/CSS — brauzerda `iframe sandbox` (allow-same-origin'siz).
- §41 xavfsizlik testlari (cheksiz sikl, xotira, fayl tizimi, tarmoq, jarayon, sir) — runner konteynerida. **Infra tayyor bo'lmasa — "Infrastructure Ready" deb belgilanadi, fake bajarish yo'q.**

## PHASE 20 — Full regression
Barcha to'plamlar, E2E §35–38, yuk testi (broadcast katta auditoriya), `endpointSecurity`, bot ruxsat matritsasi.
- **S3 qoldig'i** (PHASE 14 da faqat qidiruv yopildi): analitika (`analytics.service`, `academicAnalytics` dan tashqari), `executive`/`academyOverview`, 15 hisobot turi (`report.service`), o'qituvchi "bugungi darslar" (`attendanceAnalytics.teacherOverview`, `group.manage` li xodim uchun) — `branch.view_all` siz xodimga faqat o'z filiali; bot (kunlik hisobot, marketing, hisobotlar) avtomatik shu servislardan oladi.
- Test to'plami `testTimeout` (yuklangan mashinada 5 s ba'zan yetmaydi).

## PHASE 21 — Production hardening
- Yetim fayllar tozalash: bekor qilingan bot vazifasi fayllari (PHASE 7) va yuborilmagan ommaviy xabar fayllari (PHASE 15, `telegram_broadcasts.mediaPath` ga bog'lanmagan, 1 soatdan eski).
Metrikalar (to'lov, job "oxirgi yurish", webhook 401, bot xatolari), Telegram env production tekshiruvi (token → secret majburiy), `PAYMENT_*`/`CLICK_*`/`PAYME_*` compose'ga, deployment hujjati, §55 qabul ro'yxati, yakuniy GAP matritsasi (§49), TZ.html/pdf.
