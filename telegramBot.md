# 🚀 ACADEMY CRM — TELEGRAM BOT

## PROFESSIONAL DEVELOPMENT PROMPT / TEXNIK TOPSHIRIQ

Sen senior-level **Software Architect + Backend Developer + Telegram Bot Developer + DevOps Engineer + Security Engineer** sifatida ishlaysan.

Menda allaqachon ishlab chiqilgan **Academy CRM** mavjud. CRM education center uchun mo‘ljallangan va unda Lead, Student, Course, Group, Attendance, Homework, Exam, XP/Gamification, Payment, Debt, Expense, Teacher Salary, Dashboard, Reports, Notifications, Roles, Permissions, Audit va boshqa modullar mavjud.

Men endi shu CRM bilan to‘liq integratsiyalangan, professional va production-ready **Telegram Bot Platform** yaratmoqchiman.

---

# 1. ENG MUHIM QOIDA

❗ Mavjud CRM'ni boshidan qayta yozma.

❗ Mavjud database strukturasini, business logic'ni va ishlayotgan modullarni keraksiz ravishda buzma.

❗ Telegram bot alohida ikkinchi CRM bo‘lmasligi kerak.

❗ Telegram bot — CRM uchun **interface/client** bo‘ladi.

To‘g‘ri arxitektura:

```text
Telegram User
      ↓
Telegram Bot
      ↓
Bot Service
      ↓
CRM REST API
      ↓
Business Logic
      ↓
PostgreSQL
```

Noto‘g‘ri:

```text
Telegram Bot
      ↓
PostgreSQL
```

Bot database'ga to‘g‘ridan-to‘g‘ri ulanmasin.

Barcha muhim business logic CRM backend orqali ishlasin.

Masalan:

- Attendance → CRM API
- Payment → CRM API
- Student → CRM API
- Homework → CRM API
- Exam → CRM API
- XP → CRM API
- Debt → CRM API
- Lead → CRM API
- Reports → CRM API

Telegram bot faqat foydalanuvchi interfeysi va orchestration vazifasini bajarsin.

---

# 2. BIRINCHI QADAM — MAVJUD CRM'NI AUDIT QIL

Kod yozishni darhol boshlama.

Avval mavjud projectni to‘liq tekshir.

Quyidagilarni aniqlab chiq:

### Backend

- Framework
- Node.js version
- Express/Nest/Fastify yoki boshqa framework
- REST API struktura
- Controllers
- Services
- Middleware
- Auth
- JWT/session
- Refresh token
- RBAC
- Permissions
- Validation
- Error handling

### Database

- PostgreSQL
- Prisma yoki boshqa ORM
- Barcha asosiy models
- Relations
- Indexes
- Constraints
- Existing notification tables
- Existing users
- Existing roles
- Existing permissions

### CRM modullari

Quyidagilar mavjudligini tekshir:

- Users
- Roles
- Permissions
- Leads
- Students
- Parents
- Teachers
- Courses
- Groups
- Lessons
- Attendance
- Homework
- Exams
- Payments
- Debts
- Expenses
- Teacher salaries
- XP
- Levels
- Badges
- Leaderboard
- Certificates
- Notifications
- Audit logs
- Reports
- Marketing
- Branches
- Rooms
- Schedule

### API

Mavjud endpointlarni top.

Masalan:

```http
GET /api/students/me
GET /api/students/:id
GET /api/groups
GET /api/attendance
POST /api/attendance
GET /api/payments
GET /api/homework
GET /api/exams
GET /api/notifications
```

Agar endpoint mavjud bo‘lmasa, Telegram bot uchun qanday endpoint kerakligini aniqlab ber.

---

# 3. AUDIT NATIJASI

Audit tugagandan keyin menga quyidagilarni chiqar:

## A. Existing Architecture

```text
Frontend
Backend
Database
Auth
RBAC
Notifications
```

## B. Existing APIs

Jadval ko‘rinishida:

| Method | Endpoint | Role    | Purpose |
| ------ | -------- | ------- | ------- |
| GET    | /api/... | Student | ...     |
| POST   | /api/... | Teacher | ...     |

## C. Telegram uchun qayta ishlatiladigan API'lar

## D. Yangi API'lar

## E. Yangi DB tablelar

## F. Permission mapping

## G. Notification events

## H. Security risks

## I. Development roadmap

Shundan keyingina developmentni boshlagin.

---

# 4. TELEGRAM BOTNING ASOSIY MAQSADI

Telegram botning maqsadi:

### Student

CRM'ga kirmasdan Telegram orqali:

- profilini ko‘rish
- kursini ko‘rish
- guruhini ko‘rish
- dars jadvalini ko‘rish
- davomatini ko‘rish
- homework ko‘rish
- homework topshirish
- examlarni ko‘rish
- natijalarni ko‘rish
- XP ko‘rish
- leaderboard ko‘rish
- achievement ko‘rish
- payment holatini ko‘rish
- qarzdorlikni ko‘rish
- notification olish
- admin bilan bog‘lanish

