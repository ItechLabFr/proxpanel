# Security Policy

## Deployment exposure

ProxPanel is primarily intended for **HomeLab environments** and controlled administration networks.

The administration interface is **not designed to be exposed directly to the Internet**. For remote access, use a **VPN**, a **private network**, or another secure access mechanism.

Enable **multi-factor authentication (2FA/MFA)** whenever possible.

ProxPanel is provided **without warranty** under the terms of the **MIT License**.

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


## Reverse proxy trust

ProxPanel ignores `X-Forwarded-For`, `X-Forwarded-Proto` and
`X-Forwarded-Host` unless the direct peer is a trusted proxy. Loopback is
trusted by default. For any other reverse proxy, set
`PROXPANEL_TRUSTED_PROXIES` to a comma-separated list of exact IP addresses
and/or IPv4 CIDRs, for example `10.10.20.5,172.18.0.0/16`.

Do not trust an entire client network merely to make forwarded headers work.
