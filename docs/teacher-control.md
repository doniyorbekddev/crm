# O'qituvchi boshqaruv markazi (PHASE 8)

TZ 3.0 §28–29. O'qituvchi bitta sahifada o'z guruhlari holatini, xavf ostidagi o'quvchilarni va
bugungi ishlarni ko'radi. **Yangi hisob-kitob yo'q** — mavjud manbalar yig'iladi, shuning uchun
raqamlar profil, risk va hisobotlar bilan bir xil.

## 1. Sahifalar

| Yo'l | Nima |
|---|---|
| `/teaching` | umumiy yig'indi (guruhlar, o'quvchilar, xavf ostida, baholash kutmoqda, bugun davomat yo'q) va guruh kartalari |
| `/teaching/groups/:id` | guruh jadvali: o'quvchi, davomat, vazifa, imtihon, progress, risk + sabablar, oxirgi faollik va kabinetga kirish |

Guruh kartasi: o'quvchilar soni, davomat %, vazifa %, imtihon o'rtachasi, progress % (mavzu
o'zlashtirishi), xavf ostidagilar, "bugun dars" belgisi (davomat qilingan/qilinmagan) va tez
amallar: **Davomat** (guruh oldindan tanlangan), **Vazifalar** (baholash kutayotganlar soni),
**Imtihonlar** (tekshirish kutayotgan urinishlar). Guruh jadvalidan "Mavzular bo'yicha" —
o'zlashtirish matritsasi (PHASE 7).

Kirish: `attendance.mark` (menyu va sahifa), API — `attendance.mark`, `homework.manage` yoki
`group.manage`. O'qituvchi faqat o'z guruhlarini ko'radi (`teachingAccess`); `teacherId` filtri
faqat admin/rahbar uchun ishlaydi, o'qituvchida e'tiborsiz qoldiriladi. Begona guruh — 404.

## 2. Manbalar

| Ko'rsatkich | Manba |
|---|---|
| Davomat % (30 kun), vazifa % (60 kun), imtihon o'rtachasi (90 kun) | `studentRiskService.forStudents` — risk bilan bitta signal yig'imi |
| Progress % | `topic_mastery` o'rtachasi |
| Risk darajasi va sabablari | risk engine (yangidan hisoblanadi, saqlanmaydi) |
| Oxirgi faollik | darsga kelish, vazifa topshirish, dars ochish, imtihon boshlash — eng oxirgisi |
| Baholash kutmoqda | topshirilgan, bahosiz vazifalar + `NEEDS_REVIEW` urinishlar |
| Bugun dars | guruh jadvali kunlari (o'quv markaz vaqti) va bugungi davomat yozuvlari |

## 3. Risk sabablari (§29) — mavjud engine kengaytirildi

Mavjud 6 omil (davomat, ketma-ket kelmaslik, qarz, to'lov kechikishi, vazifa, imtihon) o'zgarmadi.
Qo'shildi (har biri og'irlik 5; ma'lumoti yo'q signal bahoga kirmaydi):

| Omil | Qoida | Sabab matni |
|---|---|---|
| `examTrend` | oxirgi 30 kun o'rtachasi vs 30–120 kun oldingi; 20 ball pasayish — 0 | "Imtihon natijasi pasaymoqda: 84% → 62%" |
| `missedHomework` | muddati o'tgan oxirgi 5 vazifadan ketma-ket topshirilmagani; 3 ta — 0 | "Ketma-ket topshirilmagan vazifa: 3 ta" |
| `activity` | oxirgi o'quv faolligidan beri kun; 21 kun — 0; yangi o'quvchi (14 kungacha) ayblanmaydi | "Oxirgi faollik: 12 kun oldin" |
| `login` | kabinetga oxirgi kirish; hisob 7 kundan beri ochiq, lekin kirmagan — 0; hisobsiz o'quvchi — hisobga kirmaydi | "Kabinetga kirish: kirmagan" |

TZ nomlari: Low attendance → `attendance`/`absences`, Homework missing → `homework`, Exam score
decreasing → `examTrend`, Low activity → `activity`, Debt → `debt`/`overdue`, No login → `login`,
No submission → `missedHomework`. Daraja (HEALTHY/ATTENTION/AT_RISK/CRITICAL) avvalgidek.

## 4. API

| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/teaching/overview?teacherId=` | yig'indi + guruh kartalari (faqat ACTIVE guruhlar) |
| GET | `/teaching/groups/:id` | karta + o'quvchi qatorlari (eng xavflisi tepada) |
