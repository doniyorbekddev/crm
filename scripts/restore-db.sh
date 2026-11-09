#!/usr/bin/env bash
# =====================================================================
# Zaxira nusxadan tiklash. DIQQAT: joriy ma'lumotlar almashtiriladi!
#
# Ishlatish:  ./scripts/restore-db.sh backups/crm-2026-09-12_03-00.sql.gz
#
# Tartib:
#   1. Dump tekshiriladi — backend HALI ISHLAB TURGANIDA. Mos kelmasa rad etiladi va hech narsaga
#      tegilmaydi:
#        - gzip arxivi butun;
#        - ichida pg_dump'ning oddiy SQL formati (custom format "PGDMP" — pg_restore uchun, bu skript uchun emas);
#        - dump oxirigacha yozilgan (yakunlovchi satr oxirgi qatorlar orasida);
#        - CRM bazasi (`_prisma_migrations` jadvali bor);
#        - `--clean --if-exists` bilan olingan: har bir CREATE TABLE dan OLDIN o'sha jadval uchun
#          DROP TABLE IF EXISTS bor. Busiz dump mavjud bazaga "already exists" bilan yiqiladi.
#   2. "ha" tasdig'i so'raladi.
#   3. Backend to'xtatiladi; tiklash BITTA TRANZAKSIYADA (`--single-transaction`) — xato bo'lsa
#      baza avvalgi holatida qoladi.
#   4. Tiklangan baza tekshiriladi: jadvallar soni, migratsiyalar soni dumpdagi bilan teng,
#      tugallanmagan migratsiya yo'q.
#   5. Backend skript qanday tugashidan qat'i nazar (xato, Ctrl+C) qayta ishga tushiriladi va
#      holati tekshiriladi (healthcheck bo'lsa — healthy, aks holda running).
#
# Chiqish kodlari:
#   0 — tiklandi, tekshiruvdan o'tdi, backend ishlayapti
#   1 — rad etildi (dump, sozlama yoki tasdiq) — baza va backend'ga tegilmagan
#   2 — tiklash xatosi — tranzaksiya bekor qilindi, baza avvalgi holatida, backend qayta ishga tushirildi
#   3 — backend qayta ishga tushmadi — QO'LDA ARALASHUV KERAK (tiklash natijasi alohida yoziladi)
#   4 — tiklandi, lekin tekshiruvdan o'tmadi — backend qayta ishga tushirildi
#
# Sozlamalar (muhit o'zgaruvchisi):
#   ENV_FILE, COMPOSE_FILE      standart: .env.production, docker-compose.prod.yml
#   RESTORE_BACKEND_WAIT=120    backend sog'lom bo'lishini kutish, soniya
#
# To'liq tartib: docs/CRM-4.0-BACKUP-RECOVERY.md §5
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_WAIT="${RESTORE_BACKEND_WAIT:-120}"
DUMP="${1:-}"

log() { echo "[$(date '+%F %T')] $*"; }
err() { echo "[$(date '+%F %T')] XATO: $*" >&2; }
# Backend to'xtatilishidan oldingi rad etish — hech narsa o'zgarmagan
reject() {
  err "$*"
  err "Tiklash rad etildi — baza va backend'ga tegilmadi."
  exit 1
}

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Ishlatish: $0 <backups/crm-YYYY-MM-DD_HH-MM.sql.gz>" >&2
  exit 1
fi

[ -f "$ENV_FILE" ] || reject "$ENV_FILE topilmadi"
# Env fayl BAJARILMAYDI (`source` emas) — faqat kerakli kalitlar matn sifatida o'qiladi.
# Sababi va qoidalari: scripts/lib/env.sh
# shellcheck source=scripts/lib/env.sh
source "$(dirname "$0")/lib/env.sh"
env_load "$ENV_FILE" POSTGRES_USER POSTGRES_DB HTTP_PORT
[ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ] || reject "$ENV_FILE da POSTGRES_USER yoki POSTGRES_DB topilmadi"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# ---------------------------------------------------------------------
# 1. Dumpni tekshirish (backend hali ishlayapti)
# ---------------------------------------------------------------------
gzip -t "$DUMP" 2>/dev/null || reject "arxiv buzilgan yoki gzip emas: $DUMP"

