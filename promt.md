SEN — 10+ YILLIK TAJRIBAGA EGA SENIOR FULL-STACK SOFTWARE ARCHITECT, PRODUCT DESIGNER VA DATABASE ARCHITECT sifatida ishlaysan.

Menga o‘quv markaz uchun professional, zamonaviy, tezkor va real biznesda ishlatishga tayyor bo‘lgan **Sales CRM System** yaratib ber.

Bu oddiy demo yoki landing page emas.

BU — o‘quv markazning sotuv bo‘limi har kuni foydalanadigan TO‘LIQ CRM tizimi bo‘lishi kerak.

==================================================

1. TEXNOLOGIYALAR
   ==================================================

FRONTEND:

* React.js
* TypeScript
* Vite
* Tailwind CSS
* React Router DOM
* TanStack Query
* React Hook Form
* Zod
* Axios
* Zustand yoki Redux Toolkit
* Recharts
* Lucide React
* Toast notifications
* Responsive design

BACKEND:

* Node.js
* Express.js
* TypeScript
* REST API
* JWT Authentication
* bcrypt
* Zod validation
* Helmet
* CORS
* Rate limiting
* Centralized error handling
* Winston/Pino logging

DATABASE:

* PostgreSQL
* Prisma ORM

ARCHITECTURE:

* Frontend va Backend alohida
* REST API orqali bog‘lanadi
* Clean Architecture
* Modular architecture
* Production-ready structure

==================================================
2. CRM ASOSIY MAQSADI
=====================

CRM quyidagi jarayonni to‘liq boshqarishi kerak:

LEAD → ALOQA → QIZIQISH → SINOV DARSI → MUROJAAT → SHARTNOMA → O‘QUVCHI → TO‘LOV → KURS

Sotuvchi har bir leadning qayerdan kelganini, kim bilan gaplashganini, nima deyilganini, keyingi qachon bog‘lanish kerakligini va sotuv natijasini ko‘ra olishi kerak.

==================================================
3. USER ROLES
=============

Quyidagi role tizimini yarat:

SUPER ADMIN
ADMIN
SALES MANAGER
CALL CENTER
TEACHER
ACCOUNTANT

Har bir role uchun Permission System bo‘lsin.

Masalan:

Super Admin:

* barcha ma'lumotlarni ko‘rish
* user yaratish
* user o‘chirish
* role berish
* permission boshqarish
* CRM sozlamalari
* barcha hisobotlar

Admin:

* leadlar
* students
* courses
* payments
* sales
* reports

Sales Manager:

* lead ko‘rish
* lead yaratish
* leadni o‘ziga biriktirish
* status o‘zgartirish
* qo‘ng‘iroq yozish
* follow-up yaratish

Call Center:

* leadlar
* qo‘ng‘iroqlar
* follow-up

Teacher:

* o‘z guruhlari
* o‘quvchilar
* davomad

Accountant:

* to‘lovlar
* qarzdorlik
* moliyaviy hisobotlar

Har bir API endpoint permission orqali himoyalansin.

==================================================
4. AUTHENTICATION
=================

Login/Register tizimi:

* Login
* Register
* Logout
* JWT
* Refresh token
* Password hashing
* Forgot password
* Reset password
* Change password
* Protected routes
* Role-based access
* Permission-based access

Login sahifasi professional bo‘lsin.

Session xavfsiz boshqarilsin.

==================================================
5. DASHBOARD
============

Dashboard juda professional bo‘lsin.

Quyidagilar ko‘rinsin:

* Bugungi leadlar
* Bugungi yangi mijozlar
* Bugungi qo‘ng‘iroqlar
* Bugungi follow-up
* Bugungi sotuvlar
* Bugungi tushum
* Oylik tushum
* Qarzdorlik
* Conversion Rate
* Yangi leadlar
* Trial darsga yozilganlar
* Trial darsdan sotuvga o‘tganlar

Charts:

* Kunlik leadlar
* Haftalik leadlar
* Oylik leadlar
* Sales funnel
* Revenue chart
* Lead source chart
* Manager performance
* Course performance

Dashboard real-time database ma'lumotlari asosida ishlasin.

==================================================
6. LEADS SYSTEM
===============

Lead CRUD:

* Create
* Read
* Update
* Delete
* Search
* Filter
* Sort
* Pagination

Lead fields:

* First name
* Last name
* Phone
* Telegram username
* Email
* Age
* Gender
* Address
* Source
* Course
* Status
* Assigned manager
* Priority
* Notes
* Created date
* Updated date
* Next follow-up date

Lead Source:

* Instagram
* Telegram
* Facebook
* YouTube
* Google
* Website
* Recommendation
* Walk-in
* Phone
* Advertisement
* Other

Lead status:

* NEW
* CONTACTED
* INTERESTED
* TRIAL_BOOKED
* TRIAL_ATTENDED
* NEGOTIATION
* WON
* LOST
* CALLBACK

Statuslar Kanban ko‘rinishida ham bo‘lsin.

Drag & Drop orqali statusni o‘zgartirish imkoniyati bo‘lsin.

==================================================
7. LEAD PROFILE
===============

Har bir lead uchun alohida profile page bo‘lsin.

Profile ichida:

PERSONAL INFORMATION
CONTACT INFORMATION
COURSE INTEREST
SALES INFORMATION
ACTIVITY HISTORY
CALL HISTORY
NOTES
FOLLOW-UP
PAYMENTS
DOCUMENTS

Activity Timeline:

2026-09-11 10:30
Manager lead yaratdi

2026-09-11 11:00
Telefon orqali bog‘landi

2026-09-11 11:15
Trial lesson belgilandi

2026-09-12
Trial lessonga keldi

2026-09-12
Studentga aylantirildi

==================================================
8. CALL CENTER
==============

Call management system yarat.

Har bir qo‘ng‘iroq:

* Lead
* Manager
* Call date
* Call duration
* Result
* Notes
* Next call
* Status

Call result:

* Answered
* No answer
* Busy
* Wrong number
* Interested
* Not interested
* Callback

Call history ko‘rinsin.

==================================================
9. FOLLOW-UP SYSTEM
===================

CRMning eng muhim qismlaridan biri.

Manager follow-up yaratishi mumkin:

"Ali bilan ertaga soat 15:00 da bog‘lanish"

Follow-up:

* Date
* Time
* Lead
* Manager
* Reminder
* Status
* Notes

Dashboardda:

BUGUNGI FOLLOW-UP

KECHIKKAN FOLLOW-UP

ERTANGI FOLLOW-UP

ko‘rinsin.

Notification system yarat.

==================================================
10. COURSES
===========

Course management:

* Course name
* Category
* Description
* Duration
* Price
* Discount
* Final price
* Teacher
* Status

Misol:

Frontend
Backend
English
German
Korean
Computer Literacy
President School Preparation

Course price dinamik bo‘lsin.

==================================================
11. GROUPS
==========

Group management:

* Group name
* Course
* Teacher
* Room
* Start date
* End date
* Schedule
* Start time
* End time
* Capacity
* Current students
* Status

Schedule:

Dushanba / Chorshanba / Juma

yoki

Seshanba / Payshanba / Shanba

==================================================
12. STUDENTS
============

Lead WON bo‘lganda:

LEAD → STUDENT

avtomatik conversion qilish imkoniyati bo‘lsin.

Student:

* Full name
* Phone
* Parent phone
* Telegram
* Course
* Group
* Teacher
* Contract
* Start date
* Status

Student status:

* Active
* Frozen
* Completed
* Dropped
* Graduated

==================================================
13. PAYMENTS
============

Payment system:

* Student
* Amount
* Payment date
* Payment method
* Course
* Manager
* Accountant
* Comment

Payment methods:

* Cash
* Card
* Click
* Payme
* Uzum
* Bank
* Other

Student uchun:

TOTAL PRICE
PAID
REMAINING

ko‘rsatilishi kerak.

==================================================
14. DEBT SYSTEM
===============

Qarzdorlikni avtomatik hisobla.

Masalan:

Course price: 1,500,000 UZS
Paid: 900,000 UZS
Debt: 600,000 UZS

Dashboardda:

TOTAL DEBT

ko‘rinsin.

Debt bo‘yicha filter:

* 0 debt
* 1–500k
* 500k–1m
* 1m+

==================================================
15. SALES FUNNEL
================

Professional funnel:

NEW LEAD
↓
CONTACTED
↓
INTERESTED
↓
TRIAL
↓
NEGOTIATION
↓
WON

Har bir bosqich:

* Count
* Percentage
* Conversion rate

ko‘rsatilsin.

==================================================
16. SALES MANAGER PERFORMANCE
=============================

Har bir manager uchun:

* Assigned leads
* Contacted
* Interested
* Trial
* Won
* Lost
* Conversion rate
* Revenue
* Average deal

Ranking:

1. Manager A
2. Manager B
3. Manager C

bo‘lsin.

==================================================
17. REPORTS
===========

Reports section:

Daily report
Weekly report
Monthly report
Yearly report

Reports:

* Lead report
* Sales report
* Revenue report
* Debt report
* Manager report
* Course report
* Source report
* Conversion report

Date range filter bo‘lsin.

Excel/CSV export imkoniyati qo‘sh.

==================================================
18. SEARCH
==========

Global search bo‘lsin.

Qidirish:

* Name
* Phone
* Telegram
* Email
* Student ID
* Lead ID

bo‘yicha ishlasin.

==================================================
19. NOTIFICATIONS
=================

Notification center yarat.

