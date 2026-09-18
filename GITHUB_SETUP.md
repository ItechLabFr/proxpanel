# GitHub publication checklist

## Repository

Recommended repository name: `proxpanel`

Recommended description:

> Modern self-hosted management and monitoring panel for Proxmox VE — dashboards, VM/LXC operations, backups, OTA updates, TV mode, alerts, 2FA and more.

Recommended website:

``https://proxpanel.fr``

Recommended topics:

`proxmox`, `proxmox-ve`, `homelab`, `self-hosted`, `docker`, `monitoring`, `dashboard`, `pwa`, `virtualization`, `nodejs`

## Before making the repository public

- Review `LICENSE` and confirm that the source-available terms match what you want.
- Add current screenshots under `docs/screenshots/`.
- Enable GitHub secret scanning / push protection when available.
- Enable private vulnerability reporting under Security settings.
- Enable Issues.
- Optionally enable Discussions.
- Set the repository social preview using the official ProxPanel logo or a branded banner.

## Initial push

```bash
git init
git branch -M main
git add .
git commit -m "Initial public release: ProxPanel 1.7.0-beta.15"
git remote add origin https://github.com/ItechLabFr/proxpanel.git
git push -u origin main
```

## First GitHub release

Tag:

`v1.7.0-beta.15`

Suggested title:

`ProxPanel 1.7.0-beta.15`

```bash
git tag -a v1.7.0-beta.15 -m "ProxPanel 1.7.0-beta.15"
git push origin v1.7.0-beta.15
b``

Use the matching `release.json`/CHANGELOG content for the release notes.
