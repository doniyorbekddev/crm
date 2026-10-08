# CRM 4.0 — Faza 1: unumdorlik poydevori (10 000 o'quvchigacha)

> Boshlangan va yakunlangan: 2026-10-07 · Asos: [CRM-4.0-ROADMAP.md](CRM-4.0-ROADMAP.md) "Faza 1" · Oldingi: [CRM-4.0-PHASE-0.md](CRM-4.0-PHASE-0.md)
> Yangi biznes imkoniyati **yo'q**. Bitta qo'shimcha (additive) migratsiya. **Commit qilinmagan** — ko'rib chiqish uchun.
> Faza 2 boshlanmagan; aniq ruxsat kutiladi.

Tartib: avval o'lchov → eng og'ir joy → tuzatish → natija bir xilligini tekshirish → qayta o'lchov.
"Tekshiruv" bo'limlarida faqat haqiqatan yurgizilgan narsalar yozilgan.

---

## 0. Qisqa xulosa

| Ko'rsatkich (9 618 o'quvchi, 494 451 davomat belgisi, 24 000 lead) | Oldin | Keyin |
|---|---:|---:|
| Xavf bahosini qayta hisoblash (har 30 daqiqada) | 15 444 ms | ~1 400–1 650 ms |
| Lead ballarini qayta hisoblash (har 30 daqiqada) | 35 343 ms | ~470 ms |
| Ogohlantirishlarni baholash (har 30 daqiqada) | 207 ms | ~70–90 ms |
| Davomat statistikasi | 151 ms | ~50–70 ms |
| Dashboard grafigi (kunlik) | 39 ms | ~13 ms |

Asosiy xulosa: 10 000 o'quvchida **ro'yxatlar, dashboard va hisobotlar allaqachon tez** (hammasi 170 ms dan past). Sekin joy ikkita
fon hisobi edi — ular har 30 daqiqada jami ~50 soniya davomida har qatorga alohida `UPDATE` yuborardi. Roadmapdagi ba'zi bandlar
(kompozit indekslar, dashboard keshi) o'lchovda foyda bermadi va **ataylab qilinmadi** — §9.

Holat belgilari: ✅ bajarildi va tekshirildi · ⚠️ qisman / ochiq qoldi · ⏭️ o'lchov asosida qilinmadi.

