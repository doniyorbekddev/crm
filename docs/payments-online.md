# Onlayn to'lov — Click va Payme

> Academy CRM 3.1, GAP-17. Kod: `backend/src/services/payments/` (`provider.ts`, `providerTransactions.ts`,
> `click.provider.ts`, `payme.provider.ts`, `sandbox.provider.ts`, `onlinePayment.service.ts`),
> `controllers/onlinePayment.controller.ts`. Testlar: `tests/paymentProviders.test.ts`, `tests/onlinePayment.test.ts`, E2E §39.

## Holat: "Ready", merchant kalitlarisiz

Adapterlar protokol bo'yicha to'liq yozilgan va avtomatik testlangan, lekin **haqiqiy merchant kalitlari bilan hali
ishlatilmagan**. Kalitlar yo'q — provayder **o'chiq**: webhook 503, to'lov havolasi yo'q, bot "ulanmagan" deydi. Soxta
integratsiya yoki soxta "to'landi" yo'q; sinov kassasi (`*_MODE=test`) UI va botda doim **"sinov"** deb ko'rinadi.

## Oqim (TZ §39)

```
PaymentIntent (buyurtma: o'quvchi + summa)          ← CRM (xodim) yoki bot "To'lash" tugmasi
   │  checkoutUrl → Click / Payme to'lov sahifasi
   ▼
Provayder ──► POST /api/payments/webhook/{click|payme}
   │  kalit/imzo tekshiruvi (Payme Basic auth · Click MD5)
   ▼
PaymentProviderTransaction (holat 1)                 ← (provider, providerTxId) unikal — takror = o'sha yozuv
   │  perform / complete
   ▼
Payment (kvitansiya PM-…) — mavjud paymentService   ← idempotencyKey = <PROVIDER>-<providerTxId>
   │  qarz qayta hisobi, komissiya, bildirishnoma, audit — oddiy to'lov bilan bir xil
   ▼
Tranzaksiya 2, so'rov PAID   ·   bekor: 1 → -1 (yana to'lanadi) · 2 → -2 (qaytarish, so'rov REFUNDED)
```

## Sozlash (`.env` / `docker-compose.prod.yml`)

| O'zgaruvchi | Izoh |
|---|---|
| `PAYME_MERCHANT_ID`, `PAYME_KEY` | ikkalasi bo'lsa Payme yoqiladi. Kalit — kassa kaliti (test yoki production) |
| `PAYME_MODE` | `test` (standart) → `checkout.test.paycom.uz`, UI "sinov kassasi"; `production` → `checkout.paycom.uz` |
| `PAYME_ACCOUNT_FIELD` | kabinetdagi hisob maydoni (standart `order_id`) — qiymati CRM so'rov id |
| `PAYME_FISCAL_MXIK`, `PAYME_FISCAL_PACKAGE_CODE` | fiskal chek: ikkalasi berilsa `CheckPerformTransaction` `detail` qaytaradi |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` | uchalasi bo'lsa Click yoqiladi |
| `CLICK_MERCHANT_USER_ID` | Merchant API (qaytarish) — ixtiyoriy |
| `CLICK_MODE` | `test` / `production` — belgilash uchun |
| `PAYMENT_RETURN_URL` | to'lovdan keyin qaytish (standart — kabinet to'lovlari) |

**Provayder kabinetida** webhook manzili: Payme — `https://<domen>/api/payments/webhook/payme`; Click — Prepare va
Complete URL ikkalasi `https://<domen>/api/payments/webhook/click` (`action` parametri ajratadi).

## Payme (JSON-RPC)

Har javob HTTP 200. Metodlar: `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`,
`CheckTransaction`, `GetStatement`. Summalar **tiyin**. Tranzaksiya 12 soatda bajarilmasa — sabab 4 bilan bekor.

| Kod | Qachon |
|---|---|
| −32504 | Basic auth noto'g'ri |
| −32600 / −32601 / −32400 | so'rov noto'g'ri / metod yo'q / tizim xatosi |
| −31001 | summa buyurtmaga mos emas |
| −31003 | tranzaksiya topilmadi |
| −31007 | bekor qilib (qaytarib) bo'lmaydi |
| −31008 | bajarib bo'lmaydi (holat, 12 soat, kvitansiya yozilmadi) |
| −31050 | buyurtma topilmadi (`data` = hisob maydoni) |
| −31051 | buyurtma to'lanmaydi: to'langan, yopiq yoki boshqa faol tranzaksiya bor |

