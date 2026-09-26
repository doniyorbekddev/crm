# Telegram — autentifikatsiya va bog'lanish

> Academy CRM 3.1, GAP-16. Batafsil tahdid modeli: [telegram-security.md](telegram-security.md) §1 ·
> bog'lash kodi tarixi: [telegram-architecture.md](telegram-architecture.md) §3 · kod: `services/telegramLink.service.ts`,
> `services/telegramCommand.service.ts` (`resolveCommandScope`), `telegram/router.ts`.

## 1. Ikki darajali ishonch

| Daraja | Nima | Qanday |
|---|---|---|
| So'rov Telegramdanmi | webhook | `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET` (`timingSafeEqual`). Secret yo'q — webhook **umuman** ishlamaydi |
| Chat kimniki | bog'lanish | `TelegramLink` (chat ↔ **xodim** `userId` / **o'quvchi** `studentId` / **ota-ona** `parentId`), faqat `verifiedAt` va `isActive` bo'lsa |

Telegram username yoki telefon bo'yicha **avtomatik bog'lash yo'q** — faqat CRM bergan kod.

## 2. Bog'lash oqimi

```
CRM (web)                              Telegram
─────────                              ────────
GET /api/telegram/me          ─┐
GET /api/students/:id/telegram-link  ├─► kod + https://t.me/<bot>?start=<kod>
GET /api/parents/:id/telegram-link  ─┘            │
                                                   ▼
                                     /start <kod>  (faqat shaxsiy chat)
                                                   │
                           telegramLinkService.handleUpdate (/start <kod>):
                           kod bor? ishlatilmagan? 15 daq ichida? chat bloklanmagan?
                                                   │
                           verifiedAt, chatId, telegramUserId, codeUsedAt yoziladi
                           audit: telegram.linked
```

| Qoida | Qiymat |
|---|---|
| Kod muddati | 15 daqiqa; muddati o'tsa sahifa ochilganda yangisi |
| Bir martalik | `codeUsedAt`; tasdiqlangan bog'lanish kodni butunlay yopadi |
| Brute-force | 5 xato → chat 15 daqiqa bloklanadi |
| Javob | "topilmadi / ishlatilgan / eskirgan" — bir xil matn |
| Guruh chati | `chat.type !== 'private'` — e'tiborsiz |
| Kim bog'ladi | `telegramUserId` saqlanadi |

**Kabinet hisobi:** o'quvchi/ota-ona o'z hisobidan (`/telegram/me`) ulasa ham bog'lanish **o'quvchi/ota-ona yozuviga**
biriktiriladi (`ownerForActor`) — hisobsiz oila bilan bir xil kalit, xabarlar `studentId`/`parentId` bo'yicha boradi.

## 3. Har update'da doira (`scope`)

`resolveCommandScope(chatId)` → `{ kind: STUDENT | PARENT | STAFF, studentIds, actor }`:

- **Xodim** — `actor` = CRM'dagi haqiqiy `AuthUser` (rol, filial). `User.status ≠ ACTIVE` yoki o'chirilgan → bog'lanish
  ishlamaydi. Bot shu `actor` nomidan CRM servislarini chaqiradi — ruxsat va egalik CRM'dagi bilan **bir xil**
  ([telegram-permissions.md](telegram-permissions.md)).
- **O'quvchi** — `studentIds = [o'zi]`; o'chirilgan o'quvchi — doira bo'sh.
- **Ota-ona** — `studentIds` = o'z farzandlari; 2+ bo'lsa tanlov (`st_child`), tanlov faqat doiradagi id
  (`resolveStudentId`), sessiyada saqlanadi.

Doira **har update'da bazadan** qayta olinadi — callback yoki matnga ishonilmaydi. Ruxsat olib qo'yilsa, keyingi bosishdan
kuchga kiradi (ruxsat keshi `PERMISSION_CACHE_TTL_MS`).

## 4. Uzish va rotatsiya

- Foydalanuvchi: `/uzish` (bot) yoki `DELETE /api/telegram/me` (web) — audit `telegram.unlinked`.
- Xodim bloklansa — bot ishlamaydi (bog'lanish yopiladi).
- Token/secret almashtirish — [telegram-deployment.md](telegram-deployment.md) §6.

## 5. Testlar

`telegramFoundation.test.ts` (kod xavfsizligi, brute-force, faqat shaxsiy chat, bog'lanmagan chat), `telegram.test.ts`
(webhook secret, ota-ona farzand tanlovi), `telegramTeacher.test.ts` (bloklangan xodim), `telegramSearch.test.ts`
(§34 matritsasi).
