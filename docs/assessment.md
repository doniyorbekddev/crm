# Assessment 2.0 — imtihonlar, savollar banki, onlayn topshirish

TZ 3.0 §21–25 (PHASE 6). Mavjud imtihon dvigateli (savollar bazasi, xodim kiritadigan urinishlar,
mavzular kesimi, `ExamResult`) **o'zgarmadi** — yangi qism uning ustiga qurildi. Natija baribir
`ExamResult` ga yoziladi, shuning uchun hisobotlar, XP va analitika avvalgidek ishlaydi.

## 1. Imtihon turlari (§21)

`Exam.type`: `DAILY_QUIZ`, `WEEKLY_TEST`, `MONTHLY_EXAM` (standart — eski imtihonlar shu turda),
`MIDTERM`, `FINAL`, `PRACTICE`, `DIAGNOSTIC`. Ro'yxatda tur va "Onlayn" belgisi ko'rinadi.

## 2. Savollar banki (§22)

| Tur | Baholash | Izoh |
|---|---|---|
| `SINGLE_CHOICE` | avtomatik | aynan bitta to'g'ri variant |
| `MULTIPLE_CHOICE` | avtomatik | to'plam **aynan** mos kelsa to'liq ball, aks holda 0 |
| `TRUE_FALSE` | avtomatik | aynan 2 variant ("To'g'ri"/"Noto'g'ri"), tartibi aralashtirilmaydi |
| `SHORT_TEXT` | avtomatik + o'qituvchi | `acceptedAnswers` dan biriga mos (katta-kichik harf, ortiqcha bo'shliq, apostrof turlari hisobga olinmaydi) — to'liq ball; mos kelmasa **o'qituvchi ko'radi** (sinonim bo'lishi mumkin); bo'sh — 0 |
| `TEXT` (eski) | o'qituvchi | avvalgidek |
| `LONG_TEXT` | o'qituvchi | esse |
| `CODE` | o'qituvchi | matn sifatida saqlanadi va ko'rsatiladi, **bajarilmaydi** |
| `FILE_UPLOAD` | o'qituvchi | PDF/JPG/PNG/WEBP (mavjud fayl siyosati, turi baytlar bo'yicha) |

Qo'lda baholanadigan savolga javob berilmasa — 0 ball va tekshiruv talab qilinmaydi.
Qo'shimcha maydonlar: `explanation` (natija e'lon qilingach o'quvchiga), `tags[]`,
`acceptedAnswers[]` (faqat xodimga qaytariladi).

**Qisman ball yo'q** — TZ talab qilmaydi, mavjud siyosat (aniq moslik) saqlandi. Baholash qoidasi
bitta joyda: `gradeAnswer()` (`examAttempt.service.ts`) — xodim kiritgan va o'quvchi topshirgan
urinishlar uchun bir xil.

## 3. Blueprint va tasodifiy variant (§23–24)

`Exam.blueprint` (JSON):

```json
{ "total": 50,
  "topics": [{ "topicId": "…", "percent": 20 }, …],
  "difficulty": { "EASY": 30, "MEDIUM": 50, "HARD": 20 } }
```

- Ulushlar yig'indisi 100%, mavzular takrorlanmaydi va imtihon kursiga tegishli bo'ladi.
- Taqsimlash **ikki bosqichli** "eng katta qoldiq" usuli: avval mavzular (ulush aniq saqlanadi),
  keyin har mavzu ichida qiyinlik. Masalan 50 savol → Easy 15 / Medium 25 / Hard 10.
- Katakda savol yetmasa to'ldirish tartibi: shu mavzu boshqa qiyinlik → shu qiyinlik boshqa mavzu →
  blueprint mavzularidan istalgani. Umuman yetmasa — aniq xato (`Savollar yetarli emas: 12 ta bor, 20 ta kerak`).
