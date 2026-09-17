Sen hozir mavjud o‘quv markaz CRM loyihasini rivojlantirayotgan Senior Full-Stack Architect sifatida ishlaysan.

MUHIM:

Oldingi bosqichda yaratilgan CRM mavjud.

Mavjud:

- React.js + TypeScript frontend
- Node.js + Express + TypeScript backend
- PostgreSQL
- Prisma
- JWT authentication
- Role & Permission
- Leads
- Sales
- Calls
- Follow-ups
- Courses
- Groups
- Students
- Payments
- Debts
- Reports
- Dashboard
- Notifications
- Audit Logs
- Dark/Light Mode

ENDI SHU CRM'NI TO‘LIQ PROFESSIONAL O‘QUV MARKAZ BOSHQARUV TIZIMIGA AYLANTIR.

MAVJUD FUNKSIYALARNI BUZMA.

Yangi funksiyalarni mavjud architecture bilan integratsiya qil.

Database migrationlardan foydalan.

==================================================

1. # YANGI CRM ARXITEKTURASI

CRM quyidagi barcha yo‘nalishlarni qamrab olishi kerak:

1. Sales CRM
2. Students Management
3. Attendance
4. Gamification
5. Teacher Management
6. Teacher Salary
7. Finance
8. Income
9. Expenses
10. Groups
11. Courses
12. Parents
13. Homework
14. Exams
15. Student Progress
16. Notifications
17. Reports
18. Analytics
19. HR
20. Administration
21. Role & Permission
22. Audit Log

CRM boshqaruvchiga o‘quv markazning barcha jarayonlarini bitta joydan ko‘rish imkonini bersin.

================================================== 2. OWNER / DIRECTOR DASHBOARD
=============================

ENG MUHIM MODULLARDAN BIRI.

OWNER yoki DIRECTOR login qilganda butun markaz holatini ko‘ra olishi kerak.

Dashboard:

BUGUN:

- Yangi leadlar
- Yangi o‘quvchilar
- Trial lessonlar
- Davomat
- Kelmagan o‘quvchilar
- To‘lovlar
- Xarajatlar
- Sof tushum
- Qarzdorlik
- O‘qituvchilar
- Faol guruhlar

OYLIK:

- Umumiy tushum
- Umumiy xarajat
- Sof foyda
- Yangi leadlar
- Sotuvlar
- Conversion Rate
- Yangi o‘quvchilar
- Ketgan o‘quvchilar
- Faol o‘quvchilar
- Qarzdorlik
- O‘qituvchilar uchun hisoblangan maosh

================================================== 3. EXECUTIVE KPI
================

Owner dashboardda KPI cards:

TOTAL STUDENTS
ACTIVE STUDENTS
NEW STUDENTS
DROPPED STUDENTS
TOTAL GROUPS
TOTAL TEACHERS
MONTHLY REVENUE
MONTHLY EXPENSES
NET PROFIT
TOTAL DEBT
ATTENDANCE RATE
SALES CONVERSION

Har bir KPI ustiga bosilganda batafsil sahifaga o'tsin.

================================================== 4. ATTENDANCE SYSTEM
====================

To‘liq davomat tizimi yarat.

Teacher yoki Admin groupni ochadi.

Guruhdagi barcha o‘quvchilar chiqadi.

Bugungi sana avtomatik belgilanadi.

Har bir student uchun:

PRESENT
ABSENT
LATE
EXCUSED

statuslari bo‘lsin.

Teacher bir klik bilan davomat qo‘ya olsin.

Masalan:

Aliyev Aziz ✅
Valiyeva Madina ❌
Karimov Anvar 🕐
Rahimov Bekzod 🟡

================================================== 5. ATTENDANCE CALENDAR
======================

Har bir student profile'da:

Attendance Calendar

bo‘lsin.

Kunlar kalendar ko‘rinishida chiqsin.

Ranglar orqali:

Present
Absent
Late
Excused

ko‘rinsin.

Studentning:

TOTAL LESSONS
PRESENT
ABSENT
LATE
ATTENDANCE %

hisoblansin.

================================================== 6. ATTENDANCE STATISTICS
========================

Alohida:

ATTENDANCE

dashboard yarat.

Filter:

