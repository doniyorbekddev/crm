#!/usr/bin/env bash
# =====================================================================
# Zaxira nusxani **tiklab ko'rib** tekshirish.
#
# Nega kerak: zaxira olinayotgani uning tiklanishini bildirmaydi. Fayl yarim
# yozilgan, gzip buzilgan yoki dump bo'sh bo'lishi mumkin — buni faqat haqiqiy
# tiklash ko'rsatadi. Shuning uchun bu skript nusxani **vaqtinchalik bazaga**
# tiklaydi, ichidagini sanaydi va bazani o'chirib tashlaydi.
#
# Ishchi baza **hech qachon tegilmaydi**: tiklash faqat yangi yaratilgan
# `crm_verify_<vaqt>` bazasiga boradi va skript oxirida o'sha baza o'chiriladi.
#
# Ishlatish:
#   ./scripts/verify-backup.sh                       # eng oxirgi nusxa
#   ./scripts/verify-backup.sh backups/crm-....sql.gz
#
# Cron (haftada bir, zaxiradan keyin):
#   0 4 * * 1 cd /opt/sales-crm && ./scripts/verify-backup.sh >> /var/log/crm-backup.log 2>&1
#
# Chiqish kodi: 0 — nusxa tiklandi va tekshiruvdan o'tdi, 1 — muammo bor.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
# Nusxada kamida shuncha qator bo'lishi kutiladi (bo'sh dump "muvaffaqiyatli" ko'rinmasin)
MIN_USERS="${MIN_USERS:-1}"

# ---------------------------------------------------------------------
# Muhit: serverda docker compose, ishlab chiqishda mahalliy psql
# ---------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

USE_DOCKER=0
if [ -f "$COMPOSE_FILE" ] && command -v docker >/dev/null 2>&1 &&
   [ -n "$(docker compose -f "$COMPOSE_FILE" ps -q postgres 2>/dev/null || true)" ]; then
  USE_DOCKER=1
fi

if [ "$USE_DOCKER" = "0" ]; then
  # Mahalliy rejim: ulanish ma'lumoti backend/.env dagi DATABASE_URL dan olinadi
  if [ -z "${DATABASE_URL:-}" ] && [ -f backend/.env ]; then
    DATABASE_URL="$(grep -m1 '^DATABASE_URL' backend/.env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "Xatolik: na docker compose postgres ishlayapti, na DATABASE_URL topildi" >&2
    exit 1
  fi
  NO_DB="${DATABASE_URL%%\?*}"                 # ?schema=... qismini olib tashlash
  POSTGRES_DB="${POSTGRES_DB:-${NO_DB##*/}}"
  BASE_DSN="${NO_DB%/*}"                       # postgresql://user:pass@host:port
fi

# Vaqtinchalik bazada `psql` ishga tushirish
psql_run() {
  local database="$1"; shift
  if [ "$USE_DOCKER" = "1" ]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$database" "$@"
  else
    psql "$BASE_DSN/$database" "$@"
  fi
}

# ---------------------------------------------------------------------
# Tekshiriladigan nusxa
# ---------------------------------------------------------------------
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -t "$BACKUP_DIR"/crm-*.sql.gz 2>/dev/null | head -1 || true)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Xatolik: tekshirish uchun nusxa topilmadi ($BACKUP_DIR/crm-*.sql.gz)" >&2
  exit 1
fi

echo "[$(date '+%F %T')] Tekshirilayotgan nusxa: $DUMP ($(du -h "$DUMP" | cut -f1))"

# Arxivning o'zi butunmi — buzilgan gzip shu yerda ushlanadi
if ! gzip -t "$DUMP" 2>/dev/null; then
  echo "XATO: arxiv buzilgan (gzip -t o'tmadi): $DUMP" >&2
  exit 1
fi

