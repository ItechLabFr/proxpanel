#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
DIST="${2:-./dist}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [dist-dir]" >&2
  exit 2
fi

FULL_ZIP="$DIST/proxpanel-v$VERSION.zip"
if [[ ! -f "$FULL_ZIP" ]]; then
  echo "Full package missing: $FULL_ZIP" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/proxpanel-lxc-v$VERSION"
mkdir -p "$ROOT/payload"
cp "$FULL_ZIP" "$ROOT/payload/"

cat > "$ROOT/install.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export DEBIAN_FRONTEND=noninteractive

VERSION="$VERSION"
BASE_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD="\$BASE_DIR/payload/proxpanel-v\$VERSION.zip"

fail(){ echo "[ERREUR] \$*" >&2; exit 1; }
ok(){ echo "✓ \$*"; }
info(){ echo "• \$*"; }

[[ "\${EUID}" -eq 0 ]] || fail "L'installation doit être exécutée en root dans le LXC."
[[ -f /etc/debian_version ]] || fail "Debian est requis."
DEBIAN_MAJOR="\$(cut -d. -f1 /etc/debian_version 2>/dev/null || true)"
[[ "\$DEBIAN_MAJOR" == "13" ]] || fail "Debian 13 est requis pour ProxPanel LXC."
ARCH="\$(dpkg --print-architecture)"
[[ "\$ARCH" == "amd64" || "\$ARCH" == "arm64" ]] || fail "Architecture non supportée : \$ARCH"
[[ -f "\$PAYLOAD" ]] || fail "Payload ProxPanel introuvable."

info "Installation des dépendances système…"
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl unzip openssh-client sshpass nodejs >/dev/null
NODE_MAJOR="\$(node -p "process.versions.node.split('.')[0]")"
(( NODE_MAJOR >= 20 )) || fail "Node.js 20 ou supérieur est requis."
ok "Dépendances installées · Node.js \$(node --version) · \$ARCH"

if ! id proxpanel >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/proxpanel --create-home --shell /usr/sbin/nologin proxpanel
fi
install -d -o proxpanel -g proxpanel -m 0750 /var/lib/proxpanel /var/lib/proxpanel/data
install -d -o proxpanel -g proxpanel -m 0755 /opt/proxpanel-bootstrap /opt/proxpanel-seed /opt/proxpanel-runtime /opt/proxpanel-runtime/releases

WORK="\$(mktemp -d)"
trap 'rm -rf "\$WORK"' EXIT
unzip -q "\$PAYLOAD" -d "\$WORK"
SRC="\$(find "\$WORK" -mindepth 1 -maxdepth 1 -type d -name 'proxpanel-v*' | head -n1)"
[[ -n "\$SRC" && -f "\$SRC/release.json" && -f "\$SRC/launcher.js" && -f "\$SRC/app/server.js" ]] || fail "Structure du package complet invalide."
FOUND_VERSION="\$(node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).version||'')" "\$SRC/release.json")"
[[ "\$FOUND_VERSION" == "\$VERSION" ]] || fail "Le package contient \$FOUND_VERSION, version attendue : \$VERSION."

