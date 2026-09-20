#!/usr/bin/env bash
# =====================================================================
# Ubuntu VPS ni bir marta sozlash: paketlar, Docker, Nginx, certbot, UFW,
# kataloglar va cron zaxirasi. Oddiy (root emas) foydalanuvchi ostida,
# sudo huquqi bilan ishlatiladi:
#
#   cd /opt/sales-crm && ./deploy/setup-server.sh
#
# SSH ni qattiqlashtirish (parol bilan kirishni o'chirish) faqat sizda
# authorized_keys mavjud bo'lsa bajariladi — aks holda o'zingiz qulflanib
# qolmasligingiz uchun o'tkazib yuboriladi.
# =====================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\n\033[33m!! %s\033[0m\n' "$1"; }

[ "$(id -u)" -ne 0 ] || warn "root ostida ishlayapsiz. Kundalik ish uchun alohida foydalanuvchi tavsiya etiladi."

say "Tizim paketlari yangilanmoqda"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

say "Kerakli paketlar: git, curl, ufw, nginx, certbot, unattended-upgrades"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl ca-certificates ufw nginx certbot python3-certbot-nginx unattended-upgrades

say "Xavfsizlik yangilanishlari avtomatik o'rnatilsin"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades || true

if command -v docker >/dev/null 2>&1; then
  say "Docker allaqachon o'rnatilgan: $(docker --version)"
else
  say "Docker o'rnatilmoqda"
  curl -fsSL https://get.docker.com | sudo sh
fi

if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  say "Foydalanuvchi docker guruhiga qo'shilmoqda ($USER)"
  sudo usermod -aG docker "$USER"
  warn "Guruh o'zgarishi kuchga kirishi uchun SSH dan chiqib qayta kiring."
fi

say "UFW: faqat SSH, HTTP va HTTPS"
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw --force enable
sudo ufw status verbose

say "Kataloglar"
mkdir -p "$APP_DIR/backups" "$APP_DIR/.deploy"
chmod 700 "$APP_DIR/backups"

if [ -f "$APP_DIR/.env.production" ]; then
  chmod 600 "$APP_DIR/.env.production"
  say ".env.production topildi (huquqlar 600 ga qo'yildi)"
else
  warn ".env.production yo'q. Yarating: cp .env.production.example .env.production && nano .env.production"
fi

say "Skriptlar bajariluvchi qilinmoqda"
chmod +x "$APP_DIR"/deploy/*.sh "$APP_DIR"/scripts/*.sh

# --- Kunlik zaxira cron -------------------------------------------------
CRON_LINE="0 3 * * * cd $APP_DIR && KEEP_DAYS=14 ./scripts/backup-db.sh >> $APP_DIR/backups/backup.log 2>&1"
if crontab -l 2>/dev/null | grep -Fq 'backup-db.sh'; then
  say "Zaxira cron allaqachon mavjud"
else
  say "Kunlik zaxira cron qo'shilmoqda (03:00, 14 kun saqlanadi)"
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
fi
crontab -l | grep backup-db.sh || true

# --- SSH qattiqlashtirish (ehtiyotkorlik bilan) -------------------------
KEYS_FILE="$HOME/.ssh/authorized_keys"
if [ -s "$KEYS_FILE" ]; then
  say "SSH: parol bilan kirish va root login o'chirilmoqda"
  sudo tee /etc/ssh/sshd_config.d/99-crm-hardening.conf >/dev/null <<'CONF'
# CRM: faqat SSH kalit bilan kirish
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
  if sudo sshd -t; then
    sudo systemctl reload ssh || sudo systemctl reload sshd
    say "SSH sozlamasi qo'llanildi. Yangi terminalda kirishni tekshiring — bu sessiyani yopmang!"
  else
    sudo rm -f /etc/ssh/sshd_config.d/99-crm-hardening.conf
    warn "sshd konfiguratsiyasi xato — o'zgarish bekor qilindi."
  fi
else
  warn "~/.ssh/authorized_keys bo'sh — SSH kalitini o'rnatmaguningizcha parol bilan kirish o'chirilmaydi."
  warn "O'z kompyuteringizda: ssh-copy-id $USER@<SERVER_IP>"
fi

say "Tayyor. Keyingi qadamlar: docs/CI-CD.md (2-bo'limdan boshlab)"
