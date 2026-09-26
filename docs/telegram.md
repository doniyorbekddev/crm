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
| Hamma | **Sozlamalar** — eslatmalarni to'xtatish/yoqish (ovozsiz rejim), farzand tanlash, uzish; **toifalar** (3.1): 📚 davomat, 💳 to'lov, 📝 vazifa, 🎯 imtihon, 🏆 yutuqlar, 📣 marketing, ⚙️ tizim — ✅/◐/⬜️, bosilsa yoqiladi/o'chiriladi; xodim — toifa ichida turlar ham. Kabinet hisobi bor o'quvchi/ota-ona — o'z hisobining sozlamasi (web bilan bitta); hisobsiz chat — faqat ovozsiz rejim | `/sozlamalar` | bog'lanish; xodim — faqat ruxsatidagi turlar; hisob — chat bog'langan yozuvdan (callback'dan emas) |
| O'qituvchi | Bugungi darslar, guruhlar, davomat varag'i; **vazifa berish** (3.1): guruh → sarlavha → tavsif → muddat → fayl (PDF/rasm, 5 tagacha — qabul qilingan zahoti tekshiriladi va CRM xotirasiga saqlanadi) → tasdiq → e'lon (qoralama → fayllar → e'lon; fayl xatosida qoralamada qoladi) | `/bugun` `/guruhlar` | `attendance.mark`; vazifa — **`homework.manage`** (har qadamda, REST bilan bir xil) |
| O'qituvchi | **KPI** — guruhlar: davomat, vazifa, imtihon, progress, xavf, kutilayotgan ishlar | `/kpi` | `attendance.mark` |
| Rahbar | **O'qituvchilar KPI** (3.1): ro'yxat (guruh, o'quvchi, davomat, vazifa, imtihon, progress) → o'qituvchini tanlash → tafsilot (+ retention, fikr-mulohaza, xavf, baholash navbati, guruhlar kesimi). Raqamlar web "Akademik analitika" (o'qituvchi kesimi) bilan bitta servisdan — botda hisob-kitob yo'q | `/kpi` | `analytics.view` + `group.manage` (barcha guruhlar); faqat `analytics.view` yoki `attendance.mark` — o'z guruhlari; boshqa rol — rad |
| O'qituvchi | **Tekshirish** — navbat, javob matni/kod/havola, o'quvchi fayllari, baho (`85 izoh`), qaytarish, **AI tekshiruv** va qabul qilish | `/tekshirish` | `homework.grade` (+`ai.academic`) |
| Sotuv | Leadlar, qizigan leadlar, status, follow-uplar; **qo'ng'iroq yozish** (3.1): tur (chiquvchi/kiruvchi) → natija (`CallResult`) → davomiylik (tugma yoki daqiqa; javob bo'lmasa o'tkaziladi) → izoh → keyingi qadam (ertaga 10:00 / 3 kun — `nextCallAt`, yoki follow-up); **follow-up yaratish** (3.1): sana va vaqt (tayyor tugma yoki yoziladi) → izoh → muhimlik (past/o'rta/yuqori/shoshilinch); **eslatma** muddatdan 30 daqiqa oldin ilovada va Telegramda (NotificationDelivery navbati, qayta urinish; tur sozlamasi va "ovozsiz" rejim hurmat qilinadi) | `/leadlar` `/followup` | har amal REST bilan bir xil: `lead.view`, `lead.update` (status), `call.create`, `followup.view/create/update` — tugmada va matnli qadamda |
| Rahbar | Ko'rsatkichlar, qarzdorlar, xavf ostidagilar, ogohlantirishlar | `/panel` `/qarzdorlar` | tegishli ruxsatlar |
| Rahbar | **📊 Kunlik hisobot** (3.1): faol o'quvchilar, bugungi leadlar, bugungi va oylik tushum, qarz, davomat (bugun + 30 kun), vazifa %, imtihon o'rtachasi, xavf ostidagilar — web "Direktor paneli" servislaridan (`executiveService`, `academyOverviewService`) | `/kunlik` (yoki Hisobotlar ichida) | `analytics.view` |
| Rahbar | **Hisobotlar** (3.1): web'dagi barcha 15 tur (sotuv, menejerlar, to'lovlar, qarz, kirim, xarajat, foyda, maosh, davomat, o'quvchilar oqimi, kurslar, guruhlar, o'qituvchilar, manbalar, reyting); davr (bu oy / o'tgan oy / 30 kun), KPI va birinchi 5 qator; **📄 CSV** — chatga hujjat (REST eksport bilan aynan bir xil fayl) | `/hisobotlar` | `report.view` + hisobot turiga qo'shimcha ruxsat (web bilan bitta ro'yxat); CSV — `+ report.export` |
| Rahbar | **Marketing** (3.1) — davr (bu oy / o'tgan oy / 30 kun); jami va har manba: lead → o'quvchi, konversiya, tushum, xarajat, foyda, ROI; manbaga bog'lanmagan reklama xarajati; **📄 CSV** — chatga hujjat (web eksport bilan bir xil fayl). Kesim — manba (Campaign modeli yo'q). Raqamlar web "Analitika → Lead manbalari" servisidan | `/marketing` | `analytics.view`; CSV — `+ report.export` |
| Admin | Ommaviy xabar — **matn yoki rasm/hujjat + izoh**, **🔗 havola tugmalari** (3.1: `Matn \| https://…`, 3 tagacha), oldindan ko'rish, tasdiq, tarix va statistika (mo'ljal/yuborildi/yetmadi); web'da ham — "Ommaviy xabar" sahifasi ([broadcast.md](broadcast.md)) | `/xabar` | `broadcast.send` |
| Xodim | **Qidiruv** — web global qidiruvi bilan bitta servis (`searchService.search`): o'quvchi ID (`ST-45`), ism, telefon, guruh, kurs, lead ID (`L-12`), sertifikat, **to'lov** (kvitansiya `PM-7` yoki o'quvchi ismi/telefoni — 3.1), CRM havolasi bilan. Doira (3.1): o'qituvchi — faqat o'z guruhlari, o'quvchilari va ularning sertifikatlari (audit S2); sotuv — o'z/biriktirilmagan leadlar; `branch.view_all` siz xodim — faqat o'z filiali (lead, o'quvchi, ota-ona, guruh, to'lov, tranzaksiya, xodim, sertifikat, vazifa, imtihon — audit S3) | `/qidir` | har bo'lim o'z ruxsati bilan |
| O'quvchi / ota-ona | **Qidiruv** (3.1) — faqat o'z (ota-ona — tanlangan farzand) ma'lumoti: vazifa, imtihon, dars, sertifikat, to'lov (`PM-7`); web kabinet qidiruvi bilan bitta servis (`searchService.portal`) | `/qidir` | doira `scope.studentIds` dan (callback/matnga ishonilmaydi) |
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
