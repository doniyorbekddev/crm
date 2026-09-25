# Nishonlar (badges)

> Academy CRM 3.1, GAP-02. Manba: `backend/src/services/gamification.service.ts` (`createBadge`, `badgeEarned`,
> `gamificationHooks.onMilestone`), `validators/gamification.validator.ts`, `frontend/src/pages/gamification/BadgeFormModal.tsx`.

## Yaratish

"Reyting → Qoidalar va nishonlar → Nishon yaratish" (`gamification.manage`). Maydonlar: belgi (emoji), nom, tavsif,
talab, chegara, toifa, XP mukofoti, faol. Kalit nomdan avtomatik (`CUSTOM_DOSTLAR_KOPRIGI`, band bo'lsa `_2`).

`POST /api/gamification/badges` → 201. Qoidalar:

| Holat | Javob |
|---|---|
| Nom band (katta-kichik harf va chetdagi bo'shliq farqsiz) | **400**, `field: name` |
| Bir xil avtomatik talab (qoida + chegara) allaqachon bor | **400**, `field: threshold` |
| Chegara talab oralig'idan tashqari, talabga chegara kerak emas-u berilgan, noma'lum maydon | 422 |
| `gamification.manage` yo'q (o'qituvchi, buxgalter, sotuv) | 403 |

Qo'lda beriladigan (`MANUAL`) nishonlar talab bo'yicha takrorlanishi mumkin — faqat nom noyob.

## Talablar (TZ nomi → tizimdagi qoida)

Har XP voqeasida (davomat, vazifa topshirish, imtihon bahosi, qo'lda XP) **barcha** faol avtomatik nishonlar tekshiriladi.
XP bermaydigan ikki voqea uchun yangi hook (`onMilestone`) qo'shildi — oxirgi ustunda.

| TZ | Qoida | Chegara | Qo'shimcha tekshiruv |
|---|---|---|---|
| ATTENDANCE | `ATTENDANCE_RATE` | 1–100 % (kamida 5 dars) | — |
| STREAK | `STREAK_DAYS` | 1–365 dars | — |
| HOMEWORK | `HOMEWORK_COUNT` | 1–10 000 | — |
| EXAM | `EXAM_SCORE` | 1–100 % (eng yaxshi natija) | — |
| XP | `XP_TOTAL` | 1–1 000 000 | — |
| REFERRAL | `REFERRAL` (**yangi**) | 1–100 do'st | taklif qilingan lead o'quvchiga aylanganda |
| COURSE_COMPLETION | `COURSE_COMPLETED` | — | holat "Tugatdi"/"Bitirdi" bo'lganda (**yangi hook**) |
| — | `MANUAL` | — | — |

Yangi yaratilgan avtomatik nishon talabga allaqachon javob beradigan o'quvchilarga keyingi voqeada yoki
"Qayta hisoblash" tugmasi bilan beriladi. Har nishon o'quvchiga bir marta (`StudentBadge` unikal), XP mukofoti
dedupe kaliti bilan.

## Toifalar

`ATTENDANCE` (Davomat), `ACADEMIC` (O'qish), `ACTIVITY` (Faollik), `SOCIAL` (Ijtimoiy), `SPECIAL` (Maxsus).
Migratsiya `20260927100000_badge_category_referral`: ustun qo'shildi (standart `SPECIAL`), mavjud nishonlar qoidasiga
qarab toifalandi (faqat `UPDATE`, o'chirish yo'q).

## Audit

`gamification.badge_created` (to'liq qiymat `after` da), `gamification.badge_updated`.