Notificationlar:

* New lead
* New payment
* Follow-up reminder
* Overdue follow-up
* New student
* Debt reminder
* Trial lesson reminder

==================================================
20. AUDIT LOG
=============

Admin barcha muhim harakatlarni ko‘ra olsin.

Masalan:

Admin created user

Manager updated lead

Manager changed status

Accountant created payment

Student converted from lead

Har bir action:

* User
* Action
* Entity
* Entity ID
* Date
* IP

saqlansin.

==================================================
21. DATABASE
============

Prisma schema professional bo‘lsin.

Asosiy modelar:

User
Role
Permission
RolePermission
Lead
LeadActivity
LeadNote
Call
FollowUp
Course
Group
Student
Payment
Debt
Notification
AuditLog
Source

Barcha relationlar to‘g‘ri qurilsin.

UUID yoki CUID ishlat.

CreatedAt
UpdatedAt

barcha kerakli modelarda bo‘lsin.

Database normalizationga rioya qil.

Indexes qo‘sh.

Unique constraints qo‘sh.

Foreign keys qo‘sh.

==================================================
22. API
=======

REST API yarat.

Masalan:

POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET /api/auth/me

GET /api/leads
POST /api/leads
GET /api/leads/:id
PUT /api/leads/:id
DELETE /api/leads/:id

GET /api/courses
POST /api/courses
PUT /api/courses/:id
DELETE /api/courses/:id

GET /api/students
POST /api/students

GET /api/payments
POST /api/payments

GET /api/dashboard

GET /api/reports

va hokazo.

API response format bir xil bo‘lsin:

{
"success": true,
"data": {},
"message": ""
}

Error:

{
"success": false,
"message": "",
"errors": []
}

==================================================
23. FRONTEND UI/UX
==================

UI juda professional bo‘lsin.

Desktop-first, lekin tablet va mobile responsive.

Layout:

Sidebar
Topbar
Main content

Sidebar:

Dashboard
Leads
Calls
Follow-ups
Students
Courses
Groups
Payments
Debts
Reports
Users
Settings

Design:

* Minimal
* Clean
* Modern
* Professional SaaS
* Fast
* Easy to use

Dark mode + Light mode.

Sidebar collapse bo‘lsin.

Tables professional bo‘lsin.

Modal va Drawerlardan foydalan.

Form validation bo‘lsin.

Loading skeletonlar bo‘lsin.

Empty states bo‘lsin.

Error states bo‘lsin.

Confirmation dialog bo‘lsin.

Toast notifications bo‘lsin.

==================================================
24. RESPONSIVE
==============

Desktop:
1440px
1280px
1024px

Tablet:
768px

Mobile:
375px
390px
430px

barcha sahifalar responsive bo‘lsin.

==================================================
25. SECURITY
============

Security juda muhim.

Quyidagilarni ishlat:

* JWT
* Refresh token
* bcrypt
* Helmet
* CORS
* Rate limit
* Input validation
* SQL injection protection
* XSS protection
* Secure cookies
* Environment variables
* Password rules
* Permission middleware

SECRET KEY kod ichida yozilmasin.

==================================================
26. ENV
=======

Backend:

DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=
CLIENT_URL=

Frontend:

VITE_API_URL=

.env.example yarat.

==================================================
27. PROJECT STRUCTURE
=====================

Root:

crm/
frontend/
backend/

Frontend:

src/
components/
pages/
layouts/
hooks/
services/
store/
types/
utils/
lib/
routes/

Backend:

src/
controllers/
routes/
services/
middleware/
validators/
utils/
config/
prisma/
types/

Kod modular va maintainable bo‘lsin.

==================================================
28. ERROR HANDLING
==================

Frontend va backendda professional error handling.

API xatoliklari userga tushunarli ko‘rinishda chiqsin.

Backend loglarda texnik xatolik saqlansin.

==================================================
29. PERFORMANCE
===============

Performance yuqori bo‘lsin.

* Pagination
* Debounced search
* Lazy loading
* Code splitting
* React Query caching
* Database indexes
* Optimized queries
* Avoid unnecessary re-renders

100,000+ lead bo‘lganda ham CRM ishlashi kerak.

==================================================
30. DATA PERSISTENCE
====================

ENG MUHIM TALAB:

Ma'lumotlar faqat browser/localStorage'da saqlanmasin.

Barcha asosiy ma'lumotlar PostgreSQL database'da saqlansin.

Masalan:

Manager 1:
Lead yaratadi.

Logout qiladi.

Manager 2:
Login qiladi.

Lead database'dan chiqishi kerak.

Server restart bo‘lganda ham ma'lumotlar saqlanib qolishi kerak.

==================================================
31. SEED DATA
=============

Development uchun seed yarat.

Admin:

email:
[admin@example.com](mailto:admin@example.com)

