# Zaxira va tiklash (CRM 4.0, Faza 0)

> Sana: 2026-10-05 · Bog'liq: [CRM-4.0-PHASE-0.md](CRM-4.0-PHASE-0.md) §6, [deployment.md](deployment.md) §5.

**Holat bir jumlada:** zaxira skripti yaxshilandi va tiklash lokal bazada sinab ko'rildi, lekin **production zaxirasi hali xavfsiz deb
hisoblanmaydi** — tashqi nusxa sozlanmagan va production nusxasidan tiklash serverda sinalmagan (§7).

---

## 1. Joriy strategiya

| Nima | Qanday | Qayerda | Qachon |
|---|---|---|---|
| PostgreSQL bazasi | `pg_dump --clean --if-exists` → gzip | serverda `backups/crm-<sana>.sql.gz` | har kuni 03:00 (cron, `deploy/setup-server.sh`) va har deploy'da migratsiyadan oldin |
| Yuklangan fayllar (cheklar, hujjatlar; `crm_uploads` volume) | `tar` → gzip | serverda `backups/uploads-<sana>.tar.gz` | baza nusxasi bilan birga (**Faza 0 da qo'shildi**) |
| Tashqi nusxa | `rsync` (`BACKUP_REMOTE` berilsa) | boshqa server | har zaxiradan keyin (**Faza 0 da qo'shildi; sozlash kerak**) |
| Tiklab tekshirish | `scripts/verify-backup.sh` — vaqtinchalik bazaga tiklaydi, sanaydi, o'chiradi | serverda | qo'lda; hujjatda haftalik cron tavsiya qilingan, o'rnatuvchi skript uni **qo'shmaydi** |

Saqlash muddati: baza nusxalari — `KEEP_DAYS` (skript standarti 30; o'rnatuvchi cron 14 beradi), fayl arxivlari — `UPLOADS_KEEP_DAYS` (7).

Zaxiraga **kirmaydi:** `.env.production` (maxfiy kalitlar), Nginx/sertifikat sozlamalari, `code-runner` serveri.

## 2. Faza 0 dan oldingi zaifliklar

| # | Zaiflik | Faza 0 dan keyin |
|---|---|---|
| 1 | Nusxa faqat shu serverda — disk yoki server yo'qolsa zaxira ham yo'qoladi | Skriptda tashqi nusxa imkoni bor; **serverda sozlanmaguncha zaiflik saqlanadi** |
| 2 | Yuklangan fayllar zaxiralanmaydi — baza tiklansa, hujjat yozuvlari mavjud bo'lmagan fayllarga ishora qiladi | Yopildi (har zaxirada arxiv) |
| 3 | `pg_dump` yarim yo'lda uzilsa, yarim fayl "nusxa" bo'lib qolardi | Yopildi: `.partial` → tekshiruv → `mv`; xatoda fayl o'chiriladi va skript 1 kodi bilan chiqadi |
| 4 | Bo'sh yoki uzilgan dump aniqlanmasdi | Yopildi: `gzip -t`, eng kichik hajm, `pg_dump` yakunlovchi satri |
| 5 | Tashqi nusxa yo'qligi hech qayerda ko'rinmasdi | Har yurishda jurnalga ogohlantirish yoziladi |
| 6 | Tiklash muntazam sinalmaydi | **Ochiq** — tartib bor (§4, §5), jadval sizdan |
| 7 | PITR yo'q — oxirgi zaxiradan keyingi ma'lumot yo'qoladi | **Ochiq** (§3 tavsiya) |
| 8 | Zaxira muvaffaqiyatsiz bo'lsa hech kim xabar olmaydi | **Ochiq** — skript endi xatoda 1 qaytaradi; xabar berish (monitoring) sozlanmagan |

## 3. Tavsiya etilgan production strategiyasi

1. **Tashqi nusxa (majburiy).** Boshqa provayder yoki kamida boshqa serverdagi manzil; zaxira serverida faqat yozish huquqli alohida
   foydalanuvchi. S3-mos saqlash ishlatilsa — versiyalash va o'chirishdan himoya (object lock) yoqilgan chelak.
2. **3-2-1 qoidasi:** 3 nusxa, 2 xil joy, 1 tasi boshqa hududda.
3. **Saqlash:** kunlik 14 kun, haftalik 8 hafta, oylik 12 oy (tashqi manzilda; serverda 14 kun yetarli).
4. **Haftalik tiklash sinovi** (`verify-backup.sh`, dushanba 04:00) va **chorakda bir to'liq mashq** — toza serverda §5 bo'yicha tiklash, vaqtni o'lchash.
5. **Kuzatuv:** zaxira jurnalida `XATOLIK` yoki oxirgi nusxa 26 soatdan eski bo'lsa — ogohlantirish.
6. **Keyinroq (o'sishga qarab):** WAL arxivlash va PITR (`pgBackRest` yoki `wal-g`) — yo'qotishni daqiqalarga tushiradi.

### RPO va RTO

| Ko'rsatkich | Hozir (tashqi nusxasiz) | Tavsiya (tashqi nusxa bilan) | PITR bilan |
|---|---|---|---|
| **RPO** (qancha ma'lumot yo'qolishi mumkin) | 24 soatgacha; server yo'qolsa — **hammasi** | 24 soat | 5–15 daqiqa |
| **RTO** (qancha vaqtda tiklanadi) | o'lchanmagan | **2 soat** maqsad: yangi server 30–60 daq + tiklash 10–30 daq + tekshiruv 15 daq | 2 soat |

Markaz uchun 24 soatlik RPO bir kunlik to'lovlar, davomat va baholarni qayta kiritishni anglatadi. Agar bu qabul qilinmasa — kuniga
ikki marta zaxira (masalan 03:00 va 14:00) arzon oraliq yechim; PITR — to'liq yechim.

## 4. Zaxirani tekshirish (ishchi bazaga tegmaydi)

```bash
cd /opt/sales-crm
./scripts/verify-backup.sh                          # eng oxirgi nusxa
./scripts/verify-backup.sh backups/crm-<sana>.sql.gz
```

Skript nusxani yangi `crm_verify_<vaqt>` bazasiga tiklaydi, jadvallar, foydalanuvchilar va migratsiyalarni sanaydi, keyin o'sha bazani
o'chiradi. Chiqish kodi 0 — nusxa tiklanadi.

Fayllar arxivini tekshirish:

```bash
gzip -t backups/uploads-<sana>.tar.gz && tar -tzf backups/uploads-<sana>.tar.gz | wc -l   # fayllar soni
```

## 5. Tiklash tartibi

**A. Faqat baza (xato amal, buzilgan ma'lumot):**

```bash
cd /opt/sales-crm
./scripts/backup-db.sh                                   # hozirgi holatni ham saqlab qo'ying
./scripts/restore-db.sh backups/crm-<sana>.sql.gz        # "ha" deb tasdiqlash so'raydi; backend to'xtatiladi
curl -s http://localhost:8080/api/health
```

**B. Baza va fayllar (server yo'qolgan):**

1. Yangi serverni tayyorlang: `deploy/setup-server.sh`, repozitoriyni klonlang, `.env.production` ni tiklang (u zaxirada yo'q — alohida,
   xavfsiz joyda saqlanishi shart).
2. Nusxalarni tashqi manzildan `backups/` ga ko'chiring.
3. Stack'ni ishga tushiring: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres`.
4. Bazani tiklang: `./scripts/restore-db.sh backups/crm-<sana>.sql.gz`.
5. Fayllarni tiklang (backend ishlab turgan holda):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d backend
   gunzip -c backups/uploads-<sana>.tar.gz | docker compose -f docker-compose.prod.yml --env-file .env.production \
     exec -T backend tar -xf - -C /app/uploads
   ```
6. Qolgan servislar: `./deploy/deploy.sh` yoki `docker compose … up -d`.
7. Tekshiruv: `/api/health`, tizimga kirish, bitta hujjat/chekni yuklab olish, oxirgi to'lovlar ro'yxati, Telegram webhook
   (`npm run telegram:check:prod`).

Baza va fayllar arxivi bir xil vaqt belgisi bilan olinadi — juftini ishlating. Fayl arxivi bazadan bir necha soniya keyin olinadi:
shu oraliqda yuklangan fayl arxivda bo'lib, bazada bo'lmasligi mumkin (zararsiz — "yetim" fayl tozalash vazifasi uni o'chiradi).

## 6. Sozlamalar

`scripts/backup-db.sh` muhit o'zgaruvchilari (cron satrida yoki `.env.production` da):

| O'zgaruvchi | Standart | Ma'nosi |
|---|---|---|
| `KEEP_DAYS` | 30 | baza nusxalarini serverda saqlash |
| `UPLOADS_KEEP_DAYS` | 7 | fayl arxivlarini serverda saqlash (har biri to'liq nusxa — diskni kuzating) |
| `BACKUP_UPLOADS` | 1 | 0 — fayllar arxivlanmaydi |
| `BACKUP_REMOTE` | bo'sh | rsync manzili, masalan `backup@10.0.0.5:/srv/crm-backups` |
| `MIN_BYTES` | 1024 | bundan kichik dump rad etiladi |

## 7. Production tekshiruv ro'yxati

**⚠️ PRODUCTION VERIFICATION REQUIRED.** Quyidagilarning hech biri repozitoriydan qilib bo'lmaydi — serverga kirish va qaror kerak.
Tartib bilan bajaring va natijani §9 ga yozing. `$DC` = `docker compose -f docker-compose.prod.yml --env-file .env.production`.

**1. `BACKUP_REMOTE` ni sozlash.** Boshqa serverda (yoki saqlash xizmatida) papka tayyorlang, masalan `/srv/crm-backups`.
`.env.production` ga: `BACKUP_REMOTE=backup@<zaxira-server>:/srv/crm-backups`.

**2. Xavfsiz kirish ma'lumotlari.**
- CRM serverida alohida kalit: `ssh-keygen -t ed25519 -f ~/.ssh/crm_backup -N ''`; ochiq kalitni zaxira serveridagi `backup`
  foydalanuvchisiga qo'shing (shell'siz, faqat shu papkaga yoza oladigan; iloji bo'lsa `rrsync` bilan cheklangan).
- `~/.ssh/config` da zaxira serveri uchun shu kalit; birinchi ulanishni qo'lda bajarib, host kalitini tasdiqlang
  (`ssh backup@<zaxira-server> true`) — skript `BatchMode` da ishlaydi va savol bera olmaydi.
- Zaxira serveridagi nusxalarni CRM serveri **o'chira olmasligi** kerak (kompromat bo'lgan server zaxirani ham yo'q qilmasin).

**3. Saqlash muddati.** Serverda: `KEEP_DAYS` (cron 14 beradi), `UPLOADS_KEEP_DAYS` (7). Zaxira serverida — o'sha tomonda cron yoki
lifecycle qoidasi (skript uzoqdagi eski nusxalarni o'chirmaydi), masalan kunlik 14, haftalik 8, oylik 12.

**4. Haftalik tekshiruv cron'i:**
```bash
( crontab -l; echo "0 4 * * 1 cd /opt/sales-crm && ./scripts/verify-backup.sh >> /opt/sales-crm/backups/backup.log 2>&1" ) | crontab -
```

**5. Birinchi production zaxirasi:**
```bash
cd /opt/sales-crm && ./scripts/backup-db.sh; echo "exit=$?"
ls -lh backups/ | tail -4
```
Kutiladi: `exit=0`; jurnalda "Baza nusxasi tayyor", "Fayllar arxivi tayyor", "Tashqi nusxa ko'chirildi". "OGOHLANTIRISH: BACKUP_REMOTE
sozlanmagan" chiqsa — 1-qadam bajarilmagan. Zaxira serverida ikkala fayl borligini tekshiring.

**6. Nusxani izolyatsiyalangan muhitga tiklash.**
- Tezkor (shu serverda, vaqtinchalik bazaga, ishchi bazaga tegmaydi): `./scripts/verify-backup.sh; echo "exit=$?"`.
- To'liq mashq (tavsiya, chorakda bir): **alohida** server yoki VM da §5-B bo'yicha — nusxani **zaxira serveridan** olib (shunda tashqi
  nusxaning o'zi sinaladi), tiklashga ketgan vaqtni o'lchang.

**7. Yuklangan fayllarni tekshirish:**
```bash
gzip -t backups/uploads-<sana>.tar.gz && tar -tzf backups/uploads-<sana>.tar.gz | grep -vc '/$'           # arxivdagi fayllar soni
$DC exec -T backend sh -c 'find /app/uploads -type f | wc -l'                                              # jonli fayllar soni
$DC exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c 'SELECT count(*) FROM documents WHERE "deletedAt" IS NULL;'
```
Kutiladi: arxivdagi son ≈ jonli son (zaxiradan keyin yuklangan fayllar farq qilishi mumkin). To'liq mashqda: tiklangan tizimda bitta chek
va bitta hujjatni interfeys orqali yuklab oling.

**8. Baza yaxlitligi.** `verify-backup.sh` natijasida: jadvallar soni, foydalanuvchilar > 0, bajarilgan migratsiyalar soni ishchi bazadagi
bilan bir xil, tugallanmagan migratsiya 0. To'liq mashqda qo'shimcha: `/api/health`, tizimga kirish, oxirgi to'lovlar ro'yxati va
kassalar qoldig'i ishchi tizimdagi (zaxira paytidagi) bilan mos.

**9. Natijani hujjatlashtirish** — §9 jadvalini to'ldiring. Shu to'ldirilmaguncha production zaxirasi **tasdiqlanmagan** hisoblanadi.

Qo'shimcha: `.env.production` nusxasi xavfsiz joyda (parol menejeri) bo'lishi shart — usiz tiklangan baza ishga tushmaydi; zaxira xatosi
haqida ogohlantirish (monitoring) — Faza 1 ishi; fayl arxivlari qo'shilgach `backups/` hajmini bir hafta kuzating.

## 8. Faza 0 da nima tekshirildi, nima yo'q

| Tekshiruv | Natija |
|---|---|
| Skript sintaksisi (`bash -n`, `shellcheck`) | O'tdi |
| Skript mantig'i soxta `docker` bilan: odatiy yurish, dump xatosi, uzilgan dump, backend o'chiq, tashqi nusxa, tashqi manzil xatosi, eski nusxalarni tozalash | O'tdi (xatoda yarim fayl qolmaydi, chiqish kodi 1) |
| Haqiqiy `pg_dump` (PostgreSQL 17) chiqishi skriptdan o'tishi | O'tdi (lokal dev baza) |
| O'sha nusxani `verify-backup.sh` bilan tiklash | O'tdi: 107 jadval, 62 migratsiya (lokal dev baza) |
| Production stack'da (`docker compose`) yurgizish | **Yurgizilmagan** — bu muhitda Docker ishlamaydi |
| Production nusxasidan tiklash | **Sinalmagan** |
| `rsync` bilan haqiqiy uzoq serverga ko'chirish | **Sinalmagan** (faqat lokal papkaga) |

## 9. Production tiklash natijasi

**Hali bajarilmagan.** Birinchi mashqdan keyin to'ldiriladi.

| Sana | Kim | Nusxa (fayl) | Manba (lokal / tashqi) | Qayerga tiklandi | Jadvallar / migratsiyalar | Fayllar soni | Ketgan vaqt (RTO) | Natija |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | ❌ NOT VERIFIED |
