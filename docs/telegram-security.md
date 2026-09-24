# Telegram bot — xavfsizlik auditi (PHASE 13)

> Arxitektura: [telegram-architecture.md](telegram-architecture.md) · TZ: `telegramBot.md` §31–33
> Sana: 2026-09-24. Har band **testda** tekshiriladi — fayl nomi ko'rsatilgan.

---

## 1. Kim kirdi — autentifikatsiya

| Tahdid | Chora | Test |
|---|---|---|
| Soxta webhook | `X-Telegram-Bot-Api-Secret-Token` + `timingSafeEqual`. Secret sozlanmagan bo'lsa webhook **umuman** qabul qilinmaydi | `telegram.test.ts` |
| Bog'lash kodi o'g'irlanishi (ekran surati) | Kod **15 daqiqa**, **bir martalik** (`codeUsedAt`), tasdiqlangan bog'lanish kodni yopadi. "Topilmadi / ishlatilgan / muddati o'tgan" — **bir xil javob** | `telegramFoundation.test.ts` — "Bog'lash kodi xavfsizligi" |
| Kod izlash (brute-force) | 5 ta ketma-ket xato → chat 15 daqiqaga bloklanadi; to'g'ri kod hisoblagichni nolga tushiradi | `telegramFoundation.test.ts` |
| Username/telefon bo'yicha avtomatik bog'lash | **Yo'q** — faqat CRM'dan olingan kod (TZ §6) | — |
| **Guruh chatidan bog'lash** | Bot faqat `chat.type === 'private'` da ishlaydi. Guruhdan `/start <kod>` **e'tiborsiz** — aks holda qarz va davomat butun guruhga ketardi | `telegramFoundation.test.ts` — "faqat shaxsiy chat" |
| Bloklangan xodim | `User.status ≠ ACTIVE` → bog'lanish yopiladi, bot ishlamaydi | `telegramTeacher.test.ts` |

## 2. Nimaga ruxsat bor — avtorizatsiya va egalik

Botda **alohida ruxsat tizimi yo'q** (TZ §5). Xodim uchun `scope.actor` — CRM'dagi haqiqiy `AuthUser`,
bot uning nomidan mavjud servislarni chaqiradi; ruxsat va egalik o'sha servislarda.

| Kim | Doira | Qayerda tekshiriladi | Test |
|---|---|---|---|
| O'quvchi | faqat o'zi | `resolveCommandScope` → `studentIds` | `telegramStudent.test.ts` — "begona o'quvchi" |
| Ota-ona | faqat o'z farzandlari; 2+ bo'lsa tanlov, tanlov faqat doiradagi id | `resolveStudentId`, `chooseChild` | `telegram.test.ts` |
| O'qituvchi | faqat o'z guruhlari | `teachingAccess.onlyOwnGroups` (CRM) | `telegramTeacher.test.ts` — "begona guruh" |
| Manager | faqat o'ziga biriktirilgan leadlar | `leadAccess.ts` (CRM) | `telegramSales.test.ts` |
| Rahbar | filial doirasi | `branchAccess.ts` (CRM) | `broadcast.test.ts` |
| Menyu | **ruxsatga** qarab, rol nomiga emas | `handlers/menu.ts` | barcha suite'lar |

**Callback ma'lumotiga ishonilmaydi** (TZ §32): tugma ichidagi id — kirish. Doira har safar `chatId`
dan qayta olinadi; doiradan tashqari id rad etiladi (`tc_tog:begona`, `st_child:<begona>`,
`st_hwd:<begona>` testlari).

## 3. Suiiste'molga qarshi

