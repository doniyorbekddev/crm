# Tarixiy ma'lumotlar va oylik hisobot — audit va reja

Sana: 2026-11-03. Holat: **faqat audit** (1–2-faza). Kod, sxema va baza o'zgartirilmagan.

Asosiy xulosa: CRM ma'lumotni **o'chirmaydi va oy boshida hech narsani nolga tushirmaydi** — oy almashishi uchun
alohida "reset" yo'q, hammasi sana bo'yicha hisoblanadi. Muammo boshqa joyda: bir nechta hisobot **o'tgan oy tanlansa
ham bugungi holatdan** (o'quvchining hozirgi holati, hozirgi guruhi, hozirgi qarzi) foydalanadi. Shuning uchun oktyabr
tanlansa, ba'zi raqamlar oktyabrniki emas, bugungi bo'lib chiqadi.

## 1. Tarixni to'g'ri saqlaydigan qismlar (o'zgartirish shart emas)

| Ma'lumot | Biznes sanasi | Izoh |
|---|---|---|
| O'quvchi davomati | `Attendance.date` (dars kuni) + `groupId` | Belgi shu guruh va kun bilan qotadi; o'quvchi keyin guruh almashsa ham eski belgi o'zgarmaydi |
| Dars seanslari | `AttendanceSession.date`, `status`, `teacherId` | O'tilgan / bekor qilingan dars kuni bo'yicha |
| Xodim davomati | `StaffAttendanceDay.date`, hodisalar vaqti, tuzatishlar tarixi | Jadval versiyalari `effectiveFrom` bilan |
| To'lov | `Payment.paidAt`, `groupId`, `teacherId` (to'lov paytidagi) | Bekor qilish — `deletedAt` (yozuv qoladi) |
| Qaytarish | `PaymentRefund.refundedAt` | Alohida hodisa |
| Xarajat va tushum | `Expense.spentAt`, ledger `Transaction.occurredAt` | Moliyaviy oy yopilsa — shu sana bilan yozuv qo'shilmaydi |
| O'qituvchi foizi | `CommissionEntry` (to'lov bo'yicha, teskari yozuvlar bilan) | Takrorlanmaydi |
| Maosh | `TeacherSalaryPeriod (year, month)` + tuzatmalar | Tasdiqlangan (`lockedAt`) davr qayta hisoblanmaydi |
| Maosh qoidasi | `TeacherSalaryRule.effectiveFrom` | Oy uchun o'sha paytdagi qoida |
| KPI qoidalari | `KpiDefinition.effectiveFrom/To`, qo'lda natija `(year, month)` | |
| Leadlar | `createdAt`, `convertedAt`, holat tarixi `LeadActivity(STATUS_CHANGED)` | |
| Imtihon, uy vazifasi | `Exam.date`, `deadline`, topshirish sanasi | |
| O'quvchi holati tarixi | `StudentStatusChange (from, to, changedAt)` — 2026-09-23 dan | Kim, qachon, sabab |
| Asosiy guruh tarixi | `StudentGroupChange (fromGroupId, toGroupId, changedAt)` — 2026-09-14 dan | |
| Qo'shimcha guruhlar | `StudentGroupMembership (joinedAt, leftAt)` — 2026-10-16 dan | |
| Chegirmalar | `StudentDiscount.createdAt / revokedAt` | Bekor qilinsa yozuv qoladi |
| Oylik snapshotlar | `StudentProgressSnapshot (year, month)`, `RiskSnapshot (date)` | O'zlashtirish va xavf |
| Moliyaviy oy | `FinancialPeriod (year, month, OPEN/CLOSED)`, qayta ochish sabab bilan | Faqat pul yozuvlari uchun |
| Vaqt zonasi | `APP_UTC_OFFSET_MINUTES` (Toshkent), `businessMonthRange` | Oy chegaralari markaz vaqti bo'yicha |

## 2. Bugungi holatga tayanadigan joylar (xatolar)