| # | Roadmap bandi | Holat |
|---|---|---|
| 1 | Xavf bahosi: to'plamli hisob, `RiskSnapshot` | ✅ (faqat o'zgargan qatorlar — ⚠️ §1) |
| 2 | Lead skoringi: to'plamli hisob, faqat o'zgargan qatorlar | ✅ |
| 3 | Haftalik hisobot: partiyalab, AI alohida navbatda | ⚠️ takroriy ish yo'qotildi; AI navbati qilinmadi (§4) |
| 4 | Dashboard / analitika: SQL `GROUP BY`, kesh | ⏭️ (§9) |
| 5 | Indekslar | ✅ 2 ta qo'shildi · ⏭️ 5 tasi qo'shilmadi (§5, §9) |
| 6 | Fon vazifalari: bir vaqtda bitta nusxa, ulanishlar puli | ✅ (advisory lock o'rniga ijara jadvali — §6) |
| 7 | Tozalash (saqlash muddati) | ✅ |
| 8 | `perf:bench` CI'da | ✅ lokalda takrorlab tekshirildi · ⚠️ GitHub'da hali yurmagan |

---

## 1. Xavf bahosi (`studentRisk.recalculateAll`)

**Sabab** (`backend/src/services/studentRisk.service.ts`):
- har o'quvchiga alohida `UPDATE` — 9 618 ta ketma-ket so'rov;
- oxirgi faollikni topishda har o'quvchi uchun 4 ta massiv `find` bilan to'liq aylanilardi — o'quvchilar soniga kvadratik;
- "oxirgi 10 ta davomat belgisi" so'rovi o'quvchining **butun** davomat tarixini raqamlab, keyin oxirgilarini olardi;
- barcha o'quvchilar ID'lari bitta `IN (...)` ro'yxatida — soni o'sgani sari parametrlar chegarasiga (32 767) yaqinlashadi.

**Tuzatish:**
- o'quvchilar 1 000 talik bo'laklarda: signal so'rovlari va yozuv bo'lak hajmida qoladi;
- bo'lak uchun **bitta** `UPDATE … FROM jsonb_to_recordset(...)`, xabarlar bilan bitta tranzaksiyada;
- `find` o'rniga `Map`;
- "oxirgi N belgi" — `LATERAL` + `(studentId, date)` indeksi: har o'quvchi uchun faqat N qator o'qiladi.

**Hisob formulasi o'zgarmadi** (`buildFactors`, `summarize` ga tegilmagan).

**Ataylab o'zgargan xatti-harakat:** fon hisobi endi `students.updatedAt` ni o'zgartirmaydi. Avval Prisma har 30 daqiqada barcha
o'quvchilarning `updatedAt` ini yangilardi — ustun "kartani kim, qachon tahrirladi" ma'nosini yo'qotgan edi. `riskUpdatedAt` avvalgidek
har yurishda yangilanadi.

**⚠️ Ochiq qoldi — "faqat o'zgargan qatorlarni yangilash":** o'quvchilar uchun qilinmadi. `riskUpdatedAt` "hisob qachon yurgani"ni
bildiradi va xavfli o'quvchilar ro'yxatida saralashda ishlatiladi (`student.service.ts:537`), shuning uchun har qator baribir yoziladi.
1,5 soniyada bu muammo emas; ma'nosini o'zgartirish alohida qaror.

### Kunlik tarix — `risk_snapshots`
Hisob yurganda har o'quvchi uchun **kuniga bitta qator** yoziladi (o'quvchi, sana, sog'liq bali, xavf darajasi). Kun ichidagi keyingi
yurishlar faqat qiymat o'zgarganda o'sha qatorni yangilaydi. 400 kundan eski qatorlar tozalanadi (§7).

Hozircha bu jadvalni **hech narsa o'qimaydi** — ekran ham, API ham yo'q. U Faza 10 (Health Score 2.0, trendlar) uchun poydevor: tarixni
keyin orqaga qarab tiklab bo'lmaydi, shuning uchun yozish hozirdan boshlanadi. Hajm: 10 000 o'quvchi × 365 kun ≈ 3,65 mln qisqa qator.

---

## 2. Lead skoringi (`leadScore.recalculateAll`)

**Sabab** (`backend/src/services/leadScore.service.ts`): har leadga alohida `UPDATE` (24 000 ta), barcha leadlar qo'ng'iroqlari bilan
birga bir yo'la xotiraga yuklanardi.

**Tuzatish:** leadlar `id` bo'yicha 1 000 talik bo'laklarda o'qiladi; bo'lak uchun bitta `UPDATE`; **faqat natijasi o'zgargan** leadlar
yoziladi (ball, daraja yoki omillar farq qilsa). `computeLeadScore` ga tegilmagan.

**Ataylab o'zgargan xatti-harakat:**
- `leads.updatedAt` endi o'zgarmaydi. Leadlar ro'yxatida "oxirgi o'zgargan" bo'yicha saralash bor (`lead.validator.ts:68`) — avval
  job har 30 daqiqada barcha ochiq leadlarni "hozirgina o'zgargan" qilib qo'yardi, saralash ma'nosiz edi.
- `scoreUpdatedAt` endi "oxirgi **o'zgarish**" vaqti (avval "oxirgi hisob"). Bu ustunni kodda hech narsa o'qimaydi.

**Nega "faqat o'zgarganlar" muhim:** o'lchov paytida ko'rindi — takroriy to'liq qayta yozishlardan keyin `leads` jadvali diskda 102 MB
bo'lib qoldi, tirik ma'lumot esa ~20 MB. Shu shishish dashboard xulosasidagi lead sanog'ini sekinlashtirdi (§8 izoh).

---

## 3. Ogohlantirishlar (`alerts.evaluate`) — yo'l-yo'lakay topilgan

Rejada yo'q edi. `attendances(date)` indeksi qo'shilgach "ketma-ket dars qoldirgan" qoidasi 207 → 413 ms ga **sekinlashdi**: reja
tuzuvchi parallel o'qishdan voz kechdi, asosiy xarajat esa 60 kunlik ~120 000 belgini o'quvchi bo'yicha saralash edi.

So'rov `LATERAL` ko'rinishiga o'tkazildi (`alert.service.ts`, `dropoutRule`): har faol o'quvchi uchun indeksdan faqat oxirgi N belgi.
Natija: 413 → ~70–90 ms (dastlabki 207 dan ham tez). Qoida mantig'i o'zgarmadi.

---

## 4. Haftalik hisobot

**Sabab** (`backend/src/jobs/weeklyReport.job.ts`): job yakshanba 18:00 dan yarim tungacha har 30 daqiqada yuradi (~12 marta). Har
yurishda **barcha** o'quvchilar uchun hisobot qaytadan qurilardi (AI yoqilgan bo'lsa — AI xulosasi bilan), natija esa `dedupeKey`
tufayli tashlab yuborilardi.

