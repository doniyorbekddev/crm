# Telegram bot — arxitektura

> Audit: [TELEGRAM-BOT-AUDIT.md](TELEGRAM-BOT-AUDIT.md) · TZ: `telegramBot.md`
> Holat: **PHASE 1–12 bajarildi** — poydevor, bog'lash xavfsizligi, o'quvchi/ota-ona, o'qituvchi, sotuv, rahbar, bildirishnomalar, ommaviy xabar, to'lov tugmasi, do'st taklifi, AI yordamchi. Qoldi: 13–15 (xavfsizlik auditi, yuklama, production).

---

## 1. Qaror: bot CRM backend ichida

TZ §1 dagi diagramma botni alohida servis sifatida ko'rsatadi. Biz **Variant A** ni tanladik —
bot `backend/src/telegram/` moduli sifatida ishlaydi va mavjud CRM **servislarini** chaqiradi.

```text
Telegram
   ↓ webhook (imzo bilan)
POST /api/telegram/webhook
   ↓
telegramLink.handleUpdate()      ← faqat `/start <kod>` (tasdiqlanmagan chat)
   ↓
telegram/router.ts
   ↓
   ├─ rateLimit.ts               ← chat darajasida chegara
   ├─ TelegramLink qidiruvi      ← tasdiqlangan chatmi?
   ├─ resolveCommandScope()      ← kim va qaysi o'quvchilarni ko'radi
   ├─ handlers/                  ← javob matni va tugmalar
   │     ↓
   │  CRM SERVISLARI (paymentSchedule, portal, attendance, ...)
   │     ↓
   │  PostgreSQL
   └─ TelegramEvent              ← kiruvchi hodisa jurnali
```

**Nega alohida servis emas:** markazda **hisobi yo'q ota-onalar** bor (`Parent.userId` ixtiyoriy).
Alohida bot servisi ularning nomidan CRM API ga murojaat qila olmaydi — unga keng vakolatli
"xizmat tokeni" berish kerak bo'lardi, bu esa TZ §31 dagi
`User → Role → Permission → Ownership` zanjirini zaiflashtiradi.

**TZ §58/§60 buzilmaydi:** bot hech qanday biznes mantiqni takrorlamaydi. Qarz — `paymentScheduleService`,
davomat — `attendanceService`, XP — gamifikatsiya servisi. Bot faqat **ko'rsatadi va chaqiradi**.

Keyinchalik ajratish kerak bo'lsa: handlerlar `BotContext` dan boshqa hech narsaga tayanmaydi,
shuning uchun faqat servis chaqiruvlari HTTP ga o‘tadi.

---

## 2. Fayllar

| Fayl | Vazifasi |
|---|---|
| `telegram/types.ts` | Update tuzilmasi va `BotContext` (handler shundan boshqa hech narsani bilmaydi) |
| `telegram/router.ts` | Chegara → bog'lanish → doira → handler → jurnal → xato |
| `telegram/rateLimit.ts` | Chat darajasidagi chegara (xotirada) |
| `telegram/session.service.ts` | Ko'p qadamli oqim holati (`TelegramSession`) |
| `telegram/keyboards.ts` | Inline tugmalar, callback qurish/ajratish, sahifalash |
| `telegram/handlers/menu.ts` | `/start`, bosh menyu, buyruqlar |
| `services/telegramLink.service.ts` | Bog'lash (`/start <kod>`) va uzish |
| `services/telegramCommand.service.ts` | Javob matnlari (`/qarz`, `/darslar`, `/davomat`) |
| `services/telegram.service.ts` | Telegram Bot API mijozi |

---

## 3. Xavfsizlik qatlamlari

Tartib muhim — har biri o'zidan keyingisini himoya qiladi:

