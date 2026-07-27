#!/usr/bin/env bash
# Pamantau production updater (adapted from FO-Simulator)
#
# CLI:
#   ./update.sh
#   ./update.sh --force
#   ./update.sh --check
#
# UI:
#   GET  update.php  → progress JSON
#   POST update.php  → run update.sh
set -euo pipefail

cd "$(dirname "$0")"
APP_DIR="$(pwd)"

VERSION_FILE="./version.json"
ZIP_FILE="/tmp/pamantau-dist.zip"
LOCK_FILE="/tmp/pamantau-update.lock"
PROGRESS_FILE="/tmp/pamantau-update-progress.json"
EXTRACT_TMP="/tmp/pamantau-extract-$$"
GITHUB_OWNER="${PAMANTAU_GITHUB_OWNER:-Jeriyant}"
GITHUB_REPO="${PAMANTAU_GITHUB_REPO:-Pamantau}"
DIST_ASSET_NAME="${PAMANTAU_DIST_ASSET:-pamantau-dist.zip}"
API_URL="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest"
USER_AGENT="Pamantau-Updater/${HOSTNAME:-server}"

IS_CGI=false
if [[ -n "${REQUEST_METHOD:-}" && -n "${GATEWAY_INTERFACE:-}" ]]; then
  IS_CGI=true
fi

FORCE=false
CHECK_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    --check) CHECK_ONLY=true ;;
    -h|--help)
      [[ "$IS_CGI" == true ]] && exit 0
      cat <<'EOF'
  ./update.sh           # update folder ini dari GitHub
  ./update.sh --force
  ./update.sh --check
  UI: POST update.php (progress: GET update.php)
EOF
      exit 0
      ;;
  esac
done

if [[ "$IS_CGI" == true ]]; then
  FORCE=true
  case "${REQUEST_METHOD}" in
    OPTIONS)
      printf 'Status: 204 No Content\r\n'
      printf 'Access-Control-Allow-Origin: *\r\n'
      printf 'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
      printf 'Access-Control-Allow-Headers: Content-Type\r\n\r\n'
      exit 0
      ;;
    GET|POST) ;;
    *)
      printf 'Status: 405 Method Not Allowed\r\nContent-Type: application/json\r\n\r\n'
      printf '{"ok":false,"error":"Method not allowed"}\n'
      exit 0
      ;;
  esac
fi

json_escape() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/}
  printf '%s' "$s"
}

cgi_json() {
  local status="$1" ok="$2" body="$3"
  printf 'Status: %s\r\n' "$status"
  printf 'Content-Type: application/json; charset=utf-8\r\n'
  printf 'Cache-Control: no-store\r\n'
  printf 'Access-Control-Allow-Origin: *\r\n\r\n'
  printf '{"ok":%s,%s}\n' "$ok" "$body"
}

write_progress() {
  # Jangan pernah gagalkan update hanya karena progress tidak bisa ditulis
  local stage="$1" percent="$2" message="$3"
  local received="${4:-0}" total="${5:-0}"
  local tmp="${PROGRESS_FILE}.tmp"
  {
    printf '{"stage":"%s","percent":%s,"message":"%s","bytesReceived":%s,"bytesTotal":%s,"updatedAt":%s}\n' \
      "$stage" "$percent" "$(json_escape "$message")" "$received" "$total" "$(date +%s)" >"$tmp" \
      && mv -f "$tmp" "$PROGRESS_FILE"
  } 2>/dev/null || true
}

fail() {
  local msg="$1"
  write_progress "error" 0 "$msg" 0 0 || true
  if [[ "$IS_CGI" == true ]]; then
    cgi_json "500 Internal Server Error" "false" "\"error\":\"$(json_escape "$msg")\""
    exit 0
  fi
  echo "ERROR: $msg" >&2
  exit 1
}

