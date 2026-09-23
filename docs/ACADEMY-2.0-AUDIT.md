# ACADEMY CRM 2.0 — mavjud tizim auditi va rivojlantirish rejasi

**Sana:** 2026-09-23 · **Asos:** `promt2.md` (36 bo'lim, 12 bosqich) · **Holat:** PHASE 1 (audit + arxitektura)

Bu hujjat `promt2.md` ning 36-bo'limida so'ralgan A–O natijalarini beradi: avval mavjud tizim
qanday qurilganini faktlar bilan ko'rsatadi, keyin yangi talablarni shu arxitektura bilan
solishtiradi va bosqichma-bosqich reja taklif qiladi.

> **Asosiy xulosa:** CRM allaqachon o'rtacha darajadagi tijoriy mahsulotdan kuchliroq poydevorga ega —
> 60 model, 261 endpoint, 73 ruxsat, 471 avtomatik test, CI/CD va production deployment. `promt2.md` dagi
> 36 talabning **11 tasi to'liq bajarilgan**, **13 tasi qisman**, **12 tasi yo'q**. Shuning uchun ish
> "noldan qurish" emas, mavjud modullarni kengaytirish bo'ladi.

---

## A. Mavjud arxitektura auditi

| Qatlam | Holat |
|---|---|
| **Monorepo** | npm workspaces: `backend`, `frontend` + umumiy `e2e/`, `docs/`, `deploy/`, `scripts/` |
| **Backend** | Node.js 24, TypeScript 6, Express 5, Prisma 7.10 (`prisma-client` generator, ESM), PostgreSQL 17 |
| **Frontend** | React 19, Vite 8, Tailwind 4, TanStack Query 5, Zustand 5, React Router 7, RHF+Zod, Recharts 3 |
| **Autentifikatsiya** | JWT access (xotirada) + refresh token httpOnly cookie (`sameSite: strict`, sha256 hash bilan saqlanadi), familyId bilan sessiya oilasi, Web Locks API orqali tablar aro yagona refresh |
| **Avtorizatsiya** | 73 ruxsat × 7 rol; `requirePermission` / `requireAnyPermission` middleware + servis ichidagi **ownership** cheklovlari (lead scope, `onlyOwnGroups`, `userId = actor.id`) |
| **API** | 261 endpoint, 29 route fayli, hammasi `/api` ostida; zod validatsiyasi har bir kirishda; xatolar yagona `errorHandler` orqali (422 — validatsiya, 409 — konflikt va h.k.) |
| **Fon vazifalari** | 5 job, `setInterval` + `unref()`, `dedupeKey` bilan takrorlanishdan himoya (cron kutubxonasi yo'q) |
| **Deployment** | Docker Compose (postgres → migrate → backend → frontend/Nginx), host Nginx + Let's Encrypt, GitHub Actions CI/CD, kunlik `pg_dump` zaxira |
| **Hujjatlar** | `docs/`: ARCHITECTURE.md, DEPLOYMENT.md, HOSTING-VA-DOMEN.md, CI-CD.md, TZ.html/TZ.pdf |

**Kuchli tomonlar:** yagona moliyaviy daftar (ledger) tamoyili, idempotent to'lovlar, audit izi, ruxsat
matritsasi, SQL darajasidagi agregatsiya (dashboard 60–70 ms), izchil dizayn tizimi, real E2E testlar.

**Arxitektura tamoyillari (yangi modullar ham shularga bo'ysunishi kerak):**

1. Har bir pul harakati — aynan bitta `Transaction` yozuvi (`payment`, `income`, `expense`, `paymentRefund`
   1:1 bog'lanadi). Pul yozuvi hech qachon fizik o'chirilmaydi: `status = VOID/REVERSED`.
2. Har bir muhim amal — `AuditLog` (kim, nima, qachon, IP, user-agent, metadata).
3. Takrorlanishdan himoya: `dedupeKey` (notification, alert, XP) va `idempotencyKey` (to'lov),
   `sourceKey` (komissiya).
4. Ruxsat backendda tekshiriladi; frontenddagi `PermissionGate` faqat UX uchun.
5. Katalog modellari bir xil naqshda: `key @unique` + `name` + `isActive` + `sortOrder`.

---

## B. Mavjud modullar

| Modul | Nimalar bor |
|---|---|
| **Lead / sotuv** | Lead kartochkasi, 9 statusli pipeline, Kanban (drag-drop), qo'ng'iroqlar, follow-up (eslatma + kechikish), izohlar, faoliyat tarixi, manbalar, eksport, sotuv rejalari (`SalesTarget`) |
| **O'quvchi** | Shartnoma narxi, guruh, holat, qarz (`Debt` 1:1), to'lov jadvali (`PaymentInstallment`), guruh almashtirish tarixi, ota-ona bog'lanishi, hujjatlar, oylik progress snapshot |
| **O'quv jarayoni** | Kurslar, guruhlar (jadval, xona matni, sig'im), dars seanslari, davomat (4 holat), uy vazifasi + topshiriqlar, imtihonlar + natijalar |
| **Gamifikatsiya** | XP qoidalari, XP tranzaksiyalari (dedupe), darajalar, nishonlar, streak, reyting |
| **Moliya** | Yagona daftar (`Transaction`), kassalar, tushum/xarajat + kategoriyalar, xarajat tasdiqlash oqimi, takroriy xarajatlar, budjet (reja/fakt), moliyaviy oyni yopish/ochish, pul oqimi va foyda-zarar hisobotlari |
| **To'lov** | Kvitansiya, 7 usul, idempotentlik, takroriy to'lovdan himoya, bekor qilish, qaytarish (`PaymentRefund`), qarzni qayta hisoblash |
| **Maosh** | O'qituvchi profili, maosh modellari (FIXED/PER_LESSON/PER_STUDENT/PERCENTAGE/MIXED), oylik davr (hisoblash → tasdiqlash → to'lash), komissiya yozuvlari, bonus/jarima, davrni qulflash/ochish |
| **HR** | Xodimlar (`Employee`), lavozim va holat, xodim hujjatlari (shartnoma/pasport/sertifikat), hujjat muddati ogohlantirishi |
| **Analitika** | Dashboard (rolga moslashadi), Direktor paneli (sog'lomlik bahosi, prognoz, xulosalar), unit economics (CAC/LTV), rentabellik, kohortlar, lead manbalari ROI, 16 turdagi hisobot + eksport |
| **Tizim** | 73 ruxsat / 7 rol matritsasi, audit jurnali, bildirishnomalar (11 tur), 14 qoidali ogohlantirish tizimi, kunlik xulosa, global qidiruv (9 bo'lim), faoliyat lentasi, fayl hujjatlari, sozlamalar |

---

## C. Ma'lumotlar bazasi sxemasi

**60 model, 42 enum, 18 migratsiya.** Modullar bo'yicha: auth/RBAC 6, lead/sotuv 7, o'quvchi 5,
o'quv jarayoni 8, gamifikatsiya 7, moliya 12, maosh/HR 7, tizim 6.

Muhim jihatlar:

- **Soft delete faqat 5 modelda:** User, Lead, Student, Payment, Document. Qolganlarda o'rniga
  status/void mexanizmi (`Transaction.status`, `PayrollAdjustment.voidedAt`, `FinancialPeriod.closedAt`).
- **Tarix modellari:** `AuditLog`, `LeadActivity`, `StudentGroupChange` (guruh nomi snapshot bilan),
  `CommissionEntry` (ACCRUAL/REVERSAL/CARRY_OVER), `TeacherSalaryRule` (effectiveFrom/To),
  `XpTransaction`, `StudentProgressSnapshot`, `PaymentRefund`.
- **Polimorfik naqsh:** `entityType`/`entityId` — `Document`, `Transaction`, `Alert`, `AuditLog`,
  `Notification`, `XpTransaction` da. Yangi obyekt turlarini model o'zgartirmasdan bog'lash mumkin.
- **Ma'lumot yaxlitligi:** SQL CHECK constraintlar (narx ≥ 0, sana tartibi, `documents_owner_check`,
  maosh davri egasi aynan bitta), kompozit unique (`(studentId, groupId, date)`, `(examId, studentId)`,
  `(year, month)` va h.k.), GIN trigram indekslari (lead/student qidiruvi uchun).
- **Statuslar:** `StudentStatus` = ACTIVE, FROZEN, COMPLETED, DROPPED, GRADUATED;
  `LeadStatus` = NEW, CONTACTED, INTERESTED, TRIAL_BOOKED, TRIAL_ATTENDED, NEGOTIATION, WON, LOST, CALLBACK.

---

## D. API tuzilmasi

29 route fayli, **261 endpoint**. Yiriklari: moliya 39, maosh/o'qituvchi 30, o'quvchi 19, lead 15,
uy vazifasi/imtihon 13, ogohlantirish/reja 12, gamifikatsiya 11, auth 11.

Himoya qatlamlari:

1. `authenticate` — har so'rovda foydalanuvchi bazadan tekshiriladi (o'chirilgan/bloklangan bo'lsa 401,
   parol o'zgargan bo'lsa eski token yaroqsiz).
2. `requirePermission(...)` (AND) yoki `requireAnyPermission(...)` (OR).
3. Servis ichidagi **ownership**: lead scope (`lead.view_all` yo'q → faqat o'ziga biriktirilgan),
   `onlyOwnGroups` (o'qituvchi faqat o'z guruhi), `userId = actor.id` (bildirishnoma, sozlama, komissiya).
4. Rate limit: umumiy 300/min, `authLimiter` 10/15daq, `passwordResetLimiter` 5/soat, `heavyLimiter` 30/min
   (eksport, hisobot, qidiruv, analitika).

Eksport tashqi kutubxonasiz (`utils/tableExport.ts`): CSV (BOM + formula injection himoyasi) va XLSX
(qo'lda zip), 5000 qator limiti, 8 ta eksport endpointi.

---

## E. Ruxsatlar (RBAC)

**73 ruxsat, 27 modul, 7 tizim roli.**

| Rol | Ruxsat | Tamoyil |
|---|---|---|
| SUPER_ADMIN | 72 | Hammasi (`commission.view_own` dan tashqari) |
| OWNER (Direktor) | 71 | Hammasi − `role.manage` |
| ADMIN | 65 | − user.manage, role.manage, settings.manage, salary.unlock, finance.reopen, expense.approve, alert.manage |
| ACCOUNTANT | 24 | Moliya, to'lov, qarz, maosh (hisoblash/to'lash), hisobotlar |
| SALES_MANAGER | 19 | Lead ishi + biriktirish + o'quvchiga aylantirish + rejalar |
| TEACHER | 15 | O'z guruhlari: davomat, uy vazifasi, imtihon, gamifikatsiya, "Mening daromadim" |
| CALL_CENTER | 14 | Lead ishi (qo'ng'iroq, follow-up) |

**Kuzatilgan nozik joylar:** `settings.manage` ruxsati hech bir route'da tekshirilmaydi (ishlatilmayapti);
`/profile`, `/notifications`, `/status` sahifalari ruxsatsiz (har qanday kirgan xodimga ochiq — bu to'g'ri,
chunki ular shaxsiy ma'lumot); rol ruxsatlari keshi 60 sekund (ko'p nusxali deploy'da shuncha kechikish).

---

## F. Mavjud muammolar (audit topilmalari)

| № | Muammo | Ta'siri | Holat |
|---|---|---|---|
| F1 | **`SMTP_PASSWORD` ↔ `SMTP_PASS`**: production compose `SMTP_PASSWORD` uzatardi, ilova `SMTP_PASS` o'qiydi | Serverda parol tiklash xatlari yuborilmaydi | ✅ **Tuzatildi** (compose'da moslashtirildi, `SMTP_SECURE` va `PASSWORD_RESET_EXPIRES_MINUTES` ham qo'shildi) |
| F2 | `settings.manage` ruxsati hech bir endpointda tekshirilmaydi | "Umumiy sozlamalar" sahifasi yo'q — sozlamalar faqat seed/bazada | Ochiq (PHASE 11) |
| F3 | Frontend komponent/hook testlari yo'q (faqat 38 ta sof funksiya testi + 14 E2E) | UI regressiyasi faqat E2E bilan ushlanadi | Ochiq (PHASE 12) |
| F4 | Rate limiting testda butunlay o'chirilgan (`skip: () => isTest`) | 429 xatti-harakati hech qachon tekshirilmagan | Ochiq (PHASE 11) |
| F5 | `audit_logs` uchun retention/arxivlash yo'q | Jadval cheksiz o'sadi (perf sinovida 150k yozuv = 62 MB) | Ochiq (PHASE 11) |
| F6 | 11 ta audit amalining o'zbekcha izohi yo'q (`gamification.*`, `attendance_session.*`, `payment_schedule.*`, `student.group_changed`) | UI'da xom kalit ko'rinadi | ✅ **Tuzatildi** (PHASE 1.5 bilan birga) |
| F7 | `NotificationType.TRIAL_LESSON_REMINDER` enum'da bor, lekin hech qayerda yaratilmaydi | O'lik kod | Ochiq |
| F8 | `Student.parentPhone` matn maydoni `Parent` modeli bilan dublikat | Ikki xil "ota-ona telefoni" manbasi | PHASE 3 da birlashtiriladi |
| F9 | Frontenddagi `EXECUTIVE_ROLE_KEYS`, `SUPER_ADMIN_ROLE_KEY`, `OWNER_ROLE_KEY` ishlatilmaydi | O'lik kod | Ochiq (tez tuzatiladi) |
| F10 | `Group.room` — oddiy matn maydoni, xona jadvali/konflikt tekshiruvi yo'q | Ikki guruh bitta xonaga tushishi mumkin | PHASE 5 |
| F11 | Rol ruxsatlari keshi 60 s — ko'p nusxali deploy'da rol o'zgarishi kechikadi | Hozir bitta nusxa ishlaydi, muammo emas; gorizontal kengayishda muhim | PHASE 11 |
| F12 | Parol siyosatida maxsus belgi, parol tarixi, lug'at tekshiruvi yo'q | O'rtacha xavf | PHASE 11 |
| F13 | PWA yo'q (manifest, service worker) | Telefonga "o'rnatib" ishlatish mumkin emas | PHASE 4/12 |
| F14 | Barcha bildirishnomalar faqat ilova ichida (email — faqat parol tiklash) | Xodim CRM'ni ochmasa xabardan bexabar | PHASE 4 (Telegram) |
| F15 | **Davomat foizi ikki xil hisoblanadi:** panel/hisobotda `PRESENT+LATE+EXCUSED`, ogohlantirishda esa `PRESENT+LATE` | Bir guruh uchun ikki xil foiz ko'rinadi | ✅ **Tuzatildi** — yagona ta'rif `utils/attendance.ts` da |
| F16 | Davomat foizi **faqat belgilangan** yozuvlar ustida: o'qituvchi davomat qo'ymagan darslar maxrajga kirmaydi | Foiz sun'iy oshadi | ✅ **Risk hisobida tuzatildi** — maxraj: guruhda o'tkazilgan darslar |
| F17 | **LTV butun tarix, CAC tanlangan davr** bo'yicha hisoblanadi (`analytics.service.ts`) | `LTV:CAC` va `paybackMonths` metodologik jihatdan taqqoslanmaydi | PHASE 8 |
| F18 | Maosh xarajati **ikki xil bazada**: `profitability` — hisoblangan (accrual), P&L — to'langan (kassa) | Bir davr uchun ikki xil foyda chiqadi | PHASE 8 (izoh + tanlov) |
| F19 | Retention faqat `status='DROPPED'` ga tayanadi — to'lamay qo'ygan, lekin statusi yangilanmagan o'quvchi "saqlangan" sanaladi | Retention optimistik | PHASE 2 (risk tizimi statusni avtomatik taklif qiladi) |
| F20 | `attendanceService.mark` 30 kishilik guruh uchun bitta tranzaksiyada har o'quvchiga upsert + XP + streak qayta hisobi (butun tarixni o'qiydi) | Uzoq tranzaksiya, qulf va timeout xavfi | PHASE 11 (bulk yo'l) |

---

## G. `promt2.md` talablari va mavjud arxitektura solishtiruvi

**Belgilar:** ✅ bor · 🟡 qisman (kengaytirish kerak) · ❌ yo'q

| № | Talab | Holat | Mavjud asos / nima yetishmaydi |
|---|---|---|---|
| 1 | Audit | ✅ | Shu hujjat |
| 2 | Student lifecycle (12 status) | 🟡 | `LeadStatus` 9 ta (LEAD→…→WON qamrab olingan), `StudentStatus` 5 ta. **Yetishmaydi:** AT_RISK, ALUMNI; status tarixi (sabab bilan) alohida jadvalda emas |
| 3 | At-risk / churn (health_score) | ❌ | Signallar mavjud (davomat, qarz, muddat, uy vazifasi, imtihon, XP), `StudentProgressSnapshot` va 14 alert qoidasi bor. **Yetishmaydi:** health_score/risk_level/risk_reasons modeli va hisoblagich |
| 4 | Student kabinet | ❌ | STUDENT roli ham, portal ham yo'q. Ma'lumotlar tayyor (`studentProgress.service.ts`) |
| 5 | Parent kabinet | ❌ | `Parent`/`StudentParent` bor, lekin login yo'q (`User` bilan bog'lanmagan) |
| 6 | Telegram bot | ❌ | `telegram` matn maydonlari bor; `digest.service.ts` da `DigestChannel` interfeysi — kanal ulash nuqtasi tayyor |
| 7 | Onlayn to'lov (Click/Payme) | ❌ | `PaymentMethod` da CLICK/PAYME/UZUM bor, `Payment.idempotencyKey` bor. **Yetishmaydi:** provider abstraksiyasi, webhook, imzo tekshiruvi |
| 8 | Xona / jadval konflikti | 🟡 | `Group` jadvali (kun, vaqt, xona matni), `AttendanceSession` `(groupId, date)` unique. **Yetishmaydi:** `Room` modeli, o'qituvchi/xona/guruh konflikt tekshiruvi |
| 9 | Kurrikulum (Module→Topic→Lesson) | ❌ | `AttendanceSession.topic` (matn), `Course.durationMonths` |
| 10 | Imtihon dvigateli (question bank) | 🟡 | `Exam`/`ExamResult` (ball, foiz, grade, o'tish bali) bor. **Yetishmaydi:** savollar bazasi, variantlar, avtomatik baholash, urinishlar, mavzu tahlili |
| 11 | Sertifikat + QR verifikatsiya | ❌ | `DocumentCategory.CERTIFICATE`, `StudentStatus.GRADUATED`, `BadgeRule.COURSE_COMPLETED` |
| 12 | Lead scoring | ❌ | `LeadPriority` (qo'lda), `LeadActivity` tarixi — skoring uchun barcha signal bor |
| 13 | Avtomatik lead taqsimoti | ❌ | Qo'lda biriktirish + `lead.assign` ruxsati + audit bor |
| 14 | Kengaytirilgan sotuv voronkasi | 🟡 | Dashboard funnel, manbalar ROI, managerlar reytingi, kohortlar bor. **Yetishmaydi:** bosqichlararo o'tish vaqti (conversion time) |
| 15 | Referral tizimi | ❌ | `XpSource.REFERRAL` enum, `Source` |
| 16 | Chegirma dvigateli | 🟡 | `Course.discountAmount`, `Student.contractPrice`. **Yetishmaydi:** promokod, qoidalar, stacking, limit, audit |
| 17 | HR moduli | 🟡 | `Employee` (lavozim, holat), xodim hujjatlari, maosh, bonus/jarima. **Yetishmaydi:** shartnoma maydonlari, ta'til, sezgir ma'lumot himoyasi alohida emas |
| 18 | O'qituvchi samaradorligi | 🟡 | Yuklama, davomat, komissiya, "Mening daromadim" bor. **Yetishmaydi:** retention, talaba mamnuniyati, guruh natijalari bo'yicha yagona panel |
| 19 | Feedback / NPS | ❌ | `HomeworkSubmission.feedback`, `ExamResult.comment` |
| 20 | Inventar | ❌ | `Expense`/`ExpenseCategory` (sotib olish yozuvi sifatida) |
| 21 | Multi-branch | ❌ | Hech bir modelda `branchId` yo'q — eng qimmat o'zgarish |
| 22 | AI biznes yordamchisi | ❌ | Barcha ko'rsatkichlar servislarda tayyor — "tool/function" qatlami kerak |
| 23 | Owner intelligence dashboard | ✅ | `ExecutivePage`: sog'lomlik bahosi, prognoz, xulosalar, davr taqqoslash + `AnalyticsPage` (CAC/LTV, kohort, ROI) |
| 24 | Avtomatlashtirish dvigateli | 🟡 | 5 job + 14 alert qoidasi + sozlamalar. **Yetishmaydi:** foydalanuvchi yaratadigan qoidalar (IF→THEN) va automation log |
| 25 | Global qidiruv | ✅ | 9 bo'lim, ruxsat bo'yicha filtr, kod/telefon prefikslari, Ctrl+K |
| 26 | Bildirishnoma markazi | 🟡 | Markaz, filtrlar, o'qilgan/o'qilmagan, 11 tur bor. **Yetishmaydi:** `priority`/`category` (hozir faqat `Alert.severity`) |
| 27 | Mobile-first / PWA | 🟡 | Responsive + Pixel 7 E2E + mobil davomat jurnali. **Yetishmaydi:** PWA (manifest, service worker), "10–15 soniyalik davomat" rejimi |
| 28 | Xavfsizlik | ✅ | RBAC + ownership, brute-force (IP + hisob darajasi), token rotatsiyasi + reuse detection, helmet/CSP, zod, magic-bytes fayl tekshiruvi, log redaction, audit. **Yetishmaydi:** webhook imzosi (webhook yo'q), zaxira verifikatsiyasi |
| 29 | Audit log 2.0 | 🟡 | Kim/nima/qachon/IP/user-agent/metadata bor, append-only, 110 amal, 28 kritik. **Yetishmaydi:** alohida `before`/`after` ustunlari, retention |
| 30 | Unumdorlik | ✅ | Indekslar, SQL agregatsiya (dashboard 276→62 ms), paginatsiya, `heavyLimiter`, N+1 tozalangan |
| 31 | Testlar | ✅ | 471 test (419 backend + 38 frontend + 14 E2E), alohida test/E2E bazalari, coverage 91% |
| 32 | Ma'lumotlar bazasi | ✅ | FK, CHECK, unique, tranzaksiya, idempotentlik, xavfsiz migratsiya tartibi |
| 33 | UX/UI | ✅ | Yagona dizayn tizimi, empty/loading/error/confirm holatlari, qorong'i mavzu |
| 34 | Bosqichma-bosqich ishlash | ✅ | N-bo'limdagi reja |
| 35 | Mavjudni buzmaslik | ✅ | 471 test + E2E himoya sifatida |
| 36 | Natijani A–O ko'rinishida berish | ✅ | Shu hujjat |

**Yakun:** ✅ 11 · 🟡 13 · ❌ 12

---

## H. Taklif qilinayotgan baza o'zgarishlari

Barcha o'zgarishlar **qo'shimcha** (additive): mavjud jadval va ustunlar o'chirilmaydi, mavjud
ma'lumot yo'qolmaydi. Har bir migratsiya `migrate diff` bilan tuziladi va destructive SQL yo'qligi
tekshiriladi (mavjud tartib: `docs/ARCHITECTURE.md`).

| Bosqich | Yangi model / ustun | Izoh |
|---|---|---|
| **2** | `StudentStatusChange` (studentId, fromStatus, toStatus, reason, changedById, changedAt) | `StudentGroupChange` bilan bir xil naqsh |
| **2** | `Student.healthScore Int?`, `Student.riskLevel RiskLevel?`, `Student.riskUpdatedAt`, `StudentRiskFactor` (studentId, key, weight, detail Json) | Risk hisobi; `RiskLevel` = HEALTHY/ATTENTION/AT_RISK/CRITICAL |
| **2** | `StudentStatus` ga `ALUMNI` qo'shiladi | AT_RISK — status emas, alohida o'lcham (quyidagi qarorga qarang) |
| **3** | `Student.userId @unique`, `Parent.userId @unique`; rollar: `STUDENT`, `PARENT` | Kabinetlar uchun login |
| **4** | `TelegramLink` (userId?/studentId?/parentId?, chatId @unique, verifiedAt), `NotificationDelivery` (notificationId, channel, status, attempts, lastError) | Navbat + qayta urinish |
| **4** | `Notification.priority`, `Notification.category` | `promt2.md` §26 talabi |
| **5** | `Room` (key, name, capacity, equipment Json, isActive), `Group.roomId` (eski `room` matni saqlanadi) | Konflikt tekshiruvi uchun |
| **6** | `CourseModule`, `CourseTopic`, `StudentTopicProgress` | Kurrikulum |
| **6** | `Question`, `QuestionOption`, `ExamQuestion`, `ExamAttempt`, `ExamAnswer` | Savollar bazasi va avtomatik baholash |
| **6** | `Certificate` (certificateId @unique, studentId, courseId, issuedAt, result, verifyToken) | QR verifikatsiya |
| **7** | `Lead.score Int?`, `Lead.scoreFactors Json?`, `LeadAssignmentRule`, `Referral` (referrerStudentId, leadId, status, bonusAmount) | Skoring, taqsimot, referral |
| **7** | `DiscountRule`, `PromoCode`, `StudentDiscount` | Chegirma dvigateli + audit |
| **8** | `Employee` ga shartnoma maydonlari, `EmployeeLeave` (ta'til) | HR |
| **8** | `Feedback` (studentId?, teacherId?, courseId?, ratings Json, nps Int?, comment, isAnonymous) | NPS |
| **9** | `Product`, `ProductCategory`, `StockMovement` | Inventar |
| **9** | `Branch` + `branchId` (Group, Student, User, FinancialAccount, Expense, Lead, Room) | **Eng qimmat o'zgarish** — barcha so'rovlarga filial filtri qo'shiladi |
| **10** | `AiQuery` (userId, question, toolCalls Json, answer, durationMs) | AI yordamchisi jurnali |
| **11** | `AuditLog.before Json?`, `AuditLog.after Json?`; `AutomationRule`, `AutomationRun` | Audit 2.0 + qoidalar dvigateli |

### ⚠️ Qaror talab qiladigan nuqta: AT_RISK status sifatidami yoki alohida o'lchovmi?

`promt2.md` §2 da AT_RISK o'quvchi statuslari ro'yxatida turibdi. Lekin mavjud `StudentStatus`
biznes holatini bildiradi (faol / muzlatilgan / tashlab ketgan / bitirgan) va **to'lov, maosh,
davomat, hisobot mantig'i shunga bog'langan** (masalan `status: ACTIVE` bo'yicha qarzdorlik hisobi).

| Variant | Ijobiy | Salbiy |
|---|---|---|
| **A. AT_RISK ni alohida `riskLevel` maydoni sifatida** (tavsiya) | O'quvchi bir vaqtda ACTIVE va AT_RISK bo'la oladi; mavjud hisobot va to'lov mantig'i buzilmaydi; risk avtomatik hisoblanadi | `promt2.md` matnidan chetlashish |
| B. AT_RISK ni `StudentStatus` ga qo'shish | Matnga so'zma-so'z mos | Risk paytida "faol"ligi yo'qoladi; davomat/qarz/maosh hisoblari buziladi; har statusdan qaytish mantig'i murakkablashadi |
| C. Ikkalasi ham | — | Ikki manbali haqiqat, chalkashlik |

**✅ QABUL QILINGAN QAROR (2026-09-23): A variant.** Status = hayot sikli, risk = o'lchov.
UI'da o'quvchi kartochkasida ikkalasi yonma-yon ko'rsatiladi ("Faol · Xavf: yuqori"), ro'yxatda esa
risk bo'yicha alohida filtr bo'ladi. `StudentStatus` ga faqat `ALUMNI` qo'shiladi; mavjud qiymatlar
va ularga bog'liq to'lov/qarz/davomat/maosh mantig'i o'zgarmaydi.

---

## I. Taklif qilinayotgan API o'zgarishlari

Mavjud 261 endpointning **kontrakti o'zgarmaydi** (faqat javoblarga yangi maydon qo'shilishi mumkin —
bu mavjud klientni buzmaydi). Yangi endpointlar:

| Bosqich | Yangi yo'l | Ruxsat |
|---|---|---|
| 2 | `GET /api/students/:id/risk`, `GET /api/students/at-risk`, `POST /api/students/:id/status` (sabab bilan), `GET /api/students/:id/status-history` | `student.view` / `student.manage` |
| 3 | `GET /api/portal/me`, `/portal/attendance`, `/portal/homework`, `/portal/exams`, `/portal/payments`, `/portal/children`, `POST /portal/switch-child` | Yangi `portal.student` / `portal.parent` |
| 4 | `POST /api/telegram/link`, `POST /api/telegram/webhook` (imzo tekshiruvi bilan), `GET/PUT /api/notifications/preferences` | Ownership |
| 5 | `GET/POST/PUT /api/rooms`, `GET /api/schedule/conflicts` | `group.view` / `group.manage` |
| 6 | `/api/curriculum/*`, `/api/questions/*`, `/api/exams/:id/attempts`, `/api/certificates/*`, ochiq `GET /verify/:certificateId` | `course.manage`, `exam.*`, ochiq verifikatsiya |
| 7 | `GET /api/leads/:id/score`, `PUT /api/lead-assignment-rules`, `/api/referrals/*`, `/api/discounts/*` | `lead.*`, `payment.create` |
| 8 | `/api/feedback/*`, `GET /api/teachers/:id/performance` | `teacher.view`, ochiq so'rovnoma havolasi |
| 9 | `/api/inventory/*`, `/api/branches/*` | Yangi `inventory.*`, `branch.*` |
| 10 | `POST /api/ai/ask` | Yangi `ai.use` (faqat OWNER/ADMIN) |
| 11 | `/api/automations/*` | Yangi `automation.manage` |

**Qoida:** har bir yangi endpoint — zod validatsiyasi + `requirePermission` + ownership +
audit yozuvi + integratsion test. Ruxsat ro'yxati 73 dan ~90 gacha o'sadi.

---

## J. Taklif qilinayotgan frontend sahifalari

| Bosqich | Sahifa | Kim uchun |
|---|---|---|
| 2 | O'quvchilar ro'yxatiga risk ustuni + filtr; o'quvchi profiliga "Xavf" bloki; Dashboardga "Kritik o'quvchilar" vidjeti | Admin, Owner, o'qituvchi |
| 3 | `/portal` — o'quvchi kabineti (XP, daraja, davomat, uy vazifasi, imtihon, jadval, qarz, yutuqlar) | O'quvchi |
| 3 | `/portal/parent` — farzandlar ro'yxati + almashtirish, har biri bo'yicha ko'rsatkichlar | Ota-ona |
| 4 | Bildirishnoma sozlamalari (kanal va tur bo'yicha yoqish/o'chirish), Telegram ulash sahifasi | Hamma |
| 5 | `/rooms` — xonalar va band qilish jadvali (hafta ko'rinishi), konflikt ogohlantirishi | Admin |
| 6 | `/curriculum` (kurs → modul → mavzu), `/questions` (savollar bazasi), `/certificates` + ochiq `/verify/:id` | O'qituvchi, admin, tashqi |
| 7 | Lead kartochkasida skor va sabablari; `/referrals`; `/discounts` (qoidalar va promokodlar) | Manager, admin |
| 8 | `/feedback` (natijalar, NPS), o'qituvchi samaradorligi paneli | Owner, admin |
| 9 | `/inventory`; filial tanlash (Topbar'da) | Admin, Owner |
| 10 | `/assistant` — AI savol-javob oynasi | Owner |
| 11 | `/automations` (IF→THEN qoidalar konstruktori), `/settings` (umumiy sozlamalar — F2) | Admin |

Barcha yangi sahifalar mavjud dizayn tizimidan foydalanadi (`components/ui/*`), empty/loading/error
holatlari bilan; mavjud sahifalar **qayta dizayn qilinmaydi**.

---

## K. Taklif qilinayotgan avtomatlashtirish qoidalari

Hozir 14 alert qoidasi + 5 job qattiq kodda. Taklif: `AutomationRule` jadvali (trigger, shart, amal,
kanal, faol/nofaol) + `AutomationRun` jurnali. Mavjud qoidalar shu dvigatelga ko'chiriladi
(xatti-harakat o'zgarmaydi), keyin admin yangilarini qo'sha oladi.

| Trigger | Shart | Amal | Hozirgi holat |
|---|---|---|---|
| Davomat | ketma-ket 2 marta kelmadi | o'qituvchi + ota-onaga xabar | ❌ yangi |
| To'lov jadvali | muddatgacha 3 kun | o'quvchi/ota-onaga eslatma | 🟡 `PAYMENT_OVERDUE` alerti bor, oldindan eslatma yo'q |
| To'lov | muddati o'tdi | manager + buxgalterga xabar | ✅ `debtReminder.job` |
| Risk | `riskLevel = CRITICAL` | adminga xabar | ❌ yangi (PHASE 2) |
| Follow-up | muddati o'tdi | managerga xabar | ✅ `followUpReminder.job` |
| Sertifikat | kurs yakunlandi | o'quvchiga xabar | ❌ yangi (PHASE 6) |
| Inventar | qoldiq minimumdan past | adminga xabar | ❌ yangi (PHASE 9) |
| Budjet | kategoriya bo'yicha oshib ketdi | rahbarlarga xabar | ✅ `BUDGET_EXCEEDED` |
| Hujjat | amal muddati tugayapti | HR ga xabar | ✅ `DOCUMENT_EXPIRING` |

---

## L. Xavfsizlik risklari (yangi modullar bo'yicha)

| Risk | Qayerda | Qanday yopiladi |
|---|---|---|
| **Kabinetlarda ma'lumot chalkashishi** | O'quvchi/ota-ona boshqa o'quvchi ma'lumotini ko'rishi | Portal endpointlari faqat `userId → studentId` bog'lanishi orqali; har bir portal endpointiga alohida ownership testi; portal rollariga xodim ruxsatlari **umuman berilmaydi** |
| **Telegram bot tokeni** | `.env` / sozlamalar | Faqat env orqali, logga chiqmaydi (`logger.redact` ro'yxatiga qo'shiladi); webhook uchun `secret_token` sarlavhasi tekshiriladi |
| **To'lov webhook'i** | Click/Payme kiruvchi so'rovlari | HMAC imzo (`timingSafeEqual`), takrorlangan webhook uchun idempotentlik (mavjud `idempotencyKey` naqshi), summa va o'quvchi mosligini qayta tekshirish, hammasi audit |
| **AI yordamchisi** | Tabiiy til → ma'lumot | **Xom SQL umuman yo'q**: faqat oldindan yozilgan "tool" funksiyalari (masalan `getRevenue(period)`), har biri chaqiruvchining ruxsati bilan ishlaydi; savol va javob `AiQuery` ga yoziladi; shaxsiy ma'lumot (telefon, parol) tool javoblariga kiritilmaydi |
| **Multi-branch** | Filial ma'lumotlari aralashishi | `branchId` har bir so'rovda majburiy filtr (servis darajasida, controllerga tashlab qo'yilmaydi) + E2E testlar |
| **Sertifikat verifikatsiyasi** | Ochiq `/verify/:id` | Faqat `certificateId` bo'yicha o'qish, shaxsiy ma'lumot minimal (ism, kurs, sana), rate limit |
| **Portal trafigi** | 1000+ o'quvchi/ota-ona | Alohida rate limit guruhi, kesh, og'ir so'rovlar taqiqlanadi |

---

## M. Unumdorlik risklari

| Risk | Baho | Yechim |
|---|---|---|
| Risk hisobi barcha o'quvchilar bo'yicha | 1000 o'quvchi × 6 signal = og'ir | Bitta SQL agregatsiya (mavjud `scheduleDueStats` naqshi), job'da 30 daqiqada bir marta, natija `Student` ustunlariga keshlanadi |
| Telegram yuborish | Har xabar tashqi HTTP | Navbat (`NotificationDelivery`) + partiyali yuborish + qayta urinish; asosiy so'rov kutib qolmaydi |
| Portal trafigi | Foydalanuvchi soni ~10× oshadi | Portal so'rovlari yengil (faqat o'z ma'lumoti), indekslar mavjud; `heavyLimiter` portal uchun ham |
| `audit_logs` o'sishi | 150k yozuv = 62 MB (o'lchangan) | Retention: 12 oydan eskisini arxiv jadvalga ko'chirish (PHASE 11) |
| Savollar bazasi va imtihon urinishlari | Har urinish = N javob yozuvi | Kompozit indeks `(examAttemptId, questionId)`, natija yakunda agregatsiya qilinadi |
| Multi-branch | Har so'rovga qo'shimcha filtr | Mavjud indekslarga `branchId` prefiksi qo'shiladi (yangi kompozit indekslar) |
| `alertService.evaluate` har 30 daqiqada 14 og'ir qoidani parallel ishga tushiradi (ichida `cashFlowStatement` to'liq qayta hisoblanadi) | O'sish bilan bazaga tishli yuk | Qoidalarni partiyalarga bo'lish, kassa prognozini keshlash (PHASE 11) |
| Analitika to'liq on-demand (kesh, materialized view yo'q): `unitEconomics`, `profitability`, `cohorts` barcha to'lov/o'quvchi qatorlarini JS'ga yuklaydi | 5 000+ o'quvchida sekinlashadi | Oylik agregat jadval yoki materialized view (PHASE 11) |
| Hisobot qatorlari 1000 ta bilan cheklangan (eksportda ham) | Yirik markazda to'liq eksport yo'q | Oqimli (streaming) eksport (PHASE 12) |

---

## N. Bosqichlar rejasi

`promt2.md` §34 dagi 12 bosqich saqlanadi. Har bosqich oxirida: code review → typecheck → lint →
unit + integratsion testlar → E2E → migratsiya tekshiruvi → ruxsat tekshiruvi → regressiya.

| Bosqich | Mazmuni | Yangi model | Baho |
|---|---|---|---|
| **1** | Audit + arxitektura | — | ✅ **Tugadi** (shu hujjat + F1 tuzatildi) |
| **1.5** | Filial poydevori (`Branch` + `branchId` + scope) | 1 + 10 ustun | ✅ **Tugadi** |
| **2** | Student lifecycle + risk/churn tizimi | 1 + 4 ustun | ✅ **Tugadi** |
| **3** | O'quvchi va ota-ona kabinetlari | 2 ustun + 2 rol | ✅ **Tugadi** |
| **4** | Telegram + bildirishnoma avtomatlashtirish | 2 | ✅ **Tugadi** |
| **5** | Jadval + xona boshqaruvi | 1 | ✅ **Tugadi** |
| **6** | Kurrikulum + imtihon dvigateli + sertifikat | 9 | 🔄 2/3 qism tugadi |
| **7** | Lead scoring + sotuv + referral + chegirma | 6 | Katta |
| **8** | HR + o'qituvchi analitikasi + NPS | 3 | O'rta |
| **9** | Inventar (+ filial UI'ni to'ldirish) | 3 | O'rta |
| **10** | AI biznes yordamchisi | 1 | O'rta |
| **11** | Xavfsizlik + unumdorlik + avtomatlashtirish dvigateli | 2 | O'rta |
| **12** | To'liq testlar + production tayyorligi | — | O'rta |

### ✅ QABUL QILINGAN QAROR (2026-09-23): filial poydevori — PHASE 1.5

Markaz **1 yil ichida filial ochishni rejalashtirgan**. Shuning uchun `Branch` poydevori
9-bosqichdan **1.5-bosqichga** ko'chiriladi: har bir yangi model (kabinetlar, kurrikulum,
inventar, sertifikat) darhol `branchId` bilan tug'iladi va keyinchalik 25+ jadvalga ustun
qo'shib, barcha so'rovni qayta yozish kerak bo'lmaydi.

**PHASE 1.5 qamrovi (faqat poydevor, to'liq multi-branch UI emas):**

| Qadam | Ish |
|---|---|
| 1 | `Branch` modeli (`key`, `name`, `address`, `phone`, `isActive`, `sortOrder` — mavjud katalog naqshi) |
| 2 | `branchId` qo'shiladi: `User`, `Employee`, `Lead`, `Student`, `Group`, `Payment`, `Transaction`, `Income`, `Expense`, `FinancialAccount` (qolganlari — `Debt`, `Attendance`, `Homework`, `Exam`, maosh — ota yozuvidan kelib chiqadi) |
| 3 | Migratsiya: "Asosiy filial" yaratiladi va **barcha mavjud yozuvlar unga biriktiriladi** (ma'lumot yo'qolmaydi), keyin ustunlar `NOT NULL` qilinadi |
| 4 | Servis qatlamida yagona `branchScope(actor)` yordamchisi (mavjud `leadAccess.ts` / `onlyOwnGroups` naqshi bo'yicha) — filtr controllerlarga tashlab qo'yilmaydi |
| 5 | Yangi ruxsatlar: `branch.view_all` (Owner/Super Admin — barcha filial), `branch.manage`; `User.branchId` — xodim qaysi filialda ishlashi |
| 6 | Frontend: Topbar'da filial tanlash (faqat bir nechta filial bo'lsa ko'rinadi), formalarda filial maydoni |
| 7 | Testlar: filial izolyatsiyasi (boshqa filial ma'lumoti ko'rinmasligi), backfill migratsiyasi, mavjud 471 test o'zgarishsiz o'tishi |

Bitta filial ishlayotganda foydalanuvchi uchun **hech narsa o'zgarmaydi** — hamma narsa
"Asosiy filial" ostida ishlaydi.

### PHASE 1.5 — bajarilgan ish (2026-09-23)

| Qism | Holat |
|---|---|
| `Branch` modeli + `branchId` 10 ta jadvalda (`users`, `employees`, `leads`, `students`, `groups`, `payments`, `transactions`, `incomes`, `expenses`, `financial_accounts`) | ✅ |
| Migratsiya `20260923061734_branches`: "Asosiy filial" (`branch_main`) yaratiladi, **mavjud barcha yozuvlar unga biriktiriladi**; DROP/TRUNCATE/DELETE yo'q | ✅ Dev bazada tekshirildi: 130 o'quvchi, 11 lead, 18 xodim, 10 guruh, 6 kassa — hammasi joyida |
| Ustunlar `NOT NULL` + `DEFAULT 'branch_main'` — eski kod yo'llari ham ishlaydi, yangi yozuv filialsiz qolmaydi | ✅ |
| `AuthUser.branchId` (autentifikatsiyada o'qiladi) | ✅ |
| `services/branchAccess.ts`: `getBranchAccess`, `branchFilter`, `resolveBranchId`, `assertBranchAccess` | ✅ |
| Ruxsatlar: `branch.view_all`, `branch.manage` (faqat Owner/Super Admin; Admin o'z filiali doirasida) | ✅ 73 → 75 ruxsat |
| API: `GET/POST/PUT /api/branches` | ✅ |
| **Ko'rish doirasi**: o'quvchilar, leadlar (+ qo'ng'iroq, follow-up), guruhlar | ✅ |
| **Yozish doirasi**: o'quvchi (yaratish va leaddan aylantirish), lead, guruh, to'lov (o'quvchi filiali bo'yicha), tushum, xarajat, daftar yozuvlari, xodim, HR xodimi | ✅ |
| Testlar: `tests/branches.test.ts` (7 ta) — asosiy filial, CRUD ruxsatlari, takroriy kalit, asosiy filialni o'chirib bo'lmasligi, Owner hammasini ko'rishi, boshqa filial ma'lumoti ko'rinmasligi, yangi yozuv filialga biriktirilishi | ✅ 426 test (419 + 7), E2E 14/14 |

**Ataylab keyinga qoldirilgan** (ikkinchi filial ochilganda, PHASE 9): moliya/hisobot/analitika
so'rovlarida filial filtri, foydalanuvchi va xodim ro'yxatlarida filtr, Topbar'dagi filial tanlash
paneli va formalardagi filial maydoni. Sabab: bitta filial ishlayotganda bu UI hech narsa qilmaydi,
lekin **ma'lumot to'g'ri filialga yozilishi** — keyinchalik tuzatish qiyin bo'lgan qism — allaqachon
ta'minlangan.

---

## O. PHASE 1 natijasi va PHASE 2 ning aniq rejasi

### PHASE 1 (tugadi)

- Butun kod bazasi 5 yo'nalish bo'yicha inventarizatsiya qilindi (baza, API/ruxsat, frontend,
  biznes mantiq, testlar/xavfsizlik/deployment) — natija: shu hujjat.
- `promt2.md` ning 36 talabi mavjud arxitektura bilan solishtirildi (✅ 11 · 🟡 13 · ❌ 12).
- Topilgan nuqsonlar ro'yxatga olindi (F1–F14); **F1 (SMTP) darhol tuzatildi**.
- Yangi modullar uchun arxitektura qarorlari taklif qilindi (H–M bo'limlari).

### PHASE 2 — Student lifecycle + At-risk (keyingi qadam)

| № | Ish | Fayllar |
|---|---|---|
| 1 | `StudentStatus` ga `ALUMNI`; `RiskLevel` enum; `StudentStatusChange` modeli; `Student` ga `healthScore`, `riskLevel`, `riskUpdatedAt`; `StudentRiskFactor` | `prisma/schema.prisma` + yangi migratsiya |
| 2 | Status o'zgarishini sabab bilan yozish (mavjud `student.service.ts` `updateStatus` kengaytiriladi, `StudentGroupChange` naqshi bo'yicha) | `student.service.ts`, `studentStatusHistory.ts` |
| 3 | Risk hisoblagich: 6 signal → `healthScore` 0–100 va sabablar ro'yxati; bitta SQL agregatsiya. **Mavjud kod qayta ishlatiladi:** `executive.service.ts` dagi `scale(value, bad, good)` + vaznli o'rtacha + `null`-aware mantiq (ma'lumoti yo'q signal bahoni buzmaydi), chegaralar esa `alert.service.ts` sozlamalaridan olinadi (`attendanceWarning/Critical`, `dropoutAbsences`, `debtSharePercent`, `paymentOverdueDays`) — ya'ni ogohlantirish va risk bitta haqiqatdan ishlaydi | yangi `studentRisk.service.ts` |
| 3a | **F15 tuzatiladi:** davomat foizining yagona ta'rifi bitta yordamchiga chiqariladi (`PRESENT+LATE+EXCUSED`), `alert.service.ts` ham shuni ishlatadi | `attendanceAnalytics.service.ts`, `alert.service.ts` |
| 3b | **F16 tuzatiladi:** risk hisobida maxraj — guruh jadvali bo'yicha kutilgan darslar (belgilanmagan darslar ham hisobga olinadi) | `studentRisk.service.ts` |
| 4 | Job: har 30 daqiqada qayta hisoblash (mavjud job naqshi, `dedupeKey` bilan) + `CRITICAL` uchun alert/bildirishnoma | yangi `jobs/studentRisk.job.ts`, `alert.service.ts` |
| 5 | API: `GET /students/at-risk`, `GET /students/:id/risk`, `GET /students/:id/status-history`, `POST /students/:id/status` (sabab) | `student.routes.ts`, validatorlar |
| 6 | UI: o'quvchilar ro'yxatida risk ustuni va filtri, profilda "Xavf" bloki (sabablar bilan), Dashboardda "Kritik o'quvchilar" vidjeti | `StudentsPage`, `ProfileTabs`, `DashboardPage` |
| 7 | Testlar: risk hisobi unit testlari, API ruxsat testlari, status tarixi integratsion testi, E2E (risk filtri) | `backend/tests/`, `e2e/specs/` |

**Buzilmasligi kafolatlanadigan joylar:** mavjud `StudentStatus` qiymatlari o'zgarmaydi (faqat yangi
qiymat qo'shiladi), `students` ro'yxati va profil API javoblari eski maydonlarni saqlaydi.

### PHASE 2 — bajarilgan ish (2026-09-23)

| Qism | Holat |
|---|---|
| `RiskLevel` enum, `StudentStatus.ALUMNI`, `Student.healthScore/riskLevel/riskFactors/riskUpdatedAt`, `StudentStatusChange` modeli | ✅ migratsiya `20260923..._student_risk` (DROP/TRUNCATE/DELETE yo'q) |
| `services/studentRisk.service.ts` — 6 signal (davomat, ketma-ket kelmaslik, qarz, to'lov kechikishi, uy vazifasi, imtihon), vazn bilan o'rtacha, `null`-aware | ✅ 123 o'quvchida 300 ms |
| Chegaralar `alerts.settings` dan olinadi — ogohlantirish va risk **bitta haqiqatdan** ishlaydi | ✅ |
| Yangi o'quvchi qarzi uchun kritik deb belgilanmaydi (`debtGraceDays` imtiyoz muddati) | ✅ real ma'lumotda sinovdan o'tdi: 99 ta soxta "kritik" → 1 ta haqiqiy |
| Yetarli ma'lumot bo'lmasa daraja berilmaydi (`MIN_SCORED_WEIGHT`) | ✅ |
| `jobs/studentRisk.job.ts` — har 30 daqiqada qayta hisoblash | ✅ |
| API: `GET /students/at-risk`, `/students/:id/risk`, `/students/:id/status-history`, `PATCH /students/:id/status` (sabab bilan) + ro'yxatda `riskLevel` filtri | ✅ |
| UI: ro'yxatda "Xavf" ustuni va filtri, profilda "Ketib qolish xavfi" bloki (signal chiziqlari bilan), Dashboard vidjeti, holat modalida sabab maydoni | ✅ brauzerda tekshirildi |
| Testlar: `tests/studentRisk.test.ts` (9 ta) | ✅ 435 test, E2E 14/14, frontend 38 |

**Audit rejasidan chetlanish:** `StudentRiskFactor` alohida jadvali o'rniga `Student.riskFactors` (JSON)
ishlatildi — sabablar har 30 daqiqada qayta hisoblanadigan **hosila** qiymat, alohida jadval bo'lsa
har hisobda yuzlab qator o'chirilib qayta yozilardi.

### PHASE 3 — bajarilgan ish (2026-09-23)

| Qism | Holat |
|---|---|
| `Student.userId` va `Parent.userId` (unique, `SET NULL`) — kabinet hisobi | ✅ migratsiya `..._portal_accounts` |
| Yangi rollar: `STUDENT` va `PARENT` — **aynan bitta** ruxsat bilan (`portal.student` / `portal.parent`) | ✅ |
| `portal.student` / `portal.parent` rahbar rollariga **berilmaydi** (aks holda rahbarning o'zi kabinetga tushib qolardi) | ✅ testda qat'iy tekshiriladi |
| `services/portal.service.ts` — kirish huquqi faqat `User → Student/Parent` bog'lanishi orqali; so'rovdagi `studentId` ga **ishonilmaydi**, har safar qayta tekshiriladi | ✅ |
| `services/portalAccount.service.ts` — xodim (`portal.manage`) kabinet ochadi, parol tizim tomonidan generatsiya qilinadi va faqat bir marta ko'rsatiladi (bazada bcrypt hash) | ✅ |
| API: `GET /portal/me`, `/portal/profile`, `/portal/schedule`; `POST /students/:id/portal-account`, `POST /parents/:id/portal-account` | ✅ |
| Frontend: alohida `PortalLayout` (xodim menyusisiz), `/portal` sahifasi (daraja/XP, davomat, uy vazifasi, imtihon, to'lov jadvali, hodisalar, yutuqlar), ota-ona uchun farzand tanlash, xodimlar sahifasida "Kabinet ochish" oynasi | ✅ brauzerda tekshirildi |
| Marshrut himoyasi: kabinet foydalanuvchisi xodim sahifalariga kira olmaydi va aksincha | ✅ |
| Testlar: `tests/portal.test.ts` (7 ta izolyatsiya testi) | ✅ 442 test, E2E 14/14 |

**Yo'l-yo'lakay tuzatilgan operatsion nuqson:** yangi ruxsat qo'shilganda u mavjud tizim rollariga
yetib bormasdi (faqat `SEED_RESET_PERMISSIONS=true` bilan). Endi `seedRolesAndPermissions` shu
yurishda **yangi paydo bo'lgan** ruxsatlarni tizim rollariga qo'shadi; Super Admin qo'lda sozlagan
huquqlarga tegilmaydi.

### PHASE 4 — bajarilgan ish (2026-09-23)

| Qism | Holat |
|---|---|
| `TelegramLink` — chat bog'lanishi; egasi **aynan bitta**: xodim, o'quvchi yoki ota-ona (baza CHECK bilan) | ✅ |
| `NotificationDelivery` — yetkazish navbati (outbox): `PENDING/SENT/FAILED/SKIPPED`, urinishlar soni, `nextAttemptAt` bilan backoff (1, 4, 9, 16 daqiqa), 5 urinishdan keyin to'xtatiladi | ✅ |
| `NotificationType` ga `CHILD_ABSENT`, `PAYMENT_DUE_SOON` | ✅ |
| `telegram.service.ts` — Bot API mijozi; **token bo'lmasa o'chirilgan rejim** (xabar yuborilmaydi, qolgan mantiq ishlayveradi) | ✅ |
| `telegramLink.service.ts` — `/start <kod>` orqali bog'lash; webhook imzosi `timingSafeEqual` bilan tekshiriladi; secret sozlanmagan bo'lsa webhook **umuman qabul qilinmaydi** | ✅ |
| Kabinet foydalanuvchisi uchun bog'lanish `studentId`/`parentId` ga yoziladi (`userId` ga emas) — xabarlar ham shu kalitlar bo'yicha yuboriladi | ✅ |
| Mavjud bildirishnomalar avtomatik navbatga tushadi; hisobi yo'q ota-ona uchun `notifyExternalInTransaction` | ✅ |
| Davomatda `ABSENT` → xodimga ilova ichida, ota-onaga va o'quvchiga Telegramga | ✅ |
| API: `GET/DELETE /telegram/me`, `POST /telegram/webhook`, `GET /students/:id/telegram-link`, `GET /parents/:id/telegram-link` | ✅ |
| Job: har daqiqada navbatni qayta ishlash | ✅ |
| Frontend: `TelegramLinkCard` — kabinet va xodim profilida (kod, deep link, "Uzish"); bot sozlanmagan bo'lsa ogohlantirish | ✅ |
| Deploy: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` — compose va `.env.production.example` da | ✅ |
| Testlar: `tests/telegram.test.ts` (10 ta) — imzo tekshiruvi, bog'lash, dedupe, SENT/FAILED/SKIPPED, backoff | ✅ 452 test, E2E 14/14 |

**Token hali sozlanmagan** — bu ataylab: butun zanjir tokensiz sinaladi va bot ulangach hech narsa
qayta yozilmaydi. Ulash tartibi `docs/CI-CD.md` da (keyingi bosqichda hujjatlashtiriladi).

### PHASE 5 — bajarilgan ish (2026-09-23)

| Qism | Holat |
|---|---|
| `Room` modeli — filialga bog'langan (PHASE 1.5 poydevori ishladi), kalit filial ichida unikal, sig'im CHECK bilan | ✅ |
| `Group.roomId` — eski matnli `room` ustuni **saqlandi** (mavjud 10 guruh buzilmadi) | ✅ |
| `scheduleConflict.service.ts` — to'qnashuv 4 shart bo'yicha: bir xil hafta kuni + vaqt kesishishi + davr kesishishi + guruh faol (PLANNED/ACTIVE) | ✅ |
| Xona va o'qituvchi to'qnashuvi guruh yaratish va tahrirlashda tekshiriladi; xato 409 va aniq matn bilan ("Xona band: «Kechki» guruhi Dushanba… 14:00–16:00 da dars qiladi") | ✅ |
| `allowConflict: true` — ataylab saqlash (qo'shma dars) | ✅ |
| Tahrirlashda guruh o'zi bilan to'qnashmaydi | ✅ |
| API: `GET/POST/PUT /rooms`, `POST /rooms/conflicts` (saqlashdan oldin tekshirish) | ✅ |
| Frontend: `/rooms` sahifasi (sig'im, jihozlar, band qilish jadvali, faollik), guruh formasida xona tanlash va **real vaqtda** to'qnashuv ogohlantirishi | ✅ brauzerda tekshirildi |
| Testlar: `tests/rooms.test.ts` (9 ta) — ruxsatlar, takroriy kalit, xona/o'qituvchi to'qnashuvi, chegaradagi vaqtlar (14–16 va 16–18 to'qnashmaydi), davr kesishmasligi, allowConflict, o'zi bilan to'qnashmaslik, band xonani o'chirmaslik | ✅ 461 test, E2E 14/14 |

### PHASE 6 (1-qism) — kurrikulum va progress (2026-09-23)

| Qism | Holat |
|---|---|
| `CourseModule` / `CourseTopic` — Kurs → Modul → Mavzu; `AttendanceSession.topicId` (dars qaysi mavzuga tegishli) | ✅ |
| `StudentTopicProgress` — yozuv **faqat holat o'zgarganda** yaratiladi; yozuvi yo'q mavzu `NOT_STARTED` (1000 o'quvchi × 100 mavzu = 100 000 bo'sh qator yaratilmaydi) | ✅ |
| Mavzuni guruh bo'yicha yoki tanlangan o'quvchilarga belgilash; takroriy belgilash holatni yangilaydi (idempotent) | ✅ |
| Progress foizi: kurs bo'yicha va modul bo'yicha ("HTML 100%, CSS 82%"); faol bo'lmagan mavzu maxrajga kirmaydi | ✅ |
| API: `GET /courses/:id/curriculum`, `POST /courses/:id/modules`, `PUT /curriculum/modules/:id`, `POST /curriculum/modules/:id/topics`, `PUT /curriculum/topics/:id`, `POST /curriculum/topics/:id/mark`, `GET /students/:id/curriculum` | ✅ |
| Frontend: kurs kartochkasida "Kurs dasturi" oynasi (modul/mavzu qo'shish, guruh tanlab "O'tildi"), o'quvchi profilida progress kartochkasi | ✅ |
| Testlar: `tests/curriculum.test.ts` (7 ta) | ✅ 468 test, E2E 14/14 |

**Ikki haqiqiy nuqson topildi va tuzatildi:**

1. **Xavfsizlik:** o'qituvchi tekshiruvida `NOT: { group: { teacherId } }` ishlatilgan edi — guruhga
   o'qituvchi biriktirilmagan bo'lsa (`NULL`) SQL solishtiruvi `NULL` qaytaradi va tekshiruv **jimgina
   o'tib ketadi**. Test buni ushladi (o'qituvchi begona guruhga mavzu belgilay oldi); endi qiymatlar
   o'qib olinib, aniq solishtiriladi.
2. **Tartib:** modul va mavzular `sortOrder = 0` bilan yaratilib, alifbo bo'yicha chiqib ketardi.
   Endi tartib ko'rsatilmasa yozuv ro'yxat oxiriga qo'shiladi (qo'shilish tartibi saqlanadi).

### PHASE 6 (2-qism) — imtihon dvigateli (2026-09-23)

| Qism | Holat |
|---|---|
| `Question` / `QuestionOption` — savollar bazasi: kurs va **mavzuga** bog'langan, 3 tur (bitta javob / bir nechta javob / matnli), 3 murakkablik darajasi | ✅ |
| `ExamQuestion` — imtihonga biriktirilgan savol; **ball shu yerda muzlatiladi**, shuning uchun savollar bazasidagi ball keyin o'zgarsa o'tkazilgan imtihon natijasi o'zgarmaydi | ✅ |
| `ExamAttempt` / `ExamAnswer` — urinishlar (`attemptNo`) va javoblar | ✅ |
| **Avtomatik baholash:** variantli savollarda to'plam aynan mos kelishi kerak (yarim javobga ball berilmaydi); matnli savol `NEEDS_REVIEW` holatida qoladi va o'qituvchi baholaydi (ball savol balidan oshmaydi) | ✅ |
| **Mavzular kesimi:** har urinishda mavzu bo'yicha foiz, `strongTopics` (≥85%) va `weakTopics` (<60%) — "Takrorlash kerak: Formalar" | ✅ |
| Tasodifiy tanlash (mavzu va murakkablik bo'yicha); savollar yetmasa aniq xabar | ✅ |
| Imtihon boshlangandan keyin savollar tarkibi o'zgarmaydi | ✅ |
| **Mavjud tizim bilan integratsiya:** urinish baholangach natija baribir `ExamResult` ga yoziladi va XP mavjud gamifikatsiya hooki orqali beriladi — hisobotlar, analitika va XP o'zgarishsiz ishlaydi | ✅ |
| To'g'ri javob (`isCorrect`) o'quvchiga ko'rinadigan javobda **hech qachon** qaytarilmaydi | ✅ testda tekshiriladi |
| API: `GET/POST/PUT /questions`, `POST/GET /exams/:id/questions`, `POST /exams/:id/attempts/:studentId`, `GET /exams/:id/attempts`, `POST /exams/attempts/:id/grade` | ✅ |
| Frontend: `/questions` savollar bazasi sahifasi (filtrlar, variantli forma), imtihon kartochkasida "Savollar va tahlil" oynasi (tasodifiy biriktirish + mavzular bo'yicha natija chiziqlari) | ✅ |
| Testlar: `tests/examEngine.test.ts` (8 ta) | ✅ 476 test, E2E 14/14 |