| # | Qatlam | Nima qiladi |
|---|---|---|
| 1 | Webhook imzosi | `X-Telegram-Bot-Api-Secret-Token`, `timingSafeEqual`. Secret sozlanmagan bo'lsa webhook **umuman** qabul qilinmaydi |
| 2 | Chat chegarasi | 10 soniyada 20 update. Oshgan chatga **javob yozilmaydi** — aks holda o'zimiz Telegram chegarasiga urilardik |
| 3 | Bog'lanish | Tasdiqlanmagan (`verifiedAt`, `isActive`) chatga ma'lumot ham, **buyruqlar ro'yxati ham** berilmaydi |
| 4 | Doira (`scope`) | O'quvchi — o'zi, ota-ona — faqat o'z farzandlari, xodim — o'quvchi ma'lumoti yo'q |
| 5 | Callback ishonchsiz | Tugma ichidagi ma'lumot **kirish** hisoblanadi. Doira har safar `chatId` dan qayta olinadi, callback ichidagi ID ga ishonilmaydi (TZ §32) |
| 6 | Xato | Foydalanuvchiga faqat "Xatolik yuz berdi", haqiqiy xato `TelegramEvent.error` va logda (TZ §46) |
| 7 | Maxfiylik | `TelegramEvent` da **foydalanuvchi matni saqlanmaydi** — faqat buyruq nomi va holati |

### Bog'lash kodi (PHASE 2 da mustahkamlandi)

Avval kod **muddatsiz va bir martalik emas** edi, `verifiedAt` tekshirilmasdi — kodni
ko'rgan boshqa chat o'zini bog'lab, foydalanuvchining bildirishnomalarini burib yuborishi
mumkin edi. Endi:

| Chora | Qanday |
|---|---|
| **Muddat** | Kod 15 daqiqa amal qiladi. Muddati o'tsa, CRM sahifasi ochilganda **yangisi** beriladi |
| **Bir martalik** | `codeUsedAt` to'lgach kod ishlamaydi — o'sha kod bilan ikkinchi chat bog'lana olmaydi |
| **Replay** | Tasdiqlangan bog'lanish (`verifiedAt`) kodni butunlay yopadi |
| **Brute-force** | 5 ta ketma-ket noto'g'ri kod → chat 15 daqiqaga bloklanadi. To'g'ri kod hisoblagichni nolga tushiradi |
| **Bir xil javob** | "Topilmadi", "ishlatilgan" va "muddati o'tgan" — uchalasiga **bir xil** matn, kod bor-yo'qligi bildirilmaydi |
| **Kim bog'ladi** | `telegramUserId` saqlanadi (guruh chatida `chatId` dan farq qiladi) |
| **Audit** | `telegram.linked` / `telegram.unlinked` — TZ §33 |
| **Tozalash** | Ishlatilmagan, muddati o'tgan kodlar kunlik jobda o'chiriladi |

> **Migratsiyada `now()` ishlatilmaydi.** `codeExpiresAt` — `TIMESTAMP` (mintaqasiz), Prisma
> uni UTC deb o'qiydi. Baza mintaqasi UTC dan farq qilsa (bizda `Asia/Tashkent`), `now()`
> kodni "eskirgan" emas, **5 soat kelajakka** qo'yib yuborardi. Shuning uchun aniq
> o'tmishdagi sana yoziladi.

---

## 4. Ma'lumotlar bazasi

PHASE 1 da **ikkita yangi jadval**. Qolgan hamma narsa mavjud jadvallardan (TZ §7 dagi
`telegram_accounts`, `telegram_notifications`, `telegram_notification_preferences`
dublikat bo'lardi — auditning 6-bo'limiga qarang).

```prisma
model TelegramSession {   // ko'p qadamli oqim: bitta chatda bitta oqim, 30 daqiqa muddat
  chatId  @id
  flow, step, data, expiresAt
}

model TelegramEvent {     // kiruvchi update jurnali (matn saqlanmaydi)
  chatId, telegramUserId, kind, action, status, error, durationMs
}
```

`TelegramSession` muddati o'tganlari kunlik `auditCleanup.job` da tozalanadi — alohida job
ochish ortiqcha, chunki muddat o'qishda ham tekshiriladi.

---

## 5. Menyu va navigatsiya

