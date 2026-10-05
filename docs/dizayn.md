# ACADEMY CRM — PREMIUM UI/UX REDESIGN

## Professional Design System & Full Frontend Redesign

SENING ROLING:
Sen Senior Product Designer + Senior Frontend Engineer + Design System Architect sifatida ishlaysan.

MENDA ALLAQACHON ISHLAB TURGAN KATTA ACADEMY CRM BOR.

MUHIM:
Bu yangi CRM yaratish vazifasi EMAS.
Mavjud CRM'ning funksional imkoniyatlarini saqlab qolgan holda uning frontend UI/UX qismini zamonaviy, premium, professional SaaS mahsulot darajasiga olib chiqish vazifasi.

==================================================

1. # ASOSIY MAQSAD

Maqsad:

Mavjud Academy CRM'ni 2026-yil darajasidagi zamonaviy B2B SaaS / Education Management Platform dizayniga o'tkazish.

CRM foydalanuvchi ko'rganda quyidagi taassurot paydo bo'lishi kerak:

- premium
- professional
- clean
- modern
- fast
- minimal
- trustworthy
- enterprise-ready
- easy to use
- visually consistent

Dizayn oddiy "admin panel" ko'rinishida bo'lmasligi kerak.

Eski:

- katta rangli cardlar
- haddan tashqari border
- ortiqcha shadow
- gradientlarning ko'pligi
- juda ko'p rang
- zich va tartibsiz table
- eski dashboard ko'rinishi
- keraksiz iconlar
- bir xil darajadagi barcha elementlar

kabi yondashuvlardan qoch.

Yangi dizayn:

- professional SaaS
- information hierarchy
- whitespace
- subtle borders
- subtle shadows
- clean typography
- compact but readable tables
- clear hierarchy
- consistent spacing
- meaningful colors
- excellent responsive behavior

asosida qurilsin.

================================================== 2. ENG MUHIM QOIDA
==================================================

FUNCTIONALITY MUST NOT BREAK.

Quyidagilarni buzish qat'iyan mumkin emas:

- API
- backend
- database
- Prisma
- authentication
- authorization
- RBAC
- permissions
- ownership scope
- branch scope
- Telegram integration
- payment system
- notifications
- AI
- exams
- homework
- attendance
- XP
- finance
- reports
- analytics
- automation
- student portal
- parent portal
- teacher functionality

Dizayn uchun backend biznes logikasini qayta yozma.

Mavjud API contractni o'zgartirma.

Mavjud route va permissionlarni buzma.

Agar biror joyni o'zgartirish zarur bo'lsa, avval mavjud implementationni tushun va minimal o'zgarish qil.

================================================== 3. ISHNI KOD YOZISHDAN BOSHLAMA
==================================================

Birinchi navbatda mavjud frontendni TO'LIQ AUDIT qil.

Tekshir:

1. frontend architecture
2. routes
3. layouts
4. components
5. reusable components
6. tables
7. forms
8. modals
9. drawers
10. buttons
11. inputs
12. select
13. dropdown
14. tabs
15. cards
16. badges
17. alerts
18. charts
19. navigation
20. sidebar
21. topbar
22. mobile layout
23. responsive behavior
24. dark/light mode
25. typography
26. colors
27. spacing
28. loading states
29. empty states
30. error states
31. skeleton states
32. accessibility
33. permission-based UI
34. existing design inconsistencies

Avval menga audit natijasini chiqar.

FORMAT:

## DESIGN AUDIT

Current architecture:
Current design system:
Current problems:
Duplicated components:
Reusable components:
Pages:
Major UX problems:
Responsive problems:
Accessibility problems:
Recommended redesign architecture:

Keyingi bosqichda kodga o't.

================================================== 4. DESIGN PHILOSOPHY
==================================================

Dizayn quyidagi prinsiplar asosida bo'lsin:

1. Clarity over decoration
2. Information hierarchy
3. Consistency
4. Minimalism
5. Speed
6. Accessibility
7. Responsive first
8. Reusability
9. Data density without visual clutter
10. Professional SaaS appearance

CRM katta hajmdagi ma'lumotlar bilan ishlaydi.

Shuning uchun dizayn faqat chiroyli emas, balki DATA-DENSE bo'lishi kerak.

Masalan:

Table 100 ta student bilan ishlaganda ham:

- o'qish oson
- filter qilish oson
- search qilish oson
- pagination oson
- action topish oson

bo'lishi kerak.

================================================== 5. VISUAL STYLE
==================================================

Design language:

Modern SaaS / Enterprise / Education Platform.

Ilhom sifatida quyidagi mahsulotlarning UX sifatini o'rgan:

- Linear
- Vercel
- Stripe Dashboard
- Notion
- Raycast
- Supabase
- Framer

LEKIN:

Ularning dizaynini copy qilma.

Faqat:

- spacing
- hierarchy
- interaction
- typography
- navigation
- information density
- visual discipline

kabi prinsiplarini o'rgan.

Academy CRM uchun UNIQUE design system yarat.

================================================== 6. COLOR SYSTEM
==================================================

Primary color sifatida professional BLUE/INDIGO yo'nalishidan foydalanish mumkin.

Lekin barcha UI ko'k rangga bo'yalmasin.

Color hierarchy:

Primary
Success
Warning
Danger
Info
Neutral

Statuslar semantic bo'lsin.

Misol:

SUCCESS:

- Present
- Paid
- Active
- Completed

WARNING:

- Pending
- Attention
- Late

DANGER:

- Absent
- Debt
- Critical
- Failed

INFO:

- Scheduled
- New
- Information

Ranglar faqat ma'no berish uchun ishlatilsin.

================================================== 7. TYPOGRAPHY
==================================================

Typography professional SaaS darajasida bo'lsin.

Tavsiya:

Inter yoki tizimga mos zamonaviy sans-serif.

Typography hierarchy:

Display
H1
H2
H3
Body
Small
Caption
Table
Label

Font weight va line-height izchil bo'lsin.

Har bir sahifa o'zicha typography ishlatmasin.

Bitta global typography system yarat.

================================================== 8. SPACING SYSTEM
==================================================

Global spacing system yarat.

Masalan:

4
8
12
16
20
24
32
40
48
64

Barcha componentlar shu scale asosida ishlasin.

Random margin/padding ishlatma.

================================================== 9. BORDER RADIUS
==================================================

Modern, lekin haddan tashqari rounded emas.

Tavsiya:

small:
6px

medium:
8px

large:
12px

dialog:
16px

Buttons va inputs ham shu systemga mos bo'lsin.

"Everything rounded" dizayn qilma.

================================================== 10. SHADOW
==================================================

Shadow juda subtle bo'lsin.

Cardlar har doim katta shadow bilan ajratilmasin.

Asosan:

border
background contrast
spacing

orqali hierarchy yarat.

================================================== 11. GLOBAL APP SHELL
==================================================

CRMning asosiy shell qismini professional darajaga olib chiq:

Sidebar
Topbar
Main content
Breadcrumb
Page header
Command/search
Notifications
User menu

Sidebar:

- compact
- expandable
- active state
- icon + label
- grouped navigation
- role-based items
- permission-based visibility

Sidebar haddan tashqari keng bo'lmasin.

Desktop:
~240px

Collapsed:
~72px

Responsive mobile:
drawer.

================================================== 12. SIDEBAR NAVIGATION
==================================================

Navigationni mantiqiy guruhlarga ajrat:

OVERVIEW

- Dashboard

SALES

- Leads
- Calls
- Follow-ups
- Trials

ACADEMIC

- Students
- Groups
- Courses
- Lessons
- Homework
- Exams
- Progress
- Attendance

FINANCE

