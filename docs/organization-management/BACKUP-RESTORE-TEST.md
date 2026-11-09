# Production backup — tiklash sinovi

Sana: 2026-11-06. Bog'liq: [ORG-SYSTEM-0-RISK-REGISTER.md](ORG-SYSTEM-0-RISK-REGISTER.md), R-01 va R-02.

**Natija: ✅ RESTORE MUVAFFAQIYATLI** (2026-11-06, Mac'dagi izolyatsiyalangan klasterda, CEO tasdig'i bilan).
2026-11-05 22:00 UTC nusxasi xatosiz tiklandi.
- Schema va migratsiyalar kod bilan to'liq mos.
- Har jadvaldagi qatorlar soni dump bilan bir xil.
- Ikkita muhim jadval bo'sh, sababi ma'lumotning o'zida (§9).

Production server, production bazasi va `.env.production` bilan sinov davomida aloqa bo'lmagan.
1–3-bosqichlarda serverda faqat o'qiydigan buyruqlar ishlatilgan: `ls`, `gzip -t`, `sha256sum`, `journalctl`, `crontab -l`.
Backup fayllari o'zgartirilmagan va o'chirilmagan.
Hisobotda faqat umumiy sonlar bor: ism, telefon, manzil yoki summa yo'q.

---

## 1. Backup qayerda saqlanadi

| Joy | Yo'l | Huquqlar | Nusxalar | Qanday to'ldiriladi |
|---|---|---|---|---|
| Production server | `/home/ubuntu/crm/backups/` | `drwx------ ubuntu` (faqat egasi) | 53 ta baza nusxasi (`crm-*.sql.gz`), 8 ta fayl arxivi (`uploads-*.tar.gz`) | Kunlik cron + har deploydan oldin |
| CEO Mac kompyuteri (tashqi nusxa) | `~/CRM-Backups/` | `drwx------` | 53 ta baza nusxasi, 16 ta fayl arxivi, buzuq nusxa yo'q | `launchd` agenti `uz.itacademy.crm.backup-pull` (yuklangan), `scripts/pull-backups.sh` |

**Nusxa qachon olinadi:**
- **Har kuni** 22:00 UTC (Toshkent vaqti bilan 03:00), ubuntu foydalanuvchisi crontabi orqali:
  `scripts/backup-db-safe.sh >> backups/backup.log`. Nusxa 30 kun saqlanadi.
- **Har deploydan oldin:** `deploy/deploy.sh:107` → `scripts/backup-db.sh`. Baza va yuklangan fayllarni oladi.

Server diski: 77 GB dan 24 GB band (31%).

## 2. Oxirgi nusxa: sana, hajm, butunlik

Fayl: `crm-2026-11-05_22-00-01.sql.gz` (2026-11-05 22:00 UTC, kunlik nusxa).

| Tekshiruv | Natija |
|---|---|
| Hajm (siqilgan / ochilgan) | 804 317 bayt / 4 500 303 bayt |
| `gzip -t` | ✅ OK |
| pg_dump yakunlovchi satri (`PostgreSQL database dump complete`) | ✅ bor |
| Versiya | Dumped from 17.11, pg_dump 17.11 |
| `CREATE TABLE` soni | 146 (145 Prisma modeli + `_prisma_migrations`) |
| `COPY` bloklari | 146 |
| `_prisma_migrations` ma'lumoti | ✅ bor |
| Vaqtinchalik `.partial` qoldiqlari | 0 |
| SHA-256 (server) | `49a815629b549d1f2a55e4df20c722638dd36b2730c23c08e41a704afef62048` |
| SHA-256 (Mac nusxasi) | `49a815629b549d1f2a55e4df20c722638dd36b2730c23c08e41a704afef62048` — **bir xil** |

Oxirgi deploy oldidan olingan nusxa: `crm-2026-11-05_11-06.sql.gz` (805 873 bayt) va `uploads-2026-11-05_11-06.tar.gz` (58 617 bayt).

## 3. Backup jarayoni loglari

- `backups/backup.log` — 24 qator, hammasi `Backup OK: …`. Xato yozuvi **0 ta**.
- `pull.log` (Mac):
  - `2026-11-06 10:00:03 OK crm-2026-11-05_22-00-01.sql.gz`;
  - `Tugadi: yangi 1 ta, eskirgan 0 ta o'chirildi`.

