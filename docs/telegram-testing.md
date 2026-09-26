# Telegram — testlash

> Academy CRM 3.1, GAP-16. Umumiy test qoidalari: [testing.md](testing.md) · xavfsizlik testlari xaritasi:
> [telegram-security.md](telegram-security.md) · ruxsat matritsasi: [telegram-permissions.md](telegram-permissions.md).

Bot testlari **haqiqiy Telegramga hech narsa yubormaydi** va real tokenga muhtoj emas: update'lar webhook'ga HTTP orqali
beriladi, chiquvchi Bot API chaqiruvlari `vi.spyOn(telegramService, …)` bilan ushlanadi. Hamma narsa sinov bazasida
(`TEST_DATABASE_URL`), har testdan oldin `resetDatabase()`.

## 1. Ishga tushirish

```bash
cd backend
npx vitest run tests/telegram*.test.ts tests/broadcast*.test.ts   # faqat bot
npx vitest run                                                     # hammasi
npx tsx ../e2e/prepare.ts && cd .. && npx playwright test --config playwright.config.ts   # E2E
```

## 2. Integratsion test naqshi

```ts
const post = (body: object) =>
  request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (text: string) => post({ message: { message_id: 10, chat: { id: CHAT }, from: { id: CHAT }, text } });
const press = (data: string) => post({ callback_query: { id: 'cb', data, from: { id: CHAT }, message: { message_id: 10, chat: { id: CHAT } } } });

// bog'lash — CRM bergan kod bilan, xuddi foydalanuvchidek
const link = await telegramLinkService.ensureLink({ userId: user.id });
await message(`/start ${link.linkCode}`);

// chiquvchi xabarlarni ushlash
vi.spyOn(telegramService, 'sendMessage').mockImplementation(async (_chat, text, keyboard) => { shown.push({ text, keyboard }); return { ok: true, retryable: false }; });
vi.spyOn(telegramService, 'editMessageText')…; vi.spyOn(telegramService, 'answerCallbackQuery')…; vi.spyOn(telegramService, 'sendMedia')…;
```

Qoidalar:

- **Natijani CRM'dan tekshiring**, faqat bot matnidan emas: yaratilgan yozuv (`prisma…`), audit, navbat (`notificationDelivery`).
- **Raqamlarni REST bilan solishtiring** (KPI, marketing, hisobot) — bot o'zi hisoblamasligi shu bilan kafolatlanadi.
- **Soxta callback** yuboring: begona id, ruxsatsiz amal, oqim o'rtasida ruxsat olib qo'yilgan — "ruxsatingiz yo'q" va bazada o'zgarish yo'q.
- Uzun ssenariyda chat chegarasi (20 update/10 s) — `resetRateLimits()`; ruxsat o'zgartirilsa — `permissionService.invalidate()`.
- Sana/vaqt — biznes sanasi (`businessDateString`, UTC+5); tungi soatlarda ham o'tishi uchun UTC sanasiga tayanmang.
- Navbat: `notificationDeliveryService.processQueue(new Date())` ni to'g'ridan-to'g'ri chaqiring.

## 3. Test fayllari

| Fayl | Nima |
|---|---|
| `telegramFoundation.test.ts` | webhook, bog'lash kodi xavfsizligi, brute-force, faqat shaxsiy chat, menyu, chat chegarasi |
| `telegram.test.ts` | webhook secret, ota-ona farzand tanlovi, bildirishnoma navbati |
| `telegramStudent.test.ts` | o'quvchi bo'limlari, vazifa topshirish (fayl turi), begona o'quvchi |
| `telegramExam.test.ts` | onlayn imtihon (tafsilot, tasdiq, navigatsiya, har callbackda holat) |
| `telegramTeacher.test.ts` · `telegramHomework.test.ts` | davomat, begona guruh, bloklangan xodim · botdan faylli vazifa (`homework.manage`) |
| `telegramSales.test.ts` · `telegramCall.test.ts` | leadlar, status, follow-up · qo'ng'iroq oqimi, ruxsatlar |
| `followUpReminderTelegram.test.ts` | eslatma Telegram navbatiga (S4), sozlama va ovozsiz rejim |
| `telegramExtras.test.ts` · `telegramV2.test.ts` | to'lov tugmasi, taklif, AI · qidiruv, sozlamalar, KPI, tekshirish |
| `telegramTeacherKpi.test.ts` · `telegramMarketing.test.ts` · `telegramReports.test.ts` | rahbar KPI, marketing (davr, CSV), kunlik hisobot va 15 hisobot |
| `telegramSettings.test.ts` | toifalar, web ↔ bot bitta sozlama, oilaviy filtr |
| `telegramSearch.test.ts` | qidiruv va §34 matritsasi (Student/Parent/Teacher/Manager/Branch A → B) |
| `broadcast.test.ts` · `broadcast2.test.ts` | ommaviy xabar: bot oqimi, filial · tugma, media, statistika, `retry_after`, katta auditoriya |
| `telegramCli.test.ts` | CLI (S9): `dist/cli`, faqat production bog'liqliklar, sirlar chiqmaydi |
| `notifications*.test.ts`, `studentNotifications.test.ts` | bildirishnoma hodisalari va sozlamalar |

## 4. E2E (Playwright)

E2E serverida `TELEGRAM_BOT_TOKEN` **bo'sh**, `TELEGRAM_POLLING=false`, sinov secreti `E2E_WEBHOOK_SECRET` (`e2e/env.ts`).
Yordamchilar (`e2e/flows.ts`): `linkStudentTelegram`, `linkStaffTelegram`, `telegramMessage`, `telegramPress`,
`telegramTitles`, `withDb`. Bot javob matni tashqariga ketmaydi (token yo'q) — shuning uchun E2E **to'liq stek va natijani**
(CRM yozuvi, web sahifa, navbat) tekshiradi, matn esa integratsion testda. Navbat yozuvlari E2E'da `FAILED`
("tokeni sozlanmagan") bo'ladi — bu kutilgan, soxta "yuborildi" yo'q.

Ssenariylar (`e2e/specs/flows.spec.ts`): §35 imtihon, §36 vazifa, §37 sotuv + eslatma (job haqiqatan kutiladi), §38 broadcast
(web, navbat jobi kutiladi), GAP-10…14 (KPI, marketing, hisobotlar, sozlamalar, qidiruv), §64 vazifa → ota-ona va Telegram.

## 5. Qo'lda sinov (haqiqiy bot)

Faqat **alohida sinov boti** bilan (production tokeni bilan emas — polling production webhook'ini o'chiradi):

```bash
# backend/.env
TELEGRAM_BOT_TOKEN=<sinov boti tokeni>
TELEGRAM_BOT_USERNAME=<sinov_bot>
TELEGRAM_POLLING=true
npm run telegram:check     # token va rejim (token chiqarilmaydi)
npm run dev                # bot polling bilan ishlaydi
```

CRM → Profil → "Telegramni ulash" → havola → `/start <kod>`.

## 6. Yuklama

```bash
DATABASE_URL="<sinov bazasi>" npm run telegram:load -- 300
```

Telegram API o'rniga hisoblagich; natijalar — [telegram-security.md](telegram-security.md) §7.