| # | Joy | Muammo | Natija |
|---|---|---|---|
| D1 | `executive.service.ts:372` direktor paneli, `monthBlock` | O'tgan oy tanlansa ham **faol o'quvchilar soni** bugungi `status = ACTIVE` | Oktyabr tanlansa noyabrdagi son chiqadi |
| D2 | `executive.service.ts:373` | **Umumiy qarz** — bugungi `Debt.remainingAmount` | O'tgan oy qarzi ko'rinmaydi |
| D3 | `executive.service.ts:464` (sog'liq bahosi) | Qarzdorlar ulushi va saqlab qolish D1/D2 ga tayanadi | |
| D4 | `executive.service.ts:330`, `kpi.service.ts:365`, `alert.service.ts:627`, `report.service.ts:884` | **Ketganlar** — hozirgi `status = DROPPED` + `statusChangedAt` | Oktyabrda ketib, noyabrda qaytgan o'quvchi oktyabr hisobidan yo'qoladi |
| D5 | `kpi.service.ts:368` (KPI "saqlab qolish") | Oy boshidagi o'quvchilar bazasi hozirgi holat bilan | Eski oy KPI'si keyinchalik o'zgarib ketishi mumkin |
| D6 | `executive.service.ts:325` | **Yo'qotilgan leadlar** — `updatedAt` bo'yicha | Lead keyin tahrirlansa boshqa oyga "ko'chadi"; to'g'risi — holat tarixi sanasi |
| D7 | `executive.service.ts:328`, `:281` | **Yangi o'quvchilar** — `createdAt` (kiritilgan sana) | Spetsifikatsiya: o'qish boshlangan sana (`startDate`). Biznes ta'rifi — qaror kerak |
| D8 | `report.service.ts:354, 438, 881` | Kurs/guruh hisobotlarida o'quvchi soni — **hozirgi guruh** va hozirgi holat | O'quvchi noyabrda guruh almashsa, oktyabr hisobotida yangi guruhda ko'rinadi |
| D9 | `analytics.service.ts:195, 283, 298, 400` | Unit-ekonomika va kogortalar — hozirgi holat yoki faqat oxirgi `statusChangedAt` | Taxminiy |
| D10 | `salary.service.ts:517` maosh yuklamasi | **O'quvchilar soni** — bugungi faol o'quvchilar va bugungi guruh o'qituvchisi | Tasdiqlangan oy muzlatilgan (xavfsiz), lekin tasdiqlanmagan o'tgan oyni qayta hisoblasa — bugungi son. **Moliyaviy formula — ruxsatsiz o'zgartirilmaydi** |
| D11 | `dashboard.service.ts:280` asosiy dashboard | Faqat "hozir" — oy tanlab bo'lmaydi | |
| D12 | Qarz hisobotlari | `Debt` faqat joriy qoldiq; oy oxiridagi qarzni aniq tiklash imkoni yo'q | Shartnoma narxi o'zgarishlari faqat audit jurnalida, to'lov jadvali qayta tuziladi |
| D13 | Frontend | Har sahifada o'z davr tanlagichi (dashboard yo'q, moliya — oraliq, maosh — yil/oy, davomat — oy) | Bir xil emas, "tanlangan davr" ko'rsatkichi yo'q |
| D14 | Moliyaviy oy | Yopilish faqat pul yozuvlariga; o'quvchi davomati yopilgan oyda ham jimgina tahrirlanadi | Spetsifikatsiya §8 |

## 3. Tarixni tiklash imkoniyati (mavjud ma'lumotdan)