### Topilmalar

1. **3 kunlik bo'shliq: 31-oktabr, 1 va 2-noyabr kechalari nusxa olinmagan.**
   - Bu kunlar uchun cron jurnalida ham yozuv yo'q.
   - Server jurnali 2026-10-30 23:47 dan 2026-11-03 04:52 gacha butunlay jim. Keyingi birinchi yozuv:
     `systemd-resolved: Clock change detected`.
   - Server qayta yuklanmagan (`uptime -s` = 2026-10-08), demak virtual mashina hosting tomonidan to'xtatib qo'yilgan (suspend).
   - Shu oraliqda CRM ham ishlamagan, shuning uchun nusxasi olinmagan yangi ma'lumot yo'q.
   - **Tavsiya:** hosting provayderidan bu to'xtashning sababini so'rash. Nusxa olinmagan kun uchun ogohlantirish qo'shish.
2. **Kunlik nusxa yuklangan fayllarni olmaydi.**
   - `backup-db-safe.sh` faqat bazani oladi.
   - Cheklar va hujjatlar (`uploads-*.tar.gz`) faqat deploy paytida arxivlanadi; oxirgisi 2026-11-05 11:06.
   - Deploylar orasida yuklangan fayl zaxirasiz qoladi.
3. **`scripts/backup-db-safe.sh` gitda yo'q.**
   - Serverda qo'lda yaratilgan (2026-10-12).
   - Repodagi `backup-db.sh` dan farqli: `--clean` yo'q, fayllarni olmaydi, tashqi nusxaga yubormaydi.
   - Server qayta qurilsa, bu skript yo'qoladi.
4. **`scripts/verify-backup.sh` serverda ishga tushirilsa, production PostgreSQL ichida ishlaydi.**
   - Vaqtinchalik baza (`CREATE DATABASE` / `DROP DATABASE`) production konteynerida yaratiladi.
   - Ishchi baza tegilmaydi (nom tekshiruvi bor), lekin bu alohida test muhiti emas.
   - Shuning uchun quyidagi reja Mac'dagi alohida, vaqtinchalik PostgreSQL klasterini tanlaydi.
5. **R-01 ("nusxa faqat serverda") amalda qisman bartaraf etilgan.**
   - Nusxalar har kuni Mac'ga tortilmoqda, oxirgisi SHA-256 bo'yicha serverdagi bilan bir xil.
   - Ikkinchi joy hozircha faqat bitta kompyuter. Bulut nusxasi tavsiya etiladi.

## 4. Sinov muhiti va xavfsizlik tekshiruvi

| Shart | Natija |
|---|---|
| Disk shifrlangan | ✅ `fdesetup status`: FileVault is On; `Macintosh HD - Data` tomi (scratchpad va `~/CRM-Backups` shu yerda) — FileVault: Yes |
| Alohida klaster | ✅ PostgreSQL 17.11 (Homebrew), sessiya scratchpad papkasida yangi `initdb`, katalog `drwx------` |
| Tashqi tarmoq yo'q | ✅ `listen_addresses=''`; klaster jarayonida TCP soketlar soni **0** (`lsof`); ulanish faqat unix socket orqali (alohida `/tmp/crmrt.*` papkasi, 700). macOS socket yo'li 104 belgidan oshmasligi kerak, shuning uchun socket ma'lumotlardan alohida turadi |
| Parol yo'q | ✅ `trust`, faqat lokal socket va joriy foydalanuvchi |
| Production bilan aloqa yo'q | ✅ Sinov bosqichida `ssh` ham, server manzili ham ishlatilmagan; `.env.production` o'qilmagan |
| Lokal ishchi baza | ✅ `127.0.0.1:5432` ga tegilmagan (ishlab turgan holda qoldi) |
| Dump egasi | Dumpdagi yagona ega nomi ekranga chiqarilmasdan o'qildi va sinov klasterida `NOLOGIN` rol sifatida yaratildi. Dump o'zgartirilmagan |

## 5. Tiklash