- Payments
- Debts
- Expenses
- Salary
- Reports

PEOPLE

- Teachers
- Parents

ANALYTICS

- Analytics
- Marketing
- KPI

AUTOMATION

- Automations
- Notifications

SYSTEM

- Settings
- Audit
- Permissions

Faqat mavjud route/functionlar asosida navigationni tuz.

Mavjud route bo'lmasa yangi fake page yaratma.

================================================== 13. DASHBOARD REDESIGN
==================================================

Dashboard eng professional sahifa bo'lishi kerak.

Dashboardda:

Top:

- page title
- date range
- branch selector
- quick actions

KPI:

Students
Active Students
New Leads
Revenue
Debt
Attendance
Conversion
At-risk Students

KPI cardlar:

- compact
- clean
- trend
- comparison
- icon
- semantic color
- optional sparkline

Keyin:

Revenue chart
Student growth
Lead funnel
Attendance trend
Course performance

Pastda:

Recent activity
Upcoming lessons
Outstanding payments
At-risk students
Recent leads

Dashboard haddan tashqari ko'p carddan iborat bo'lmasin.

Information hierarchy juda aniq bo'lsin.

================================================== 14. TABLE SYSTEM
==================================================

CRMning eng muhim UI elementlaridan biri TABLE.

Professional data table system yarat.

Features:

- sticky header
- sorting
- filtering
- search
- pagination
- column visibility
- column ordering
- responsive
- row selection
- bulk actions
- export
- density control
- empty state
- loading skeleton
- row actions

Table row height:

Compact
Comfortable

variantlarga ega bo'lishi mumkin.

Actions:

- View
- Edit
- Delete
- More

uchun clean dropdown ishlat.

Har bir rowga 5-6 ta button chiqarma.

================================================== 15. STUDENT PAGE
==================================================

Student profile sahifasini premium Student 360 ko'rinishiga o'tkaz.

Header:

Avatar
Name
Student ID
Status
Course
Group
Branch

Quick actions:

- Payment
- Attendance
- Homework
- Exam
- Message
- Edit

Tabs:

Overview
Academic
Attendance
Homework
Exams
Payments
XP & Achievements
Certificates
Activity

Overview:

Progress
Attendance
Debt
XP
Current course
Upcoming lesson
Risk status

Bu sahifa CRMdagi eng kuchli profile page bo'lishi kerak.

================================================== 16. TEACHER PAGE
==================================================

Teacher profile:

Profile
Groups
Schedule
Students
Attendance
Homework
Exams
KPI
Salary
Performance

Teacher KPI visualization professional bo'lsin.

================================================== 17. GROUP PAGE
==================================================

Group page:

Group header
Teacher
Course
Room
Schedule
Student count
Attendance
Progress

Tabs:

Students
Attendance
Lessons
Homework
Exams
Progress
Analytics

================================================== 18. FINANCE UI
==================================================

Finance UI juda professional bo'lishi kerak.

Asosiy KPI:

Revenue
Expenses
Profit
Debt
Cash
Bank

Transaction table:

Date
Type
Category
Amount
Method
Student
Status
Reference

Money values bir xil formatda ko'rinsin.

Finance sahifasida ortiqcha rang ishlatma.

Negative/positive values semantic bo'lsin.

================================================== 19. SALES / LEADS UI
==================================================

Lead managementni zamonaviy CRM ko'rinishiga olib chiq.

Views:

Table
Kanban

Kanban stages:

NEW
CONTACTED
INTERESTED
TRIAL
WON
LOST

Lead card:

Name
Phone
Source
Course
Status
Manager
Next follow-up
Score

Lead detail drawer/page:

Timeline

Call
Contact
Follow-up
Trial
Status change

================================================== 20. ATTENDANCE UI
==================================================

Davomat maksimal tez ishlatiladigan UI bo'lsin.

Teacher:

Group
→ Lesson
→ Student list