# Bitta o'qishda hamma belgilar yig'iladi — `head`/`grep -q` bilan quvurni erta yopish pipefail ostida
# gunzip'ni SIGPIPE bilan "xato" qilib ko'rsatadi, shuning uchun fayl oxirigacha o'qiladi.
#   header   — pg_dump oddiy SQL sarlavhasi birinchi 20 qatorda
#   custom   — custom format (birinchi qator "PGDMP")
#   creates  — CREATE TABLE soni
#   missing  — oldinroq DROP TABLE IF EXISTS'i bo'lmagan CREATE TABLE soni
#   prisma   — _prisma_migrations jadvali bor
#   migrows  — _prisma_migrations COPY blokidagi qatorlar
#   complete — yakunlovchi satr qatori; last — jami qatorlar
if ! STATS="$(gunzip -c "$DUMP" | LC_ALL=C awk '
  NR == 1 && /^PGDMP/ { custom = 1 }
  NR <= 20 && /^-- PostgreSQL database dump$/ { header = 1 }
  /^DROP TABLE IF EXISTS / { name = $5; sub(/;$/, "", name); dropped[name] = 1 }
  /^CREATE TABLE / {
    creates++
    if (!($3 in dropped)) missing++
    if ($3 == "public._prisma_migrations") prisma = 1
  }
  inmig && $0 == "\\." { inmig = 0 }
  inmig { migrows++ }
  /^COPY public\._prisma_migrations / { inmig = 1 }
  /^-- PostgreSQL database dump complete$/ { complete = NR }
  END { printf "%d %d %d %d %d %d %d %d\n", header, custom, creates, missing, prisma, migrows, complete, NR }
')"; then
  reject "arxivni o'qib bo'lmadi: $DUMP"
fi
read -r D_HEADER D_CUSTOM D_CREATES D_MISSING D_PRISMA D_MIGROWS D_COMPLETE D_LINES <<<"$STATS"

[ "$D_CUSTOM" = "0" ] || reject "bu pg_dump custom formati (PGDMP) — skript faqat oddiy SQL nusxani (pg_dump | gzip) tiklaydi"
[ "$D_HEADER" = "1" ] || reject "bu pg_dump SQL nusxasi emas (sarlavha topilmadi): $DUMP"
if [ "$D_COMPLETE" -eq 0 ] || [ $((D_LINES - D_COMPLETE)) -gt 20 ]; then
  reject "dump to'liq emas — pg_dump yakunlovchi satri yo'q (uzilgan nusxa)"
fi
[ "$D_CREATES" -gt 0 ] || reject "dumpda birorta ham jadval yo'q"
[ "$D_PRISMA" = "1" ] || reject "bu CRM bazasining nusxasi emas (_prisma_migrations jadvali yo'q)"
if [ "$D_MISSING" -gt 0 ]; then
  reject "$D_MISSING/$D_CREATES jadval uchun oldinroq 'DROP TABLE IF EXISTS' yo'q — nusxa pg_dump --clean --if-exists bilan olinmagan.
       Bunday nusxani mavjud bazaga tiklab bo'lmaydi (birinchi jadvaldayoq 'already exists').
       Bo'sh bazaga tiklash tartibi: docs/CRM-4.0-BACKUP-RECOVERY.md §5-C"
fi
log "Dump tekshiruvdan o'tdi: $D_CREATES jadval, $D_MIGROWS migratsiya yozuvi, --clean --if-exists"

[ -n "$(compose ps --status running -q postgres 2>/dev/null || true)" ] || reject "postgres xizmati ishlamayapti"
BACKEND_WAS_RUNNING=0
[ -n "$(compose ps --status running -q backend 2>/dev/null || true)" ] && BACKEND_WAS_RUNNING=1

# ---------------------------------------------------------------------
# 2. Tasdiq
# ---------------------------------------------------------------------
echo "DIQQAT: '$POSTGRES_DB' bazasidagi barcha ma'lumotlar $DUMP bilan almashtiriladi."
answer=""
read -r -p "Davom etilsinmi? (ha/yo'q) " answer || true
[ "$answer" = "ha" ] || { echo "Bekor qilindi"; exit 1; }

