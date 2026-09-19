#!/bin/sh
set -eu
IMAGE="${DOCKERHUB_IMAGE:-itechlab/proxpanel}"
VERSION="1.7.2-beta.5"

docker buildx inspect proxpanel-builder >/dev/null 2>&1 || docker buildx create --name proxpanel-builder --use
docker buildx use proxpanel-builder

docker buildx build --pull --no-cache \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION="$VERSION" \
  --provenance=true --sbom=true \
  -t "$IMAGE:$VERSION" -t "$IMAGE:beta" --push .

echo "Publié : $IMAGE:$VERSION et $IMAGE:beta"
echo "Contrôle recommandé : Docker Hub Scout ou 'docker scout cves registry://$IMAGE:$VERSION --only-severity critical,high'"
