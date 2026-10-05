#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${ROOT_DIR}/app/public/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

XTERM_VERSION="6.0.0"
XTERM_FIT_VERSION="0.11.0"
NOVNC_VERSION="1.7.0"

rm -rf "$DEST/xterm" "$DEST/xterm-addon-fit" "$DEST/novnc"
mkdir -p "$DEST/xterm" "$DEST/xterm-addon-fit" "$DEST/novnc"

pack_and_unpack() {
  local spec="$1"
  local name="$2"
  local tgz
  (
    cd "$TMP"
    npm pack "$spec" --silent >/dev/null
  )
  tgz="$(find "$TMP" -maxdepth 1 -type f -name "$name" -print -quit)"
  [[ -n "$tgz" ]] || { echo "Package npm introuvable après npm pack: $spec" >&2; exit 1; }
  mkdir -p "$TMP/unpack-$name"
  tar -xzf "$tgz" -C "$TMP/unpack-$name"
  printf '%s' "$TMP/unpack-$name/package"
}

xterm_pkg="$(pack_and_unpack "@xterm/xterm@${XTERM_VERSION}" "xterm-xterm-${XTERM_VERSION}.tgz")"
cp "$xterm_pkg/lib/xterm.mjs" "$DEST/xterm/xterm.mjs"
cp "$xterm_pkg/css/xterm.css" "$DEST/xterm/xterm.css"
cp "$xterm_pkg/LICENSE" "$DEST/xterm/LICENSE"

fit_pkg="$(pack_and_unpack "@xterm/addon-fit@${XTERM_FIT_VERSION}" "xterm-addon-fit-${XTERM_FIT_VERSION}.tgz")"
cp "$fit_pkg/lib/addon-fit.mjs" "$DEST/xterm-addon-fit/addon-fit.mjs"
cp "$fit_pkg/LICENSE" "$DEST/xterm-addon-fit/LICENSE"

novnc_pkg="$(pack_and_unpack "@novnc/novnc@${NOVNC_VERSION}" "novnc-novnc-${NOVNC_VERSION}.tgz")"
cp -R "$novnc_pkg/core" "$DEST/novnc/core"
cp -R "$novnc_pkg/vendor" "$DEST/novnc/vendor"
if compgen -G "$novnc_pkg/docs/LICENSE*" >/dev/null; then
  mkdir -p "$DEST/novnc/docs"
  cp "$novnc_pkg"/docs/LICENSE* "$DEST/novnc/docs/"
fi

test -s "$DEST/xterm/xterm.mjs"
test -s "$DEST/xterm/xterm.css"
test -s "$DEST/xterm-addon-fit/addon-fit.mjs"
test -s "$DEST/novnc/core/rfb.js"

echo "Console vendor assets ready: xterm ${XTERM_VERSION}, addon-fit ${XTERM_FIT_VERSION}, noVNC ${NOVNC_VERSION}"
