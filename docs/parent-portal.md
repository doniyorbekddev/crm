# Ota-ona kabineti (Parent Portal)

> Academy CRM 3.0 — PHASE 3 holati. Texnik asos [student-portal.md](student-portal.md) bilan **bir xil** — bu hujjat farqlar va ota-onaga xos bo‘limlarni yozadi.
> TZ: `promt3.md` §10 (Parent portal), §11 (Parent weekly report).

## 1. Kirish

| | O‘quvchi | Ota-ona |
|---|---|---|
| Rol / ruxsat | `STUDENT` / `portal.student` | `PARENT` / `portal.parent` |
| Login | ID raqami `ST-000045` | **telefon raqami** (`+998 90 123 45 67`, `901234567` — yozilish shakli muhim emas) yoki email |
| Ichki email (emailsiz ochilganda) | `st000045@kabinet.invalid` | `p998901234567@kabinet.invalid` |
| Bog‘lanish | `Student.userId` | `Parent.userId` → `StudentParent[]` |
| Doira | bitta o‘quvchi | bir nechta farzand; har so‘rovda `?studentId=` |

Telefon → hisob: avval telefondan yasalgan ichki login, bo‘lmasa shu telefonli **yagona** kabinetli ota-ona (email bilan ochilgan bo‘lsa ham). Ikki ota-onada bir xil telefon bo‘lsa — ikkinchisiga emailsiz ochilmaydi (409), email bilan ochiladi.

### Hisob ochish

| Amal | Qayerda | API |
|---|---|---|
| Bittasiga | Ota-onalar → amallar → **Kabinet ochish** | `POST /api/parents/:id/portal-account` (`portal.manage`), email ixtiyoriy; farzandsiz ota-onaga ochilmaydi |
| Hammaga | Ota-onalar → **Kabinetlar ochish** (hammaga yoki guruh bo‘yicha) | `POST /api/parents/portal-accounts/bulk` — farzandi **faol** o‘qiyotgan, kabinetsiz, filial doirasida; takror telefonlar `duplicatePhones` da qaytadi |
| Parolni tiklash | amallar → **Kabinet parolini tiklash** | `POST /api/parents/:id/portal-account/reset-password` |

Natija oynasida login/parol **chop etish kartochkalari** (ism + farzandlari) yoki **CSV**.

### Vaqtinchalik parol (o‘quvchi va ota-ona)

Tizim bergan parol `User.mustChangePassword = true` bilan saqlanadi. Birinchi kirishda:
- frontend `/change-password` sahifasiga yo‘naltiradi (`ProtectedRoute`);
- **backend** ham boshqa har qanday so‘rovni `403` + `{field:'code', message:'PASSWORD_CHANGE_REQUIRED'}` bilan rad etadi (`middleware/authenticate.ts`); ochiq: `/auth/me`, `/auth/change-password`, `/auth/logout(-all)`.
Parol almashtirilgach (yoki email orqali tiklangach) bayroq tushadi. Xodim parolni tiklasa — yana qo‘yiladi.

## 2. "Farzandlarim" (TZ §10)

`GET /api/portal/children` → har farzand: ism, ID, kurs, guruh, davomat %, vazifa %, imtihon o‘rtachasi, daraja, qolgan va muddati o‘tgan to‘lov, holat (yumshoq so‘z: "Hammasi yaxshi / E’tibor kerak / Yordam kerak"), keyingi dars.

Frontend: `pages/portal/ChildrenCards.tsx` — bosh sahifa yuqorisida; karta bosilsa o‘sha farzand tanlanadi va **barcha bo‘limlar** unga o‘tadi. Tanlov `portal.activeChild` sozlamasida (qurilmalar orasida).

TZ §10 bo‘limlari va joyi:

| Bo‘lim | Qayerda |
|---|---|
| Dashboard | `/portal` (farzand kartalari + ko‘rsatkichlar + "bugun nima muhim") |
| Attendance | `/portal/attendance` |
| Schedule | bosh sahifa — `LessonsCard` |
| Homework | `/portal/homework`, `/portal/homework/:id` |
| Exams | `/portal/exams`, `/portal/exams/:id` |
| Progress | bosh sahifa — "Progress (6 oy)" grafigi |
| Curriculum | bosh sahifa — `CurriculumCard` |
| XP | `/portal/xp` |
| Certificates | bosh sahifa — `MyCertificatesCard` |
| Payments / Debt | `/portal/payments` + farzand kartasidagi qarz |
| Notifications | `/portal/notifications` + qo‘ng‘iroqcha |

Begona farzand: barcha endpointlar `requireOwnStudent` → 403 (`tests/portal.test.ts`, `tests/parentPortal.test.ts`).

## 3. Haftalik hisobot (TZ §11)

Servis: `services/weeklyReport.service.ts` — **bitta** manba (web, xodim, Telegram, bildirishnoma).

| Bo‘lim | Manba |
|---|---|
| Student | ism, ID, kurs, guruh |
| Attendance | hafta davomati (keldi/kechikdi/sababli/kelmadi, foiz, kelmagan kunlar) |
| Homework | muddati shu haftadagi vazifalar: topshirilgan, o‘rtacha %, topshirilmagan |
| Exam | shu hafta baholangan natijalar |
| XP | hafta XP, jami, daraja |
| Progress | kurs % va shu hafta o‘tilgan mavzular |
| Weak / Strong topics | oxirgi 30 kun imtihon javoblari mavzu kesimida: < 60% — mashq kerak, ≥ 85% — kuchli |
| Teacher feedback | vazifa va imtihon izohlari (muallifi bilan) |
| Xulosa | qisqa, **yumshoq** jumlalar — faqat mavjud ma’lumotdan |

Hafta: dushanba 00:00 — keyingi dushanba (o‘quv markaz vaqti). Kelajak hafta — 422.

| Kanal | Qanday |
|---|---|
| Web | `/portal/weekly-report` — hafta tanlash, **PDF / chop etish** (brauzer "PDF sifatida saqlash"; sarlavha va menyu chop etilmaydi) |
| Xodim | O‘quvchi profili → **Haftalik hisobot** (`GET /api/students/:id/weekly-report`, o‘qituvchi — faqat o‘z guruhi) |
| Telegram | `/hisobot` buyrug‘i va menyu tugmasi (oldingi/joriy hafta) |
| Avtomatik | `jobs/weeklyReport.job.ts` — **yakshanba 18:00** dan keyin; kabineti yoki Telegrami bor o‘quvchi va ota-onaga; `WEEKLY_REPORT` bildirishnoma (ilova ichida + Telegram), `dedupeKey = weekly-report:<o‘quvchi>:<hafta>` — bir marta |

## 4. Avtomatik eslatmalar ota-onaga

Avtomatlashtirish qoidasi auditoriyasi `PARENT` bo‘lsa (ketma-ket kelmaslik, to‘lov muddati yaqin/o‘tgan) xabar endi **ota-onaga** — ilova ichida va Telegramda (`notifyStudentAudience`). Oldin faqat o‘quvchining Telegramiga ketardi. `STUDENT` — o‘quvchining o‘ziga.

## 5. Testlar

| Fayl | Nima |
|---|---|
| `tests/parentPortal.test.ts` | vaqtinchalik parol bloki; xodim bayroqsiz; telefon bilan kirish (4 xil yozuv) va takror telefon; ommaviy ochish + tiklash; "Farzandlarim"; hisobot ma’lumotlari; kabinet/xodim/begona/kelajak; job (vaqt, ikki kanal, bir marta); `PARENT` auditoriyasi |
| `tests/telegramStudent.test.ts` | `/hisobot`, hafta navigatsiyasi, buzilgan/kelajak sana |
| `e2e/specs/portal.spec.ts` | ota-ona telefon bilan kiradi → parolni almashtiradi → Farzandlarim → Hisobot |