- Date range
- Course
- Group
- Teacher
- Student
- Status

Statistika:

Bugungi davomat
Haftalik davomat
Oylik davomat

Attendance percentage:

95–100%
90–95%
80–90%
70–80%
0–70%

bo‘yicha ko‘rsatilsin.

================================================== 7. ATTENDANCE RANKING
=====================

Studentlar davomat bo‘yicha reytingga tushsin.

Masalan:

🏆 DAVOMAT REYTINGI

1. Aziz — 100%
2. Madina — 98%
3. Anvar — 96%
4. Bekzod — 94%

Filter:

- All students
- Course
- Group
- Month
- Teacher

bo‘lsin.

Eng yuqori attendance bo‘lgan studentlar alohida ko‘rinsin.

================================================== 8. TEACHER ATTENDANCE
=====================

Teacher ham o‘z guruhlarining davomatini ko‘ra olsin.

Teacher dashboard:

My Groups
Today's Lessons
Today's Attendance
Absent Students
Attendance Rate

ko‘rinsin.

================================================== 9. AUTOMATIC ABSENCE NOTIFICATION
=================================

Agar student darsga kelmasa:

Notification yaratilishi kerak.

Admin/Manager ko‘rishi kerak.

Keyinchalik Telegram integration uchun architecture tayyor bo‘lsin.

Masalan:

"Aziz bugungi Frontend darsida qatnashmadi."

================================================== 10. GAMIFICATION SYSTEM
=======================

O‘quvchilar uchun professional gamification yarat.

Studentlar:

XP
Points
Level
Badges
Achievements
Streak
Leaderboard

tizimiga ega bo‘lsin.

================================================== 11. XP SYSTEM
=============

XP avtomatik berilsin.

Misol:

Darsga keldi:
+10 XP

Uy vazifasini topshirdi:
+20 XP

Testdan 90%+ oldi:
+30 XP

Imtihondan yaxshi natija:
+50 XP

7 kun ketma-ket qatnashdi:
+100 XP

Do‘st olib keldi:
+100 XP

Course tugatdi:
+500 XP

XP qoidalari admin tomonidan o‘zgartiriladigan bo‘lsin.

================================================== 12. LEVEL SYSTEM
================

Masalan:

Level 1 — Beginner
0 XP

Level 2
100 XP

Level 3
250 XP

Level 4
500 XP

Level 5
1000 XP

Level 10
5000 XP

Level tizimi dinamik bo‘lsin.

Admin level thresholdlarini o‘zgartira olsin.

================================================== 13. BADGES
==========

Badges:

🔥 7 Day Streak
🔥 30 Day Streak
🏆 Perfect Attendance
📚 Homework Hero
💯 Test Master
🚀 Fast Learner
⭐️ Top Student
🎯 Goal Crusher
👑 Monthly Champion

bo‘lsin.

Admin yangi badge yaratishi mumkin.

================================================== 14. LEADERBOARD
===============

Student leaderboard:

🏆 TOP STUDENTS

1. Aziz — 2450 XP
2. Madina — 2200 XP
3. Anvar — 1950 XP
4. Bekzod — 1700 XP

Filter:

- Weekly
- Monthly
- Yearly
- All Time

Course va Group bo‘yicha ham filter bo‘lsin.

================================================== 15. STUDENT PROFILE
===================

Student profile juda professional bo‘lsin.

Header:

Student name
Avatar
Level
XP
Progress bar
Rank
Attendance %

Tabs:

Overview
Attendance
Payments
Courses
Groups
Homework
Exams
Achievements
Activity

Overview:

XP
Level
Attendance
Average Score
Completed Courses
Current Group
Debt

================================================== 16. STREAK SYSTEM
=================

Student ketma-ket darsga kelganda streak oshsin.

Masalan:

🔥 3 days
🔥 7 days
🔥 14 days
🔥 30 days
🔥 60 days

Attendance asosida avtomatik hisoblanadi.

Bir necha dars sababsiz qoldirilsa streak reset bo‘lishi mumkin.

Business logic aniq va testlangan bo‘lsin.

================================================== 17. TEACHER MANAGEMENT
======================

Teacherlar uchun alohida modul.

Teacher:

