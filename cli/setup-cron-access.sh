#!/bin/bash
# One-time setup: allow Apache (www-data) to manage Pamantau root cron via sudo -n.
# Run as root: sudo bash cli/setup-cron-access.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRONCTL="$APP_DIR/cli/cronctl.sh"
SUDOERS_FILE="/etc/sudoers.d/pamantau-cron"

chmod 755 "$APP_DIR/cli"
chmod 755 "$CRONCTL"

# Escape spaces for sudoers (rare, but safe).
CRONCTL_ESC="${CRONCTL// /\\ }"

cat > "$SUDOERS_FILE" <<EOF
# Pamantau — allow web server to install/remove root cron for background worke
www-data ALL=(root) NOPASSWD: $CRONCTL_ESC
EOF
chmod 440 "$SUDOERS_FILE"

# Validate sudoers fragment
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$SUDOERS_FILE"
fi

# Migrate any www-data copy away, then ensure root entry matches desired state later.
if crontab -u www-data -l 2>/dev/null | grep -qF 'Pamantau/cli/background.php'; then
  TMP="$(mktemp)"
  crontab -u www-data -l 2>/dev/null \
    | grep -vF 'Pamantau/cli/background.php' \
    | grep -vF '# Pamantau-background' > "$TMP" || true
  crontab -u www-data "$TMP"
  rm -f "$TMP"
  echo "Removed Pamantau line from www-data crontab"
fi

echo "OK: sudoers installed at $SUDOERS_FILE"
echo "Test: sudo -u www-data sudo -n $CRONCTL status"
