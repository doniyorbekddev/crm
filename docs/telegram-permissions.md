# Telegram — ruxsatlar (har bot amali × ruxsat)

> Academy CRM 3.1, GAP-16. Qoida: **REST marshruti bilan bir xil ruxsat kaliti** (`config/permissions.ts`), botda alohida
> ruxsat tizimi yo'q. Menyu tugmasini yashirish **himoya emas** — qo'lda yuborilgan callback ham tekshiriladi.
> Kod: `telegram/permissions.ts` (`botCan`, `scopeCan`, `BOT_FORBIDDEN_TEXT`), jadvallar — `TEACHER_ACTION_PERMISSIONS`,
> `SALES_ACTION_PERMISSIONS`, `WORKSPACE_ACTION_PERMISSIONS`. Test: `tests/telegramPermissions.test.ts` — **har xodim amali**
> jadvalda, o'z funksiyasida tekshiriladi yoki ataylab shaxsiy ekanini tekshiradi; ruxsatsiz rol bilan barcha amallarni
> qo'lda yuborib, rad va bazada o'zgarish yo'qligini tasdiqlaydi.

## 1. Qatlamlar

1. **Bog'lanish** — tasdiqlangan, faol chat; xodim `ACTIVE` ([telegram-auth.md](telegram-auth.md)).
2. **Router prefiksi** — `st_`/`ex_` faqat o'quvchi/ota-onaga; `tc_` `sl_` `ow_` `bc_` `ai_` faqat xodimga; `ws_` — hammaga, funksiya o'zi tekshiradi.
3. **Amal ruxsati** — quyidagi jadvallar (callback'da va oqimning matnli qadamida).
4. **Ma'lumot doirasi** — CRM servisida: o'z guruhi (`teachingAccess`, `isRosterLimited`), o'z leadi (`leadAccess`), filial
   (`branchAccess`), o'quvchi/ota-ona — `scope.studentIds`.

Ruxsat har amalda `permissionService` dan o'qiladi — olib qo'yilsa keyingi bosishda kuchga kiradi (oqim o'rtasida ham).

## 2. Menyu (xodim)

| Tugma | Ko'rinadi, agar |
|---|---|
| 📊 Ko'rsatkichlar | `dashboard.view` |
| 📅 Bugungi darslar, 📚 Guruhlarim | `attendance.mark` |
| 📈 KPI | `attendance.mark` yoki `analytics.view` |
| ✍️ Tekshirish | `homework.grade` |
| 📞 Leadlarim, 🔥 Qizigan, ⏰ Follow-uplar | `lead.view` |
| ⚠️ Qarzdorlar / 🔥 Xavf ostida / 🔔 Ogohlantirishlar | `debt.view` / `student.view` / `alert.view` |
| 📢 Xabar yuborish | `broadcast.send` |
| 🤖 AI yordamchi | `ai.assistant` yoki `ai.academic` |
| 📣 Marketing / 📑 Hisobotlar | `analytics.view` / `report.view` |
| 🔎 Qidiruv, ⚙️ Sozlamalar, 🔗 Holat, 🚫 Uzish | hamma |

O'quvchi/ota-ona menyusi — doimiy (profil, darslar, davomat, vazifa, imtihon, onlayn imtihon, XP, to'lovlar, sertifikat,
haftalik hisobot, taklif, qidiruv), ruxsat emas, **doira** bilan himoyalangan.

## 3. O'qituvchi (`teacher.ts`)

| Amal | Buyruq | Ruxsat | Doira |
|---|---|---|---|
| `tc_groups`, `tc_group` | `/guruhlar` | `group.view` | o'z guruhlari (`group.manage` siz), filial |
| `tc_today` | `/bugun` | `attendance.view` | o'z guruhlari |
| `tc_students` | — | `attendance.view` | o'z guruhi (ism, telefon) |
| `tc_att` | — | `attendance.view` (belgilash tugmalari — `attendance.mark` bo'lsa) | o'z guruhi |
| `tc_tog`, `tc_save` | — | `attendance.mark` | o'z guruhi; o'quvchi — varaqdagi ro'yxatdan |
| `tc_hw`, `tc_hwnext`, `tc_hwok` + matnli qadamlar | — | `homework.manage` (dispetcher + har qadam) | `assertGroupVisible` |

## 4. Sotuv (`sales.ts`) — har `sl_*` callback va matnli qadamda (`salesFlowForbidden`)

| Amal | Buyruq | Ruxsat | Doira |
|---|---|---|---|
| `sl_leads`, `sl_hot`, `sl_lead` | `/leadlar` | `lead.view` | o'ziga biriktirilgan / biriktirilmagan (`lead.view_all` bo'lsa — hammasi), filial |
| `sl_st` (+ "yo'qotildi" sababi matni) | — | `lead.view` + `lead.update` | shu; `WON` botdan qo'yilmaydi |
| `sl_fu`, `sl_fud` | `/followup` | `followup.view` | leadAccess |
| `sl_fuok` | — | `followup.update` | leadAccess |
| `sl_call` `sl_ct` `sl_cr` `sl_cd` `sl_cs` `sl_cn` (+ izoh matni) | — | `lead.view` + `call.create` | lead har bosqichda / saqlashda qayta |
| `sl_cn:fu`, `sl_fn` `sl_fw` `sl_fs` `sl_fp` (+ sana matni) | — | `lead.view` + `followup.create` | leadAccess |

## 5. Rahbar (`owner.ts`, `workspace.ts`)

| Amal | Buyruq | Ruxsat | Doira / izoh |
|---|---|---|---|
| `ow_dash` | `/panel` | `dashboard.view` | bloklar o'z ruxsati bilan |
| `ow_debts` | `/qarzdorlar` | `debt.view` | filial |
| `ow_risk` | — | `student.view` | filial + o'z guruhlari |
| `ow_alerts` | — | `alert.view` | filial |
| `ws_kpi` | `/kpi` | `analytics.view` yoki `attendance.mark` | o'qituvchi — o'z guruhlari |
| `ws_kt` | — | `analytics.view` + `group.manage` | boshqa o'qituvchilar |
| `ws_mkt` · `ws_mcsv` | `/marketing` | `analytics.view` · + `report.export` | ⚠️ filial doirasi yo'q (S3 — PHASE 20) |
| `ws_rep` · `ws_r` · `ws_rcsv` | `/hisobotlar` | `report.view` · + tur ruxsati (`canViewReport`) · + `report.export` | ⚠️ filial doirasi yo'q (S3 — PHASE 20) |
| `ws_day` | `/kunlik` | `analytics.view` | ⚠️ filial doirasi yo'q (S3 — PHASE 20) |

Tur ruxsatlari (`config/reportPermissions.ts`, web bilan bitta): qarz — `debt.view`, to'lov — `payment.view`, o'qituvchilar —
`teacher.view`, maosh — `salary.view`, kirim — `income.view`, xarajat — `expense.view`, foyda — `finance.view`,
reyting — `gamification.view`.

## 6. Tekshirish va AI (`workspace.ts`, `extras.ts`)

| Amal | Buyruq | Ruxsat | Doira |
|---|---|---|---|
| `ws_rv` | `/tekshirish` | `homework.grade` | o'z guruhlari |
| `ws_ro` | — | `homework.view` | o'z guruhlari (`teachingAccess`) |
| `ws_rg`, `ws_rb` + baho/izoh matni | — | `homework.grade` (callback + **har matnli qadam**) | o'z guruhlari |
| `ws_ai` · `ws_aia` | — | `ai.academic` | o'z guruhlari |
| `ai_start`, `ai_s` + savol matni | `/ai` | `ai.assistant` yoki `ai.academic` (har qadam) | har AI vositasi o'z ruxsati bilan |

## 7. Ommaviy xabar (`broadcast.ts`)

Barcha `bc_*` — `broadcast.send` (har callbackda); matnli qadam — servis (`requireBroadcastPermission`). Auditoriya filial
doirasida; tarix — filial doirasida. Batafsil: [broadcast.md](broadcast.md).

## 8. Ruxsatsiz (shaxsiy) amallar

| Amal | Kim | Nega ruxsatsiz |
|---|---|---|
| `ws_set`, `ws_mute`, `ws_sc` | hamma | o'z chati / o'z sozlamasi; xodim turlari ruxsatga qarab filtrlanadi |
| `ws_st` | xodim | faqat ruxsatidagi tur |
| `ws_sr` / `/qidir` | hamma | natijalar servisda: xodim — har bo'lim o'z ruxsati + filial + o'z guruhi; oila — faqat o'zi |
| `/start` `/help` `/holat` `/uzish` | hamma | o'z bog'lanishi |
| `st_*`, `ex_*`, `st_paynow`, `st_ref` | o'quvchi/ota-ona | doira `scope.studentIds`; imtihon urinishi har qadamda egasi va holati bilan |

## 9. 3.1 da yopilgan bo'shliqlar (audit S1)

| Bosqich | Amal | Avval | Endi |
|---|---|---|---|
| PHASE 7 | vazifa berish | tekshiruvsiz | `homework.manage` har qadamda |
| PHASE 8–9 | qo'ng'iroq, lead status, follow-up | servis doirasi | `SALES_ACTION_PERMISSIONS` + matnli qadam |
| PHASE 10 | `ws_kpi` | tekshiruvsiz | `analytics.view` / `attendance.mark` |
| **PHASE 16** | `tc_groups` `tc_group` `tc_today` `tc_students` `tc_att` `tc_tog` `tc_save` | tekshiruvsiz — masalan sotuv menejeri qo'lda `tc_students:<guruh>` bilan ism va telefonlarni ko'rardi | REST bilan bir xil (`group.view` / `attendance.view` / `attendance.mark`) |
| **PHASE 16** | `ws_ro` `ws_rg` `ws_rb` `ws_aia`, baho matni | faqat o'z guruhi doirasi (`homework.grade` tekshirilmasdi) | `homework.view` / `homework.grade` / `ai.academic`, oqim o'rtasida ham |

Ochiq: rahbar hisobotlari/analitikada **filial doirasi** (S3) — PHASE 20.
