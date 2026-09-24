# Telegram bot — arxitektura

> Audit: [TELEGRAM-BOT-AUDIT.md](TELEGRAM-BOT-AUDIT.md) · TZ: `telegramBot.md`
> Holat: **PHASE 1 (poydevor) bajarildi.**

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

### ⚠️ Ochiq nuqson — PHASE 2 da tuzatiladi

Bog'lash kodi hozir **muddatsiz va bir martalik emas**; `verifiedAt` tekshirilmaydi.
Kodni ko'rgan boshqa chat o'zini bog'lab, foydalanuvchining bildirishnomalarini burib
yuborishi mumkin. Batafsil: [TELEGRAM-BOT-AUDIT.md §12](TELEGRAM-BOT-AUDIT.md).

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
| O'quvchi / Ota-ona | 💳 To'lovlarim · 📅 Dars jadvali · ✅ Davomatim · 🔗 Bog'lanish holati |
| Xodim | 🔗 Bog'lanish holati |

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

Serverni qayta ishga tushirsangiz, logda `Telegram polling rejimi ishga tushdi` chiqadi.
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
| **3** | Student bot: profil, davomat kalendari, vazifa (**topshirish API si yo'q — yaratiladi**), imtihon, XP, sertifikat |
| **4** | Parent bot: farzand tanlash |
| **5** | Teacher bot: guruhlar, bugungi darslar, tezkor davomat (oqim `TelegramSession` orqali) |
| **6–7** | Sales va Owner bot |
| **8** | Yangi bildirishnoma turlari (homework, exam, XP, certificate) |
| **9** | Broadcast |
