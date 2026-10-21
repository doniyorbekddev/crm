#!/usr/bin/env bash
# Mac'da kunlik zaxira tortib olishni o'rnatadi (qayta ishga tushirish xavfsiz).
# O'chirish: launchctl bootout gui/$(id -u)/uz.itacademy.crm.backup-pull && rm ~/Library/LaunchAgents/uz.itacademy.crm.backup-pull.plist
set -euo pipefail
cd "$(dirname "$0")/../.."
LABEL=uz.itacademy.crm.backup-pull
mkdir -p "$HOME/.local/bin" "$HOME/CRM-Backups" "$HOME/Library/LaunchAgents"
install -m 700 scripts/pull-backups.sh "$HOME/.local/bin/crm-pull-backups.sh"
sed "s#__HOME__#$HOME#g" "deploy/launchd/$LABEL.plist" > "$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "O'rnatildi: $LABEL (har kuni 10:00, 18:00 va kompyuter yoqilganda) → $HOME/CRM-Backups"