- Tasodif — `crypto.randomInt` (taxmin qilib bo'lmaydi). Har o'quvchi **boshlaganda** o'z varianti.
- Urinishlar boshlangach blueprintni o'zgartirib bo'lmaydi.
- `POST /exams/blueprint/preview` — saqlashdan oldin kataklar bo'yicha "kerak / bor" va `feasible`.

Sof funksiyalar: `services/examBlueprint.ts` (DB'siz, unit test bilan).

## 4. Xavfsizlik va snapshot (§25)

| Sozlama | Maydon |
|---|---|
| Davomiylik | `durationMinutes` (bor edi) |
| Urinishlar | `maxAttempts` (0 — cheklanmagan) |
| Oyna | `startAt`, `endAt` (ikkalasi ixtiyoriy, `startAt < endAt`) |
| Tasodifiy savollar | `blueprint` |
| Savol tartibi | `shuffleQuestions` (blueprint bo'lsa doim aralash) |
| Variant tartibi | `shuffleOptions` (TRUE_FALSE bundan mustasno) |
| Onlayn | `isOnline` — faqat shunday imtihonni o'quvchi kabinetdan topshiradi |

**Snapshot** — `attempt_questions` jadvali: boshlanganda har savolning matni, turi, variantlar
**tartibi**, bali, mavzusi, tushuntirishi va javob kaliti (`answerKey`) muzlatiladi. Savol keyin
tahrirlansa ham urinish, baholash va xodim ko'rinishi boshlangandagi holat bo'yicha bo'ladi.

**Muddat** = min(boshlangan + davomiylik, `endAt`). Muddat o'tsa urinish saqlangan javoblar bilan
avtomatik yakunlanadi: o'quvchi sahifani ochganda/javob yuborganda, va har daqiqada
`jobs/examAttempt.job.ts` (tashlab ketilgan urinishlar). Muddatdan keyin yuborilgan javob qabul
qilinmaydi (422). Audit: `exam.attempt_started`, `exam.attempt_submitted` (`reason: submitted|timeout`).

## 5. O'quvchi oqimi (kabinet)

```
/portal/exams → "Onlayn imtihonlar" → Boshlash → /portal/attempts/:id
  savollar (kalitsiz) → avtosaqlash (variant — darhol, matn — yozish to'xtagach)
  → Topshirish (javobsizlar soni bilan tasdiqlash) → natija
```

- Natija: GRADED bo'lsa — ball, o'tdi/o'tmadi, to'g'ri variantlar, tushuntirish, o'qituvchi izohi.
  NEEDS_REVIEW — "O'qituvchi tekshirmoqda", to'g'ri javoblar baholangandan keyin ko'rinadi.
- Sahifa yopilsa/yangilansa — "Davom ettirish" o'sha urinishni ochadi (javoblar serverda).
- Ota-ona ro'yxatni ko'radi, lekin **boshlay/javob bera olmaydi** (403); tugallanmagan urinishni
  ko'rmaydi, yakunlanganini ko'radi.

## 6. O'qituvchi oqimi

- Imtihon formasi: tur, "Onlayn topshirish", oyna, aralashtirish, blueprint muharriri + "Bankni tekshirish".
- Savol formasi: yangi turlar, qabul qilinadigan javoblar, tushuntirish, teglar.
- "Savollar va tahlil" → NEEDS_REVIEW urinishda **Baholash** tugmasi: esse/kod matni, faylni yuklab
  olish, ball (0…savol bali) va izoh. Hammasi baholangach urinish GRADED, natija `ExamResult` ga,
  o'quvchi/ota-onaga bildirishnoma (mavjud `notifyExamResultForAttempt`).
- O'qituvchi faqat o'z guruhi urinishlari va fayllarini ko'radi (`teachingAccess`), begonasi — 404.

## 7. API

| Metod | Yo'l | Ruxsat | Vazifa |
|---|---|---|---|
| POST | `/exams/blueprint/preview` | `exam.manage` | `{groupId, blueprint}` → kataklar, `poolSize`, `feasible`, `message` |
| GET | `/exams/attempts/:id/answers/:answerId/file` | `exam.view` | fayl javobi (o'z guruhi) |
| GET | `/portal/exams/available` | `portal.*` | onlayn imtihonlar: oyna, urinishlar, `canStart`/`reason`, ochiq urinish, oxirgi natija |
| POST | `/portal/exams/:id/start` | faqat o'quvchi | boshlash yoki ochiq urinishni davom ettirish |
| GET | `/portal/attempts/:id` | `portal.*` | urinish (kalitsiz; yakunlangach — natija) |
| PUT | `/portal/attempts/:id/answers/:questionId` | faqat o'quvchi | avtosaqlash `{optionIds?}` yoki `{text?}` |
| POST | `/portal/attempts/:id/answers/:questionId/file` | faqat o'quvchi | FILE_UPLOAD (xom tana) |
| POST | `/portal/attempts/:id/submit` | faqat o'quvchi | topshirish |

Kengaygan (moslik saqlangan): `POST/PUT /exams` (+type, isOnline, startAt, endAt, shuffle*,
blueprint), `POST/PUT /questions` (+yangi turlar, explanation, tags, acceptedAnswers), urinish DTO
(+`questionType`, `hasFile`; savol matni/bali snapshotdan).

Alohida `exam.start` ruxsati **qo'shilmadi**: `portal.student` + egalik (`requireOwnStudent`,
o'quvchi guruhi) yetarli va rollar matritsasini murakkablashtirmaydi.

## 8. Keyingi bosqichlarda

- Telegram botda onlayn imtihon (§43 "Online Exam") — PHASE 11.
- `EXAM_SCHEDULED` bildirishnomasi — PHASE 10.
- Mavzu bo'yicha mastery (imtihon mavzu kesimi manba sifatida) — PHASE 7.
