#!/usr/bin/env bash
# =====================================================================
# Env fayldan (`.env.production`) qiymat o'qish — faylni BAJARMASDAN.
#
# Nega: `source .env.production` faylni bash skripti sifatida ishga tushiradi. Docker Compose
# qabul qiladigan oddiy qator —  VITE_APP_NAME=IT-Academy CRM  — bash uchun "CRM degan buyruqni
# shu o'zgaruvchi bilan ishga tushir" degani va skript `command not found` bilan yiqiladi.
# Bundan tashqari, `source` fayldagi HAR narsani bajaradi va barcha sirlarni skript muhitiga
# (va undan ishga tushgan har bir jarayonga) eksport qiladi — zaxira skriptiga bularning keragi yo'q.
#
# Bu yerda fayl faqat matn sifatida o'qiladi: kerakli kalitning qatori topiladi va qiymati
# ajratib olinadi. `eval` yo'q, hech narsa bajarilmaydi, so'ralmagan kalitlar o'qilmaydi.
#
# Qiymat qoidalari Docker Compose bilan bir xil:
#   KEY=qiymat bo'sh joy bilan     -> qiymat bo'sh joy bilan
#   KEY="qo'shtirnoqdagi qiymat"   -> qo'shtirnoqdagi qiymat
#   KEY='bittalik'                 -> bittalik
#   KEY=qiymat # izoh              -> qiymat        (izoh — bo'sh joydan keyingi #)
#   KEY=a#b                        -> a#b
#   bir kalit ikki marta bo'lsa    -> oxirgisi
# =====================================================================

# env_file_get <fayl> <kalit> — qiymatni stdout'ga yozadi; kalit yo'q bo'lsa 1 qaytaradi.
env_file_get() {
  local file="$1" key="$2" line value
  [ -f "$file" ] || return 1
  # Kalit nomi faqat harf, raqam va pastki chiziq — regex ichiga xavfsiz qo'yiladi
  case "$key" in *[!A-Za-z0-9_]* | '') return 1 ;; esac
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"                              # Windows'da tahrirlangan fayl (CRLF)
  if [[ "$value" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
    value="${BASH_REMATCH[1]}"
  else
    value="${value%%[[:space:]]#*}"                   # qo'shtirnoqsiz: " # izoh" olib tashlanadi
    value="${value%"${value##*[![:space:]]}"}"        # oxiridagi bo'sh joylar
  fi
  printf '%s' "$value"
}

# env_load <fayl> <kalit>... — sanab o'tilgan kalitlarni shell o'zgaruvchisiga yuklaydi.
# Muhitda allaqachon berilgan qiymat ustun (masalan cron satrida KEEP_DAYS=14 ...).
# Faylda yo'q kalit o'zgarishsiz qoladi — standart qiymatni chaqiruvchi `${VAR:-...}` bilan beradi.
# Qiymatlar EKSPORT QILINMAYDI: ular faqat shu skript ichida ko'rinadi.
env_load() {
  local file="$1" key value
  shift
  for key in "$@"; do
    [ -n "${!key:-}" ] && continue
    if value="$(env_file_get "$file" "$key")"; then
      printf -v "$key" '%s' "$value"
    fi
  done
}
