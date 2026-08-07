#!/bin/bash
# Pamantau cronctl — install/remove root crontab line for cli/background.php
# Intended to run as root (directly or via sudo -n from www-data).

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="# Pamantau-background"
if [ -x /usr/bin/php ]; then
  PHP_BIN="/usr/bin/php"
elif command -v php >/dev/null 2>&1; then
  PHP_BIN="$(command -v php)"
else
  PHP_BIN="/usr/bin/php"
fi
WORKER="$APP_DIR/cli/background.php"
LOG="$APP_DIR/database/background-cron.log"
LINE="* * * * * $PHP_BIN $WORKER >> $LOG 2>&1"
MARKER_FILE="$APP_DIR/database/.cron_installed"

write_marker() {
  if [ "$1" = "1" ]; then
    mkdir -p "$(dirname "$MARKER_FILE")"
    printf '%s\n%s\n' "$(date -Iseconds)" "$LINE" > "$MARKER_FILE"
    chmod 644 "$MARKER_FILE" 2>/dev/null || true
  else
    rm -f "$MARKER_FILE"
  fi
}

filter_crontab() {
  crontab -l 2>/dev/null | grep -vF 'Pamantau/cli/background.php' | grep -vF "$MARKER" || true
}

cmd="${1:-}"
case "$cmd" in
  on|install)
    TMP="$(mktemp)"
    filter_crontab > "$TMP"
    printf '%s\n' "$MARKER" >> "$TMP"
    printf '%s\n' "$LINE" >> "$TMP"
    crontab "$TMP"
    rm -f "$TMP"
    write_marker 1
    printf 'ok installed=1 line=%s\n' "$LINE"
    ;;
  off|remove)
    TMP="$(mktemp)"
    filter_crontab > "$TMP"
    crontab "$TMP"
    rm -f "$TMP"
    write_marker 0
    printf 'ok installed=0 line=%s\n' "$LINE"
    ;;
  status)
    LISTING="$(crontab -l 2>/dev/null || true)"
    if printf '%s\n' "$LISTING" | grep -qF 'Pamantau/cli/background.php'; then
      printf 'ok installed=1 line=%s\n' "$LINE"
      exit 0
    fi
    printf 'ok installed=0 line=%s\n' "$LINE"
    ;;
  *)
    echo "usage: $0 on|off|status" >&2
    exit 2
    ;;
esac
