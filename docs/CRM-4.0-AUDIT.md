# IT-Academy CRM 4.0 — mavjud tizim auditi

> Sana: 2026-10-05 · Holat: commit `ce397df` · Faqat o'qish auditi — kod, sxema va migratsiyalarga tegilmagan.
> Reja: [CRM-4.0-ROADMAP.md](CRM-4.0-ROADMAP.md).

**Qanday tekshirildi.** Kod bazasi to'rt yo'nalishda o'qildi (arxitektura/xavfsizlik, o'quv jarayoni, pul va sotuv, rahbar/intellekt qatlami).
Hech narsa ishga tushirilmagan: yuklama testi, `EXPLAIN` yoki production serverni tekshirish qilinmagan. Shuning uchun:

- **[T]** — kodda bevosita tekshirilgan (fayl va qator ko'rsatilgan);
- **[X]** — koddan xulosa qilingan, lekin ishlab turgan tizimda tasdiqlanishi kerak.

Holat belgilari: **EXISTS** (bor va ishlaydi) · **PARTIAL** (qisman) · **MISSING** (yo'q) · **NEEDS IMPROVEMENT** (bor, lekin zaif).

---

## 1. Qisqa xulosa

Tizim noldan qayta yozishni talab qilmaydi. Operatsion CRM/LMS sifatida u kuchli: to'lov va buxgalteriya yadrosi, imtihon va uy vazifasi
dvigateli, kabinetlar, Telegram bot, xavf bahosi, ogohlantirishlar va avtomatlashtirish ishlaydi, 62 ta migratsiyaning hech biri buzuvchi emas,
backendda 950 ga yaqin integratsion test bor.

CRM 4.0 ga yo'lda uchta **tuzilmaviy** to'siq bor — qolgan deyarli hamma narsa ularga bog'liq:

1. **Bitta o'quvchi = bitta kurs = bitta shartnoma = bitta qarz.** `Enrollment`/`Contract` modeli yo'q. Shu sabab qayta yozilish (renewal),
   ikkinchi kurs, keyingi bosqich uchun oldindan to'lov, to'g'ri LTV va bitiruvchilar bilan ishlash mumkin emas.
2. **Alohida dars (sana + vaqt) obyekti yo'q.** Jadval — guruhdagi haftalik qolip; dars yozuvi davomat belgilanganda paydo bo'ladi.
   Shu sabab ko'chirish, o'rinbosar o'qituvchi, ta'til, sinov darsi va "bugungi darslar" taxtasi to'g'ri ishlay olmaydi.
3. **"Ish" (case/vazifa) qatlami yo'q.** Vazifani faqat avtomatlashtirish yaratadi (qo'lda yaratib bo'lmaydi), ogohlantirish va
   bildirishnomani birovga biriktirib, muddat qo'yib, natijasini kuzatib bo'lmaydi. Rahbar muammoni ko'radi, lekin shu yerdan topshiriq bera olmaydi.

Bundan tashqari **production uchun xavfli 6 ta nuqson** topildi (§12) — ular 4.0 dan qat'i nazar, birinchi tuzatilishi kerak.

Miqyos: hozirgi arxitektura bitta serverda **5 000 o'quvchigacha** ishlaydi (kichik tuzatishlar bilan), **10 000** uchun fon vazifalari va
hisobotlarni SQL darajasiga o'tkazish kerak, **50 000** uchun navbat/worker, kesh va rollup jadvallarsiz yaroqsiz (§11).

---

## 2. Joriy arxitektura

| Qatlam | Texnologiya | Hajm |
|---|---|---|
| Backend | Express 5, Prisma 7, PostgreSQL 17, Zod 4 | ≈58 500 qator; 48 route fayli (466 handler), 53 controller, 105 servis, 51 validator, 17 fon vazifasi |
| Frontend | React 19, Vite 8, Tailwind 4, React Query, zustand | 225 sahifa fayli (≈40 000 qator), 77 marshrut (62 xodim, 14 kabinet), 35 UI primitiv |
| Telegram | O'z routeri, 9 handler, webhook (production) | ≈5 300 qator |
| Kod sandbox | Alohida `code-runner` servisi (gVisor) | CRM navbat orqali |
| Testlar | Vitest (real Postgres), Playwright | backend ≈955, frontend 195, E2E 51 |

**Naqshlar (hammasida bir xil):** route → `requirePermission` → controller (`schema.parse`) → servis (barcha biznes mantiq va doira) →
`sendSuccess`. Javob qolipi `{ success, data, message, meta }`. Xatolar markaziy `errorHandler` orqali. Audit yozuvi biznes tranzaksiyasi ichida.

**Fon vazifalari:** 17 ta `setInterval` (1 daqiqadan 24 soatgacha), hammasi backend jarayonining ichida (`backend/src/server.ts:31-66`).
Navbat, Redis, taqsimlangan qulf yo'q.

---

## 3. Ma'lumotlar modeli

106 model, 77 enum, 234 indeks, 62 migratsiya (2026-09-11 … 09-28; `DROP TABLE/COLUMN`, `DELETE`, `TRUNCATE` yo'q) **[T]**.

| Soha | Modellar |
|---|---|
| Identifikatsiya / RBAC | User, Role, Permission, RolePermission, RefreshToken, PasswordResetToken |
| Tashkilot | Branch, Room, Setting, UserPreference, AuditLog |
| Sotuv | Source, Lead, LeadActivity, LeadNote, Call, FollowUp, LeadAssignmentRule, SalesTarget |
| O'quv yadrosi | Course, CourseModule, CourseTopic, Group, Student, StudentStatusChange, StudentGroupChange, Parent, StudentParent |
| LMS / progress | Lesson, LessonMaterial, LessonProgress, StudentTopicProgress, TopicMastery, StudentProgressSnapshot, Certificate |
| Davomat | Attendance, AttendanceSession |
| Uy vazifasi | Homework, RecurringHomework, HomeworkSubmission, HomeworkAttachment, SubmissionAttachment, Rubric, CodeRun |
| Imtihon | Exam, ExamResult, Question, QuestionOption, ExamQuestion, ExamAttempt, ExamAnswer, AttemptQuestion |
| Gamifikatsiya | GamificationProfile, XpRule, XpTransaction, Level, Badge, StudentBadge, Streak |
| To'lov / qarz | Payment, PaymentRefund, Debt, PaymentInstallment, PaymentIntent, PaymentProviderTransaction, FinancialPeriod |
| Moliya | FinancialAccount, Transaction, IncomeCategory, ExpenseCategory, Income, Expense, RecurringExpense, Budget, BudgetLine |
| HR / maosh | TeacherProfile, TeacherSalaryRule, TeacherSalaryPeriod, TeacherSalaryPayment, CommissionEntry, PayrollAdjustment, Employee, EmployeeLeave |
| Chegirma / taklif | DiscountRule, PromoCode, StudentDiscount, Referral |
| Fikr / ombor | Feedback, ProductCategory, Product, StockMovement |
| Bildirishnoma / Telegram | Notification, NotificationSetting, NotificationDelivery, TelegramLink, TelegramSession, TelegramEvent, TelegramBroadcast |
| AI / avtomatlashtirish | AiAnalysis, AiQuery, AutomationRule, AutomationRun, Task, Alert, Document, PendingUpload |

**Muhim xususiyatlar**

- Pul — `Decimal(14,2)` + bazada CHECK cheklovlari; kodda butun so'm sifatida ishlatiladi.
- Idempotentlik kalitlari: `Payment.idempotencyKey`, `Notification.dedupeKey`, `Alert.dedupeKey`, provayder tranzaksiyalari, takrorlanuvchi vazifa/xarajat.
- Soft delete faqat 5 modelda (User, Lead, Student, Payment, Document).
- `branchId` faqat 14 modelda; qolganlari bog'liq model orqali doiraga olinadi (§6).
- **Markaziy cheklov [T]:** `Student` da bitta `courseId`, bitta `groupId`, bitta `contractPrice`, bittaga-bitta `Debt`
  (`schema.prisma:984-990, 1072`); o'quvchi darajasida tugash sanasi yo'q; `PaymentInstallment` o'quvchiga bog'langan, shartnomaga emas.
- **Jadval cheklovi [T]:** `Group` faqat haftalik qolip saqlaydi (`scheduleDays`, `startTime`, `endTime`); `AttendanceSession`
  `(groupId, date)` bo'yicha unikal — bir kunda ikki dars yoki qo'shimcha dars mumkin emas.

---

## 4. Mavjud modullar (qisqa inventar)

| # | Modul | Holat | Izoh |
|---|---|---|---|
| 1 | Autentifikatsiya | EXISTS | JWT + aylanuvchi refresh (oila bo'yicha qayta ishlatishni aniqlash), parol siyosati, bloklash; **2FA yo'q** |
| 2 | RBAC | EXISTS | 92 ruxsat, 34 modul, 9 rol; servis darajasida qator doirasi (o'z leadlari, o'z guruhlari) |
| 3 | Filial doirasi | PARTIAL | 14 modelda ustun, hisobotlarda `branchScope`; byudjet va moliyaviy davr global (§6) |
| 4 | O'quvchilar | EXISTS | Holatlar, holat va guruh tarixi, ko'chirish (qulf bilan), xavf bahosi (10 omil) |
| 5 | Ota-onalar | EXISTS | Bog'lash, asosiy vakil, kabinet; CRM qismi (muloqot, shikoyat) yo'q |
| 6 | O'qituvchilar | EXISTS | Profil, oylik KPI, 6 oylik tarix, hujjatlar; maqsad va snapshot yo'q |
| 7 | Guruh va kurslar | EXISTS | Dastur (modul → mavzu → dars), sig'im, xonalar, haftalik ziddiyat tekshiruvi |
| 8 | Davomat | EXISTS | 4 holat, sessiyalar, kalendar, reyting, statistika, ota-onaga xabar |
| 9 | Uy vazifasi | EXISTS | Maqsad turlari, rubrika, takrorlanuvchi, kod vazifasi, to'liq hayot sikli |
| 10 | Imtihonlar | EXISTS | Savollar bazasi, blueprint, urinish snapshoti, avto/qo'lda baholash, savol tahlili |
| 11 | Progress | EXISTS | Mavzu o'zlashtirishi, oylik snapshot, haftalik hisobot |
| 12 | XP / gamifikatsiya | EXISTS | Idempotent XP daftari, darajalar, nishonlar, seriya, reyting |
| 13 | Sertifikatlar | EXISTS | Snapshot, ochiq tekshirish, bekor qilish |
| 14 | Moliya | EXISTS | Daftar, hisoblar, P&L, pul oqimi, byudjet, davrni yopish, xarajat tasdig'i |
| 15 | Maosh / KPI | EXISTS | 5 model, davr qulfi, komissiya daftari, avans; KPI → bonus avtomatik emas |
| 16 | Sotuv / leadlar | EXISTS | 9 holat, kanban, skoring, taqsimot qoidalari, qo'ng'iroq, follow-up, reja |
| 17 | Marketing | PARTIAL | Manba bo'yicha ROI bor; kampaniya, UTM, ochiq lead qabul qilish yo'q |
| 18 | Telegram bot | EXISTS | O'quvchi / ota-ona / xodim; rahbar paneli faqat o'qish uchun |
| 19 | O'quvchi kabineti | EXISTS | ≈38 endpoint, egalik har chaqiruvda tekshiriladi |
| 20 | Ota-ona kabineti | EXISTS | Farzandlar bo'yicha xulosa, to'lov, hisobot |
| 21 | Bildirishnomalar | EXISTS | 26 tur, outbox navbati, sozlamalar; amal (biriktirish, kechiktirish) yo'q |
| 22 | Avtomatlashtirish | PARTIAL | 7 tizim + maxsus qoidalar (faqat o'quv triggerlari), sinov rejimi |
| 23 | AI | PARTIAL | Yordamchi (faqat o'qish) va o'quv tahlili (inson tasdig'i bilan); rahbar darajasida yo'q |
| 24 | Hisobotlar | EXISTS | 15 tur, CSV/XLSX; rejalashtirish va saqlangan filtr yo'q |
| 25 | Global qidiruv | EXISTS | 14 guruh, ruxsat/filial/ro'yxat doirasi |
| 26 | Audit / xavfsizlik | EXISTS | 199 chaqiruv joyi, before/after, saqlash muddati |
| 27 | Onlayn to'lov | PARTIAL | Click/Payme adapterlari tayyor; haqiqiy merchant kalitlari bilan sinalmagan |
| 28 | Kod sandbox | PARTIAL | CRM qismi tayyor; runner serveri (gVisor) kutilmoqda |
| 29 | Docker / deploy | EXISTS | Multi-stage, migratsiyadan oldin zaxira, sog'liq kutish, avtomatik rollback |
| 30 | Fikr / NPS | EXISTS | 4 tur, NPS hisobi, salbiy fikr xabari; so'rovnoma kampaniyasi yo'q |

---

## 5. API va frontend tuzilishi

- **API:** `/api` ostida ≈56 router. Sahifalash `page/limit` (limit ≤ 100), har ro'yxat alohida `count(*)` bilan. Eksport 5 000 qator,
  hisobot 1 000 qator bilan cheklangan.
- **Frontend:** har marshrut alohida chunk (lazy). Server holati React Query (`staleTime` 30 s). Tiplar va ruxsat kalitlari backenddan
  **qo'lda** ko'chirilgan (umumiy kontrakt yo'q).
- **Real vaqt:** WebSocket/SSE yo'q; faqat so'rov (qo'ng'iroqcha 60 s).
- **Til:** faqat o'zbekcha, satrlar kodda (i18n kutubxonasi yo'q).

---

## 6. Xavfsizlik va RBAC

**Kuchli tomonlar [T]:** refresh token oilasi va qayta ishlatishni aniqlash; `SameSite=strict` cookie faqat `/api/auth` uchun; har so'rovda
foydalanuvchi holati tekshiriladi; fayllar magic-byte bo'yicha tekshiriladi va faqat ruxsat bilan uzatiladi; CSV formula inyeksiyasidan himoya;
production uchun qat'iy env tekshiruvi; Telegram webhook maxfiy token bilan.

**Zaif tomonlar**

| # | Muammo | Dalil | Belgi |
|---|---|---|---|
| S1 | `TRUST_PROXY=1`, lekin zanjirda ikki nginx (host → konteyner → backend). Barcha foydalanuvchi bitta IP bo'lib ko'rinadi: 300 so'rov/daq va login cheklovi butun markazga umumiy, auditda IP bir xil | `docker-compose.prod.yml:67`, `frontend/nginx/app.conf:46`, `deploy/nginx/crm.conf.example:34`, `backend/src/app.ts:27` | **[X]** — serverda `audit_logs.ip` ni tekshiring |
| S2 | To'lovlar eksporti filial doirasini qo'llamaydi (ro'yxat va statistika qo'llaydi) | `payment.controller.ts:21-25`, `payment.service.ts:260-261` | **[T]** |
| S3 | 2FA yo'q (egasi, buxgalter uchun ham) | — | [T] |
| S4 | Hisobni bloklash DoS: 8 marta noto'g'ri parol to'g'ri parolni ham bloklaydi | `auth.service.ts:166-187` | [X] |
| S5 | Ochiq ro'yxatdan o'tish (`POST /auth/register` → PENDING) | `auth.service.ts:238` | [T] |
| S6 | Filial izolyatsiyasi to'liq emas: fikrlar va takliflar ro'yxati filialsiz; byudjet va moliyaviy davr global; fon xabarlari filialga qaramaydi; standart doira — "barcha filiallar" | `feedback.service.ts:126-160`, `referral.service.ts:150-165`, `branchScope.ts:22` | [X] |
| S7 | Audit jurnali bazada o'zgartirib bo'lmaydigan emas; eksportlar (hisobot, lead, to'lov) auditga yozilmaydi | `audit.controller.ts:39` | [T] |
| S8 | SPA uchun CSP yo'q; `/assets/` va `index.html` da xavfsizlik sarlavhalari meros olinmaydi | `frontend/nginx/app.conf` | [X] |
| S9 | AI yoqilganda o'quvchi javobi/kodi tashqi API ga ketadi; anonimlashtirish bosqichi yo'q; xarajat chegarasi yo'q | `ai/academic.service.ts:437`, `ai/llm.ts` | [T] |

---

## 7. Testlar

| Tur | Hajm | Izoh |
|---|---|---|
| Backend integratsion | 126 fayl, real Postgres | Kuchli: xavfsizlik, filial izolyatsiyasi, moliya, Telegram, to'lov provayderlari |
| Backend unit | 16 fayl | |
| Frontend | 51 fayl, 195 test | Asosan utilitalar va UI primitivlar; sahifa darajasida kam |
| E2E | 21 spec, 51 test | Auth, RBAC, lead, to'lov, kabinet, o'qitish, oqimlar |
| code-runner | 17 test | Xavfsizlik testlari Docker talab qiladi |

**Bo'shliqlar:** qamrov chegarasi yo'q; yuklama testi CI da yo'q (`perf:bench` skripti bor); `TEST_DATABASE_URL` bo'lmasa 126 fayl **jimgina
o'tkazib yuboriladi**; parallellik testi faqat to'lov dublikatida; E2E maosh, qaytarish, davrni yopish, chegirma, rollarni qamramaydi;
bog'liqlik va maxfiy ma'lumot skaneri yo'q. To'plam yuk ostida beqaror (`testTimeout` 20 s ga ko'tarilgan; har yurishda 1–3 test vaqt bo'yicha yiqiladi).

---

## 8. Integratsiyalar, avtomatlashtirish, AI

- **Telegram:** uch rol, bog'lash kodi, navbat orqali yetkazish (daqiqasiga ≈1 000 xabar), ommaviy xabar. Rahbar bot orqali ko'radi,
  lekin amal qila olmaydi (vazifa, tasdiq, ogohlantirishni yopish yo'q).
- **Onlayn to'lov:** intent + provayder tranzaksiyasi holat mashinasi; webhook imzosi; sinov rejimi. Provayderda pul bor, lekin kvitansiya
  yozilmagan holat uchun (yopiq davr, ortiqcha to'lov) **solishtirish navbati yo'q**.
- **Avtomatlashtirish:** oq ro'yxatdagi trigger va amallar, kunlik dedupe, sinov rejimi. Maxsus qoidalarda faqat o'quv triggerlari;
  bitta qoidada bitta shart; moslik soniga chegara yo'q; `CREATE_TASK` har doim birinchi menejerni tanlaydi (`automationBuilder.ts:276`).
- **AI:** xavfsiz qurilgan — faktlarni kod hisoblaydi, model faqat matn yozadi, sxema bilan tekshiriladi, har amal inson tasdig'i va o'z
  ruxsati bilan. Lekin faqat o'quv sohasida; `AiAnalysis` READY/ACCEPTED/REJECTED da to'xtaydi — bajarildi va natija tekshirildi bosqichi yo'q.
- **Tasdiqlash oqimlari** alohida-alohida yozilgan (xarajat, maosh, ta'til, davr, AI) — umumiy obyekt yo'q. Xarajat tasdig'i eng yaxshi namuna
  (`expenseWorkflow.service.ts`).

---

## 9. Production va deploy

**Bor:** multi-stage Docker, root bo'lmagan foydalanuvchi, `deploy.sh` (zaxira → migratsiya → sog'liq → rollback), kunlik `pg_dump`,
Prometheus metrikalari, Sentry, sekin so'rov jurnali.

**Yo'q yoki zaif:** zaxira shu serverning o'zida (tashqi nusxa yo'q); yuklangan fayllar zaxiralanmaydi; PITR yo'q (yo'qotish 24 soatgacha);
ogohlantirish qoidalari va dashboard yo'q (monitoring passiv); ulanishlar puli sozlanmagan; konteynerlarda resurs chegarasi yo'q;
deploy paytida qisqa uzilish; rollback kodni qaytaradi, sxemani emas.

---

## 10. Kuchli tomonlar, zaifliklar, texnik qarz

**Kuchli tomonlar**

1. To'lov yaratish yo'li: qator qulfi, idempotentlik, dublikat oynasi, ortiqcha to'lov nazorati — hammasi bitta tranzaksiyada.
2. Buxgalteriya daftari: hech narsa o'chirilmaydi (VOID/REVERSED), davrni yopish barcha yozuvlarda majburiy.
3. Komissiya va maosh: idempotent manba kalitlari, qulflangan oy uchun keyingi oyga ko'chirish.
4. Imtihon dvigateli va uy vazifasi hayot sikli.
5. Xavf bahosi: tushuntiriladigan omillar, ma'lumot yo'q omil hisobga olinmaydi.
6. Bildirishnoma outbox'i va oilaga xabarlar qamrovi.
7. Servis darajasidagi avtorizatsiya (`leadAccess`, `teachingAccess`, `branchScope`) va izolyatsiya testlari.
8. AI xavfsizlik arxitekturasi (faktlar kodda, inson tasdig'i).
9. Faqat qo'shimcha migratsiyalar va rollbackli deploy.
10. Katta integratsion test to'plami va CI → deploy darvozasi.

**Zaifliklar**

1. Bitta jarayonli dizayn: 17 fon vazifasi, xotiradagi rate-limit va kesh, lokal fayllar.
2. Har 30 daqiqada N ta ketma-ket yozuv: xavf bahosi (har o'quvchiga bitta UPDATE), lead skoringi; haftalik hisobot ketma-ket.
3. Dashboard, analitika va hisobotlar cheklanmagan `findMany` ni JS da yig'adi, kesh yo'q, kompozit indekslar yetishmaydi.
4. Yagona yozilish modeli (§1).
5. Dars obyekti yo'q (§1).
6. Ish/vazifa qatlami yo'q (§1).
7. Filial izolyatsiyasi qisman.
8. Tarix saqlanmaydi: xavf bahosi, sog'liq bahosi, KPI, "o'tgan oyda qancha muddati o'tgan edi" — hammasi faqat joriy qiymat.
9. Qat'iy UTC siljishi (haqiqiy vaqt mintaqasi emas); faqat o'zbekcha satrlar.
10. 900–1 500 qatorli servislar; frontend/backend kontrakti qo'lda takrorlangan.

**Texnik qarz (aniq nuqtalar)**

- "X ruxsati bor foydalanuvchilar" so'rovi kamida 5 joyda takrorlangan; vaqt bo'laklariga ajratish 3 servisda alohida yozilgan.
- **Bildirishnoma toifalari ikki xil** — `config/notificationTypes.ts` da 7 toifa (ATTENDANCE, PAYMENT, …) va
  `validators/notification.validator.ts` da boshqa 7 toifa (SALES, FINANCE, …). Ikkinchisi shu oy redesign paytida qo'shilgan va mavjudini
  takrorlaydi — bittasiga birlashtirish kerak. **[T]**
- `Group.room` (matn) va `roomId` yonma-yon yashaydi.
- Saqlash muddati yo'q: `refresh_tokens`, `telegram_events`, `notifications`, `notification_deliveries`, `xp_transactions`, `ai_queries`, `automation_runs`.
- Mahsulot nomi hali "Sales CRM" (`package.json`, compose loyihasi).

---

## 11. Miqyos bahosi (5 000 / 10 000 / 50 000 o'quvchi)

O'lchov qilinmagan — so'rovlarni o'qish asosida **[X]**.

| Birinchi og'riydigan joy | Dalil | 5k | 10k | 50k |
|---|---|---|---|---|
| Xavf bahosini qayta hisoblash (har 30 daq, har o'quvchiga UPDATE, 14 ta `IN (barcha id)`) | `studentRisk.service.ts:324-363, 493-548` | sekinlashadi | muammo | ishlamaydi |
| Lead skoringi (barcha ochiq leadlar, bittadan UPDATE) | `leadScore.service.ts:223-266` | OK | sekin | muammo |
| Haftalik hisobot (o'quvchi boshiga ≈8 so'rov, ketma-ket, AI bilan 25 s gacha) | `weeklyReport.job.ts:31-67` | AI bilan soatlab | muammo | ishlamaydi |
| Dashboard/hisobot: xom qatorlarni JS da yig'ish; barcha `STATUS_CHANGED` har so'rovda | `dashboard.service.ts:423, 499-530`, `analytics.service.ts:181-235` | sezilarli | sekin | ishlamaydi |
| Qarz ro'yxati: barcha bo'lib to'lashlar bo'yicha oyna funksiyasi + cheksiz `IN` | `debt.service.ts:149-155, 194` | OK | sekin | muammo |
| Davomatni saqlash: 30 s tranzaksiya, har o'quvchiga butun tarix | `attendance.service.ts:340`, `gamification.service.ts:183` | OK | OK | pulni band qiladi |
| Ommaviy xabar: daqiqasiga ≈1 000, tranzaksion xabarlar bilan bitta navbat | `notificationDelivery.service.ts:22-29` | OK | OK | 1 soat+ |

**Xulosa:** 5 000 — bitta serverda ishlaydi (yuqoridagi dastlabki ikki band tuzatilsa, bemalol). 10 000 — fon vazifalari to'plamli SQL ga,
dashboard agregatlari SQL + qisqa keshga o'tishi va indekslar qo'shilishi shart. 50 000 — alohida worker va navbat, Redis (kesh, rate-limit,
qulf), rollup jadvallar, obyekt saqlash, ulanishlar puli, o'qish uchun replika kerak.

---

## 12. Production uchun xavfli nuqsonlar (4.0 dan qat'i nazar)

| # | Nuqson | Oqibat | Dalil | Belgi |
|---|---|---|---|---|
| B1 | `TRUST_PROXY` ikki proxy uchun noto'g'ri | Rate-limit va login bloklash butun markazga umumiy; audit IP bir xil | §6 S1 | [X] |
| B2 | To'lovlar eksporti filial doirasisiz | Filial xodimi barcha filial to'lovlarini yuklab oladi | `payment.service.ts:260` | [T] |
| B3 | Qaytarish (refund) qulfsiz: qaytariladigan summa tranzaksiyadan oldin hisoblanadi | Ikki parallel qaytarish to'lov summasidan oshishi mumkin | `payment.service.ts:599-612` | [T] |
| B4 | Chegirma berish/bekor qilish va o'quvchini tahrirlash `Debt` ga qulfsiz yozadi | Parallel to'lov bilan qarz qoldig'i eskirgan qiymatda qolishi mumkin | `discount.service.ts:574-600`, `student.service.ts:436-470` | [X] |
| B5 | Guruhni tahrirlashda xona (`roomId`) saqlanmaydi (ziddiyat tekshiriladi, lekin `data` da yo'q) | Xonani almashtirish jimgina yo'qoladi | `group.service.ts:285-300` | [T] |
| B6 | Zaxira shu serverda, fayllar zaxiralanmaydi, PITR yo'q | Disk ishdan chiqsa — hamma narsa yo'qoladi | `scripts/backup-db.sh`, `docs/deployment.md:337` | [T] |

Qo'shimcha (xavfi pastroq): bitirgan/ketgan o'quvchi guruhda o'rin egallab turadi (`group.service.ts:34`, `student.service.ts:643-680`);
qaytarish daftar yozuvi filialsiz (`payment.service.ts:629-638`); taklif mukofoti takroriy bosishda poyga (`referral.service.ts:229-248`);
avtomatlashtirishdagi `daysBefore` parametri filtrga qo'llanmaydi (`automation.service.ts:270-274`).

---

## 13. Biznes bo'shliqlari

Rahbar bugun **ko'ra oladi**: moliya, sotuv voronkasi, davomat, xavf ostidagi o'quvchilar, ogohlantirishlar, sog'liq bahosi.

Rahbar bugun **qila olmaydi**:

- muammodan topshiriq yaratib, mas'ul va muddat belgilash, natijasini ko'rish;
- qarzdorlarni kim undirayotganini, va'dalar bajarilganini, undirish samaradorligini bilish;
- kursi tugayotgan o'quvchilarni va qayta yozilish foizini ko'rish;
- xodimlar ish yuki va javob tezligini (lead ga birinchi javob, vazifani bajarish) kuzatish;
- kampaniya darajasida marketing samarasini o'lchash;
- bugungi darslar holatini jonli ko'rish (qaysi xonada, kim belgilamadi, kim kelmadi);
- ko'rsatkichlar tarixini ko'rish (sog'liq bahosi, xavf, KPI vaqt bo'yicha).

---

## 14. CRM 4.0 bo'shliq tahlili

### 14.1. Asosiy 6 ustuvorlik

**1. Student Lifecycle 2.0 — PARTIAL**

| Bosqich | Holat | Izoh |
|---|---|---|
| MARKETING → LEAD | PARTIAL | Manba bor; kampaniya/UTM yo'q; lead'siz yaratilgan o'quvchida manba yo'q |
| LEAD → CONTACT | EXISTS | Holat, qo'ng'iroq, follow-up |
| TRIAL | MISSING | Faqat lead holati; sinov darsi obyekti (guruh, sana, keldi/kelmadi) yo'q |
| ENROLLMENT | PARTIAL | O'quvchi yozuvining o'zi; alohida yozilish yo'q |
| PAYMENT → GROUP → LESSON → ATTENDANCE → HOMEWORK → EXAM → PROGRESS | EXISTS | Kuchli |
| RENEWAL | MISSING | Modelda imkoni yo'q |
| GRADUATION | PARTIAL | Qo'lda holat o'zgartirish; mezon, ommaviy bitirish yo'q; o'rin bo'shamaydi |
| ALUMNI / REFERRAL | MISSING / PARTIAL | ALUMNI faqat enum; taklif — bitta chegirma qoidasi |

- Yagona bosqich maydoni va yagona vaqt chizig'i yo'q (uch alohida jurnal); holat o'tish qoidalari yo'q (istalgan holatdan istalganiga).
- **Kerak:** `Enrollment` (o'quvchi × kurs × guruh × shartnoma × bosqich), `StudentLifecycleEvent`, `TrialLesson`, o'tish holat mashinasi.
- **Tegmaslik kerak:** `Payment` dagi snapshot ustunlar, tarix jadvallari, `convertFromLead` atomikligi, qulfli ko'chirish.

**2. Collections / Debt Management — PARTIAL**

| Band | Holat | Izoh |
|---|---|---|
| Yaqin to'lovlar | EXISTS | Qat'iy 7 kun |
| Bugun to'lanishi kerak | PARTIAL | Hisoblanadi, ro'yxat filtri yo'q |
| Muddati o'tgan | EXISTS | Summa va kunlar |
| Qarz yoshi (0–30 / 31–60 / …) | MISSING | Guruhlash faqat summa bo'yicha |
| Eslatmalar | PARTIAL | Ilova + Telegram; kuniga bitta; bosqichli (K−3, K, K+3, K+7) emas; SMS yo'q |
| Undirish vazifalari | PARTIAL | `Task` bor, to'lov qoidalari faqat xabar yuboradi |
| Mas'ul xodim | MISSING | Qarz yoki o'quvchida egasi yo'q |
| Eskalatsiya, to'lov va'dasi | MISSING | |
| Statistika (undirilgan / kutilgan, xodim bo'yicha) | MISSING | Tarix saqlanmaydi |

- **Kerak:** `CollectionCase` (egasi, bosqich, va'da sanasi/summasi, natija), yosh bo'yicha SQL, eslatma kadensiyasi, oylik snapshot.
- **Tegmaslik kerak:** holatsiz bo'lib to'lash dizayni (taqsimot `Debt.paidAmount` dan hisoblanadi) va bitta SQL li `scheduleDueStats`.

**3. Renewal Engine — MISSING (model to'sig'i)**

O'quvchi darajasida tugash sanasi, keyingi kurs zanjiri, qayta yozilish oqimi yo'q. Bugun ikkinchi kurs uchun o'quvchini tahrirlash kerak —
bu kurs tarixini o'chiradi va A kursi to'lovlarini B kursi shartnomasiga hisoblaydi (`student.service.ts:451-470`). Kogorta hisobotida kursni
tugatib qayta yozilmagan o'quvchi "saqlangan" deb sanaladi (`analytics.service.ts:399-401`).
**Kerak:** `Enrollment` (14.1-1), `Course.nextCourseId`, yangilash oynasi, taklif, natija (yangilandi / yo'qotildi + sabab), foiz hisoboti.

**4. Student Success Center — PARTIAL**

| Band | Holat |
|---|---|
| E'tibor talab qiladigan va xavf ostidagi o'quvchilar | EXISTS |
| Davomat / o'quv / vazifa / to'lov muammolari | EXISTS (xavf omillari sifatida) |
| Ota-ona shikoyatlari | MISSING |
| Past qoniqish | PARTIAL (salbiy fikr belgilanadi, xavf omili emas) |
| Tavsiya etilgan keyingi qadam | PARTIAL (avtomatlashtirish amallari, AI tahlil; o'quvchiga biriktirilmagan) |
| Mas'ul shaxs | PARTIAL (`Task.assigneeId`; vazifa qo'lda yaratilmaydi) |
| Natijani kuzatish | MISSING |

**Kerak:** `StudentCase` (toifa, og'irlik, manba, egasi, holat, keyingi qadam va muddat, natija) + izohlar; xavf tarixi (`RiskSnapshot`).

**5. Schedule Engine 2.0 — PARTIAL**

| Band | Holat | Izoh |
|---|---|---|
| O'qituvchi / xona / guruh ziddiyati | PARTIAL | Faqat haftalik qolip, bitta filial ichida, `allowConflict` bilan chetlab o'tiladi |
| Ish vaqti, bayramlar | MISSING | |
| Sig'im | PARTIAL | Guruh sig'imi tekshiriladi; xona sig'imi guruhnikiga solishtirilmaydi |
| O'qituvchi yo'qligi | MISSING | `EmployeeLeave` faqat xodimlar uchun |
| O'rinbosar o'qituvchi | MISSING | Sessiya o'qituvchisi guruhdan olinadi → dars haqi guruh o'qituvchisiga ketadi |
| Alohida darsni ko'chirish | MISSING | Kodda ochiq aytilgan (`studentProgress.service.ts`) |
| Xabar, audit | MISSING / PARTIAL | Jadval o'zgarishi diffi auditga yozilmaydi |

**Kerak:** `ScheduledLesson` (sana-vaqt, xona, haqiqiy o'qituvchi, `rescheduledFromId`, bekor qilish sababi), generator, ta'til/bandlik
jadvallari, bayramlar kalendari, sana darajasidagi ziddiyat tekshiruvi.

**6. AI Director 2.0 — PARTIAL (dastlabki to'rt bosqich)**

| Bosqich | Holat |
|---|---|
| CRM DATA → ANALYTICS | EXISTS |
| RULE ENGINE | EXISTS (14 ogohlantirish qoidasi, 12 trigger) |
| AI ANALYSIS | PARTIAL (faqat o'quv sohasi; rahbar xulosalari — sof qoidalar) |
| RECOMMENDATION | PARTIAL (`AiAnalysis`, biznes turlari va egasi yo'q) |
| APPROVAL | PARTIAL (5 ta alohida oqim, umumiy obyekt yo'q) |
| ACTION | PARTIAL (faqat vazifani baholash va qoralama yaratish) |
| VERIFICATION | MISSING |

**Doim inson tasdig'ida qolishi shart:** pul harakati (to'lov, qaytarish, xarajat, maosh), o'quvchi holatini o'zgartirish, chegirma,
ota-ona/o'quvchilarga ommaviy xabar, baho yozish, rol va ruxsatlar, o'chirish.

### 14.2. Yordamchi tizimlar

| # | Tizim | Holat | Bor | Yetishmaydi |
|---|---|---|---|---|
| 7 | Group 360 | NEEDS IMPROVEMENT | 5 bo'limli sahifa (o'quv tomoni) | Rentabellik, ushlab qolish, dastur sur'ati — ma'lumot bor, sahifada yo'q |
| 8 | Teacher 360 / KPI 2.0 | PARTIAL | Oylik KPI, 6 oylik tarix | Maqsadlar, snapshot, dars kuzatuvi; ushlab qolish va qoniqish davrga bog'lanmagan; KPI → bonus yo'q |
| 9 | Sales CRM 2.0 | PARTIAL | Voronka, skoring, taqsimot, reja | Bosqich vaqti va SLA, birinchi javob vaqti, yo'qotish sabablari lug'ati, prognoz (hozir chiziqli) |
| 10 | Marketing + ROI | PARTIAL | Manba bo'yicha ROI | Kampaniya, UTM, ochiq lead qabul qilish; ROI vaqt asoslari aralash |
| 11 | Parent CRM | MISSING | Faqat xabarlar | Muloqot jurnali, shikoyat, uchrashuv; fikrda ota-ona muallifi yo'q |
| 12 | NPS / Feedback | PARTIAL | Yig'ish, NPS, salbiy xabar | So'rovnoma triggerlari, egasi va muddati, filial doirasi |
| 13 | Referral Engine | PARTIAL | Kod, kuzatuv, statistika | Mukofot qoidalari, naqd/balans, bir nechta mukofot; poyga holati |
| 14 | Alumni / Job Placement | MISSING | ALUMNI enum | Hammasi |
| 15 | My Work / Action Center | PARTIAL | Alohida sahifalar | Yagona markaz, qo'lda vazifa, ustuvorlik, tasdiqlar ro'yxati |
| 16 | Academy Health Score | NEEDS IMPROVEMENT | 5 komponentli baho | Tarix, sozlanadigan og'irliklar, o'quv sifati va NPS, filial kesimi |
| 17 | Director Command Center | PARTIAL | Rahbar paneli | Chiplarda havola yo'q, topshiriq berish, tasdiqlar, xodimlar nazorati, avto-yangilanish |
| 18 | Data Quality Center | MISSING | Yozishdagi 2 tekshiruv | Skaner, birlashtirish, o'quvchi dublikati nazorati |
| 19 | Advanced Reports | PARTIAL | 15 tur | Rejalashtirish, saqlangan filtr, 1 000 qatordan ortiq eksport, qarz yoshi, kogorta daromadi |
| 20 | Global Search | NEEDS IMPROVEMENT | 14 guruh, kuchli doira | Vazifa, ogohlantirish, xarajat, xodim; guruh bo'yicha sahifalash; kirill/lotin |
| 21 | Notification → Action | MISSING | O'qish, o'chirish | Vazifaga aylantirish, biriktirish, kechiktirish, eskalatsiya, Telegram tugmalari |
| 22 | Automation templates | PARTIAL | 7 tizim qoidasi, quruvchi | Sotuv/moliya triggerlari, shablonlar galereyasi, versiya, xavfsizlik chegaralari |
| 23 | Real-time Operations Board | MISSING | Ma'lumot qisman bor | Sahifa, jonli yangilanish; darslar ro'yxati (5-ustuvorlikka bog'liq) |

---

## 15. Ustuvorlik matritsasi

| Ustuvorlik | Ish | Biznes qiymati | Murakkablik | Bog'liqlik |
|---|---|---|---|---|
| P0 | Production nuqsonlari (§12) | Xavfni yopadi | S | — |
| P0 | Fon vazifalari va indekslar (10k gacha) | Barqarorlik | M | — |
| P1 | Vazifa 2.0 + My Work + Notification → Action | Rahbar topshiriq bera oladi | M | — |
| P1 | Collections | To'g'ridan-to'g'ri pul | M | Vazifa 2.0 |
| P1 | Enrollment modeli | Renewal, LTV, bitiruvchilar poydevori | XL | P0 |
| P2 | Renewal Engine | Takroriy daromad | M | Enrollment |
| P2 | Schedule Engine 2.0 + sinov darsi | Operatsion nazorat | L | — |
| P2 | Student Success Center + Parent CRM + NPS halqasi | Ushlab qolish | L | Vazifa 2.0 |
| P3 | Sales 2.0 + kampaniyalar + taklif qoidalari | O'sish | L | Enrollment (atributsiya) |
| P3 | Teacher/Group 360, xodimlar nazorati | Sifat | M | Schedule Engine, snapshotlar |
| P3 | Command Center, Health Score 2.0, Data Quality, hisobotlar | Rahbar ko'rinishi | L | Yuqoridagilar |
| P4 | AI Director 2.0 | Tavsiya → tasdiq → amal | L | Vazifa 2.0, tasdiqlash obyekti |
| P4 | Alumni / Job Placement | Brend, takliflar | M | Enrollment |
| P4 | Miqyos (worker, Redis, obyekt saqlash) | 10k+ | L | O'quvchilar soniga qarab |