### Parent

Farzandlarini nazorat qilish:

- attendance
- homework
- exam
- progress
- payment
- debt
- schedule
- notifications

### Teacher

Telegram orqali:

- guruhlarini ko‘rish
- bugungi darslarini ko‘rish
- studentlarni ko‘rish
- attendance qilish
- homework berish
- exam natijalarini kiritish
- student progressini ko‘rish

### Sales Manager

- leadlarni ko‘rish
- yangi leadlarni ko‘rish
- call list
- follow-up
- hot leads
- trial lessons
- lead statusini o‘zgartirish
- lead bilan bog‘liq actionlarni bajarish

### Owner / Director

- bugungi tushum
- xarajat
- sof natija
- studentlar
- yangi studentlar
- leadlar
- conversion
- qarzdorlar
- at-risk studentlar
- attendance
- teacher KPI
- marketing ROI
- muhim notificationlar

---

# 5. ROLE SYSTEM

Telegram bot quyidagi rollarni qo‘llab-quvvatlasin:

```text
OWNER
SUPER_ADMIN
ADMIN
SALES_MANAGER
CALL_CENTER
TEACHER
ACCOUNTANT
STUDENT
PARENT
```

Mavjud CRM'dagi RBAC tizimidan foydalan.

Telegram botda alohida yangi permission system yaratma.

Har bir action CRM permission orqali tekshirilsin.

---

# 6. TELEGRAM ACCOUNT LINKING

Bu juda muhim.

Telegram accountni username orqali avtomatik bog‘lama.

Quyidagi usulni yarat:

```text
CRM
 ↓
Generate verification token
 ↓
Short-lived token
 ↓
Telegram deep link
 ↓
/start verify_xxxxx
 ↓
Telegram User confirmation
 ↓
CRM verification
 ↓
telegram_user_id saqlanadi
```

Masalan:

```text
https://t.me/YOUR_BOT?start=verify_xxxxx
```

Token:

- short-lived
- single-use
- replay protection
- brute-force protection

bo‘lsin.

Telegram username asosida account linking qilish taqiqlanadi.

Phone number asosida ham avtomatik linking qilma.

---

# 7. YANGI DATABASE TABLELAR

Mavjud database'ni tekshir.

Agar mavjud bo‘lmasa, quyidagi strukturalarni yarat.

## telegram_accounts

```text
id
user_id
telegram_user_id
telegram_username
telegram_first_name
telegram_last_name
is_verified
is_active
linked_at
last_seen_at
created_at
updated_at
```

Unique:

```text
telegram_user_id
```

---

## telegram_verification_codes

```text
id
user_id
code
expires_at
used_at
attempts
created_at
```

---

## telegram_notification_preferences

```text
id
user_id
attendance_enabled
payment_enabled
homework_enabled
exam_enabled
marketing_enabled
system_enabled
created_at
updated_at
```

---

## telegram_notifications

```text
id
telegram_account_id
type
title
message
payload
status
sent_at
error
created_at
```

Status:

```text
PENDING
SENDING
SENT
FAILED
RETRY
```

---

## telegram_message_logs

```text
id
telegram_account_id
telegram_message_id
direction
type
status
payload
created_at
```

---

## telegram_bot_events

```text
id
telegram_user_id
event_type
payload
processed_at
status
error
created_at
```

Agar kerak bo‘lsa:

```text
telegram_sessions
telegram_rate_limits
telegram_callback_logs
```

ham yarat.

Lekin mavjud CRM'da shu vazifani bajaradigan table bo‘lsa, duplicate table yaratma.

---

# 8. STUDENT BOT

Student uchun asosiy menu:

```text
📊 Mening profilim
📚 Mening kursim
📅 Dars jadvali
✅ Davomatim
📝 Uy vazifalarim
🎯 Imtihonlarim
📈 Progress
⭐ XP & Reyting
🏆 Yutuqlarim
💳 To‘lovlarim
⚠️ Qarzdorligim
📜 Sertifikatlarim
🔔 Bildirishnomalar
☎️ Admin bilan bog‘lanish
⚙️ Sozlamalar
```

Student faqat o‘z ma'lumotlarini ko‘ra olsin.

---

# 9. STUDENT — PROFILE

Ko‘rsat:

```text
Ism
Telefon
Student ID
Kurs
Guruh
Teacher
Boshlagan sana
Status
Level
XP
```

---

# 10. STUDENT — ATTENDANCE

Ko‘rsat:

```text
Jami darslar
Present
Absent
Late
Excused
Attendance %
```

Calendar view bo‘lsin.

Masalan:

```text
September 2026

1 ✅
2 ✅
3 ❌
4 -
5 ⏰
```

---

# 11. STUDENT — HOMEWORK

Ko‘rsat:

```text
📚 Homework

🔴 Deadline yaqin
🟡 Kutilmoqda
🟢 Topshirilgan
```

Har bir homework:

```text
Title
Description
Teacher
Created date
Deadline
Status
Score
Feedback
```

Student Telegram orqali homework topshira olsin.

File/photo/document/text yuborishni qo‘llab-quvvatla.

---

# 12. STUDENT — EXAM

Ko‘rsat:

```text
Exam
Subject
Date
Score
Percentage
Result
Teacher comment
```

Agar CRM'da online exam engine mavjud bo‘lsa, Telegramdan boshlash imkoniyatini ham qo‘sh.

---

# 13. STUDENT — XP

Mavjud CRM XP engine'dan foydalan.

Bot o‘zi XP hisoblamasin.

Ko‘rsat:

```text
Current XP
Level
Next level
Leaderboard position
Streak
Badges
Recent XP history
```

Masalan:

```text
⭐ XP: 1240

Level: 8

🔥 Streak: 12 days

🏆 Rank: #4
```

---

# 14. STUDENT — PAYMENT

Ko‘rsat:

```text
Course price
Paid
Remaining
Debt
Next payment date
Payment history
```

Agar online payment keyinchalik qo‘shilsa:

```text
💳 To‘lash
```

button bo‘lsin.

---

# 15. PARENT BOT

Parent menu:

```text
👨‍👩‍👧 Farzandlarim
📅 Dars jadvali
✅ Davomat
📝 Uy vazifalari
🎯 Imtihonlar
📊 Progress
💳 To‘lovlar
⚠️ Qarzdorlik
🏆 Natijalar
🔔 Bildirishnomalar
☎️ Markaz bilan bog‘lanish
⚙️ Sozlamalar
```

Parent bir nechta farzandga ega bo‘lishi mumkin.

Masalan:

```text
👦 Ali
👧 Vali
👦 Hasan
```

Har bir child alohida tanlanadi.

Parent boshqa studentning ma'lumotlarini ko‘ra olmasin.

---

# 16. TEACHER BOT

Teacher menu:

```text
📚 Mening guruhlarim
📅 Bugungi darslar
✅ Davomat
📝 Uy vazifalari
🎯 Imtihonlar
👨‍🎓 O‘quvchilar
📊 Natijalar
🔔 Bildirishnomalar
⚙️ Sozlamalar
```

Teacher faqat o‘ziga biriktirilgan group/studentlarni ko‘rsin.

---

# 17. TEACHER — ATTENDANCE

Flow:

```text
Teacher
 ↓
Mening guruhlarim
 ↓
Group
 ↓
Bugungi dars
 ↓
Student list
 ↓
Attendance status
 ↓
Save
 ↓
CRM API
 ↓
Attendance engine
 ↓
XP / Streak / Notification
```

Status:

```text
PRESENT
ABSENT
LATE
EXCUSED
```

Teacher barcha studentlarni bir marta ko‘rib, tezkor attendance qila olsin.

Masalan:

```text
👨 Ali        ✅
👩 Vali       ❌
👨 Hasan      ⏰
👩 Madina     ✅
```

---

# 18. MUHIM — ATTENDANCE LOGIC

Telegram bot:

❌ XP hisoblamaydi

❌ streak hisoblamaydi

❌ leaderboard hisoblamaydi

❌ notification logicni duplicate qilmaydi

Bular CRM backend tomonidan bajariladi.

Bot faqat:

```text
POST /attendance
```

kabi CRM API chaqiradi.

---

# 19. TEACHER — HOMEWORK

Teacher:

```text
Group
 ↓
Create Homework
 ↓
Title
Description
Deadline
Attachment
 ↓
Publish
```

Homework CRM orqali saqlansin.

Studentga Telegram notification yuborilsin.

---

# 20. SALES MANAGER BOT

Menu:

```text
📞 Leadlarim
🔥 Hot Leadlar
📲 Bugungi qo‘ng‘iroqlar
⏰ Follow-up
🎯 Trial darslar
📊 Sotuvlar
🔔 Bildirishnomalar
```

Lead card:

```text
👤 Ism
📱 Telefon
📚 Qiziqqan kurs
🔥 Lead score
📌 Status
🕐 Last contact
⏰ Next follow-up
```

Actions:

```text
📞 Call
💬 Contact
⏰ Follow-up
🔥 Hot
🎯 Trial
✅ Won
❌ Lost
```

---

# 21. LEAD STATUS

Mavjud CRM statuslarini ishlat.

Agar kerak bo‘lsa:

```text
NEW
CONTACTED
INTERESTED
TRIAL_BOOKED
TRIAL_ATTENDED
WON
LOST
```

Lead score:

```text
COLD
WARM
HOT
```

---

# 22. OWNER / DIRECTOR BOT

Owner uchun professional dashboard.

Menu:

