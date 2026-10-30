# Xodimlar davomati (QR)

Xodim o'z CRM hisobi bilan qabulxonadagi **dinamik QR**ni skanerlaydi va kelish, tanaffus va ketishni belgilaydi. Rahbar bugungi holatni, hisobotni, ruxsat so'rovlarini va ish jadvallarini boshqaradi.

## Arxitektura

| Qatlam | Fayl |
|---|---|
| Holat mexanizmi (sof funksiyalar) | `backend/src/utils/staffAttendance.ts` |
| Kim kuzatiladi, kunlik reja | `backend/src/services/staffAttendance/planning.ts` |
| QR, skanerlash, xodimning o'z sahifasi | `backend/src/services/staffAttendance/attendance.service.ts` |
| Panel, hisobot, jadvallar, tuzatishlar | `backend/src/services/staffAttendance/admin.service.ts` |
| Ruxsat so'rovlari | `backend/src/services/staffAttendance/requests.service.ts` |
| Fon tekshiruvi (har 5 daqiqada) | `backend/src/jobs/staffAttendance.job.ts` |
| API | `backend/src/routes/staffAttendance.routes.ts` (`/api/staff-attendance`) |
| Sahifalar | `frontend/src/pages/staff-attendance/*` — `/my-attendance`, `/staff-attendance`, `/reception-qr` |

Davomat **tizim hisobi (`User`)** bo'yicha yuritiladi. O'qituvchi `TeacherProfile` orqali, boshqa xodim `Employee.userId` orqali kuzatiladi. Yangi xodim yozuvi ham, alohida autentifikatsiya ham yaratilmaydi. Hisobi bo'lmagan xodim skanerlay olmaydi: unga avval hisob ochiladi va "Xodimlar" bo'limida bog'lanadi.

### Ma'lumot modeli

Migratsiya `20261030100000_staff_qr_attendance` faqat yangi narsalar qo'shadi: jadvallar va `NotificationType.STAFF_ATTENDANCE` qiymati. Mavjud jadvallar o'zgarmaydi.

| Jadval | Vazifasi |
|---|---|
| `staff_work_schedules` | Ish jadvali **versiyalari** (`effectiveFrom`). O'tgan kunlar eski jadval bo'yicha baholanadi. |
| `staff_holidays` | Markaz bo'yicha bayramlar. |
| `staff_schedule_exceptions` | Bitta xodimning bitta kundagi o'zgarishi: dam olish yoki boshqa soatlar. |
| `staff_attendance_days` | Xodim + sana (bitta qator). Qiymatlar hodisalardan hisoblanadi. |
| `staff_attendance_events` | Hodisalar. O'zgartirilmaydi va o'chirilmaydi; tuzatishda `voidedAt` qo'yiladi. |
| `staff_attendance_corrections` | Tuzatishlar tarixi: oldin/keyin, sabab, kim, qachon. |
| `staff_qr_tokens` | QR tokenning SHA-256 hashi, muddati, kim ishlatgani. |
| `staff_permission_requests` | Ruxsat so'rovlari: kelmaslik, kech kelish, erta ketish. |

