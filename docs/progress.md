# Progress va mavzu o'zlashtirishi (PHASE 7)

TZ 3.0 §26–27. Progress endi faqat "74%" emas — kursning **har mavzusi** bo'yicha 0–100 baho,
holat va manbalar. Oylik snapshot trend va keyingi AI tahlili (PHASE 9) uchun tarix saqlaydi.

## 1. Model

`topic_mastery` (o'quvchi × mavzu, unique): `score` (0–100 yoki null), `status`
(`NOT_STARTED`, `LEARNING`, `PRACTICING`, `MASTERED`), manba baholari (`examScore`,
`homeworkScore`, `attendanceScore`, `lessonScore`), `evidence` (dalillar soni), `calculatedAt`.
Yozuv faqat dalil bo'lganda yaratiladi — yozuvsiz mavzu `NOT_STARTED` (bo'sh qatorlar yo'q).
Mavjud `student_topic_progress` (o'qituvchi "o'tildi" belgisi — qamrov) **o'zgarmadi**: u
"mavzu o'tildimi", mastery esa "o'quvchi qanchalik o'zlashtirdi".

## 2. Hisoblash

| Manba | Qanday | Standart og'irlik |
|---|---|---|
| Imtihon | baholangan urinishlarning mavzu kesimi; har imtihondan **oxirgi** baholangan urinish; bekor qilingan imtihon hisobga olinmaydi; ball — snapshotdagi | 50 |
| Uy vazifasi | mavzuli vazifa bali / maksimal ball; `MISSED` — 0 | 30 |
| Davomat | mavzu o'tilgan darslarda keldi/kechikdi ulushi; sababli — hisobga olinmaydi | 10 |
| Darslar (LMS) | mavzuning nashr qilingan darslaridan "o'rgandim" ulushi | 10 |

- **Baho faqat baholash dalili (imtihon yoki vazifa) bo'lsa** chiqadi. Faqat darsga kelgan yoki
  darsni o'qigan mavzu — `LEARNING`, bahosi yo'q (darsga kelish o'zlashtirish emas).
- Ma'lumoti yo'q manba og'irligi qayta normallashtiriladi (bo'sh manba bahoni tushirmaydi).
- Holat: baho ≥ `mastered` → MASTERED; ≥ `good` → PRACTICING; aks holda LEARNING.
- Daraja (ko'rsatish): < `developing` — Zaif, < `good` — Rivojlanmoqda, < `mastered` — Yaxshi, qolgani — O'zlashtirilgan.
- Sof formula: `combineScore`, `masteryStatus`, `masteryLevel` (`mastery.service.ts`, unit test bilan).

## 3. Qachon yangilanadi

Hooklar (asosiy amaldan keyin; xato bo'lsa amal to'xtamaydi, log qilinadi):

- imtihon urinishi baholandi (xodim kiritgan, kabinetdan topshirilgan, qo'lda baholangan);
- imtihon bekor qilindi yoki qayta tiklandi;
- mavzuli uy vazifasi baholandi yoki qaytarildi;
- mavzuli dars davomati belgilandi yoki seansga mavzu biriktirildi;
- o'quvchi darsni "o'rgandim" deb belgiladi.

**Tungi job** (`jobs/progress.job.ts`, 03:00 dan keyin, kuniga bir marta) barcha faol o'quvchilarni
to'liq qayta hisoblaydi — hook bo'lmagan holatlar (vazifa muddati o'tib `MISSED` bo'ldi, dars
arxivlandi) shu yerda tuzaladi. Dalili yo'qolgan mavzu o'chirilmaydi — `NOT_STARTED` bo'ladi.

## 4. Sozlamalar (§27: configurable)

`settings` jadvalida `mastery.settings`: chegaralar (standart 40/60/80) va og'irliklar.
O'zgartirish — `settings.manage` (Owner / Super Admin, boshqa chegaralar kabi). Chegara
o'zgarsa saqlangan holatlar **darhol** uch `updateMany` bilan qayta yoziladi; og'irlik o'zgarsa
baholar fon rejimida qayta hisoblanadi. Audit: `mastery.settings_updated` (oldin/keyin).

## 5. Oylik snapshot

`student_progress_snapshots` (mavjud jadval, endi yoziladi) + `masteryScore`, `topicsMastered`:
davomat %, vazifa topshirish %, imtihon o'rtachasi, XP, daraja, qarz qoldig'i, o'rtacha
o'zlashtirish. Joriy oy har kecha yangilanadi, o'tgan oy bir marta yakunlanadi.

## 6. API

| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/students/:id/mastery` | `student.view` + o'qituvchi faqat o'z guruhi |
| GET | `/students/:id/progress-history` | `student.view` + ko'rinish |
| GET | `/groups/:id/mastery` | `group.view` + o'qituvchi faqat o'z guruhi (begona — 404) |
| GET | `/mastery/settings` | `student.view` yoki `group.view` |
| PUT | `/mastery/settings` | `settings.manage` |
| GET | `/portal/mastery` | kabinet (o'zi / farzandi) — o'zlashtirish + 6 oylik tarix |

## 7. Interfeys

- O'quvchi profili → **O'zlashtirish** tabi: umumiy ko'rsatkich, modullar kesimida mavzular
  (baho, holat, manbalar), oylik jadval.
- Guruhlar → amallar → **O'zlashtirish**: o'quvchi × mavzu matritsasi, guruh o'rtachasi, Owner
  uchun "Chegaralar".
- Kabinet → **Progress** bo'limi (o'quvchi va ota-ona).
