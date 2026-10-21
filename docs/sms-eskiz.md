# SMS zaxira kanali (Eskiz.uz)

Telegram ulanmagan ota-onaga (ixtiyoriy — o'quvchiga ham) muhim xabarlar SMS bo'lib boradi.
Telegrami bor (yoki botda "ovozsiz" qilgan) qabul qiluvchiga SMS **ketmaydi** — ikkalasi birga emas.

## Qanday ishlaydi

1. Hodisa (masalan, davomatda "Kelmadi") `notifyExternalInTransaction` orqali tashqi kanalga yuboriladi.
2. Qabul qiluvchida tasdiqlangan Telegram chati umuman bo'lmasa va shu tur Sozlamalarda tanlangan bo'lsa —
   `notification_deliveries` ga `channel = SMS` yozuvi qo'shiladi (asosiy amal bilan bitta tranzaksiyada).
3. Daqiqalik navbat job'i uni Eskiz API orqali yuboradi:
   - 21:00–08:00 (o'quv markaz vaqti) — yuborilmaydi, ertalab 08:00 ga suriladi;
   - kunlik limit tugasa — `SKIPPED` (ertaga eskirgan xabar ketmaydi);
   - Eskiz rad etsa (shablon moderatsiyadan o'tmagan, raqam noto'g'ri, balans yo'q) — `FAILED`, sababi `lastError` da;
   - tarmoq/5xx/429 — 1, 4, 9, 16 daqiqadan keyin qayta urinish (5 martagacha).
4. Kalit sozlanmagan yoki SMS o'chirilgan bo'lsa — yozuv `SKIPPED`. Soxta "yuborildi" hech qachon yozilmaydi.

Matn SMS uchun moslanadi: o'zbekcha tutuq belgilari (‘ ’) oddiy `'` ga almashtiriladi — aks holda xabar
UCS-2 ga o'tib, 160 o'rniga 70 belgi/qism bo'ladi (2–3 barobar qimmat). 320 belgidan uzun matn qisqartiriladi.

## Yoqish

1. Eskiz.uz kabinetida hisob oching, balansni to'ldiring.
2. Serverda `.env.production` ga (faqat serverda, 600 huquq bilan; chatga va gitga yozilmaydi):
   ```
   ESKIZ_EMAIL=...
   ESKIZ_PASSWORD=...
   ESKIZ_FROM=4546        # tasdiqlangan jo'natuvchi nomi bo'lsa — o'sha
   ```
   va backend'ni qayta ishga tushiring (`deploy/deploy.sh`).
3. CRM → Sozlamalar → Markaz ma'lumotlari → **SMS (Eskiz)**: xabar turlari, kimga, kunlik limit → Saqlash.
4. Kartadagi namunalarni Eskiz kabinetida **shablon** sifatida moderatsiyaga yuboring. Tasdiqlanmagan matn
   Eskiz tomonidan rad etiladi.
5. "Sinov SMS" bilan tekshiring (sinov rejimida faqat `Bu Eskiz dan test` matni o'tadi).

## API

| Usul | Yo'l | Ruxsat |
| --- | --- | --- |
| GET | `/api/settings/sms` | `settings.manage` — holat (kalit qiymatlari qaytarilmaydi), turlar, bugungi statistika |
| PUT | `/api/settings/sms` | `settings.manage` — `{ enabled, types, recipients, dailyLimit }` |
| GET | `/api/settings/sms/balance` | `settings.manage` — Eskiz balansi (olinmasa `null`) |
| POST | `/api/settings/sms/test` | `settings.manage` — `{ phone, message }`, darhol yuboradi; auditda raqam yashiriladi |
