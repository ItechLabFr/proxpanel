# Contributing to ProxPanel

Thank you for taking the time to help improve ProxPanel.

## Before submitting

- Check existing issues first.
- Never post passwords, tokens, webhooks, private keys, private IPs or user data.
- Include your ProxPanel version and Proxmox VE version when relevant.
- Keep bug reports focused on one reproducible problem.

## Pull requests

For UI changes, include screenshots when possible.

Before submitting a patch:

```bash
node --check app/server.js
node --check app/public/app.js
node --check launcher.js
docker build -t proxpanel:test .
```

Confirm that your change does not:

- break persistent `/app/data` compatibility;
- expose secrets in frontend responses;
- send infrastructure data to the OTA server;
- break FR/EN rendering of new user-facing text.

## Public demo parity — required

Every new user-visible feature must have representative fake data in `PROXPANEL_DEMO_MODE` before the change is considered complete.

This includes new pages, dashboard widgets, integrations, resources, metrics, alerts, monitoring views, detail panels, backup/storage/task features, Docker/Portainer features and update screens.

When relevant, demo fixtures should show more than the happy path: for example running/stopped, healthy/unhealthy, normal/warning/error states.

The public demo must:

- work without a real Proxmox, Portainer or other external service;
- expose realistic but entirely fictitious data;
- allow navigation through the new feature and its details;
- remain read-only for infrastructure-changing actions;
- never contain real credentials, hosts, IP addresses or customer data.

A feature that exists in production mode but is empty or requires a real external integration in demo mode is considered incomplete.

See `docs/DEMO.md` for the demo deployment and validation rules.

## AI-assisted contributions

AI-assisted code or documentation contributions are welcome, but contributors are expected
to review and test what they submit.