Bir kunda faqat bitta amaldagi "keldi" va bitta "ketdi" bo'lishi mumkin. Buni qisman unique indeks `staff_attendance_events_one_in_out` ta'minlaydi (Prisma sxemasida ko'rinmaydi, faqat migratsiyada). Kun va so'rov jadvallari `users` ga `RESTRICT` bilan bog'langan, shuning uchun tarix tasodifan o'chib ketmaydi.

**Orqaga qaytarish.** Yangi jadvallarga eski kod murojaat qilmaydi, shuning uchun ilovani oldingi versiyaga qaytarish xavfsiz: `deploy.sh` avtomatik rollback qiladi va jadvallar ma'lumoti bilan joyida qoladi. Jadvallarni o'chirish rejalashtirilmagan. `ALTER TYPE … ADD VALUE` ni qaytarib bo'lmaydi, lekin eski kod bu qiymatni ishlatmaydi.

## QR xavfsizligi

- **Token.** 32 bayt kriptografik tasodifiy qiymat (`randomBytes`). Bazada faqat SHA-256 hash saqlanadi, qayta ishlatiladigan sir saqlanmaydi.
- **QR ichida** faqat `https://<domen>/my-attendance?qr=<token>` havolasi bor. Unda xodim ma'lumoti ham, sir ham yo'q.
- **Muddat va almashinuv.** Token 60 soniya amal qiladi. Ekran uni har 30 soniyada **va har ishlatilganda** (holatni 2,5 soniyada bir tekshiradi) yangilaydi.
- **Bir martalik.** Token shartli `UPDATE … WHERE usedAt IS NULL AND expiresAt > now` bilan sarflanadi, shuning uchun bir vaqtda kelgan ikki so'rovdan bittasigina o'tadi. Bundan tashqari `qrTokenId UNIQUE`: bitta tokenga ko'pi bilan bitta hodisa yoziladi.
- **Amal bajarilmasa token sarflanmaydi.** Masalan, xodim ikkinchi marta "keldim" bossa, tranzaksiya bekor bo'ladi va token navbatdagi xodim uchun qoladi.
- **Idempotentlik.** Xuddi shu xodim xuddi shu token bilan xuddi shu amalni qayta yuborsa (tugmani ikki marta bosgan bo'lsa), yangi hodisa yozilmaydi va `replayed: true` qaytadi.
- **Kimlik** faqat sessiyadan (`req.user`) olinadi. So'rov tanasidagi `userId` e'tiborga olinmaydi; buni test tekshiradi.
- **Joy.** Token filialga (`branchId`) bog'langan. Boshqa filial xodimi uni ishlata olmaydi.
- **Vaqt** serverda qo'yiladi. Kun chegarasi Asia/Tashkent bo'yicha (`APP_UTC_OFFSET_MINUTES`).
- **Ruxsatlar.** QR yaratishga `staff_attendance.display` kerak; bu Admin/Owner/Super Admin va yangi **"Qabulxona (QR ekran)"** rolida bor. Oddiy xodim QR yarata olmaydi.
- **Rate limit** foydalanuvchi bo'yicha qo'yilgan, chunki butun markaz bitta Wi-Fi IP ortida:
  - skanerlash va tekshirish — daqiqasiga 20 ta;
  - QR yaratish — daqiqasiga 60 ta.
- **Ketma-ketlik.** Bir xodimning bir vaqtdagi so'rovlari kun qatoridagi `SELECT … FOR UPDATE` qulfi bilan navbatga qo'yiladi.

### Qolgan xavf (muhim)

Dinamik QR skrinshotni boshqa joyga yuborish xavfini **kamaytiradi**, lekin **jismoniy hozirlikni isbotlamaydi**. Ofisdagi hamkasb ekrandagi QR rasmini olib, uyidagi xodimga 60 soniya ichida yuborishi mumkin. Bu xavfni quyidagilar kamaytiradi:

- token bir martalik — yuborilgan QR'ni hamkasb o'zi ishlata olmaydi;
- har hodisada IP va qurilma (`userAgent`) yoziladi va rahbar kun tafsilotida ko'radi;
- QR ekranini xodimning o'zi ochgan bo'lsa, "o'z ekranidan" belgisi chiqadi.

**Kelajakda qilish mumkin (alohida qaror bilan):**

- skanerlashni faqat markaz Wi-Fi IP manzilidan qabul qilish;
- geolokatsiya;
- qabulxona kamerasi yoki administrator tasdig'i.

## Hisoblash qoidalari

- **Reja ustuvorligi:** xodimning shu kungi istisnosi → bayram → jadval versiyasi. Jadval belgilanmagan xodimdan kelish kutilmaydi va u "kelmagan" bo'lmaydi.
- **FIXED jadval:** ish kunlari va `HH:mm` soatlar.
- **LESSONS jadval (o'qituvchi):** boshlanish = birinchi dars − `lessonLeadMinutes`, tugash = oxirgi dars tugashi. Darslar shu kungi `ACTIVE`/`COMPLETED` guruhlardan olinadi, bekor qilingan darslar (`attendance_sessions.status = CANCELLED`) hisobga olinmaydi. Darssiz kun dam olish hisoblanadi.
- **Kechikish:** `kelgan > boshlanish + graceMinutes` bo'lsa kechikkan. Daqiqalar boshlanish vaqtidan sanaladi. Tasdiqlangan "kech kelish" ruxsati shu vaqtgacha kelishni oqlaydi.
- **Kelmagan:** faqat `boshlanish + absentAfterMinutes` (standart 120) o'tgandan keyin belgilanadi. Undan oldin holat "Hali kelmagan".
- **Erta ketish:** `ketgan < tugash` bo'lsa. Tasdiqlangan "erta ketish" ruxsati belgilangan vaqtdan keyin ketishni oqlaydi.
- **Sababli:** tasdiqlangan "kelmaslik" so'rovi yoki tasdiqlangan ta'til (`EmployeeLeave`).
- **Ish vaqti** = ketgan − kelgan − tanaffuslar. Faqat ketishi belgilangan kunlar hisobga olinadi.
- **Ketish belgilanmagan o'tgan kun** `PENDING_REVIEW` holatiga tushadi. Vaqt **o'ylab topilmaydi**; rahbar sabab bilan tuzatadi. Keyingi kuni xodim yangi "keldi" bosa oladi.
- **Davomat %** = kelgan kutilgan kunlar / (kutilgan − sababli) × 100.
- **Holatlar:** `WORKING`, `ON_BREAK`, `COMPLETED`, `LATE`, `EARLY_DEPARTURE`, `PENDING_REVIEW`, `ABSENT`, `EXCUSED`, `NOT_YET`, `OFF`. Kelish bo'yicha alohida belgi ham bor: `PRESENT` yoki `LATE`.

## Tuzatishlar

Faqat `staff_attendance.manage` ruxsati bilan qilinadi va sabab majburiy. O'z davomatini tuzatish mumkin emas. Uch xil tuzatish bor:

- yetishmayotgan hodisani qo'shish;
- hodisa vaqtini to'g'rilash: asl hodisa bekor qilinadi va yangisi qo'shiladi;
- noto'g'ri hodisani bekor qilish.

Asl hodisa vaqti hech qachon o'zgarmaydi. Natija ketma-ketligi buzilsa (masalan "ketdi" "keldi"dan oldin bo'lsa), tuzatish 422 bilan rad etiladi. Har tuzatish `staff_attendance_corrections` jadvaliga va audit jurnaliga (`staff_attendance.corrected`) yoziladi.

## Bildirishnomalar

Bildirishnomalar `STAFF_ATTENDANCE` turi bilan ilova ichida va Telegramda keladi; xodim sozlamada uni o'chira oladi. Har biri `dedupeKey` va kun qatoridagi belgilar bilan bir marta yuboriladi.

| Hodisa | Kimga |
|---|---|
| Keldi / ketdi tasdig'i | Xodim |
| Kechikdi | Rahbarlar (`staff_attendance.manage`) |
| 22:00 dan keyin ham ketish belgilanmagan | Xodim va rahbarlar |
| Kelmagan (baholash muddatidan keyin, sababsiz) | Rahbarlar |
| Yangi so'rov | Rahbarlar |
| So'rov tasdiqlandi / rad etildi | Xodim |

## Maosh xavfsizligi

Davomat **faqat ma'lumot** uchun. Maosh formulalari, komissiya foizlari, tasdiqlangan maoshlar va moliyaviy yozuvlarga tegilmaydi. Buni test tekshiradi: QR va tuzatishlardan keyin maosh, komissiya, tranzaksiya va xarajat soni o'zgarmaydi. Maoshga bog'lash uchun alohida tasdiqlangan biznes qoida kerak.

## Deploy ro'yxati

1. `deploy.sh` migratsiyani qo'llaydi. Undan oldin baza zaxirasi olinadi.
2. Ruxsatlar avtomatik moslanadi (`db:sync-permissions`): 3 ta yangi ruxsat va "Qabulxona (QR ekran)" roli qo'shiladi. Mavjud rollarda qo'lda o'zgartirilgan ruxsatlarga tegilmaydi.
3. Qabulxona planshetini sozlash:
   1. "Foydalanuvchilar" bo'limida **Qabulxona (QR ekran)** rolida hisob ochiladi.
   2. Planshetda shu hisob bilan kiriladi — bosh sahifa o'zi `/reception-qr` ga o'tadi.
   3. To'liq ekran tugmasi bosiladi.
4. "Xodimlar davomati → Ish jadvallari" bo'limida har xodimga jadval belgilanadi: administrator va operatorlarga "Belgilangan soatlar", o'qituvchilarga "Dars jadvali bo'yicha". Jadvalsiz xodimdan kelish kutilmaydi.
5. Xodim `Employee` yozuviga hisobi bog'langan bo'lishi kerak; o'qituvchida `TeacherProfile` bor. Shundan keyin xodim "Davomatim" sahifasida ko'rinadi.
6. Bayram kunlari kiritiladi.
