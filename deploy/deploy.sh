#!/usr/bin/env bash
# =====================================================================
# Serverdagi deploy skripti — GitHub Actions SSH orqali shuni chaqiradi.
#
#   ./deploy/deploy.sh                # origin/main dagi oxirgi commit
#   ./deploy/deploy.sh <commit-sha>   # aniq commit (Actions shu ko'rinishda chaqiradi)
#
# Tartib:
#   1. git fetch va maqsad commitni aniqlash (oldingi commit eslab qolinadi)
#   2. docker image'larni yig'ish — ilova hali eski versiyada ishlab turadi
#   3. migratsiyadan oldin baza zaxirasi
#   4. prisma migrate deploy + ruxsatlarni moslash (ilova qayta ishga tushishidan OLDIN)
#   5. konteynerlarni yangi image'lar bilan almashtirish
#   6. sog'liq tekshiruvi; muvaffaqiyatsiz bo'lsa — oldingi commitga avtomatik qaytish
#
# Bazaga tegadigan xavfli buyruqlar (down -v, volume rm) bu skriptda YO'Q:
# postgres konteyneri va crm_pgdata volume'i deploy paytida o'zgarmaydi.
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
BRANCH="${DEPLOY_BRANCH:-main}"
STATE_DIR="${STATE_DIR:-$APP_DIR/.deploy}"
HEALTH_RETRIES="${HEALTH_RETRIES:-40}"
HEALTH_DELAY="${HEALTH_DELAY:-3}"
KEEP_IMAGE_HOURS="${KEEP_IMAGE_HOURS:-168}"

mkdir -p "$STATE_DIR"

say() { printf '\n\033[1m[%s] %s\033[0m\n' "$(date '+%F %T')" "$1"; }
warn() { printf '\n\033[33m[%s] %s\033[0m\n' "$(date '+%F %T')" "$1"; }
die() { printf '\n\033[31m[%s] XATO: %s\033[0m\n' "$(date '+%F %T')" "$1" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE topilmadi. docs/CI-CD.md, 2-bo'limga qarang."
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE topilmadi."

# Bir vaqtda ikki deploy ketmasligi uchun qulf (Linux serverda flock mavjud)
if command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || die "Boshqa deploy ketmoqda — keyinroq urinib ko'ring."
fi

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Sog'liq tekshiruvi uchun port (secretlar env'ga yuklanmaydi — faqat shu qiymat olinadi)
HTTP_PORT="$(sed -n 's/^HTTP_PORT=//p' "$ENV_FILE" | tail -1)"
HEALTH_URL="http://127.0.0.1:${HTTP_PORT:-8080}/api/health"

healthy() {
  curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"database":"up"'
}

wait_healthy() {
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if healthy; then
      say "Sog'liq tekshiruvi o'tdi ($i-urinish): $HEALTH_URL"
      return 0
    fi
    sleep "$HEALTH_DELAY"
  done
  return 1
}

# --- 1. Maqsad commit ---------------------------------------------------
git fetch --prune --tags origin
TARGET_INPUT="${1:-origin/$BRANCH}"
TARGET="$(git rev-parse --verify "${TARGET_INPUT}^{commit}")" || die "Commit topilmadi: $TARGET_INPUT"
PREVIOUS="$(git rev-parse HEAD)"

if [ "$TARGET" = "$PREVIOUS" ] && [ "${FORCE:-}" != "yes" ] && healthy; then
  say "Kod allaqachon shu commitda va ilova sog'lom: ${TARGET:0:8}. FORCE=yes bilan majburlash mumkin."
  exit 0
fi

say "Deploy: ${PREVIOUS:0:8} → ${TARGET:0:8}"
git log --oneline -1 "$TARGET" || true

git checkout "$BRANCH" >/dev/null 2>&1 || git checkout -B "$BRANCH" >/dev/null 2>&1
git reset --hard "$TARGET"

