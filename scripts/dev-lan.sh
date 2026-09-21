#!/usr/bin/env bash
# =====================================================================
# Development serverni lokal tarmoqqa ochib ishga tushiradi —
# bir kompyuter "server" bo'lib turadi, qolgan qurilmalar (telefon, noutbuk)
# shu tarmoq orqali CRM ga kiradi.
#
#   npm run dev:lan
#
# Nima qiladi:
#   - kompyuterning tarmoqdagi IP manzilini aniqlaydi;
#   - Vite'ni 0.0.0.0 ga bog'laydi (--host), ya'ni tashqi qurilmalar ham ko'radi;
#   - frontend API manzilini shu IP ga qaratadi (VITE_API_URL);
#   - backend CORS ro'yxatiga ham localhost, ham IP manzilini qo'shadi.
#
# DIQQAT: bu development rejimi — faqat ishonchli lokal tarmoq (ofis Wi-Fi) uchun.
# Internetga chiqarish uchun docs/CI-CD.md va docs/HOSTING-VA-DOMEN.md ga qarang.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Tarmoq IP manzili (Wi-Fi yoki Ethernet)
detect_ip() {
  if [ -n "${LAN_IP:-}" ]; then printf '%s' "$LAN_IP"; return; fi
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { printf '%s' "$ip"; return; }
  done
  # Linux zaxira varianti
  hostname -I 2>/dev/null | awk '{print $1}'
}

IP="$(detect_ip)"
if [ -z "$IP" ]; then
  echo "Tarmoq IP manzili aniqlanmadi. Wi-Fi/Ethernet ulanganini tekshiring yoki qo'lda bering:" >&2
  echo "  LAN_IP=192.168.0.10 npm run dev:lan" >&2
  exit 1
fi

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-4000}"

cat <<INFO

  CRM lokal tarmoqda ishga tushmoqda

  Shu kompyuterda:        http://localhost:$FRONTEND_PORT
  Boshqa qurilmalardan:   http://$IP:$FRONTEND_PORT
  API:                    http://$IP:$BACKEND_PORT/api

  Qurilmalar bitta Wi-Fi tarmoqda bo'lishi shart.
  To'xtatish: Ctrl+C

INFO

export CLIENT_URL="http://localhost:$FRONTEND_PORT,http://$IP:$FRONTEND_PORT"
export VITE_API_URL="http://$IP:$BACKEND_PORT/api"

exec npx concurrently -k -n backend,frontend -c blue,magenta \
  "npm run dev -w @crm/backend" \
  "npm run dev -w @crm/frontend -- --host 0.0.0.0"