log() { echo "$@" >&2; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

exec 9>"$LOCK_FILE"
if have_cmd flock; then
  if ! flock -n 9; then
    fail "update sedang berjalan — tunggu selesai lalu coba lagi"
  fi
fi

log "==> App dir: $APP_DIR"
write_progress "check" 2 "Memeriksa release GitHub…" 0 0

have_cmd curl || have_cmd wget || have_cmd python3 || fail "butuh curl, wget, atau python3"

# Unduh kecil (metadata) tanpa percent detail
download() {
  local url="$1" out="$2"
  local attempt=1 max=5 delay=2
  while (( attempt <= max )); do
    log "    unduh (percobaan $attempt/$max)..."
    rm -f "$out"
    if have_cmd curl; then
      if curl -fsSL --connect-timeout 20 --max-time 120 --retry 2 --retry-delay 1 \
        -A "$USER_AGENT" -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" -o "$out" "$url" && [[ -s "$out" ]]; then
        return 0
      fi
    elif have_cmd wget; then
      if wget -q --tries=3 --timeout=30 -U "$USER_AGENT" -O "$out" "$url" && [[ -s "$out" ]]; then
        return 0
      fi
    elif have_cmd python3; then
      if python3 - "$url" "$out" "$USER_AGENT" <<'PY'
import sys, urllib.request
url, out, ua = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "application/vnd.github+json"})
with urllib.request.urlopen(req, timeout=120) as r, open(out, "wb") as f:
    f.write(r.read())
PY
      then
        [[ -s "$out" ]] && return 0
      fi
    fi
    rm -f "$out"
    (( attempt == max )) && return 1
    sleep "$delay"
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
  return 1
}

# Unduh zip dengan progress → .update-progress.json (dipoll UI)
download_zip() {
  local url="$1" out="$2"
  local attempt=1 max=5 delay=2
  while (( attempt <= max )); do
    log "    unduh zip (percobaan $attempt/$max)..."
    write_progress "download" 0 "Mengunduh paket… (percobaan $attempt/$max)" 0 0
    rm -f "$out"
    local ok=false
    if have_cmd python3; then
      if python3 - "$url" "$out" "$PROGRESS_FILE" "$USER_AGENT" <<'PY'
import json, os, sys, time, urllib.request

url, out, progress_path, ua = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

def write(stage, percent, message, received=0, total=0):
    payload = {
        "stage": stage,
        "percent": int(percent),
        "message": message,
        "bytesReceived": int(received),
        "bytesTotal": int(total),
        "updatedAt": int(time.time()),
    }
    tmp = progress_path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, progress_path)
    except OSError:
        pass

req = urllib.request.Request(
    url,
    headers={
        "User-Agent": ua,
        "Accept": "application/octet-stream",
    },
)
try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        received = 0
        last_pct = -1
        last_t = 0.0
        chunk_size = 64 * 1024
        with open(out, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                received += len(chunk)
                now = time.time()
                pct = int(received * 100 / total) if total else 0
                if pct != last_pct or (now - last_t) >= 0.4:
                    if total:
                        msg = f"Mengunduh… {pct}% ({received // 1024} KB / {total // 1024} KB)"
                    else:
                        msg = f"Mengunduh… {received // 1024} KB"
                    write("download", pct if total else min(95, received // (256 * 1024)), msg, received, total)
                    last_pct = pct
                    last_t = now
        if total and received < total:
            sys.stderr.write(f"unduh tidak lengkap: {received}/{total}\n")
            sys.exit(1)
        write("download", 100, f"Unduhan selesai ({received // 1024} KB)", received, total or received)
except Exception as e:
    sys.stderr.write(f"{e}\n")
    sys.exit(1)
PY
      then
        ok=true
      fi
    elif have_cmd curl; then
      # Tanpa percent halus — tetap update stage; curl --progress-bar sulit di-parse
      write_progress "download" 5 "Mengunduh paket via curl…" 0 0
      if curl -fsSL --connect-timeout 20 --max-time 300 --retry 3 --retry-delay 2 \
        -A "$USER_AGENT" -o "$out" "$url" && [[ -s "$out" ]]; then
        local sz
        sz=$(wc -c <"$out" | tr -d ' ')
        write_progress "download" 100 "Unduhan selesai ($((sz / 1024)) KB)" "$sz" "$sz"
        ok=true
      fi
    elif have_cmd wget; then
      write_progress "download" 5 "Mengunduh paket via wget…" 0 0
      if wget -q --tries=3 --timeout=60 -U "$USER_AGENT" -O "$out" "$url" && [[ -s "$out" ]]; then
        local sz
        sz=$(wc -c <"$out" | tr -d ' ')
        write_progress "download" 100 "Unduhan selesai ($((sz / 1024)) KB)" "$sz" "$sz"
        ok=true
      fi
    fi

    if [[ "$ok" == true && -s "$out" ]]; then
      return 0
    fi
    rm -f "$out"
    (( attempt == max )) && return 1
    write_progress "download" 0 "Unduhan gagal, mencoba lagi…" 0 0
    sleep "$delay"
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
  return 1
}

META_TMP="$(mktemp)"
cleanup() {
  rm -f "$META_TMP" "$ZIP_FILE" 2>/dev/null || true
  rm -rf "$EXTRACT_TMP" 2>/dev/null || true
}
trap cleanup EXIT

log "==> Cek release GitHub..."
download "$API_URL" "$META_TMP" || fail "gagal unduh metadata GitHub (jaringan/rate-limit?)"

if grep -qiE '"message"[[:space:]]*:[[:space:]]*"(API rate limit|Not Found|Bad credentials)' "$META_TMP" 2>/dev/null; then
  msg="$(grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]+"' "$META_TMP" | head -1 | sed -E 's/.*"([^"]+)"[[:space:]]*$/\1/')"
  fail "GitHub API: ${msg:-error}"