**Tuzatish:** yurish boshida shu hafta uchun yuborilganlar bitta so'rov bilan aniqlanadi (bildirishnoma yoki yetkazish yozuvi bo'yicha)
va ular o'tkazib yuboriladi. Qaytariladigan `students` soni avvalgidek — qabul qiluvchisi bor barcha o'quvchilar.

**Chekka holat:** hisobot yuborilgandan **keyin** o'sha kechqurun bog'langan yangi ota-ona endi shu haftaning hisobotini olmaydi
(avval keyingi 30 daqiqalik yurishda olardi). Keyingi haftadan oladi.

**⚠️ Ochiq qoldi:** birinchi yurish hali ham o'quvchilarni birma-bir, ketma-ket ishlaydi. AI yoqilgan bo'lsa 10 000 o'quvchi uchun
10 000 ta ketma-ket AI chaqiruvi bo'ladi. Roadmapdagi "AI qismi alohida navbatda va chegara bilan" **qilinmadi** — bu navbat, chegara
va xarajat nazorati bilan alohida ish; AI yoqilgan production'da 10 000 o'quvchiga yetishdan oldin hal qilinishi kerak.

---

## 5. Indekslar

Har nomzod 10k bazada `EXPLAIN ANALYZE` bilan tekshirildi. Qo'shilgani — faqat reja haqiqatan o'zgargani.

| Indeks | Qaror | Asos |
|---|---|---|
| `attendances(date)` | ✅ qo'shildi | Sana bo'yicha so'rov butun jadvalni (494k) yoki `(groupId, date)` indeksini to'liq o'qirdi. Davomat statistikasi 151 → ~60 ms |
| `notifications(createdAt)` | ✅ qo'shildi | Eski bildirishnomalarni tozalash (§7) busiz butun jadvalni o'qiydi |
| `students(branchId, status, deletedAt)` | ⏭️ | 2 filialda shart qatorlarning ~yarmiga mos — indeks ishlatilmaydi |
| `payments(branchId, paidAt)` | ⏭️ | Mavjud `paidAt` indeksi ishlatilyapti (9 ms) |
| `transactions(branchId, occurredAt)` | ⏭️ | Mavjud `occurredAt` indeksi ishlatilyapti |
| `leads(branchId, createdAt/status)` | ⏭️ | Mavjud `createdAt` indeksi ishlatilyapti |
| `lead_activities(type, createdAt)` | ⏭️ | Perf bazada bu jadval kichik — o'lchash uchun asos yo'q |

Filiallar soni ko'payganda (10+) kompozit indekslarni qayta o'lchash kerak — hozirgi qaror 2 filialli ma'lumotga asoslangan.

**`CONCURRENTLY` ishlatilmadi.** Prisma migratsiya faylini bitta tranzaksiya sifatida yuboradi, `CREATE INDEX CONCURRENTLY` esa
tranzaksiya ichida ishlamaydi. Oddiy `CREATE INDEX` jadvalga yozishni indeks qurilguncha to'xtatadi: 494k qatorli jadvalda lokalda
1 soniyadan kam. Production jadvallari bundan ancha kichik, lekin deploy'ni baribir dars belgilanmayotgan paytda qilgan ma'qul.

---

## 6. Fon vazifalari

### Bir vaqtda bitta nusxa — `job_leases`
Har vazifadagi `running` bayrog'i faqat bitta jarayon ichida ishlaydi. Ikki backend nusxasi (deploy paytida eski va yangi konteyner
birga turganda yoki ataylab ikki nusxa) bir xil vazifani parallel bajarardi.

Endi 18 ta vazifaning har biri `withJobLease(nom, …)` ichida (`backend/src/jobs/jobLease.ts`): ijara boshqa jarayonda bo'lsa — yurish
o'tkazib yuboriladi.

