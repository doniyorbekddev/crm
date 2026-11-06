# ORG SYSTEM — Phase 0: Integratsiya rejasi

Sana: 2026-11-06, `main` = `9dbb232`.
Asos: [AUDIT](ORG-SYSTEM-0-AUDIT.md), [DATABASE-MAP](ORG-SYSTEM-0-DATABASE-MAP.md), [RISK-REGISTER](ORG-SYSTEM-0-RISK-REGISTER.md).

## 1. Tamoyillar (ijroda qanday saqlangan)

| Tamoyil | Qanday | Dalil |
|---|---|---|
| Mavjudini kengaytirish, yangisini kamroq | `Task`, `Employee`, `StaffWorkSchedule` kengaytirilgan. "Organization", "AssetAssignment", "CareerPath" uchun alohida jadval ochilmagan | DATABASE-MAP §1 |
| Faqat qo'shuvchi migratsiya | 8 ta ORG migratsiyasining birortasi ham ustun yoki jadval o'chirmaydi | `backend/prisma/migrations/2026110*` |
| Ruxsat serverda | Har yangi yo'l `requirePermission` yoki `requireStaff` bilan; ochiq yo'l testdagi ro'yxatga izoh bilan qo'shiladi | `tests/endpointSecurity.test.ts` |
| CEO qarorlari Admin'da yo'q | `org.manage`, `discount.approve`, `hiring.decide`, `complaint.confidential`, `performance.approve` | `config/permissions.ts:414` (`ADMIN_EXCLUDED`) |
| Har muhim amal auditda | `auditService.recordInTransaction` — o'zgarish bilan bitta tranzaksiyada | masalan `services/org/hr.service.ts` |
| Bildirishnoma asosiy amalni to'xtatmaydi | Outbox navbati, qayta urinish | `jobs/notificationDelivery.job.ts` |

## 2. Integratsiya tartibi (bajarilgan)

Tartib qaramlik bo'yicha tanlangan: avval tuzilma (kim kimga bo'ysunadi), keyin unga tayanadigan jarayonlar, oxirida
hamma narsani o'qiydigan panel.

| № | Bosqich | Nimaga tayanadi | Mazmun | Commit |
|---|---|---|---|---|
| 1 | Foundation | `User`, `Employee`, `Role` | Vazifa holatlari (`IN_PROGRESS`, `REVIEW`), lavozimlar, `managerId`, sinov muddati, tuzilma sahifasi | `2ba2522` |
| 2 | Operations | 1-bosqich (rahbar, bo'lim) | Katalog (`Department` / `Position`), ish tarixi, murojaatlar, chegirma vakolati, nomzodlar, on/offboarding, aktivlar, bilimlar bazasi | `1e45a67` |
| 3 | Performance & Finance | 2-bosqich (lavozim, bo'lim) + KPI/maosh | Bo'lim xarajat limiti, choraklik baholash, taqdirlash → maosh bonusi, karyera ko'tarilishi | `eb8a0aa` |
| 4 | Automation & Intelligence | 1–3 | Tashkilot paneli, kunlik xulosada jamoa bo'limi | `8d3e21f` |
| — | Davomat | `StaffWorkSchedule`, `Lesson` | QR davomat; avtomatik davomat (jadval / dars jadvali) | `a263cd3`, `d67cc4e` |
| — | Qo'shimcha | 1–4 | Umumiy kalendar, vazifa dalili, boshqaruv xulosasi, hujjatlar | `9dbb232` |

Hammasi production'da (2026-11-05, `9dbb232`). Oxirgi to'liq tekshiruv: backend 1176, frontend 315, E2E 73 — hammasi o'tgan.

## 3. Qolgan ish (tavsiya etilgan tartibda)

Har band alohida CEO tasdig'i bilan bajariladi. Kod va migratsiya hali **yozilmagan**.

| № | Ish | Nima uchun shu o'rinda | Ta'siri | Migratsiya | Xavf |
|---|---|---|---|---|---|
| 1 | Production backupni tiklab sinash (`scripts/verify-backup.sh` serverda) | Boshqa har qanday ishdan oldin qaytish yo'li ishonchli bo'lishi kerak | Faqat o'qish, vaqtinchalik baza | Yo'q | R-02 |
| 2 | Production'da Sales roli ruxsatlarini ko'rib chiqish (`discount.grant`) | 5% chegirma vakolati shu ruxsatsiz ishlamaydi | Rollar sahifasida bitta belgi | Yo'q | R-03 |
| 3 | Backup boshqa joyga ham yetib borayotganini tekshirish | Server yo'qolishi — eng katta xavf | Kuzatuv | Yo'q | R-01 |
| 4 | Audit saqlash muddatiga pastki chegara | Kichik o'zgarish, tarixni himoya qiladi | Validator | Yo'q | R-09 |
| 5 | Oy yopilganda KPI natijasini saqlash (snapshot) | Mavjud oy oxiri snapshotlari naqshida | Hisobot barqarorligi | Additive (yangi jadval) | R-06 |
| 6 | O'qituvchi ta'tili (`EmployeeLeave.userId` yoki o'qituvchi uchun `Employee` yozuvi) | Biznes qarori kerak: ta'til maoshga ta'sir qiladimi | HR, kalendar, davomat | Additive (ustun) | R-05 |
| 7 | Content Creator va Kassir rollari (spetsifikatsiya §8) | Xodim ishga olinganda kerak bo'ladi | `SYSTEM_ROLES` + sinxronlash | Yo'q (ma'lumot) | — |
| 8 | Bo'lim doirasidagi ruxsat | Faqat bo'lim rahbarlari paydo bo'lganda | Servislarga `departmentFilter` | Ehtimol additive | R-08 |
| 9 | GitHub avtomatik deploy (SSH secret) | Qo'lda deploy xatosi kamayadi | CI | Yo'q | R-10 |

## 4. Har bosqich uchun tekshiruv tartibi

1. Migratsiya faqat qo'shadi; eski nusxaga qo'llab ko'riladi.
2. Backend va frontend testlari to'liq, keyin E2E. Ular bir-biriga parallel ishga tushirilmaydi, chunki test bazasi umumiy.
3. `npm run lint`, `typecheck`, tarjimalar tekshiruvi (`scripts/i18n-check.mjs`).
4. Yangi yo'l uchun `endpointSecurity.test.ts` yangilanadi.
5. Commit va push — CEO ruxsati bilan.
6. Deploy (`deploy/deploy.sh` — backup → migratsiya → health → rollback) — alohida ruxsat bilan.
