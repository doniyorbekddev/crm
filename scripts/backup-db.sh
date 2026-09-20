#!/usr/bin/env bash
# =====================================================================
# PostgreSQL zaxira nusxasi (docker compose stack uchun).
#
# Qo'lda:   ./scripts/backup-db.sh
# Cron:     0 3 * * * cd /opt/sales-crm && ./scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
#
# Natija:   backups/crm-2026-09-12_03-00.sql.gz  (30 kundan eskilari o'chiriladi)
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Xatolik: $ENV_FILE topilmadi" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H-%M)"
FILE="$BACKUP_DIR/crm-$STAMP.sql.gz"

echo "[$(date '+%F %T')] Zaxira boshlandi: $FILE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date '+%F %T')] Tayyor: $FILE ($SIZE)"

# Eski nusxalarni tozalash
find "$BACKUP_DIR" -name 'crm-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] $KEEP_DAYS kundan eski nusxalar o'chirildi"