**Nega roadmapdagi `pg_advisory_lock` emas:** sessiya qulfi bitta ulanishga bog'liq, Prisma esa puldan har so'rovga boshqa ulanish
beradi. Qulfni ushlash uchun vazifa davomida tranzaksiya ochiq turishi kerak bo'lardi — har vazifa puldan bitta ulanishni band qiladi;
server ko'tarilganda 18 vazifa birga boshlanadi, pul esa 10 ta — bir-birini kutib qotib qolish xavfi. Ijara jadvali ulanishni band qilmaydi.

**Ishlashi:** olish — bitta atomar `INSERT … ON CONFLICT … WHERE lockedUntil < hozir`. Egasi har daqiqada muddatni 5 daqiqaga uzaytiradi.
Jarayon qulasa uzaytirish to'xtaydi va boshqa nusxa 5 daqiqagacha kutib oladi.

**Bilish kerak:**
- Deploy paytida vazifa o'rtasida to'xtatilgan bo'lsa, o'sha vazifa yangi konteynerda **5 daqiqagacha** kechikishi mumkin.
- Ijara vaqti ilova soatidan olinadi. Bir serverdagi konteynerlar uchun muammo emas; turli serverlardagi nusxalar soati bir-biridan
  daqiqalab farq qilsa, ijara noto'g'ri ishlaydi.
- Test tutgan xato: dastlabki variantda SQL `NOW()` ishlatilgan edi — Prisma ustuni vaqt zonasiz (UTC), `NOW()` esa vaqt zonali;
  baza sessiyasi UTC bo'lmaganda ijara doim "muddati o'tgan" ko'rinardi. Endi vaqt parametr sifatida uzatiladi. Xuddi shu sabab bilan
  Faza 0 dagi promo-kod hisoblagichidagi `"updatedAt" = NOW()` ham tuzatildi (`discount.service.ts`).

**`SKIP LOCKED` qo'shilmadi:** navbatlarni (yetkazish, kod sandbox) endi bir vaqtda bitta jarayon ishlaydi — qatorlarni bo'lishadigan
ikkinchi iste'molchi yo'q. Navbatni ataylab bir necha nusxada parallel ishlatish kerak bo'lsa (Faza S), o'shanda kerak bo'ladi.