fi

TAG=""
REMOTE_VERSION=""
DOWNLOAD_URL=""

if have_cmd python3; then
  PARSE_OUT="$(
    python3 - "$META_TMP" "$DIST_ASSET_NAME" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
tag = (data.get("tag_name") or "").strip()
if not tag:
    sys.stderr.write("tag kosong\n")
    sys.exit(2)
url = ""
for a in data.get("assets") or []:
    if a.get("name") == sys.argv[2]:
        url = a.get("browser_download_url") or ""
        break
if not url:
    for a in data.get("assets") or []:
        if (a.get("name") or "").lower().endswith(".zip"):
            url = a.get("browser_download_url") or ""
            break
if not url:
    sys.stderr.write("zip asset tidak ada\n")
    sys.exit(2)
print(tag)
print(tag.lstrip("vV"))
print(url)
PY
  )" || fail "gagal parse release (python) — cek metadata GitHub"
  TAG="$(printf '%s\n' "$PARSE_OUT" | sed -n '1p')"
  REMOTE_VERSION="$(printf '%s\n' "$PARSE_OUT" | sed -n '2p')"
  DOWNLOAD_URL="$(printf '%s\n' "$PARSE_OUT" | sed -n '3p')"
else
  TAG="$(grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' "$META_TMP" | head -1 | sed -E 's/.*"([^"]+)"[[:space:]]*$/\1/')"
  DOWNLOAD_URL="$(grep -oE "\"browser_download_url\"[[:space:]]*:[[:space:]]*\"[^\"]+${DIST_ASSET_NAME}\"" "$META_TMP" | head -1 | sed -E 's/.*"([^"]+)"[[:space:]]*$/\1/')"
  REMOTE_VERSION="${TAG#v}"
fi

[[ -n "$TAG" && -n "$REMOTE_VERSION" && -n "$DOWNLOAD_URL" ]] \
  || fail "gagal parse release (tag/url kosong — install python3 jika perlu)"

log "==> Remote: $TAG"
write_progress "check" 8 "Release $TAG ditemukan" 0 0

LOCAL_VERSION=""
if [[ -f "$VERSION_FILE" ]]; then
  LOCAL_VERSION="$(
    tr -d '\r' < "$VERSION_FILE" \
      | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' \
      | head -1 \
      | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
      | tr -d '[:space:]'
  )" || true
fi
log "==> Local:  ${LOCAL_VERSION:-none}  ($VERSION_FILE)"