# ---------------------------------------------------------------------
# 3. Backend'ni to'xtatish — chiqishda har doim qayta ishga tushiriladi
# ---------------------------------------------------------------------
# Backend ishga tushdi va sog'lommi: healthcheck bo'lsa "healthy", bo'lmasa "running"
# shellcheck disable=SC2329  # trap (finish) orqali chaqiriladi
backend_up() {
  local id state deadline=$((SECONDS + BACKEND_WAIT))
  compose start backend >/dev/null || return 1
  id="$(compose ps -a -q backend 2>/dev/null || true)"
  [ -n "$id" ] || return 1
  while :; do
    state="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || echo 'missing|')"
    case "$state" in
      'running|healthy' | 'running|') return 0 ;;
      exited* | dead* | missing*) return 1 ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 2
  done
}

BACKEND_STOPPED=0
# shellcheck disable=SC2329  # EXIT trap
finish() {
  local rc=$?
  trap - EXIT
  if [ "$BACKEND_STOPPED" = "1" ]; then
    log "Backend qayta ishga tushirilmoqda (kutish ${BACKEND_WAIT}s)..."
    if backend_up; then
      log "Backend ishlayapti."
    else
      err "BACKEND QAYTA ISHGA TUSHMADI. Qo'lda: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d backend"
      err "Tiklash natijasi (chiqish kodi $rc): $([ "$rc" = 0 ] && echo 'baza tiklangan va tekshirilgan' || echo 'yuqoridagi xatoga qarang')"
      rc=3
    fi
  fi
  [ "$rc" = "0" ] && log "Tiklandi. Tekshiring: curl -s http://localhost:${HTTP_PORT:-8080}/api/health"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT TERM

if [ "$BACKEND_WAS_RUNNING" = "1" ]; then
  # Bayroq to'xtatishdan OLDIN: stop yarim yo'lda xato bersa ham chiqishda qayta ishga tushiriladi
  BACKEND_STOPPED=1
  log "Backend to'xtatilmoqda — tiklash paytida yozuv bo'lmasligi uchun"
  compose stop backend >/dev/null
else
  log "Backend ishlamayapti — to'xtatish va qayta ishga tushirish kerak emas"
fi

# ---------------------------------------------------------------------
# 4. Tiklash — bitta tranzaksiya
# ---------------------------------------------------------------------
log "Tiklanmoqda (bitta tranzaksiya; xato bo'lsa baza o'zgarmaydi)..."
set +e
gunzip -c "$DUMP" | compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
if [ "${PIPE_STATUS[0]}" != "0" ] || [ "${PIPE_STATUS[1]}" != "0" ]; then
  err "tiklash xatosi (gunzip=${PIPE_STATUS[0]}, psql=${PIPE_STATUS[1]}) — tranzaksiya bekor qilindi, baza avvalgi holatida"
  exit 2
fi

# ---------------------------------------------------------------------
# 5. Tiklangan bazani tekshirish
# ---------------------------------------------------------------------
scalar() { compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq -c "$1" 2>/dev/null | tr -d '[:space:]' || true; }
TABLES="$(scalar "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
MIGRATIONS="$(scalar "SELECT count(*) FROM _prisma_migrations;")"
UNFINISHED="$(scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;")"
log "Tiklangan baza: jadvallar ${TABLES:-?} (dumpda $D_CREATES), migratsiya yozuvlari ${MIGRATIONS:-?} (dumpda $D_MIGROWS), tugallanmagan ${UNFINISHED:-?}"

VERIFY_OK=1
if ! [[ "${TABLES:-}" =~ ^[0-9]+$ ]] || [ "$TABLES" -lt "$D_CREATES" ]; then
  err "jadvallar soni dumpdagidan kam"; VERIFY_OK=0
elif [ "$TABLES" -gt "$D_CREATES" ]; then
  # --clean faqat dumpdagi jadvallarni almashtiradi; nusxadan keyin qo'shilgan jadvallar qoladi
  log "OGOHLANTIRISH: bazada dumpda yo'q $((TABLES - D_CREATES)) ta jadval bor (nusxadan keyingi migratsiya) — ular o'zgarmadi"
fi
if [ "${MIGRATIONS:-}" != "$D_MIGROWS" ]; then
  err "migratsiya yozuvlari soni dumpdagidan farq qiladi"; VERIFY_OK=0
fi
if [ "${UNFINISHED:-}" != "0" ]; then
  err "tugallanmagan migratsiya bor"; VERIFY_OK=0
fi
[ "$VERIFY_OK" = "1" ] || { err "tiklangan baza tekshiruvdan o'tmadi"; exit 4; }
log "Tiklangan baza tekshiruvdan o'tdi."
exit 0