Student row:

Present
Absent
Late
Excused

Bitta tugma bilan status almashtirish imkoniyati.

Bulk actions.

Keyboard-friendly UX.

Mobileda ham qulay.

================================================== 21. HOMEWORK UI
==================================================

Homework dashboard:

Pending
Submitted
Late
Reviewed
Overdue

Teacher uchun:

Create Homework

Student submission:

File
Text
Code
Status
Grade
Feedback

Visual status system ishlat.

================================================== 22. EXAM UI
==================================================

Exam management:

Draft
Published
Started
Completed
Expired

Exam detail:

Questions
Variants
Attempts
Results
Analytics

Student exam interface:

- clean
- distraction free
- timer
- question navigation
- progress
- submit confirmation

================================================== 23. GAMIFICATION UI
==================================================

XP / Badge / Level / Streak / Leaderboard dizayni zamonaviy bo'lsin.

Lekin childish/game-like dizayn qilma.

Academy professional platforma bo'lib qolishi kerak.

Achievementlar premium ko'rinishda bo'lsin.

================================================== 24. NOTIFICATION CENTER
==================================================

Global notification center:

Unread count
Categories
Priority
Read/unread
Time
Action

Categories:

Academic
Finance
Attendance
Homework
Exam
Sales
System

Notification drawer zamonaviy bo'lsin.

================================================== 25. AI UI
==================================================

AI funksiyalarni oddiy chat oynasi qilib qo'yma.

AI uchun professional interface:

AI Insights
AI Summary
AI Recommendations
AI Risk Analysis
AI Generated Draft

AI javoblari card/block ko'rinishida bo'lsin.

Masalan:

"3 ta o'quvchi AT_RISK"

↓

Why?

↓

Recommended actions

↓

[Review students]

AI-generated content har doim aniq label bilan:

AI Generated

ko'rsatilishi mumkin.

================================================== 26. MODALS / DRAWERS
==================================================

Har bir narsani yangi page qilib ochma.

Quick actions uchun drawer ishlat:

Student
Lead
Payment
Homework
Notification
Teacher
Group

Modal faqat qisqa interaction uchun.

Complex data uchun full page.

================================================== 27. FORMS
==================================================

Form system yarat.

Input
Select
Multi-select
Date picker
Time picker
Textarea
File upload
Search select
Currency input

Validation:

- inline
- understandable
- immediate where appropriate

Error message professional bo'lsin.

================================================== 28. LOADING / EMPTY / ERROR STATES
==================================================

Har bir page uchun 3 holat majburiy:

LOADING
EMPTY
ERROR

Loading:

Skeleton.

Empty:

Icon
Title
Description
Action

Error:

Clear message
Retry

"Ma'lumot topilmadi" kabi xom text qoldirma.

================================================== 29. RESPONSIVE DESIGN
==================================================

Desktop birinchi bo'lishi mumkin, lekin responsive majburiy.

Breakpoints:

Mobile
Tablet
Laptop
Desktop
Large Desktop

Mobile:

Sidebar → Drawer
Tables → adaptive cards / horizontal scroll where appropriate
Actions → bottom sheet / menu
Filters → drawer
Forms → one-column

Hech qaysi page mobileda buzilmasin.

================================================== 30. DARK MODE
==================================================

Agar mavjud bo'lsa, dark mode'ni professional darajaga olib chiq.

Dark mode:

Pure black emas.

Neutral dark surfaces.

Contrast accessibility talabiga javob bersin.

Light va Dark design tokens orqali boshqarilsin.

================================================== 31. DESIGN TOKENS
==================================================

Barcha design qiymatlarni markazlashtir.

Masalan:

colors
spacing
radius
shadows
typography
z-index
transitions

CSS variables / Tailwind theme / mavjud architecturega mos design tokens ishlat.

Har bir component o'zicha color yoki spacing o'ylab topmasin.