| Chora | Qiymat | Izoh |
|---|---|---|
| Chat chegarasi | 10 s / 20 update | Oshgan chatga **javob yozilmaydi** — o'zimiz Telegram chegarasiga urilmaslik uchun |
| Webhook IP limiti | 1200/min | **Yuklama testi topdi:** umumiy `apiLimiter` (300/min, IP bo'yicha) va `heavyLimiter` (30/min) webhookni Telegramning **bitta IP'si** uchun cheklab, botni 30 tugmadan keyin "o'chirib" qo'yardi. Webhook'lar umumiy limitdan chiqarildi, alohida keng limit qo'yildi |
| So'rov tanasi | 256 KB | `express.json` |
| Sessiya muddati | 30 daqiqa | Yarim qolgan oqim tozalanadi |
| Fayl | `MAX_UPLOAD_MB`, tur **baytlar** bo'yicha (nom va mime ga ishonilmaydi) | `telegramStudent.test.ts` — "docx rad etiladi" |
| Callback uzunligi | 64 bayt — oshsa ishlab chiqishda xato | `keyboards.ts` |

## 4. Ma'lumot va maxfiylik

- **Jurnal:** `TelegramEvent` da foydalanuvchi **matni saqlanmaydi** — faqat buyruq nomi, holat, vaqt.
- **Token:** faqat `.env` da; logga, xatoga, `telegram:check` chiqishiga tushmaydi (faqat uzunligi).
- **Xato:** foydalanuvchiga "Xatolik yuz berdi", haqiqiy xato `TelegramEvent.error` + serverlog (TZ §46).
- **HTML:** foydalanuvchi matni (broadcast, vazifa javobi, izohlar) `escapeHtml` orqali — `<` xabarni buzmaydi.
- **Bog'lanmagan chat:** hech qanday ma'lumot va **buyruqlar ro'yxati ham** berilmaydi.
- **Xodim chati:** o'quvchi ma'lumotlari ko'rsatilmaydi (`/qarz` → "o'quvchi va ota-onalar uchun").

## 5. Audit (TZ §33)

| Amal | `AuditLog.action` | Qayerda |
|---|---|---|
| Bog'lash / uzish | `telegram.linked` / `telegram.unlinked` | `telegramLink.service`, router |
| Davomat (bot orqali) | `attendance.*`, `userAgent: telegram-bot` | `attendanceService.mark` |
| Vazifa berish / topshirish | `homework.created` / `homework.submitted` | `homeworkService` |
| Lead statusi, follow-up | `lead.status_changed`, … | `leadService`, `followUpService` |
| Ommaviy xabar | `broadcast.sent` (auditoriya, soni, matn boshi) | `broadcastService` |
| AI so'rovi | `AiQuery` jurnali | `aiAssistantService` |

## 6. Bot **qilmaydigan** narsalar (ataylab)

- To'lovni tasdiqlamaydi — faqat provayder webhook'i orqali CRM (TZ §36).
- `WON` statusini qo'ymaydi — o'quvchiga aylantirish CRM'da.
- XP, seriya, reyting hisoblamaydi — CRM dvigateli (TZ §18).
- Fayl bilan broadcast yubormaydi (hozircha matn).

## 7. Yuklama (PHASE 14)

`npm run telegram:load --workspace backend -- 300` (sinov bazasida, Telegram API o'rniga hisoblagich):

| Ssenariy | 300 update | p50 | p95 | p99 |
|---|---|---|---|---|
| `/start` (menyu) | 696/s | 13 ms | 19 ms | 61 ms |
| To'lovlar (`st_pay`) | 292/s | 26 ms | 75 ms | 194 ms |
| Vazifalar (`st_hw`) | 457/s | 16 ms | 53 ms | 77 ms |
| Davomat (`st_att`) | 648/s | 15 ms | 22 ms | 25 ms |

10 parallel foydalanuvchi, 0 xato, 0 chegara. Real Telegram trafigi bundan ancha kam
(Telegram bitta botga soniyasiga ~30 xabar chegarasini o'zi qo'yadi).

## 8. Ochiq qolgan / tavsiya

- `TELEGRAM_WEBHOOK_SECRET` va bot tokeni — kamida yiliga bir marta almashtiring (`/revoke`).
- Broadcast rasm/fayl bilan — navbat matnli, keyingi bosqich.
- Ko'p nusxali deploy'da chat chegarasi va bog'lash urinishlari xotirada — Redis'ga o'tkazish kerak.
