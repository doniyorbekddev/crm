#!/usr/bin/env bash
# =====================================================================
# Serverdagi zaxira nusxalarni boshqa joyga (masalan, direktorning Mac kompyuteriga) tortib oladi.
# Server buzilsa ham baza nusxalari ikkinchi joyda qoladi.
#
# Qo'lda:   ./scripts/pull-backups.sh
# Avtomatik (macOS): deploy/launchd/uz.itacademy.crm.backup-pull.plist — har kuni va kompyuter yoqilganda.
#
# Sozlamalar (muhit o'zgaruvchisi):
#   BACKUP_SOURCE=ubuntu@185.196.219.20:crm/backups/   qayerdan (SSH orqali, mavjud kalit bilan)
#   BACKUP_DEST=~/CRM-Backups                          qayerga (faqat egasi o'qiy oladi, 700)
#   LOCAL_KEEP_DAYS=90                                 shu kundan eski nusxalar bu yerda o'chiriladi
#
# Serverdagi nusxalar o'chirilmaydi va o'zgartirilmaydi (faqat o'qiladi). Har bir yangi .gz fayl
# butunligi tekshiriladi; buzuq fayl "corrupt-" nomi bilan ajratiladi va chiqish kodi 1 bo'ladi.
# =====================================================================
set -euo pipefail

SOURCE="${BACKUP_SOURCE:-ubuntu@185.196.219.20:crm/backups/}"
DEST="${BACKUP_DEST:-$HOME/CRM-Backups}"
KEEP_DAYS="${LOCAL_KEEP_DAYS:-90}"
LOG="$DEST/pull.log"

mkdir -p "$DEST"
chmod 700 "$DEST"
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

# Kalit paroli macOS Keychain'da — agent bo'sh bo'lsa ham so'rovsiz yuklanadi
if [ "$(uname)" = "Darwin" ]; then
  ssh-add --apple-load-keychain >/dev/null 2>&1 || true
fi
SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=20"
[ "$(uname)" = "Darwin" ] && SSH_CMD="$SSH_CMD -o UseKeychain=yes"

log "Boshlandi: $SOURCE → $DEST"
before="$(mktemp)"
trap 'rm -f "$before"' EXIT
find "$DEST" -maxdepth 1 -type f \( -name '*.gz' \) -exec basename {} \; | sort > "$before"

# Faqat nusxa fayllari; --ignore-existing — mavjudlari qayta yuklanmaydi, serverda hech narsa o'chmaydi
if ! rsync -a --ignore-existing -e "$SSH_CMD" \
    --include='crm-*.sql.gz' --include='uploads-*.tar.gz' --exclude='*' \
    "$SOURCE" "$DEST/"; then
  log "XATO: serverdan nusxa olinmadi (tarmoq yoki SSH kaliti)"
  exit 1
fi
# Shaxsiy ma'lumot — faqat egasi o'qiydi (macOS rsync --chmod ni qo'llamaydi)
find "$DEST" -maxdepth 1 -type f -name '*.gz' -exec chmod 600 {} +

status=0
new=0
while IFS= read -r file; do
  grep -qxF "$file" "$before" && continue
  new=$((new + 1))
  if gzip -t "$DEST/$file" 2>/dev/null; then
    log "OK  $file ($(du -h "$DEST/$file" | cut -f1))"
  else
    mv "$DEST/$file" "$DEST/corrupt-$file"
    log "BUZUQ $file — corrupt- nomi bilan ajratildi"
    status=1
  fi
done < <(find "$DEST" -maxdepth 1 -type f -name '*.gz' ! -name 'corrupt-*' -exec basename {} \; | sort)

# Bu yerdagi eski nusxalar (serverga ta'sir qilmaydi)
removed=$(find "$DEST" -maxdepth 1 -type f -name '*.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')

latest="$(ls -t "$DEST"/crm-*.sql.gz 2>/dev/null | head -1 || true)"
log "Tugadi: yangi $new ta, eskirgan $removed ta o'chirildi; oxirgi baza nusxasi: ${latest:+$(basename "$latest")}"
exit "$status"
