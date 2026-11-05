# 01 — Ma'lumotlar bazasi xaritasi (ORG)

Prisma schema'dan avtomatik yig'ilgan (`backend/prisma/schema.prisma`, 2026-11-05). Bog'lanishlar qisqartirilgan (birinchi 6 tasi).

## Xodimlar va tuzilma

| Model (jadval) | Vazifasi | Asosiy bog'lanishlar |
|---|---|---|
| `User` (`users`) | — | role → Role, refreshTokens → RefreshToken[], recoveryCodes → UserRecoveryCode[], passwordResetTokens → PasswordResetToken[], assignedLeads → Lead[], createdLeads → Lead[] … |
| `Role` (`roles`) | — | users → User[], permissions → RolePermission[] |
| `Employee` (`employees`) | O‘qituvchidan tashqari xodimlar (administrator, buxgalter, farrosh...). Tizim akkaunti ixtiyoriy. Maoshi TeacherSalaryPeriod (umumiy payroll davri) orqali hisob | user → User, createdBy → User, manager → User, salaryPeriods → TeacherSalaryPeriod[], documents → Document[], leaves → EmployeeLeave[] … |
| `TeacherProfile` (`teacher_profiles`) | O‘qituvchi ma'lumotlari. Shaxs va kirish ma'lumotlari `User` da qoladi — bu yerda faqat o‘qituvchilik profili saqlanadi. | user → User, salaryRules → TeacherSalaryRule[], salaryPeriods → TeacherSalaryPeriod[], documents → Document[] |
| `Department` (`departments`) | Bo'lim: rahbari, ota bo'limi va oylik xarajat limiti (ORG §10) | parent → Department, children → Department[], head → User, branch → Branch, positions → Position[], employees → Employee[] … |
| `Position` (`positions`) | Lavozim katalogi: har lavozim turining tavsifi, mas'uliyatlari, sinov muddati va karyera yo'li. `key` — EmployeePosition qiymati yoki "TEACHER": KPI va maosh qo | department → Department, nextPosition → Position, previous → Position[], responsibilities → PositionResponsibility[] |
| `PositionResponsibility` (`position_responsibilities`) | Lavozim mas'uliyati (lavozim yo'riqnomasining bandi) | position → Position |
| `EmploymentHistory` (`employment_history`) | Ish tarixi: lavozim, bo'lim va holat o'zgarishlari — sababi va kim tasdiqlagani bilan (o'zgarmas) | employee → Employee, user → User, approvedBy → User, createdBy → User |
| `Branch` (`branches`) | Filial. Bitta markazda ham bitta "Asosiy filial" yozuvi bo'ladi — shunda ikkinchi filial ochilganda hech narsa qayta yozilmaydi. | users → User[], employees → Employee[], leads → Lead[], students → Student[], groups → Group[], payments → Payment[] … |

## Davomat va jadval

| Model (jadval) | Vazifasi | Asosiy bog'lanishlar |
|---|---|---|
| `StaffWorkSchedule` (`staff_work_schedules`) | Xodimning ish jadvali. Har o'zgarish yangi versiya (`effectiveFrom`) — o'tgan kunlar eski jadval bilan baholanadi. | user → User |
| `StaffHoliday` (`staff_holidays`) | Markaz bo'yicha dam olish (bayram) kunlari |  |
| `StaffScheduleException` (`staff_schedule_exceptions`) | Bitta xodimning bitta kundagi vaqtinchalik o'zgarishi (dam olish yoki boshqa soatlar) | user → User |
| `StaffAttendanceDay` (`staff_attendance_days`) | Xodimning bir ish kuni. Qiymatlar hodisalardan hisoblanadi; chiqish belgilanmasa — o'ylab topilmaydi, tekshiruvga tushadi. | user → User, events → StaffAttendanceEvent[], corrections → StaffAttendanceCorrection[] |
| `StaffAttendanceEvent` (`staff_attendance_events`) | Davomat hodisasi. O'zgartirilmaydi va o'chirilmaydi: tuzatishda `voidedAt` qo'yiladi va yangi hodisa qo'shiladi. | day → StaffAttendanceDay, qrToken → StaffQrToken, correction → StaffAttendanceCorrection |
| `StaffAttendanceCorrection` (`staff_attendance_corrections`) | Rahbar tuzatishi — o'zgarmas tarix: asl holat, yangi holat, sabab, kim va qachon | day → StaffAttendanceDay, createdBy → User, events → StaffAttendanceEvent[] |
| `StaffQrToken` (`staff_qr_tokens`) | Qabulxona QR tokeni. Tokenning o'zi saqlanmaydi — faqat SHA-256 hash. Qisqa muddatli va bir martalik. | events → StaffAttendanceEvent[] |
| `StaffPermissionRequest` (`staff_permission_requests`) | Xodimning ruxsat so'rovi (kelmaslik, kech kelish, erta ketish). Tasdiqlangani davomatda "sababli" bo'ladi. | user → User, decidedBy → User |
| `EmployeeLeave` (`employee_leaves`) | Xodimning ta'til/dam olish arizasi. Tasdiqlangan ta'til xodim holatini **o'zgartirmaydi** — "bugun ta'tilda" degan javob sanalardan hisoblanadi, shunda qo'lda q | employee → Employee, requestedBy → User, decidedBy → User |

## Vazifalar va bildirishnomalar

| Model (jadval) | Vazifasi | Asosiy bog'lanishlar |
|---|---|---|
| `Task` (`tasks`) | Xodim uchun ish: kim, nima, qachongacha. Qoida yaratgan bo'lsa `ruleId` va `dedupeKey` bor — bir holat uchun ikki marta yaratilmaydi. | assignee → User, createdBy → User, rule → AutomationRule, alert → Alert, comments → TaskComment[], assignments → TaskAssignment[] … |
| `TaskComment` (`task_comments`) | Vazifa ostidagi izoh (CRM 4.0, 2-faza) | task → Task, author → User |
| `TaskAssignment` (`task_assignments`) | Vazifani biriktirish tarixi: kimdan kimga, kim o'zgartirdi (CRM 4.0, 2-faza) | task → Task, fromUser → User, toUser → User, changedBy → User |
| `Notification` (`notifications`) | — | user → User, deliveries → NotificationDelivery[], task → Task |
| `NotificationDelivery` (`notification_deliveries`) | Yetkazish navbati (outbox): tashqi kanalga yuborish asosiy so'rovni kutib qoldirmaydi, xatolik bo'lsa qayta urinish mumkin va har bir urinish iz qoldiradi. | notification → Notification, telegramLink → TelegramLink, broadcast → TelegramBroadcast |
| `AuditLog` (`audit_logs`) | — | user → User |

## Murojaat, aktiv, bilim

| Model (jadval) | Vazifasi | Asosiy bog'lanishlar |
|---|---|---|
| `Complaint` (`complaints`) | Murojaat va shikoyatlar (ORG §7): birinchi qabul qiluvchi kiritadi, mas'ulga yo'naltiriladi, hal etilib yopiladi | student → Student, subjectUser → User, reporter → User, assignee → User, escalatedBy → User, resolvedBy → User … |
| `ComplaintEvent` (`complaint_events`) | Murojaat tarixi — o'zgarmas (o'chirilmaydi, tahrirlanmaydi) | complaint → Complaint, actor → User |
| `Asset` (`assets`) | — | room → Room, responsible → User, createdBy → User, branch → Branch, events → AssetEvent[] |
| `AssetEvent` (`asset_events`) | Aktiv tarixi: biriktirish, ko'chirish, holat, ta'mirlash (xarajati bilan) — o'zgarmas | asset → Asset, actor → User |
| `KnowledgeArticle` (`knowledge_articles`) | — | createdBy → User, updatedBy → User, versions → KnowledgeArticleVersion[], acknowledgements → KnowledgeAcknowledgement[] |
| `KnowledgeArticleVersion` (`knowledge_article_versions`) | Har saqlangan versiya — o'zgarmas tarix | article → KnowledgeArticle, editor → User |
| `KnowledgeAcknowledgement` (`knowledge_acknowledgements`) | — | article → KnowledgeArticle, user → User |

