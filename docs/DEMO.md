# ProxPanel Demo

The demo Docker image and deployment are intentionally independent from the normal ProxPanel release workflow.

## Image

```text
itechlab/proxpanel:demo
```

Every manual demo publication also creates an immutable image tag:

```text
itechlab/proxpanel:demo-<commit-sha>
```

## Behaviour

The **Update Demo** workflow is triggered only with `workflow_dispatch`.

A normal push, GitHub Release, Docker Hub beta/stable publication or OTA publication does not publish or deploy the demo image.

The workflow:

1. checks out the selected branch, tag or commit;
2. validates the JavaScript source and version metadata;
3. builds amd64 and arm64 images;
4. publishes `itechlab/proxpanel:demo`;
5. optionally connects to the demo host over SSH and replaces only the `proxpanel-demo` container.

It does not create or modify a GitHub Release, publish OTA metadata, change `beta`, `stable` or `latest`, or revoke releases.

## Required Docker Hub secrets

The workflow reuses:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Optional one-click server deployment

To make **Run workflow** update the server as well, add these repository Actions secrets:

- `DEMO_SSH_HOST` — hostname or IP of the demo Docker host;
- `DEMO_SSH_USER` — SSH account allowed to run Docker;
- `DEMO_SSH_PRIVATE_KEY` — private ED25519 key used only for this deployment;
- `DEMO_SSH_KNOWN_HOSTS` — trusted SSH host-key line for the demo host;
- `DEMO_SSH_PORT` — optional, defaults to `22`;
- `DEMO_DEPLOY_PATH` — optional, defaults to `/opt/proxpanel-demo`.

If the SSH secrets are not present, the image is still published and the server deployment is skipped with a warning.

## First deployment on the demo host

Create the deployment directory and place `docker-compose.demo.yml` there.

Example layout:

```text
/opt/proxpanel-demo/
└── docker-compose.demo.yml
```

Then run once:

```bash
cd /opt/proxpanel-demo
docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
```

The demo is exposed on port `8080` by default. Set `PROXPANEL_DEMO_PORT` before starting the stack if another host port is required.

## Configure the deployment SSH key

Generate a dedicated ED25519 key on an administration workstation:

```bash
ssh-keygen -t ed25519 -f proxpanel-demo-deploy -C github-actions-proxpanel-demo
```

Add `proxpanel-demo-deploy.pub` to the demo server account's `~/.ssh/authorized_keys`.

Store the private key content in `DEMO_SSH_PRIVATE_KEY`.

Populate `DEMO_SSH_KNOWN_HOSTS` only after verifying the server host key through a trusted channel.

The SSH account must be able to run Docker Compose in `/opt/proxpanel-demo`.

## Updating the demo

1. Open **Actions** in the ProxPanel GitHub repository.
2. Select **Update Demo**.
3. Click **Run workflow**.
4. Keep `source_ref=main` for the latest development code, or specify another branch/tag/commit.
5. Keep `deploy_server=true` to update the configured demo host.
6. Use `no_cache=true` only for a full rebuild.
7. Run the workflow.

Nothing happens to the demo between manual runs.

## Manual fallback on the server

```bash
cd /opt/proxpanel-demo
docker compose -f docker-compose.demo.yml pull proxpanel-demo
docker compose -f docker-compose.demo.yml up -d --remove-orphans proxpanel-demo
```

## Verification

```bash
docker compose -f /opt/proxpanel-demo/docker-compose.demo.yml ps
docker logs --tail 100 proxpanel-demo
```

## Security

Do not connect a public demo to a production Proxmox environment with privileged credentials. Use an isolated lab/demo environment and a dedicated account with only the permissions required for the demonstration.