password:
Admin123!

Demo manager:

[manager@example.com](mailto:manager@example.com)

password:
Manager123!

Demo courses:
Frontend
Backend
English
German
Korean

Demo leads kamida 30 ta bo‘lsin.

==================================================
32. README
==========

README.md yarat.

Unda:

1. Project haqida
2. Requirements
3. Installation
4. Environment variables
5. PostgreSQL setup
6. Prisma setup
7. Migration
8. Seed
9. Development
10. Production
11. Build
12. Deployment

hammasini tushuntir.

==================================================
33. INSTALLATION COMMANDS
=========================

Men projectni clone qilganimdan keyin:

npm install

va kerakli commandlar bilan projectni ishga tushira olishim kerak.

Frontend:

npm run dev

Backend:

npm run dev

Database:

npx prisma migrate dev
npx prisma db seed

==================================================
34. IMPORTANT BUSINESS LOGIC
============================

Lead WON bo‘lganda Student yaratish mumkin.

Studentga Course va Group biriktirish mumkin.

Student uchun payment yaratilganda debt avtomatik qayta hisoblanadi.

Payment o‘chirilsa debt qayta hisoblanadi.

Course narxi o‘zgarsa eski paymentlar buzilmasin.

Lead status o‘zgarganda LeadActivity yozilsin.

Lead managerga biriktirilganda activity yozilsin.

Follow-up deadline o'tib ketsa "Overdue" bo‘lsin.

Dashboard barcha ma'lumotlarni PostgreSQL'dan olsin.

==================================================
35. CODE QUALITY
================

Kod:

* TypeScript strict mode
* Clean code
* DRY
* SOLID
* Reusable components
* Reusable services
* Strong typing
* No unnecessary duplication

hech qayerda:

any

dan keraksiz foydalanma.

Console.log bilan production logging qilma.

==================================================
36. NO MOCK CRM
===============

MUHIM:

Men mockup yoki fake CRM xohlamayman.

Faqat frontend UI yaratib qo‘yma.

Buttonlar ishlashi kerak.

Formlar databasega ma'lumot yuborishi kerak.

CRUD real ishlashi kerak.

Login real ishlashi kerak.

Role permission real ishlashi kerak.

Dashboard real PostgreSQL ma'lumotlari asosida ishlashi kerak.

Payments real databasega yozilishi kerak.

Reports real database'dan olinishi kerak.

==================================================
37. DEVELOPMENT PROCESS
=======================

LOYIHANI BIR YO‘LA TARTIBSIZ YOZMA.

Quyidagi bosqichda ishlab chiq:

PHASE 1:
Architecture + folder structure

PHASE 2:
PostgreSQL + Prisma schema

PHASE 3:
Backend authentication

PHASE 4:
Roles + permissions

PHASE 5:
Lead system

PHASE 6:
Calls + follow-ups

PHASE 7:
Courses + groups

PHASE 8:
Students

PHASE 9:
Payments + debts

PHASE 10:
Dashboard

PHASE 11:
Reports

PHASE 12:
Notifications

PHASE 13:
Audit logs

PHASE 14:
Frontend UI polish

PHASE 15:
Security + performance

PHASE 16:
Testing

PHASE 17:
Production deployment

==================================================
38. CLAUDE'DAN TALAB
====================

Har bir PHASE tugagandan keyin:

1. Qaysi fayllar yaratildi
2. Qaysi kod yozildi
3. Qanday ishlaydi
4. Qaysi commandlarni ishga tushirish kerak
5. Qanday test qilish kerak
6. Keyingi PHASE nima

deb yoz.

Agar kod juda uzun bo‘lsa, fayllarni bosqichma-bosqich yarat.

HECH QACHON kodni qisqartirib:

// rest of code
// implement this
// TODO

deb tashlab ketma.

Kerakli faylning TO‘LIQ kodini yoz.

Agar biror qaror noaniq bo‘lsa, production-ready variantni tanla va nima uchun tanlaganingni qisqa tushuntir.

==================================================
39. FINAL RESULT
================

Oxirida men quyidagi tizimga ega bo‘lishim kerak:

Professional Sales CRM
+
PostgreSQL
+
Node.js Backend
+
React.js Frontend
+
Authentication
+
Role & Permission
+
Lead Management
+
Call Center
+
Follow-up
+
Sales Funnel
+
Courses
+
Groups
+
Students
+
Payments
+
Debt Management
+
Reports
+
Dashboard
+
Notifications
+
Audit Logs
+
Dark/Light Mode
+
Responsive UI
+ 
BOSHLASHDAN OLDIN:

Avval menga:

1. Architecture
2. Database ERD tushuntirishi
3. Folder structure
4. Main modules
5. API structure
6. Development phases

ni ko‘rsat.

Shundan keyin PHASE 1 dan boshlagin.
