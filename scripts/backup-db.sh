#!/usr/bin/env bash
# =====================================================================
# Zaxira nusxa (docker compose stack uchun): PostgreSQL bazasi + yuklangan fayllar.
#
# Qo'lda:   ./scripts/backup-db.sh
# Cron:     0 3 * * * cd /opt/sales-crm && ./scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
#
# Natija:   backups/crm-2026-09-12_03-00.sql.gz       (baza; KEEP_DAYS kundan eskilari o'chiriladi)
#           backups/uploads-2026-09-12_03-00.tar.gz   (cheklar, hujjatlar; UPLOADS_KEEP_DAYS)
#
# Sozlamalar (muhit o'zgaruvchisi yoki .env.production):
#   KEEP_DAYS=30            baza nusxalarini saqlash muddati
#   UPLOADS_KEEP_DAYS=7     fayl arxivlarini saqlash muddati (har biri to'liq nusxa — joy oladi)
#   BACKUP_UPLOADS=1        0 — fayllar arxivlanmaydi
#   BACKUP_REMOTE=          rsync manzili (masalan backup@10.0.0.5:/srv/crm-backups). Berilsa, yangi
#                           nusxalar shu yerga ham ko'chiriladi. BERILMASA NUSXA FAQAT SHU SERVERDA
#                           QOLADI — disk ishdan chiqsa zaxira ham yo'qoladi.
#
# Chiqish kodi: 0 — baza nusxasi tayyor va tekshirilgan; 1 — nusxa olinmadi yoki tashqi manzilga
# ko'chirilmadi (yarim yozilgan fayl qoldirilmaydi).
#
# Bu skript nusxaning TIKLANISHINI tekshirmaydi — buning uchun: ./scripts/verify-backup.sh
# To'liq tartib: docs/CRM-4.0-BACKUP-RECOVERY.md
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Xatolik: $ENV_FILE topilmadi" >&2
  exit 1
fi

# Env fayl BAJARILMAYDI (`source` emas) — faqat kerakli kalitlar matn sifatida o'qiladi.
# Sababi va qoidalari: scripts/lib/env.sh
# shellcheck source=scripts/lib/env.sh
source "$(dirname "$0")/lib/env.sh"
env_load "$ENV_FILE" POSTGRES_USER POSTGRES_DB KEEP_DAYS UPLOADS_KEEP_DAYS BACKUP_UPLOADS BACKUP_REMOTE MIN_BYTES
[ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ] || { echo "Xatolik: $ENV_FILE da POSTGRES_USER yoki POSTGRES_DB topilmadi" >&2; exit 1; }

KEEP_DAYS="${KEEP_DAYS:-30}"
UPLOADS_KEEP_DAYS="${UPLOADS_KEEP_DAYS:-7}"
BACKUP_UPLOADS="${BACKUP_UPLOADS:-1}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
# Bundan kichik dump — bo'sh yoki uzilgan deb hisoblanadi
MIN_BYTES="${MIN_BYTES:-1024}"

log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "XATOLIK: $*" >&2; exit 1; }
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Zaxirada parol xeshlari va shaxsiy ma'lumot bor: katalog faqat egasiga (700), fayllar 600
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H-%M)"
FILE="$BACKUP_DIR/crm-$STAMP.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
PARTIAL="$FILE.partial"
UPLOADS_PARTIAL="$UPLOADS_FILE.partial"

# Har qanday xatoda yarim yozilgan fayl o'chiriladi — "nusxa bor" degan yolg'on taassurot qolmasin
trap 'rm -f "$PARTIAL" "$UPLOADS_PARTIAL"' EXIT

# ---------------------------------------------------------------------
# 1. Baza
# ---------------------------------------------------------------------
log "Zaxira boshlandi: $FILE"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$PARTIAL"

gzip -t "$PARTIAL" || fail "arxiv buzilgan (gzip tekshiruvidan o'tmadi)"
BYTES="$(wc -c < "$PARTIAL" | tr -d ' ')"
[ "$BYTES" -ge "$MIN_BYTES" ] || fail "dump juda kichik ($BYTES bayt) — bo'sh yoki uzilgan"
# pg_dump ishini to'liq tugatganda oxiriga shu satrni yozadi; bo'lmasa — dump yarim yo'lda uzilgan.
# Satr eng oxirida emas (yangi versiyalar undan keyin `\unrestrict` qo'shadi), shuning uchun oxirgi 20 qator qaraladi.
gunzip -c "$PARTIAL" | tail -n 20 | grep -q 'PostgreSQL database dump complete' || fail "dump to'liq emas (yakunlovchi satr yo'q)"

mv "$PARTIAL" "$FILE"
log "Baza nusxasi tayyor: $FILE ($(du -h "$FILE" | cut -f1))"

# ---------------------------------------------------------------------
# 2. Yuklangan fayllar (cheklar, hujjatlar) — bazada ularning faqat yo'li saqlanadi
# ---------------------------------------------------------------------
UPLOADS_DONE=0
if [ "$BACKUP_UPLOADS" = "1" ]; then
  if [ -n "$(compose ps -q backend 2>/dev/null || true)" ]; then
    # Siqish shu tomonda (tar ichidagi -z emas): chiqish toza gzip oqimi bo'ladi, tar xatosi esa pipefail orqali ushlanadi
    compose exec -T backend tar -cf - -C /app/uploads . | gzip -6 > "$UPLOADS_PARTIAL" || fail "fayllar arxivlanmadi"
    gzip -t "$UPLOADS_PARTIAL" || fail "fayllar arxivi buzilgan"
    mv "$UPLOADS_PARTIAL" "$UPLOADS_FILE"
    UPLOADS_DONE=1
    log "Fayllar arxivi tayyor: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
  else
    log "OGOHLANTIRISH: backend konteyneri ishlamayapti — yuklangan fayllar ZAXIRALANMADI"
  fi
fi

# ---------------------------------------------------------------------
# 3. Tashqi nusxa
# ---------------------------------------------------------------------
if [ -n "$BACKUP_REMOTE" ]; then
  command -v rsync >/dev/null 2>&1 || fail "BACKUP_REMOTE berilgan, lekin rsync o'rnatilmagan"
  TO_COPY=("$FILE")
  [ "$UPLOADS_DONE" = "1" ] && TO_COPY+=("$UPLOADS_FILE")
  # BatchMode: parol so'ramaydi (cron ostida osilib qolmasin) — kalit oldindan sozlangan bo'lishi shart
  rsync -a --partial -e "ssh -o BatchMode=yes" "${TO_COPY[@]}" "$BACKUP_REMOTE/" || fail "tashqi manzilga ko'chirilmadi: $BACKUP_REMOTE"
  log "Tashqi nusxa ko'chirildi: $BACKUP_REMOTE"
else
  log "OGOHLANTIRISH: BACKUP_REMOTE sozlanmagan — nusxa faqat shu serverda (disk ishdan chiqsa yo'qoladi)"
fi

# ---------------------------------------------------------------------
# 4. Eski nusxalarni tozalash (faqat yangi nusxa muvaffaqiyatli olingandan keyin)
# ---------------------------------------------------------------------
find "$BACKUP_DIR" -name 'crm-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -type f -mtime "+$UPLOADS_KEEP_DAYS" -delete
log "Tozalandi: baza nusxalari $KEEP_DAYS kundan, fayl arxivlari $UPLOADS_KEEP_DAYS kundan eskilari"
