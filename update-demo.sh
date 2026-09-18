#!/usr/bin/env bash
set -euo pipefail

DEMO_DIR="/opt/proxpanel-demo"
COMPOSE_FILE="docker-compose.demo.yml"
CONTAINER="proxpanel-demo"

cd "$DEMO_DIR"

echo "==> Synchronisation GitHub..."
git fetch origin main
git checkout main
git reset --hard origin/main

SHA="$(git rev-parse --short=12 HEAD)"
VERSION="$(node -p "require('./release.json').version" 2>/dev/null || echo "demo")"
export PROXPANEL_DEMO_VERSION="${VERSION}-demo-${SHA}"

echo "==> Version source : $VERSION"
echo "==> Commit         : $SHA"
echo "==> Port           : 8082"

echo "==> Build Docker local..."
docker compose -f "$COMPOSE_FILE" build --pull "$CONTAINER"

echo "==> Recréation du conteneur..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans "$CONTAINER"

echo "==> Vérification du mode démo..."
for attempt in $(seq 1 24); do
  STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)"

  if [ "$STATUS" = "unhealthy" ] || [ "$STATUS" = "exited" ] || [ "$STATUS" = "dead" ]; then
    echo "ERREUR : conteneur en état $STATUS" >&2
    docker logs --tail 120 "$CONTAINER" || true
    exit 1
  fi

  API_STATUS="$(docker exec "$CONTAINER" sh -lc 'wget -qO- http://127.0.0.1:8080/api/status 2>/dev/null || true' 2>/dev/null || true)"

  if printf '%s' "$API_STATUS" | grep -q '"demoMode":true' && printf '%s' "$API_STATUS" | grep -q '"setupDone":true'; then
    echo
    echo "======================================"
    echo " ProxPanel Demo est prêt"
    echo "======================================"
    echo "Version : $VERSION"
    echo "Commit  : $SHA"
    echo "Port    : 8082"
    echo "Compte  : demo"
    echo "Mode    : données fictives / lecture seule"
    echo
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi

  echo "Attente du démarrage du mode démo... ($attempt/24) état=$STATUS"
  sleep 5
done

echo "ERREUR : le backend ne confirme pas demoMode=true et setupDone=true." >&2
echo "Réponse /api/status : $API_STATUS" >&2
docker logs --tail 120 "$CONTAINER" || true
exit 1