info "Installation native de ProxPanel \$VERSION…"
rm -rf /opt/proxpanel-seed/*
cp -a "\$SRC/app/." /opt/proxpanel-seed/
cp "\$SRC/release.json" /opt/proxpanel-seed/release.json
cp "\$SRC/launcher.js" /opt/proxpanel-bootstrap/launcher.js
chown -R proxpanel:proxpanel /opt/proxpanel-bootstrap /opt/proxpanel-seed /opt/proxpanel-runtime /var/lib/proxpanel
chmod 0755 /opt/proxpanel-bootstrap/launcher.js

cat > /etc/systemd/system/proxpanel.service <<'UNIT'
[Unit]
Description=ProxPanel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=proxpanel
Group=proxpanel
WorkingDirectory=/opt/proxpanel-bootstrap
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=PROXPANEL_RUNTIME_DIR=/opt/proxpanel-runtime
Environment=PROXPANEL_DATA_DIR=/var/lib/proxpanel/data
Environment=PROXPANEL_SEED_DIR=/opt/proxpanel-seed
ExecStart=/usr/bin/node /opt/proxpanel-bootstrap/launcher.js
Restart=always
RestartSec=2
TimeoutStopSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /usr/local/bin/proxpanel <<'CLI'
#!/usr/bin/env bash
set -e
case "\${1:-status}" in
  status) systemctl status proxpanel --no-pager ;;
  start|stop|restart) systemctl "\$1" proxpanel ;;
  logs) journalctl -u proxpanel -n 100 --no-pager ;;
  follow) journalctl -u proxpanel -f ;;
  health) curl -fsS http://127.0.0.1:8080/healthz && echo ;;
  version)
    node -e "const fs=require('fs');for(const p of ['/opt/proxpanel-runtime/current/release.json','/opt/proxpanel-seed/release.json']){try{console.log(JSON.parse(fs.readFileSync(p,'utf8')).version);process.exit(0)}catch{}}process.exit(1)"
    ;;
  *) echo "Usage: proxpanel {status|start|stop|restart|logs|follow|health|version}" >&2; exit 2 ;;
esac
CLI
chmod 0755 /usr/local/bin/proxpanel

systemctl daemon-reload
systemctl enable --now proxpanel >/dev/null

info "Vérification du service ProxPanel…"
for _ in \$(seq 1 45); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
    ok "ProxPanel \$VERSION est opérationnel"
    IP="\$(hostname -I 2>/dev/null | awk '{print \$1}')"
    echo
    echo "Interface : http://\${IP:-IP_DU_LXC}:8080"
    echo "Service   : systemctl status proxpanel"
    echo "Logs      : journalctl -u proxpanel -f"
    exit 0
  fi
  sleep 1
done
journalctl -u proxpanel -n 80 --no-pager >&2 || true
fail "ProxPanel n'a pas répondu au healthcheck sur le port 8080."
EOF
chmod +x "$ROOT/install.sh"

cat > "$ROOT/uninstall.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "Root requis." >&2; exit 1; fi
systemctl disable --now proxpanel 2>/dev/null || true
rm -f /etc/systemd/system/proxpanel.service /usr/local/bin/proxpanel
systemctl daemon-reload
echo "Service et application arrêtés."
echo "Données conservées dans /var/lib/proxpanel/data et runtime dans /opt/proxpanel-runtime."
EOF
chmod +x "$ROOT/uninstall.sh"

cat > "$ROOT/lxc-package.json" <<EOF
{
  "product": "ProxPanel",
  "version": "$VERSION",
  "channel": "beta",
  "title": "ProxPanel LXC $VERSION",
  "architectures": ["amd64", "arm64"],
  "os": "debian",
  "min_os_version": "13",
  "recommended_os_version": "13",
  "runtime": "native-systemd",
  "port": 8080,
  "unprivileged": true,
  "payload": "payload/proxpanel-v$VERSION.zip"
}
EOF

cat > "$ROOT/README.txt" <<EOF
ProxPanel LXC $VERSION
Native Debian 13 package for Proxmox LXC.
Architectures: amd64, arm64
Runtime: Node.js + systemd
Port: 8080
No Docker is installed inside the LXC.
EOF

(
  cd "$ROOT"
  sha256sum "payload/proxpanel-v$VERSION.zip" install.sh uninstall.sh lxc-package.json > SHA256SUMS.txt
)

mkdir -p "$DIST"
tar -C "$TMP" -czf "$DIST/proxpanel-lxc-v$VERSION.tar.gz" "proxpanel-lxc-v$VERSION"
echo "Built $DIST/proxpanel-lxc-v$VERSION.tar.gz"
