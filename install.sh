#!/usr/bin/env bash
# Pamantau installer / repair for Debian & Ubuntu (Apache + PHP + www-data cron)
#
# Usage (as root):
#   sudo ./install.sh
#   sudo ./install.sh --repair
#   sudo ./install.sh --base-url=https://127.0.0.1/PAMANTAU/
#   sudo ./install.sh --web-user=www-data --skip-apt
#
# What it does:
#   - installs PHP/Apache/ping/traceroute/Chromium/cron deps
#   - fixes ownership so Apache and the worker share one user (www-data)
#   - moves Pamantau cron off root onto www-data
#   - seeds local renderer base URL + smoke-checks the worker
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

WEB_USER="${PAMANTAU_WEB_USER:-www-data}"
WEB_GROUP="$WEB_USER"
BASE_URL="${PAMANTAU_BASE_URL:-}"
SKIP_APT=false
REPAIR_ONLY=false
INSTALL_APACHE=true
ENABLE_SSL_MODS=true

for arg in "$@"; do
  case "$arg" in
    --repair) REPAIR_ONLY=true ;;
    --skip-apt) SKIP_APT=true ;;
    --no-apache) INSTALL_APACHE=false ;;
    --web-user=*) WEB_USER="${arg#*=}"; WEB_GROUP="$WEB_USER" ;;
    --base-url=*) BASE_URL="${arg#*=}" ;;
    -h|--help)
      cat <<'EOF'
Pamantau install.sh — Debian/Ubuntu

  sudo ./install.sh
  sudo ./install.sh --repair
  sudo ./install.sh --base-url=https://127.0.0.1/PAMANTAU/
  sudo ./install.sh --web-user=www-data --skip-apt

Options:
  --repair       Only fix permissions + www-data cron (no apt)
  --skip-apt     Skip package install
  --no-apache    Do not install/enable Apache packages
  --web-user=U   Web/CLI user (default: www-data)
  --base-url=URL Local URL for headless Chromium (127.0.0.1 / localhost)
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