# --- 2. Image'larni yig'ish (ilova hali ishlab turadi) ------------------
say "Image'lar yig'ilmoqda..."
if ! dc build; then
  warn "Build muvaffaqiyatsiz — kod oldingi commitga qaytariladi, ishlab turgan ilovaga tegilmadi."
  git reset --hard "$PREVIOUS"
  die "Build xatosi. Ilova eski versiyada ishlashda davom etmoqda."
fi

# --- 3. Migratsiyadan oldin zaxira -------------------------------------
say "Migratsiyadan oldin baza zaxirasi..."
BACKUP_BEFORE=""
if ./scripts/backup-db.sh; then
  BACKUP_BEFORE="$(ls -t backups/crm-*.sql.gz 2>/dev/null | head -1 || true)"
else
  warn "Zaxira olinmadi (baza hali ishga tushmagan bo'lishi mumkin) — davom etamiz."
fi

# --- 4. Migratsiyalar (ilova qayta ishga tushishidan oldin) ------------
say "Prisma migratsiyalari va ruxsatlarni moslash..."
if ! dc run --rm migrate; then
  warn "Migratsiya muvaffaqiyatsiz — kod oldingi commitga qaytariladi."
  git reset --hard "$PREVIOUS"
  [ -n "$BACKUP_BEFORE" ] && warn "Baza zaxirasi: $BACKUP_BEFORE (kerak bo'lsa: ./scripts/restore-db.sh $BACKUP_BEFORE)"
  die "Migratsiya xatosi. Ilova eski versiyada ishlashda davom etmoqda."
fi

# --- 5. Konteynerlarni almashtirish ------------------------------------
say "Konteynerlar yangilanmoqda..."
dc up -d --no-build --remove-orphans

# --- 6. Sog'liq tekshiruvi, kerak bo'lsa orqaga qaytish ----------------
if wait_healthy; then
  SHORT="${TARGET:0:8}"
  docker image tag "sales-crm-prod-backend:latest" "crm-backend:$SHORT" 2>/dev/null || true
  docker image tag "sales-crm-prod-frontend:latest" "crm-frontend:$SHORT" 2>/dev/null || true

  printf '%s\n' "$TARGET" > "$STATE_DIR/last-good"
  printf '%s\t%s\t%s\n' "$(date '+%F %T')" "$TARGET" "ok" >> "$STATE_DIR/history.log"

  # Eski (bog'lanmagan) image'lar va build keshi — oxirgi hafta saqlanadi
  docker image prune -f --filter "until=${KEEP_IMAGE_HOURS}h" >/dev/null 2>&1 || true
  docker builder prune -f --filter "until=${KEEP_IMAGE_HOURS}h" >/dev/null 2>&1 || true

  dc ps
  say "Deploy muvaffaqiyatli: $SHORT"
  exit 0
fi

# Sog'liq tekshiruvi o'tmadi — oldingi kodga qaytamiz
warn "Sog'liq tekshiruvi o'tmadi. Loglar:"
dc logs --tail=60 backend || true

printf '%s\t%s\t%s\n' "$(date '+%F %T')" "$TARGET" "health-failed" >> "$STATE_DIR/history.log"

warn "Oldingi versiyaga qaytilmoqda: ${PREVIOUS:0:8}"
git reset --hard "$PREVIOUS"
dc build && dc up -d --no-build --remove-orphans

if wait_healthy; then
  printf '%s\t%s\t%s\n' "$(date '+%F %T')" "$PREVIOUS" "rolled-back" >> "$STATE_DIR/history.log"
  [ -n "$BACKUP_BEFORE" ] && warn "Migratsiyadan oldingi zaxira: $BACKUP_BEFORE"
  die "Yangi versiya ishlamadi — oldingi versiya (${PREVIOUS:0:8}) tiklandi va CRM ishlayapti."
fi

[ -n "$BACKUP_BEFORE" ] && warn "Baza zaxirasi: $BACKUP_BEFORE → ./scripts/restore-db.sh $BACKUP_BEFORE"
die "Oldingi versiya ham sog'liq tekshiruvidan o'tmadi. Loglarni ko'ring: dc logs backend"
