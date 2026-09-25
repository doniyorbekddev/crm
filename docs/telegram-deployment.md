# Telegram bot — production (PHASE 15)

> Umumiy deploy: [deployment.md](deployment.md) · Arxitektura: [telegram-architecture.md](telegram-architecture.md)

Bot **alohida servis emas** — u CRM backend ichida. Ya'ni alohida konteyner, port yoki
Nginx bloki kerak emas: webhook mavjud `/api` proksisi orqali keladi. Deploy — oddiy CRM deploy'i.

---

## 1. Muhit (`.env.production`)

```bash
TELEGRAM_BOT_TOKEN=<@BotFather bergan token>
TELEGRAM_BOT_USERNAME=it_academy_andijonbot      # @ belgisisiz — kabinetdagi "Telegramda ochish" havolasi uchun
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>   # usiz webhook HECH QANDAY so'rovni qabul qilmaydi
TELEGRAM_POLLING=false                           # productionda majburiy — compose'da ham 'false'
```

`docker-compose.prod.yml` uchalasini backend konteyneriga uzatadi va `TELEGRAM_POLLING` ni
`false` ga qotiradi. Token faqat `.env.production` da — u `.gitignore` da, logga tushmaydi.

## 2. Deploy tartibi

```bash
./deploy/deploy.sh            # oddiy CRM deploy: zaxira → migratsiya → sync-permissions → konteynerlar
```

Migrator bosqichi `prisma migrate deploy` dan keyin **`db:sync-permissions`** ni ham yurgizadi —
`broadcast.send` kabi yangi ruxsat productionga o'zi tushadi (aks holda 403 bo'lardi).

Bot uchun yangi jadvallar: `telegram_sessions`, `telegram_events`, `telegram_broadcasts`;
`telegram_links` ga xavfsizlik ustunlari; `notification_deliveries.broadcastId`. Hammasi
qo'shimcha — mavjud ma'lumot o'zgarmaydi.

## 3. Webhook'ni ro'yxatdan o'tkazish (bir marta)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend \
  npm run telegram:webhook -- https://crm.markaz.uz
```

Skript `https://crm.markaz.uz/api/telegram/webhook` ni `TELEGRAM_WEBHOOK_SECRET` bilan
ro'yxatdan o'tkazadi. Telegram **faqat HTTPS** qabul qiladi — domen va sertifikat
[HOSTING-VA-DOMEN.md](HOSTING-VA-DOMEN.md) bo'yicha tayyor bo'lishi shart.

Tekshirish (token chiqarilmaydi):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run telegram:check
```

Kutilgan: `Bot: @it_academy_andijonbot … Webhook: https://crm.markaz.uz/api/telegram/webhook … ✓ Token ishlayapti.`

Bekor qilish: `npm run telegram:webhook -- --delete`.

> Sinov kompyuterida `TELEGRAM_POLLING=true` bo'lsa, u ishga tushganda **webhook'ni o'chiradi**
> (Telegram bitta botda ikkalasini qabul qilmaydi). Shuning uchun bitta token bilan bir vaqtda
> serverda webhook va kompyuterda polling ishlatmang — production bot jim qoladi.

## 4. Nginx

Qo'shimcha sozlama kerak emas: `/api/` allaqachon backend'ga proksilanadi, webhook shu yo'lda.
Tekshiring: `client_max_body_size` kamida `1m` (Telegram update'lari kichik; fayl yuklash
Telegram serveridan `getFile` orqali, Nginx'dan o'tmaydi).

Rate limit: webhook umumiy IP limitidan chiqarilgan (`webhookLimiter` 1200/min) — Nginx'da
`/api/telegram/webhook` uchun alohida `limit_req` **qo'ymang**, aks holda Telegram'ning bitta
IP'si cheklanib bot to'xtaydi.

## 5. Monitoring (TZ §55)

```http
GET /api/telegram/health        (settings.manage ruxsati)
```

```json
{
  "enabled": true,
  "mode": "webhook",
  "linkedChats": 214,
  "lastEventAt": "2026-09-24T12:31:07.000Z",
  "eventsLast24h": 1840,
  "failedEventsLast24h": 0,
  "pendingDeliveries": 3,
  "failedDeliveriesLast24h": 2,
  "sentDeliveriesLast24h": 615
}
```

Nimaga qarash:

| Belgi | Ma'nosi | Nima qilish |
|---|---|---|
| `lastEventAt` eskirgan (soatlab), foydalanuvchilar esa yozyapti | webhook yetib kelmayapti | `telegram:check` → webhook manzili va `last_error_message` |
| `pendingDeliveries` o'sib boryapti | navbat ishlamayapti yoki Telegram javob bermayapti | backend logida `notificationDelivery.job`, Telegram holati |
| `failedDeliveriesLast24h` katta | chatlar botni bloklagan yoki token almashgan | `notification_deliveries.lastError` |
| `failedEventsLast24h` > 0 | handler xatosi | `telegram_events.error` — foydalanuvchiga ko'rinmaydi, shu yerda ko'rinadi |

Kabinetdagi "Tizim holati" sahifasi shu endpointni ko'rsatishi mumkin (keyingi qadam).

## 6. Token almashtirish (rotatsiya)

1. @BotFather → `/revoke` → yangi token.
2. `.env.production` da `TELEGRAM_BOT_TOKEN` ni yangilang.
3. `docker compose … up -d backend` (faqat backend qayta ishga tushadi).
4. `npm run telegram:webhook -- https://crm.markaz.uz` — webhook token bilan bog'liq, qayta ro'yxatdan o'tkaziladi.
5. `npm run telegram:check`.

Bog'lanishlar (`telegram_links`) token bilan bog'liq emas — foydalanuvchilar qayta ulanmaydi.

## 7. Orqaga qaytarish (rollback)

`./deploy/rollback.sh` — oddiy CRM rollback. Bot jadvallari qo'shimcha bo'lgani uchun eski
versiya ular bilan ham ishlayveradi. Webhook o'zgarmaydi.

## 8. Zaxira

`scripts/backup-db.sh` bot jadvallarini ham oladi (ular oddiy Postgres jadvallari).
`verify-backup.sh` tiklab tekshiradi. Alohida ish yo'q.