```text
💰 Bugungi tushum
💸 Xarajatlar
📈 Moliyaviy natija
👨‍🎓 O‘quvchilar
📞 Leadlar
🎯 Sotuv
⚠️ Qarzdorlar
🔥 At-Risk Students
👨‍🏫 Teacher KPI
📢 Marketing
📊 Hisobotlar
🤖 AI Assistant
🔔 Alerts
```

---

# 23. OWNER DAILY REPORT

Har kuni avtomatik report yuborish imkoniyatini yarat.

Misol:

```text
📊 DAILY REPORT

📅 24.09.2026

💰 Revenue:
12 450 000 so'm

💸 Expenses:
3 200 000 so'm

📈 Net:
9 250 000 so'm

👨‍🎓 New Students:
8

📞 New Leads:
27

🎯 Conversion:
24%

⚠️ Debt:
18 400 000 so'm

❌ Absent Today:
17

🔥 At Risk:
9

👨‍🏫 Top Teacher:
...

📢 Marketing ROI:
...
```

Raqamlar faqat CRM'dan olinadi.

---

# 24. NOTIFICATION ENGINE

Quyidagi eventlar uchun Telegram notification yarat.

## Student

```text
ATTENDANCE_ABSENT
ATTENDANCE_LATE
HOMEWORK_CREATED
HOMEWORK_DEADLINE
HOMEWORK_GRADED
EXAM_CREATED
EXAM_RESULT
PAYMENT_RECEIVED
PAYMENT_DUE
PAYMENT_OVERDUE
XP_EARNED
BADGE_EARNED
LEVEL_UP
CERTIFICATE_ISSUED
```

## Parent

```text
CHILD_ABSENT
CHILD_LATE
CHILD_HOMEWORK
CHILD_EXAM
CHILD_PAYMENT
CHILD_DEBT
CHILD_AT_RISK
```

## Teacher

```text
NEW_STUDENT
HOMEWORK_SUBMISSION
EXAM_SUBMISSION
ATTENDANCE_REMINDER
GROUP_CHANGE
SYSTEM_ALERT
```

## Sales

```text
NEW_LEAD
HOT_LEAD
FOLLOW_UP_DUE
FOLLOW_UP_OVERDUE
TRIAL_BOOKED
TRIAL_REMINDER
LEAD_WON
LEAD_LOST
```

## Owner

```text
DAILY_REPORT
REVENUE_ALERT
DEBT_ALERT
AT_RISK_ALERT
SALES_ALERT
ATTENDANCE_ALERT
SYSTEM_ALERT
```

---

# 25. NOTIFICATION PREFERENCES

User notificationlarni boshqara olsin:

```text
🔔 Notifications

Davomat      ON/OFF
To‘lov        ON/OFF
Homework      ON/OFF
Exam          ON/OFF
Marketing     ON/OFF
System        ON/OFF
```

---

# 26. NOTIFICATION QUEUE

Telegram API rate limit sabab notificationlarni queue orqali yubor.

Architecture:

```text
CRM Event
 ↓
Notification Service
 ↓
Queue
 ↓
Telegram Worker
 ↓
Telegram API
```

Retry system bo‘lsin.

Masalan:

```text
Attempt 1
Attempt 2
Attempt 3
```

Failed notification log qilinsin.

---

# 27. TELEGRAM COMMANDS

Kamida:

```text
/start
/help
/profile
/schedule
/attendance
/homework
/exams
/payment
/notifications
/settings
/support
```

Role-specific commandlar ham bo‘lishi mumkin.

---

# 28. INLINE KEYBOARDS

Telegram UX professional bo‘lsin.

Har bir menu uchun:

- InlineKeyboard
- CallbackQuery
- Pagination
- Back button
- Main menu

ishlat.

Masalan:

```text
[📅 Bugungi darslar]

[1-guruh]
[2-guruh]
[3-guruh]

[⬅️ Orqaga]
[🏠 Bosh menu]
```

---

# 29. PAGINATION

Ko‘p student/lead/homework bo‘lsa:

```text
⬅️ 1/5 ➡️
```

pagination qil.

Bir message ichida minglab ma'lumot yuborma.

---

# 30. SEARCH

Kerakli rollar uchun search:

Student:

```text
Search homework
```

Teacher:

```text
Search student
```

Manager:

```text
Search lead
```

Owner:

```text
Search student / lead
```

Search CRM API orqali ishlasin.

---

# 31. SECURITY

Juda muhim.

Quyidagilarni implement qil:

### Authentication

Telegram `telegram_user_id` orqali account aniqlansin.

### Authorization

Har bir API request:

```text
User
 ↓
Role
 ↓
Permission
 ↓
Resource ownership
 ↓
Action
```

tekshirilsin.

### Ownership

Student:

```text
only self
```

Parent:

```text
only own children
```

Teacher:

```text
only assigned groups
```

Manager:

```text
only assigned leads
```

Owner:

```text
full access
```

### Anti abuse

