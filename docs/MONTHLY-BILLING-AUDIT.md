# Oylik moliyaviy davrlar va tarixiy qarzdorlik — audit (1-bosqich)

Sana: 2026-11-03. Asos: `7f2aa2f` (tarixiy ma'lumotlar dasturi deploy qilingan holat).
Kod o'zgartirilmagan. Production bazasi ko'rilmagan (o'qishga ruxsat berilmagan) — raqamlar lokal kod va testlardan.

## 1. Hozirgi model

| Tushuncha | Qayerda | Holat |
|---|---|---|
| Shartnoma | `students.contractPrice` (+ `discountTotal`) | Bitta summa — butun kurs uchun |
| Balans | `debts` (o'quvchiga bitta qator: `totalAmount`, `paidAmount`, `remainingAmount`, `status`) | To'lov/bekor/qaytarishda `recalculateDebt` qayta hisoblaydi, `lockDebt` (`FOR UPDATE`) bilan |
| **Oylik majburiyat** | `payment_installments` (`studentId`, `sequence`, `dueDate`, `amount`, `note`), `@@unique([studentId, sequence])` | **Bor.** O'quvchi yaratilganda kurs davomiyligi bo'yicha oylik teng qismlar (`createDefaultSchedule`), birinchi muddat — `startDate` kuni |
| Qism holati | saqlanmaydi | `allocateSchedule` / `scheduleDueStats`: `Debt.paidAmount` qismlarga **muddat tartibida (FIFO)** taqsimlanib hisoblanadi |
| To'lov | `payments.paidAt` (pul tushgan sana), `amount`, `method`, kassa daftari `transactionId` | Qaysi oy uchun ekanligi **saqlanmaydi** |
| Qaytarish | `payment_refunds` (`refundedAt`, alohida REFUND tranzaksiyasi) | Qisman qaytarish bor, auditli |
| Bekor qilish | `payments.deletedAt` + sabab | Faqat to'lov sanasi oyi ochiq bo'lsa |
| Cashflow | `transactions.occurredAt = paidAt` | **To'g'ri**: tushum pul kelgan oyga yoziladi |
| Moliyaviy oy | `financial_periods` OPEN/CLOSED/LOCKED | Yopilgan oy sanasi bilan to'lov kiritilmaydi |
| Oy oxiri snapshoti | `student_month_snapshots` | Oy oxiridagi qarz (shartnoma qoldig'i) |

## 2. Spetsifikatsiya misoli hozir qanday ishlaydi

Oktyabr qismi 600 000 to'lanmagan, 3-noyabr kuni 600 000 to'lov:
- `paidAt = 3-noyabr` → noyabr kassasi va cashflow'iga tushadi ✅
- FIFO bo'yicha eng eski qism (oktyabr) yopiladi, noyabr qismi o'zgarmaydi ✅
- Oktyabr snapshotidagi qarz o'zgarmaydi (tarixiy hisobot) ✅

Ya'ni asosiy misol **avtomatik FIFO tufayli allaqachon to'g'ri** chiqadi. Kamchiliklar boshqa joyda.

## 3. Topilgan muammolar

1. **Taqsimot saqlanmaydi.** Operator "bu to'lov noyabr uchun" deb tanlay olmaydi; bir to'lovni bir nechta oyga qo'lda bo'lish yo'q. Har doim FIFO.
2. **"Qarz" ikki xil ma'noda.** Qarzdorlar sahifasi, to'lov xulosasi va snapshot `remainingAmount` ni (butun shartnoma qoldig'i, **hali kelmagan oylar ham**) qarz deb ko'rsatadi. Haqiqiy muddati o'tgan qarz (`overdueAmount`) faqat qo'shimcha ustun. 6 oylik kursda 1-oy to'langan o'quvchi "3 000 000 qarzdor" bo'lib ko'rinadi.
3. **Jadval tarixni o'chiradi.** `generate`/`replace` → `writeInstallments` hamma qismlarni `deleteMany` qilib qayta yozadi — o'tgan oylar majburiyati ham o'zgaradi.
4. **Shartnoma narxi / chegirma o'zgarsa jadval moslashmaydi.** `Debt.totalAmount` yangilanadi, qismlar eski qoladi → `mismatch: true`; oylik qarz noto'g'ri.
5. **Bekor qilish holati yo'q.** Ketgan o'quvchining kelgusi oylari majburiyat bo'lib qoladi (shartnoma qoldig'i qarz sifatida osilib turadi). `CANCELLED` yo'q.
6. **Oy chegarasi.** Qism "oyi" = `dueDate` oyi. Muddat `startDate` kuniga bog'langan (masalan, har 15-sana) — oylik hisobot uchun mos, lekin oyni aniq "billing period" deb saqlash yo'q.
7. **Oldindan to'lov** shartnoma summasidan oshmaydi (`alreadyPaid + amount > total` rad) — bu to'g'ri, saqlanadi.
8. **Davr tanlagichi** (`?period=`) faqat Direktor panelida; qarzdorlar, to'lovlar, moliya sahifalarida yo'q.

## 4. Tavsiya etilgan o'zgarishlar (qarorlarga bog'liq)

- **Yangi model yaratilmaydi `MonthlyCharge` nomida** — `payment_installments` shu vazifani bajaradi. Unga qo'shimcha (additive) ustunlar: `periodYear`, `periodMonth` (dueDate oyidan to'ldiriladi), `discountAmount`, `cancelledAt/By/Reason` (status hisoblanadi: UNPAID/PARTIAL/PAID/CANCELLED), `@@unique([studentId, periodYear, periodMonth])` faqat dublikat yo'qligi tekshirilgach.
- **`payment_allocations`** (yangi jadval): `paymentId`, `installmentId`, `amount`. Server tranzaksiyada `SUM(allocations) = payment.amount` ni tekshiradi; qarz qatori qulfi (`lockDebt`) ostida.
- **Mavjud to'lovlar** uchun taqsimot hozirgi FIFO bo'yicha to'ldiriladi (backfill) — natija bugungi ko'rinish bilan bir xil, hech bir summa o'zgarmaydi.
- **Qaytarish** taqsimotni shu to'lovning eng kech oyidan boshlab kamaytiradi; bekor qilingan to'lov taqsimoti hisobga olinmaydi (o'chirilmaydi).
- **Jadvalni qayta tuzish** faqat kelgusi, taqsimoti yo'q qismlarni almashtiradi; o'tgan/to'langan oylar tegilmaydi.
- `Debt` qatori va `recalculateDebt` saqlanadi (jami to'langan = to'lovlar − qaytarishlar). Hisobotlar uchun uchta alohida ko'rsatkich: **hisoblangan** (oy qismlari), **tushum** (paidAt), **qarz** (muddati yetgan, to'lanmagan qismlar).

## 5. Migratsiya xavflari

- Backfill har o'quvchi uchun FIFO; ehtimoliy nomuvofiqliklar: jadval yig'indisi ≠ shartnoma (`mismatch`), jadvali yo'q o'quvchilar, to'langan > jadval. Bular uchun backfill to'xtamaydi — qolgan summa "taqsimlanmagan" bo'lib qoladi va hisobotda alohida ko'rinadi.
- Unique `(studentId, periodYear, periodMonth)`: bir oyda ikki qism bo'lsa (qo'lda tuzilgan jadval) — constraint qo'yilmaydi, ogohlantirish bilan.
- Production ma'lumotini ko'rmasdan bu nomuvofiqliklar soni noma'lum — migratsiyadan oldin faqat o'qish uchun tekshirish kerak.

## 6. Production ma'lumoti (2026-11-03, faqat o'qish, ruxsat bilan)

- 142 o'quvchi, hammasida jadval bor; bitta oyda ikki qism — 0.
- Jadval ≠ shartnoma: **26** (23 ta jadval ortiq — jami 1 780 000; 3 ta kam — 660 000). Hammasida shartnoma jadvaldan keyin tahrirlangan.
- To'lovlar 102 (43 685 000), qaytarishlar 9, bekor qilingan to'lov 0, faol chegirma 0, yopilgan moliyaviy oy 0, filial 1.
- Shartnoma qoldig'i jami 30 230 000; jadval bo'yicha haqiqatan muddati o'tgan qarz 5 833 000.

## 7. Foydalanuvchi qarorlari

1. Qarzdorlar sahifasida qarz = **muddati kelgan, to'lanmagan oylik qismlar**; shartnomaning qolgani alohida "kelgusi to'lovlar".
2. **Saqlanadigan taqsimot**: `payment_allocations`, oynada standart — eng eski qarz, operator o'zgartirishi / bo'lishi mumkin. Mavjud to'lovlar raqamlari o'zgarmaydi.
3. Ketgan o'quvchining kelgusi oylari — **qo'lda, sabab bilan bekor qilish** (CANCELLED, audit). Avtomatik emas.
4. Production faqat o'qish uchun ko'rildi (yuqorida).

## 8. Dizayn (2-bosqich)

**Oylik majburiyat = shu oyga tushgan `payment_installments` qismlari** (oy = `dueDate` oyi, `@db.Date` — o'quv markaz sanasi).
Alohida `MonthlyCharge` jadvali yaratilmaydi. `(studentId, year, month)` unique qo'yilmaydi: qo'lda tuzilgan
jadvalda bir oyda ikki qism bo'lishi mavjud funksiya (test bilan qotirilgan); oylik ko'rinish qismlarni yig'adi.
Takror yaratilmaslik: jadval o'quvchi bilan bitta tranzaksiyada tuziladi, `(studentId, sequence)` unique.

Additive migratsiya:
- `payment_installments`: `cancelledAt`, `cancelledById`, `cancelReason` (status hisoblanadi: UNPAID / PARTIAL / PAID / CANCELLED).
- `payment_allocations` (yangi): `paymentId`, `studentId`, `periodYear`, `periodMonth`, `amount` (qaytarishda manfiy, `refundId` bilan),
  `effectiveAt` (to'lov sanasi / qaytarish sanasi / qayta taqsimlash paytı), `voidedAt/ById` (qayta taqsimlashda eski qator o'chirilmaydi, bekor belgilanadi).
- Mavjud 2 231 qism va 102 to'lovga **tegilmaydi** (UPDATE/backfill yo'q).

Hisob qoidasi (bitta joyda — SQL va JS bir xil):
1. Oy qismlariga avval shu oyga **aniq biriktirilgan** summa (bekor qilinmagan to'lovlar, qaytarishlar ayrilgan) muddat tartibida tushadi.
2. Qolgan "taqsimlanmagan" pul (`Debt.paidAmount − aniq biriktirilganlar`; bu deploydan oldingi to'lovlar) qolgan qismlarga
   **hozirgidek FIFO** tushadi. Shu sabab eski to'lovlar ko'rinishi bir tiyin ham o'zgarmaydi.
3. Yangi to'lov **har doim** biriktirib saqlanadi: operator tanlamasa — server eng eski ochiq oydan boshlab (oldindan to'lov — keyingi oylarga).
   Biriktirish ∑ = to'lov summasi (tranzaksiya, qarz qatori qulfi ostida); oy sig'imidan oshmaydi.
4. Qaytarish: avval to'lovning biriktirilmagan qismi, keyin shu to'lovning eng kech oyi (manfiy qator).
5. To'lov bekor qilinsa — uning qatorlari hisobga olinmaydi (o'chirilmaydi).
6. "Holat T sanada": `effectiveAt ≤ T`, `voidedAt` yo'q yoki `> T`, to'lov T da bekor qilinmagan; qism T da bekor qilinmagan.

Jadvalni qayta tuzish: yopilgan/qulflangan oylar qismlari va bekor qilingan qismlar saqlanadi; oy summasi shu oyga
aniq biriktirilgan to'lovdan kam bo'lib qolsa — rad (422).

Bekor qilish (qaror 3): faqat joriy va kelgusi oylar, aniq biriktirilgan to'lovi yo'q qismlar; shartnoma narxi bekor qilingan
summaga kamayadi (qarz qatori qayta hisoblanadi), sabab majburiy, audit. Yangi ruxsat `payment.cancel_charge` (Admin rolida yo'q).
Qayta taqsimlash (tuzatish): `payment.reallocate`, sabab bilan, to'lov oyi ochiq bo'lsa, qaytarilgan to'lovda emas.

Hisobotlar uchta ko'rsatkichni ajratadi: **hisoblangan** (oy qismlari), **shu oy uchun yig'ilgan** (biriktirish/FIFO bo'yicha, qaysi sanada
kelganidan qat'i nazar), **kassa tushumi** (`paidAt`, qaytarishlar — `refundedAt`), **qarz** (muddati kelgan to'lanmagan; hozir va oy oxirida).

## 9. Amalga oshirildi (3–7-bosqich), commit qilinmagan

**Backend**
- Migratsiya `20261104090000_monthly_billing` (faqat qo'shadi): `payment_installments.cancelledAt/cancelledById/cancelReason`,
  `payment_allocations` + CHECK (`periodMonth` 1–12; musbat qator — to'lov, manfiy — faqat qaytarish).
- `utils/billingLedger.ts` — yagona qoida (`distributePaid`, `computeStudentLedger`, `autoAllocate`); SQL varianti
  `services/billingLedger.service.ts` → `installmentPositionsSql` (`scheduleDueStats`, ya'ni qarzdorlar ro'yxati, alertlar, risk shu orqali).
- `POST /api/payments` — `allocations?: [{period, amount}]`; berilmasa eng eski ochiq oydan. ∑ = summa, oy sig'imi tekshiriladi.
- Qaytarish — avval biriktirilmagan qism, keyin shu to'lovning eng kech oyi (manfiy qator).
- `PUT /api/payments/:id/allocations` — tuzatish (`payment.reallocate`, sabab, audit `payment.reallocated`; eski qator `voidedAt`).
- `POST /api/students/:id/payment-schedule/cancel` — joriy/kelgusi, to'lov tushmagan oylar (`payment.cancel_charge`, Admin rolida yo'q);
  shartnoma narxi kamayadi, audit `payment_schedule.cancelled`.
- Jadvalni qayta tuzish: bekor qilingan va yopilgan oy qismlari saqlanadi; oyga biriktirilgan to'lovdan kam summa — 422.
- `GET /api/debts/monthly?period=` (A), `GET /api/debts/outstanding` (B), `GET /api/students/:id/billing-history` (C),
  `GET /api/finance/billing-report?from=&to=` — hisoblangan / shu oy uchun yig'ilgan / kassa (+ qaysi oylar uchun) / oy oxiridagi qarz.
  Filtrlar: oy, guruh, kurs, o'qituvchi (hozirgi), holat, summa, qidiruv; filial doirasi.
- `/lookups/payment-form` ga guruh o'qituvchilari qo'shildi (filtr uchun).

**Frontend**
- Qarzdorlik: "Muddati kelgan qarzlar" (standart), "Oy bo'yicha" (davr tanlagichi, hozir va oy oxiridagi holat), "Shartnoma balansi" (avvalgi sahifa).
- Qarz tarixi oynasi (oylar, qaysi to'lov qachon yopgani, to'lovlar, qaytarishlar) + taqsimotni tuzatish + oylarni bekor qilish.
- To'lov oynasi: "Qaysi oy uchun" — eng eski qarzdan (ko'rinish) yoki oylarni tanlab bo'lish; to'lov sanasi alohida.
- Moliya → "Oylik hisob" (3/6/12 oy taqqoslash). O'quvchi profili → To'lov jadvali → "Qarz tarixi".

**Tekshiruvlar**: backend 172 fayl / 1166 o'tdi, 1 skip (lookup o'zgarishidan keyin tegishli 5 fayl / 25 test qayta o'tdi); tsc, eslint toza.
Frontend tsc toza, eslint — faqat avvaldan bor 1 ogohlantirish, vitest 88 fayl / 312 test. E2E 73/73 (yangi `billing.spec.ts`;
`schedule.spec.ts` sahifa manzili `?view=contract` va o'quvchi tanlovi parallel to'qnashmasligi uchun o'zgardi). i18n — 0 yo'q.
Spetsifikatsiya testlari: `backend/tests/monthlyBilling.test.ts` (12 holat 6 testda).

**Qo'shimcha (2026-11-05, "davom et")**
- "Oy bo'yicha": "Qarzdorlar" — faqat muddati kelgan va qoldig'i bor; yangi "Kutilmoqda" — qoldig'i bor, muddati hali kelmagan
  (masalan, to'lov kuni 21-sana). Xulosada `dueRemaining`, `upcoming`.
- Bosh panel: "Muddati kelgan qarz" kartochkasi (`debts.dueTotal/dueDebtors`, izohda shartnoma qoldig'i); "Eng katta qarzdorlar" —
  muddati kelgan qarz bo'yicha (`/debts/outstanding`).
- Moliya sahifasi umumiy oy tanlagichiga ulandi (`?period=` — Panel, Foyda-zarar, Daftar, Oylik hisob bir oyni ko'radi; qo'lda sana oralig'i
  tanlansa oy tanlovi bekor bo'ladi).

- "Muddati kelgan qarzlar" ga ham oy tanlagichi: o'tgan oy tanlansa — o'sha oy oxiridagi holat (`/debts/outstanding?period=`), kim qaysi
  oylardan qarzdor edi; to'lov oynasida muddati o'tgan oylar "qarz" belgisi bilan.

**Qolganlar / cheklovlar**
- Direktor paneli, To'lov xulosasi va oy oxiri snapshoti hali shartnoma qoldig'ini qarz deb ko'rsatadi (snapshot jadvali shunday tuzilgan).
- Production'dagi 26 ta jadval ≠ shartnoma avtomatik tuzatilmadi — profilda "Qayta tuzish" bilan (biriktirilgan oylar saqlanadi).
- Bekor qilingan oyni qaytarish (restore) yo'q; xato bo'lsa shartnoma narxini tahrirlab, jadvalni qayta tuzish kerak.
- Qism summasining tarixi saqlanmaydi: ochiq oyda jadval qayta tuzilsa, o'sha oy "hisoblangan" summasi ham o'zgaradi (yopilgan oylar o'zgarmaydi).
- O'qituvchi filtri — guruhning hozirgi o'qituvchisi. Jadvali yo'q o'quvchilar yangi ko'rinishlarga kirmaydi (production'da hammasida jadval bor).
