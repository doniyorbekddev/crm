# Ommaviy xabar (Broadcast 2.0)

> Academy CRM 3.1, GAP-15. Manba: `backend/src/services/broadcast.service.ts`, `validators/broadcast.validator.ts`,
> `services/notificationDelivery.service.ts` (navbat), `services/telegram.service.ts`, `telegram/handlers/broadcast.ts` (bot),
> `frontend/src/pages/broadcasts/BroadcastsPage.tsx` (web).

## Oqim (TZ §38)

Auditoriya → matn → rasm/hujjat → havola tugmalari → **oldindan ko'rish** (nechta chat) → **tasdiq** (Yuborish / Bekor) →
navbat (`NotificationDelivery`) → yuborish → statistika. Web ("Ommaviy xabar", `broadcast.send`) va bot (`/xabar`) — bitta servis.

| Imkoniyat | Web | Bot |
|---|---|---|
| Matn (2–2000 belgi, HTML-escape) | ✅ | ✅ |
| Rasm (PNG/JPG/WEBP, ≤10 MB va `MAX_UPLOAD_MB`) / hujjat (PDF) | ✅ yuklash | ✅ chatga yuborish (file_id) |
| Havola tugmalari — `https://` faqat, ≤3, matn ≤40 | ✅ | ✅ `Matn \| https://…` |
| Oldindan ko'rish + tasdiq | ✅ Telegram ko'rinishiga yaqin + dialog | ✅ |
| Tarix va statistika | ✅ (navbatda bo'lsa 10 s da yangilanadi) | ✅ oxirgi 5 ta |

## Auditoriya

Mavjud tizim: barcha o'quvchilar, barcha ota-onalar, o'qituvchilar, barcha xodimlar, guruh, kurs (+ ixtiyoriy ota-onalar).
Faqat tasdiqlangan, faol Telegram chatlar; **filial doirasida** (`branch.view_all` siz — o'z filiali). Markaz e'loni
"ovozsiz" rejimdagi chatga ham boradi (eslatma emas — e'lon; avvalgi siyosat).

**Leadlar — yo'q** (audit qarori #5): leadlarda Telegram bog'lanishi yo'q; soxta "yuborildi" ko'rsatilmaydi.

## Web fayl yuklash

`POST /api/telegram/broadcasts/media` (xom tana, nomi `X-File-Name`) → tur **baytlar bo'yicha** aniqlanadi → CRM xotirasiga
saqlanadi → **token** (1 soat, faqat yuklagan xodim uchun, alohida kalit bilan imzolangan — access token o'rnida ishlamaydi).
Yuborishda `mediaToken`. Navbat birinchi chatga faylni yuklaydi, Telegram qaytargan `file_id` ni broadcast va kutayotgan
barcha yozuvlarga yozadi — qolgan chatlarga fayl qayta yuklanmaydi.

## Navbat

- Har daqiqalik job endi bir chaqiruvda **bir nechta partiya** (25 tadan, ≤40 partiya, ≤50 s) — 1000 xabar/daqiqagacha;
  bir chaqiruvda har yozuv ko'pi bilan bir marta urinadi.
- **`retry_after`** (Telegram 429): urinish sanalmaydi, shu partiyadagi qolganlar ham ko'rsatilgan soniya kutadi, chaqiruv to'xtaydi.
- Boshqa xatolar — avvalgidek: 5 urinish, backoff (1, 4, 9, 16 daqiqa); 400/403 (bloklagan) — darhol "yetmadi".

## Statistika

| Ko'rsatkich | Ma'nosi |
|---|---|
| Mo'ljal (targeted) | yuborish paytida auditoriyadagi faol chatlar |
| Yuborildi (sent) | Telegram qabul qildi |
| Yetkazildi (delivered) | = yuborildi. **Bot API yetkazilish/o'qilish tasdig'ini bermaydi** — alohida raqam to'qib chiqarilmaydi |
| Yetmadi (failed) | bloklagan/xato + o'tkazib yuborilgan (`skipped` — bog'lanish uzilgan) |
| Navbatda (pending) | hali yuborilmagan (qayta urinish kutmoqda) |

## Xavfsizlik

`broadcast.send` (REST, bot, media yuklash); soatiga **10 ta** (`BROADCAST_HOURLY_LIMIT`) — oshsa 429; noma'lum maydon — 422;
`http:`, `javascript:`, `tg:`, login/parolli, nuqtasiz host — 422; boshqa xodimning media tokeni — 403; tarix va statistika —
filial doirasida (boshqa filial xabari 404). Audit: `broadcast.sent` (auditoriya, soni, media turi, tugma havolalari).

## Testlar

`backend/tests/broadcast.test.ts`, `broadcast2.test.ts`, `frontend/src/pages/broadcasts/BroadcastsPage.test.tsx`,
`e2e/specs/flows.spec.ts` (§38 — web to'liq oqim, navbat jobi haqiqatan kutiladi; E2E'da bot tokeni yo'q — natija "yetmadi").
