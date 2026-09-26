# Uy vazifasi 2.0

> Academy CRM 3.0 — PHASE 5. TZ: `promt3.md` §15–20. Manba: `backend/src/services/homework.service.ts`, `rubric.service.ts`, `jobs/homeworkReminder.job.ts`; frontend `pages/homework/*`, `pages/portal/PortalHomeworkDetailPage.tsx`.

## 1. Vazifa (TZ §15)

| Maydon | Qayerda |
|---|---|
| Title, Description, Course, Group, Deadline, Maximum Score | mavjud edi |
| **Topic, Lesson** | `topicId`, `lessonId` — guruh kursiga tegishli bo‘lishi shart (aks holda 422) |
| **Difficulty** | EASY / MEDIUM / HARD |
| **Attachments** | `HomeworkAttachment` — fayl (PDF/rasm) yoki havola; o‘qituvchi "Batafsil" oynasida qo‘shadi |
| **Target** | `targetType`: GROUP / SELECTED / INDIVIDUAL + `studentIds` (guruhning faol a’zolari) |
| Rubrika | `rubricId` (ixtiyoriy) |

**Nishon = topshiriq yozuvlari.** GROUP — guruhning barcha faol o‘quvchisi va **keyin qo‘shilganlar** (`recordGroupChange` → `attachOpenGroupHomework`: faqat muddati o‘tmagan, butun guruhga berilgan vazifalar). SELECTED/INDIVIDUAL — faqat tanlanganlar. "Yangi vazifa" xabari faqat nishonga (§16).

## 2. Holatlar (TZ §17)

| TZ | Kodda | Qachon |
|---|---|---|
| NOT_STARTED | `PENDING` | yozuv ochildi |
| IN_PROGRESS | `IN_PROGRESS` | o‘quvchi qoralama saqladi yoki fayl qo‘shdi |
| SUBMITTED | `SUBMITTED` | o‘z vaqtida topshirdi |
| LATE | `LATE` | muddatdan keyin topshirdi |
| CHECKED | `GRADED` | ball qo‘yildi |
| RETURNED | `RETURNED` | o‘qituvchi izoh bilan qaytardi; qayta topshirish — `SUBMITTED` (kechikish hisoblanmaydi) |
| — | `MISSED` | muddat o‘tdi, umuman topshirilmadi (job); keyin topshirsa — `LATE` |

## 3. Topshirish (TZ §18)

Matn (≤ 2000), **havola** (faqat http/https), **kod** (≤ 20 000, til belgisi; bajarilmaydi, faqat ko‘rsatiladi), **bir nechta fayl** (≤ 5 ta, PDF/PNG/JPG/WEBP — mavjud fayl siyosati; boshqa format havola sifatida). Kamida bittasi bo‘lishi shart. Eski yagona fayl ustuni saqlangan, ma’lumot yangi jadvalga ko‘chirilgan (migration, o‘chirmasdan). Telegramdan topshirish ham shu servis orqali (TZ §44).

## 4. O‘qituvchi (TZ §19)

"Batafsil" → har o‘quvchi qatorida belgilar (matn/havola/kod/fayl soni) va **"Ko‘rish"**: javob, havola, kod (monospace), fayllar (yuklab olish), topshirilgan vaqti, **kechikdimi**. Amallar: **Baholash** (ball yoki rubrika), **Izoh**, **Qayta ishlashga qaytarish** (izoh majburiy; o‘quvchi va ota-onaga `HOMEWORK_RETURNED`). AI tahlili — PHASE 9 (tavsiya; yakuniy baho o‘qituvchida).

## 5. Rubrika (TZ §20)

`Rubric.criteria = [{key, title, weight}]`, og‘irliklar yig‘indisi **100%**, ≤ 10 mezon. Baholashda `rubricScores = {key: 0–100}` — **barcha** mezonlar shart; ball serverda: `round(Σ(weight × score)/100 / 100 × maxPoints)`. Rubrika umumiy (hamma tanlaydi), tahrirlash — muallif yoki admin; o‘chirilmaydi, faolsizlantiriladi. UI: Uy vazifalari → **Rubrikalar** (namuna: To‘g‘rilik 40, Kod sifati 20, Tushunish 20, To‘liqlik 10, Taqdimot 10).

## 6. Fon vazifasi

`jobs/homeworkReminder.job.ts` (30 daqiqa): muddatga ≤ 24 soat qolgan, topshirilmagan (PENDING/IN_PROGRESS/RETURNED) — `HOMEWORK_DEADLINE` bir marta (o‘quvchi + ota-ona); muddati o‘tgan PENDING/IN_PROGRESS → `MISSED`.

