# Bir o'quvchi — bir nechta fan guruhi (PMT)

PMT o'quvchisi Matematika va Ingliz tili guruhlarida o'qiydi, lekin bitta umumiy oylik to'lov to'laydi.

## Model

| Tushuncha | Qayerda | Nima uchun |
|---|---|---|
| **Asosiy guruh** | `Student.groupId` (o'zgarmagan) | To'lov (`payment.groupId/teacherId`), o'qituvchi foizi, hisobotlar, qarz — hammasi avvalgidek shunga bog'liq |
| **Qo'shimcha guruh** | `StudentGroupMembership` (`leftAt = null` — faol) | Faqat o'quv jarayoni: ro'yxat, davomat, vazifa, imtihon, kabinet jadvali |
| **Moliya** | `Debt` (o'quvchiga bitta), `Student.contractPrice` | Qo'shimcha guruh shartnoma, qarz yoki to'lov **yaratmaydi** |

Qoidalar:
- Bitta guruhda faol a'zolik bittadan oshmaydi — `student_group_memberships_active_key` (partial unique index) va
  backend tekshiruvi; parallel so'rovlarda ikkinchisi 409 oladi.
- Asosiy guruhga qo'shimcha sifatida qo'shib bo'lmaydi; asosiy guruh faqat "Guruhga o'tkazish" orqali o'zgaradi.
  Qo'shimcha guruh asosiyga aylansa (o'tkazish yoki tahrirlash), qo'shimcha a'zolik avtomatik yopiladi.
- Chiqarish yozuvni o'chirmaydi (`leftAt`, `leftReason`, `removedById`); guruh tarixi (`StudentGroupChange`) va
  audit (`student.group_added` / `student.group_removed`) yoziladi.
- Sig'im: asosiy o'quvchilar + faol qo'shimcha a'zolar. Guruh qatori qo'shishda `FOR UPDATE` bilan qulflanadi.
- Yangi qo'shimcha guruhning ochiq vazifalari o'quvchiga avtomatik tushadi (mavjud `recordGroupChange` mexanizmi).

## Kirish huquqi

`services/groupMembership.ts` — yagona shartlar: `studentInGroup`, `studentTaughtBy`, `studentGroupIds`,
`groupOccupancy`. O'qituvchi o'quvchini o'z guruhi (asosiy yoki qo'shimcha) orqali ko'radi; boshqa guruh
davomat varag'i va belgilash — ruxsatsiz; o'quvchi davomat tarixida o'qituvchiga faqat o'z guruhlari yozuvlari.

Qo'llangan joylar: o'quvchilar ro'yxati/profili, davomat (varaq, belgilash, kunlik taxta, tarix), uy vazifasi
(oluvchilar), onlayn imtihon, kurrikulum, o'qituvchi markazidagi guruh ro'yxati, ota-onalar ro'yxati, qidiruv,
"Ishlarim", kabinet (darslar barcha guruhlardan, imtihonlar), sig'im (guruhlar, lookup).

## Ataylab o'zgarmagan (cheklovlar)

- **Moliya va hisobotlar** asosiy guruh bo'yicha — summalar ikki marta sanalmaydi.
- **O'qituvchi foizi**: to'lov asosiy guruh o'qituvchisiga yoziladi. Qo'shimcha guruh o'qituvchisining foizi
  (agar u PERCENTAGE modelda bo'lsa) PMT to'lovidan hisoblanmaydi — bu **biznes qarori** talab qiladi
  (masalan, foizni fanlar o'rtasida bo'lish). Hozircha avvalgi xatti-harakat saqlangan.
- Analitika, AI tavsiyalari, xavf bahosi va Telegram bot hisobotlari o'quvchi darajasida yoki asosiy guruh
  bo'yicha qoladi (o'quvchining davomat foizi ikkala fan bo'yicha umumiy).

## Migratsiya va rollback

`20261016090000_student_group_memberships` — faqat yangi jadval, indekslar va CHECK. Mavjud jadvallarga tegmaydi,
ma'lumot ko'chirmaydi (mavjud o'quvchilar faqat asosiy guruhda qoladi).

Rollback (kod oldingi versiyaga qaytsa ham jadval zarar qilmaydi; to'liq olib tashlash kerak bo'lsa):

```sql
-- Avval qo'shimcha a'zoliklar tarixini saqlab oling (pg_dump -t student_group_memberships)
DROP TABLE "student_group_memberships";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016090000_student_group_memberships';
```

Deploy oldidan to'liq `pg_dump` olinadi (deploy.sh ham avtomatik oladi).
