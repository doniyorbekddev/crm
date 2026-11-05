# ORG System — CRM'ga joriy qilish

Manba: `ORG-SYSTEM-MASTER-DOCUMENT.md` (v1.0). Bu hujjat — hujjatning har bir bo'limi CRM'da qanday bajarilishi:
avvaldan bor imkoniyat, yangi qo'shilgani va ataylab qilinmagani.

## 1. Tahlil: hujjat ↔ CRM

| § | Talab | Holat | Qayerda / nima qilinadi |
|---|---|---|---|
| 1 | One Center — One System — One Responsible Leader | Bor | Har vazifada bitta ijrochi, audit log |
| 2, 16 | Tashkiliy tuzilma, lavozimlar, kelajakdagi lavozimlar | **Qo'shiladi** | Yangi lavozimlar, "kimga hisobot beradi", tashkiliy tuzilma sahifasi, vakant lavozimlar |
| 2.2 | Chegirma vakolati: 0–5% mustaqil, yuqorisi — CEO tasdig'i, sabab majburiy | **Qo'shiladi** | Chegirma so'rovi + tasdiq oqimi, chegara sozlamasi |
| 3.1 | Ishga qabul qilish (suhbat → demo → CEO qarori) | **Qo'shiladi** | Nomzodlar voronkasi |
| 3.2 | Sinov muddati | **Qo'shiladi** | Xodim kartasida sinov tugash sanasi + eslatma |
| 3.3 | Onboarding | **Qo'shiladi** | Onboarding ro'yxati (mas'ul bilan) |
| 3.4 | QR davomat | Bor | `a263cd3` — `docs/staff-attendance.md` |
| 3.5 | Ta'til, ruxsat, vazifani boshqaga topshirish | Bor (qisman) | Ta'til va ruxsat so'rovlari bor; vazifani topshirish — offboarding/qayta biriktirish |
| 3.6 | Kunlik / haftalik / oylik hisobot | Bor (kengaytiriladi) | Digest va haftalik hisobotga jamoa bo'limi |
| 3.7 | Topshiriq: New → In Progress → Review → Done, Overdue, kutilgan natija | **Qo'shiladi** | Vazifa holatlari va "kutilgan natija" maydoni |
| 3.8 | Telegram — rasmiy topshiriq emas | Bor | Topshiriqlar CRM'da, Telegram faqat xabar |
| 4 | View/Create/Edit/Delete/Approve, audit | Bor | Rollar va ruxsatlar, audit log |
| 5 | Oylik KPI, choraklik attestatsiya | Bor (oylik) / **qo'shiladi** (attestatsiya) | Choraklik baholash |
| 6.1 | Maosh modeli | Bor | Payroll, KPI bonusi, o'qituvchi foizi |
| 6.2 | Oy / chorak xodimi, mukofotlar | **Qo'shiladi** | Taqdirlashlar |
| 7 | Shikoyatlar: New → Under Review → Resolved → Closed, eskalatsiya; xodimlar nizolari | **Qo'shiladi** | Murojaatlar moduli |
| 8 | O'quvchi hayot sikli, ko'pga-ko'p guruh | Bor | Lead → o'quvchi, `StudentGroupMembership` |
| 9 | O'quvchini saqlab qolish | Bor | Retention, risk, qarz eslatmalari |
| 10 | Bo'lim bo'yicha oylik xarajat limiti, limitdan yuqori — CEO | **Qo'shiladi** | Bo'lim limiti; summa chegarasi bo'yicha tasdiq avvaldan bor |
| 11 | Aktivlar (inventar raqami, mas'ul, ta'mir tarixi) | **Qo'shiladi** | Aktivlar reyestri (sotiladigan tovar ombori alohida qoladi) |
| 12 | Offboarding | **Qo'shiladi** | Offboarding ro'yxati: vazifalar, jihozlar, kirishni bekor qilish |
| 13 | Karyera o'sishi | **Qo'shiladi** | Lavozim bosqichlari, ko'tarilish tavsiyasi → CEO tasdig'i |
| 14 | Bilimlar bazasi, lavozim bo'yicha ko'rinish, versiyalar | **Qo'shiladi** | Bilimlar bazasi |
| 15 | CEO dashboard | Bor (kengaytiriladi) | Jamoa bloki: davomat, vazifalar, murojaatlar, tasdiqlar, xarajat limiti |

## 2. Bosqichlar

1. **Foundation** — tashkiliy tuzilma va lavozimlar, sinov muddati, vazifa holatlari.
2. **Operations** — murojaatlar, chegirma vakolati, nomzodlar / onboarding / offboarding, aktivlar, bilimlar bazasi.
3. **Performance & Finance** — bo'lim xarajat limiti, attestatsiya, taqdirlash, karyera.
4. **Automation & Intelligence** — CEO dashboard'ning jamoa bloki, hisobotlarga jamoa bo'limi.

Har bosqich: migratsiya faqat qo'shuvchi, backend + frontend testlari, tsc/eslint, E2E.

Texnik spetsifikatsiya (`ORG-SYSTEM-TECHNICAL-SPECIFICATION.md`) bilan solishtirish: mavjud modellar takrorlanmadi —
`User` (kirish hisobi) va `Employee` / `TeacherProfile` (HR profili) alohida qoldi, lavozim katalogi mavjud lavozim
turlari ustiga qurildi (KPI va maosh qoidalari o'zgarmadi), "Overdue" holati saqlanmaydi — hisoblanadi.

## 3. Bajarilgan ishlar

### 1-bosqich — Foundation (commit `2ba2522`, migratsiya `20261103100000_org_foundation`)

- **Vazifa holatlari (§3.7):** Yangi (`OPEN`) → Jarayonda → Tekshiruvda → Bajarildi / Bekor. Boshqa xodim bergan
  vazifani ijrochi yopmaydi — topshiradi; bergan xodim yoki rahbar qabul qiladi yoki izoh bilan qaytaradi (izoh vazifa
  izohlariga yoziladi). Ijrochi o'z ishini rahbar huquqi bo'lsa ham o'zi qabul qilmaydi. "Kutilgan natija" maydoni.
  Muddati o'tgan — faqat Yangi/Jarayonda (tekshiruvga topshirilgani muddatida hisoblanadi). KPI "o'z vaqtida" —
  topshirilgan vaqt bo'yicha. Telegram tugmasi ham shu qoida bilan ishlaydi. Holat o'zgarishi shartli yangilanadi
  (bir vaqtdagi ikki o'zgarish — 409).
- **Lavozimlar (§2, §16):** qabulxona/kassir, marketing menejeri, video kontent yaratuvchi, operatsion menejer,
  o'quvchilar muvaffaqiyati menejeri, akademik koordinator.
- **Kimga hisobot beradi** (bo'sh — CEO) va **sinov muddati** (xodim va o'qituvchi); tugashiga 7 kun qolganda va
  tugagan kuni rahbarga bir martadan eslatma (soatlik job, `HR_UPDATE`).
- **Tashkiliy tuzilma** sahifasi: rahbar → bo'limlar → xodimlar va o'qituvchilar, sinov/ta'til/CRM hisobi yo'q belgilari,
  vakant kelajakdagi lavozimlar.
- Tuzatish: akademiya holati kartasi 00:00–05:00 orasida bugungi davomatni hisobga olmasdi.

### 2-bosqich — Operations (migratsiyalar `20261103110000_org_operations`, `20261103120000_org_structure_catalog`)

- **Bo'limlar va lavozimlar katalogi (spek §5.2–5.6, §5.19):** bo'lim (rahbari, yuqori bo'lim, oylik xarajat limiti),
  lavozim (bo'limi, tavsifi, bandlik turi, standart sinov muddati — rahbarlik lavozimlarida 3 oy, karyera yo'li: keyingi
  lavozim, talablar, eng kam KPI va muddat), mas'uliyatlar. Standart bo'lim va lavozimlar ORG hujjatidagi mas'uliyatlar
  bilan yaratiladi — faqat yo'q bo'lsa (deployda `db:sync-permissions` ichida). Eski "Bo'lim" matnlari migratsiyada
  katalogga ko'chirildi va bog'landi. Tuzilmani faqat CEO o'zgartiradi (`org.manage`).
- **Ish tarixi:** ishga olish, lavozim, bo'lim va holat o'zgarishlari sababi bilan (o'zgarmas) — xodim va o'qituvchi uchun.
- **Murojaatlar (§7):** Yangi → Ko'rib chiqilmoqda → Hal etildi (yechim majburiy) → Yopildi; mas'ulga yo'naltirish,
  rahbarga ko'tarish, izohlar, o'zgarmas tarix. Javob muddati: kritik 4 soat, muhim 24, oddiy 72; muddati o'tgani bir
  marta eslatiladi. Xavfsizlik va "kritik" — yaratilishi bilan CEOga. Xodimning o'z murojaati (nizo) — maxfiy: Admin ham
  ko'rmaydi, kim haqida bo'lsa — u ham; faqat CEO (`complaint.confidential`).
- **Chegirma vakolati (§2.2):** o'quvchining umumiy chegirmasi chegaradan (standart 5%) oshsa, `discount.approve`
  bo'lmagan xodimning chegirmasi sababi bilan so'rovga aylanadi (202); CEO tasdiqlaganda o'sha paytdagi shartnoma bo'yicha
  qayta hisoblanib beriladi (kim so'radi, kim tasdiqladi saqlanadi), rad etish — sabab bilan. Chegara va "qoidalar
  oldindan tasdiqlangan" sozlamasini faqat tasdiqlovchi o'zgartiradi. "Ishlarim"da tasdiqlar bo'limiga qo'shildi.
  Sotuv menejeri roliga `discount.grant` qo'shildi (yangi o'rnatishlar uchun; production — pastga qarang).
- **Ishga qabul qilish (§3.1):** nomzod: Yangi → Suhbat → Demo dars → Taklif → CEO qarori (ishga olish / rad etish —
  `hiring.decide`). Ishga olinganda xodim kartasi lavozimning sinov muddati bilan yaratiladi va onboarding ochiladi.
- **Onboarding (§3.3) va offboarding (§12):** bandlar mas'ul bilan; tizim bandlari CRM ma'lumotidan tekshiriladi
  (ochiq vazifa/follow-up/murojaat, xodimdagi jihozlar, CRM kirishi, shartnoma) — qo'lda belgilab bo'lmaydi.
  Offboardingda ishlarni bir tugma bilan topshirish (tarix bilan), CRM kirishini bekor qilish (hisob bloklanadi,
  sessiyalar yopiladi, Telegram bot ham faol hisob talab qiladi); yakunlanganda xodim "ishdan ketgan" bo'ladi.
- **Aktivlar (§11):** inventar raqami (filialda takrorlanmas), xarid sanasi va qiymati, holat, texnik holati, joy, mas'ul;
  biriktirish/qaytarish, ko'chirish, ta'mir (xarajati bilan), hisobdan chiqarish — o'zgarmas tarix. Sotiladigan tovar
  ombori alohida qoldi.
- **Bilimlar bazasi (§14):** turkumlar (lavozim yo'riqnomasi, qoida, video, skript, dars standarti, material),
  auditoriya rollar bo'yicha, qoralama → e'lon → arxiv, har tahrir — yangi versiya (eski matn o'qiladi),
  "tanishish majburiy" — tasdiq va yangi versiyada qayta so'rov.
- **Eslatmalar (spek §9):** vazifa muddati yaqinlashdi (24 soat qolganda, bir marta).
- Yangi bildirishnoma turlari: `COMPLAINT_UPDATE`, `APPROVAL_REQUEST`. Yangi ruxsatlar: `org.manage`,
  `complaint.view/create/manage/confidential`, `hiring.manage/decide`, `asset.view/manage`, `knowledge.manage`,
  `discount.approve` (CEO qarorlari — Admin rolidan chiqarilgan).

### Production uchun eslatma

`db:sync-permissions` faqat **yangi** ruxsatlarni tizim rollariga qo'shadi. Sotuv menejeri rolidagi `discount.grant`
eski ruxsat bo'lgani uchun avtomatik qo'shilmaydi — Rollar sahifasida qo'lda yoqiladi (Shodiya 0–5% ni o'zi berishi uchun).

### 3-bosqich — Performance & Finance (migratsiya `20261103130000_org_performance`)

- **Bo'lim xarajat limiti (§10):** xarajatga bo'lim bog'lanadi; shu oydagi bo'lim sarfi (rad etilganlarsiz) + yangi summa
  oylik limitdan oshsa, tasdiqlash huquqi bo'lmagan xodimning xarajati rahbar tasdig'iga ketadi (mavjud xarajat tasdig'i
  oqimi — pul yechilmaydi). Bo'limlar bo'yicha oylik sarf/limit/kutilayotgan hisobot; xarajat formasida qoldiq ko'rinadi.
- **Choraklik baholash (§5.1):** KPI o'rtachasi (chorak oylari) va xodim davomati avtomatik; 5 mezon 1–5 (sifat,
  intizom, jamoaviylik, tashabbus, natija) → o'rtacha va xulosa (talabdan past / mos / yuqori). Qoralama → tasdiqqa →
  CEO tasdiqlaydi; o'zini baholash va o'zinikini tasdiqlash taqiqlangan; tasdiqlangani o'zgarmaydi. Xodim faqat
  tasdiqlanganini ko'radi. Chorak boshida baholovchilarga eslatma (spek §9 "KPI ko'rib chiqish vaqti").
- **Taqdirlash (§6.2):** oy/chorak xodimi (davrga bitta), natijaviy mukofot, malaka oshirish — mezon va sabab bilan;
  pul mukofoti maosh servisi orqali bonus tuzatmasi (PERFORMANCE) sifatida qo'shiladi — tasdiqlangan oyga qo'shilmaydi,
  maosh tasdiqlash tartibi o'zgarmaydi.
- **Karyera (§13):** katalogdagi keyingi lavozim, eng kam KPI (oxirgi 3 oy) va lavozimdagi muddat bo'yicha "ko'tarilishga
  tayyor" holati; tavsiya → CEO tasdig'i → xodim kartasi yangilanadi, ish tarixiga "lavozimga ko'tarildi" (tasdiqlagan bilan).
  "Mening rivojlanishim" sahifasi — xodimning o'z yo'li, talablar bajarilishi, baholashlar va taqdirlashlari.
- Ruxsatlar: `performance.view`, `performance.manage`, `performance.approve` (CEO — Admin rolidan chiqarilgan).

### 4-bosqich — Automation & Intelligence (migratsiyasiz)

- **Tashkilot paneli (§15, spek §10):** bitta oynada — rahbar qarorini kutayotganlar (xarajat, chegirma, baholash,
  ko'tarilish, taklif bosqichidagi nomzod), bugungi davomat va istisnolar (kechikkanlar ismi bilan), jamoa (xodim,
  o'qituvchi, ta'tilda, sinovda, CRM hisobi yo'q, vakant), vazifalar (holatlar, muddati o'tganlar ro'yxati), KPI (o'tgan oy
  o'rtachasi, 70% dan pastlar), akademik, sotuv, marketing (xarajat, CPL, CAC, ROI), to'lov va qarzdorlik, maosh,
  xarajatlar (limitdan oshgan bo'limlar), murojaatlar (jiddiy, muddati o'tgan, CEOda), aktivlar. Har blok o'z ruxsati
  bilan qaytariladi (ruxsatsiz blok — `null`, maxfiy murojaatlar soni faqat ularni ko'radiganlarga). Moliya, sotuv va
  akademik raqamlar direktor paneli va analitika hisoblaridan olinadi.
- **Kunlik xulosa (§3.6):** jamoa qatori — ishga kelganlar, muddati o'tgan vazifalar, ochiq/jiddiy murojaatlar,
  tasdiq kutayotganlar.

## 4. Ataylab qilinmagan / keyingi qadamlar

- **Telegram guruhlari (§3.8)** — CRM ularni boshqarmaydi; offboardingda "guruhlardan chiqarildi" — qo'lda band.
- **Mehnat qonunchiligi bo'yicha hujjatlar** (shartnoma, buyruq) — onboardingda band sifatida, hujjatning o'zi
  "Xodim hujjatlari" bo'limiga yuklanadi; avtomatik hujjat yaratilmaydi.
- **KPI vaznlari, reja va bonus summalari (§5.2, §6.1)** — hujjat ularni "alohida tasdiqlanadi" deydi: KPI qoidalari
  mavjud KPI sahifasida CEO tomonidan kiritiladi, kod ularni o'ylab topmaydi.
- **Xodim o'zi xarajat so'rovi kiritishi (§10)** — xarajat hozircha moliya huquqi bor xodim orqali kiritiladi (bo'lim
  limiti va tasdiq oqimi ishlaydi); har bir xodimga alohida so'rov formasi kerak bo'lsa — keyingi qadam.
- **Bir nechta filial uchun alohida katalog** — lavozimlar katalogi umumiy, bo'limlar filial bo'yicha.

## 5. Deploydan keyin qilinadigan ishlar

1. `db:sync-permissions` (deploy skriptida avtomatik) — yangi ruxsatlar va standart bo'lim/lavozimlar katalogi.
2. Rollar sahifasida Sotuv menejeri roliga `discount.grant` ni yoqish (eski ruxsat — avtomatik qo'shilmaydi).
3. Guli (qabulxona) rolida `complaint.create`/`complaint.view` borligini tekshirish (Admin rolida bor).
4. Lavozimlar katalogida karyera yo'llari (keyingi lavozim, eng kam KPI va muddat) va bo'limlarning oylik limitini kiritish.
5. Bilimlar bazasiga lavozim yo'riqnomalari va ichki qoidalarni joylash ("tanishish majburiy" bilan).

## 6. Texnik spetsifikatsiya bilan solishtirish (2026-11-05)

`ORG-SYSTEM-TECHNICAL-SPECIFICATION.md` §4–§12 kod bilan qayta tekshirildi. Spetsifikatsiya "mos model bo'lsa — kengaytirish" deydi:
Employee/User, Department, Position + PositionResponsibility, EmploymentHistory, KpiDefinition/KpiManualResult, maosh (mavjud payroll,
tasdiqlash va qulflash), EmployeeLeave + StaffPermissionRequest, Task, Complaint(+Event), Asset(+Event), KnowledgeArticle(+Version,
Acknowledgement), karyera (Position.nextPosition), audit log — hammasi mavjud. §9 bildirishnomalar (jumladan vazifa muddati yaqinlashdi,
choraklik baholash vaqti) va Telegram yetkazish navbati (qayta urinish bilan) bor. §10 — Tashkilot panelida 14 vidjetning hammasi.

Tuzatildi: Tashkilot panelidagi "To'lovlar va qarzdorlik" — qarz endi qarzdorlik sahifasi bilan bir xil ma'noda (muddati kelgan oy
majburiyatlari, `payments.dueDebt`), shartnoma qoldig'i alohida qator.

Farq: §5.8 `scope: own / department / all` umumiy maydon sifatida yo'q — filial doirasi, o'qituvchi o'z guruhlari va "o'zim" cheklovlari
ishlaydi. Bo'lim rahbari faqat o'z bo'limini ko'rishi kerak bo'lsa — alohida biznes qarori bilan qo'shiladi.
