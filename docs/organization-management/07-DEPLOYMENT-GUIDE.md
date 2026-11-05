# 07 — Deploy, backup va rollback qo'llanmasi

Server: `it-academycrm.uz` (Docker Compose, `docker-compose.prod.yml`). Deploy faqat CEO ruxsati bilan.

## Deploy
1. `main` ga push.
2. Serverda: `nohup bash deploy/deploy.sh > .deploy/deploy-<vaqt>.log 2>&1 &`
   - eski versiya ishlab turganda yangi image build qilinadi;
   - **backup** olinadi (`scripts/backup-db.sh` bilan bir xil format);
   - `prisma migrate deploy` (faqat qo'shuvchi migratsiyalar), `db:sync-permissions`;
   - sog'liq tekshiruvi (`/api/health`); o'tmasa — avtomatik **rollback** oldingi image ga.
3. Tekshirish: `curl https://it-academycrm.uz/api/health`, oxirgi migratsiya, backend logida xato yo'qligi.

## Rollback
- Kod: `deploy/rollback.sh` (oldingi image).
- Baza (faqat zarurat bo'lsa, CEO ruxsati bilan — joriy ma'lumot almashtiriladi): `./scripts/restore-db.sh backups/crm-<sana>.sql.gz`.

## Backup va tiklash sinovi
- Kunlik backup (cron), saqlash muddati `KEEP_DAYS`.
- `./scripts/verify-backup.sh [fayl]` — nusxani **vaqtinchalik** `crm_verify_*` bazaga tiklaydi, jadval/foydalanuvchi/migratsiyani sanaydi, bazani o'chiradi.
  Ishchi bazaga tegmaydi. Tavsiya: serverda haftada bir (cron).

### 2026-11-05 sinov natijasi (lokal, production'ga tegilmagan)
- Lokal baza `pg_dump --clean --if-exists | gzip -9` (production formati) → `verify-backup.sh`: **tiklandi va tekshiruvdan o'tdi** —
  125 jadval, 143 foydalanuvchi, 75 migratsiya; vaqtinchalik baza o'chirildi.
- Shu nusxa (30-oktabr holati) vaqtinchalik bazaga tiklanib, unga keyingi **8 ta migratsiya** (`20261103100000_org_foundation` …
  `20261105100000_task_evidence`) qo'llandi — hammasi muvaffaqiyatli; o'quvchilar (130) va jadval qismlari (1155) soni o'zgarmadi.
- Production backupini tiklash sinovi serverda `verify-backup.sh` bilan qilinadi (CEO ruxsati bilan).