version_gt() {
  local a="${1#v}" b="${2#v}"
  [[ -z "$b" ]] && return 0
  [[ "$a" == "$b" ]] && return 1
  local IFS='.'
  # shellcheck disable=SC2206
  local pa=($a) pb=($b)
  local i na nb n=${#pa[@]}
  (( ${#pb[@]} > n )) && n=${#pb[@]}
  for ((i = 0; i < n; i++)); do
    na=${pa[i]:-0}; nb=${pb[i]:-0}
    na=${na//[^0-9]/}; nb=${nb//[^0-9]/}
    na=${na:-0}; nb=${nb:-0}
    ((10#$na > 10#$nb)) && return 0
    ((10#$na < 10#$nb)) && return 1
  done
  return 1
}

NEED_UPDATE=false
if [[ "$FORCE" == true ]]; then
  NEED_UPDATE=true
elif version_gt "$REMOTE_VERSION" "$LOCAL_VERSION"; then
  NEED_UPDATE=true
fi

if [[ "$CHECK_ONLY" == true ]]; then
  if [[ "$NEED_UPDATE" == true ]]; then
    [[ "$IS_CGI" == true ]] && cgi_json "200 OK" "true" "\"update\":true,\"version\":\"$(json_escape "$REMOTE_VERSION")\"" && exit 0
    log "Update tersedia: v$REMOTE_VERSION"
    exit 0
  fi
  [[ "$IS_CGI" == true ]] && cgi_json "200 OK" "true" "\"update\":false,\"version\":\"$(json_escape "$REMOTE_VERSION")\"" && exit 0
  log "Sudah versi terbaru."
  exit 1
fi

if [[ "$NEED_UPDATE" != true ]]; then
  write_progress "done" 100 "Sudah versi terbaru" 0 0
  if [[ "$IS_CGI" == true ]]; then
    cgi_json "200 OK" "true" "\"version\":\"$(json_escape "$LOCAL_VERSION")\",\"skipped\":true"
    exit 0
  fi
  log "Tidak ada update. Pakai ./update.sh --force untuk paksa."
  exit 0
fi

log "==> Download → $ZIP_FILE"
rm -f "$ZIP_FILE"
download_zip "$DOWNLOAD_URL" "$ZIP_FILE" || fail "download zip gagal (jaringan/CDN GitHub)"
[[ -s "$ZIP_FILE" ]] || fail "zip kosong"

log "==> Extract..."
write_progress "extract" 0 "Mengekstrak paket…" 0 0
rm -rf "$EXTRACT_TMP"
mkdir -p "$EXTRACT_TMP"

EXTRACT_OK=false
EXTRACT_ERR=""

if have_cmd python3; then
  set +e
  EXTRACT_ERR="$(
    python3 - "$ZIP_FILE" "$EXTRACT_TMP" "$PROGRESS_FILE" <<'PY' 2>&1
import json, os, sys, time, zipfile

zip_path, dest, progress_path = sys.argv[1], sys.argv[2], sys.argv[3]

def write(stage, percent, message):
    payload = {
        "stage": stage,
        "percent": int(percent),
        "message": message,
        "bytesReceived": 0,
        "bytesTotal": 0,
        "updatedAt": int(time.time()),
    }
    tmp = progress_path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, progress_path)
    except OSError:
        pass

write("extract", 5, "Memeriksa arsip…")
with zipfile.ZipFile(zip_path) as z:
    names = z.namelist()
    total = max(len(names), 1)
    for i, name in enumerate(names, 1):
        z.extract(name, dest)
        if i == 1 or i == total or i % 5 == 0:
            pct = int(i * 100 / total)
            write("extract", pct, f"Mengekstrak… {i}/{total}")
write("extract", 100, "Ekstrak selesai")
PY
  )"
  EXTRACT_RC=$?
  set -e
  if [[ "$EXTRACT_RC" -eq 0 ]]; then
    EXTRACT_OK=true
  else
    log "python extract gagal: $EXTRACT_ERR"
  fi
fi

if [[ "$EXTRACT_OK" != true ]] && have_cmd unzip; then
  write_progress "extract" 15 "Mencoba unzip…" 0 0
  set +e
  unzip -o -q "$ZIP_FILE" -d "$EXTRACT_TMP" 2>/tmp/pamantau-unzip-err.$$
  UNZIP_RC=$?
  set -e
  if [[ "$UNZIP_RC" -eq 0 ]]; then
    EXTRACT_OK=true
  else
    EXTRACT_ERR="$(cat /tmp/pamantau-unzip-err.$$ 2>/dev/null || echo unzip gagal)"
    log "unzip gagal: $EXTRACT_ERR"
  fi
  rm -f /tmp/pamantau-unzip-err.$$ 2>/dev/null || true
fi

[[ "$EXTRACT_OK" == true ]] || fail "extract gagal${EXTRACT_ERR:+: $EXTRACT_ERR}"

write_progress "extract" 100 "Ekstrak selesai" 0 0

if [[ ! -f "$EXTRACT_TMP/index.php" ]]; then
  nested="$(find "$EXTRACT_TMP" -mindepth 1 -maxdepth 1 -type d ! -name '__MACOSX' | head -n 1 || true)"
  if [[ -n "${nested:-}" && -f "$nested/index.php" ]]; then
    find "$nested" -mindepth 1 -maxdepth 1 -exec mv {} "$EXTRACT_TMP"/ \;
    rmdir "$nested" 2>/dev/null || true
  fi
fi

[[ -f "$EXTRACT_TMP/index.php" ]] || fail "zip tanpa index.php"

log "==> Overlay file di $APP_DIR (database/ & topology *.json dipertahankan)"
write_progress "install" 40 "Memasang file…" 0 0

# Backup preserved runtime data, then wipe code — never delete database/ or user topology exports.
PRESERVE_TMP="/tmp/pamantau-preserve-$$"
rm -rf "$PRESERVE_TMP"
mkdir -p "$PRESERVE_TMP"

if [[ -d ./database ]]; then
  cp -a ./database "$PRESERVE_TMP"/database || fail "gagal backup database/"
fi
shopt -s nullglob
for jf in ./*.json; do
  base="$(basename "$jf")"
  [[ "$base" == "version.json" ]] && continue
  cp -a "$jf" "$PRESERVE_TMP"/ || true
done
shopt -u nullglob

# Hapus isi app kecuali yang dipreservasi (sudah di-backup).
shopt -s nullglob dotglob
for item in ./*; do
  base="$(basename "$item")"
  case "$base" in
    .update-extract-tmp|database) continue ;;
    .|..) continue ;;
  esac
  # Keep root topology JSON files in place if present; they are also restored after.
  if [[ "$base" == *.json && "$base" != "version.json" ]]; then
    continue
  fi
  rm -rf "$item" || fail "gagal hapus $base (izin/file terkunci? — coba: chown -R www-data:www-data $APP_DIR)"
done
shopt -u nullglob dotglob

write_progress "install" 70 "Menyalin file baru…" 0 0
set +e
cp -rf "$EXTRACT_TMP"/. ./
CP_RC=$?
set -e
if [[ "$CP_RC" -ne 0 ]]; then
  set +e
  for item in "$EXTRACT_TMP"/* "$EXTRACT_TMP"/.[!.]* "$EXTRACT_TMP"/..?*; do
    [[ -e "$item" ]] || continue
    base="$(basename "$item")"
    [[ "$base" == "." || "$base" == ".." ]] && continue
    cp -rf "$item" ./
  done
  set -e
fi

# Restore preserved runtime data (wins over anything in the zip).
if [[ -d "$PRESERVE_TMP/database" ]]; then
  rm -rf ./database
  cp -a "$PRESERVE_TMP/database" ./database || fail "gagal restore database/"
fi
shopt -s nullglob
for jf in "$PRESERVE_TMP"/*.json; do
  [[ -e "$jf" ]] || continue
  cp -a "$jf" ./
done
shopt -u nullglob
rm -rf "$PRESERVE_TMP"

rm -rf "$EXTRACT_TMP"
rm -f "$ZIP_FILE"

printf '{\n  "version": "%s"\n}\n' "$REMOTE_VERSION" > "$VERSION_FILE" \
  || fail "tidak bisa tulis version.json (izin folder?)"

[[ -f ./index.php ]] || fail "install gagal: ./index.php tidak ada"
[[ -f ./update.sh ]] || fail "update.sh hilang setelah install"
chmod +x ./update.sh 2>/dev/null || true
[[ -f ./update.php ]] && chmod 644 ./update.php 2>/dev/null || true

if have_cmd systemctl; then
  systemctl reload apache2 >/dev/null 2>&1 || systemctl reload httpd >/dev/null 2>&1 || true
fi

write_progress "done" 100 "Selesai v$REMOTE_VERSION" 0 0
log "==> Selesai → v$REMOTE_VERSION"

if [[ "$IS_CGI" == true ]]; then
  cgi_json "200 OK" "true" "\"version\":\"$(json_escape "$REMOTE_VERSION")\",\"tag\":\"$(json_escape "$TAG")\""
  exit 0
fi

log "    Hard-refresh browser (Ctrl+F5)."
