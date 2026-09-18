# ProxPanel Roadmap

This roadmap is indicative and can evolve with testing feedback and Proxmox/Portainer API changes.

## Current status

- Latest published development release: **1.7.2-beta.3**
- The **1.7.1** series reached its planned maximum of 10 betas.
- Current development series: **1.7.2-beta.x**
- A single X.Y.Z series remains limited to **beta.1 → beta.10**.

The 1.7.2 series shifts ProxPanel from a monitoring-oriented panel toward a more complete **HomeLab operations console**, while keeping the application lightweight and avoiding duplication of every native Proxmox feature.

## 1.7.2 design principles

- **Docker first through Portainer.** ProxPanel must not require direct Docker socket access on each host.
- **Portainer is the first officially supported external integration** for 1.7.2. Portainer Community Edition is the primary validation target; Business Edition remains compatible when the API endpoints used by ProxPanel are compatible.
- **PBS remains optional.** PBS-specific navigation should only appear when at least one PBS server is configured.
- Integrations must use explicit credentials/tokens, clear health states and safe failure handling.
- A temporary integration failure must never be interpreted as destructive or definitive infrastructure state.
- Prefer observability, guided operations and topology over recreating every Proxmox configuration screen.
- New user-facing functionality must remain responsive and available in **French and English**.
- Sensitive actions must require confirmation and generate an audit entry.

---

## 1.7.2-beta.1 — Repository Foundation & Portainer Core

Status: **implemented for publication**.

### Repository foundation

- Bring README, HISTORY, ROADMAP and release documentation in sync with the actual published version.
- Remove/deprecate obsolete OTA metadata files in favor of the root `release.json`.
- Align documented GitHub revocation policy with the automated release workflow.
- Add the first functional test coverage for high-risk logic such as backup alerting.
- Prepare the integration architecture for multiple external services without exposing unused modules.

### Portainer Core

- Re-enable the Integrations area with a focused Portainer workflow.
- Add Portainer using:
  - URL;
  - API key / access token;
  - TLS validation;
  - optional self-signed certificate support.
- Test connection and display an explicit diagnostic.
- Discover Portainer environments/endpoints.
- Support **Docker Standalone first**.
- Do not hard-code the integration to Portainer Community Edition: detect version/edition when exposed by the API and keep Business Edition compatible.
- Introduce a first-class **Docker** navigation entry only when Portainer is configured.
- Docker overview:
  - environment name;
  - online/offline state;
  - Docker version when available;
  - container totals;
  - running/stopped/unhealthy counts;
  - basic host metadata.

### Acceptance criteria

- No Docker socket needs to be mounted in ProxPanel.
- One Portainer instance can expose multiple Docker environments.
- Portainer failure does not break the Proxmox dashboard.
- An unconfigured installation has no useless Docker/PBS navigation.

---

## 1.7.2-beta.2 — Docker Containers & Stacks

- Container inventory by Portainer environment.
- Name, image, state, health, uptime, ports, networks and stack.
- CPU/RAM metrics when available through the Portainer/Docker API.
- Container actions:
  - start;
  - stop;
  - restart;
  - pause/resume where supported.
- Logs viewer.
- Inspect view with secrets redacted where appropriate.
- Container console/exec where supported.
- Stack inventory.
- Stack → containers relationship.
- Stack start/stop/redeploy operations with confirmation.
- Compose/source metadata displayed read-only first; do not expose secrets.

### Acceptance criteria

- Actions are scoped to the correct Portainer environment.
- All destructive or disruptive operations are audited.
- Mobile container/stack views remain usable.

---

## 1.7.2-beta.3 — Docker Monitoring & Alerts

- Portainer environment unreachable.
- Docker Engine unreachable.
- Container stopped unexpectedly.
- Container health = unhealthy.
- Repeated container restarts.
- CPU/RAM threshold warnings where metrics are available.
- Docker disk/image pressure indicators when reliable data is available.
- Stack partially degraded.
- Recovery notifications when a Docker incident clears.
- Panel / Discord / e-mail event types for Docker.
- Alert cooldown and duplicate suppression.

### Acceptance criteria

- Temporary Portainer API errors never become false “container stopped” incidents.
- Incident/recovery state remains stable across refreshes.

---

## 1.7.2-beta.4 — Proxmox ↔ Docker Topology

Create a topology model linking infrastructure layers.

Examples:

```text
Domain
  → Nginx Proxy Manager
  → Container
  → Stack
  → Docker environment
  → VM/LXC
  → Proxmox node
  → Storage
```

