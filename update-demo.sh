#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Mise à jour du code depuis GitHub"
git fetch origin main
git checkout main
git pull --ff-only origin main

sha="$(git rev-parse --short=12 HEAD)"
export PROXPANEL_DEMO_VERSION="demo-$sha"

echo "==> Build local de ProxPanel Demo ($PROXPANEL_DEMO_VERSION)"
docker compose -f docker-compose.demo.yml build --pull proxpanel-demo

echo "==> Redémarrage de la démo"
docker compose -f docker-compose.demo.yml up -d --force-recreate --remove-orphans proxpanel-demo

echo "==> Vérification"
for attempt in $(seq 1 18); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' proxpanel-demo 2>/dev/null || true)"
  case "$status" in
    healthy|running)
      echo "ProxPanel Demo est $status."
      echo "Image locale : proxpanel-demo:local"
      echo "Commit déployé : $sha"
      exit 0
      ;;
    unhealthy|exited|dead)
      echo "Le conteneur est en état $status." >&2
      docker logs --tail 100 proxpanel-demo || true
      exit 1
      ;;
  esac
  sleep 5
done

echo "Délai dépassé pendant le contrôle de santé." >&2
docker logs --tail 100 proxpanel-demo || true
exit 1
