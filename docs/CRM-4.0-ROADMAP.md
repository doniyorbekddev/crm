# IT-Academy CRM 4.0 — "Academy Operating System" yo'l xaritasi

> Sana: 2026-10-05 · Asos: [CRM-4.0-AUDIT.md](CRM-4.0-AUDIT.md) · Bu hujjat — reja. Amalga oshirish boshlanmagan; har faza alohida tasdiqdan keyin boshlanadi.

**Maqsad.** Rahbar butun akademiyani bitta tizimdan boshqaradi: nima bo'layotganini tushunadi, muammoni jiddiylashmasdan ko'radi,
topshiriq beradi, bajarilishini kuzatadi va qarorni haqiqiy ma'lumotdan chiqaradi.

**Asosiy tamoyil.** Tizim qayta yozilmaydi. Har yangi imkoniyat mavjud servislar ustiga quriladi; mavjud xatti-harakat va testlar buzilmaydi.

---

## 1. Arxitektura yo'nalishi

Modulli monolit saqlanadi (mikroservis kerak emas). To'rtta yangi qatlam qo'shiladi:

| Qatlam | Nima | Nega |
|---|---|---|
| **Enrollment (yozilish)** | `Student` — shaxs; `Enrollment` — kurs + guruh + shartnoma + bosqich. Qarz, bo'lib to'lash, chegirma yozilishga bog'lanadi | Renewal, ikkinchi kurs, to'g'ri LTV, bitiruvchilar |
| **Lesson (dars)** | `ScheduledLesson` — aniq sana-vaqt, xona, haqiqiy o'qituvchi; haftalik qolipdan generatsiya qilinadi | Ko'chirish, o'rinbosar, sinov darsi, jonli taxta |
| **Work (ish)** | Vazifa 2.0 + `Case` (muammo: egasi, keyingi qadam, natija) + umumiy tasdiqlash obyekti | Har modul "ish" yaratadi, rahbar bitta joydan boshqaradi |
| **Snapshot (tarix)** | Kunlik/oylik rollup jadvallar: xavf, sog'liq bahosi, KPI, undirish | Trendlar, tezlik, "o'tgan oyda qanday edi" |

**O'zgarmaydigan qoidalar**

1. Migratsiyalar faqat qo'shimcha: yangi jadval va nullable ustun → backfill → ikki tomonlama o'qish → keyingi relizda eskisini yopish.
   `DROP` faqat alohida tasdiq bilan, kamida bitta reliz kechikib.
2. Har yozuvchi amal: ruxsat + qator doirasi + filial doirasi + audit (tranzaksiya ichida).
3. Pul harakati, holat o'zgarishi, ommaviy xabar, o'chirish — hech qachon avtomatik emas; AI va avtomatlashtirish faqat taklif qiladi.
4. Yangi agregat — SQL da, sahifalangan, kerak bo'lsa rollup bilan; cheklanmagan `findMany` + JS yig'ish yo'q.
5. Har faza: integratsion testlar, kamida bitta E2E oqim, hujjat; mavjud testlar zaiflashtirilmaydi.

**Tegilmaydigan qismlar:** javob/xato qolipi va controller → Zod → servis naqshi; token dizayni; `permissions.ts` yagona manba sifatida;
doira yordamchilari (`leadAccess`, `teachingAccess`, `branchAccess`, `branchScope`); to'lov yaratish yo'li, daftar invariantlari, davrni
yopish, CHECK cheklovlari; `Payment` snapshot ustunlari; komissiya daftari; bildirishnoma outbox modeli; fayl saqlash xavfsizligi;
`env.ts` tekshiruvi; `deploy.sh` oqimi; AI dagi "faktlar kodda, model faqat matn, inson tasdiqlaydi" tamoyili; imtihon dvigateli; xavf bahosi tamoyillari.

---

## 2. Fazalar

Murakkablik: **S** ≈ 1 hafta gacha · **M** ≈ 1–2 hafta · **L** ≈ 3–4 hafta · **XL** ≈ 5–8 hafta (bitta dasturchi, testlar bilan; taxminiy baho).

### Faza 0 — Barqarorlashtirish va production nuqsonlari · S–M

Yangi imkoniyat yo'q. Auditning §12 bo'limi.

