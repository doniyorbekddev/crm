# Backup tizimini mustahkamlash — 1–3-bosqichlar

Sana: 2026-11-09.
Asos: [BACKUP-SCRIPT-AUDIT.md](BACKUP-SCRIPT-AUDIT.md) §7, 1–3-qadamlar.

**Natija: 1–3-bosqichlar bajarildi, 21 ta testning hammasi PASS.**
- O'zgarishlar faqat repoda, commit qilinmagan.
- Production server, production bazasi, `.env.production`, production cron va backup fayllariga tegilmagan.
- Lokal CRM bazasiga (`127.0.0.1:5432`) ham tegilmagan.

---

## 1. Repozitoriydagi o'zgarishlar

| Fayl | O'zgarish |
|---|---|
| `deploy/setup-server.sh` | Kunlik cron `0 3 … KEEP_DAYS=14` dan `0 22 * * * cd $APP_DIR && KEEP_DAYS=30 /usr/bin/bash ./scripts/backup-db.sh >> …/backups/backup.log 2>&1` ga o'zgardi (22:00 UTC = 03:00 Toshkent, 30 kun). Mavjud cron'ni aniqlash `scripts/backup-db(-safe)?\.sh` qolipi bilan — serverdagi eski `backup-db-safe.sh` qatori ham tanilsa, skript **ikkinchi kunlik cron qo'shmaydi** (avval qo'shib qo'yardi) |
| `scripts/backup-db.sh` | Faqat sarlavha izohidagi cron namunasi (22:00 UTC, `KEEP_DAYS=30`). Mantiq o'zgarmagan |
| `docs/CRM-4.0-BACKUP-RECOVERY.md` | Quyidagi o'zgarishlar (pastda) |
| `scripts/restore-db.sh` | To'liq qayta yozildi (§2) |

`docs/CRM-4.0-BACKUP-RECOVERY.md` dagi o'zgarishlar:
- §1: kunlik cron qatori va 30 kunlik muddat. Production hozircha `backup-db-safe.sh` da ishlayotgani va u `--clean` siz ekani ochiq yozildi.
- §5: `restore-db.sh` himoyalari va chiqish kodlari.
- Yangi §5-C: `--clean` siz nusxa bilan nima qilish kerak.
- §7: saqlash muddati 30 kun.
- §9: 2026-11-06 dagi production tiklash natijasi (✅ VERIFIED).

`git diff --stat`: 4 fayl, +247 / −27.

## 2. `restore-db.sh` — tahlil va yangi xulq

### Eski skriptdagi kamchiliklar

| № | Kamchilik | Oqibati |
|---|---|---|
| 1 | Faqat `gzip -t` tekshirilardi | `--clean` siz, uzilgan, custom-format yoki boshqa bazaning dumpi ham qabul qilinardi |
| 2 | Backend tekshiruvdan oldin emas, darhol to'xtatilardi | Rad etilishi kerak bo'lgan dumpda ham backend to'xtab qolardi |
| 3 | `set -euo pipefail` + `psql` xatosi → skript `start backend` gacha yetmasdan chiqardi | **Backend to'xtatilgan holda qolardi** |
| 4 | Tranzaksiyasiz tiklash | Xato o'rtada bo'lsa baza yarim tiklangan holatda qolardi |
| 5 | Tiklangandan keyin tekshiruv yo'q edi | "Tiklandi" degan xabar natija tekshirilmasdan chiqardi |
| 6 | Bo'sh stdin'da (`read` EOF) `set -e` jim chiqib ketardi | Sababsiz yiqilish |

### Yangi tartib

1. **Dump tekshiruvi — backend hali ishlab turganida, bitta o'qishda (`awk`).**
   - gzip butun;
   - custom format (`PGDMP`) emas;
   - birinchi 20 qatorda `-- PostgreSQL database dump` sarlavhasi;
   - yakunlovchi satr oxirgi 20 qator ichida;
   - kamida bitta jadval;
   - `public._prisma_migrations` bor;
   - **har bir `CREATE TABLE` dan oldin o'sha jadval uchun `DROP TABLE IF EXISTS`.**

   Fayl oxirigacha o'qiladi: `head` yoki `grep -q` bilan erta yopilgan quvur `pipefail` ostida gunzip'ni SIGPIPE xatosiga aylantirardi.
