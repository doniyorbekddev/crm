SEN SENIOR SOFTWARE ARCHITECT + FULL-STACK ENGINEER + PRODUCT ENGINEER sifatida ishlaysan.

Menda allaqachon ishlayotgan O‘QUV MARKAZ CRM mavjud. Uni boshidan qayta yozish EMAS, mavjud kodni chuqur audit qilib, buzmasdan professional darajada rivojlantirish kerak.

CRM o‘quv markaz uchun mo‘ljallangan va hozir quyidagi asosiy funksiyalar mavjud:

- Lead management
- Sales pipeline / Kanban
- Call center
- Follow-up
- Courses
- Groups
- Students
- Attendance
- XP / Level / Badge / Streak
- Homework
- Exams
- Payments
- Debts
- Payment schedule
- Cash / Bank
- Expenses
- Teacher salary
- Teacher performance
- Dashboard
- KPI
- Reports
- Marketing ROI
- Parent information
- Group transfer history
- Audit log
- Notifications
- Global search
- Role & Permission
- Multi-role access
- Security
- Automatic backups
- Excel / CSV export
- Duplicate payment protection

Mavjud tizimni buzmasdan quyidagi "ACADEMY CRM 2.0" imkoniyatlarini bosqichma-bosqich qo‘sh.

==================================================

1. # AVVAL AUDIT QIL

Kod yozishni boshlashdan oldin butun projectni tekshir.

Aniq quyidagilarni aniqlagin:

1. Frontend stack
2. Backend stack
3. Database
4. ORM
5. Authentication
6. Authorization
7. API structure
8. Folder structure
9. Existing models
10. Existing migrations
11. Existing permissions
12. Existing dashboard
13. Existing notification system
14. Existing tests
15. Existing background jobs
16. Existing financial logic
17. Existing attendance logic
18. Existing salary logic
19. Existing reporting logic
20. Existing deployment configuration

Mavjud funksiyalarni qayta yaratma.

Mavjud database modelni buzma.

Mavjud API contractni sababsiz o‘zgartirma.

Mavjud permissionlarni saqla.

Mavjud testlarni buzma.

Agar yangi modul mavjud modul bilan overlap qilsa, yangi modul yaratishdan oldin mavjud modulni kengaytir.

================================================== 2. STUDENT LIFECYCLE
====================

Student status tizimini kengaytir:

LEAD
→ CONTACTED
→ INTERESTED
→ TRIAL_BOOKED
→ TRIAL_ATTENDED
→ WON
→ ACTIVE
→ AT_RISK
→ FROZEN
→ DROPPED
→ GRADUATED
→ ALUMNI

Har bir status o‘z tarixiga ega bo‘lsin.

Student status o‘zgarishi audit logga yozilsin.

Status o‘zgarishining sababini saqlash imkoniyati bo‘lsin.

================================================== 3. STUDENT AT-RISK / CHURN SYSTEM
=================================

CRM o‘quvchining ketib qolish xavfini avtomatik aniqlasin.

Quyidagi signal va metrikalardan foydalan:

- Attendance decrease
- Consecutive absences
- Debt
- Payment overdue
- Homework completion decrease
- Exam score decrease
- XP activity decrease
- Course inactivity
- Group transfer request
- Teacher feedback
- Student feedback

Har bir student uchun:

health_score
risk_level
risk_reasons

saqlansin.

Risk levels:

HEALTHY
ATTENTION
AT_RISK
CRITICAL

Dashboardda:

- Critical students
- At risk students
- Students with overdue payments
- Students with attendance problems

alohida ko‘rinsin.

================================================== 4. STUDENT CABINET
==================

Student uchun alohida kabinet yaratilishi kerak.

Student dashboard:

- XP
- Level
- Streak
- Attendance %
- Homework %
- Average exam score
- Course progress
- Upcoming lessons
- Debt
- Payments
- Achievements
- Leaderboard
- Certificates

Student o‘z ma’lumotlarini faqat o‘ziga tegishli ma’lumotlar bilan ko‘rsin.

================================================== 5. PARENT CABINET
=================

Parent account orqali bir nechta farzandni boshqarish mumkin bo‘lsin.

Parent dashboard:

- Children
- Attendance
- Homework
- Exams
- Grades
- XP
- Progress
- Schedule
- Debt
- Payment history
- Teacher information
- Notifications

Parent bir farzanddan ikkinchisiga o‘tishi mumkin bo‘lsin.

Permission isolation qat’iy bo‘lsin.

================================================== 6. TELEGRAM BOT INTEGRATION
===========================

Telegram bot architecture yarat.

Bot orqali:

STUDENT:

- upcoming lesson
- homework
- attendance
- XP
- level
- payment reminder

PARENT:

- child absent notification
- payment reminder
- payment confirmation
- exam result
- homework notification
- important academy announcements