## KPI, baholash, maosh

| Model (jadval) | Vazifasi | Asosiy bog'lanishlar |
|---|---|---|
| `KpiDefinition` (`kpi_definitions`) | Lavozim bo'yicha KPI. Bir lavozimning oyda amal qiladigan KPI vaznlari yig'indisi 100 bo'lishi kerak — aks holda KPI bonusi hisoblanmaydi va maoshda ogohlantiri | createdBy → User, manualResults → KpiManualResult[] |
| `KpiManualResult` (`kpi_manual_results`) | MANUAL KPI'ning oylik natijasi — kim, qachon va nima sababdan kiritgani bilan | kpi → KpiDefinition, employee → Employee, createdBy → User |
| `PerformanceReview` (`performance_reviews`) | Choraklik baholash va attestatsiya (ORG §5.1): KPI o'rtachasi, davomat, mezonlar bo'yicha baho va xulosa | user → User, employee → Employee, reviewer → User, approvedBy → User |
| `StaffAward` (`staff_awards`) | Rag'batlantirish (ORG §6.2): oy/chorak xodimi, mukofot, malaka oshirish — mezon va sabab bilan | user → User, createdBy → User |
| `TeacherSalaryRule` (`teacher_salary_rules`) | Maosh modeli. Yangi qoida qo‘shilganda eskisi tarix uchun saqlanadi. | teacherProfile → TeacherProfile, createdBy → User |
| `TeacherSalaryPeriod` (`teacher_salary_periods`) | Bir oylik maosh hisobi. Approve qilingandan keyin o‘zgarmaydi (lockedAt). | teacherProfile → TeacherProfile, approvedBy → User, unlockedBy → User, submittedBy → User, rejectedBy → User, employee → Employee … |
| `TeacherSalaryPayment` (`teacher_salary_payments`) | — | period → TeacherSalaryPeriod, account → FinancialAccount, createdBy → User, expense → Expense |
| `PaymentTeacherShare` (`payment_teacher_shares`) | O‘qituvchi foizining tarixi: har bir to‘lovdan (+), bekor qilingan to‘lovdan (−) va salbiy qoldiqni keyingi oyga ko‘chirishdan yozuv. Yozuvlar o‘chirilmaydi — t | payment → Payment, teacher → User, group → Group |
| `DiscountRequest` (`discount_requests`) | Chegirma vakolati (ORG §2.2): chegaradan yuqori chegirma rahbar tasdig'idan keyin beriladi | student → Student, requestedBy → User, decidedBy → User, discount → StudentDiscount |
