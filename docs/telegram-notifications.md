# Telegram — bildirishnomalar

> Academy CRM 3.1, GAP-16. Oilaviy hodisalar jadvali (qaysi hodisa, kimga, qachon): [notifications.md](notifications.md) ·
> ommaviy xabar: [broadcast.md](broadcast.md) · kod: `services/notification.service.ts`, `services/studentNotify.service.ts`,
> `services/notificationDelivery.service.ts`, `config/notificationTypes.ts`, `jobs/notificationDelivery.job.ts`.

Telegram — **alohida bildirishnoma tizimi emas**, mavjud tizimning kanali: hodisa ilova ichida yoziladi va shu
tranzaksiyada Telegram **navbatiga** (`NotificationDelivery`, `PENDING`) qo'yiladi; yuborish — fon jobida.

## 1. Uch yo'l (hammasi bitta navbatga)

```
xodim hodisasi ──► notificationService.createManyInTransaction ──┐  (sozlama: ilova / Telegram, tur bo'yicha)
oila hodisasi  ──► studentNotify.notifyFamily                  ──┼─► NotificationDelivery (PENDING, dedupeKey)
                   └─ notifyExternalInTransaction (tur bilan)   ──┤
ommaviy xabar  ──► broadcastService.send                        ──┘  (tugmalar, media)
                                                                     │
                                  notificationDelivery.job (har daqiqa) ─► telegramService ─► SENT / FAILED / SKIPPED
```

| Yo'l | Kimga | Filtrlar (navbatga qo'yishda) |
|---|---|---|
| Xodim (`createManyInTransaction`) | `userId` bog'lanishi | tur sozlamasi `telegram` (web/bot bitta), "ovozsiz" chat, `SYSTEM` — doim |
| Oila (`notifyFamily` → `notifyExternalInTransaction`) | `studentId` / `parentId` bog'lanishi (hisob shart emas) | "ovozsiz" chat; **kabinet hisobi bo'lsa** — o'sha hisobning tur sozlamasi (3.1); `SYSTEM` — doim |
| Ommaviy xabar | auditoriya chatlari | faqat faol, tasdiqlangan; **ovozsiz rejim hisobga olinmaydi** (e'lon, eslatma emas) |

Tranzaksiya: asosiy amal bekor bo'lsa xabar ham navbatda qolmaydi. `dedupeKey` (`<hodisa>:<kanal>:<chat>`) — job qayta
yurishi yoki amal qayta saqlanishi takror xabar bermaydi.

## 2. Turlar va toifalar

Har tur aynan bitta toifada (`NOTIFICATION_CATEGORY`; yangi tur toifasiz kompilyatsiya o'tmaydi). Botdagi "⚙️ Sozlamalar"
toifani yoqadi/o'chiradi — bu mavjud `NotificationSetting` qatorlari, yangi saqlash yo'q.

| Toifa | Turlar | Asosiy manba |
|---|---|---|
| 📚 Davomat | `CHILD_ABSENT`, `ATTENDANCE_LATE`, `RISK_INCREASED` | `attendance.service`, `studentRisk.service` |
| 💳 To'lov | `NEW_PAYMENT`, `DEBT_REMINDER`, `PAYMENT_DUE_SOON`, `EXPENSE_APPROVAL` | `payment.service`, `debtReminder.job`, avtomatlashtirish, `expenseWorkflow.service` |
| 📝 Vazifa | `HOMEWORK_CREATED`, `HOMEWORK_GRADED`, `HOMEWORK_DEADLINE`, `HOMEWORK_RETURNED` | `homework.service`, `homeworkReminder.job` |
| 🎯 Imtihon | `EXAM_SCHEDULED`, `EXAM_RESULT`, `LOW_SCORE` | `exam.service`, `examAttempt.service`, `examTaking.service` |
| 🏆 Yutuqlar | `LEVEL_UP`, `CERTIFICATE_ISSUED` | `gamification.service`, `certificate.service` |
| 📣 Marketing | `NEW_LEAD`, `LEAD_ASSIGNED`, `FOLLOW_UP_REMINDER`, `FOLLOW_UP_OVERDUE`, `TRIAL_LESSON_REMINDER`, `NEW_STUDENT` | `lead.service`, `followUpReminder.job`, `student.service` |
| ⚙️ Tizim | `SYSTEM` (**o'chirilmaydi**), `DAILY_DIGEST`, `WEEKLY_REPORT`, `NEGATIVE_FEEDBACK` | `auth`, `salary`, `alert`, `digest.service`, `weeklyReport.job`, `feedback.service` |

Muhimlik (`NOTIFICATION_PRIORITY`) turga bog'langan; follow-up eslatmasida lead muhimligi belgisi (🔴/🟠) matnda.

## 3. Navbat (yuborish)

| Qoida | Qiymat |
|---|---|
| Job | har 60 s; bir yurishda 25 tadan ≤40 partiya, ≤50 s — ~1000 xabar/daqiqa |
| Bir yurishda | har yozuv ko'pi bilan **bir marta** |
| Qayta urinish | 5 urinish, kutish 1, 4, 9, 16 daqiqa (urinish²) |
| 429 `retry_after` | urinish sanalmaydi; shu va partiyadagi qolganlar ko'rsatilgan soniya kutadi; yurish to'xtaydi |
| 400/403 (bloklagan) | darhol `FAILED` |
| Bog'lanish uzilgan/faolsiz | `SKIPPED` |
| Token yo'q (dev/E2E) | `FAILED` "tokeni sozlanmagan" — soxta "yuborildi" yo'q |
| Media | `file_id` bo'yicha; web fayli — birinchi chatga yuklanadi, olingan `file_id` qolganlariga |
| Matn | sarlavha qalin + tana; oddiy xabar tanasi yuborishda escape, broadcast — navbatga yozishda |

## 4. Kuzatish

- `GET /api/telegram/health` (`settings.manage`): navbatdagi, 24 soatlik yuborilgan/yetmagan, oxirgi kiruvchi hodisa.
- Prometheus: `crm_notification_delivery_failures_total{channel="TELEGRAM"}`, `crm_telegram_failures_total{method}` —
  [observability.md](observability.md).
- `notification_deliveries.lastError` — sababi (masalan `Forbidden: bot was blocked by the user`).

## 5. Tez-tez savollar

| Savol | Javob |
|---|---|
| Ilovada bor, Telegramda yo'q | chat ovozsizmi? tur/toifa o'chirilganmi (`GET /api/notifications/settings`)? `lastError`? |
| Ota-ona toifani o'chira olmaydi | kabinet hisobi yo'q — faqat "ovozsiz" rejim ([telegram-auth.md](telegram-auth.md)) |
| Ovozsiz, lekin e'lon keldi | ommaviy xabar — ataylab (e'lon) |
| Bir xabar ikki marta | bo'lmaydi — `dedupeKey` unikal |

## 6. Testlar

`notifications.test.ts`, `studentNotifications.test.ts`, `notificationEvents.test.ts`, `followUpReminderTelegram.test.ts`
(S4), `telegramSettings.test.ts` (toifalar, oilaviy filtr), `broadcast.test.ts`, `broadcast2.test.ts` (partiyalar,
`retry_after`, media), `telegramV2.test.ts` (ovozsiz rejim).
