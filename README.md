<p align="center">
  <img src="docs/assets/proxpanel-logo.png" width="150" alt="ProxPanel logo">
</p>

<h1 align="center">ProxPanel</h1>

<p align="center">
  A modern self-hosted management and monitoring panel for Proxmox VE.
</p>

<p align="center">
  <a href="https://proxpanel.fr">Website</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="https://hub.docker.com/r/itechlab/proxpanel">Docker Hub</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

> **Beta software.** ProxPanel is under active development. Back up your configuration before testing new releases.

## About

ProxPanel is a **personal, independent project** designed to provide a cleaner and more centralized way to monitor and operate Proxmox VE environments from a responsive web interface.

The project is **not affiliated with, endorsed by, or sponsored by Proxmox**.

Development is **AI-assisted** for parts of design, code generation, refactoring, documentation and testing. Project direction, review and release decisions remain under the maintainer's control.

## Highlights

- Responsive dashboard for Proxmox VE nodes, VMs and LXCs
- Customizable Dashboard Studio
- TV mode with Classic, Charts and Custom layouts
- CPU, RAM, storage, network and historical metrics
- Node CPU temperature collection through `lm-sensors`
- VM/LXC operations and administration workflows
- Backup and task visibility
- Stable / Beta OTA update channels
- Scheduled automatic ProxPanel updates
- Proxmox update checks and notifications
- Panel, Discord and e-mail notifications
- Microsoft 365 Graph / SMTP support
- TOTP 2FA, recovery codes and e-mail fallback
- Persistent installation identity with privacy-minimal OTA heartbeat
- PWA support
- French / English interface
- Docker deployment

## Screenshots

Current screenshots can be added under [`docs/screenshots`](docs/screenshots/README.md). Before publishing a screenshot, make sure it does not expose private hostnames, IP addresses, e-mail addresses or other infrastructure details.

## Quick start with Docker

```bash
docker volume create proxpanel_data
docker volume create proxpanel_runtime

docker run -d \
  --name proxpanel \
  --restart unless-stopped \
  -p 8080:8080 \
  -v proxpanel_data:/app/data \
  -v proxpanel_runtime:/opt/proxpanel-runtime \
  itechlab/proxpanel:1.7.0-beta.14
```

Open:

```text
http://YOUR-SERVER-IP:8080
```

At first launch, ProxPanel asks you to create the first administrator account and then add your Proxmox VE server or cluster.

## Docker Compose

```bash
mkdir proxpanel && cd proxpanel
curl -O https://raw.githubusercontent.com/ItechLabFr/proxpanel/main/docker-compose.yml
docker compose up -d
```

Or clone this repository and run:

```bash
docker compose up -d
```

Persistent data is stored in Docker volumes and survives container recreation.

## Requirements

For the core application:

- Docker / Docker Compose
- Access from ProxPanel to the Proxmox VE API

For node temperature monitoring:

- `lm-sensors` installed on the monitored Proxmox node
- a Proxmox `@pam` account with a stored password
- SSH access from the ProxPanel container to the node

The official Docker image includes the SSH client and `sshpass` required by the temperature collector.

## Updates

ProxPanel supports two independent OTA channels:

- **Stable** — recommended releases for normal use
- **Beta** — early access to new features; can also move forward to a newer stable release

The selected channel is persistent and is not inferred from the currently installed version. ProxPanel also prevents automatic downgrades.

Official OTA service:

`https://updates.proxpanel.fr`

OTA packages include a `release.json` manifest and are validated before installation.

## Privacy of OTA heartbeat

The OTA service receives only:

```json
{
  "installation_id": "persistent-local-uuid",
  "version": "1.7.0-beta.14",
  "update_channel": "beta"
}
```

ProxPanel does **not** send Proxmox IP addresses, hostnames, VM/LXC inventory, API tokens, user accounts or infrastructure data to the OTA service.

## Persistent data and secrets

Runtime configuration belongs in `/app/data` and the OTA runtime in `/opt/proxpanel-runtime`.

Do not commit:

- `.env`
- `data/`
- `runtime/`
- `settings.json`
- `servers.json`
- `users.json`
- API tokens, passwords, webhooks or private keys

The repository includes `.gitignore` and `.dockerignore` rules for these paths.

## Build locally

```bash
docker build -t proxpanel:local .
```

Run it with persistent volumes:

```bash
docker run -d \
  --name proxpanel-local \
  -p 8080:8080 \
  -v proxpanel_data:/app/data \
  -v proxpanel_runtime:/opt/proxpanel-runtime \
  proxpanel:local
```

## Multi-architecture Docker publishing

The provided publishing script targets `linux/amd64` and `linux/arm64`:

```bash
DOCKERHUB_IMAGE=itechlab/proxpanel ./docker-publish.sh
```

## Security

See [`SECURITY.md`](SECURITY.md) for vulnerability reporting and [`SECURITY-IMAGE.md`](SECURITY-IMAGE.md) for Docker image hardening notes.

Never post credentials, Proxmox tokens, Microsoft 365 secrets, Discord webhooks or private infrastructure details in a public GitHub issue.

## Contributing

Bug reports, focused feature requests and reviewed pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Project status

Current release: **1.7.0-beta.14**

ProxPanel is currently a beta personal project. APIs, UI elements and internal implementation details may still change before a stable release.

## License

ProxPanel is released under the **MIT License**. You may use, copy, modify, redistribute, sublicense and sell copies of the software, subject to the MIT License terms.

See [`LICENSE`](LICENSE).
