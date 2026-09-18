# ProxPanel Demo

The public/demo Docker image is intentionally independent from the normal ProxPanel release workflow.

## Image

```text
itechlab/proxpanel:demo
```

Every manual demo publication also creates an immutable image tag:

```text
itechlab/proxpanel:demo-<commit-sha>
```

## Updating the demo image

The workflow is manual only.

1. Open the GitHub repository.
2. Open **Actions**.
3. Select **Update Demo**.
4. Click **Run workflow**.
5. Leave `source_ref` on `main` to publish the latest main branch, or enter a branch/tag/commit.
6. Enable `no_cache` only when a full rebuild is required.
7. Run the workflow.

The workflow validates the source, builds the image for amd64 and arm64, then publishes:

- `itechlab/proxpanel:demo`
- `itechlab/proxpanel:demo-<commit-sha>`

It does **not** create or modify a GitHub Release, publish an OTA release, update the `beta`, `stable` or `latest` Docker tags, or revoke old releases.

The workflow reuses the existing repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Deploying the demo host

Copy `docker-compose.demo.yml` onto the demo Docker host and run:

```bash
docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
```

The included Watchtower instance monitors only the container carrying the Watchtower enable label. It checks Docker Hub every 60 seconds. Because the `demo` tag changes only when **Update Demo** is launched manually, the server changes only after an explicit demo publication.

To inspect the running container:

```bash
docker compose -f docker-compose.demo.yml ps
docker logs --tail 100 proxpanel-demo
```

To force a refresh manually:

```bash
docker compose -f docker-compose.demo.yml pull proxpanel-demo
docker compose -f docker-compose.demo.yml up -d proxpanel-demo
```

## Security

Do not connect a public demo to a production Proxmox environment with privileged credentials. Use an isolated lab/demo environment and a dedicated account with only the permissions required for the demonstration.
