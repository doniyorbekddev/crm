#!/usr/bin/env bash
# =====================================================================
# GitHub Actions deploy kalitining yagona kirish nuqtasi (authorized_keys dagi command="...").
#
# Kalit faqat shu skriptni ishga tushira oladi: boshqa buyruq, port yo'naltirish va terminal yo'q
# (`restrict`). Workflow yuborgan buyruqdan faqat commit SHA olinadi va tekshiriladi — qolgan matn
# hech qachon bajarilmaydi.
#
# Serverga o'rnatish: ~/bin/crm-ci-deploy (repodagi nusxa — hujjat va yangilash uchun)
#   authorized_keys:  restrict,command="/home/ubuntu/bin/crm-ci-deploy" ssh-ed25519 AAAA... github-actions-deploy
#
# Tekshirish (deploy qilmasdan):  ssh -i <kalit> ubuntu@server check
# =====================================================================
set -euo pipefail

APP_DIR="${CRM_APP_DIR:-$HOME/crm}"
LOG_DIR="$APP_DIR/.deploy"
REQUEST="${SSH_ORIGINAL_COMMAND:-}"

if [ "$REQUEST" = "check" ]; then
  echo "ci-deploy: kalit ishlaydi ($(hostname))"
  exit 0
fi

# Workflow: cd '<dir>' && ./deploy/deploy.sh '<sha>' — faqat SHA olinadi
SHA="$(printf '%s' "$REQUEST" | grep -oE "deploy\.sh '[0-9a-f]{7,40}'" | grep -oE '[0-9a-f]{7,40}' || true)"
if [ -z "$SHA" ]; then
  echo "ci-deploy: ruxsat etilmagan so'rov rad etildi" >&2
  exit 2
fi

mkdir -p "$LOG_DIR"
cd "$APP_DIR"
echo "ci-deploy: $SHA deploy qilinmoqda (log: $LOG_DIR/deploy-ci-$SHA.log)"
./deploy/deploy.sh "$SHA" 2>&1 | tee "$LOG_DIR/deploy-ci-$SHA.log"
