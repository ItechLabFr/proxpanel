#!/bin/sh
set -eu
IMAGE="${DOCKERHUB_IMAGE:-itechlab/proxpanel}"
VERSION="${PROXPANEL_VERSION:-$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' app/package.json | head -n 1)}"
[ -n "$VERSION" ] || { echo "Impossible de déterminer la version depuis app/package.json" >&2; exit 1; }

docker buildx inspect proxpanel-builder >/dev/null 2>&1 || docker buildx create --name proxpanel-builder --use
docker buildx use proxpanel-builder

docker buildx build --pull --no-cache \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION="$VERSION" \
  --provenance=true --sbom=true \
  -t "$IMAGE:$VERSION" -t "$IMAGE:beta" --push .

echo "Publié : $IMAGE:$VERSION et $IMAGE:beta"
echo "Contrôle recommandé : Docker Hub Scout ou 'docker scout cves registry://$IMAGE:$VERSION --only-severity critical,high'"