## 7. API

| Method | Endpoint | Ruxsat |
|---|---|---|
| POST | `/homework` `{…, targetType, studentIds, topicId, lessonId, difficulty, rubricId}` | homework.manage |
| GET | `/homework/:id/submissions/:studentId` | homework.view (o‘z guruhi) |
| GET | `/homework/:id/submissions/:studentId/files/:fileId` | homework.view |
| PATCH | `/homework/:id/submissions/:studentId` `{score | rubricScores, feedback}` | homework.grade |
| POST | `/homework/:id/submissions/:studentId/return` `{feedback}` | homework.grade |
| POST | `/homework/:id/attachments`, `/attachments/upload` | homework.manage |
| DELETE / GET | `/homework/attachments/:id`, `/download` | homework.manage / view |
| GET / POST / PUT | `/rubrics`, `/rubrics/:id` | homework.view / manage |
| PUT | `/portal/homework/:id/draft` | kabinet (o‘zi) |
| POST / DELETE / GET | `/portal/homework/:id/files(/:fileId)` | kabinet |
| GET | `/portal/homework/:id/materials/:attachmentId` | kabinet (nishondagi) |
| POST | `/portal/homework/:id/submit` `{answerText?, linkUrl?, codeText?, codeLanguage?}` | kabinet |

## 8. Testlar

`backend/tests/homeworkV2.test.ts` (8): nishon va xabarlar, keyin qo‘shilgan o‘quvchi, mavzu/dars bog‘lanishi, qoralama → 5 fayl → havola/kod → o‘qituvchi ko‘rishi (begona 404), qaytarish va qayta topshirish, rubrika (hisob, to‘liqlik, muallif), job (eslatma bir marta, MISSED → LATE), o‘qituvchi fayli/qoralama ko‘rinmasligi. Frontend: `PortalHomeworkDetailPage.test.tsx` (4). E2E: kabinetda topshirish.

## Takrorlanuvchi vazifa (3.1, GAP-18)

O'qituvchi/admin (`homework.manage`) guruh uchun **jadval** yaratadi — tizim har mos kuni oddiy vazifa beradi
(o'quvchi topshiriqlari, o'quvchi/ota-ona bildirishnomasi va Telegram — oddiy vazifa bilan **bitta funksiya**,
`createHomeworkInTransaction`).

| Maydon | Qiymat |
|---|---|
| Takrorlanish | har kuni (`DAILY`) · tanlangan kunlar (`WEEKDAYS`, masalan Du–Ju) · haftada bir marta (`WEEKLY`, bitta kun) |
| Oraliq | boshlanish (majburiy) — tugash (ixtiyoriy, ≤ 400 kun) |
| E'lon vaqti | `HH:mm` (standart 08:00) — shundan keyin beriladi |
| Muddat | `HH:mm` + necha kundan keyin (0–14); 0 kun bo'lsa muddat e'londan keyin bo'lishi shart |

Misol: *Frontend A · ish kunlari · "JavaScript Practice" · e'lon 08:00 · muddat o'sha kuni 23:59*.

**Generator** (`jobs/recurringHomework.job.ts`, har 15 daqiqa, `recurringHomeworkService.generate`): faqat **bugungi**
(o'quv markaz sanasi) takrorlanish — e'lon vaqti kelgan, guruh faol, jadval faol va oraliqda, muddat hali o'tmagan.
Server o'chiq bo'lgan kunlar orqaga to'ldirilmaydi (muddati o'tgan vazifa berilmaydi). Jadval yaratilganda bugun ham
mos bo'lsa — darhol beriladi.

**Dublikatdan himoya:** `homework (recurringHomeworkId, occurrenceDate)` — unikal indeks. Qayta yurish, bir nechta
server nusxasi yoki parallel job — P2002, o'tkazib yuboriladi (test: uch parallel yurish → bitta vazifa).

**Tahrir va o'chirish:** tahrir keyingi takrorlanishlarga ta'sir qiladi; "To'xtatish/Davom ettirish"; jadval
o'chirilsa berilgan vazifalar qoladi (bog'lanish uziladi). Doira — oddiy vazifa kabi: o'qituvchi faqat o'z guruhlari.
Audit: `homework.recurring_created/updated/deleted`, har berilgan vazifa — `homework.created` (tizim nomidan).

API: `GET/POST /api/homework/recurring`, `PATCH/DELETE /api/homework/recurring/:id`. Web: "Uy vazifalari" →
"Takrorlanuvchi". Testlar: `tests/recurringHomework.test.ts` (§40), `RecurringHomeworkModal.test.tsx`, E2E §40.
