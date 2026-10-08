# CRM 4.0 — Faza 2: ish qatlami (Vazifa 2.0, "Ishlarim", xabar → amal)

> Boshlangan: 2026-10-07 · Asos: [CRM-4.0-ROADMAP.md](CRM-4.0-ROADMAP.md) "Faza 2" · Oldingi: [CRM-4.0-PHASE-1.md](CRM-4.0-PHASE-1.md)
> Bitta qo'shimcha (additive) migratsiya. **Commit qilinmagan** — ko'rib chiqish uchun. Faza 3 boshlanmagan.

Holat belgilari: ✅ bajarildi va tekshirildi · ⚠️ qisman · ❌ qilinmadi.

## 0. Qisqa xulosa

Avval vazifani faqat avtomatlashtirish yaratardi; ogohlantirish va bildirishnomani o'qish mumkin edi, lekin ular bo'yicha ish
boshlab bo'lmasdi. Endi rahbar topshiriq bera oladi, xodim barcha ishini bitta sahifada ko'radi, ogohlantirish va bildirishnoma
shu joyning o'zida vazifaga aylanadi, muddati o'tgan ish rahbarga ko'tariladi.

| # | Qadam | Holat |
|---|---|---|
| 2A | Vazifa 2.0: yaratish, biriktirish, ustuvorlik, izohlar, biriktirish tarixi, sahifalash, ruxsatlar | ✅ |
| 2B | "Ishlarim" agregatori (`GET /my-work`) va sahifa | ✅ |
| 2C | Ogohlantirish / bildirishnomadan amal: vazifa, kechiktirish, biriktirish | ✅ |
| 2D | Umumiy `ApprovalRequest` — xarajat tasdig'i namunasida | ✅ (faqat xarajat turi) |
| 2E | Eskalatsiya | ✅ (yig'ma xabar bilan; alohida vazifa yaratilmaydi — §5) |
| 2E | Telegram: vazifa xabarida tugmalar, botda "Vazifalarim" | ✅ (§5.1) |
| — | Rahbar panelidagi chiplar — filtrli havola | ✅ (§5.2) |
| — | UI oynalari: kechiktirish vaqti, mas'ul tanlash, vazifani tahrirlash | ✅ (§3, §1) |

## 1. Vazifa 2.0

**Yangi imkoniyatlar** (`backend/src/services/task.service.ts`, `routes/task.routes.ts`, `validators/task.validator.ts`):

| So'rov | Nima qiladi | Ruxsat |
|---|---|---|
| `GET /tasks` | Ro'yxat: sahifalash (`page`, `limit` ≤ 100), filtrlar (`status`, `priority`, `overdue`, `search`, `assigneeId`), doira (`mine` / `created` / `all`) | xodim |
| `POST /tasks` | Yaratish (o'zi uchun) | `task.create`; boshqaga — `task.assign` |
| `GET /tasks/:id` | Tafsilot: izohlar, biriktirish tarixi, `can` (nima qila oladi) | ko'ra oladigan |
| `PATCH /tasks/:id` | Holat va/yoki sarlavha, tavsif, muddat, ustuvorlik | pastga qarang |
| `POST /tasks/:id/assign` | Qayta biriktirish (tarixga yoziladi) | `task.assign` |
| `POST /tasks/:id/comments` | Izoh | ko'ra oladigan |
| `GET /tasks/assignees` | Vazifa berish mumkin bo'lgan xodimlar | xodim |

**Kim nimani ko'radi:** har kim o'ziga biriktirilgan va o'zi bergan vazifalarni; `task.view_all` — o'z filiali xodimlarining
(`branch.view_all` bilan — barcha) vazifalarini. Filial vazifa **ijrochisi** orqali aniqlanadi. Ko'ra olmaydigan vazifa uchun javob
har doim 404.

**Kim nima qila oladi:** holatni — ijrochi, muallif yoki rahbar; matn / muddat / ustuvorlikni — muallif yoki rahbar (ijrochi emas);
qayta biriktirishni — `task.assign` egasi, agar u muallif yoki rahbar bo'lsa. Ijrochi faqat faol xodim bo'lishi mumkin (kabinet hisobi
emas) va chaqiruvchining filial doirasida.

**Bildirishnomalar** (yangi tur `TASK_UPDATE`, "Tizim" toifasi): vazifa berildi / qayta biriktirildi → ijrochiga; izoh → ikkinchi
tomonga; bajarildi → muallifga. O'ziga o'zi xabar yubormaydi.

**Tahrirlash (UI):** vazifa tafsilotidagi "Tahrirlash" tugmasi (muallif yoki rahbarga) — sarlavha, tavsif, muddat, ustuvorlik. Bo'shatilgan
tavsif va muddat olib tashlanadi. Ijrochi alohida — "Biriktirish" orqali o'zgaradi (tarixga yozilishi uchun).

**Avvalgi xatti-harakat saqlangan:** `PATCH /tasks/:id {status}` shakli, javobdagi `items` va `openCount`, `scope=all` ruxsatsiz
so'ralsa jimgina o'zinikiga tushishi. Yangi: javobga `total`, `page`, `limit` qo'shildi; 200 talik qattiq chegara olib tashlandi.

**Ataylab o'zgargan xatti-harakat:**
- "Hammasini ko'rish" endi `alert.manage` emas, `task.view_all` ruxsatiga bog'liq. Admin roli endi **o'z filiali** vazifalarini
  ko'radi (avval ko'rmasdi — `alert.manage` unda yo'q); Owner / Super Admin avvalgidek hammasini.
- Filialga biriktirilgan rahbar endi boshqa filial xodimlarining vazifalarini ko'rmaydi (avval `alert.manage` egasi hammasini ko'rardi).

### Ruxsatlar
| Ruxsat | Kimga standart beriladi |
|---|---|
| `task.create` | Barcha xodim rollari |
| `task.assign`, `task.view_all` | Super Admin, Owner, Admin |

**⚠️ Deploy'da:** `npm run db:sync-permissions` yangi ruxsatlarni **tizim** rollariga qo'shadi. Qo'lda yaratilgan (maxsus) rollarga
qo'shilmaydi — ularga Rollar sahifasidan berish kerak, aks holda o'sha rol egasi vazifa yarata olmaydi.

## 2. "Ishlarim" markazi

`GET /my-work` (`myWork.service.ts`) — xodimning **o'zi qilishi kerak bo'lgan** ishlari. Har bo'lim o'z ruxsati bilan ochiladi;
ruxsat bo'lmasa bo'lim javobda umuman yo'q. Har bo'limda to'liq son, kechikkanlar soni va eng muhim 5 tasi.

| Bo'lim | Nima kiradi | Ruxsat |
|---|---|---|
| Vazifalar | Menga biriktirilgan ochiq vazifalar | har bir xodim |
| Follow-up | Menga biriktirilgan, bugungacha muddati kelganlar | `followup.view` |
| Tasdiq kutayotganlar | Kutilayotgan tasdiq so'rovlari (filial doirasida) | `expense.approve` |
| Menga biriktirilgan ogohlantirishlar | Hal qilinmagan, kechiktirilmagan | `alert.view` |
| Baholanmagan uy vazifalari | Men bergan vazifalarga topshirilgan, bahosiz ishlar | `homework.grade` |
| Tekshirilmagan imtihon javoblari | Mening imtihon / guruhlarim | `exam.grade` |
| Bugungi belgilanmagan darslar | Bugun darsi bor, davomati yo'q o'z guruhlarim | `attendance.mark` |
| Ko'rib chiqilmagan salbiy fikrlar | Filial doirasida | `feedback.manage` |

Bu boshqaruv hisoboti emas: rahbar bu yerda butun markazning emas, **o'zining** ishlarini ko'radi.

Frontend: yangi `/my-work` sahifasi ("Ishlarim"); avvalgi `/tasks` sahifasi "Vazifalar" deb nomlandi va menyuda alohida band bo'ldi.

## 3. Xabar → amal

| So'rov | Nima qiladi | Ruxsat |
|---|---|---|
| `POST /alerts/:id/task` | Ogohlantirishdan vazifa (sarlavha, tavsif, havola, ustuvorlik ogohlantirishdan) | `task.create` |
| `POST /alerts/:id/assign` | Mas'ul belgilash (`null` — olib tashlash) | `task.assign` |
| `POST` / `DELETE /alerts/:id/snooze` | Kechiktirish (≤ 30 kun) / bekor qilish | `alert.view` |
| `POST /notifications/:id/task` | Bildirishnomadan vazifa | `task.create` |
| `POST /notifications/:id/snooze` | Kechiktirish | egasi |

- Ogohlantirishdan yaratilgan vazifa unga bog'lanadi (`tasks.alertId`); ro'yxatda "N ta ochiq vazifa" ko'rinadi. Ogohlantirish
  **yopilmaydi** — muammo hal bo'lgach avvalgidek o'zi yopiladi.
- Vazifa ijrochisi ogohlantirishlarni ko'ra olsa, uning mas'uli ham bo'ladi.
- Kechiktirilgan ogohlantirish / bildirishnoma muddati kelguncha faol ro'yxat va hisoblagichlarda ko'rinmaydi. Ogohlantirishlar
  ro'yxatiga ikki filtr qo'shildi: "Menga biriktirilgan", "Kechiktirilgan".
- Bir bildirishnomadan ikkinchi marta vazifa yaratilmaydi (409).
- Doira o'zgarmagan: ogohlantirish — filial, bildirishnoma — faqat egasi; begonaga 404.

Frontend: ogohlantirishlar sahifasida "Vazifa" va "Ertaga" tugmalari, mas'ul / ochiq vazifa / kechiktirish satri; bildirishnomalar
sahifasida "Vazifaga aylantirish" va "Ertagacha kechiktirish" tugmalari.

**Kechiktirish oynasi** (`components/work/SnoozeModal.tsx`, ikkala sahifada bir xil): tayyor variantlar (1 soat, 3 soat, ertaga 09:00,
dushanba 09:00, 1 hafta) yoki aniq sana va vaqt. Chegara server bilan bir xil — kelajakda va ko'pi bilan 30 kun.

**Mas'ul tanlash oynasi** (`AlertAssignModal.tsx`, `task.assign`): ro'yxatda faqat ogohlantirishlarni ko'ra oladigan, filial doirasidagi
xodimlar (`GET /alerts/assignees`); "Mas'ul yo'q" — olib tashlash.

## 4. Umumiy tasdiq so'rovi (`approval_requests`)

Birinchi va hozircha yagona tur — xarajat tasdig'i (`approval.service.ts`).

**Muhim dizayn qarori:** holatning egasi avvalgidek `expenses.status`. `approval_requests` — uning **ko'zgusi**, "Ishlarim" barcha
tasdiqlarni bitta ro'yxatda ko'rsatishi uchun. Ochish ham, yopish ham faqat xarajat holati o'zgargan tranzaksiyaning ichida bajariladi.
Xarajatni tasdiqlash / rad etish oqimi, ruxsatlari va ekranlari **o'zgarmagan**.

Migratsiya hozir tasdiq kutayotgan xarajatlar uchun so'rov qatorini yaratadi.

Maosh, chegirma, qaytarish kabi boshqa tasdiqlar bu jadvalga **ko'chirilmagan** — roadmap bo'yicha keyingi fazalarda.

## 5. Eskalatsiya

Soatiga bir marta (`escalation.job.ts`, ijara ostida):
- **Vazifa:** muddati 24 soatdan ko'p o'tgan ochiq vazifa → uni bergan xodimga va ijrochi filialining rahbarlariga (`task.view_all`).
  Ijrochining o'ziga yuborilmaydi.
- **Ogohlantirish:** mas'ulga biriktirilgan, 48 soatdan beri hal qilinmagan, kechiktirilmagan → ogohlantirish sozlovchilariga (`alert.manage`).

Har yozuv bir marta ko'tariladi (`escalatedAt`). Muddat surilsa yoki qayta biriktirilsa belgi tozalanadi.

**Yig'ma xabar.** Bir yurishda har qabul qiluvchi **bitta** xabar oladi: bitta yozuv bo'lsa — o'sha haqida, ko'p bo'lsa — yig'ma
("5 ta vazifa muddati o'tdi: A; B; C va yana 2 ta") va filtrli ro'yxatga havola (rahbarga — hammasi, muallifga — "men berganlar").
Dastlabki variant har vazifa uchun alohida xabar yuborardi — yuzlab kechikkan vazifada bu xabar toshqini bo'lardi; o'lchov paytida
ko'rinib, qayta yozildi. Qatorlar bitta `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING` bilan olinadi — ikki nusxa bir qatorni ikki marta
ko'tarmaydi. Bir yurishda ko'pi bilan 500 ta vazifa; qolgani keyingi soatda.

**Roadmapdan farq:** "eskalatsiya vazifasi" o'rniga **bildirishnoma** yuboriladi. Har kechikkan vazifa uchun rahbarga yana bitta
vazifa yaratish ro'yxatni ikki baravar qilardi; rahbarga signal kerak, ish o'sha vazifaning o'zida davom etadi. Muddatlar (24 / 48
soat) kodda, sozlamalar ekranida emas.

