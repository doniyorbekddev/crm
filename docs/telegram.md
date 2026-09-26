# Telegram bot — to'liq ko'rinish (Telegram 2.0)

Bot CRM backend ichidagi modul (`backend/src/telegram`). U **yangi biznes-mantiq yozmaydi**:
har bir amal CRM servisini `scope.actor` (xodim) yoki bog'langan o'quvchi/ota-ona nomidan
chaqiradi — ruxsat, doira (o'qituvchi faqat o'z guruhi, filial) va audit web bilan bir xil.

Batafsil: [arxitektura](telegram-architecture.md) · [xavfsizlik](telegram-security.md) ·
[deploy](telegram-deployment.md) · [dastlabki audit](TELEGRAM-BOT-AUDIT.md).

## 1. Imkoniyatlar (rol bo'yicha)

Menyu **ruxsatga qarab** quriladi — ruxsat bo'lmasa tugma chiqmaydi, callback qo'lda yuborilsa ham
handler qayta tekshiradi.

| Kim | Bo'lim | Buyruq | Ruxsat |
|---|---|---|---|
| O'quvchi / ota-ona | Profil, dars jadvali, davomat, vazifa (topshirish, fayl), imtihon natijalari, XP, to'lovlar, sertifikat, haftalik hisobot, do'st taklifi | `/profil` `/darslar` `/davomat` `/vazifa` `/imtihon` `/xp` `/qarz` `/sertifikat` `/hisobot` `/taklif` | bog'lanish |
| O'quvchi | **Onlayn imtihon** (3.1): ro'yxat → tafsilot (savollar, vaqt, urinishlar, oyna) → boshlash → **tasdiq** → savollar; `⬅️ Oldingi` `➡️ Keyingi` `💾 Saqlash` `🏁 Tugatish`; variant (bitta/ko'p), matn va fayl javob (CRM xotirasiga), qolgan vaqt serverdan, natija | `/onlayn` | faqat o'quvchining o'zi; har callbackda urinish egasi, holati, imtihon holati, o'quvchi faolligi va guruhi qayta tekshiriladi |
| Hamma | **Sozlamalar** — eslatmalarni to'xtatish/yoqish (ovozsiz rejim), farzand tanlash, uzish; xodim — tur bo'yicha Telegram xabarlari | `/sozlamalar` | bog'lanish |
| O'qituvchi | Bugungi darslar, guruhlar, davomat varag'i; **vazifa berish** (3.1): guruh → sarlavha → tavsif → muddat → fayl (PDF/rasm, 5 tagacha — qabul qilingan zahoti tekshiriladi va CRM xotirasiga saqlanadi) → tasdiq → e'lon (qoralama → fayllar → e'lon; fayl xatosida qoralamada qoladi) | `/bugun` `/guruhlar` | `attendance.mark`; vazifa — **`homework.manage`** (har qadamda, REST bilan bir xil) |
| O'qituvchi | **KPI** — guruhlar: davomat, vazifa, imtihon, progress, xavf, kutilayotgan ishlar | `/kpi` | `attendance.mark` |
| O'qituvchi | **Tekshirish** — navbat, javob matni/kod/havola, o'quvchi fayllari, baho (`85 izoh`), qaytarish, **AI tekshiruv** va qabul qilish | `/tekshirish` | `homework.grade` (+`ai.academic`) |
| Sotuv | Leadlar, qizigan leadlar, status, follow-uplar; **qo'ng'iroq yozish** (3.1): tur (chiquvchi/kiruvchi) → natija (`CallResult`) → davomiylik (tugma yoki daqiqa; javob bo'lmasa o'tkaziladi) → izoh → keyingi qadam (ertaga 10:00 / 3 kun — `nextCallAt`, yoki follow-up); **follow-up yaratish** (3.1): sana va vaqt (tayyor tugma yoki yoziladi) → izoh → muhimlik (past/o'rta/yuqori/shoshilinch); **eslatma** muddatdan 30 daqiqa oldin ilovada va Telegramda (NotificationDelivery navbati, qayta urinish; tur sozlamasi va "ovozsiz" rejim hurmat qilinadi) | `/leadlar` `/followup` | har amal REST bilan bir xil: `lead.view`, `lead.update` (status), `call.create`, `followup.view/create/update` — tugmada va matnli qadamda |
| Rahbar | Ko'rsatkichlar, qarzdorlar, xavf ostidagilar, ogohlantirishlar | `/panel` `/qarzdorlar` | tegishli ruxsatlar |
| Rahbar | **Hisobotlar** (joriy oy KPI) | `/hisobotlar` | `report.view` + hisobot turiga qo'shimcha ruxsat (web bilan bitta ro'yxat) |
| Rahbar | **Marketing** — kanallar: lead, konversiya, xarajat, ROI | `/marketing` | `analytics.view` |
| Admin | Ommaviy xabar — **matn yoki rasm/hujjat + izoh** | `/xabar` | `broadcast.send` |
| Xodim | **Qidiruv** — global qidiruv (natijalar ruxsatga qarab), CRM havolasi bilan | `/qidir` | har guruh o'z ruxsati bilan |
| Xodim | AI yordamchi (biznes va akademik savollar) | `/ai` | `ai.assistant` yoki `ai.academic` |

## 2. Web ↔ Telegram izchilligi (§44)

| Jarayon | Umumiy servis | Natija |
|---|---|---|
| Vazifa topshirish | `homeworkService.submitByStudent / addStudentFile` | botda topshirilgan — kabinetda va o'qituvchida ko'rinadi, aksincha ham |
| Vazifani baholash / qaytarish | `homeworkService.grade / returnSubmission` | botda qo'yilgan baho — web'da, xabar o'quvchi/ota-onaga |
| Onlayn imtihon | `examTakingService` | botda boshlangan urinish kabinetda davom etadi (bitta urinish, bitta snapshot) |
| Qo'ng'iroq, follow-up | `callService`, `followUpService` | CRM lead kartasida, faollik tarixida, eslatmalarda |
| Broadcast | `broadcastService` | web va bot bitta tarix |
| Bildirishnoma sozlamalari | `notificationService.saveSettings` | web "Sozlamalar" bilan bir xil |

## 3. Texnik eslatmalar

- `callback_data` ≤ 64 bayt: savol/variant **indeksi** yuboriladi, urinish id sessiyada; har
  bosishda server holati qayta o'qiladi.
- Broadcast media: xodim yuborgan fayl `file_id` orqali qayta yuboriladi (qayta yuklanmaydi);
  izoh 1024 belgidan uzun bo'lsa — alohida xabar.
- Ovozsiz rejim (`telegram_links.muted`): avtomatik eslatmalar navbatga qo'yilmaydi; markazning
  ommaviy e'lonlari baribir keladi.
- O'quvchi fayllari o'qituvchiga CRM'dagi saqlangan fayldan yuboriladi (multipart).
- Tuzatilgan xato: broadcast matni ikki marta HTML-escape qilinardi (`&amp;lt;`).
