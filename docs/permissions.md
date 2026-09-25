# Ruxsatlar (RBAC) — rol × ruxsat matritsasi

> **Avtomatik yaratilgan** — manba: `backend/src/config/permissions.ts`. Qo‘lda tahrirlamang — `npm run docs:permissions --workspace backend` bilan qayta yarating.
> Sana: 2026-09-25. Ruxsatlar: 91 ta, tizim rollari: 9 ta.

## Qanday ishlaydi

- Har endpoint `authenticate` + `requirePermission(...)` (yoki `requireAnyPermission`) bilan himoyalangan — `backend/src/routes/*.routes.ts`.
- Rol → ruxsat DB da (`RolePermission`); tizim rollari `npm run db:sync-permissions` bilan koddan sinxronlanadi. Maxsus rollar `/roles` sahifasida tuziladi.
- Ruxsat **nima qilish mumkin**ligini aytadi; **qaysi yozuvlar** ko‘rinishi — egalik qatlami: `teachingAccess.ts` (o‘qituvchi → o‘z guruhlari), `leadAccess.ts` (menejer → o‘z leadlari), `branchAccess.ts` (filial), `portal.service.ts` (o‘quvchi/ota-ona → o‘zi/farzandlari). Batafsil: [security.md](security.md).
- Frontend `PermissionGate` faqat interfeys qulayligi — himoya emas.

## Rollar

| Kalit | Nomi | Tavsif | Ruxsatlar soni |
|---|---|---|---|
| `SUPER_ADMIN` | Super Admin | Tizimning to‘liq egasi: xodimlar, rollar, sozlamalar va barcha ma’lumotlar | 88 |
| `OWNER` | Direktor (Owner) | O‘quv markaz egasi: barcha moliya, analitika va hisobotlar, xodimlarni boshqarishdan tashqari | 87 |
| `ADMIN` | Admin | Leadlar, o‘quvchilar, kurslar, to‘lovlar, sotuv va hisobotlar | 79 |
| `SALES_MANAGER` | Sales Manager | Leadlar bilan ishlash, qo‘ng‘iroq va follow-up, o‘quvchiga aylantirish | 21 |
| `CALL_CENTER` | Call Center | Leadlar, qo‘ng‘iroqlar va follow-up | 14 |
| `TEACHER` | O‘qituvchi | O‘z guruhlari, o‘quvchilari va davomat | 17 |
| `STUDENT` | O‘quvchi (kabinet) | Faqat o‘z davomati, uy vazifasi, imtihonlari, XP va to‘lovlari | 1 |
| `PARENT` | Ota-ona (kabinet) | Faqat o‘z farzandlarining ma’lumotlari | 1 |
| `ACCOUNTANT` | Buxgalter | To‘lovlar, qarzdorlik va moliyaviy hisobotlar | 28 |

## Matritsa

Qisqartmalar: SA = Super Admin · OWN = Direktor (Owner) · ADM = Admin · SM = Sales Manager · CC = Call Center · TCH = O‘qituvchi · STU = O‘quvchi (kabinet) · PAR = Ota-ona (kabinet) · ACC = Buxgalter