- Tugma bosilganda javob **o'sha xabarning o'rniga** yoziladi (`editMessageText`), shunda
  suhbat o'nlab xabar bilan to'lib ketmaydi. Tahrirlash imkonsiz bo'lsa — yangi xabar.
- Tugma bosilishi **darrov** `answerCallbackQuery` bilan tasdiqlanadi, aks holda Telegramda
  tugmada "soat" aylanib turadi va foydalanuvchi bot qotgan deb o'ylaydi.
- Menyu tugmasi buyruqning o'zini yuboradi (`cmd:/qarz`), shuning uchun matndan yozgan ham,
  tugma bosgan ham **bir xil** javob oladi — ikki xil kod yo‘li yo‘q.
- `callback_data` 64 baytdan oshsa **xato tashlanadi**: Telegram bunday tugmani jimgina
  qabul qilmaydi va nosozlikni topish qiyin bo'lardi.

### Menyu roli bo'yicha

| Rol | Tugmalar |
|---|---|
| O'quvchi / Ota-ona | 📊 Profil · 📅 Dars jadvali · ✅ Davomat · 📝 Uy vazifalari · 🎯 Imtihonlar · ⭐ XP & Reyting · 💳 To'lovlar · 📜 Sertifikatlar · 🔗 Holat · 🚫 Uzish |
| Ota-ona (2+ farzand) | + 👨‍👩‍👧 Farzandni tanlash — tanlov sessiyada turadi, bo'limlar o'sha farzand haqida |
| Xodim | Ruxsatga qarab: `dashboard.view` → 📊 Ko'rsatkichlar · `attendance.mark` → 📅 Bugungi darslar, 📚 Guruhlarim · `lead.view` → 📞 Leadlarim, 🔥 Qizigan, ⏰ Follow-uplar · `debt.view` → ⚠️ Qarzdorlar · `student.view` → 🔥 Xavf ostida · `alert.view` → 🔔 Ogohlantirishlar · har doim: 🔗 Holat, 🚫 Uzish |

---

## 5a. O'quvchi bo'limlari (PHASE 3)

Har bo'lim `telegram/handlers/student.ts` da va **mavjud servisni** chaqiradi:

| Bo'lim | Manba | Izoh |
|---|---|---|
| Profil | `prisma.student` + `gamificationService.profile` | ism, kod, kurs, guruh, o'qituvchi, holat, daraja |
| Davomat | `buildAttendanceCalendar` | umumiy foiz + oylik ro'yxat, oldingi oyga o'tish; kelajak oyga tugma yo'q |
| Uy vazifalari | `buildStudentHomeworkRows` | topshirilmaganlar birinchi, 5 talik sahifa, 🔴 muddati 2 kundan kam |
| **Topshirish** | `homeworkService.submitByStudent` | **yangi** — matn, rasm yoki PDF; muddatdan keyin LATE; baholangan qayta topshirilmaydi; XP mavjud hook orqali |
| Imtihonlar | `buildStudentExamRows` | ball, foiz, baho, o'tdi/o'tmadi, izoh |
| XP | `gamificationService.profile` | daraja, progress, seriya, reyting, nishonlar, so'nggi XP |
| Sertifikatlar | `certificateService.list` | kod, sana, ochiq tekshiruv havolasi |
| To'lovlar | `paymentScheduleService.get` + `prisma.payment` | qarz, keyingi muddat, so'nggi 5 to'lov |

**Topshirish oqimi** (`TelegramSession`, flow `hw_submit`):

```text
📤 Topshirish  →  sessiya: {homeworkId}  →  keyingi xabar (matn / rasm / PDF)
      ↓ fayl: getFile → yuklab olish (MAX_UPLOAD_MB) → tur baytlar bo'yicha → saveFile
      ↓ homeworkService.submitByStudent → holat, XP, audit (homework.submitted)
✅ Vazifa topshirildi
```

