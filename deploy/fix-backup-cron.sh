#!/usr/bin/env bash
# =====================================================================
# Zaxira cron'ini to'g'rilash (serverda bir marta ishga tushiriladi).
#
# Nima qiladi:
#   1. Hozirgi crontab nusxasini backups/crontab-<vaqt>.bak ga saqlaydi.
#   2. Eski qo'lda yozilgan `scripts/backup-db-safe.sh` qatorini git'dagi
#      `scripts/backup-db.sh` ga almashtiradi (vaqt o'sha: 22:00 UTC = 03:00 Toshkent, 30 kun).
#      Sabab: eski skript dumpni --clean siz oladi va yuklangan fayllarni arxivlamaydi —
#      bunday nusxani restore-db.sh rad etadi (docs/CRM-4.0-BACKUP-RECOVERY.md §1).
#   3. Haftalik tiklash tekshiruvini qo'shadi (dushanba 23:00 UTC = seshanba 04:00 Toshkent):
#      nusxa vaqtinchalik bazaga tiklanadi va o'chiriladi — ishchi bazaga tegilmaydi.
#   4. Darhol yangi zaxira oladi va uni tiklab tekshiradi.
#
# Takroriy ishga tushirish xavfsiz: qatorlar ikki marta qo'shilmaydi.
#
# Ishlatish (repo papkasida):
#   ./deploy/fix-backup-cron.sh            # o'zgartiradi
#   DRY_RUN=1 ./deploy/fix-backup-cron.sh  # faqat nima o'zgarishini ko'rsatadi
# =====================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

[ -f .env.production ] || { warn ".env.production topilmadi — skript repo papkasida (serverda) ishga tushirilishi kerak"; exit 1; }
[ -x scripts/backup-db.sh ] || chmod +x scripts/backup-db.sh scripts/verify-backup.sh

mkdir -p backups
chmod 700 backups

BACKUP_LINE="0 22 * * * cd $APP_DIR && KEEP_DAYS=30 /usr/bin/bash ./scripts/backup-db.sh >> $APP_DIR/backups/backup.log 2>&1"
VERIFY_LINE="0 23 * * 1 cd $APP_DIR && /usr/bin/bash ./scripts/verify-backup.sh >> $APP_DIR/backups/backup.log 2>&1"

CURRENT="$(crontab -l 2>/dev/null || true)"

say "Hozirgi zaxira qatorlari:"
printf '%s\n' "$CURRENT" | grep -E 'backup-db|verify-backup' || echo "   (yo'q)"

# Eski va yangi zaxira qatorlari olib tashlanadi, o'rniga bitta to'g'ri qator; boshqa cron qatorlariga tegilmaydi
NEW="$(printf '%s\n' "$CURRENT" | grep -Ev 'scripts/backup-db(-safe)?\.sh|scripts/verify-backup\.sh' || true)"
NEW="$(printf '%s\n%s\n%s\n' "$NEW" "$BACKUP_LINE" "$VERIFY_LINE" | sed '/^$/d')"

if [ "$NEW" = "$(printf '%s\n' "$CURRENT" | sed '/^$/d')" ]; then
  say "Cron allaqachon to'g'ri — o'zgartirish kerak emas."
else
  say "Yangi zaxira qatorlari:"
  printf '%s\n' "$BACKUP_LINE" "$VERIFY_LINE"
  if [ "${DRY_RUN:-}" = "1" ]; then
    say "DRY_RUN=1 — crontab o'zgartirilmadi."
    exit 0
  fi
  STAMP="$(date -u '+%Y-%m-%d_%H-%M')"
  printf '%s\n' "$CURRENT" > "backups/crontab-$STAMP.bak"
  chmod 600 "backups/crontab-$STAMP.bak"
  say "Eski crontab saqlandi: backups/crontab-$STAMP.bak (qaytarish: crontab backups/crontab-$STAMP.bak)"
  printf '%s\n' "$NEW" | crontab -
  say "Crontab yangilandi."
fi

[ "${DRY_RUN:-}" = "1" ] && exit 0

say "Hozir yangi zaxira olinmoqda..."
./scripts/backup-db.sh

say "Zaxira tiklab tekshirilmoqda (vaqtinchalik bazada)..."
if ./scripts/verify-backup.sh; then
  say "Tayyor: zaxira olinadi va tiklanadi. Oxirgi nusxalar:"
  ls -lt backups/crm-*.sql.gz | head -3
else
  warn "Tekshiruv o'tmadi — backups/backup.log ni ko'ring."
  exit 1
fi