- rate limiting
- brute force protection
- callback validation
- token expiry
- replay protection
- input validation
- audit logging

---

# 32. CALLBACK SECURITY

Callback data ichiga ishonchli ma'lumotni shunchaki joylashtirib qo‘yma.

Masalan:

```text
approve_payment:123
```

kelganda faqat callback IDga ishonma.

Server:

```text
Who is user?
What permission?
Does payment belong to user scope?
Is action still valid?
```

hammasini tekshirsin.

---

# 33. AUDIT LOG

Quyidagilar audit qilinsin:

```text
Account linked
Account unlinked
Attendance changed
Payment action
Lead status changed
Homework created
Homework graded
Exam result changed
Admin action
Broadcast
Settings changed
```

Audit:

```text
who
what
when
telegram_user_id
ip if available
payload metadata
```

---

# 34. ADMIN BROADCAST

Admin/Owner uchun broadcast:

```text
📢 Broadcast
```

Target:

```text
All students
Parents
Teachers
Sales
Specific course
Specific group
Specific branch
```

Message:

```text
Text
Image
Document
Button
```

Preview:

```text
Preview
```

Keyin:

```text
Send
Cancel
```

Broadcast queue orqali yuborilsin.

---

# 35. BRANCH SUPPORT

Agar CRM multi-branch bo‘lsa:

Telegram userning branch scope'ini hisobga ol.

Masalan:

```text
Branch A
Branch B
Branch C
```

User faqat o‘z branch ma'lumotlarini ko‘rsin.

---

# 36. ONLINE PAYMENT

Keyingi bosqichda Telegram orqali payment qo‘shish uchun architecture tayyorla.

Flow:

```text
Student
 ↓
💳 To‘lash
 ↓
Invoice
 ↓
Payment Provider
 ↓
Payment
 ↓
Webhook
 ↓
CRM
 ↓
Payment created
 ↓
Debt recalculated
 ↓
Telegram notification
```

Muhim:

Telegram bot paymentni o‘zi confirmed deb belgilamasin.

Faqat payment provider webhook orqali CRM payment statusini tasdiqlasin.

---

# 37. CERTIFICATE

Student:

```text
📜 Certificates
```

ko‘rsin.

Certificate:

```text
Certificate ID
Course
Student
Date
Verification URL
QR
```

QR verification CRM public endpoint orqali ishlasin.

---

# 38. REFERRAL SYSTEM

Agar CRM'da referral mavjud bo‘lsa:

Student:

```text
🎁 Refer a friend
```

Bot:

```text
Your referral link:
...
```

Referral tracking CRM orqali bajarilsin.

Bot faqat linkni ko‘rsatadi.

---

# 39. STUDENT AT-RISK

CRM'dagi risk engine'dan foydalan.

Bot studentga:

```text
⚠️ Sizning davomat ko‘rsatkichingiz pasaydi.
```

Parentga:

```text
⚠️ Farzandingizning davomatida pasayish kuzatildi.
```

Manager/Ownerga:

```text
🔥 AT-RISK STUDENT

Student: ...
Risk: HIGH

Reasons:
- 3 absences
- payment overdue
- homework completion decreased
```

---

# 40. AI ASSISTANT

Keyingi bosqichda Owner uchun:

```text
🤖 AI Assistant
```

qo‘sh.

Misollar:

```text
Bugun qancha tushum bo‘ldi?
```

```text
Qaysi kursda qarzdorlik ko‘p?
```

```text
Qaysi studentlar xavf ostida?
```

```text
Bu oy sotuvlar qanday?
```

```text
Qaysi teacher KPI bo‘yicha past?
```

AI faqat CRM API orqali kerakli ma'lumotni olsin.

AI'ga database'ga to‘g‘ridan-to‘g‘ri access bermang.

---

# 41. PROJECT STRUCTURE

Mavjud project structure'ni avval tekshir.

Agar monorepo qilish maqsadga muvofiq bo‘lsa:

```text
apps/
  web/
  api/
  telegram-bot/

packages/
  types/
  validation/
  shared/

docker-compose.yml
```

Telegram bot:

```text
telegram-bot/
  src/
    bot/
      commands/
      callbacks/
      keyboards/
      handlers/
      middleware/
      scenes/

    services/
      crm-api/
      auth/
      notification/
      student/
      parent/
      teacher/
      sales/
      owner/

    templates/

    utils/

    config/

    types/

    tests/

    app.ts
```

Lekin mavjud architecture bundan farq qilsa, keraksiz restructure qilma.

---

# 42. ENV

Secretlar `.env` orqali.

Masalan:

```env
TELEGRAM_BOT_TOKEN=
CRM_API_URL=
TELEGRAM_WEBHOOK_SECRET=
JWT_SECRET=
REDIS_URL=
DATABASE_URL=
```

Secretlarni source code'ga yozma.

GitHub'ga `.env` yuborma.

---

# 43. WEBHOOK

