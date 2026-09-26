# Akademik bildirishnomalar (PHASE 10)

TZ 3.0 §42. Barcha hodisalar **mavjud tizim** orqali: ilova ichida (qo'ng'iroqcha, foydalanuvchi
tur bo'yicha o'chira oladi — `SYSTEM` dan tashqari) va Telegram (bog'langan chatlar navbati,
`notificationDelivery`). O'quvchi/ota-onaga xabar bitta joydan — `studentNotify.service.ts`
(`notifyFamily`); xodimga — `notificationService.createManyInTransaction`. Har xabar `dedupeKey`
bilan: qayta saqlash yoki job qayta yurishi takror xabar bermaydi.

| TZ hodisasi | Tur | Kimga | Qachon | Holat |
|---|---|---|---|---|
| Homework created | `HOMEWORK_CREATED` | o'quvchi + ota-ona (faqat nishondagilar) | vazifa e'lon qilinganda | PHASE 2/5 |
| Homework deadline | `HOMEWORK_DEADLINE` | o'quvchi + ota-ona | muddatga < 24 soat, topshirilmagan (job) | PHASE 5 |
| Homework graded | `HOMEWORK_GRADED` | o'quvchi + ota-ona | baho qo'yilganda | PHASE 2 |
| Exam scheduled | `EXAM_SCHEDULED` | guruhdagi o'quvchi + ota-ona | kelgusi (bugun yoki keyin) PLANNED imtihon yaratilganda; sana/oyna/holat o'zgarsa qayta | **yangi** |
| Exam result | `EXAM_RESULT` | o'quvchi + ota-ona | natija yozilganda (qo'lda, avtomatik, onlayn) | PHASE 2 |
| Low score | `LOW_SCORE` | **faqat ota-ona**, yumshoq tavsiya bilan | imtihon: o'tish balidan past (yoki < 60%); vazifa: < 50% | **yangi** |
| Attendance absent | `CHILD_ABSENT` / Telegram | ota-ona, o'quvchi, xodimlar | darsga kelmaganda | mavjud |
| Attendance late | `ATTENDANCE_LATE` | **faqat ota-ona** | kechikib kelganda | **yangi** |
| Risk increased | `RISK_INCREASED` | guruh o'qituvchisi (sabablar bilan) | tungi risk hisobida daraja xavf/kritikka ko'tarilsa (birinchi hisobda emas) | **yangi** |
| Certificate issued | `CERTIFICATE_ISSUED` | o'quvchi + ota-ona | sertifikat berilganda | mavjud |
| Payment due | `PAYMENT_DUE_SOON` / `DEBT_REMINDER` | ota-ona (standart faol qoida `payment_due`, 3 kun oldin) | avtomatlashtirish qoidasi | mavjud |
| (qo'shimcha) Homework returned | `HOMEWORK_RETURNED` | o'quvchi + ota-ona | o'qituvchi qaytarganda | PHASE 5 |
| (qo'shimcha) Weekly report | `WEEKLY_REPORT` | o'quvchi + ota-ona | yakshanba 18:00 | PHASE 3 |

Ohang qoidasi: ota-onaga ketadigan past natija/kechikish xabarlari qo'rqitmaydi va ayblamaydi
(testda "yomon", "xavf" kabi so'zlar yo'qligi tekshiriladi).

Kabinetda bildirishnoma bosilsa **kabinet sahifasiga** o'tadi (vazifa, imtihon, davomat) —
xodim sahifalariga emas.

## Xodim eslatmalari — bitta yo'l (3.1, audit S4)

Follow-up eslatmasi (`FOLLOW_UP_REMINDER`, `TRIAL_LESSON_REMINDER`) va kechikish (`FOLLOW_UP_OVERDUE`) endi
`notificationService.createManyInTransaction` orqali yaratiladi: ilova ichida **va** bog'langan Telegram chatiga
(`NotificationDelivery` navbati — qayta urinish, backoff). Xodimning tur bo'yicha sozlamasi (`NotificationSetting`)
va botdagi "ovozsiz" rejim hurmat qilinadi. Oldin job bildirishnomani to'g'ridan-to'g'ri yozardi — Telegramga
eslatma ketmasdi (bot esa "eslatma shu chatga keladi" deb aytardi). Shoshilinch/yuqori muhimlikdagi follow-up
xabari 🔴/🟠 belgisi bilan. Testlar: `backend/tests/followUpReminderTelegram.test.ts`, E2E §37.
