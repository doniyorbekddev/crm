# Telegram — API ma'lumotnomasi

> Academy CRM 3.1, GAP-16. Umumiy ko'rinish: [telegram.md](telegram.md) · arxitektura: [telegram-architecture.md](telegram-architecture.md) ·
> ruxsatlar: [telegram-permissions.md](telegram-permissions.md) · auth: [telegram-auth.md](telegram-auth.md).

Bot **CRM backend ichidagi modul** (`backend/src/telegram/`): alohida servis va alohida baza yo'q, bot mavjud CRM
servislarini xodim nomidan chaqiradi. Quyida — tashqi (HTTP), Telegram Bot API va bot ichki (buyruq/callback) yuzasi.

## 1. CRM HTTP endpointlari

| Metod va yo'l | Ruxsat | Vazifasi |
|---|---|---|
| `POST /api/telegram/webhook` | **token yo'q** — `X-Telegram-Bot-Api-Secret-Token` (timing-safe); noto'g'ri yoki secret sozlanmagan — **401** | Telegram update'lari. Imzo to'g'ri bo'lsa doim 200 (Telegram qayta yubormasligi uchun), ishlov xatosi — `TelegramEvent` da. Limit: `webhookLimiter` (1200/min) |
| `GET /api/telegram/me` | kirgan har kim | O'z bog'lanishi (kod, `deepLink`, holat). Kabinet hisobi — o'quvchi/ota-ona **yozuviga** bog'lanadi |
| `DELETE /api/telegram/me` | kirgan har kim | O'z bog'lanishini uzish (audit `telegram.unlinked`) |
| `GET /api/students/:id/telegram-link` | `portal.manage` | O'quvchiga ulash kodi/havolasi (hisobsiz ham) |
| `GET /api/parents/:id/telegram-link` | `portal.manage` | Ota-onaga ulash kodi/havolasi |
| `GET /api/telegram/health` | `settings.manage` | Rejim, bog'langan chatlar, oxirgi hodisa, 24 soatlik xatolar, navbat holati |
| `GET /api/telegram/broadcasts` | `broadcast.send` | Oxirgi 20 ta ommaviy xabar + statistika (filial doirasi) |
| `GET /api/telegram/broadcasts/:id` | `broadcast.send` | Bitta xabar statistikasi |
| `POST /api/telegram/broadcasts/preview` | `broadcast.send` | Nechta chatga ketishi (hech narsa yozilmaydi) |
| `POST /api/telegram/broadcasts` | `broadcast.send` | Yuborish (navbatga) — [broadcast.md](broadcast.md) |
| `POST /api/telegram/broadcasts/media` | `broadcast.send` | Rasm/PDF yuklash (xom tana, `X-File-Name`) → token |

Bildirishnoma sozlamalari (web va bot bitta): `GET/PUT /api/notifications/settings` — [telegram-notifications.md](telegram-notifications.md).

## 2. Telegram Bot API (chiquvchi)

Mijoz: `backend/src/services/telegram.service.ts`. Token faqat `TELEGRAM_BOT_TOKEN` da; yo'q bo'lsa **o'chirilgan rejim**
(yuborilmaydi, `ok: false, retryable: false` — navbat "yetmadi" deb belgilaydi, soxta "yuborildi" yo'q).

| Metod | Qayerda | Izoh |
|---|---|---|
| `sendMessage` | javoblar, navbat | HTML, `disable_web_page_preview`, inline klaviatura (callback yoki **url** tugma) |
| `editMessageText` | tugma bosilganda (`context.render`) | imkonsiz bo'lsa yangi xabar |
| `sendPhoto` / `sendDocument` | fayl, broadcast, CSV | `file_id` bo'yicha yoki multipart yuklash; javobdan `fileId` olinadi |
| `answerCallbackQuery` | har callback | "soat" aylanib qolmasin |
| `getFile` + fayl yuklab olish | vazifa/imtihon fayllari | hajm **yuklashdan oldin** tekshiriladi |
| `getUpdates` | polling (faqat dev) | `offset` update ishlangandan keyin suriladi |
| `setWebhook` / `deleteWebhook` | CLI | secret bilan |
| `setMyCommands` | ishga tushishda | chatdagi "Menu" ro'yxati |

Xato turi: **429 / 5xx / tarmoq** — vaqtinchalik (`retryable`), 429 da `retry_after` (`retryAfter`) navbatga uzatiladi;
**400 / 403** (bloklagan, eski xabar) — doimiy.

## 3. Bot ichki yuzasi

**Buyruqlar** (`BOT_COMMANDS`, `setMyCommands` orqali): `/start` `/profil` `/darslar` `/davomat` `/vazifa` `/imtihon`
`/onlayn` `/xp` `/qarz` `/sertifikat` `/hisobot` `/taklif` `/panel` `/bugun` `/guruhlar` `/leadlar` `/followup` `/qarzdorlar`
`/xabar` `/ai` `/qidir` `/kpi` `/tekshirish` `/kunlik` `/hisobotlar` `/marketing` `/sozlamalar` `/holat` `/uzish` `/help`.
Ruxsatsiz bo'lim buyrug'i — "ruxsatingiz yo'q"; bog'lanmagan chatga hech narsa (hatto ro'yxat ham) berilmaydi.