================================================== 32. COMPONENT LIBRARY
==================================================

Reusable component library yarat yoki mavjudini professional darajada refactor qil.

Minimum:

Button
IconButton
Input
Select
Combobox
DatePicker
Badge
Avatar
Card
Table
Tabs
Modal
Drawer
Dropdown
Tooltip
Toast
Alert
Skeleton
EmptyState
ErrorState
StatCard
PageHeader
Breadcrumb
FilterBar
SearchBar
DataTable
Timeline
StatusBadge
ConfirmDialog

Componentlar consistent bo'lishi shart.

================================================== 33. ICON SYSTEM
==================================================

Bitta icon library ishlat.

Iconlar:

- consistent size
- consistent stroke
- consistent visual weight

Emoji bilan professional UI yaratma.

================================================== 34. ANIMATION
==================================================

Animation minimal va purposeful bo'lsin.

Masalan:

- page transition
- drawer
- modal
- dropdown
- hover
- loading
- success

300ms atrofidagi smooth transitionlar.

Lekin har bir elementni animatsiya qilma.

CRM tez ishlaydigan business software bo'lishi kerak.

================================================== 35. ACCESSIBILITY
==================================================

WCAGga imkon qadar mos:

- keyboard navigation
- focus states
- aria labels
- contrast
- screen reader friendly
- accessible dialogs
- accessible forms

Focus outline olib tashlama.

================================================== 36. PERFORMANCE
==================================================

Redesign performanceni yomonlashtirmasligi kerak.

Avoid:

- unnecessary re-render
- giant component
- duplicate API calls
- huge JS bundle
- unnecessary animation
- unnecessary dependencies

Existing data fetching architectureni saqla.

================================================== 37. UX PRINCIPLES
==================================================

Foydalanuvchi 3 soniya ichida quyidagilarni tushunishi kerak:

1. Men qayerdaman?
2. Bu sahifada nima qilaman?
3. Eng muhim action qaysi?
4. Ma'lumot nimani anglatadi?
5. Keyingi qadam nima?

Har bir page shu prinsip bo'yicha qurilsin.

================================================== 38. SEARCH / COMMAND CENTER
==================================================

Global searchni professional qiling.

Shortcut:

CMD + K

yoki mavjud architecturega mos.

Search:

Student
Teacher
Parent
Lead
Group
Course
Payment
Homework
Exam
Certificate

Search result category bilan chiqsin.

Keyboard navigation bo'lsin.

================================================== 39. PAGE HEADER SYSTEM
==================================================

Har bir page bir xil header systemdan foydalansin.

Misol:

Dashboard

[Title]
Description

[Date] [Filter] [Export] [+ Add]

Student

[Back]
[Avatar] Name
Status

[Edit] [Payment] [More]

Bu barcha page'larda izchil bo'lsin.

================================================== 40. DESIGN SYSTEM DOCUMENTATION
==================================================

Redesign tugagach quyidagilarni dokument qil:

1. Color system
2. Typography
3. Spacing
4. Radius
5. Shadows
6. Buttons
7. Inputs
8. Tables
9. Cards
10. Modals
11. Drawers
12. Statuses
13. Icons
14. Responsive rules
15. Dark mode
16. Accessibility

================================================== 41. IMPLEMENTATION STRATEGY
==================================================

Butun CRMni birdaniga buzib qayta yozma.

Bosqichma-bosqich ishlagin.

PHASE 1
Design tokens + App Shell

PHASE 2
Sidebar + Topbar + Navigation

PHASE 3
Dashboard

PHASE 4
Tables + Filters + Search

PHASE 5
Student / Teacher / Parent

PHASE 6
Groups + Courses + Lessons

PHASE 7
Homework + Exams + Progress

PHASE 8
Attendance

PHASE 9
Sales / Leads

PHASE 10
Finance

PHASE 11
Analytics / Reports

PHASE 12
AI