- Boshqa tugma bosilsa oqim **bekor** bo'ladi (`clearFlow`), lekin ota-onaning farzand tanlovi qoladi.
- Buyruq (`/start`, `/vazifa`) yozilsa ham oqim yopiladi — foydalanuvchi menyuni kutadi.
- Fayl turi `docx` kabi bo'lsa rad etiladi, oqim ochiq qoladi — qaytadan yuborish mumkin.

**Kabinet API** (`/api/portal/*`) ham shu servislardan foydalanadi: `homework`, `homework/:id/submit`,
`homework/:id/attachment`, `exams`, `attendance/calendar`, `gamification`, `payments`.
Bot va kabinet **bitta manbadan** o'qiydi va yozadi (TZ §58).

## 5b. O'qituvchi bo'limlari (PHASE 5)

`telegram/handlers/teacher.ts`. Farqi: xodim uchun `scope.actor` — CRM'dagi **haqiqiy `AuthUser`**
(`User` + rol). Bot xodim nomidan mavjud servislarni chaqiradi, shuning uchun ruxsat va
"faqat o'z guruhlari" qoidasi CRM'dagi bilan aynan bir xil — botda alohida tekshiruv yo'q (TZ §5).
Menyu ham rol nomiga emas, **ruxsatga** qarab quriladi: `attendance.mark` bo'lsa o'qituvchi bo'limlari.

| Bo'lim | Servis | Izoh |
|---|---|---|
| Guruhlarim | `groupService.list` | faol guruhlar, 8 talik sahifa; o'qituvchi faqat o'zinikini ko'radi |
| Bugungi darslar | `attendanceAnalyticsService.teacherOverview` | dars kuni bo'lgan guruhlar, `davomat 2/12`, bugun kelmaganlar |
| O'quvchilar | `attendanceService.getSheet` | faol o'quvchilar va telefon |
| **Tezkor davomat** | `attendanceService.mark` | quyida |
| **Vazifa berish** | `homeworkService.create` | sarlavha → muddat → tavsif → tasdiq; topshiriqlar CRM servisida ochiladi |

**Tezkor davomat** (`TelegramSession`, flow `attendance`): varaq ochilganda belgilanmaganlar
**"keldi"** deb boshlanadi — 30 kishilik guruhda o'qituvchi 30 emas, 2–3 ta tugma bosadi.
Har tugma ✅ → ❌ → ⏰ → 📝 aylanadi, xabar o'rniga yangilanadi. «💾 Saqlash» —
`attendanceService.mark`: XP, seriya, ota-onaga xabar, audit (`userAgent: telegram-bot`) o'sha yerda.
Oqim ichidagi tugmalar (`tc_tog`, `tc_save`, `tc_hwok`) sessiyani yopmaydi; qolgan har qanday tugma yopadi.

