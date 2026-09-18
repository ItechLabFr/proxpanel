# Security Policy

## Reporting a vulnerability

Please do **not** publish sensitive security vulnerabilities in a public issue.

Use GitHub's **Security → Report a vulnerability** feature when available on the
repository. Include:

- the affected ProxPanel version;
- a clear reproduction path;
- expected vs actual behavior;
- logs or screenshots with secrets removed;
- the potential impact.

Never include Proxmox passwords, API tokens, Microsoft 365 secrets, Discord
webhooks, recovery codes or private infrastructure data in a public report.

## Supported versions

ProxPanel is currently in beta. Security fixes are primarily delivered on the
latest beta/stable release channels.

## Runtime secrets

Persistent secrets belong in `/app/data` and must never be committed to Git.
The repository intentionally excludes runtime data through `.gitignore` and
`.dockerignore`.
