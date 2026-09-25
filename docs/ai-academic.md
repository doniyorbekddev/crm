# AI akademik markaz (PHASE 9)

TZ 3.0 §30–41, §58–61. AI **yakuniy hakam emas** — u faktlarni yig'adi, tushuntiradi va taklif
beradi; baho, reja va xulosani o'qituvchi tasdiqlaydi.

## 1. Ikki rejim

| Rejim | Qachon | Nima qiladi |
|---|---|---|
| **Qoidalar** (`RULES`) | `ANTHROPIC_API_KEY` yo'q (standart), model xato berdi yoki javob sxemaga mos kelmadi | Faktlar, 5 ball, kuzatuv va tavsiyalar CRM raqamlaridan kod bilan; kod tekshiruvi va o'xshashlik — lokal; vazifaga ball **taklif qilinmaydi** |
| **Model** (`LLM`) | kalit berilgan | Faktlar o'sha-o'sha (kod bilan); model faqat kuzatuv, tavsiya va xulosa matnini yozadi, vazifaga mezonlar va taklif balli beradi; yordamchida kalit so'z topilmasa niyatni aniqlaydi |

Sozlash: `backend/.env` → `ANTHROPIC_API_KEY`, `AI_MODEL` (standart `claude-sonnet-5`),
`AI_TIMEOUT_MS`. Holat: `GET /api/ai/academic/status` → `{ llm, mode }`.
Testlarda haqiqiy API hech qachon chaqirilmaydi (`setLlmClient` bilan soxta klient).

## 2. Xavfsizlik (§58–60)

- **Whitelist**: model bazaga tegmaydi, SQL yo'q. Ma'lumot faqat mavjud servislar orqali: risk
  engine, mastery, o'qituvchi markazi, vazifa servisi — hammasi o'qituvchi doirasida (o'z guruhi).
- **Maxfiylik**: modelga ism, familiya, telefon, to'lov summasi yuborilmaydi (testda tekshiriladi).
  Vazifa tekshiruvida faqat topshiriq sharti va o'quvchi javobi (matn/kod) yuboriladi. Log'ga
  prompt yozilmaydi — faqat maqsad, model, tokenlar, davomiylik.
- **Gallyutsinatsiya nazorati**: har natija `FACT / OBSERVATION / RECOMMENDATION` bandlariga
  bo'lingan. FACT faqat kod bilan yoziladi; model javobi zod-sxema bilan tekshiriladi (masalan taklif
  balli ≤ maksimal ball) — mos kelmasa qoidalar natijasi qoladi.
- **Deterministik risk o'zgarmaydi** (§32): AI tahlili riskni fakt sifatida keltiradi, `riskLevel` ga yozmaydi.
- Ruxsat: `ai.academic` (o'qituvchi, admin, owner). Yangi tahlil yaratish rate-limit bilan.
  Audit: `ai.analysis_created / accepted / rejected`.

## 3. Imkoniyatlar

| TZ | Imkoniyat | Qayerda |
|---|---|---|
| §32–33 | **O'quvchi tahlili**: akademik, davomat, faollik, vazifa, baholash (0–100); risk; sabablar trend bilan ("Davomat (30 kunlik): 92% → 74%", "Imtihon: 84% → 62%", "Oxirgi faollik: 4 kun oldin") | Profil → **AI tahlil** |
| §34–35 | **Vazifa tekshiruvi**: to'g'rilik, to'liqlik, sifat, tushunish, xatolar, tavsiyalar, **taklif balli**; kod: xavfsizlik (`eval`, `innerHTML`), best practice (`var`, `==`), accessibility (`alt`), tugallanmaganlik (`TODO`) | Topshiriq oynasi → **AI tekshiruv**: *Qabul qilish* / *Ballni tahrirlash* / *Qayta ishlashga qaytarish* |
| §36 | **O'xshashlik signali**: so'z 5-gram Jaccard ≥ 60% yoki bir xil havola — "Yuqori o'xshashlik aniqlandi (signal, hukm emas)" | AI tekshiruv, `GET /ai/academic/homework/:id/similarity` |
| §37 | **O'qituvchi yordamchisi**: yordamga muhtojlar, zaif mavzular, eng qiyin vazifa, natijasi pasayayotganlar | **AI yordamchi** (o'qituvchiga ham ochildi) |
| §38 | **Guruh tahlili**: kuchli/zaif mavzular, davomat/vazifa/imtihon/progress, tavsiya etilgan amallar | O'qituvchi markazi → guruh → **AI tahlil** |
| §39 | **Rahbar yordamchisi**: bugungi muammolar, xavfdagi guruhlar, akademik natijasi pasaygan kurslar, dropout, zaif mavzular, yordam kerak bo'lgan o'qituvchi (signal, baho emas) | **AI yordamchi** |
| §40 | **Ota-ona xulosasi**: haftalik hisobotga yumshoq tavsiyalar (doim) va model bo'lsa iliq matn (hafta bo'yicha keshlanadi) | Kabinet va Telegram haftalik hisoboti |
| §41 | **Remedial reja**: zaif mavzu → dars → qoralama vazifa → onlayn quiz (bankdan, 2 urinish = qayta test) → mastery avtomatik yangilanadi; **o'qituvchi tasdiqlaydi** | Guruh AI tahlili → *Remedial reja* → *Tasdiqlash / Rad etish* |

## 4. Model

`ai_analyses`: `kind` (STUDENT, GROUP, HOMEWORK_REVIEW, PARENT_SUMMARY, REMEDIAL), `subjectType/Id`,
`periodKey` (hafta), `status` (READY / ACCEPTED / REJECTED), `source` (RULES / LLM), `summary`,
`result` (JSON: ballar, bandlar, turga xos maydonlar), `model`, tokenlar, kim yaratdi / kim qaror
qildi, `decision` (qabul qilingan ball, yaratilgan vazifa/imtihon).

## 5. API (`/api/ai/academic`, `ai.academic`)

| Metod | Yo'l | Vazifa |
|---|---|---|
| GET | `/status` | rejim |
| GET / POST | `/students/:id` | oxirgi / yangi o'quvchi tahlili |
| GET / POST | `/groups/:id` | oxirgi / yangi guruh tahlili |
| GET / POST | `/submissions/:homeworkId/:studentId` | oxirgi / yangi vazifa tekshiruvi |
| GET | `/homework/:id/similarity` | o'xshash juftliklar |
| POST | `/remedial` | `{groupId, topicId, studentIds?}` → reja taklifi |
| POST | `/analyses/:id/accept` | vazifa: `{score?, feedback?}` → baho qo'yiladi; remedial → vazifa + quiz yaratiladi |
| POST | `/analyses/:id/reject` | rad etish |

`POST /api/ai/ask` endi `ai.assistant` **yoki** `ai.academic` bilan ishlaydi; har tool o'z
ruxsatini tekshiradi (o'qituvchi moliya savoliga javob olmaydi, model ruxsatsiz toolni tanlasa ham).
