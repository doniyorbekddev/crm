# LMS — kurs dasturi va darslar

> Academy CRM 3.0 — PHASE 4. TZ: `promt3.md` §12–14. Manba: `backend/src/services/lesson.service.ts`, `curriculum.service.ts`, `frontend/src/pages/courses/CourseLessonsPage.tsx`, `pages/portal/PortalCoursePage.tsx`.

## 1. Tuzilma

```
Course ──▶ CourseModule ──▶ CourseTopic ──▶ Lesson ──▶ LessonMaterial (FILE | LINK | VIDEO)
                                   │            └──▶ LessonProgress (o‘quvchi ko‘rdi / o‘rgandi)
                                   ├──▶ StudentTopicProgress (NOT_STARTED → IN_PROGRESS → COMPLETED)
                                   ├──▶ AttendanceSession.topicId (darsda o‘tilgan mavzu)
                                   └──▶ Question.topicId (imtihon mavzu kesimi)
```

Keyingi fazalar shu mavzuga bog‘lanadi: vazifa (PHASE 5), savol banki/blueprint (PHASE 6), mastery (PHASE 7).

| Model | Maydonlar (TZ §14) |
|---|---|
| `Lesson` | title, description, **content** (konspekt), teacher, topic, durationMinutes, **videoUrl**, sortOrder, **status** DRAFT/PUBLISHED/ARCHIVED, **publishedAt**, createdBy |
| `LessonMaterial` | kind (FILE/LINK/VIDEO), title, url yoki storagePath + originalName/mimeType/size, sortOrder |
| `LessonProgress` | lessonId × studentId (unique), firstViewedAt, lastViewedAt, completedAt |

Migration: `20260925120000_lms_lessons` (additive, oldin `pg_dump`).

## 2. Holatlar

| Holat | O‘quvchi ko‘radimi | O‘chirish |
|---|---|---|
| DRAFT | yo‘q | mumkin (materiallari bilan) |
| PUBLISHED | ha (`publishedAt` birinchi nashrda qo‘yiladi, qayta saqlashda o‘zgarmaydi) | yo‘q — arxivlanadi |
| ARCHIVED | yo‘q | yo‘q |

## 3. Ruxsat va doira

| Amal | Ruxsat | Doira |
|---|---|---|
| Darslarni ko‘rish | `course.view` | hamma kurs |
| Yaratish, tahrirlash, nashr, material | **`lesson.manage`** (yangi; TEACHER va admin rollarida) | `course.manage` bo‘lsa — hamma kurs; o‘qituvchi — o‘zi o‘qitadigan kurs (PLANNED/ACTIVE guruhi yoki kurs o‘qituvchisi). Aks holda 403 |
| Kabinet | `portal.student/parent` | faqat o‘z kursi, faqat PUBLISHED; ota-ona ko‘radi, lekin "o‘rgandim" ni faqat o‘quvchi qo‘yadi |

## 4. Materiallar

- **Fayl**: hujjatlar bilan bir xil siyosat — tur baytlar bo‘yicha (PDF/PNG/JPG/WEBP), hajm `MAX_UPLOAD_MB`, nom foydalanuvchidan olinmaydi. Yuklab olish stream bilan (`utils/sendStoredFile.ts` — hujjat, vazifa fayli va materiallar uchun umumiy).
- **Havola / video**: faqat `http(s)` (`javascript:` va h.k. rad). YouTube havolasi kabinetda `youtube-nocookie` embed bo‘lib ochiladi (`youtubeEmbedUrl` — faqat ma’lum formatlar), boshqa manba — yangi oynada.
- Slayd, arxiv, kod — Google Drive/GitHub havolasi sifatida.

## 5. Dars sessiyasi → progress

Davomat jurnalida (yoki dars seansida) **"O‘tilgan mavzu"** tanlansa: `AttendanceSession.topicId` yoziladi va **kelgan** (PRESENT/LATE) o‘quvchilarda mavzu `IN_PROGRESS` bo‘ladi. Kelmaganlarga yozilmaydi; allaqachon `COMPLETED` o‘zgarmaydi (`createMany skipDuplicates`). Begona kurs mavzusi — 422. Seansga keyin mavzu biriktirilsa, belgilangan kelganlarga qo‘llanadi.

## 6. API

| Method | Endpoint | Ruxsat |
|---|---|---|
| GET | `/courses/:id/lessons?includeArchived=true` | course.view — daraxt + `canEdit` |
| POST | `/curriculum/topics/:id/lessons` | lesson.manage |
| GET / PUT / DELETE | `/lessons/:id` | course.view / lesson.manage |
| POST | `/lessons/:id/materials` (havola/video) | lesson.manage |
| POST | `/lessons/:id/materials/upload` (xom fayl, `X-File-Name`, `X-Material-Title`) | lesson.manage |
| DELETE | `/lessons/materials/:id` | lesson.manage |
| GET | `/lessons/materials/:id/download` | course.view |
| GET | `/portal/course` | kabinet — daraxt + tugatilganlar |
| GET | `/portal/course/lessons/:id` | kabinet — o‘quvchi ochsa "ko‘rildi" yoziladi |
| POST | `/portal/course/lessons/:id/complete` `{completed}` | faqat o‘quvchi |
| GET | `/portal/course/materials/:id/download` | kabinet — o‘z kursi, nashr qilingan |
| POST | `/groups/:id/attendance` `{…, topicId?}` | attendance.mark |
| POST/PUT | `/attendance-sessions` `{…, topicId?}` | attendance.mark |

## 7. Interfeys

- **Xodim**: Kurslar → kartada **"Darslar (LMS)"** → `/courses/:id/lessons`: modul/mavzu/dars daraxti, holat nishonlari, "Dars qo‘shish", amallar (tahrirlash, nashr, arxiv, qoralamani o‘chirish), **dars muharriri** (matn, video, davomiylik, holat, materiallar: havola/video/fayl).
- **Davomat jurnali**: "O‘tilgan mavzu (ixtiyoriy)" tanlovi.
- **Kabinet**: `/portal/course` — progress chizig‘i, modul → mavzu → dars (✓ o‘rganilgan); `/portal/course/lessons/:id` — video, konspekt, materiallar, "O‘rgandim". Mobil navigatsiya: 4 asosiy bo‘lim + "Yana".

## 8. Testlar

| Fayl | Nima |
|---|---|
| `backend/tests/lessons.test.ts` | hayot sikli; o‘qituvchi doirasi va 403; materiallar (xavfli havola, noto‘g‘ri fayl, yuklab olish); kabinet (faqat nashr, ko‘rish yozuvi, o‘rgandim, begona 404, ota-ona ko‘radi-yozmaydi); davomat mavzusi → progress |
| `frontend/src/utils/lessonLabels.test.ts` | YouTube embed (soxta domen va inyeksiya rad), fayl hajmi |
| `frontend/src/layouts/PortalNav.test.tsx` | tablar, pastki panel + "Yana" |
| `e2e/specs/portal.spec.ts` | admin dars joylaydi → o‘quvchi Kurs → dars → O‘rgandim |