| Ish | Tafsilot |
|---|---|
| B1 `TRUST_PROXY` | Avval serverda tasdiqlash (`audit_logs.ip`), keyin ikki proxy uchun to'g'ri qiymat; test |
| B2 To'lov eksporti | Filial doirasi (ro'yxat bilan bir xil), `getById` ham; izolyatsiya testi |
| B3 Qaytarish | Qator qulfi ostida qayta hisoblash + idempotentlik kaliti; parallellik testi |
| B4 Qarzga yozuvchilar | Chegirma berish/bekor qilish va o'quvchini tahrirlash — qarz qulfi ostida; promo limit tranzaksiya ichida |
| B5 Guruh xonasi | `roomId` ni saqlash; PUT testi |
| B6 Zaxira | Tashqi nusxa, fayllar zaxirasi, tiklash mashqi; (ixtiyoriy) WAL arxivi |
| Mayda | Bitirgan o'quvchi o'rin egallamasin; qaytarish daftar yozuvida filial; taklif mukofoti poygasi; `daysBefore`; bildirishnoma toifalarini bittaga birlashtirish |

- **Baza:** yo'q (faqat `PaymentRefund.idempotencyKey` — nullable, qo'shimcha).
- **Xavf:** past. **Bog'liqlik:** yo'q. Bu faza qolganlaridan mustaqil va birinchi bo'lishi kerak.

### Faza 1 — Unumdorlik poydevori (10 000 gacha) · M

| Ish | Tafsilot |
|---|---|
| Xavf bahosi | To'plamli hisob, faqat o'zgargan qatorlarni yangilash, sanalar bilan cheklangan signallar; `RiskSnapshot` (kunlik) |
| Lead skoringi | Xuddi shunday |
| Haftalik hisobot | Partiyalab, AI qismi alohida navbatda va chegara bilan |
| Dashboard / analitika | Vaqt qatorlari SQL `GROUP BY` da; `averageStageDurations` — rollup; 30–60 s kesh |
| Indekslar | `Student(branchId,status,deletedAt)`, `Payment(branchId,paidAt)`, `Transaction(branchId,occurredAt)`, `Lead(branchId,createdAt/status)`, `LeadActivity(type,createdAt)`, `Attendance(date)` |
| Fon vazifalari | Har vazifaga `pg_advisory_lock` (ikki nusxa bir vaqtda ishlamasin); navbatlarda `SKIP LOCKED`; ulanishlar puli sozlamasi |
| Tozalash | Saqlash muddati: refresh tokenlar, Telegram hodisalari, eski bildirishnomalar, yetkazish yozuvlari, AI so'rovlari |
| O'lchov | `perf:bench` ni CI ga (kamida 5 000 o'quvchilik seed bilan) |

- **Baza:** indekslar (`CONCURRENTLY`), `risk_snapshots`. **Xavf:** o'rta — hisob natijalari o'zgarmasligi testlar bilan qotiriladi.

### Faza 2 — Ish qatlami: Vazifa 2.0, My Work, Notification → Action · M–L

Keyingi barcha fazalar "ish" yaratadi, shuning uchun bu erta keladi.

- **Baza:** `Task` ga ustuvorlik, manba turi, izohlar (`TaskComment`), qayta biriktirish tarixi; `Notification.actionUrl`, `snoozedUntil`,
  `taskId`; `Alert.assigneeId`, `snoozedUntil`, `escalatedAt`; umumiy `ApprovalRequest` (tur, obyekt, holat, tasdiqlovchi) — xarajat
  tasdig'i namunasida, mavjud oqimlar asta-sekin ustiga ko'chadi.
- **Backend:** vazifa CRUD (yaratish, biriktirish, sahifalash — hozir 200 bilan qotgan); `GET /my-work` agregatori (vazifalar, follow-up,
  tasdiqlar, hal qilinmagan fikrlar, baholanmagan vazifalar, belgilanmagan darslar); bildirishnoma/ogohlantirishdan vazifa yaratish,
  kechiktirish, biriktirish; eskalatsiya vazifasi; Telegram inline tugmalari (`buttons` JSON mavjud).
- **Frontend:** "Ishlarim" markazi; ogohlantirish va bildirishnomalarda amallar; rahbar panelidagi chiplar havola bo'ladi.
- **RBAC:** `task.create`, `task.assign`, `task.view_all`; o'z vazifasi / jamoa vazifasi doirasi.
- **Testlar:** doira, eskalatsiya, dedupe; E2E: ogohlantirish → vazifa → bajarildi.

### Faza 3 — Collections (undirish) · M