`ChangePassword` qo'llanmaydi (−32601) — kalit `.env` da almashtiriladi. Buzilgan JSON (−32700) global parser'da 400
bo'ladi — Payme to'g'ri JSON yuboradi.

## Click (SHOP API)

`application/x-www-form-urlencoded`, har javob HTTP 200, natija `error` kodida. Imzo — MD5 (fayl boshidagi formula).

| Kod | Qachon |
|---|---|
| −1 | imzo yoki `service_id` noto'g'ri |
| −2 | summa |
| −3 | `action` noma'lum |
| −4 | allaqachon to'langan (takroriy Complete ham) |
| −5 | buyurtma topilmadi |
| −6 | tranzaksiya topilmadi (`merchant_prepare_id` mos emas) |
| −7 | kvitansiya yozilmadi / buyurtmada faol tranzaksiya bor |
| −8 | majburiy parametr yo'q |
| −9 | bekor qilingan (Complete `error<0` — tranzaksiya bekor, buyurtma yana to'lanadi) |

## Qaytarish (refund / void)

| Provayder | Bajarilmagan (void) | Bajarilgan (refund) |
|---|---|---|
| Payme | `CancelTransaction` → −1 | Payme Business kabinetida bekor qilinadi → Payme `CancelTransaction` → CRM avtomatik qaytaradi (−2, so'rov REFUNDED). CRM'dan tashabbus — Payme API'sida yo'q |
| Click | Complete `error<0` → −1 | CRM "Qaytarish" (`POST /api/payments/online/intents/:id/refund`, `payment.refund`) → Click Merchant API reversal → muvaffaqiyatli bo'lsa CRM qaytarish. `CLICK_MERCHANT_USER_ID` siz — rad (soxta "qaytarildi" yo'q) |

CRM'dagi qaytarish — mavjud `paymentService.refund` (tizim nomidan): daftar yozuvi, qarz qayta hisobi, komissiya teskari.
Qaytarib bo'lmasa (masalan hisobda mablag' yetmaydi) — Payme'ga −31007, tranzaksiya 2 da qoladi.

## Idempotentlik va poyga (audit S8)

- Tranzaksiya `(provider, providerTxId)` unikal; parallel birinchi so'rov P2002 → mavjudi qaytadi (500/409 emas).
- Kvitansiya `idempotencyKey` bilan — takroriy Perform/Complete ikkinchi to'lov yaratmaydi; parallel Perform — bitta.
- Holat o'tishlari shartli (`updateMany where state`), audit `payment.online_received` bir marta.
- Sinov provayderi ham: parallel webhook poygasi — 409/500 emas, 200 va bitta kvitansiya.

## Kvitansiya va chek

Kvitansiya — CRM `Payment` (PM-…, usul `PAYME`/`CLICK`), web "To'lovlar" va o'quvchi kabinetida. Fiskal chek (OFD) —
Payme uchun `detail` (MXIK, o'lchov kodi `.env` da); Click fiskalizatsiyasi — Click kabinetidagi sozlama.

## Kuzatish

- Prometheus: `crm_payment_webhooks_total{provider, result=ok|duplicate|rejected|unauthorized|error|disabled}`.
- Audit: `payment.intent_created`, `payment.online_received`, `payment.refunded`, `payment.online_refund_requested`.
- Web: "To'lovlar" → "Onlayn to'lovlar" — provayder rejimi (sinov/ishlab chiqarish), holatlar, to'lov havolasi, qaytarish.

## Production'ga yoqish (kalitlar kelganda)

1. Kabinetda webhook manzillarini kiriting (yuqorida); Payme hisob maydoni `order_id` (yoki `PAYME_ACCOUNT_FIELD`).
2. **Sinov** kalitlari bilan (`*_MODE=test`) Payme/Click sinov stendidan to'liq ssenariy: to'lov, bekor, qaytarish, takror.
3. `.env.production` ga production kalitlari va `*_MODE=production`; backend qayta ishga tushiriladi.
4. Kichik summa bilan haqiqiy to'lov → CRM kvitansiya, qarz, bildirishnoma; keyin qaytarish.
5. Monitoring: `crm_payment_webhooks_total{result="unauthorized"}` o'smasligi.