- Manual mapping between a Portainer environment and a Proxmox VM/LXC.
- Assisted matching using hostname/IP when confidence is high.
- Never auto-link ambiguous resources without confirmation.
- Display Docker state inside VM/LXC details.
- Display the Proxmox host path inside Docker views.
- Extend dependency map with Docker and stack entities.
- Optional NPM-aware relationships when NPM integration is configured later.

### Acceptance criteria

- A Docker environment can always be manually corrected/reassigned.
- Topology remains useful with several PVE servers and several Docker hosts.

---

## 1.7.2-beta.5 — Docker Image & Update Management

- Detect currently used image/tag/digest.
- Surface image update availability when it can be determined reliably.
- Separate:
  - update detected;
  - pull available;
  - redeploy required.
- Pull image manually.
- Redeploy a container/stack with explicit confirmation.
- Pre-update summary.
- Post-redeploy health verification.
- Update history / audit.
- Optional scheduled Docker update windows.
- **No uncontrolled automatic update by default.**

### Acceptance criteria

- ProxPanel never silently redeploys production containers with the default settings.
- Failed redeploys remain visible and actionable.

---

## 1.7.2-beta.6 — Proxmox Backup Server Integration

PBS remains optional and hidden until configured.

### Connection

- PBS URL.
- User/API token authentication where supported by the implementation.
- TLS validation / self-signed handling.
- Connection diagnostic.

### Read-only first

- PBS version/health.
- Datastores.
- Capacity / used / free.
- Backup groups and snapshots.
- VM/LXC restore points.
- Last backup by guest.
- Verify jobs/status.
- Prune jobs/status.
- Garbage Collection status.
- Sync jobs/status.
- Recent tasks/errors.

### Later in the beta if validation is good

- Trigger safe operational jobs such as Verify/Prune/GC only with explicit confirmation and permission checks.

Full restore orchestration is **not required** for beta.6.

---

## 1.7.2-beta.7 — Automations 2.0

Expand the current automation engine beyond simple waits and machine actions.

- Conditions.
- Retry policies.
- Timeouts.
- Wait-until state.
- Actions by tag/group.
- Docker actions.
- Backup steps.
- Dependencies between steps.
- Conditional branches.
- Dry-run / execution preview.
- Reusable templates.
- Full execution history with per-step result.

Example:

```text
23:00
→ stop machines tagged test
→ wait until stopped
→ run backup
→ wait for successful completion
→ stop secondary Docker stack
→ optionally shut down secondary node
```

---

## 1.7.2-beta.8 — RBAC & Audit 2.0

### RBAC

Current roles/permissions become scope-aware.

- Permission by Proxmox server.
- Permission by node.
- Permission by VM/LXC tag/group.
- Docker environment scope.
- Read vs control vs console separation.
- Custom roles.
- Session list.
- Revoke active sessions.

### Audit

- Searchable audit timeline.
- Filters by user, action, server, VMID/container and result.
- Before/after change diff where available.
- Link an audit event to its Proxmox/Docker task.
- Export JSON/CSV where appropriate.
- Clear actor, target, time and result.

---

## 1.7.2-beta.9 — Health Center 2.0 & Polish

Replace the simple problem list with a real incident workflow.

- Incident start time.
- Last check.
- Detection source/evidence.
- Current state.
- Acknowledge.
- Snooze for a defined period.
- Maintenance suppression.
- Cooldown.
- Recovery state and recovery notification.
- Incident history.
- Correlate related Proxmox, backup and Docker events.
- Improve cluster health explanations.
- Final responsive and Light/Dark pass for 1.7.2 features.

---

## 1.7.2-beta.10 — Stabilization

- Functional regression tests.
- Backup alert regression tests.
- Portainer mock/API tests.
- Permission tests.
- OTA upgrade test from latest 1.7.1.
- PWA/mobile/tablet regression pass.
- Accessibility pass.
- French/English audit.
- Performance profiling.
- Workflow/release cleanup.
- Documentation finalization.
- Prepare RC/stable decision.

---

## Deferred / not a 1.7.2 priority

These features may return later but are deliberately not core objectives for 1.7.2:

- Full VM/LXC creation wizard.
- Full Proxmox firewall replacement.
- Full SDN management.
- Energy/cost estimation when reliable source data is unavailable.
- Full inter-cluster migration orchestration.
- Full PBS restore orchestration.
- Kubernetes management through Portainer.

The native Proxmox/Portainer interfaces remain the source for advanced configuration workflows that ProxPanel does not yet expose.

## Feature requests

Focused feature requests are welcome through GitHub Issues. New ideas should be evaluated against the main goal of ProxPanel: **a clear, safe and efficient HomeLab operations interface across Proxmox and Docker**.