Servis xatosi (`AppError`: guruh topilmadi, ruxsat yo'q) foydalanuvchiga **o'z matni** bilan
ko'rsatiladi — bu kutilgan holat, umumiy "Xatolik yuz berdi" emas.

Bloklangan (`status ≠ ACTIVE`) xodimning bog'lanishi yopiladi — CRM'ga kira olmagani kabi botda ham ishlamaydi.

## 5c. Sotuv va rahbar bo'limlari (PHASE 6–7)

`handlers/sales.ts` va `handlers/owner.ts` — ikkalasi ham `scope.actor` nomidan mavjud servislar.

| Bo'lim | Servis | Izoh |
|---|---|---|
| Leadlarim | `leadService.list` (`assignedTo: me`, ochiq statuslar) | "faqat mening leadlarim" — `leadAccess.ts` |
| Qizigan leadlar | `leadService.list` (VERY_HOT, keyin HOT) | skor bo'yicha |
| Lead kartochkasi | `leadService.getById` | telefon, kurs, skor, oxirgi aloqa, keyingi follow-up |
| Status | `leadService.setStatus` | audit va faollik tarixi servisda. **WON bot orqali qo'yilmaydi** — o'quvchiga aylantirish CRM'da. LOST — sabab so'raladi (oqim `lead_lost`) |
| Follow-uplar | `followUpService.list` / `complete` | bugun · kechikkan · kelgusi |
| Ko'rsatkichlar | `dashboardService.summary` | bloklar ruxsatga qarab keladi, bot hech nimani hisoblamaydi (TZ §23) |
| Qarzdorlar | `debtService.list` (eng kattalari) | servis actor olmaydi → `debt.view` botda tekshiriladi |
| Xavf ostida | `studentService.atRisk` | daraja va sog'lomlik bahosi |
| Ogohlantirishlar | `alertService.list` (ochiq) | `alert.view` botda tekshiriladi |

## 5d. O'quvchi/ota-ona bildirishnomalari (PHASE 8)

Beshta yangi tur — `services/studentNotify.service.ts` orqali, **asosiy amal bilan bir tranzaksiyada**:

| Tur | Qachon | Kimga | Qayerdan chaqiriladi |
|---|---|---|---|
| `HOMEWORK_CREATED` | vazifa e'lon qilinganda | guruhdagi har faol o'quvchi + ota-onasi | `homeworkService.create` |
| `HOMEWORK_GRADED` | ball qo'yilganda | o'quvchi + ota-ona | `homeworkService.bulkGrade` |
| `EXAM_RESULT` | natija kiritilganda / urinish baholanganda | o'quvchi + ota-ona | `examService.saveResults`, `examAttemptService.grade` |
| `LEVEL_UP` | XP darajani oshirganda | faqat o'quvchi | `gamification.awardXp` — XP qayerdan kelmasin |
| `CERTIFICATE_ISSUED` | sertifikat berilganda | o'quvchi + ota-ona | `certificateService.issue` |

Ikki kanal: kabinet hisobi bo'lsa — ilova ichida (foydalanuvchining tur bo'yicha sozlamasi
hisobga olinadi); Telegram — `studentId`/`parentId` bo'yicha, hisob shart emas.
Chaqiruvchi faqat **id** beradi — matn, manzil va `dedupeKey` bitta joyda (bir xil ball qayta
qo'yilsa takror xabar ketmaydi).

## 5e. Ommaviy xabar — broadcast (PHASE 9)

`services/broadcast.service.ts` + `handlers/broadcast.ts` + REST (`/api/telegram/broadcasts`).
Yangi ruxsat: **`broadcast.send`** (admin, rahbar). Menyuda «📢 Xabar yuborish», buyruq `/xabar`.

```text
Kimga? → [o'quvchilar | ota-onalar | guruh → tanlash → (+ota-onalar?) | kurs | o'qituvchilar | xodimlar]
      → matn (2000 belgigacha)
      → oldindan ko'rish: «Guruh: A guruh — 23 ta chat» + matn
      → ✅ Yuborish / ❌ Bekor
      → TelegramBroadcast yozuvi + NotificationDelivery navbati (bir tranzaksiyada) + audit
```

- **Navbat orqali**, to'g'ridan-to'g'ri emas: Telegram chegarasi, qayta urinish, "chat bloklagan" —
  hammasi mavjud yetkazish mexanizmida (TZ §26, §54). Statistika (yuborildi / kutmoqda / yetmadi)
  navbatdan `broadcastId` bo'yicha hisoblanadi — alohida hisoblagich yo'q.
- **Filial doirasi**: auditoriya `branchAccess` bilan cheklanadi — filial admini boshqa filialga yoza olmaydi.
- Faqat tasdiqlangan, faol chatlar; bo'sh auditoriya — 422, yozuv yaratilmaydi.
- Matn HTML rejimida ketadi — foydalanuvchi yozgan `<` belgisi `escapeHtml` bilan xavfsizlanadi.
- Rasm/fayl bilan yuborish hozircha yo'q — navbat matnli; keyingi bosqichda `fileId` qo'shish mumkin.

## 5f. To'lov tugmasi, do'st taklifi, AI yordamchi (PHASE 10–12)

`handlers/extras.ts`:

| Bo'lim | Servis | Izoh |
|---|---|---|
| 💳 To'lash | `paymentScheduleService.get` + `onlinePaymentService.providers()` | Qoldiq va keyingi muddat. Provayder (Click/Payme) ulanmagan bo'lsa — aniq aytiladi. **Bot to'lovni o'zi tasdiqlamaydi** (TZ §36): faqat provayder webhook'i orqali CRM tasdiqlaydi. Sinov provayderi "ulangan" deb ko'rsatilmaydi |
| 🎁 Do'st taklifi | `Student.referralCode` + `referralService.list` | Havola emas, **kod**: mavjud referral tizimi manager kodni lead kartasiga yozishi bilan ishlaydi. Takliflar holati va olingan bonus. `t.me/share/url` bilan ulashish |
| 🤖 AI yordamchi | `aiAssistantService.ask` | `ai.assistant` ruxsati bilan. Oqim (`ai`): har matn — savol, javob CRM tool'laridan; takliflar sessiyada (callback 64 baytga sig'maydi). So'rovlar `AiQuery` jurnalida — kabinetdagi bilan bir xil |

