# Qidiruv va akademik analitika (PHASE 12)

TZ 3.0 §45–49.

## 1. Qidiruv (§45)

| Kim | Nimani topadi | Qayerda |
|---|---|---|
| Kabinet (o'quvchi) | o'z vazifalari, imtihonlari, kursidagi nashr qilingan darslar, sertifikatlari | kabinet → **Qidirish** |
| Kabinet (ota-ona) | yuqoridagilar (tanlangan farzand bo'yicha) + farzandlari | kabinet → **Qidirish** |
| O'qituvchi | o'quvchilar (o'z guruhlari), **vazifalar**, **imtihonlar** (o'z guruhlari) | Ctrl+K |
| Manager | leadlar, o'quvchilar | Ctrl+K |
| Owner / admin | global (hamma guruhlar, ruxsatga qarab) | Ctrl+K |

Mavjud global qidiruv qayta ishlatildi (`search.service`); kabinet uchun `searchService.portal` —
egalik `portal.service` da (`requireOwnStudent`, begona `studentId` — 403). Natija havolalari
kabinetda kabinet sahifalariga olib boradi. Frontend'dagi `GlobalSearch` komponenti ikkala joyda
ham ishlatiladi (qidiruv funksiyasi prop sifatida).

Tuzatilgan xato: frontend'da `certificates` guruhi uchun ikonka yo'q edi — sertifikat topilganda
qidiruv oynasi yiqilishi mumkin edi; endi noma'lum guruh ham xavfsiz ko'rsatiladi.

## 2. Akademik analitika (§46–49)

`GET /api/analytics/academic?dimension=&from=&to=&courseId=&groupId=` — rahbar (`analytics.view`,
filial doirasida) yoki o'qituvchi (`attendance.mark`, faqat o'z guruhlari). Standart davr — oxirgi 30 kun,
eng ko'pi 1 yil.

| Kesim | Ko'rsatkichlar |
|---|---|
| Kurs | o'quvchilar, davomat, vazifa topshirish, o'rtacha ball, imtihon, o'zlashtirish, progress, retention, xavf ostida, **zaif mavzular** (§47) |
| Guruh | + o'quvchi fikri o'rtachasi; **taqqoslash grafigi** (§48) |
| O'qituvchi | guruhlar, davomat, vazifa, imtihon, progress, retention, o'quvchi fikri (§49) |
| Mavzu | o'rtacha o'zlashtirish, baholangan o'quvchilar, o'zlashtirganlar ulushi |
| Vazifa | topshirish %, o'rtacha ball, kech %, topshirilmagan % |
| Imtihon | qatnashchilar, o'rtacha %, o'tganlar % |
| O'quvchi | shaxsiy ko'rsatkichlar |

Hisob qoidalari:

- **Yig'ma foiz**: jami qatnashish / jami belgi (sababli hisobga olinmaydi) — kichik guruh natijani buzmaydi.
- **Progress** — dastur bajarilishi: tugatilgan mavzular / kursdagi faol mavzular.
- **Retention** — davr oxirida o'qiyotganlar / (o'qiyotganlar + davrda o'qishni tashlaganlar).
- **Xavf ostida** — tungi risk hisobidagi AT_RISK + CRITICAL.
- **Kuzatuvlar** (guruh/o'qituvchi) — faqat raqamli o'zgarish, oldingi teng davr bilan, ≥10 punkt:
  "Front-A: davomat 100% → 50% (pasaydi)". Baho, "yaxshi/yomon o'qituvchi" xulosasi yo'q; saralash —
  faqat tavsif (sahifada shunday yozilgan).

Sahifa: **O'quv jarayoni → Akademik analitika** (`/academic-analytics`): kesim tablari, davr, saralash,
taqqoslash grafigi, CSV eksport (umumiy `lib/csv.ts`).

Indekslar: `homework_submissions(homeworkId, status)`, `topic_mastery(topicId, score)`.
