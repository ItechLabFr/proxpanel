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

## AI-assisted contributions

AI-assisted code or documentation contributions are welcome, but contributors are expected
to review and test what they submit.
