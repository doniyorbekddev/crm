#!/usr/bin/env bash
# =====================================================================
# Qo'lda orqaga qaytish (rollback).
#
#   ./deploy/rollback.sh             # oxirgi muvaffaqiyatli deploy commitiga
#   ./deploy/rollback.sh HEAD~1      # bitta commit orqaga
#   ./deploy/rollback.sh a1b2c3d     # aniq commitga
#
# Nima qiladi: kodni ko'rsatilgan commitga qaytaradi, image'larni qayta yig'adi
# (build keshi bor — tez) va konteynerlarni almashtiradi. Migratsiyalarni ORQAGA
# QAYTARMAYDI: Prisma migratsiyalari faqat oldinga qo'llanadi. Agar sxema
# o'zgarishi mos kelmasa, baza zaxirasidan tiklash kerak:
#
#   ./scripts/restore-db.sh backups/crm-<sana>.sql.gz
# =====================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

# Skript git reset paytida o'zi almashishi mumkin (bash faylni bo'lak-bo'lak o'qiydi),
# shuning uchun vaqtinchalik nusxadan ishlaymiz.
if [ -z "${DEPLOY_SELF_COPY:-}" ]; then
  _copy="$(mktemp -t crm-deploy.XXXXXX)"
  cat "$0" > "$_copy"
  DEPLOY_SELF_COPY=1 APP_DIR="$APP_DIR" exec bash "$_copy" "$@"
fi
trap 'rm -f -- "$0"' EXIT

cd "$APP_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STATE_DIR="${STATE_DIR:-$APP_DIR/.deploy}"
HEALTH_RETRIES="${HEALTH_RETRIES:-40}"
HEALTH_DELAY="${HEALTH_DELAY:-3}"

say() { printf '\n\033[1m[%s] %s\033[0m\n' "$(date '+%F %T')" "$1"; }
die() { printf '\n\033[31mXATO: %s\033[0m\n' "$1" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

TARGET_INPUT="${1:-}"
if [ -z "$TARGET_INPUT" ]; then
  [ -f "$STATE_DIR/last-good" ] || die "Oxirgi muvaffaqiyatli commit yozuvi yo'q. Commitni qo'lda ko'rsating."
  TARGET_INPUT="$(cat "$STATE_DIR/last-good")"
fi

TARGET="$(git rev-parse --verify "${TARGET_INPUT}^{commit}")" || die "Commit topilmadi: $TARGET_INPUT"
CURRENT="$(git rev-parse HEAD)"

say "Qaytish: ${CURRENT:0:8} → ${TARGET:0:8}"
git log --oneline -1 "$TARGET"

git reset --hard "$TARGET"
dc build
dc up -d --no-build --remove-orphans

HTTP_PORT="$(sed -n 's/^HTTP_PORT=//p' "$ENV_FILE" | tail -1)"
HEALTH_URL="http://127.0.0.1:${HTTP_PORT:-8080}/api/health"

for ((i = 1; i <= HEALTH_RETRIES; i++)); do
  if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"database":"up"'; then
    printf '%s\t%s\t%s\n' "$(date '+%F %T')" "$TARGET" "manual-rollback" >> "$STATE_DIR/history.log"
    say "Tayyor: ${TARGET:0:8} versiyasi ishlayapti."
    exit 0
  fi
  sleep "$HEALTH_DELAY"
done

dc logs --tail=60 backend || true
die "Sog'liq tekshiruvi o'tmadi. Sxema mos kelmasa zaxiradan tiklang: ./scripts/restore-db.sh backups/<fayl>"