Production uchun webhook architecture ishlat.

Masalan:

```text
Telegram
 ↓
HTTPS
 ↓
Nginx
 ↓
Telegram Bot Service
```

Webhook secret token bilan himoyalansin.

Developmentda polling ishlatish mumkin.

---

# 44. DOCKER

Telegram bot production-ready Dockerfile bilan ishlasin.

Masalan:

```text
telegram-bot
redis
api
postgres
nginx
```

Mavjud CRM Docker architecture'ni buzma.

---

# 45. LOGGING

Structured logging ishlat.

Log:

```text
INFO
WARN
ERROR
```

Sensitive data log qilma.

Masalan:

❌ Telegram bot token

❌ password

❌ payment secret

❌ verification token

❌ full sensitive payload

---

# 46. ERROR HANDLING

Bot hech qachon userga:

```text
Internal Server Error
stack trace
database error
```

ko‘rsatmasin.

Userga:

```text
❌ Xatolik yuz berdi.

Iltimos, birozdan keyin qayta urinib ko‘ring.
```

Admin loglarida esa haqiqiy error saqlansin.

---

# 47. UX

Bot professional bo‘lishi kerak.

Talablar:

- Uzbek language
- tushunarli menu
- qisqa message
- emoji me'yorida
- back button
- main menu
- loading state
- error state
- empty state
- confirmation
- pagination

---

# 48. EMPTY STATES

Masalan:

Homework yo‘q:

```text
📝 Hozircha homework mavjud emas.
```

Debt yo‘q:

```text
✅ Sizda qarzdorlik mavjud emas.
```

Dars yo‘q:

```text
📅 Bugun dars rejalashtirilmagan.
```

---

# 49. API DESIGN

Telegram bot uchun API'larni professional REST style'da yarat.

Masalan:

```http
GET /api/telegram/me
POST /api/telegram/link
POST /api/telegram/unlink
GET /api/telegram/notifications
PATCH /api/telegram/preferences
```

Student:

```http
GET /api/telegram/student/profile
GET /api/telegram/student/schedule
GET /api/telegram/student/attendance
GET /api/telegram/student/homework
GET /api/telegram/student/exams
GET /api/telegram/student/payments
GET /api/telegram/student/progress
```

Teacher:

```http
GET /api/telegram/teacher/groups
GET /api/telegram/teacher/today-lessons
GET /api/telegram/teacher/students
POST /api/telegram/teacher/attendance
POST /api/telegram/teacher/homework
```

Manager:

```http
GET /api/telegram/manager/leads
GET /api/telegram/manager/followups
PATCH /api/telegram/manager/leads/:id/status
```

Owner:

```http
GET /api/telegram/owner/dashboard
GET /api/telegram/owner/finance
GET /api/telegram/owner/debt
GET /api/telegram/owner/at-risk
GET /api/telegram/owner/teacher-kpi
```

Lekin mavjud endpointlar mos kelsa, duplicate endpoint yaratma.

---

# 50. API RESPONSE STANDARD

Bir xil format ishlat:

```json
{
  "success": true,
  "data": {},
  "message": null
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "message": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

Mavjud CRM response standardi bo‘lsa, shuni saqla.

---

# 51. VALIDATION

Input validation:

- Zod
- Joi
- class-validator
- yoki mavjud CRM validation system

orqali bajarilsin.

Telegram inputga ishonma.

---

# 52. TESTING

Kamida:

### Unit tests

- Auth
- Verification
- Notification
- Permission
- Student service
- Teacher service
- Payment service

### Integration tests

```text
Telegram → API → DB
```

### Security tests

- unauthorized user
- wrong role
- wrong student
- wrong parent-child
- wrong teacher group
- expired token
- reused token
- forged callback

### E2E

Test scenarios:

```text
Student registration
Student linking
Student profile
Attendance
Homework
Payment
Parent linking
Teacher attendance
Manager lead
Owner dashboard
Notification
```

---

# 53. PERFORMANCE

Bot tez ishlashi kerak.

Talab:

- unnecessary DB query bo‘lmasin
- N+1 query bo‘lmasin
- pagination
- caching kerak bo‘lsa Redis
- notification queue
- database indexes
- API timeout
- retry
- circuit breaker kerak bo‘lsa ishlat

---

# 54. TELEGRAM API RATE LIMIT

Telegram rate limitni hisobga ol.

Bulk notification:

```text
Queue
 ↓
Worker
 ↓
Rate limiter
 ↓