- **Oy oxirida faol o'quvchilar:** `StudentStatusChange` (2026-09-23 dan) + `startDate` + `deletedAt` bilan **tiklanadi**.
  Undan oldingi oylar uchun — hozirgi holatdan taxmin (ishlab chiqarish sentyabrda boshlangani uchun amalda to'liq).
- **Oy oxiridagi asosiy guruh:** `StudentGroupChange` dan **tiklanadi** (2026-09-14 dan).
- **Qo'shimcha guruhlar:** `joinedAt/leftAt` — **tiklanadi** (2026-10-16 dan; undan oldin qo'shimcha guruh bo'lmagan).
- **Qarz oy oxirida:** **aniq tiklanmaydi** (shartnoma narxi tarixi yo'q, jadval qayta tuziladi) → **snapshot kerak**.
- **Xodimlar soni:** `EmploymentHistory` (ORG, 2026-11-03 dan) + `hireDate/terminationDate` — tiklanadi.
- **Tushum, xarajat, davomat, leadlar, maosh, KPI qo'lda natijalari** — hodisa sanasidan, snapshot shart emas.

## 4. Reja (fazalar)

Har faza: testlar, tsc/eslint, build; **commit, push va deploy — faqat sizning ruxsatingiz bilan**.

### 3-faza — Yagona davr tanlagichi (migratsiyasiz)
- Frontendda bitta `ReportingPeriod` (oy + yil, standart — joriy oy, Toshkent vaqti), URL'da `?period=2026-10`,
  sahifalar orasida saqlanadi; "Tanlangan davr: Oktyabr 2026" belgisi va "Joriy oyga qaytish".
- Ulanadigan joylar: dashboard, direktor paneli, tashkilot paneli, moliya, maosh, davomat (o'quvchi va xodim),
  sotuv/leadlar hisobotlari, marketing, KPI, hisobotlar markazi. Profil sahifalari filtrlanmaydi, ularning
  davomat/to'lov bo'limlari esa tanlangan davrni hurmat qiladi.

### 4-faza — Davomat va moliya (migratsiyasiz)
- Asosiy dashboard API'siga davr parametri (eski chaqiruv — joriy oy, mos).
- D6 (yo'qotilgan lead — holat tarixi sanasi), D4 (ketganlar — `StudentStatusChange`).

### 5-faza — O'quvchi va guruh tarixi (migratsiyasiz)
- Umumiy yordamchi: `studentsAsOf(date)` — oy oxiridagi holat va asosiy guruh tarixdan.
- D1, D3, D5, D8, D9 shu yordamchiga o'tkaziladi. Joriy oy uchun natija hozirgi bilan bir xil bo'lishi testlanadi.

### 6-faza — Maosh, KPI, marketing
- D10: tasdiqlanmagan o'tgan oy o'quvchilar soni tarixdan — **formula o'zgarishi, alohida ruxsat bilan**.
- KPI va marketing — tanlangan oy; tasdiqlangan maosh hech qachon qayta hisoblanmaydi (mavjud qoida saqlanadi).

### 7-faza — Snapshotlar va oy yopish (migratsiya bilan)
- **`StudentMonthSnapshot`** (o'quvchi, yil, oy — takrorlanmas): holat, asosiy guruh, shartnoma narxi, chegirma,
  to'langan, qarz — oy oxirida avtomatik (idempotent, tranzaksiyada); tasdiqlangan oy snapshoti jimgina
  o'zgartirilmaydi (`frozenAt`, kim yaratgani).
- **`MonthlyReport`** (filial, yil, oy): umumiy ko'rsatkichlar nusxasi — yopilganda qotadi.
- `FinancialPeriod` ga `LOCKED` holati va (siz tanlasangiz) yopilgan oyda o'quvchi davomatini faqat ruxsat bilan,
  sababli tuzatish. Avtomatik yopish — yo'q (siz sozlamaguncha).
- Barcha migratsiyalar faqat qo'shuvchi; avval mahalliy bazada sinab ko'riladi, serverda zaxira bilan.

### 8-faza — Regressiya
- Spetsifikatsiyadagi 17 ta test holati, to'liq backend/frontend/E2E, production build.

## 5. Sizdan kerak bo'lgan qarorlar

1. **"Yangi o'quvchi"** ta'rifi: `startDate` (o'qish boshlangan sana — spetsifikatsiya) yoki hozirgidek `createdAt`
   (CRMga kiritilgan sana)? Ikkalasi farq qilsa raqamlar o'zgaradi.
2. **Maosh (D10):** tasdiqlanmagan o'tgan oy qayta hisoblanganda o'quvchilar soni tarixdan olinsinmi? (Formula
   o'zgarishi — ruxsatingiz kerak.)
3. **Yopilgan oyda davomat:** oddiy xodim tahrirlay olmasin (faqat ruxsatli tuzatish, sababi bilan) — yoqilsinmi?
4. **Oktyabr qarz snapshoti:** oktyabr uchun qarzni hozirgi ma'lumotdan taxminiy tiklab "taxminiy" belgisi bilan
   saqlaymizmi, yoki snapshotlar faqat noyabrdan boshlanadimi?

**Qabul qilingan qarorlar (2026-11-03):** 1 — `startDate`; 2 — ha, o'sha oy holatidan (tasdiqlangan maosh o'zgarmaydi);
3 — ha, faqat ruxsat va sabab bilan; 4 — oktyabr taxminiy tiklanadi va "taxminiy" belgisi bilan ko'rsatiladi.

## 6. Amalga oshirilgani

### Umumiy yordamchi — `backend/src/services/history.service.ts`
- `studentStatesAt(at)` — o'quvchi holati va asosiy guruhi `at` paytida: `student_status_changes` /
  `student_group_changes` dagi `at` dan keyingi birinchi o'zgarishning "oldingi" qiymati. Tarixi yo'q eski yozuvlar —
  `statusChangedAt` dan. O'quvchi mavjud hisoblanadi: `createdAt < at` **yoki** `startDate` undan oldin (keyin
  kiritilgan eski o'quvchilar ham o'z oyida ko'rinadi).
- `droppedBetween`, `droppedByGroupBetween` — ketish **hodisasi** bo'yicha (ketgan paytdagi guruh bilan);
  `newStudentsBetween` — `startDate` bo'yicha; `lostLeadsBetween` — LOST ga o'tish hodisasi bo'yicha;
  `debtAt` — qarzni tarixdan taxminiy tiklash; `activeStudentsInGroupsAt` — maosh uchun.

### Tuzatilgan joylar
| # | Joy | Endi |
|---|-----|------|
| D1, D2, D6, D7 | Direktor paneli (`executive.service`) | o'tgan oy: faollar oy oxirida, qarz snapshotdan yoki "taxminiy" (`debtSource`), yangi — `startDate`, ketgan/yo'qotilgan — hodisa bo'yicha |
| D3 | Sog'lomlik bahosi | o'tgan oy qarzdorlari oy oxiridagi holatdan |
| D4 | KPI, ogohlantirish, o'qituvchilar hisoboti | ketganlar — hodisa bo'yicha |
| D5 | KPI saqlanish | asos: oy boshida faol + oy davomida qo'shilganlar |
| D8 | Kurslar / guruhlar / o'qituvchilar hisoboti | tugagan davr — davr oxiridagi holat, guruh va qarz |
| D9 | Rentabellik, kohortlar | davr oxiridagi faollar; kohort saqlanishi har oy oxiridagi holat bo'yicha |
| D10 | Maosh (`loadWorkload`) | o'tgan oy o'quvchilar soni oy oxiridagi holat va guruhdan; joriy oy — hozirgi |
| D14 | Yopilgan oy davomati | `attendance.correct_closed` ruxsati + sabab (auditga `attendance.closed_period_corrected`); qulflangan oyda — yo'q |
| D15 | Oylik jurnal | o'tgan oy tarkibi oy oxiridagi a'zolik bo'yicha (keyin qo'shilganlar ko'rinmaydi) |

Guruhdan chiqqan o'quvchining o'tgan kun belgisini qayta belgilash avvalgidek taqiqlangan (mavjud qoida).

### Snapshot va oy yopish (migratsiya `20261103140000_historical_snapshots`, faqat qo'shuvchi)
- `student_month_snapshots` — o'quvchi × oy (takrorlanmas): holat, asosiy guruh, kurs, shartnoma, to'langan, qarz,
  `estimated`. Faqat qo'shiladi (`skipDuplicates`) — mavjud yozuv hech qachon qayta yozilmaydi yoki o'chirilmaydi.
- Fon vazifasi (`monthSnapshot.job`, soatiga): o'tgan oy snapshoti yo'q bo'lsa oladi. Oy tugagandan 24 soat ichida —
  aniq, keyin — taxminiy (birinchi ishga tushishda oktyabr shunday olinadi). Oy yopilganda ham olinadi.
- `FinancialPeriod`: yangi `LOCKED` holati. Qulflash/ochish — `finance.lock` ruxsati, sabab bilan, auditga. Qulflangan
  oyni qayta ochib, pul yozuvi qo'shib, davomatni tuzatib yoki snapshot qo'shib bo'lmaydi. Avtomatik yopish/qulflash yo'q.
- `finance.lock` va `attendance.correct_closed` — Admin rolidan chiqarilgan (Owner / Super Admin), boshqalarga rol
  sozlamasida beriladi.

### Frontend
- `useReportingPeriod` + `ReportingPeriodPicker`: `?period=YYYY-MM`, standart — joriy oy (Toshkent vaqti),
  "Tanlangan davr" belgisi, "Joriy oyga qaytish". Direktor panelida ulangan; Maoshlar sahifasi havoladagi davrdan ochiladi.
- Direktor panelida qarz yonida manba: "hozirgi holat" / "oy oxiri holati" / "taxminiy (oy oxiri)".
- Moliyaviy oylar: "Qulflangan" holati, Qulflash / Qulfni ochish (sabab bilan), "Oy oxiri" snapshot oynasi.
- Davomat: yopilgan oyda saqlashda server sabab so'rasa — sabab oynasi.

### Qolganlar (keyingi bosqich)
- Bosh sahifa (`/dashboard/summary`) — "bugun" paneli, oy tanlovi yo'q; o'tgan oy ko'rsatkichlari Direktor panelida.
- Tashkilot paneli, xodimlar davomati, moliya va marketing sahifalarini umumiy davr tanlagichiga ulash.
- Guruh o'qituvchisi almashinuvi tarixi saqlanmaydi — tarixiy hisobotlarda hozirgi o'qituvchi ishlatiladi.
- Shartnoma narxining qo'lda tahrirlari tarixda yo'q — shu sabab snapshotsiz oylar qarzi "taxminiy".