| Modul | Ruxsat | Tavsif | SA | OWN | ADM | SM | CC | TCH | STU | PAR | ACC |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard | `dashboard.view` | Dashboardni ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | ✅ |
| leads | `lead.view` | O‘ziga biriktirilgan va biriktirilmagan leadlarni ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| leads | `lead.view_all` | Barcha leadlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| leads | `lead.create` | Lead yaratish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| leads | `lead.update` | Leadni tahrirlash va statusini o‘zgartirish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| leads | `lead.assign` | Leadni managerga biriktirish | ✅ | ✅ | ✅ | ✅ | · | · | · | · | · |
| leads | `lead.delete` | Leadni o‘chirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| calls | `call.view` | Qo‘ng‘iroqlar tarixini ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| calls | `call.create` | Qo‘ng‘iroq yozish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| calls | `call.update` | Qo‘ng‘iroqni tahrirlash | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| calls | `call.delete` | Qo‘ng‘iroqni o‘chirish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| follow-ups | `followup.view` | Follow-uplarni ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| follow-ups | `followup.create` | Follow-up yaratish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| follow-ups | `followup.update` | Follow-upni tahrirlash va yakunlash | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| follow-ups | `followup.delete` | Follow-upni o‘chirish | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | · | · |
| courses | `course.view` | Kurslarni ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | ✅ |
| courses | `course.manage` | Kurs yaratish, tahrirlash, o‘chirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| courses | `lesson.manage` | LMS darslari va materiallarini yaratish (o‘qituvchi — o‘z kurslarida) | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| groups | `group.view` | Guruhlarni ko‘rish | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | · | ✅ |
| groups | `group.manage` | Guruh yaratish, tahrirlash, o‘chirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| students | `student.view` | O‘quvchilarni ko‘rish | ✅ | ✅ | ✅ | ✅ | · | ✅ | · | · | ✅ |
| students | `student.manage` | O‘quvchi yaratish, tahrirlash, o‘chirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| students | `student.convert` | Leadni o‘quvchiga aylantirish | ✅ | ✅ | ✅ | ✅ | · | · | · | · | · |
| attendance | `attendance.view` | Davomatni ko‘rish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| attendance | `attendance.mark` | Davomat belgilash | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| payments | `payment.view` | To‘lovlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| payments | `payment.create` | To‘lov qabul qilish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| payments | `payment.delete` | To‘lovni bekor qilish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| payments | `payment.refund` | To‘lovni (qisman) qaytarish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| debts | `debt.view` | Qarzdorlikni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| reports | `report.view` | Hisobotlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| reports | `report.export` | Hisobotlarni Excel/CSV ga eksport qilish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| users | `user.view` | Xodimlar ro‘yxatini ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| users | `user.manage` | Xodim yaratish, o‘chirish, role berish | ✅ | ✅ | · | · | · | · | · | · | · |
| employees | `employee.view` | Xodimlar (HR) ro‘yxatini ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| employees | `employee.manage` | Xodim qo‘shish, tahrirlash, holatini o‘zgartirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| employees | `employee.sensitive` | Xodimning maxfiy ma’lumotini (pasport, tug‘ilgan sana, manzil, favqulodda aloqa) ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| hr | `staff_document.view` | O‘qituvchi va xodim hujjatlarini (shartnoma, pasport, sertifikat) ko‘rish va yuklab olish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| hr | `staff_document.manage` | O‘qituvchi va xodim hujjatlarini yuklash, tahrirlash va o‘chirish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| roles | `role.manage` | Rollar va permissionlarni boshqarish | ✅ | · | · | · | · | · | · | · | · |
| settings | `settings.manage` | CRM sozlamalarini boshqarish | ✅ | ✅ | · | · | · | · | · | · | · |
| settings | `broadcast.send` | Telegram orqali ommaviy xabar yuborish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| audit | `audit.view` | Audit logni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| teachers | `teacher.view` | O‘qituvchilarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| teachers | `teacher.manage` | O‘qituvchi profilini boshqarish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| salary | `salary.view` | Maoshlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| salary | `salary.calculate` | Maoshni hisoblash | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| salary | `salary.approve` | Maoshni tasdiqlash (locked) | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| salary | `salary.pay` | Maoshni to‘lash | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| salary | `salary.unlock` | Tasdiqlangan maoshni qayta ochish (sabab bilan) | ✅ | ✅ | · | · | · | · | · | · | · |
| salary | `commission.view_own` | O‘z foiz daromadini ko‘rish (o‘qituvchi) | · | · | · | · | · | ✅ | · | · | · |
| finance | `finance.view` | Moliyaviy panel va tranzaksiyalarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `finance.manage` | Hisoblar va tranzaksiyalarni boshqarish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `finance.close` | Moliyaviy oyni yopish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `finance.reopen` | Yopilgan moliyaviy oyni qayta ochish (sabab bilan) | ✅ | ✅ | · | · | · | · | · | · | · |
| finance | `income.view` | Tushumlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `income.manage` | Tushum qo‘shish va bekor qilish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `expense.view` | Xarajatlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `expense.manage` | Xarajat qo‘shish va bekor qilish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| finance | `expense.approve` | Katta xarajatni tasdiqlash / rad etish, tasdiq chegarasini belgilash | ✅ | ✅ | · | · | · | · | · | · | · |
| finance | `budget.manage` | Oylik budjetni belgilash | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| gamification | `gamification.view` | XP, daraja va reytingni ko‘rish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| gamification | `gamification.manage` | XP qoidalari, darajalar va nishonlarni boshqarish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| homework | `homework.view` | Uy vazifalarini ko‘rish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| homework | `homework.manage` | Uy vazifasi berish va tahrirlash | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| homework | `homework.grade` | Uy vazifasini baholash | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| exams | `exam.view` | Imtihonlarni ko‘rish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| exams | `exam.manage` | Imtihon yaratish va tahrirlash | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| exams | `exam.grade` | Imtihon natijasini kiritish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| parents | `parent.view` | Ota-onalarni ko‘rish | ✅ | ✅ | ✅ | ✅ | · | ✅ | · | · | · |
| parents | `parent.manage` | Ota-ona ma’lumotlarini boshqarish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| alerts | `alert.view` | Ogohlantirishlarni ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| alerts | `alert.manage` | Ogohlantirish qoidalari va chegaralarini, kunlik xulosani sozlash | ✅ | ✅ | · | · | · | · | · | · | · |
| targets | `target.view` | Sotuv rejalarini ko‘rish | ✅ | ✅ | ✅ | ✅ | · | · | · | · | · |
| targets | `target.manage` | Sotuv rejasini belgilash | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| analytics | `analytics.view` | Kengaytirilgan analitikani ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| ai | `ai.assistant` | AI yordamchiga savol berish (javoblar xodimning o‘z ruxsatlari doirasida bo‘ladi) | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| inventory | `inventory.view` | Ombor (mahsulotlar va qoldiq) ma’lumotini ko‘rish | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| inventory | `inventory.manage` | Mahsulot qo‘shish va ombor harakatini yozish (kirim, sotuv, hisobdan chiqarish) | ✅ | ✅ | ✅ | · | · | · | · | · | ✅ |
| feedback | `feedback.view` | O‘quvchilar fikri va NPS hisobotini ko‘rish | ✅ | ✅ | ✅ | · | · | ✅ | · | · | · |
| feedback | `feedback.manage` | Fikr qo‘shish va salbiy fikrni ishlangan deb belgilash (past baho bildirishnomasi shu ruxsat bo‘yicha boradi) | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| discounts | `discount.view` | Chegirma qoidalari va berilgan chegirmalarni ko‘rish | ✅ | ✅ | ✅ | ✅ | · | · | · | · | ✅ |
| discounts | `discount.manage` | Chegirma qoidalari va promo kodlarni boshqarish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| discounts | `discount.grant` | O‘quvchiga chegirma berish va bekor qilish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| referrals | `referral.view` | Do‘st taklif qilish (referal) ro‘yxati va hisobotini ko‘rish | ✅ | ✅ | ✅ | ✅ | · | · | · | · | ✅ |
| referrals | `referral.reward` | Taklif uchun bonus berish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
| branches | `branch.view_all` | Barcha filiallar ma’lumotini ko‘rish (bo‘lmasa — faqat o‘z filiali) | ✅ | ✅ | · | · | · | · | · | · | · |
| branches | `branch.manage` | Filial qo‘shish va tahrirlash | ✅ | ✅ | · | · | · | · | · | · | · |
| portal | `portal.student` | O‘quvchi kabinetiga kirish | · | · | · | · | · | · | ✅ | · | · |
| portal | `portal.parent` | Ota-ona kabinetiga kirish | · | · | · | · | · | · | · | ✅ | · |
| portal | `portal.manage` | O‘quvchi va ota-onaga kabinet hisobi ochish | ✅ | ✅ | ✅ | · | · | · | · | · | · |