Telegram API
```

Birdaniga minglab message yuborma.

---

# 55. MONITORING

Productionda:

```text
Bot uptime
API latency
Telegram API errors
Failed messages
Queue size
DB errors
Notification success rate
Webhook errors
```

monitor qilinsin.

---

# 56. DEVELOPMENT BOSQICHLARI

Quyidagi tartibda ishlagin.

## PHASE 0 — AUDIT

Mavjud CRM'ni tahlil qil.

Natija:

```text
Architecture
API
DB
RBAC
Notifications
Missing APIs
Required tables
```

---

## PHASE 1 — BOT FOUNDATION

Yarat:

- Telegram bot
- config
- webhook/polling
- logging
- error handler
- middleware
- `/start`
- `/help`
- main menu

---

## PHASE 2 — ACCOUNT LINKING

Yarat:

- verification token
- deep link
- telegram account
- secure linking
- unlink
- session

---

## PHASE 3 — STUDENT BOT

Implement:

- profile
- course
- group
- schedule
- attendance
- homework
- exams
- progress
- XP
- payments
- notifications

---

## PHASE 4 — PARENT BOT

Implement:

- children
- child selection
- attendance
- homework
- exams
- progress
- payment
- debt
- notifications

---

## PHASE 5 — TEACHER BOT

Implement:

- groups
- today's lessons
- student list
- attendance
- homework
- exam
- notifications

---

## PHASE 6 — SALES BOT

Implement:

- leads
- hot leads
- calls
- follow-ups
- trial lessons
- status changes

---

## PHASE 7 — OWNER BOT

Implement:

- dashboard
- finance
- sales
- debt
- attendance
- at-risk
- teacher KPI
- marketing

---

## PHASE 8 — NOTIFICATION ENGINE

Implement:

- event system
- queue
- retry
- preferences
- templates
- logs

---

## PHASE 9 — BROADCAST

Implement:

- audience
- preview
- send
- queue
- statistics

---

## PHASE 10 — PAYMENT

Implement:

- invoice
- provider
- webhook
- payment status
- CRM synchronization

---

## PHASE 11 — CERTIFICATE / REFERRAL

Implement:

- certificate
- QR verification
- referral links
- referral tracking

---

## PHASE 12 — AI ASSISTANT

Implement:

- natural language questions
- CRM data retrieval
- owner analytics
- alerts
- summaries

---

## PHASE 13 — SECURITY

Full security audit:

- RBAC
- ownership
- rate limit
- token security
- webhook security
- audit
- secrets
- validation

---

## PHASE 14 — TESTING

Run:

```text
unit
integration
e2e
security
load
```

---

## PHASE 15 — PRODUCTION

Prepare:

```text
Docker
Nginx
HTTPS
Webhook
ENV
Database migration
Backup
Monitoring
Logs
Rollback
```

---

# 57. MVP

Agar full system juda katta bo‘lsa, avval MVP qil.

MVP:

### Student

```text
/start
Profile
Schedule
Attendance
Homework
Payment
Notifications
```

### Parent

```text
Children
Attendance
Homework
Payment
Notifications
```

### Teacher

```text
Groups
Today's lessons
Attendance
Homework
```

### Manager

```text
Leads
Follow-up
Trial
```

### Owner

```text
Daily dashboard
Revenue
Students
Leads
Debt
Alerts
```

Keyin qolgan modullarni bosqichma-bosqich qo‘sh.

---

# 58. MUHIM BUSINESS RULE

Bitta ma'lumotning ikkita source of truth'i bo‘lmasin.

Masalan:

```text
Student data → CRM
Payment → CRM
Attendance → CRM
XP → CRM
Debt → CRM
Lead → CRM
```

Telegram faqat shu ma'lumotlarni ko‘rsatadi yoki CRM API orqali o‘zgartiradi.

---

# 59. DATA CONSISTENCY

Masalan student attendance qilindi:

```text
Telegram
 ↓
CRM API
 ↓
Attendance
 ↓
XP
 ↓
Streak
 ↓
Leaderboard
 ↓
Notification
 ↓
Audit
```

Bularning hammasi CRM business logic orqali bajarilsin.

---

# 60. AGAR MAVJUD CRM'DA FUNKSIYA BOR BO‘LSA

Uni qayta yozma.

Masalan:

CRM'da mavjud:

```text
PaymentService
```

Telegram bot:

```text
PaymentService
```

ni API orqali ishlatsin.

Yangi:

```text
TelegramPaymentService
```

ichida payment logicni qayta yozma.

---

# 61. CODE QUALITY

Kod:

- TypeScript
- strict typing
- clean architecture
- SOLID
- DRY
- reusable services
- clear naming
- small functions
- no unnecessary duplication

bo‘lsin.

---

# 62. DOCUMENTATION

Development davomida quyidagilarni yarat:

```text
docs/
  telegram-architecture.md
  telegram-api.md
  telegram-auth.md
  telegram-permissions.md
  telegram-notifications.md
  telegram-deployment.md
  telegram-testing.md