**Refaktoring:** `studentProgress` va `attendanceAnalytics` dagi actor-ga bog'liq metodlar
`buildStudentHomeworkRows`, `buildStudentExamRows`, `buildAttendanceCalendar` quruvchilariga
ajratildi — `buildStudentProfile` naqshi bo'yicha (ruxsat chaqiruvchi tomonda).

Xodim CRM'ga kira oladi, o'quvchi va ota-ona — yo'q. Shuning uchun bot qiymatining katta
qismi kabinet tomonida (TZ §57 MVP shuni tasdiqlaydi).

---

## 6. Ishga tushirish

### Sinov (mahalliy kompyuter) — polling

Telegram `localhost` ga webhook yubora olmaydi, shuning uchun sinovda bot yangiliklarni
**o'zi so'rab** turadi. Tunnel, ochiq manzil va HTTPS kerak emas.

```bash
# backend/.env
TELEGRAM_BOT_TOKEN=<@BotFather bergan token>
TELEGRAM_BOT_USERNAME=<bot username, @ belgisisiz>
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
TELEGRAM_POLLING=true
```

Sozlamani tekshirish (**token chiqarilmaydi** — faqat bot nomi va webhook holati):

```bash
npm run telegram:check --workspace backend
```

Serverni qayta ishga tushirsangiz, logda `Telegram polling rejimi ishga tushdi` chiqadi.
`.env` o'zgarishini `node --watch` ko'rmaydi — serverni **qo'lda** qayta ishga tushiring.
Polling boshlanishida webhook **o'chiriladi**: Telegram bitta botda ikkalasini qabul qilmaydi
(`getUpdates` 409 bilan rad etiladi).

### Production — webhook

```bash
TELEGRAM_POLLING=false            # majburiy

npm run telegram:webhook --workspace backend -- https://crm.markaz.uz
npm run telegram:webhook --workspace backend -- --delete     # bekor qilish
```

Skript `TELEGRAM_WEBHOOK_SECRET` ni ham uzatadi — usiz webhook controlleri **hech qanday**
so'rovni qabul qilmaydi va bot jim qolardi.

> **Token — parol bilan barobar.** U faqat `.env` da turadi, `.gitignore` da, logga
> yozilmaydi va terminalga chiqarilmaydi.

---

## 7. Keyingi bosqichlar

| Bosqich | Ish |
|---|---|
| **2** | Bog'lash xavfsizligi: kod muddati, bir martalik, urinish chegarasi, `telegramUserId` |
| ~~3~~ | ✅ Student bot — bajarildi |
| ~~4~~ | ✅ Parent bot — farzand tanlash PHASE 3 ichida bajarildi (xavfsizlik uchun kerak edi: bo'lim birinchi farzandni jimgina ko'rsatmasin) |
| ~~5~~ | ✅ Teacher bot — bajarildi |
| ~~6–7~~ | ✅ Sotuv va rahbar botlari — bajarildi |
| ~~8~~ | ✅ Bildirishnoma turlari — bajarildi |
| ~~9~~ | ✅ Broadcast — bajarildi |