2. `postgres` ishlayotgani tekshiriladi. Backend avvaldan ishlayotganmi — eslab qolinadi.
3. "ha" tasdig'i.
4. `EXIT` trap o'rnatiladi, **keyin** backend to'xtatiladi. Bayroq stop'dan oldin qo'yiladi: stop yarim yo'lda yiqilsa ham qayta ishga
   tushiriladi. `INT` / `TERM` → `exit 130` → trap.
5. Tiklash: `psql -v ON_ERROR_STOP=1 --single-transaction`. Xato bo'lsa butun tranzaksiya bekor qilinadi.
6. Tekshiruv:
   - `public` jadvallari soni ≥ dumpdagi `CREATE TABLE` soni (ko'p bo'lsa — ogohlantirish);
   - `_prisma_migrations` qatorlari = dumpdagi COPY qatorlari;
   - tugallanmagan migratsiya 0.
7. Trap: backend `start` qilinadi va `healthy` bo'lishi kutiladi; healthcheck bo'lmasa `running` yetarli
   (`RESTORE_BACKEND_WAIT`, 120 s). `exited` yoki `dead` holati darhol muvaffaqiyatsizlik hisoblanadi. Avvaldan to'xtatilgan backend
   yoqilmaydi.

| Kod | Ma'nosi |
|---|---|
| 0 | tiklandi, tekshirildi, backend ishlayapti |
| 1 | rad etildi — baza va backend'ga tegilmagan |
| 2 | tiklash xatosi — tranzaksiya bekor qilindi, baza avvalgi holatida, backend qayta ishga tushirildi |
| 3 | backend qayta ishga tushmadi — alohida `BACKEND QAYTA ISHGA TUSHMADI` xabari va tiklash natijasi (kod) bilan |
| 4 | tiklandi, lekin tekshiruvdan o'tmadi |

## 3. Sinov muhiti

| Xususiyat | Qiymat |
|---|---|
| Docker | Colima (sinov oldidan to'xtatilgan edi → ishga tushirildi → sinovdan keyin yana to'xtatildi) |
| Compose loyihasi | alohida `crmhard` (mavjud `pmt-platform`, `crm-backup-test` loyihalariga tegilmadi) |
| PostgreSQL | `postgres:17-alpine` (mavjud image, yangi yuklanmagan), ma'lumot `tmpfs` da, port faqat `127.0.0.1:55433` |
| Backend o'rnida | `alpine:3.20` konteyneri: `/app/uploads` va healthcheck. `/tmp/crash-on-start` fayli bo'lsa keyingi ishga tushishda yiqiladi (qayta ishga tushish xatosini sinash uchun) |
| Sxema | Haqiqiy 83 ta Prisma migratsiyasi (`prisma migrate deploy`): 146 jadval |
| Test ma'lumoti | 1 rol, 3 foydalanuvchi (`test*@example.invalid`), 3 yuklangan fayl (matn, 4 KB tasodifiy binar, "pdf") |
| Sozlamalar | Vaqtinchalik `test.env` (`umask 077`): sinov uchun tasodifiy parol, production qiymatlari emas. Skriptlar `ENV_FILE` / `COMPOSE_FILE` / `BACKUP_DIR` orqali shu muhitga yo'naltirildi |

## 4. Testlar