**Callback'lar** — `prefiks:argument` (≤64 bayt, `keyboards.ts` tekshiradi). Argumentga **ishonilmaydi**:

| Fayl | Prefikslar |
|---|---|
| `student.ts` | `st_profile` `st_att` `st_cal` `st_hw` `st_hwd` `st_hws` `st_ex` `st_xp` `st_cert` `st_pay` `st_week` `st_child` |
| `exam.ts` | `ex_list` `ex_info` `ex_start` `ex_go` `ex_save` `ex_q` `ex_a` `ex_sub` `ex_subok` |
| `extras.ts` | `st_paynow` `st_ref` `ai_start` `ai_s` |
| `teacher.ts` | `tc_groups` `tc_today` `tc_group` `tc_students` `tc_att` `tc_tog` `tc_save` `tc_hw` `tc_hwnext` `tc_hwok` |
| `sales.ts` | `sl_leads` `sl_hot` `sl_lead` `sl_st` `sl_fu` `sl_fud` `sl_fuok` `sl_call` `sl_ct` `sl_cr` `sl_cd` `sl_cs` `sl_cn` `sl_fn` `sl_fw` `sl_fs` `sl_fp` |
| `owner.ts` | `ow_dash` `ow_debts` `ow_risk` `ow_alerts` |
| `broadcast.ts` | `bc_start` `bc_aud` `bc_grp` `bc_crs` `bc_par` `bc_send` `bc_list` `bc_btn` `bc_btnclr` |
| `workspace.ts` | `ws_sr` `ws_set` `ws_st` `ws_sc` `ws_mute` `ws_kpi` `ws_kt` `ws_mkt` `ws_mcsv` `ws_rep` `ws_r` `ws_rcsv` `ws_day` `ws_rv` `ws_ro` `ws_rg` `ws_rb` `ws_ai` `ws_aia` |
| umumiy | `menu` (bosh menyu), `cmd:/<buyruq>`, `noop`, sahifalash |

**Ko'p qadamli oqimlar** (`TelegramSession`, 30 daqiqa): vazifa topshirish, onlayn imtihon, vazifa berish, davomat varag'i,
qo'ng'iroq, follow-up, lead "yo'qotildi" sababi, broadcast, qidiruv, baholash, AI. Oqimning o'z tugmalari (`*_FLOW_ACTIONS`)
sessiyani yopmaydi; boshqa har tugma yoki buyruq oqimni bekor qiladi. Matnli qadamda ruxsat qayta tekshiriladi
(masalan `salesFlowForbidden`).

## 4. Chegaralar

| Chegara | Qiymat |
|---|---|
| Chat | 20 update / 10 s (oshsa javob yozilmaydi) |
| Webhook IP | 1200 / min |
| JSON tana | 256 KB |
| Callback | 64 bayt |
| Fayl | `MAX_UPLOAD_MB`, tur baytlar bo'yicha |
| Navbat | 25 tadan partiya, ≤40 partiya/daqiqa, 5 urinish, `retry_after` |
| Broadcast | soatiga `BROADCAST_HOURLY_LIMIT` (10) |

## 5. CLI

| Dev (`tsx`) | Production image (`node dist/…`) | Vazifasi |
|---|---|---|
| `npm run telegram:webhook -- https://<domen>` | `npm run telegram:webhook:prod -- https://<domen>` | webhook o'rnatish (`-- --delete` — o'chirish) |
| `npm run telegram:check` | `npm run telegram:check:prod` | token, bot, webhook holati (token chiqarilmaydi) |
| `npm run telegram:load -- 300` | — (faqat sinov bazasida) | yuklama testi |

Production variantlari `src/cli/` dan kompilyatsiya qilinadi — runtime image'da `tsx` va `scripts/` yo'q (audit S9).