- Full name
- Phone
- Email
- Specialization
- Experience
- Salary type
- Base salary
- Per student rate
- Per lesson rate
- Percentage
- Bonus
- Status
- Hire date

bo‘lsin.

================================================== 18. TEACHER SALARY SYSTEM
=========================

ENG MUHIM FUNKSIYA.

Teacher maoshi avtomatik hisoblanishi kerak.

Salary types:

1. FIXED
2. PER_LESSON
3. PER_STUDENT
4. PERCENTAGE
5. MIXED

Admin teacher uchun salary modelni tanlaydi.

================================================== 19. FIXED SALARY
================

Masalan:

Teacher salary:
5,000,000 UZS

Oy oxirida:

Base Salary = 5,000,000

bo‘lsin.

================================================== 20. PER LESSON
==============

Masalan:

1 lesson = 100,000 UZS

Oy davomida:

24 lesson

24 × 100,000 = 2,400,000 UZS

Avtomatik hisoblanadi.

Faqat o‘tkazilgan darslar hisobga olinsin.

================================================== 21. PER STUDENT
===============

Masalan:

1 student = 50,000 UZS

Teacherda:

30 students

30 × 50,000 = 1,500,000 UZS

================================================== 22. PERCENTAGE
==============

Masalan:

Teacher = 30%

Group revenue = 10,000,000

Teacher salary = 3,000,000

Avtomatik hisoblanadi.

================================================== 23. MIXED SALARY
================

Masalan:

Base:
2,000,000

-

Student:
30 × 30,000

-

Bonus:
500,000

TOTAL:

3,400,000

# Formula admin tomonidan sozlanadigan bo‘lsin.

24. # TEACHER SALARY DASHBOARD

Admin:

Teacher Salaries

sahifasini ko‘radi.

Columns:

Teacher
Lessons
Students
Revenue
Base
Bonus
Penalty
Calculated Salary
Paid
Remaining
Status

Status:

Pending
Calculated
Approved
Partially Paid
Paid

================================================== 25. SALARY HISTORY
==================

Har oy salary history saqlansin.

Masalan:

September 2026
October 2026
November 2026

Har bir oy uchun:

Calculated
Paid
Remaining

ko‘rinsin.

Oldingi oy ma'lumotlari o‘zgarmasin.

================================================== 26. SALARY APPROVAL
===================

Salary avtomatik hisoblanadi.

Lekin Owner/Admin:

APPROVE

qilishi kerak.

Approve qilingandan keyin salary locked bo‘lishi kerak.

O‘zgartirish uchun maxsus permission kerak.

Audit log yozilsin.

================================================== 27. FINANCE SYSTEM
==================

To‘liq moliyaviy modul yarat.

Menu:

Finance

ichida:

Dashboard
Income
Expenses
Transactions
Teacher Salaries
Student Payments
Debts
Reports

================================================== 28. INCOME
==========

Income qo‘shish:

- Amount
- Category
- Date
- Payment method
- Description
- Responsible user

Income categories:

Student Payment
Registration
Books
Uniform
Other

================================================== 29. EXPENSES
============

Expense:

- Amount
- Category
- Date
- Payment method
- Description
- Responsible user
- Attachment

Categories:

Teacher Salary
Rent
Advertisement
Utilities
Internet
Equipment
Office
Tax
Repair
Cleaning
Other

================================================== 30. TRANSACTION SYSTEM
======================

Har bir moliyaviy harakat transaction sifatida saqlansin.

TYPE:

INCOME
EXPENSE
TRANSFER
REFUND

Transaction history bo‘lsin.

Filter:

Date
Type
Category
User
Payment method

================================================== 31. FINANCIAL DASHBOARD
=======================

Dashboard:

TOTAL INCOME
TOTAL EXPENSE
NET PROFIT
TOTAL DEBT
TEACHER SALARY
MARKETING COST
OTHER EXPENSE

Formula:

NET PROFIT =
TOTAL INCOME - TOTAL EXPENSE

Chart:

Income vs Expense

kunlik / haftalik / oylik.

================================================== 32. CASH FLOW
=============

Cash flow chart yarat.

Har kuni:

Income
Expense
Balance

ko‘rinsin.

================================================== 33. CASH / BANK
===============

Payment accountlar:

Cash
Bank
Card
Click
Payme
Uzum

alohida hisobga olinishi mumkin.

Har bir account balance:

Cash: 4,500,000
Bank: 12,300,000
Card: 5,200,000

TOTAL BALANCE:

22,000,000

================================================== 34. BUDGET
==========

Admin oylik budget belgilashi mumkin.

Masalan:

Marketing:
5,000,000

Office:
2,000,000

Equipment:
3,000,000

Budget vs Actual ko‘rsatilishi kerak.

================================================== 35. PARENT SYSTEM
=================

Agar student voyaga yetmagan bo‘lsa:

Parent profile yaratish.

Parent:

- Name
- Phone
- Telegram
- Relationship

Student bilan relation.

Kelajakda parent portal qo‘shish uchun architecture tayyor bo‘lsin.

================================================== 36. HOMEWORK SYSTEM
===================

Teacher homework bera olsin.

Homework:

- Title
- Description
- Course
- Group
- Teacher
- Deadline
- Attachment
- Points

Student:

Submitted
Not Submitted
Late

statusiga ega.

Homework bajarilganda XP berilsin.

================================================== 37. EXAM / TEST SYSTEM
======================

Teacher/Admin:

Exam yaratishi mumkin.

Exam:

- Title
- Course
- Group
- Date
- Max score

Student result:

Score
Percentage
Grade

saqlansin.

High score uchun XP berilsin.

================================================== 38. STUDENT PROGRESS
====================

Student progress:

Attendance
Homework
Exam
XP
Teacher feedback

asosida ko‘rinsin.

Progress chart bo‘lsin.

================================================== 39. TEACHER PERFORMANCE
=======================

Owner teacher performance ko‘ra olsin.

Teacher:

- Number of students
- Attendance rate
- Average student score
- Homework completion
- Student retention
- Revenue generated
- Lessons conducted
- Salary
- Student feedback

ko‘rsatilsin.

================================================== 40. STUDENT RETENTION
=====================

Muhim analytics.

Ko‘rsat:

New students
Active students
Dropped students
Frozen students
Graduated students

Monthly retention rate.

Dropout analysis:

Qaysi course'dan ko‘p student ketmoqda?

Qaysi groupda dropout yuqori?

Qaysi teacherda retention yuqori?

================================================== 41. COURSE ANALYTICS
====================

Har bir course:

Students
Revenue
Expenses
Profit
Attendance
Dropout
Teacher
Groups

ko‘rinsin.

Masalan:

Frontend

Students: 70
Revenue: 42,000,000
Attendance: 91%
Dropout: 5%
Profit: ...

================================================== 42. GROUP ANALYTICS
===================

Har bir group:

Students
Capacity
Attendance
Revenue
Teacher
Debt
Average score

ko‘rinsin.

Capacity:

15 / 20

ko‘rinishida.

================================================== 43. SALES + EDUCATION INTEGRATION
=================================

Sales CRM va Education CRM bir-biriga bog‘langan bo‘lsin.

Flow:

Lead
↓
Trial
↓
Won
↓
Student
↓
Course
↓
Group
↓
Attendance
↓
Payment
↓
Homework
↓
Exam
↓
XP
↓
Achievement

Barcha ma'lumotlar bir-biri bilan bog‘liq bo‘lsin.

================================================== 44. GLOBAL SEARCH
=================

Bitta global search orqali:

Lead
Student
Teacher
Group
Course
Payment
Transaction

qidirish mumkin bo‘lsin.

================================================== 45. ADVANCED FILTER
===================

Barcha tablelarda:

Search
Filter
Sort
Pagination
Column visibility
Export

bo‘lsin.

================================================== 46. EXPORT
==========

CSV / Excel export:

Students
Leads
Attendance
Payments
Expenses
Income
Teacher Salary
Reports

uchun ishlasin.

================================================== 47. REPORT CENTER
=================

Professional Report Center yarat.

Reports:

Sales Report
Student Report
Attendance Report
Teacher Report
Salary Report
Income Report
Expense Report
Profit Report
Debt Report
Course Report
Group Report
Retention Report
Gamification Report

Date range bilan ishlasin.

================================================== 48. OWNER PERMISSION
====================