PHASE 13
Settings

PHASE 14
Responsive

PHASE 15
Dark Mode

PHASE 16
Accessibility + Performance

Har phase tugagandan keyin:

- TypeScript
- lint
- build
- existing tests

ishlashi kerak.

================================================== 42. MUHIM: EXISTING FUNCTIONALITYNI SAQLASH
==================================================

Redesign davomida quyidagilarni buzma:

- API endpoints
- route names
- backend logic
- permission checks
- role checks
- branch scope
- ownership
- forms logic
- validation
- data fetching
- mutations
- notifications
- Telegram
- payment
- AI
- reports

Agar eski component yomon yozilgan bo'lsa:

uni asta-sekin reusable componentga refactor qil.

Birdaniga hamma narsani o'chirib tashlama.

================================================== 43. CODE QUALITY
==================================================

Yangi componentlar:

- small
- reusable
- composable
- typed
- readable

bo'lsin.

Mega-component yaratma.

Masalan:

BAD:

StudentPage.tsx = 2000 lines

GOOD:

StudentPage
├── StudentHeader
├── StudentStats
├── StudentTabs
├── StudentOverview
├── StudentAttendance
├── StudentHomework
├── StudentPayments
├── StudentExams
└── StudentActivity

================================================== 44. OLD DESIGNNI FAQAT BO'YASH BILAN CHEKLANMA
==================================================

Men shunchaki:

background-color
font-size
border-radius

o'zgartirishni xohlamayman.

BU TO'LIQ UI/UX REDESIGN.

Kerak bo'lsa:

- layout
- hierarchy
- component composition
- navigation
- table structure
- information architecture
- interaction patterns

ham qayta ko'rib chiqilsin.

Lekin business functionality o'zgarmasin.

================================================== 45. FINAL QUALITY BAR
==================================================

Ish tugaganda CRM quyidagicha ko'rinishi kerak:

"Bu oddiy o'quv markaz admin paneli emas."

Balki:

"Bu professional, zamonaviy, enterprise-level Academy Management SaaS platform."

degan taassurot berishi kerak.

UI:

- premium
- clean
- modern
- fast
- consistent
- scalable
- responsive
- accessible

bo'lishi shart.

================================================== 46. ENG MUHIM TOPSHIRIQ
==================================================

HOZIRCHA KOD YOZMA.

Birinchi navbatda:

1. Mavjud frontendni audit qil.
2. Barcha route/page'larni aniqlagin.
3. Mavjud componentlarni aniqlagin.
4. Design system muammolarini top.
5. UX muammolarini top.
6. Reusable component architecture tuz.
7. Yangi design system rejasini ber.
8. Redesign roadmap tuz.
9. Qaysi fayllar o'zgarishini ko'rsat.
10. Qaysi fayllarni o'zgartirmaslik kerakligini ko'rsat.

So'ng menga:

# DESIGN AUDIT REPORT

formatida hisobot chiqar.

Hisobotdan keyin men "START PHASE 1" desam,
faqat PHASE 1 ni implement qil.

Har phase oldidan:

- objective
- files
- components
- risks
- expected result

ni ko'rsat.

Har phase oxirida:

- changed files
- implemented components
- tests
- build result
- remaining issues

ni ko'rsat.

HECH QACHON BARCHA CRMNI BIR URINISHDA REWRITE QILMA.

==================================================
FINAL PRINCIPLE
==================================================

DESIGN FIRST.
SYSTEM SECOND.
COMPONENTS THIRD.
PAGES FOURTH.
DETAILS LAST.

FUNCTIONALITY MUST SURVIVE.

NO BUSINESS LOGIC BREAKING.

NO API BREAKING.

NO DATA LOSS.

NO FAKE DATA.

NO FAKE FEATURES.

NO PLACEHOLDER UI.

CREATE A REAL PRODUCTION-READY PREMIUM ACADEMY CRM UI.