log()  { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || fail "Jalankan sebagai root: sudo ./install.sh"
[[ -f "$APP_DIR/index.php" ]] || fail "index.php tidak ditemukan di $APP_DIR"
[[ -f "$APP_DIR/cli/background.php" ]] || fail "cli/background.php tidak ditemukan"
command -v id >/dev/null || fail "perintah id tidak tersedia"

if ! id -u "$WEB_USER" >/dev/null 2>&1; then
  fail "User web '$WEB_USER' tidak ada. Buat dulu atau pakai --web-user=www-data"
fi
if ! getent group "$WEB_GROUP" >/dev/null 2>&1; then
  WEB_GROUP="$(id -gn "$WEB_USER")"
fi

detect_php_bin() {
  if command -v php >/dev/null 2>&1; then
    command -v php
    return 0
  fi
  local cand
  for cand in /usr/bin/php /usr/bin/php8.4 /usr/bin/php8.3 /usr/bin/php8.2 /usr/bin/php8.1 /usr/bin/php8.0 /usr/bin/php7.4; do
    if [[ -x "$cand" ]]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

install_packages() {
  $SKIP_APT && { log "Lewati apt (--skip-apt)"; return 0; }
  $REPAIR_ONLY && { log "Mode --repair: lewati apt"; return 0; }

  command -v apt-get >/dev/null || fail "Hanya mendukung Debian/Ubuntu (apt-get)"

  log "Memasang paket sistem…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y

  local pkgs=(
    ca-certificates
    curl
    cron
    unzip
    iputils-ping
    traceroute
    iputils-tracepath
    fonts-liberation
    fonts-dejavu-core
  )

  if $INSTALL_APACHE; then
    pkgs+=(
      apache2
      libapache2-mod-php
      php
      php-cli
      php-curl
      php-gd
      php-mbstring
      php-xml
      php-zip
    )
  else
    pkgs+=(php-cli php-curl php-gd php-mbstring php-xml php-zip)
  fi

  # Chromium package name differs across releases (after apt-get update).
  if apt-cache show chromium >/dev/null 2>&1; then
    pkgs+=(chromium)
  elif apt-cache show chromium-browser >/dev/null 2>&1; then
    pkgs+=(chromium-browser)
  else
    warn "Paket chromium tidak ditemukan di apt — pasang manual lalu set PAMANTAU_BROWSER_PATH"
  fi

  apt-get install -y --no-install-recommends "${pkgs[@]}"

  if $INSTALL_APACHE && command -v a2enmod >/dev/null 2>&1; then
    log "Mengaktifkan modul Apache…"
    a2enmod rewrite headers >/dev/null || true
    if $ENABLE_SSL_MODS; then
      a2enmod ssl >/dev/null || true
    fi
    systemctl enable apache2 >/dev/null 2>&1 || true
    systemctl restart apache2 || systemctl reload apache2 || warn "Gagal restart Apache — cek konfigurasi"
  fi

  systemctl enable cron >/dev/null 2>&1 || systemctl enable crond >/dev/null 2>&1 || true
  systemctl start cron >/dev/null 2>&1 || systemctl start crond >/dev/null 2>&1 || true
}

fix_permissions() {
  log "Menyetel kepemilikan ke ${WEB_USER}:${WEB_GROUP}…"
  mkdir -p "$APP_DIR/database"
  if [[ ! -f "$APP_DIR/database/.htaccess" ]]; then
    printf 'Require all denied\n' >"$APP_DIR/database/.htaccess"
  fi

  # Drop stale root-owned headless leftovers that block www-data writes.
  rm -f \
    "$APP_DIR/database/headless-snapshot-job.json" \
    "$APP_DIR/database/headless-snapshot-output.bin" \
    "$APP_DIR/database/background.lock" \
    "$APP_DIR/database/monitoring.lock" \
    "$APP_DIR/database/.write-test" 2>/dev/null || true

  chown -R "${WEB_USER}:${WEB_GROUP}" "$APP_DIR"
  # App readable by web server; database must be writable.
  find "$APP_DIR" -type d -exec chmod 775 {} +
  find "$APP_DIR" -type f -exec chmod 664 {} +
  chmod 775 "$APP_DIR/database"
  chmod a+x "$APP_DIR/install.sh" "$APP_DIR/update.sh" 2>/dev/null || true
  if [[ -d "$APP_DIR/cli" ]]; then
    find "$APP_DIR/cli" -type f -name '*.php' -exec chmod 664 {} +
  fi
  chmod 775 "$APP_DIR/cli" 2>/dev/null || true
}

seed_base_url() {
  local url="$BASE_URL"
  if [[ -z "$url" ]]; then
    # Guess common local paths if caller did not pass --base-url.
    local base_name
    base_name="$(basename "$APP_DIR")"
    if [[ -f "$APP_DIR/database/runtime-base-url.json" ]]; then
      log "runtime-base-url.json sudah ada — tidak ditimpa"
      return 0
    fi
    if curl -k -sI --max-time 5 "https://127.0.0.1/${base_name}/" | head -n1 | grep -qE 'HTTP/'; then
      url="https://127.0.0.1/${base_name}/"
    elif curl -sI --max-time 5 "http://127.0.0.1/${base_name}/" | head -n1 | grep -qE 'HTTP/'; then
      url="http://127.0.0.1/${base_name}/"
    else
      warn "Tidak bisa menebak BASE_URL. Buka dashboard sekali di browser, atau:"
      warn "  sudo ./install.sh --base-url=https://127.0.0.1/${base_name}/"
      return 0
    fi
  fi

  url="${url%/}/"
  if [[ ! "$url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?/ ]]; then
    fail "--base-url harus http(s)://127.0.0.1/... atau localhost (untuk renderer headless)"
  fi

  log "Menulis runtime-base-url.json → $url"
  cat >"$APP_DIR/database/runtime-base-url.json" <<EOF
{"base_url":$(php -r 'echo json_encode($argv[1], JSON_UNESCAPED_SLASHES);' "$url"),"recorded_at":"$(date -Iseconds)"}
EOF
  chown "${WEB_USER}:${WEB_GROUP}" "$APP_DIR/database/runtime-base-url.json"
  chmod 664 "$APP_DIR/database/runtime-base-url.json"
}

crontab_filter_marker() {
  local user="$1"
  local marker="$2"
  local current cleaned
  current="$(crontab -u "$user" -l 2>/dev/null || true)"
  [[ -n "$current" ]] || return 0
  printf '%s\n' "$current" | grep -Fq "$marker" || return 0
  cleaned="$(printf '%s\n' "$current" | grep -Fv "$marker" || true)"
  if [[ -n "${cleaned//[[:space:]]/}" ]]; then
    printf '%s\n' "$cleaned" | crontab -u "$user" -
  else
    crontab -u "$user" -r 2>/dev/null || true
  fi
  log "Cron Pamantau dibersihkan dari user '$user'"
}

install_www_data_cron() {
  local php_bin worker_line marker web_tmp existing
  php_bin="$(detect_php_bin)" || fail "php CLI tidak ditemukan setelah install"
  worker_line="* * * * * $php_bin $APP_DIR/cli/background.php >/dev/null 2>&1"
  marker="$APP_DIR/cli/background.php"

  log "Menyetel cron worker ke user '$WEB_USER'…"

  # Never leave Pamantau on root crontab (creates root-owned job.json).
  crontab_filter_marker root "$marker"
  if [[ "$WEB_USER" != "root" ]]; then
    crontab_filter_marker "$WEB_USER" "$marker"
  fi

  web_tmp="$(mktemp)"
  existing="$(crontab -u "$WEB_USER" -l 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    printf '%s\n' "$existing" | grep -Fv "$marker" >"$web_tmp" || true
  else
    : >"$web_tmp"
  fi
  # Ensure trailing newline then append our job.
  if [[ -s "$web_tmp" ]] && [[ "$(tail -c1 "$web_tmp" | wc -l)" -eq 0 ]]; then
    printf '\n' >>"$web_tmp"
  fi
  printf '%s\n' "$worker_line" >>"$web_tmp"
  crontab -u "$WEB_USER" "$web_tmp"
  rm -f "$web_tmp"

  printf '%s\n' "$worker_line" >"$APP_DIR/database/.cron_installed"
  chown "${WEB_USER}:${WEB_GROUP}" "$APP_DIR/database/.cron_installed"
  chmod 664 "$APP_DIR/database/.cron_installed"

  log "Cron aktif ($WEB_USER):"
  crontab -u "$WEB_USER" -l | grep -F "$marker" || true
}

smoke_check() {
  local php_bin
  php_bin="$(detect_php_bin)" || fail "php CLI tidak ditemukan"

  log "Smoke check…"
  [[ -x "$(command -v ping || true)" || -x /bin/ping || -x /usr/bin/ping ]] || warn "ping tidak ditemukan"
  if ! command -v chromium >/dev/null 2>&1 \
    && ! command -v chromium-browser >/dev/null 2>&1 \
    && [[ ! -x /usr/lib/chromium/chromium ]]; then
    warn "Chromium belum terpasang — screenshot Telegram headless tidak akan jalan"
  else
    log "Chromium: OK"
  fi

  # Write / run checks as web user
  if command -v runuser >/dev/null 2>&1; then
    runuser -u "$WEB_USER" -- bash -c "touch '$APP_DIR/database/.write-test' && rm -f '$APP_DIR/database/.write-test'" \
      || fail "User $WEB_USER tidak bisa menulis ke database/"
    log "Menjalankan worker sekali sebagai $WEB_USER…"
    runuser -u "$WEB_USER" -- "$php_bin" "$APP_DIR/cli/background.php" \
      || warn "Worker mengembalikan exit non-zero (cek output di atas)"
  else
    su -s /bin/bash "$WEB_USER" -c "touch '$APP_DIR/database/.write-test' && rm -f '$APP_DIR/database/.write-test'" \
      || fail "User $WEB_USER tidak bisa menulis ke database/"
    log "Menjalankan worker sekali sebagai $WEB_USER…"
    su -s /bin/bash "$WEB_USER" -c "$php_bin '$APP_DIR/cli/background.php'" \
      || warn "Worker mengembalikan exit non-zero (cek output di atas)"
  fi

  log "Selesai."
  cat <<EOF

Pamantau siap di: $APP_DIR
  Web user : $WEB_USER
  Cron     : crontab -u $WEB_USER -l
  Worker   : sudo -u $WEB_USER $php_bin $APP_DIR/cli/background.php

Langkah berikutnya:
  1) Buka aplikasi di browser (sekali) agar session/login & base URL tercatat
  2) Pengaturan → Background ON + Screenshot Telegram ON (jika dipakai)
  3) Isi token/chat Telegram, lalu Simpan
  4) Uji: sudo -u $WEB_USER $php_bin $APP_DIR/cli/background.php

EOF
}

main() {
  log "Pamantau install — $APP_DIR"
  install_packages
  fix_permissions
  seed_base_url
  install_www_data_cron
  smoke_check
}

main