OWNER barcha ma'lumotlarni ko‘ra oladi.

Owner:

- Sales
- Students
- Teachers
- Attendance
- Finance
- Salary
- Expenses
- Income
- Reports
- Analytics
- Settings

hammasiga accessga ega.

Owner uchun maxsus Executive Dashboard bo‘lsin.

================================================== 49. ROLE DASHBOARD
==================

Har bir role uchun alohida dashboard:

OWNER:
Full analytics

ADMIN:
Operations

SALES:
Sales KPI

TEACHER:
Groups + Attendance + Homework

ACCOUNTANT:
Finance + Payments + Salary

CALL CENTER:
Calls + Leads + Follow-ups

Dashboarddagi ma'lumotlar permissionga qarab chiqsin.

================================================== 50. SETTINGS
============

Settings:

Academy information
Logo
Phone
Address
Working hours
Currency
Academic year
Attendance rules
XP rules
Level rules
Salary rules
Payment methods
Expense categories
Income categories
Notification settings

================================================== 51. AUDIT LOG
=============

Quyidagi barcha harakatlar log qilinsin:

Attendance changed
Payment created
Payment deleted
Salary calculated
Salary approved
Expense created
Income created
Student created
Student deleted
Teacher created
Role changed
Permission changed
XP added
Badge awarded

================================================== 52. SECURITY
============

Moliyaviy va o‘quvchi ma'lumotlari xavfsiz bo‘lishi kerak.

Role + Permission middleware.

Sensitive finance APIlar faqat ruxsat berilgan userlarga.

Salary faqat:

OWNER
ADMIN
ACCOUNTANT

ko‘ra olsin.

Expense create/edit permission bilan himoyalansin.

# Audit logni oddiy user o‘chira olmasin.

53. # DATABASE MODELS

Mavjud database schema'ni tekshir.

Kerak bo‘lsa quyidagi modellarni qo‘sh:

Attendance
AttendanceSession
GamificationProfile
XPTransaction
Level
Badge
StudentBadge
Streak
Teacher
TeacherSalary
TeacherSalaryRule
TeacherSalaryPayment
Income
Expense
Transaction
FinancialAccount
Budget
BudgetCategory
Parent
Homework
HomeworkSubmission
Exam
ExamResult
StudentProgress
Notification

Relationlarni professional tarzda yarat.

Indexes va constraints qo‘sh.

================================================== 54. DATABASE INTEGRITY
======================

Finance uchun:

Money calculations DECIMAL / NUMERIC orqali bajarilsin.

Float ishlatma.

Payment summalarida rounding error bo‘lmasin.

Teacher salary calculation transaction-safe bo‘lsin.

Attendance duplicate bo‘lmasin.

Bir student uchun bir lesson/date combination duplicate bo‘lmasin.

================================================== 55. BACKEND SERVICES
====================

Business logic controller ichiga tiqib yuborilmasin.

Alohida services:

AttendanceService
GamificationService
SalaryService
FinanceService
StudentService
PaymentService
ReportService
NotificationService

yarat.

================================================== 56. AUTOMATIC BUSINESS LOGIC
============================

Quyidagilar avtomatik ishlasin:

Student attendance qilindi
→ Attendance statistics update

Attendance present
→ XP beriladi

Attendance consecutive
→ Streak update

Streak milestone
→ Badge beriladi

Homework submitted
→ XP beriladi

Exam result
→ XP beriladi

Student payment
→ Debt update

Lesson completed
→ Teacher lesson count update

Month end salary
→ Teacher salary calculation

Income/Expense
→ Financial dashboard update

================================================== 57. FINANCE SAFETY
==================

Hech qachon payment yoki expense shunchaki DELETE qilib yo‘q qilinmasin.

Financial records uchun:

VOID
REFUND
REVERSAL

mexanizmini qo‘sh.

Audit log saqlansin.

================================================== 58. UI/UX
=========

CRM juda professional SaaS ko‘rinishda bo‘lsin.

Dashboardlar:

Cards
Charts
Tables
Progress bars
Badges
Timeline
Calendar
Kanban

bilan ishlasin.

UX:

3-click rule:
Muhim actionlar 3 ta clickdan ko‘p bo‘lmasin.