| Ko'rsatkich | Qiymat |
|---|---|
| Manba | `~/CRM-Backups/crm-2026-11-05_22-00-01.sql.gz`, faqat `gunzip -c` bilan o'qilgan |
| Buyruq | `psql -v ON_ERROR_STOP=1` → yangi `crm_restore` bazasi |
| Chiqish kodi | **0** |
| stderr | 0 qator: xato ham, ogohlantirish ham yo'q. stderr ekranga emas, faylga yozilgan; fayl keyin o'chirilgan |
| Vaqt | ~1 soniya (RTO: baza qismi uchun 1 daqiqadan kam; ilovani qayta ishga tushirish bunga kirmaydi) |

## 6. Tekshiruvlar jadvali

| № | Tekshiruv | Kutilgan | Natija | |
|---|---|---|---|---|
| 1 | Tiklash xatosiz (FK va cheklovlar ma'lumotdan keyin qo'shiladi) | chiqish kodi 0 | 0 | ✅ PASS |
| 2 | `public` jadvallari | 146 | 146 (145 model + `_prisma_migrations`) | ✅ PASS |
| 3 | Migratsiyalar: tugallangan / tugallanmagan / rollback | 83 / 0 / 0 | 83 / 0 / 0 | ✅ PASS |
| 4 | Oxirgi migratsiya | `20261105100000_task_evidence` | `20261105100000_task_evidence` | ✅ PASS |
| 5 | Migratsiya nomlari repodagi bilan | farq yo'q | 83/83, farq 0 | ✅ PASS |
| 6 | Migratsiya checksum'i repodagi `migration.sql` bilan | hammasi mos | 83/83 mos | ✅ PASS |
| 7 | `prisma migrate status` | up to date | "Database schema is up to date!", exit 0 | ✅ PASS |
| 8 | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | farq yo'q | "No difference detected.", exit 0 | ✅ PASS |
| 9 | Qatorlar soni: har jadval ↔ dumpdagi `COPY` qatorlari | 146/146 teng | 146/146 teng; jami 23 234 = 23 234 | ✅ PASS |
| 10 | Tashqi kalitlar | hammasi tasdiqlangan | 348 ta, tasdiqlanmagan 0 | ✅ PASS |
| 11 | CHECK cheklovlari / indekslar | mavjud | 59 / 569 | ✅ PASS |
| 12 | Yetim to'lov taqsimoti | 0 | 0 | ✅ PASS |
| 13 | Ruxsatsiz rol | 0 | 0 (10 rol, 419 bog'lanish) | ✅ PASS |
| 14 | Yuklangan fayllar arxivi (`uploads-2026-11-05_11-06.tar.gz`, Mac) | butun | `gzip -t` OK, `tar -tzf` exit 0, 2 fayl | ✅ PASS |

## 7. Muhim jadvallar (faqat sonlar)

| Jadval | Qatorlar | Bo'sh emas |
|---|---|---|
| `users` | 15 (faol: 15) | ✅ PASS |
| `roles` | 10 | ✅ PASS |
| `permissions` | 116 | ✅ PASS |
| `role_permissions` | 419 | ✅ PASS |
| `branches` | 1 | ✅ PASS |
| `students` | 194 | ✅ PASS |
| `groups` | 24 | ✅ PASS |
| `courses` | 10 | ✅ PASS |
| `leads` | 72 | ✅ PASS |
| `payments` | 102 | ✅ PASS |
| `payment_installments` | 2231 | ✅ PASS |
| `payment_allocations` | 0 | ❌ FAIL (sababi — §9.1) |
| `employees` | 1 | ✅ PASS |
| `teacher_profiles` | 7 | ✅ PASS |
| `staff_attendance_days` | 19 | ✅ PASS |
| `tasks` | 0 | ❌ FAIL (sababi — §9.2) |
| `audit_logs` | 1583 | ✅ PASS |

Yangilik (UTC):
- oxirgi audit yozuvi — 2026-11-05 10:34;
- oxirgi to'lov — 2026-11-03 05:10;
- oxirgi xodim davomati kuni — 2026-11-05.

Nusxa olingan vaqt (2026-11-05 22:00) bilan mos. Jami 146 jadvaldan 85 tasi bo'sh: ishlatilmayotgan modullar (LMS, imtihon, ombor va h.k.).

## 8. Tozalash tasdig'i

| Tekshiruv | Natija |
|---|---|
| `pg_ctl stop -m fast` | ✅ OK |
| Vaqtinchalik klaster (83 MB, shu jumladan WAL 32 MB), PostgreSQL logi, hisob fayllari | ✅ o'chirildi, katalog yo'q |
| Socket papkasi `/tmp/crmrt.*` | ✅ o'chirildi |
| Vaqtinchalik PostgreSQL jarayoni | ✅ yo'q |
| 55432 port | ✅ bo'sh |
| Dumpning ochilgan nusxasi diskka yozilganmi | Yo'q, faqat `gunzip -c` oqimi ishlatilgan |
| Asl backup | ✅ o'zgarmagan: 804 317 bayt, mtime 2026-11-06 03:00:02, `-rw-------`, SHA-256 `49a81562…afef62048` (oldin va keyin bir xil) |
| `~/CRM-Backups` | ✅ 53 baza nusxasi, 16 fayl arxivi (o'zgarmagan) |
| Production server | ✅ sinov bosqichida ulanish bo'lmagan |

## 9. Aniqlangan muammolar

1. **`payment_allocations` bo'sh. Bu backup nuqsoni emas.**
   - Dumpning o'zida ham 0 qator.
   - Oylik billing migratsiyasi production'da 2026-11-05 11:00 UTC da qo'llangan, undan keyin birorta ham to'lov qabul qilinmagan (0 ta).
   - Eski to'lovlar taqsimot jadvaliga yozilmaydi, FIFO bo'yicha hisoblanadi (`utils/billingLedger.ts`).
   - Yetim taqsimot 0 ta. Birinchi yangi to'lovdan keyin bu jadval to'ladi.
2. **`tasks` bo'sh. Bu backup nuqsoni emas.**
   - Dumpda ham 0 qator.
   - Audit jurnalida vazifa bo'yicha birorta ham yozuv yo'q, ya'ni production'da vazifa hali yaratilmagan.
   - Bu ORG vazifalar moduli amalda ishlatilmayotganini ko'rsatadi (biznes masalasi).
3. **Kunlik nusxada yuklangan fayllar yo'q** (§3, 2-topilma). Fayl arxivi faqat deploy paytida olinadi.
   Oxirgisi butun, lekin ichida bor-yo'g'i 2 ta fayl.
4. **31-oktabr va 1–2-noyabr kunlari nusxa yo'q.** Server to'xtatib qo'yilgan edi (§3, 1-topilma).
5. **`backup-db-safe.sh` gitda yo'q** (§3, 3-topilma).
6. **Yuklangan fayllarni tiklash sinalmadi.** Arxiv faqat o'qib tekshirildi, ilovaga tiklab ko'rilmadi.

## 10. Umumiy xulosa

| Bosqich | Holat |
|---|---|
| 1. Backup joyi | ✅ |
| 2. Sana, hajm, butunlik | ✅ |
| 3. Loglar | ✅ (3 kunlik bo'shliq sababi aniqlangan) |
| 4. Izolyatsiyalangan tiklash | ✅ |
| 5. Schema va migratsiyalar | ✅ 8/8 PASS |
| 6. Muhim ma'lumotlar | ✅ 15/17 PASS; 2 ta FAIL — ma'lumot yo'qligi sababli, backup nuqsoni emas |
| 7. Tozalash | ✅ |

**R-02 ("production backup tiklab ko'rilmagan") yopildi.** 2026-11-05 dagi production nusxasi to'liq tiklanadi.
Tiklangan baza joriy kod (`9dbb232`) bilan schema darajasida bir xil va dumpdagi barcha 23 234 qator joyida.

**Ochiq qolgan ishlar:**
- kunlik backupga yuklangan fayllarni ham qo'shish;
- `backup-db-safe.sh` ni gitga olish;
- nusxa olinmagan kun uchun ogohlantirish;
- sinovni oyiga bir marta takrorlash;
- R-01 uchun ikkinchi tashqi joy (bulut).

Bular kod yoki server konfiguratsiyasini o'zgartiradi, shuning uchun alohida tasdiq bilan qilinadi.