VERIFY_DB="crm_verify_$(date +%Y%m%d%H%M%S)_$$"
if [ "$VERIFY_DB" = "${POSTGRES_DB:-}" ]; then
  echo "XATO: vaqtinchalik baza nomi ishchi baza bilan bir xil — to'xtatildi" >&2
  exit 1
fi

# Skript qanday tugasa ham vaqtinchalik baza o'chiriladi
cleanup() {
  psql_run postgres -q -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" >/dev/null 2>&1 || true
  echo "[$(date '+%F %T')] Vaqtinchalik baza o'chirildi: $VERIFY_DB"
}
trap cleanup EXIT

echo "[$(date '+%F %T')] Vaqtinchalik baza: $VERIFY_DB"
psql_run postgres -q -c "CREATE DATABASE \"$VERIFY_DB\";"

echo "[$(date '+%F %T')] Tiklanmoqda..."
if [ "$USE_DOCKER" = "1" ]; then
  gunzip -c "$DUMP" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$VERIFY_DB" -v ON_ERROR_STOP=1 -q >/dev/null
else
  gunzip -c "$DUMP" | psql "$BASE_DSN/$VERIFY_DB" -v ON_ERROR_STOP=1 -q >/dev/null
fi

# ---------------------------------------------------------------------
# Tiklangan baza haqiqatdan ishlatsa bo'ladiganmi
# ---------------------------------------------------------------------
# So'rov xato bersa bo'sh qaytaradi: bo'sh yoki nomukammal nusxada ham skript
# psql xatosi bilan emas, quyidagi tushunarli tekshiruvlar bilan to'xtasin.
scalar() { psql_run "$VERIFY_DB" -t -A -c "$1" 2>/dev/null | tr -d '[:space:]' || true; }

TABLES="$(scalar "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"; TABLES="${TABLES:-0}"
USERS="$(scalar "SELECT count(*) FROM users;")"; USERS="${USERS:-0}"
MIGRATIONS="$(scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")"; MIGRATIONS="${MIGRATIONS:-0}"
FAILED="$(scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL;")"; FAILED="${FAILED:-0}"
LAST_MIGRATION="$(scalar "SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1;")"

echo "  jadvallar:            $TABLES"
echo "  foydalanuvchilar:     $USERS"
echo "  bajarilgan migratsiya: $MIGRATIONS (oxirgisi: $LAST_MIGRATION)"

STATUS=0

if [ "${TABLES:-0}" -lt 20 ]; then
  echo "XATO: jadvallar soni juda kam ($TABLES) — nusxa to'liq emas" >&2
  STATUS=1
fi

if [ "${USERS:-0}" -lt "$MIN_USERS" ]; then
  echo "XATO: foydalanuvchilar soni $USERS (kutilgani: kamida $MIN_USERS) — nusxa bo'sh" >&2
  STATUS=1
fi

if [ "${FAILED:-0}" -gt 0 ]; then
  echo "XATO: $FAILED ta tugallanmagan migratsiya bor — baza nomukammal holatda" >&2
  STATUS=1
fi

# Koddagi oxirgi migratsiya nusxada ham bormi — zaxira eski sxemada qolib ketmasin
NEWEST_LOCAL="$(ls -1 backend/prisma/migrations 2>/dev/null | grep -v migration_lock | sort | tail -1 || true)"
if [ -n "$NEWEST_LOCAL" ] && [ "$NEWEST_LOCAL" != "$LAST_MIGRATION" ]; then
  echo "OGOHLANTIRISH: nusxadagi oxirgi migratsiya '$LAST_MIGRATION', koddagi '$NEWEST_LOCAL'."
  echo "               Nusxa oxirgi deploydan oldin olingan bo'lishi mumkin."
fi

if [ "$STATUS" = "0" ]; then
  echo "[$(date '+%F %T')] NATIJA: nusxa tiklandi va tekshiruvdan o'tdi ✓"
else
  echo "[$(date '+%F %T')] NATIJA: nusxada muammo bor ✗" >&2
fi

exit "$STATUS"
