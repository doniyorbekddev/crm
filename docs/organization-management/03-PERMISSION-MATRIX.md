# 03 — Ruxsatlar matritsasi

`backend/src/config/permissions.ts` dagi tizim rollaridan avtomatik (standart holat; CEO rollar sahifasida o'zgartirishi mumkin — production'dagi haqiqiy holat "Rollar" sahifasida).

CEO qarorlari (`org.manage`, `discount.approve`, `hiring.decide`, `complaint.confidential`, `finance.lock`, `payment.cancel_charge`, …) Admin rolida yo'q — faqat Owner / Super Admin.

| Ruxsat | Tavsif | Super Admin | Direktor (Owner) | Admin | Sales Manager | Call Center | O‘qituvchi | Buxgalter | Qabulxona (QR ekran) |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `attendance.view` | Davomatni ko‘rish | ✓ | ✓ | ✓ |  |  | ✓ |  |  |
| `attendance.mark` | Davomat belgilash | ✓ | ✓ | ✓ |  |  | ✓ |  |  |
| `attendance.correct_closed` | Yopilgan moliyaviy oy davomatini tuzatish (sabab bilan) | ✓ | ✓ |  |  |  |  |  |  |
| `payment.view` | To‘lovlarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `payment.create` | To‘lov qabul qilish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `payment.delete` | To‘lovni bekor qilish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `payment.refund` | To‘lovni (qisman) qaytarish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `payment.reallocate` | To‘lovning oylarga taqsimotini tuzatish (sabab bilan) | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `payment.cancel_charge` | Oy to‘lov majburiyatini bekor qilish (shartnoma summasi kamayadi, sabab bilan) | ✓ | ✓ |  |  |  |  |  |  |
| `debt.view` | Qarzdorlikni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `user.view` | Xodimlar ro‘yxatini ko‘rish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `user.manage` | Xodim yaratish, o‘chirish, role berish | ✓ | ✓ |  |  |  |  |  |  |
| `employee.view` | Xodimlar (HR) ro‘yxatini ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `employee.manage` | Xodim qo‘shish, tahrirlash, holatini o‘zgartirish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `employee.sensitive` | Xodimning maxfiy ma’lumotini (pasport, tug‘ilgan sana, manzil, favqulodda aloqa) ko‘rish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `staff_attendance.view` | Xodimlar davomati paneli, hisobotlar va eksport | ✓ | ✓ | ✓ |  |  |  |  |  |
| `staff_attendance.manage` | Xodimlar ish jadvali, davomatni sabab bilan tuzatish, ruxsat so‘rovlarini tasdiqlash | ✓ | ✓ | ✓ |  |  |  |  |  |
| `staff_attendance.display` | Qabulxonadagi davomat QR ekranini ochish | ✓ | ✓ | ✓ |  |  |  |  | ✓ |
| `org.manage` | Bo‘limlar, lavozimlar katalogi, mas’uliyatlar va karyera yo‘llarini boshqarish | ✓ | ✓ |  |  |  |  |  |  |
| `complaint.view` | Filialdagi murojaat va shikoyatlarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `complaint.create` | O‘quvchi, ota-ona va boshqalarning murojaatini kiritish | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| `complaint.manage` | Murojaatni mas’ulga yo‘naltirish, hal etish, yopish va rahbarga ko‘tarish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `complaint.confidential` | Maxfiy murojaatlarni (xodimlar nizosi, xavfsizlik) va rahbarlarning o‘zi haqidagi murojaatlarni ko‘rish | ✓ | ✓ |  |  |  |  |  |  |
| `asset.view` | Markaz jihozlari (aktivlar) reyestrini ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `asset.manage` | Aktiv qo‘shish, mas’ulga biriktirish, ko‘chirish, ta’mirlash va hisobdan chiqarish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `knowledge.manage` | Bilimlar bazasi hujjatlarini yozish, e’lon qilish va arxivlash | ✓ | ✓ | ✓ |  |  |  |  |  |
| `performance.view` | Xodimlar baholash natijalari, taqdirlashlar va ko‘tarilish tavsiyalarini ko‘rish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `performance.manage` | Choraklik baholash yozish, taqdirlash va lavozimga ko‘tarishni tavsiya qilish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `performance.approve` | Baholashni va lavozimga ko‘tarilishni tasdiqlash (yakuniy qaror) | ✓ | ✓ |  |  |  |  |  |  |
| `staff_document.view` | O‘qituvchi va xodim hujjatlarini (shartnoma, pasport, sertifikat) ko‘rish va yuklab olish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `staff_document.manage` | O‘qituvchi va xodim hujjatlarini yuklash, tahrirlash va o‘chirish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `role.manage` | Rollar va permissionlarni boshqarish | ✓ |  |  |  |  |  |  |  |
| `audit.view` | Audit logni ko‘rish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `salary.view` | Maoshlarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `salary.calculate` | Maoshni hisoblash | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `salary.approve` | Maoshni tasdiqlash (locked) | ✓ | ✓ | ✓ |  |  |  |  |  |
| `salary.pay` | Maoshni to‘lash | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `salary.unlock` | Tasdiqlangan maoshni qayta ochish (sabab bilan) | ✓ | ✓ |  |  |  |  |  |  |
| `commission.view_own` | O‘z foiz daromadini ko‘rish (o‘qituvchi) |  |  |  |  |  | ✓ |  |  |
| `finance.view` | Moliyaviy panel va tranzaksiyalarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `finance.manage` | Hisoblar va tranzaksiyalarni boshqarish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `finance.close` | Moliyaviy oyni yopish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `finance.reopen` | Yopilgan moliyaviy oyni qayta ochish (sabab bilan) | ✓ | ✓ |  |  |  |  |  |  |
| `finance.lock` | Yopilgan oyni qulflash va qulfini ochish, oy oxiri snapshotini to‘ldirish | ✓ | ✓ |  |  |  |  |  |  |
| `income.view` | Tushumlarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `income.manage` | Tushum qo‘shish va bekor qilish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `expense.view` | Xarajatlarni ko‘rish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `expense.manage` | Xarajat qo‘shish va bekor qilish | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `expense.approve` | Katta xarajatni tasdiqlash / rad etish, tasdiq chegarasini belgilash | ✓ | ✓ |  |  |  |  |  |  |
| `budget.manage` | Oylik budjetni belgilash | ✓ | ✓ | ✓ |  |  |  | ✓ |  |
| `task.create` | O‘zi uchun vazifa yaratish | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| `task.assign` | Boshqa xodimga vazifa berish va qayta biriktirish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `task.view_all` | O‘z filiali doirasida barcha xodimlarning vazifalarini ko‘rish va boshqarish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `discount.view` | Chegirma qoidalari va berilgan chegirmalarni ko‘rish | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |  |
| `discount.manage` | Chegirma qoidalari va promo kodlarni boshqarish | ✓ | ✓ | ✓ |  |  |  |  |  |
| `discount.grant` | O‘quvchiga chegirma berish va bekor qilish | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `discount.approve` | Chegaradan (standart 5%) yuqori chegirmani tasdiqlash yoki tasdiqsiz berish | ✓ | ✓ |  |  |  |  |  |  |
