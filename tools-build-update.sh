#!/bin/sh
set -eu
APP_DIR="${1:-./app}"
OUT="${2:-./dist}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -p "require(require('path').resolve('$APP_DIR/package.json')).version")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
# Copy the complete application tree. Keeping an allow-list here caused the
# 1.7.2-beta.1 OTA package to omit app/lib and crash at startup.
cp -R "$APP_DIR"/. "$STAGE"/
cp "$ROOT_DIR/release.json" "$STAGE/release.json"
cat > "$STAGE/proxpanel-update.json" <<JSON
{
  "schema": 1,
  "product": "proxpanel",
  "version": "$VERSION",
  "minBootstrapVersion": "0.2.0",
  "channel": "beta",
  "notes": [
    "Compatibilité transitoire avec les anciens updaters ProxPanel",
    "release.json reste le manifeste officiel de la release"
  ]
}
JSON
(
  cd "$STAGE"
  zip -qr "$OUT_ABS/proxpanel-update-v$VERSION.zip" .
)
echo "$OUT_ABS/proxpanel-update-v$VERSION.zip"