### 5.1. Telegram

- **Xabar ostidagi tugmalar.** Vazifa berilganda / qayta biriktirilganda ijrochining Telegramiga boradigan xabarda ikki tugma:
  "✅ Bajarildi" va "📋 Ochish". Yetkazish navbati endi havola tugmalaridan tashqari bot amali tugmalarini ham saqlaydi
  (`notification_deliveries.buttons` — mavjud ustun, sxema o'zgarmadi).
- **Botda "📋 Vazifalarim"** (har bir xodim menyusida): ochiq vazifalar ro'yxati (sahifalangan), tafsilot, "Bajarildi", va tahrirlash
  huquqi bo'lsa "⏰ Ertaga" (muddatni 24 soatga surish).
- **Xavfsizlik:** bot xodim nomidan `taskService` ni chaqiradi — doira va ruxsat CRM'dagi bilan aynan bir xil. Tugma ma'lumotidagi
  vazifa ID'siga ishonilmaydi: begona xodim uni qo'lda yuborsa "Vazifa topilmadi" oladi. O'quvchi / ota-ona chatida `tk_*` tugmalari
  ishlamaydi. "Bajarildi" ikki marta bosilsa ikkinchisi holatni ko'rsatadi, qayta yozmaydi.
- Fayllar: `telegram/handlers/tasks.ts`, `telegram/taskButtons.ts` (servis va handler bir-birini import qilmasligi uchun alohida).

### 5.2. Rahbar panelidagi chiplar

"Diqqat talab qiladi" kartasidagi har chip endi **havola** — manzilni server beradi, sahifa filtr bilan ochiladi:

| Chip | Manzil |
|---|---|
| Kritik ogohlantirishlar | `/alerts?severity=CRITICAL` |
| Qarzdor o'quvchilar | `/debts` |
| Muddati o'tgan vazifalar (yangi) | `/tasks?scope=all&overdue=1` |
| Tasdiq kutayotgan xarajatlar (yangi) | `/expenses` |
| Davomati belgilanmagan darslar | `/attendance` |
| Kechikkan follow-up | `/follow-ups?scope=overdue` |
| Tasdiq kutayotgan maoshlar | `/salaries?status=CALCULATED` |
| Tasdiqlanmagan xodimlar | `/users?status=PENDING` |

Buning uchun ogohlantirishlar, vazifalar, follow-up, maoshlar va xodimlar sahifalari boshlang'ich filtrni URL'dan o'qiydi
(`hooks/useInitialParam.ts` — faqat ruxsat etilgan qiymat qabul qilinadi). Vazifalar sahifasiga "Faqat kechikkanlar" filtri qo'shildi.

## 6. Migratsiya

`backend/prisma/migrations/20261007150000_phase2_work_layer/migration.sql` — faqat qo'shimcha:
- `NotificationType` ga `TASK_UPDATE` qiymati;
- `tasks`: `priority` (standart NORMAL), `source` (standart MANUAL), `alertId`, `notificationId`, `escalatedAt`;
- `notifications`: `actionUrl`, `snoozedUntil`, `taskId`; `alerts`: `assigneeId`, `snoozedUntil`, `escalatedAt`;
- yangi jadvallar: `task_comments`, `task_assignments`, `approval_requests`;
- ma'lumot: qoida yaratgan mavjud vazifalarga `source = AUTOMATION`; kutilayotgan xarajatlar uchun tasdiq so'rovlari.

Mavjud ustun yoki ma'lumot o'zgartirilmaydi va o'chirilmaydi.

Qo'llangan: sinov bazasi, E2E bazasi, **lokal dev baza** (migratsiyalar + `db:sync-permissions`: 92 → 95 ruxsat), `crm_perf10k`.
Production'ga qo'llanmagan.

## 7. Tekshiruv

| Tekshiruv | Natija |
|---|---|
| Backend `tsc` (asosiy + build), `eslint src tests prisma`, `prisma validate` | toza |
| Backend testlar (to'liq) | 1010 o'tdi, 1 o'tkazilgan (Faza 1 da 985; +25 yangi) |
| Frontend `tsc`, `eslint`, testlar, `vite build` | toza; 206 test o'tdi (Faza 1 da 195; +11 yangi) |
| E2E (Playwright, haqiqiy brauzer) | 54 / 54 (51 avvalgi + 3 yangi) |

Yangi backend testlar: `tasks.test.ts` (8), `myWork.test.ts` (4), `workActions.test.ts` (8), `telegramTasks.test.ts` (4),
`executive.test.ts` ga 1 ta — doira (o'ziniki / bergan / filial / 404), ruxsatlar, biriktirish tarixi, izohlar, sahifalash, tasdiq
so'rovining ochilishi va yopilishi, kechiktirish, yig'ma va bir martalik eskalatsiya, eskalatsiya jobining ijarasi, bot tugmalari va
bot orqali begona vazifaga kirib bo'lmasligi, chip havolalari.

Yangi frontend testlar: `MyWorkPage`, `SnoozeModal` (variantlar va chegaralar), `TaskFormModal` (yaratish va tahrirlash),
`AlertAssignModal`, `AttentionCard` (chip havolalari).

Yangi E2E (`e2e/specs/work-layer.spec.ts`, 3 senariy):
1. rahbar vazifa yaratadi → "Ishlarim"da ko'radi → bajaradi;
2. kechikkan vazifa: rahbar panelidagi chip → filtrli ro'yxat → tahrirlash → izoh; ijrochi bildirishnomani vaqt tanlab kechiktiradi;
3. ogohlantirish → vazifa → mas'ulni almashtirish → kechiktirish → qaytarish.

**O'zgartirilgan mavjud testlar** (hech biri yumshatilmagan):
- `endpointSecurity.test.ts` — "faqat kirgan xodimga ochiq" ro'yxatiga 5 ta yangi marshrut qo'shildi (`/tasks/assignees`, `/tasks/:id`,
  `/tasks/:id/comments`, `/my-work`, `/notifications/:id/snooze`). Ular ataylab alohida ruxsat talab qilmaydi: doira servisda (o'z
  vazifasi / o'z bildirishnomasi).
- `frontend/src/layouts/shell.test.tsx` — menyudagi bandlar soni 46 → 47 ("Ishlarim" qo'shildi).

### O'lchov (10k baza, `crm_perf10k`: +80 000 vazifa, 20 000 izoh, 160 tasdiq so'rovi)

| O'lchov | Median |
|---|---:|
| "Ishlarim" — rahbar | 3 ms |
| "Ishlarim" — eng ko'p baholanmagan ishi bor o'qituvchi (528 ta) | 4 ms |
| "Ishlarim" — eng ko'p follow-up'i bor sotuv xodimi (1 368 ta) | 7 ms |
| Vazifalar: meniki | 10 ms |
| Vazifalar: hammasi (80 000), 1-sahifa | 35 ms |
| Vazifalar: hammasi, 500-sahifa | 162 ms |
| Vazifalar: kechikkanlar | 23 ms |
| Vazifalar: matn bo'yicha qidiruv | 58 ms |
| Eskalatsiya: bitta yurish (500 vazifa, 94 ta yig'ma xabar) | 340 ms |

Bu o'lchovlar `perf:bench` ga qo'shildi (CI chegarasi — har biri 2 s). Perf seed endi ish qatlami ma'lumotini ham yaratadi.

O'lchov paytida topilgan: birinchi yurishda rahbar "hammasi" so'raganda atigi 852 ta (o'zining) vazifasini oldi — perf bazada yangi
ruxsatlar moslanmagan edi. Bu kod xatosi emas, lekin deploy'da `db:sync-permissions` unutilsa aynan shunday ko'rinadi: xato chiqmaydi,
rahbar shunchaki kam ma'lumot ko'radi.

**Tekshirilmagan:**
- haqiqiy Telegram ilovasida xabar va tugmalarning ko'rinishi (bot testlari Telegram API ni almashtirib sinaydi; haqiqiy botga
  yuborilmagan) — production'da bitta vazifa berib ko'rish kerak;
- production'dagi haqiqiy vaqtlar;
- ikki backend nusxasi bilan eskalatsiya (ijara "begona egali" qator bilan sinalgan, haqiqiy ikkinchi jarayon bilan emas).

## 8. Qilinmaganlar

| Band | Holat |
|---|---|
| Boshqa tasdiq turlari (`approval_requests`): maosh, chegirma, qaytarish | Roadmap bo'yicha keyingi fazalarda |
| Eskalatsiya muddatlari (24 / 48 soat) sozlamalar ekranida | Kodda turibdi; talab bo'lsa qo'shiladi |
| Botdan vazifa yaratish va izoh yozish | Rejada yo'q edi; botda faqat ko'rish, yopish, muddatni surish |

## 9. Deploy uchun eslatma

1. `npm run db:deploy`, so'ng **albatta** `npm run db:sync-permissions` — busiz hech kim vazifa yarata olmaydi va rahbar faqat o'z
   vazifalarini ko'radi.
2. Qo'lda yaratilgan (maxsus) rollarga `task.create` (va kerak bo'lsa `task.assign`, `task.view_all`) ni Rollar sahifasidan bering.
3. Birinchi soatda eskalatsiya eski kechikkan vazifalarni ko'taradi: har rahbar soatiga bitta yig'ma xabar oladi (500 tadan), navbat
   tugaguncha. Kechikkan vazifalar ko'p bo'lsa, deploy'dan oldin ularni yopish yoki muddatini surish ma'qul.
4. Telegramda bitta sinov vazifasi berib, tugmalar ko'rinishini tekshiring.