### Ulanishlar puli
`DATABASE_POOL_MAX` (ixtiyoriy, 2–200; bo'sh — standart 10). `docker-compose.prod.yml` va `.env.production.example` ga qo'shildi.
Qoida: (backend nusxalari soni × pul hajmi) PostgreSQL `max_connections` (standart 100) dan kichik bo'lsin. Hozirgi bitta nusxada
o'zgartirish shart emas.

---

## 7. Saqlash muddati

Yangi kunlik vazifa (`retention.job.ts` → `retention.service.ts`), server ko'tarilgach 10 daqiqadan keyin birinchi marta.
O'chirish 5 000 talik bo'laklarda, bir yurishda bir jadvaldan ko'pi bilan 200 000 qator.

| Jadval | O'chiriladi |
|---|---|
| `refresh_tokens` | muddati tugaganiga 30 kundan oshgan |
| `telegram_events` | 90 kundan eski |
| `automation_runs` | 90 kundan eski |
| `ai_queries` | 180 kundan eski |
| `notification_deliveries` | 90 kundan eski **va** yakunlangan (yuborilgan / xato / o'tkazilgan). Navbatdagi `PENDING` ga tegilmaydi |
| `notifications` | o'qilgan va 180 kundan eski; o'qilmagan — 365 kundan eski |
| `risk_snapshots` | 400 kundan eski |

Tegilmaydi: audit jurnali (o'z sozlamasi bor), XP tranzaksiyalari (ball shulardan yig'iladi), moliya, davomat, baholar.

**⚠️ Deploy'dan oldin bilish kerak — bu ma'lumot o'chiradi.** Birinchi yurishda 6 oydan eski o'qilgan bildirishnomalar va 3 oydan eski
texnik jurnal butunlay o'chadi. Muddatlar kodda (`RETENTION_DAYS`), sozlamalar ekranida emas. Boshqa muddat kerak bo'lsa — deploy'dan
oldin ayting.

**Takroriy xabar xavfi tekshirildi:** bildirishnoma o'chsa, uning `dedupeKey` ham ketadi. Doimiy shartli eslatmalar (muddati o'tgan
follow-up, qarz, ogohlantirishlar) takrorlanmaslikni o'z belgisi (`overdueNotifiedAt`, `reminderSentAt`, `Alert` qatori) bilan
ta'minlaydi, bildirishnoma qatoriga tayanmaydi. Barcha ~60 ta kalit shakli birma-bir sinab chiqilmagan — ko'rib chiqilgan.

---

## 8. O'lchov

### Muhit
Lokal PostgreSQL 17, `crm_perf10k` bazasi (`PERF_SCALE=4`): 9 618 o'quvchi, 494 451 davomat, 24 000 lead, 28 784 to'lov,
600 000 bildirishnoma. Har o'lchov: 1 qizdirish + 5 takror (fon hisoblari 3), median. Production'da **o'lchanmagan**.

### Natija (ms, median)

| O'lchov | Oldin | Keyin |
|---|---:|---:|
| studentRisk.recalculateAll | 15 444 | 1 393–1 665 |
| leadScore.recalculateAll | 35 343 | 472–476 |
| alerts.evaluate | 207 | 68–93 |
| attendance.stats | 151 | 52–60 |
| dashboard.charts kun | 39 | 12–13 |
| dashboard.charts oy | 98 | 111–122 |
| dashboard.summary | 27 | 47–59 |
| report teachers | 161 | ~153 |
| executive: 12 oy | 132 | ~135–164 |
| analytics.cohorts: 12 oy | 120 | ~120–128 |
| weeklyReport (20 o'quvchi) | 38 | ~37–40 |
| ro'yxatlar (o'quvchi, to'lov, lead, qarz) | 3–14 | 3–23 |

"Keyin" ustunidagi oraliq — oxirgi ikki yurish. Mashina boshqa ish bilan band bo'lgan yurishlarda sonlar 1,5–2 baravar tebrandi;
±30% farqni o'zgarish deb o'qimang.

**`dashboard.summary` 27 → ~50 ms — izoh.** Sekin qismi — ochiq leadlar sanog'i (37 ms). O'lchovlar davomida `leads` jadvali o'nlab
marta to'liq qayta yozildi va diskda 102 MB gacha shishdi (tirik ma'lumot ~20 MB). Ya'ni bu o'lchov jarayonining izi; kod o'zgarishi
bilan bog'liqligi topilmadi. Toza bazada qayta o'lchab **tasdiqlanmagan**.

### CI
`.github/workflows/ci.yml` ga `perf` vazifasi qo'shildi: migratsiya → asosiy seed → perf seed (`PERF_SCALE=2`, ~4 800 o'quvchi) →
`perf:bench` `PERF_BUDGET=1` bilan. Chegaralar ataylab keng: xavf hisobi 8 s, lead hisobi 5 s, qolgan har bir o'lchov 2 s. Maqsad —
millisekundlarni poylash emas, "har qatorga alohida so'rov" kabi tartib o'zgarishini ushlash (eski kod bu hajmda ~7 va ~17 soniya edi).

Shu ketma-ketlik lokalda yangi bazada boshidan oxirigacha yurgizildi: seed ~2 daqiqa, xavf hisobi 1 097 ms, lead hisobi 716 ms,
barcha o'lchovlar chegara ichida. **GitHub Actions'da hali yurmagan** — birinchi push'da tekshiriladi; CI mashinasi sekinroq bo'lsa
chegaralarni sozlash kerak bo'lishi mumkin.

---

## 9. Ataylab qilinmaganlar

| Roadmap bandi | Nega |
|---|---|
| Dashboard / analitika vaqt qatorlarini SQL `GROUP BY` ga ko'chirish | 10k da eng sekini 164 ms. Qayta yozish xavfi foydadan katta |
| `averageStageDurations` rollup | Voronka 8–17 ms |
| 30–60 soniyalik kesh | Tez so'rovlarni keshlash eskirgan son ko'rsatish xavfini qo'shadi, o'lchanadigan foyda bermaydi |
| 5 ta kompozit indeks | §5 — reja o'zgarmadi |
| Test bazasini parallellashtirish (roadmap xavflar jadvali) | Beqarorlik sababi Faza 0 da topilib tuzatilgan (`setupLoopback.ts`) |