TEACHER:

- today's lessons
- group list
- attendance shortcut
- homework reminder

MANAGER:

- new lead
- follow-up reminder
- overdue follow-up

OWNER:

- daily revenue
- new students
- debt
- critical students
- important alerts

Notification preferences bo‘lsin.

User notificationni yoqishi/o‘chirishi mumkin bo‘lsin.

Telegram bot uchun queue/retry mechanism bo‘lsin.

Bot token va secretlar environment variables orqali boshqarilsin.

================================================== 7. ONLINE PAYMENT ARCHITECTURE
==============================

Payment abstraction layer yarat.

Payment providerlarni keyinchalik ulash mumkin bo‘lsin.

Masalan:

- Click
- Payme
- boshqa providerlar

Webhook architecture yarat.

Payment flow:

Payment created
→ Provider
→ Webhook
→ Signature verification
→ Idempotency check
→ Payment success
→ Debt recalculation
→ Receipt
→ Notification
→ Audit

Duplicate webhookdan himoyalanish shart.

Payment hech qachon fizik delete qilinmasin.

================================================== 8. CLASSROOM / ROOM MANAGEMENT
==============================

Quyidagilarni qo‘sh:

- Rooms
- Room capacity
- Teacher schedule
- Group schedule
- Room schedule
- Equipment

Conflict detection:

- teacher conflict
- room conflict
- group conflict

Conflict bo‘lsa tizim save qilishga yo‘l qo‘ymasligi yoki aniq warning berishi kerak.

================================================== 9. CURRICULUM MANAGEMENT
========================

Har bir course uchun curriculum yarat.

Course
→ Module
→ Topic
→ Lesson

Har bir student uchun progress hisobla.

Misol:

HTML 100%
CSS 82%
JavaScript 61%
React 25%

Teacher topicni completed deb belgilashi mumkin.

Student progress avtomatik yangilansin.

================================================== 10. EXAM / ASSESSMENT ENGINE
============================

Exam tizimini professional LMS darajasiga olib chiq.

Qo‘sh:

- Question bank
- Question category
- Difficulty
- Random questions
- Exam duration
- Passing score
- Attempts
- Retake
- Automatic scoring
- Manual scoring
- Exam history
- Topic analysis

Natija:

Score
Percentage
Grade
Passed/Failed
Weak topics
Strong topics

ko‘rinishida chiqsin.

================================================== 11. CERTIFICATE SYSTEM
======================

Course completed bo‘lganda certificate yaratish imkoniyati.

Certificate:

- unique certificate ID
- student name
- course
- teacher
- start date
- completion date
- result
- issue date

PDF certificate generation.

QR verification page.

Public verification:

/verify/{certificateId}

bo‘lsin.

================================================== 12. LEAD SCORING
================

Lead scoring tizimini yarat.

Lead score quyidagilar asosida hisoblanadi:

- contacted
- replied
- interested
- trial booked
- trial attended
- price requested
- course start date requested
- repeated contact
- source quality

Score:

0-39 COLD
40-69 WARM
70-89 HOT
90-100 VERY_HOT

Score nima sababdan berilganini ham ko‘rsat.

================================================== 13. AUTOMATIC LEAD ASSIGNMENT
=============================

Yangi leadlarni managerlarga avtomatik taqsimlash:

Round robin
yoki
weighted round robin

qo‘llab-quvvatlansin.

Manager availability hisobga olinsin.

Lead qayta taqsimlanganda audit yozilsin.

================================================== 14. ADVANCED SALES FUNNEL
=========================

Sales funnel analytics:

Leads
→ Contacted
→ Interested
→ Trial booked
→ Trial attended
→ Won
→ Student

Har bir bosqich uchun:

- count
- conversion %
- conversion time
- manager performance

hisoblansin.

Source bo‘yicha:

Instagram
Telegram
Referral
Offline
Website
Other

analitika bo‘lsin.

================================================== 15. REFERRAL SYSTEM
===================

Har bir studentga referral code ber.

Student referral code orqali yangi lead kelishi mumkin.

Referral relationship saqlansin.

Dashboard:

- referrals
- successful conversions
- bonus
- referral revenue

ko‘rsatsin.

Referral bonus rule-based bo‘lsin.

================================================== 16. DISCOUNT ENGINE
===================

Discount systemni rule-based qil.

Qo‘llab-quvvatla:

- family discount
- referral discount
- promo code
- 3-month payment
- 6-month payment
- first-payment discount
- custom discount

Discount stacking qoidalari bo‘lsin.

Maximum discount limit bo‘lsin.

Discount kim tomonidan berilganini audit qil.

================================================== 17. HR MODULE
=============

Employee profile:

- personal data
- contact
- position
- department
- contract
- documents
- salary
- bonuses
- penalties
- vacation
- work status