Bog'liqlik: Faza 2. Enrollment'ni kutmaydi (keyin yozilishga bog'lanadi).

- **Baza:** `CollectionCase` (o'quvchi, egasi, bosqich, keyingi qadam sanasi, natija), `PaymentPromise` (sana, summa, holat),
  `collection_snapshots` (oylik: kutilgan / undirilgan / muddati o'tgan).
- **Backend:** qarz yoshi (0–30 / 31–60 / 61–90 / 90+) `scheduleDueStats` ustida SQL bilan; "bugun" filtri; eslatma kadensiyasi
  (K−3, K, K+3, K+7 — sozlanadi, kuniga bitta chegarasi saqlanadi); bajarilmagan va'dani aniqlash; eskalatsiya zinapoyasi;
  mas'ulni avtomatik taqsimlash; statistika (undirish foizi, xodim bo'yicha).
- **Frontend:** undiruvchi ish joyi (navbat, va'dalar, tarix), qarzdorlar sahifasida yosh kesimi, rahbar uchun undirish paneli.
- **RBAC:** `collection.view_own/view_all/manage`. **Unumdorlik:** `IN (barcha id)` o'rniga JOIN; ro'yxat sahifalangan.

### Faza 4 — Enrollment modeli (Student Lifecycle 2.0 yadrosi) · XL

**Eng katta va eng xavfli faza.** Bog'liqlik: Faza 0 (pul poygalari yopilgan bo'lishi shart).

- **Baza (qo'shimcha):** `Enrollment` (studentId, courseId, groupId, contractNumber, price, startDate, endDate, status, lifecycleStage,
  previousEnrollmentId, sourceId); `StudentLifecycleEvent` (yagona vaqt chizig'i); `Debt`, `PaymentInstallment`, `Payment`,
  `StudentDiscount`, `PaymentIntent`, `Certificate` ga nullable `enrollmentId`; `Course.nextCourseId`.
- **Ko'chirish strategiyasi (4 qadam, har biri alohida reliz):**
  1. Jadval va ustunlar; har mavjud o'quvchiga bitta yozilish backfill; solishtirish skripti (har o'quvchida qarz = yozilish qarzi).
  2. Ikki tomonlama yozish: servislar `Student` maydonlarini ham, `Enrollment` ni ham yangilaydi; o'qish hali eskisidan.
  3. O'qishni yozilishga o'tkazish (bayroq bilan, filial bo'yicha); to'liq regressiya.
  4. `Student.courseId/groupId/contractPrice` — "joriy yozilish" keshi sifatida qoladi (o'chirilmaydi).
- **Backend:** holat o'tish mashinasi (ruxsat etilgan o'tishlar); bitirish oqimi (guruh tugaganda ommaviy, mezonlar bilan, o'rin bo'shaydi);
  to'lov yozilish bo'yicha; lead'siz o'quvchida ham manba.
- **Frontend:** o'quvchi profilida yozilishlar ro'yxati va yagona vaqt chizig'i.
- **Testlar:** mavjud to'lov/qarz/komissiya/maosh/hisobot testlari **o'zgarishsiz** o'tishi shart; backfill uchun solishtirish testi;
  production nusxasida sinov migratsiyasi.
- **Xavf:** yuqori (pul hisobi). Yumshatish: bayroq, solishtirish hisoboti, har qadamdan keyin to'xtash nuqtasi.

### Faza 5 — Renewal Engine · M

Bog'liqlik: Faza 4, Faza 2.

- **Baza:** `RenewalOpportunity` (yozilish, oyna, ehtimollik, egasi, taklif, holat: ochiq / bog'lanildi / taklif / to'lov kutilmoqda /
  yangilandi / yo'qotildi + sabab).
- **Backend:** tugayotgan yozilishlarni aniqlash (oyna sozlanadi); ehtimollik — qoidalar bilan (davomat, xavf, qarz, qoniqish), tushuntirish
  bilan; yangilanganda yangi `Enrollment` (`previousEnrollmentId`); yangilanish foizi (kurs, guruh, o'qituvchi, menejer kesimida).
- **Frontend:** yangilash kanbani; guruh va o'qituvchi sahifalarida foiz. Kogorta hisoboti tuzatiladi (tugatib ketgan ≠ saqlangan).

### Faza 6 — Schedule Engine 2.0, sinov darsi, operatsion taxta · L

Bog'liqlik: Faza 2 (xabar va vazifalar). Faza 4 dan mustaqil — parallel yurishi mumkin.

- **Baza:** `ScheduledLesson` (guruh, boshlanish/tugash, xona, o'qituvchi, holat, `rescheduledFromId`, bekor qilish sababi; mavjud
  `AttendanceSession` bilan bittaga-bitta bog'lanadi, uning unikal cheklovi saqlanadi); `TeacherAvailability`, `TeacherLeave`;
  `Holiday` (filial bo'yicha); `TrialLesson` (lead, dars, holat: keldi / kelmadi, natija).
- **Backend:** haftalik qolipdan oldinga generatsiya (masalan 4 hafta); sana darajasidagi ziddiyat tekshiruvi (o'qituvchi, xona, guruh,
  filiallararo o'qituvchi); ko'chirish va bekor qilish; o'rinbosar oqimi (dars haqi haqiqiy o'qituvchiga); xona sig'imi tekshiruvi;
  oila va o'qituvchiga xabar; jadval diffi auditga; "dars tugadi, davomat belgilanmagan" ogohlantirishi; `GET /operations/today`.
- **Frontend:** kalendar (hafta / xona / o'qituvchi), ko'chirish oynasi, sinov darslari ro'yxati, jonli taxta (dastlab 30–60 s so'rov).
- **Maoshga ta'siri:** "dars boshiga" modeli sessiya o'qituvchisidan hisoblaydi — o'rinbosar bo'lmagan holatlar uchun natija o'zgarmasligi testda qotiriladi.

### Faza 7 — Student Success Center, Parent CRM, NPS halqasi · L

Bog'liqlik: Faza 2.

- **Baza:** `StudentCase` (toifa: davomat / o'quv / vazifa / to'lov / shikoyat / qoniqish; og'irlik; manba; egasi; holat; keyingi qadam;
  natija) + `CaseNote`; `ParentInteraction` (qo'ng'iroq, uchrashuv, xabar; natija); `Feedback.parentId`; `Survey`, `SurveyInvite`.
- **Backend:** xavf oshganda / salbiy fikrda / shikoyatda avtomatik ish ochish; tavsiya etilgan qadam (qoidalardan); natija kuzatuvi
  (ish yopilgandan N kun keyin xavf bahosi o'zgarishi); so'rovnoma triggerlari (N dars, modul oxiri, bitirish); fikrlarga filial doirasi.
- **Frontend:** muvaffaqiyat markazi navbati, o'quvchi profilida ishlar, ota-ona profili vaqt chizig'i bilan.
- **RBAC:** `case.view_own/view_all/manage`; anonim fikr anonimligicha qoladi.

### Faza 8 — Sales CRM 2.0, kampaniyalar, takliflar · L

- **Baza:** `Lead.firstContactedAt`, `stageEnteredAt`, `lostAt`, `lostReasonId` (lug'at), `LeadStageHistory`; `Campaign` (manba, sanalar,
  byudjet, UTM), `Lead.campaignId` + xom UTM maydonlari, `Expense.campaignId`; `ReferralRewardRule`, o'quvchi balansi yoki kassa orqali to'lov.
- **Backend:** bosqich SLA va javob vaqti; yo'qotish sabablari hisoboti; bosqichdan bosqichga konversiya; prognoz (bo'lib to'lashlar +
  vaznli voronka); ochiq, token bilan himoyalangan va cheklangan lead qabul qilish endpointi; kogorta asosidagi ROI; menejer komissiyasi
  (mavjud komissiya daftari namunasida); taqsimotda qator qulfi.
- **Frontend:** kampaniyalar sahifasi, voronka analitikasi, taklif qoidalari, kabinetda taklif havolasi.

### Faza 9 — Teacher 360 / KPI 2.0, Group 360, xodimlar nazorati · M–L

Bog'liqlik: Faza 6 (rejalashtirilgan va o'tkazilgan darslar), Faza 2 (vazifa ma'lumoti).

- **Baza:** `TeacherKpiSnapshot` (oylik), `TeacherKpiTarget`, `LessonObservation`; `EmployeeKpiSnapshot`.
- **Backend:** davrga to'g'ri bog'langan ushlab qolish va qoniqish; KPI → bonus qoidalari (taklif sifatida, tasdiq bilan); guruh uchun
  yagona agregator (rentabellik, ushlab qolish, dastur sur'ati — mavjud servislardan); xodim ko'rsatkichlari (ish yuki, o'z vaqtida bajarish, javob vaqti).
- **RBAC:** `employee.performance_view` (sezgir ma'lumot).

### Faza 10 — Command Center, Health Score 2.0, Data Quality, hisobotlar · L

- **Baza:** `HealthSnapshot` (kunlik, filial bo'yicha); `DataQualityIssue`; `SavedReport`, `ReportSchedule`.
- **Backend:** sog'liq bahosi sozlanadigan og'irliklar va yangi komponentlar bilan (o'quv sifati, NPS, intizom), pasayishda ogohlantirish;
  ma'lumot sifati skaneri (tungi vazifa: dublikatlar, bo'sh maydonlar, mos kelmaydigan holatlar) va birlashtirish (yuqori xavfli —
  tranzaksiya, audit, tasdiq); rejalashtirilgan hisobotlar (mavjud Telegram hujjat yuborish orqali), asinxron katta eksport, yangi
  hisobotlar (qarz yoshi, undirish, kogorta daromadi, xodimlar).
- **Frontend:** rahbar markazi — drill-down, topshiriq berish, tasdiqlar paneli, filiallarni solishtirish, avto-yangilanish.
- **Qidiruv:** yangi guruhlar (vazifa, ish, xarajat, xodim), guruh bo'yicha sahifalash, `pg_trgm` indekslari.

### Faza 11 — AI Director 2.0 · L

Bog'liqlik: Faza 2 (tasdiqlash obyekti), Faza 10 (snapshotlar).

- **Baza:** `Recommendation` (tur, manba: QOIDA / AI, dalillar, taklif etilgan amal — oq ro'yxatdan, xavf darajasi, holat: taklif /
  tasdiqlandi / rad etildi / bajarildi / tekshirildi / muddati o'tdi, tasdiqlovchi, o'lchov: boshlang'ich va natija); `AiUsage`.
- **Backend:** rahbar darajasidagi tahlil (faktlar kodda, model faqat xulosa matni); ijrochi — oq ro'yxatdagi amallarni **tasdiqlovchining
  ruxsati bilan** mavjud servislar orqali bajaradi; tekshirish vazifasi (amaldan N kun keyin ko'rsatkich o'zgarishi); token byudjeti va
  kunlik chegara; tashqi API ga ketadigan matnni tozalash.
- **Xavf darajalari:** past (vazifa yaratish, xodimga eslatma) — bir bosishda; o'rta (ota-onaga xabar, qoralama) — tasdiq bilan;
  yuqori (pul, holat, chegirma, ommaviy xabar, o'chirish) — **faqat inson**, AI faqat tavsiya matni beradi.

### Faza 12 — Alumni / Job Placement · M

Bog'liqlik: Faza 4. `AlumniProfile`, `JobPlacement`, `PartnerCompany`; ishga joylashish foizi; bitiruvchi takliflari.

### Faza S — Miqyos (10 000+ bo'lganda) · L

O'quvchilar soniga qarab ishga tushadi, boshqa fazalarga bog'liq emas: alohida worker jarayoni va navbat; Redis (kesh, rate-limit, qulf,
ruxsat keshi); obyekt saqlash (fayllar); ulanishlar puli (PgBouncer); o'qish uchun replika; SSE/WebSocket; uzilishsiz deploy.

---

## 3. Bog'liqliklar

```
Faza 0 ──► Faza 1 ──► Faza 2 ──┬─► Faza 3 (Collections)
                               ├─► Faza 6 (Schedule) ──► Faza 9 (Teacher/Group 360)
                               ├─► Faza 7 (Success Center)
                               └─► Faza 11 (AI Director) ◄── Faza 10
Faza 0 ──► Faza 4 (Enrollment) ──┬─► Faza 5 (Renewal)
                                 ├─► Faza 8 (atributsiya qismi)
                                 └─► Faza 12 (Alumni)
```

Faza 4 (Enrollment) va Faza 6 (Schedule) bir-biriga bog'liq emas — parallel yurishi mumkin, lekin ikkalasi ham katta; bir vaqtda faqat
bittasini pul hisobiga tegadigan qilib yurgizish tavsiya etiladi.

---

## 4. Test strategiyasi

- Har yangi endpoint: integratsion test (muvaffaqiyat, validatsiya, 401/403, qator va filial doirasi).
- Pulga tegadigan har o'zgarish: parallellik testi va mavjud moliya testlarining o'zgarishsiz o'tishi.
- Migratsiya: production nusxasida sinov yurishi + backfill solishtirish skripti.
- Har faza: kamida bitta E2E oqim (masalan: qarzdor → ish → va'da → to'lov → yopildi).
- Unumdorlik: 5 000 va 10 000 o'quvchilik seed bilan `perf:bench`, natija hujjatga.
- CI: `TEST_DATABASE_URL` yo'q bo'lsa — xato (jim o'tkazib yuborish emas); bog'liqliklar skaneri.

## 5. Xavfsizlik talablari

- Yangi ruxsatlar `permissions.ts` ga, rollarga ongli taqsimot bilan; sezgir ko'rinishlar (xodim ko'rsatkichlari, undirish, AI tavsiyalari) alohida ruxsatda.
- Filial doirasi standart bo'yicha **majburiy**: yangi servislarda doira parametri ixtiyoriy bo'lmaydi.
- Ochiq lead endpointi: token, rate-limit, hajm chegarasi, spamdan himoya.
- Birlashtirish va ommaviy amallar: tasdiq + audit (before/after) + qaytarish imkoni (iloji bo'lsa).
- Egasi va buxgalter uchun 2FA (Faza 0 yoki 1 ga qo'shilishi mumkin — alohida qaror).
- AI: tashqi API ga shaxsiy ma'lumot yuborilmaydi; token byudjeti; so'rovlar jurnali (matnsiz).

## 6. Unumdorlik talablari

- Ro'yxatlar: p95 < 300 ms (10 000 o'quvchida); dashboard: p95 < 800 ms (kesh bilan).
- Fon vazifasi bitta yurishi o'z oralig'ining yarmidan oshmasin; ustma-ust tushmasin (advisory lock).
- Hech bir so'rovda cheklanmagan `IN (…)` yoki sahifalanmagan `findMany` yo'q.
- Rollup jadvallar: xavf, sog'liq, KPI, undirish — so'rov vaqtida emas, vazifada hisoblanadi.

## 7. Production talablari

- Har fazadan oldin: zaxira tekshirilgan, sinov muhitida migratsiya yurgan.
- Bayroqlar (feature flag) — `Setting` orqali, filial bo'yicha yoqiladi.
- Monitoring: ogohlantirish qoidalari (5xx ulushi, sekin so'rovlar, navbat uzunligi, vazifa xatosi, disk), tashqi uptime tekshiruvi.
- Rollback rejasi har faza hujjatida; sxema o'zgarishlari orqaga mos.

## 8. Xavflar

| Xavf | Ehtimol | Ta'sir | Yumshatish |
|---|---|---|---|
| Enrollment ko'chirishida pul hisobi buzilishi | O'rta | Juda yuqori | 4 qadamli ko'chirish, solishtirish skripti, bayroq, mavjud testlar o'zgarmaydi |
| Dars generatsiyasi maoshni o'zgartirishi | O'rta | Yuqori | O'rinbosarsiz holat uchun natija testda qotiriladi; avval ko'rish rejimi |
| Bitta jarayonli dizayn yuk ostida | Yuqori (10k+) | Yuqori | Faza 1 hozir, Faza S o'sishga qarab |
| Ko'lamning kengayib ketishi (23 tizim) | Yuqori | O'rta | Fazalar qat'iy tartibda, har biri alohida tasdiq bilan |
| Filial doirasi unutilishi | O'rta | Yuqori | Majburiy parametr + har servis uchun izolyatsiya testi |
| AI noto'g'ri tavsiya | O'rta | O'rta | Faktlar kodda, inson tasdig'i, natijani tekshirish, yuqori xavfli amallar yopiq |
| Test to'plami beqarorligi fazalarni sekinlashtiradi | Yuqori | Past | Faza 1 da test bazasini parallellashtirish yoki vaqt chegaralarini tartibga solish |

## 9. Umumiy hajm

| Faza | Nomi | Murakkablik |
|---|---|---|
| 0 | Barqarorlashtirish | S–M |
| 1 | Unumdorlik poydevori | M |
| 2 | Ish qatlami (Vazifa 2.0, My Work) | M–L |
| 3 | Collections | M |
| 4 | Enrollment | XL |
| 5 | Renewal | M |
| 6 | Schedule Engine 2.0 | L |
| 7 | Success Center + Parent CRM + NPS | L |
| 8 | Sales 2.0 + kampaniyalar + takliflar | L |
| 9 | Teacher/Group 360 + xodimlar | M–L |
| 10 | Command Center + Health + Data Quality + hisobotlar | L |
| 11 | AI Director 2.0 | L |
| 12 | Alumni | M |
| S | Miqyos | L |

Jami — bitta dasturchi uchun taxminan 9–12 oy; bu baho, majburiyat emas. Faza 0–3 (≈2 oy) eng tez qaytadigan qiymatni beradi:
xavf yopiladi, tizim tezlashadi, rahbar topshiriq bera boshlaydi, undirish tartibga tushadi.