Bular bekor qilinmagan — hajm yoki filiallar soni o'sganda `perf:bench` ko'rsatsa, qaytiladi.

---

## 10. Migratsiya

`backend/prisma/migrations/20261007120000_phase1_performance/migration.sql` — faqat qo'shimcha:
- `CREATE INDEX attendances_date_idx`, `CREATE INDEX notifications_createdAt_idx`;
- `CREATE TABLE risk_snapshots` (+ indeks, `students` ga tashqi kalit, `ON DELETE CASCADE`);
- `CREATE TABLE job_leases`.

Mavjud jadval, ustun yoki ma'lumot o'zgarmaydi. Orqaga qaytarish: ikkala jadval va ikkala indeksni `DROP` qilish — boshqa hech narsa
ularga bog'liq emas (kod eski versiyaga qaytarilgan bo'lsa).

Qo'llangan: sinov bazasi, `crm_perf10k`, E2E bazasi. **Lokal dev bazaga qo'llanmagan** — `cd backend && npm run db:deploy`.
Production'da odatdagi deploy migratsiyani o'zi qo'llaydi.

---

## 11. Tekshiruv

| Tekshiruv | Natija |
|---|---|
| Backend `tsc` (asosiy + build), `eslint src tests prisma`, `prisma validate` | toza |
| Backend testlar (to'liq) | 985 o'tdi, 1 o'tkazilgan (Faza 0 da 976 edi; +9 yangi) |
| E2E (Playwright) | 51 / 51 |
| Sxema va migratsiya mosligi (`migrate diff`) | farq yo'q |
| Frontend | o'zgarmagan — qayta yurgizilmadi |
| Eski va yangi so'rov natijasi (10k baza) | "ketma-ket qoldirish": 5 / 5, farq 0 · "oxirgi belgilar": 4 815 / 4 815, farq 0 |

Yangi testlar (`backend/tests/phase1Performance.test.ts`, `parentPortal.test.ts` ga 1 ta):
- saqlangan xavf bahosi / lead bali bitta obyekt uchun yangidan hisoblangan qiymat bilan aynan bir xil;
- fon hisobi `updatedAt` ga tegmaydi; yopilgan leadga tegmaydi;
- kunlik tarix: kuniga bitta qator, qiymat o'zgarsa yangilanadi, yangi kunda yangi qator;
- ijara: bir vaqtda bitta bajaruvchi; boshqa jarayonning amaldagi ijarasi hurmat qilinadi; muddati o'tgani olinadi; xatodan keyin bo'shatiladi;
- saqlash muddati: har jadvalda chegaradan eski qator o'chadi, yangisi va `PENDING` qoladi;
- haftalik hisobot: ikkinchi yurishda hisobot qurilmaydi; keyin qo'shilgan o'quvchi uchun faqat bittasi quriladi.

Mavjud testlarning birortasi o'zgartirilmadi yoki o'chirilmadi.

**Tekshirilmagan:**
- production'dagi haqiqiy vaqtlar va haqiqiy ma'lumot taqsimoti;
- ikki backend nusxasi bilan ijara (faqat bitta jarayon ichida va qo'lda yaratilgan "begona" ijara bilan sinalgan);
- 1 000 dan ortiq o'quvchi / lead bilan bo'lak chegarasi avtomatik testda yo'q — faqat 10k o'lchovda yurgan;
- tozalashning katta hajmdagi birinchi yurishi (600 000 bildirishnomali bazada yurgizilmadi — perf ma'lumotini o'chirib yuborardi);
- CI `perf` vazifasi GitHub'da.

---

## 12. Deploy uchun eslatma

1. Migratsiya ikki indeks quradi — dars belgilanmayotgan paytda.
2. Birinchi kecha tozalash eski bildirishnoma va jurnallarni **o'chiradi** (§7). Zaxira nusxa deploy'dan oldin olingan bo'lsin.
3. Deploy'dan keyin `job_leases` da 18 ta qator paydo bo'lishi va `lockedUntil` o'tmishda turishi (vazifa ishlamayotganda) — normal holat.
4. Faza 0 ning production tekshiruvlari (nginx IP, zaxirani tiklash mashqi) hali ochiq — [CRM-4.0-PHASE-0.md](CRM-4.0-PHASE-0.md).