Employee documents uchun secure storage architecture yarat.

Sensitive data permission bilan himoyalansin.

================================================== 18. TEACHER PERFORMANCE
=======================

Teacher analytics:

- student count
- attendance
- retention
- homework completion
- exam results
- student satisfaction
- group performance
- lessons delivered
- revenue contribution

Teacher dashboardga faqat o‘ziga tegishli ma’lumotlarni ko‘rsat.

Owner esa umumiy analyticsni ko‘rsin.

================================================== 19. STUDENT FEEDBACK / NPS
==========================

Student feedback:

- teacher rating
- course rating
- academy rating
- NPS
- written feedback

Anonymous feedback option bo‘lishi mumkin.

Negative feedback uchun admin notification yarat.

================================================== 20. INVENTORY
=============

Inventory module:

- products
- categories
- stock
- purchase
- sale
- transfer
- damaged
- low stock alert

Misol:

Kitob
Forma
Notebook
Mouse
Keyboard
Projector
Computer

Stock movement audit qilinsin.

================================================== 21. MULTI-BRANCH
================

Architecture future multi-branch uchun tayyor bo‘lsin.

Branch:

- students
- groups
- teachers
- rooms
- finance
- leads

bilan bog‘lanadi.

Owner barcha filiallarni ko‘radi.

Branch Admin faqat o‘z filialini ko‘radi.

Permission isolation bo‘lsin.

================================================== 22. AI BUSINESS ASSISTANT
=========================

CRM ichida AI Assistant uchun architecture yarat.

Owner tabiiy tilda savol bera olsin:

"Bugun qancha pul tushdi?"

"Qancha qarzdor bor?"

"Qaysi kurs eng ko‘p daromad keltiryapti?"

"Qaysi o‘quvchilar ketib qolish xavfida?"

"Qaysi manager eng ko‘p leadni studentga aylantirdi?"

"Marketing qaysi kanalda yaxshi ishlayapti?"

"Bu oy o'tgan oyga qaraganda qanday?"

AI javobni database'dagi real ma’lumotlar asosida bersin.

AI hech qachon databasega bevosita unrestricted SQL access olmasin.

Tool/function based safe query architecture ishlat.

Sensitive data leakage oldini ol.

================================================== 23. OWNER INTELLIGENCE DASHBOARD
================================

Owner dashboardni executive dashboard darajasiga olib chiq.

KPI:

- Revenue
- Net profit
- Expenses
- Active students
- New students
- New leads
- Conversion
- Debt
- Collection rate
- Attendance
- Retention
- Churn risk
- Teacher performance
- Marketing ROI

Comparison:

Today
This week
This month
Previous month
This year

bo‘lsin.

================================================== 24. AUTOMATION ENGINE
=====================

Rule-based automation engine yarat.

Misollar:

IF student absent 2 times
→ notification

IF payment due in 3 days
→ reminder

IF payment overdue
→ manager notification

IF student risk = CRITICAL
→ admin notification

IF lead follow-up overdue
→ manager notification

IF certificate eligibility reached
→ notify student

IF stock below minimum
→ admin notification

Automation log saqlansin.

================================================== 25. GLOBAL SEARCH
=================

Ctrl + K global searchni kuchaytir.

Search:

- students
- leads
- payments
- groups
- teachers
- invoices
- certificates
- phone
- ID

bo‘yicha ishlasin.

Search result permission bilan filtrlanishi shart.

================================================== 26. NOTIFICATION CENTER
=======================

Notification center:

- unread
- read
- priority
- category
- date

filterlariga ega bo‘lsin.

Notification types:

INFO
SUCCESS
WARNING
CRITICAL

bo‘lsin.

================================================== 27. MOBILE-FIRST / PWA
======================

Teacher va manager telefondan ko‘p foydalanadi.

Shuning uchun:

- responsive
- mobile-first
- PWA
- fast attendance
- fast payment
- fast call
- fast notification

UX yarat.

Teacher uchun attendance 10-15 sekund ichida bajariladigan bo‘lsin.

================================================== 28. SECURITY
============

Securityni kuchaytir:

- RBAC
- permission checks
- ownership checks
- session security
- rate limiting
- brute-force protection
- CSRF protection
- input validation
- SQL injection protection
- XSS protection
- secure headers
- audit logging
- sensitive data masking
- webhook signature verification
- idempotency
- backup verification

Frontenddagi button yashirilishi SECURITY deb hisoblanmasin.

Backend ham har bir permissionni tekshirsin.

================================================== 29. AUDIT LOG 2.0
=================

Audit:

WHO
WHAT
WHEN
WHERE
IP
USER AGENT
BEFORE
AFTER

saqlasin.

Muhim actionlar:

- payment
- payment cancellation
- salary approval
- discount
- role change
- permission change
- student deletion/archive
- group transfer
- employee changes

audit qilinsin.

Audit logni oddiy user o‘chira olmasin.

================================================== 30. PERFORMANCE
===============

Database querylarni tekshir.

N+1 querylarni yo‘qot.

Pagination qo‘llash.

Indexlar qo‘shish.

Heavy analytics uchun optimized querylar.

Dashboard tez ochilsin.

Cache faqat kerakli joylarda ishlatilsin.

================================================== 31. TESTING
===========

Har bir yangi feature uchun:

- unit test
- integration test
- API test
- permission test
- critical business rule test
- frontend test
- E2E test

kerak.

Ayniqsa:

payment
debt
attendance
XP
salary
permissions
lead conversion
discount
notifications

uchun regression test yoz.

Mavjud testlar buzilmasin.

================================================== 32. DATABASE
============

Database schema'ni avval tahlil qil.

Yangi table yaratishdan oldin mavjud table bilan relationship imkoniyatini tekshir.

Migrationlar xavfsiz bo‘lsin.

Foreign keylar.

Indexes.

Unique constraints.

Soft delete.

Audit relation.

Transactionlar.

Idempotency.

barchasini hisobga ol.

Production databasega zarar yetkazadigan destructive migration qilma.

================================================== 33. UX / UI
===========

CRM professional SaaS mahsulotga o‘xshasin.

UI:

- clean
- modern
- responsive
- fast
- consistent
- accessible

bo‘lsin.

Existing design systemni saqla.

Mavjud sahifalarni sababsiz qayta dizayn qilma.

Empty states
Loading states
Error states
Success states
Confirmation dialogs

hammasini qo‘sh.

================================================== 34. IMPLEMENTATION QOIDASI
==========================

ENG MUHIM QOIDA:

HAMMASINI BIR YO‘LA QURMA.

Quyidagi phase bilan ishlagin:

PHASE 1
Audit + architecture

PHASE 2
Student lifecycle + At-risk

PHASE 3
Student cabinet + Parent cabinet

PHASE 4
Telegram + notification automation

PHASE 5
Schedule + room management

PHASE 6
Curriculum + advanced exam + certificate

PHASE 7
Lead scoring + advanced sales + referral

PHASE 8
HR + teacher analytics

PHASE 9
Inventory + multi-branch

PHASE 10
AI Business Assistant

PHASE 11
Security + performance

PHASE 12
Full testing + production readiness

Har bir phase tugagach:

1. Code review
2. Type check
3. Lint
4. Unit tests
5. Integration tests
6. E2E tests
7. Database migration check
8. Permission check
9. Regression check

qil.

================================================== 35. MUHIM: EXISTING FUNCTIONALITYNI BUZMA
=========================================

Quyidagilar ishlashda davom etishi SHART:

- login
- roles
- permissions
- leads
- calls
- follow-ups
- students
- groups
- attendance
- XP
- homework
- exams
- payments
- debt
- finance
- salary
- dashboard
- reports
- audit
- notifications
- global search

Agar mavjud implementation yangi featurega to‘sqinlik qilsa, avval menga muammo va 2-3 ta yechimni tushuntir.

O‘zboshimchalik bilan katta refactor qilma.

================================================== 36. NATIJANI MENGA QANDAY KO‘RSATASAN
=====================================

Avval kod yozmasdan quyidagilarni chiqar:

A. Existing architecture audit

B. Existing modules

C. Existing database schema

D. Existing API structure

E. Existing permissions

F. Existing problems

G. New features priority

H. Proposed database changes

I. Proposed API changes

J. Proposed frontend pages

K. Proposed automation rules

L. Security risks

M. Performance risks

N. Implementation phases

O. Exact first phase implementation plan

Keyin faqat PHASE 1 ni boshlagin.

Har bir keyingi phase oldidan qisqa changelog ber.

==================================================
FINAL MAQSAD
============

CRM quyidagi darajaga yetishi kerak:

LEAD CRM

- STUDENT MANAGEMENT
- LMS
- ATTENDANCE
- GAMIFICATION
- FINANCE
- HR
- MARKETING
- ANALYTICS
- PARENT PORTAL
- STUDENT PORTAL
- TEACHER PORTAL
- TELEGRAM AUTOMATION
- PAYMENT INTEGRATION
- MULTI-BRANCH
- AI BUSINESS ASSISTANT

ya’ni oddiy o‘quv markaz CRM emas, to‘liq ACADEMY MANAGEMENT PLATFORM bo‘lishi kerak.

Birinchi navbatda mavjud projectni chuqur audit qil va yuqoridagi talablarni mavjud architecture bilan solishtir.

KOD YOZISHGA SHOSHILMA.

AVVAL AUDIT NATIJASINI KO‘RSAT.