| № | Test | Natija | Dalil |
|---|---|---|---|
| T1a | `bash -n` | ✅ PASS | `restore-db.sh`, `backup-db.sh`, `setup-server.sh` — OK |
| T1b | ShellCheck 0.11.0 (`-x -S style`) | ✅ PASS | `restore-db.sh` 0, `backup-db.sh` 0. `setup-server.sh` da 1 ta SC2088 — `HEAD` da ham bor, matndagi `~` ataylab yozilgan (o'zgarishga aloqasi yo'q). `restore-db.sh` dagi 2 ta SC2329 (trap orqali chaqiriladigan funksiyalar) sababi yozilgan izoh bilan o'chirildi |
| T2 | `backup-db.sh` odatiy yurish | ✅ PASS | exit=0; 2 ta yangi fayl (`crm-…sql.gz`, `uploads-…tar.gz`); `DROP TABLE IF EXISTS` = 146; `.partial` = 0; huquq `-rw-------`; jurnalda `BACKUP_REMOTE sozlanmagan` ogohlantirishi |
| T3 | Yuklangan fayllar arxivi | ✅ PASS | `gzip -t` OK, `tar` ochildi, fayllar 3/3, SHA-256 hammasi manbadagi bilan mos |
| T4 | Minimal hajm (`MIN_BYTES=100000000`) | ✅ PASS | exit=1, "dump juda kichik (60455 bayt)", yangi fayl yo'q, `.partial` = 0 |
| T5 | Backup → o'zgartirish → restore | ✅ PASS | exit=0; foydalanuvchilar `test1,2,3` → `test1,2,4` (o'zgartirildi) → `test1,2,3` (tiklandi); jadvallar 146/146, migratsiyalar 83/83, tugallanmagan 0; backend `running/healthy` |
| T6 | `--clean` siz dump (kunlik eski cron kabi) | ✅ PASS | exit=1, "jadval uchun oldinroq 'DROP TABLE IF EXISTS' yo'q"; backend to'xtatilmagan (`StartedAt` o'zgarmagan), baza o'zgarmagan |
| T7a | gzip bo'lmagan fayl | ✅ PASS | exit=1, "arxiv buzilgan yoki gzip emas", backend va baza o'zgarmagan |
| T7b | Yarmida uzilgan gzip | ✅ PASS | exit=1, "arxiv buzilgan yoki gzip emas", backend va baza o'zgarmagan |
| T7c | SQL bo'lmagan gzip | ✅ PASS | exit=1, "pg_dump SQL nusxasi emas", backend va baza o'zgarmagan |
| T7d | Custom format (`pg_dump -Fc`) | ✅ PASS | exit=1, "custom formati", backend va baza o'zgarmagan |
| T7e | Yakunlovchi satrsiz SQL | ✅ PASS | exit=1, "dump to'liq emas", backend va baza o'zgarmagan |
| T7f | O'rtasida kesilgan SQL (7342/14685 qator) | ✅ PASS | exit=1, "dump to'liq emas", backend va baza o'zgarmagan |
| T7g | CRM bo'lmagan baza dumpi | ✅ PASS | exit=1, "CRM bazasining nusxasi emas", backend va baza o'zgarmagan |
| T7h | "yo'q" javobi | ✅ PASS | exit=1, "Bekor qilindi", backend va baza o'zgarmagan |
| T7i | Mavjud bo'lmagan fayl | ✅ PASS | exit=1, foydalanish xabari |
| T8 | Tiklash o'rtasida xato (`SELECT 1/0;` yakunlovchi satrdan oldin) | ✅ PASS | exit=2, `ERROR: division by zero`, "tranzaksiya bekor qilindi"; baza avvalgi holatida (2 foydalanuvchi, dumpdagi 3 emas); backend to'xtatildi va qayta ishga tushdi (`running/healthy`) |
| T9 | Tiklash OK, backend qayta ishga tushmaydi | ✅ PASS | exit=3; alohida "BACKEND QAYTA ISHGA TUSHMADI" va "baza tiklangan va tekshirilgan"; backend `exited` |
| T9b | Tiklash xatosi **va** backend ishga tushmaydi | ✅ PASS | exit=3; ikkala xato alohida: "tranzaksiya bekor qilindi" + "BACKEND QAYTA ISHGA TUSHMADI", tiklash kodi 2 |
| T10 | Tiklandi, lekin tekshiruvdan o'tmadi (dumpga migratsiya yozuvini o'chiruvchi buyruq qo'shildi) | ✅ PASS | exit=4, "migratsiya yozuvlari soni dumpdagidan farq qiladi", backend `running/healthy` |
| T11 | Backend avvaldan to'xtatilgan | ✅ PASS | exit=0, "Backend ishlamayapti — …", backend o'zboshimchalik bilan yoqilmadi |

Jami: **21/21 PASS** (T1a–T11, T7a–i va T9b alohida sanalgan).

### Qo'shimcha: haqiqiy production nusxalarida dastlabki tekshiruv (faqat o'qish)