Teacher davomatni juda tez qo‘yishi kerak.

Accountant paymentni tez kiritishi kerak.

Sales manager leadni tez update qilishi kerak.

Owner kerakli statistikani 5 soniya ichida topa olishi kerak.

================================================== 59. MOBILE
==========

Teacher telefon orqali ham davomat qo‘ya olishi kerak.

Mobile:

- Attendance
- Student list
- Homework
- Notifications

juda qulay ishlashi kerak.

================================================== 60. DARK MODE
=============

Dark/Light mode barcha yangi modullarda ham ishlasin.

================================================== 61. LOADING / ERROR / EMPTY STATE
=================================

Har bir sahifada:

Loading
Skeleton
Error
Empty state

bo‘lsin.

================================================== 62. REAL DATA
=============

MOCK DATA bilan cheklanma.

Barcha yangi modullar:

React
↓
API
↓
Node.js
↓
Prisma
↓
PostgreSQL

orqali ishlasin.

LocalStorage faqat UI preferences uchun ishlatilishi mumkin.

Asosiy business data PostgreSQL'da saqlansin.

================================================== 63. TESTING
===========

Muhim business logic uchun test yoz.

Kamida:

Attendance calculation
XP calculation
Streak calculation
Debt calculation
Teacher salary calculation
Income/expense calculation
Profit calculation
Permission checking

test qilinsin.

================================================== 64. SEED DATA
=============

Development uchun realistic seed data yarat:

10 teachers
100 students
10 groups
5 courses
100+ attendance records
100+ payments
50+ expenses
50+ income
XP transactions
Badges
Homework
Exam results

Shunda dashboard real ko‘rinishda ishlasin.

================================================== 65. PERFORMANCE
===============

Kamida:

1000 teachers
100,000 students
1,000,000 attendance records
1,000,000 transactions

bilan ishlashni hisobga ol.

Pagination
Indexes
Aggregations
Database query optimization

ishlat.

N+1 query muammosiga yo‘l qo‘yma.

================================================== 66. OWNER EXECUTIVE REPORT
==========================

Owner uchun bitta juda muhim sahifa yarat:

"BUSINESS OVERVIEW"

Unda:

REVENUE
EXPENSE
PROFIT
STUDENTS
NEW STUDENTS
DROPOUT
ATTENDANCE
DEBT
SALES
CONVERSION
TEACHER COST
MARKETING COST

hammasi bitta joyda.

Date range:

Today
This Week
This Month
Last Month
This Year
Custom

bo‘lsin.

================================================== 67. PROFITABILITY
=================

Course profitability:

Revenue
Teacher salary
Marketing
Other expenses

asosida:

Gross Profit
Net Profit
Profit Margin

hisoblansin.

Course bo‘yicha ham.

Umumiy markaz bo‘yicha ham.

================================================== 68. ALERT SYSTEM
================

Owner/Admin uchun alerts:

🔴 High debt
🔴 Low attendance
🔴 High dropout
🔴 Overdue follow-ups
🔴 Unpaid teacher salary
🔴 Expense exceeds budget
🟡 Low group capacity
🟢 Sales target achieved

bo‘lsin.

================================================== 69. SALES TARGET
================

Manager uchun target:

Monthly Lead Target
Monthly Sales Target
Revenue Target

belgilash mumkin bo‘lsin.

Progress:

65 / 100 sales

ko‘rinishida.

================================================== 70. EMPLOYEE PERFORMANCE
========================

Sales manager:

Leads
Calls
Follow-ups
Won
Lost
Revenue
Conversion

Teacher:

Students
Attendance
Homework
Average score
Retention
Revenue
Salary

bo‘yicha baholansin.

================================================== 71. FUTURE READY ARCHITECTURE
=============================

Kelajakda:

Telegram Bot
WhatsApp
SMS
Online Payment
Parent Portal
Student Mobile App
Teacher Mobile App
AI Analytics

qo‘shish mumkin bo‘ladigan architecture yarat.

Hozir integratsiya qilish shart emas.

Lekin database va API architecture bunga tayyor bo‘lsin.

================================================== 72. MUHIM TALAB
===============

MAVJUD CRM'NI QAYTADAN YOZMA.

Avval mavjud projectni analiz qil:

- package.json
- frontend structure
- backend structure
- Prisma schema
- existing API
- authentication
- roles
- permissions
- components
- routes

Keyin yangi modullarni mavjud architecture bilan integratsiya qil.

Mavjud funksiyalarni buzma.

================================================== 73. DEVELOPMENT STRATEGY
========================

Quyidagi tartibda ishlagin:

PHASE 1
Existing project audit

PHASE 2
Database schema update

PHASE 3
Attendance

PHASE 4
Gamification

PHASE 5
Teacher management

PHASE 6
Teacher salary

PHASE 7
Finance

PHASE 8
Income/Expense

PHASE 9
Owner dashboard

PHASE 10
Reports & analytics

PHASE 11
Homework & exams

PHASE 12
Student progress

PHASE 13
Alerts

PHASE 14
Performance optimization

PHASE 15
Security audit

PHASE 16
Testing

PHASE 17
Final UI/UX polish

================================================== 74. HAR BIR PHASE UCHUN
=======================

Har bir PHASE'da:

1. Mavjud kodni analiz qil
2. O‘zgartiriladigan fayllarni ko‘rsat
3. Yangi fayllarni ko‘rsat
4. Database migration yoz
5. Backend code yoz
6. API yarat
7. Frontend UI yarat
8. Integration qil
9. Test yoz
10. Test qilish commandlarini ber

TO‘LIQ KOD YOZ.

Hech qachon:

TODO
IMPLEMENT HERE
REST OF CODE
EXAMPLE ONLY

deb tashlab ketma.

================================================== 75. FINAL QUALITY CHECK
=======================

Loyiha tugagach quyidagilarni tekshir:
[ ] Login ishlaydi
[ ] Roles ishlaydi
[ ] Permissions ishlaydi
[ ] Leads ishlaydi
[ ] Sales ishlaydi
[ ] Students ishlaydi
[ ] Groups ishlaydi
[ ] Attendance ishlaydi
[ ] Attendance statistics ishlaydi
[ ] Attendance ranking ishlaydi
[ ] Gamification ishlaydi
[ ] XP ishlaydi
[ ] Levels ishlaydi
[ ] Badges ishlaydi
[ ] Streak ishlaydi
[ ] Leaderboard ishlaydi
[ ] Teachers ishlaydi
[ ] Salary calculation ishlaydi
[ ] Salary approval ishlaydi
[ ] Payments ishlaydi
[ ] Debts ishlaydi
[ ] Income ishlaydi
[ ] Expenses ishlaydi
[ ] Transactions ishlaydi
[ ] Profit calculation ishlaydi
[ ] Reports ishlaydi
[ ] Export ishlaydi
[ ] Notifications ishlaydi
[ ] Owner dashboard ishlaydi
[ ] Audit logs ishlaydi
[ ] Responsive ishlaydi
[ ] Dark mode ishlaydi
[ ] Security ishlaydi
[ ] Database persistence ishlaydi
[ ] API error handling ishlaydi
[ ] Production build ishlaydi

==================================================
FINAL GOAL
==========

Maqsad oddiy CRM emas.

Menga:

SALES CRM

- STUDENT MANAGEMENT SYSTEM
- ATTENDANCE SYSTEM
- GAMIFICATION PLATFORM
- TEACHER MANAGEMENT
- TEACHER PAYROLL
- FINANCIAL MANAGEMENT
- ACCOUNTING-LIKE INCOME/EXPENSE
- EDUCATION MANAGEMENT
- ANALYTICS
- OWNER EXECUTIVE DASHBOARD

birlashtirilgan professional O‘QUV MARKAZ BOSHQARUV TIZIMI kerak.

Tizim real o‘quv markazda har kuni ishlatilishi mumkin bo‘lgan darajada professional bo‘lsin.

Avval EXISTING PROJECT AUDIT qil.

Keyin menga:

1. Hozirgi architecture tahlili
2. Nimalar mavjud
3. Nimalar yetishmayapti
4. Qaysi database table/model qo‘shiladi
5. Qaysi API qo‘shiladi
6. Qaysi frontend pages qo‘shiladi
7. Development plan

ni ko‘rsat.

KEYIN PHASE 1 DAN BOSHLASH.
