#!/usr/bin/env bash
# =====================================================================
# Zaxira nusxadan tiklash. DIQQAT: joriy ma'lumotlar o'chiriladi!
#
# Ishlatish:  ./scripts/restore-db.sh backups/crm-2026-09-12_03-00.sql.gz
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DUMP="${1:-}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Ishlatish: $0 <backups/crm-YYYY-MM-DD_HH-MM.sql.gz>" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

echo "DIQQAT: '$POSTGRES_DB' bazasidagi barcha ma'lumotlar $DUMP bilan almashtiriladi."
read -r -p "Davom etilsinmi? (ha/yo'q) " answer
[ "$answer" = "ha" ] || { echo "Bekor qilindi"; exit 1; }

# Backend to'xtatiladi — tiklash paytida yozuv bo'lmasligi uchun
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop backend

gunzip -c "$DUMP" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start backend
echo "Tiklandi. Tekshiring: curl -s http://localhost:\${HTTP_PORT:-8080}/api/health"