Mac'dagi `~/CRM-Backups` nusxalari `restore-db.sh` ga test muhitida berildi va "yo'q" deb javob qaytarildi. Natijada hech narsa
tiklanmadi, tarkib ekranga chiqmadi. Ikkala faylning SHA-256 oldin va keyin bir xil
(`49a815629b549d1f…`, `24a9c57286086251…`).

| Nusxa | Natija |
|---|---|
| `crm-2026-11-05_22-00-01.sql.gz` (kunlik, `backup-db-safe.sh`) | ✅ rad etildi: "146/146 jadval uchun oldinroq 'DROP TABLE IF EXISTS' yo'q" — backend to'xtatilishidan oldin |
| `crm-2026-11-05_11-06.sql.gz` (deploy oldidan, `backup-db.sh`) | ✅ tekshiruvdan o'tdi: 146 jadval, 82 migratsiya yozuvi (`task_evidence` dan oldin olingan), `--clean --if-exists`; "yo'q" → bekor qilindi |

## 5. Tozalash tasdig'i

| Tekshiruv | Natija |
|---|---|
| `docker compose -p crmhard down -v --remove-orphans` (faqat shu loyiha; umumiy `prune` ishlatilmadi) | ✅ konteyner 0, volume 0, tarmoq 0 |
| Docker konteynerlari / image'lari / volume'lari / tarmoqlari sinovdan oldingi ro'yxat bilan | ✅ bir xil (yangi image yuklanmagan, boshqa loyihalarga tegilmagan) |
| 55433 port | ✅ bo'sh |
| Colima | ✅ yana to'xtatildi (sinovdan oldingi holat) |
| Vaqtinchalik fayllar: `test.env`, test dumplari, arxivni ochish papkasi, loglar, sinov skripti | ✅ o'chirildi |
| Asl backup fayllari (`~/CRM-Backups`) | ✅ tegilmagan; qo'shimcha tekshiruvda o'qilgan ikkala fayl SHA-256 bo'yicha o'zgarmagan |
| Foydalanuvchi fayllari (`promt2.md` o'chirilishi, `ORG-SYSTEM-*.md`, `BACKUP-SCRIPT-AUDIT.md`) | ✅ o'zgartirilmagan |

## 6. Aniqlangan muammolar va cheklovlar

1. **Production'dagi kunlik nusxalarni yangi `restore-db.sh` rad etadi** (kutilgan va to'g'ri xulq). Serverda cron
   `backup-db.sh` ga almashtirilmaguncha kunlik nusxalardan ishchi bazaga tiklab bo'lmaydi. Hozircha bunday holatda deploy oldidan
   olingan `--clean` li nusxa ishlatiladi (§5-C). Bu — 4-bosqich, alohida tasdiq bilan.
2. **`SIGTERM` / Ctrl+C tiklash paytida.** Bash trap'ni joriy (foreground) quvur tugagach bajaradi, shuning uchun signal kelsa ham
   tiklash oxirigacha boradi, keyin backend qayta ishga tushiriladi. Bu holat alohida sinalmagan.
3. **`backup-db.sh` dagi `KEEP_DAYS` tozalash** `crm-*.sql.gz` qolipi bo'yicha ishlaydi. Serverda eski kunlik va deploy nusxalari bir
   papkada, bu o'zgarishsiz qoldi.
4. **`setup-server.sh` dagi SC2088 ogohlantirishi** oldindan bor va tegilmadi.

## 7. Keyingi bosqich (tasdiq kutmoqda)

[BACKUP-SCRIPT-AUDIT.md](BACKUP-SCRIPT-AUDIT.md) §7 bo'yicha:

| № | Qadam |
|---|---|
| 4 | Commit va push |
| 5 | Deploy — skriptlar serverga tushadi, cron o'zgarmaydi |
| 6 | Serverda `backup-db.sh` ni bir marta qo'lda ishga tushirish (yangi backup yaratadi) |
| 7 | Crontabni saqlab, cron qatorini almashtirish |
| 8 | Ertasi kuni tekshirish |
| 9 | 7 kundan keyin eski skriptlarni arxivga ko'chirish |

Har bir qadam alohida ruxsat bilan bajariladi.