```

---

# 63. FINAL DELIVERABLES

Development tugagach quyidagilar tayyor bo‘lishi kerak:

### Code

```text
Telegram Bot
CRM API integration
Notification system
Authentication
Role system
Handlers
Services
Tests
```

### Database

```text
Migrations
Indexes
Constraints
```

### Documentation

```text
Architecture
API
Security
Deployment
Testing
```

### Deployment

```text
Docker
ENV example
Webhook
Nginx
HTTPS
Production config
```

---

# 64. CLAUDE AI UCHUN ENG MUHIM ISH TARTIBI

❗ Kod yozishni boshlashdan oldin mavjud CRM'ni tekshir.

❗ Mavjud fayllarni o‘qib chiq.

❗ Existing architecture'ni tushun.

❗ Existing API'larni aniqlagin.

❗ Existing DB modelsni aniqlagin.

❗ Existing permissionsni aniqlagin.

❗ Existing notification systemni aniqlagin.

❗ Duplicate functionality yaratma.

❗ Mavjud ishlayotgan kodni keraksiz o‘zgartirma.

---

# 65. HAR BIR PHASE UCHUN ISH TARTIBI

Har bir phase boshlanishidan oldin:

### 1. Analyze

Nima mavjud?

### 2. Plan

Nima o‘zgaradi?

### 3. Implement

Kod yoz.

### 4. Test

Testlarni ishga tushir.

### 5. Review

Security va architecture review qil.

### 6. Report

Menga:

```text
Changed files
New files
Database changes
API changes
Tests
Potential problems
Next phase
```

ni ko‘rsat.

---

# 66. MUHIM — BIRDANIGA HAMMASINI QILMA

Butun projectni bir martada rewrite qilishga urinma.

Quyidagi tartibda implement qil:

```text
AUDIT
 ↓
FOUNDATION
 ↓
AUTH/LINKING
 ↓
STUDENT
 ↓
PARENT
 ↓
TEACHER
 ↓
SALES
 ↓
OWNER
 ↓
NOTIFICATIONS
 ↓
BROADCAST
 ↓
PAYMENT
 ↓
CERTIFICATE
 ↓
REFERRAL
 ↓
AI
 ↓
SECURITY
 ↓
TESTING
 ↓
PRODUCTION
```

Har phase ishlaydigan holatda bo‘lsin.

---

# 67. AGAR XATO CHIQSA

Xatoni yashirma.

Menga:

```text
Error
Root cause
Affected module
Fix
Changed files
Test result
```

ko‘rsat.

Agar mavjud kod noto‘g‘ri bo‘lsa, minimal xavfsiz patch qil.

---

# 68. AGAR TALAB NOANIQ BO‘LSA

Taxmin qilib katta architectural o‘zgarish qilma.

Avval mavjud kodni tekshir.

Agar baribir noaniq bo‘lsa:

```text
Assumption
Reason
Recommended solution
```

ko‘rsat.

---

# 69. FINAL GOAL

Oxirida men quyidagi ecosystemga ega bo‘lishim kerak:

```text
                    ┌───────────────────┐
                    │   Academy CRM     │
                    │                   │
                    │ PostgreSQL        │
                    │ Business Logic    │
                    │ RBAC              │
                    │ Finance           │
                    │ Education         │
                    │ Sales             │
                    │ Analytics         │
                    └─────────┬─────────┘
                              │
                         REST API
                              │
                    ┌─────────▼─────────┐
                    │   Telegram Bot    │
                    │                   │
                    │ Auth              │
                    │ Student           │
                    │ Parent            │
                    │ Teacher           │
                    │ Sales             │
                    │ Owner             │
                    │ Notifications     │
                    └───────────────────┘
```

Telegram bot professional **Academy Super App** kabi ishlashi kerak.

---

# 70. BOSHLASH

HOZIRCHA KOD YOZMA.

Birinchi navbatda mavjud Academy CRM projectimni to‘liq audit qil.

Auditdan keyin menga aynan quyidagi formatda javob ber:

```text
# 1. CURRENT ARCHITECTURE

# 2. CURRENT DATABASE

# 3. CURRENT API

# 4. CURRENT AUTH & RBAC

# 5. CURRENT NOTIFICATION SYSTEM

# 6. WHAT TELEGRAM CAN REUSE

# 7. WHAT NEW APIs ARE REQUIRED

# 8. WHAT NEW DATABASE TABLES ARE REQUIRED

# 9. TELEGRAM BOT ARCHITECTURE

# 10. ROLE/PERMISSION MATRIX

# 11. NOTIFICATION EVENT MATRIX

# 12. SECURITY PLAN

# 13. DEVELOPMENT PHASES

# 14. FILES THAT WILL BE CREATED/CHANGED

# 15. RISKS

# 16. RECOMMENDED MVP

# 17. NEXT IMPLEMENTATION STEP
```

Shundan keyin faqat **PHASE 1**ni implement qil.

Har phase tugagandan keyin testlarni ishga tushir va keyingi phasega o‘t.

**Asosiy prinsip:**

> Telegram Bot — alohida CRM emas. U mavjud Academy CRM uchun xavfsiz, professional va role-based Telegram interface bo‘lishi kerak.
