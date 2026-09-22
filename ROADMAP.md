# ProxPanel Roadmap

This roadmap is indicative and can evolve with testing feedback and Proxmox/Portainer API changes.

## Current status

- Latest published development release: **1.7.2-beta.9**
- The **1.7.1** series reached its planned maximum of 10 betas.
- Current development series: **1.7.2-beta.x**
- Official Docker image architectures: **`linux/amd64` + `linux/arm64`** (Raspberry Pi 64-bit supported).
- A single X.Y.Z series remains limited to **beta.1 → beta.10**; patch prereleases such as **beta.4.1 / beta.4.2** are allowed for targeted corrections/evolutions without consuming a new beta slot.

The 1.7.2 series shifts ProxPanel from a monitoring-oriented panel toward a more complete **HomeLab operations console**, while keeping the application lightweight and avoiding duplication of every native Proxmox feature.

## 1.7.2 design principles

- **Docker first through Portainer.** ProxPanel must not require direct Docker socket access on each host.
- **Portainer is the first officially supported external integration** for 1.7.2. Portainer Community Edition is the primary validation target; Business Edition remains compatible when the API endpoints used by ProxPanel are compatible.
- **PBS remains optional.** PBS-specific navigation should only appear when at least one PBS server is configured.
- **Multi-architecture Docker images are official.** Release images target `linux/amd64` and `linux/arm64`, including Raspberry Pi and other 64-bit ARM systems.
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

## 1.7.2-beta.4 — Docker Dashboard & Proxmox ↔ Docker Topology

Status: **implemented for publication**.

- Add a consolidated Docker Dashboard with container/stack health and top CPU/RAM consumers.
- Keep missing Docker metrics explicitly unavailable instead of estimating them.

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

### 1.7.2-beta.4.3 — Backup Warning Classification & Rich Diagnostics

Status: **implemented for publication**.

- Correct Proxmox `WARNINGS: n` classification.
- Rich warning/critical context across notification channels.
- Backup warning visibility in Panel/PWA.
- Central redaction and bounded task-log excerpts.
- No duplicate generic task + backup alert for `vzdump`.

---

### 1.7.2-beta.4.2 — Mail Diagnostics & Logs

Status: **implemented for publication**.

- Warning and critical emails include their technical source.
- Proxmox task and failed backup emails can include UPID and recent task-log excerpts.
- Docker container incident emails can include recent container logs when Portainer exposes them.
- Portainer/Docker API errors are preserved as technical context.
- Sensitive credentials/tokens are redacted before email generation.
- This patch does not consume the beta.5 roadmap slot.

---

### 1.7.2-beta.4.1 — Docker Metrics Dashboard

Status: **implemented for publication**.

- Proxmox-style historical Docker charts.
- CPU, memory, network RX/TX and container-state history.
- 1 h / 24 h / 7 d / 30 d ranges.
- Global or per-environment scope.
- Persistent 32-day local metric history with downsampling.
- Live refresh and responsive PWA/mobile layout.

---

### 1.7.2-beta.5.1 — Security hotfix

- Strong re-authentication required before disabling 2FA.
- Dedicated throttling and audit for sensitive re-authentication.
- Owner email notification when 2FA is disabled.
- Frontend framework evaluation documented; migration deferred for the 1.7.2 series.

## 1.7.2-beta.5 — Docker Image & Update Management

### Delivered in beta.5

- Image inventory and container/stack relationships through Portainer.
- Digest-based update checks with explicit unknown state when registry evidence is unavailable.
- Manual pull, pre-change preview and post-redeploy health verification.
- Safe standalone-container replacement with rollback attempt and static-network guard.
- Update history, audit, notifications and deterministic demo fixtures.
- Optional background checks and explicit scheduled-action queue inside maintenance windows.
- No uncontrolled automatic update by default.

Status: **implemented for publication**.

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
- Optional scheduled Docker update windows with an explicit per-target queue.
- Individual removal of unused/dangling images only; no blind global prune.
- Deterministic public-demo fixtures for image/update states.
- Responsive phone/tablet/PWA interface.
- **No uncontrolled automatic update by default.**

### Acceptance criteria

- ProxPanel never silently redeploys production containers with the default settings.
- Scheduled operations only run after an authorized user explicitly queues a target.
- Failed redeploys remain visible and actionable.
- Standalone containers with static/advanced networking are refused rather than modified unsafely.
- Remote update checks that cannot be verified remain explicitly unknown.

---

## 1.7.2-beta.6 — PBS + Wazuh Security Essentials

Beta.6 keeps the **existing Proxmox Backup Server integration roadmap unchanged** and adds a focused **Wazuh Security Essentials** integration. The goal is not to reproduce the complete Wazuh dashboard inside ProxPanel, but to surface the security information that requires immediate operational attention and correlate it with the Proxmox/Docker topology already known by ProxPanel.

### Proxmox Backup Server Integration

PBS remains optional and hidden until configured.

#### Connection

- PBS URL.
- User/API token authentication where supported by the implementation.
- TLS validation / self-signed handling.
- Connection diagnostic.

#### Read-only first

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

#### Later in the beta if validation is good

- Trigger safe operational jobs such as Verify/Prune/GC only with explicit confirmation and permission checks.

Full restore orchestration is **not required** for beta.6.

### Wazuh Security Essentials

Wazuh is also optional and must remain completely hidden until configured.

#### Connection model

Use two explicit, independent read-only connections when both are available:

- **Wazuh Server API** for manager health, agents and operational data.
  - Server API URL, normally HTTPS on port 55000.
  - Username/password authentication used only to obtain a short-lived JWT.
  - JWT kept in memory and renewed when required; never exposed to the browser.
- **Wazuh Indexer API** for vulnerability and security-event searches.
  - Indexer URL, normally HTTPS on port 9200.
  - Dedicated read-only credentials.
  - Query vulnerability state from `wazuh-states-vulnerabilities*`.
  - Query only the minimum event data required by the ProxPanel dashboard.
- TLS certificate validation by default.
- Explicit self-signed certificate option per endpoint.
- Separate connection test and diagnostic for Server API and Indexer.
- Secrets encrypted with the existing ProxPanel master-key mechanism and always redacted from UI, audit, e-mail and Discord output.
- A partial outage must be represented as **degraded**, never interpreted as “no vulnerabilities” or “all agents healthy”.

#### Wazuh overview

Add a compact Wazuh Security page/dashboard with only essential indicators:

- Manager status.
- Indexer status.
- Server API status.
- Last successful collection.
- Total agents.
- Active agents.
- Disconnected agents.
- Never-connected agents when reported by Wazuh.
- Number of important alerts in the selected period.
- Critical and High active vulnerabilities.
- Number of affected endpoints.
- Number of vulnerable packages/software items.
- 24 h / 7 d / 30 d time ranges where the source data supports them.

#### Priority security alerts

Do not mirror the full Wazuh event stream.

- Surface only important alerts by default.
- Default high-priority rule-level range: **12–16**, with an administrator-configurable threshold.
- Display:
  - Wazuh rule ID;
  - rule level;
  - description;
  - agent ID/name;
  - endpoint hostname/IP when available;
  - timestamp;
  - source/category;
  - MITRE tactic/technique when present;
  - concise technical context.
- Filters by severity, agent, rule/category and period.
- Search by agent name, rule ID or event text.
- “Open in Wazuh” deep link when a reliable target URL can be generated.
- Full investigation/log search remains in Wazuh.

#### CVE / vulnerability dashboard

Provide a first-class vulnerability view focused on remediation.

For each vulnerability, show when Wazuh exposes the data:

- CVE identifier.
- Severity.
- CVSS score/vector.
- Active / solved status.
- Detection time / last update.
- Wazuh/CTI reference.
- Affected agent / machine.
- Package or software name.
- Installed package/software version.
- Architecture/vendor when available.
- Fixed/remediated version when Wazuh exposes one.
- Whether a correction appears available.
- Number of affected machines.

Views and grouping:

- **By CVE** → affected machines → package/software.
- **By machine** → critical/high CVEs → package/software.
- **By package/software** → CVEs → affected machines.
- Search by CVE, hostname, package or software.
- Critical / High filters.
- “New since last successful collection” indicator.
- “Fix available” filter when source data is reliable.
- Never invent a fixed version if Wazuh does not provide one.

#### Machine security priority

Add a transparent **security priority** indicator to Wazuh-managed endpoints.

The indicator must be explainable and must never replace CVSS/Wazuh severity. Its details show the exact contributors, for example:

- active Critical CVEs;
- active High CVEs;
- recent high-priority Wazuh alerts;
- agent disconnected state;
- sensitive integrity events.

Use simple labels such as **OK / Attention / Critique** instead of pretending to provide a universal security-risk score.

#### Proxmox / Docker correlation

Correlate Wazuh endpoints with ProxPanel infrastructure where confidence is sufficient:

```text
CVE / Wazuh alert
  → package / software
  → Wazuh agent
  → VM / LXC
  → Proxmox node
  → storage
```

When Docker topology is known:

```text
CVE / security alert
  → endpoint / package
  → Docker environment / container when reliably identifiable
  → VM / LXC
  → Proxmox node
```

Correlation rules:

- Assisted matching by hostname/IP only when confidence is high.
- Manual mapping must always be available.
- Ambiguous resources are never linked automatically.
- Manual mapping overrides assisted matching.
- Wazuh security summary appears directly in the corresponding VM/LXC detail page:
  - agent state;
  - Critical/High vulnerability counts;
  - latest important alert;
  - vulnerable packages/software;
  - link to Wazuh Security details.

#### Trends and remediation visibility

- Critical/High vulnerability evolution over 7 and 30 days when enough local history exists.
- New vs solved vulnerabilities.
- Endpoints with the most active Critical/High vulnerabilities.
- Packages/software affecting the most endpoints.
- Endpoints with the highest remediation priority.
- Keep a small local aggregate history only; do not duplicate the Wazuh event store.

#### File Integrity Monitoring essentials

Do not reproduce the complete FIM interface.

Surface only high-value changes when Wazuh reports them, for example:

- SSH configuration.
- `sudoers` / privilege configuration.
- sensitive system configuration.
- executable/service configuration.
- other administrator-selected critical paths.

Show the affected endpoint, path, change type and time, then provide a link back to Wazuh for investigation.

#### Security category summary

Provide a compact recent-event summary for useful categories when the underlying Wazuh rule metadata supports them, such as:

- brute-force/authentication attacks;
- malware detections;
- privilege escalation;
- authentication failures;
- integrity changes.

This is an operational summary, not a replacement for Wazuh MITRE/rule dashboards.

### Professional Panel / E-mail / Discord alerts

Wazuh events must reuse ProxPanel's existing notification channels while providing **security-specific, detailed and professional payloads**.

#### Notification events

Support at minimum:

- Wazuh integration unavailable / recovered.
- Wazuh agent disconnected / recovered after confirmation.
- New Critical vulnerability.
- New High vulnerability when enabled by policy.
- Critical vulnerability solved.
- Important Wazuh alert above configured rule-level threshold.
- Sensitive FIM event when enabled.
- Sudden increase in Critical vulnerabilities.
- Collection/indexer error without falsely clearing existing incidents.

#### Detailed security notification content

For every security notification, include as many verified fields as available:

- severity + event type;
- Wazuh source;
- Wazuh rule ID and rule level for security alerts;
- alert description;
- CVE ID and CVSS for vulnerability notifications;
- vulnerability status;
- endpoint/agent name and agent ID;
- endpoint IP/OS when available;
- correlated Proxmox VMID/LXC ID and machine name when mapped;
- correlated Proxmox node;
- correlated Docker environment/container only when reliable;
- package/software name;
- installed version;
- fixed version **only when supplied by Wazuh/source data**;
- first detected / last observed timestamps;
- MITRE tactic/technique when present;
- concise recommended next action;
- direct ProxPanel route;
- Wazuh deep link when safe and available.

Never include API passwords, JWTs, Indexer credentials, raw authorization headers or unredacted secrets.

#### E-mail presentation

Security e-mails must be immediately understandable without opening ProxPanel:

- clear subject prefix such as `[ProxPanel][Wazuh][CRITIQUE]`;
- readable HTML layout consistent with existing ProxPanel e-mails;
- prominent severity and affected machine;
- structured sections: **Résumé**, **Machine**, **CVE/Alerte**, **Paquet/logiciel**, **Contexte Proxmox/Docker**, **Action recommandée**;
- technical identifiers retained for troubleshooting;
- links to ProxPanel and Wazuh when available;
- recovery/solved e-mails clearly state what returned to normal.

#### Discord presentation

Use concise but information-rich Discord notifications:

- dedicated Wazuh/Security event type compatible with ProxPanel multi-channel Discord configuration;
- severity, machine and CVE/rule visible immediately;
- package/software + installed/fixed version where available;
- Proxmox/Docker correlation;
- concise recommendation;
- timestamps and technical identifiers;
- link to ProxPanel/Wazuh.
- Allow a dedicated Discord security channel/webhook without forcing all Wazuh events into the general channel.

#### Anti-noise controls

Security notifications must not flood the user.

- Deduplicate identical CVE/agent/rule incidents.
- Cooldown per incident.
- Require confirmation across consecutive checks before declaring a transient agent/API outage.
- Send a distinct recovery/solved notification.
- Critical events may notify immediately.
- High events can be immediate or grouped according to administrator policy.
- Optional grouped digest for repeated High findings.
- Manual “send test security notification” from administration.
- Preserve notification/audit history with the reason an event was sent or suppressed.

### Demo and UX

- Add deterministic fictitious Wazuh data to the public demo.
- Never expose real Wazuh infrastructure in demo fixtures.
- Full phone/tablet/PWA responsive pass.
- French and English labels.
- Wazuh navigation appears only when a Wazuh integration is configured.
- Loading or failure of Wazuh must never block the normal Proxmox/Docker dashboard.

### Beta.6 acceptance criteria

- Existing **PBS beta.6 scope remains intact**.
- Wazuh Server API and Indexer credentials are encrypted and never returned to the browser.
- Server API JWT is short-lived/in-memory and never persisted in clear text.
- Wazuh works as a **read-only security integration** in beta.6; no Active Response or destructive Wazuh action is required.
- Indexer/API failure produces an explicit degraded state, never a false “0 vulnerability” state.
- Agent disconnect alerts require confirmation to avoid transient false positives.
- Critical/High CVEs expose machine + package/software + versions whenever the source provides them.
- ProxPanel never invents CVSS, fixed versions, vulnerability state or remediation information.
- Proxmox/Docker correlation is explainable and manually correctable.
- Panel/e-mail/Discord security notifications are detailed, redacted, deduplicated and recoverable.
- Public demo includes realistic fictitious Wazuh/CVE/agent data.
- Mobile/PWA remains fully usable.
- Wazuh failure does not break Proxmox, Docker or PBS views.

---

## 1.7.2-beta.7 — Automations 2.0

Status: **implemented for publication**.

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

### Additional beta.7 deliverables

- Show the exact CPU model for each Proxmox node, plus sockets, cores, threads and frequency when exposed by the Proxmox API.
- Show formatted CPU hardware information in node details.
- Fix the mobile Administration navigation overlay seen on narrow screens.
- Fix manual ZIP update / rollback controls overflowing and overlapping on phones.

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

## 1.7.2-beta.8 — LXC Launch, Update Recovery, Administration UX, RBAC & Audit 2.0

Status: **planned as a major distribution and UX milestone**.

Beta.8 officially launches **native ProxPanel installation in a Proxmox LXC** alongside the existing Docker distribution. Docker remains fully supported; LXC becomes an additional official installation method, not a replacement.

### Official native LXC distribution

- Official Debian 13 LXC installation path.
- Unprivileged container by default.
- Native Node.js/systemd runtime: **no Docker inside the LXC**.
- One permanent public installation command:
  `bash -c "$(curl -fsSL https://updates.proxpanel.fr/lxc.sh)"`
- Guided installer with automatic Proxmox detection and sensible defaults.
- User only chooses the Debian template storage and the LXC rootfs/disk storage when several compatible choices exist.
- Automatic CT ID, hostname, CPU, RAM, disk size, bridge, Debian 13 template and Beta channel defaults.
- Default recommendation: 2 vCPU, 2 GiB RAM and 8 GiB disk.
- Official amd64 and arm64 support.
- LXC releases are distributed from `updates.proxpanel.fr`, with SHA-256 verification.
- LXC package naming: `proxpanel-lxc-v<VERSION>.tar.gz`.
- Future Beta releases must ship three coherent packages for the same version:
  - `proxpanel-update-v<VERSION>.zip` — universal OTA update for Docker and LXC;
  - `proxpanel-v<VERSION>.zip` — complete package;
  - `proxpanel-lxc-v<VERSION>.tar.gz` — new LXC installations.
- Docker images remain published separately in multi-architecture amd64/arm64 form.

### Universal OTA + complete update / repair

The existing OTA remains the recommended update path for both Docker and LXC installations.

Add a second recovery-oriented path in **Administration → Updates**:

- **OTA update** — default and recommended; installs the incremental OTA package.
- **Complete update** — reinstalls the complete ProxPanel application release while preserving persistent data, settings and integrations.
- **Repair current installation** — re-downloads/reinstalls the complete package for the currently installed version without changing version.
- Complete update/repair must never reset user data.
- Validate product, version, archive structure and SHA-256 before switching releases.
- Stage the new release before activation.
- Keep the current release available for rollback.
- Run a post-switch `/healthz` verification.
- Automatically return to the previous release if the new release fails the health check.
- Surface when an old installed version cannot use a direct OTA and requires a complete update.

### Administration UX redesign

The Administration area receives a substantial information-architecture and responsive redesign.

Goals:

- Remove the current “everything in one place” feeling.
- Reduce unnecessary controls and duplicated actions.
- Make common actions reachable in one or two clicks.
- Separate configuration, integrations, security, updates and advanced/diagnostic operations clearly.
- Use a clean Administration home with health/status summary and shortcuts.
- Replace the long flat navigation with grouped sections and clearer hierarchy.
- Improve search/filter of Administration sections.
- Keep destructive or rare actions in contextual **Advanced** / **Maintenance** areas.
- Standardize cards, forms, spacing, button placement, help text and empty states.
- Remove large unused whitespace and prevent compressed cards/tables.
- Full responsive pass for desktop, tablet, mobile and PWA.
- No sticky/overlay navigation covering content on narrow screens.
- Modals, tables, file selectors and action rows must remain inside the viewport.
- Light/Dark themes and density settings must remain visually consistent.

### Global display / responsive correction pass

Beta.8 includes a broad UI quality pass rather than isolated CSS patches.

- Audit every primary page at desktop, tablet and phone breakpoints.
- Fix overflowing text, clipped controls, duplicated bars, compressed cards and inconsistent heights.
- Fix long labels and technical values without breaking layouts.
- Improve tables that become unusable on phones.
- Normalize spacing and section headers.
- Improve loading, warning, degraded and empty states.
- Ensure notification details and error messages remain readable without horizontal scrolling.
- Validate PWA navigation and Administration after screen rotation/resizing.

### Node processor model reliability

Fix **“Processeur — Modèle indisponible”** when Proxmox itself exposes the processor model.

- Read the documented `/nodes/{node}/status` CPU information first.
- Accept compatible model field variants returned by supported Proxmox versions.
- Do not mark hardware as fully available when the model field is empty.
- When API data is incomplete and a PAM/SSH connection is available, use a safe read-only fallback through `lscpu` / `/proc/cpuinfo`.
- Cache successful hardware identification while avoiding long-lived negative cache entries.
- Expose the source used: Proxmox API or SSH fallback.
- Show an actionable diagnostic when neither source can provide the model.
- Never invent a CPU model.
- Keep sockets, cores, threads and frequency visible independently when available.

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

### Beta.8 release acceptance criteria

- A fresh ProxPanel installation can be completed through the permanent `lxc.sh` command on supported Proxmox VE hosts.
- Docker and LXC installations can both install the same OTA package for a given ProxPanel version.
- Complete update and repair preserve persistent data and can roll back on failed health verification.
- Administration remains usable without overlaps or horizontal overflow on desktop, tablet and phone.
- The processor model shown by Proxmox is also shown by ProxPanel when accessible through the API or configured SSH fallback.
- Beta.8 publication is not complete until OTA, full ZIP, LXC package and Docker multi-arch image all represent the exact same ProxPanel version.

---

## 1.7.2-beta.9 — Health Center 2.0, Warning Lifecycle & Polish

Status: **implementation complete — final validation pending**.

Replace the simple problem list with a real incident workflow and make warnings actionable instead of leaving a permanently growing list.

### Incident lifecycle

Every problem/warning receives an explicit state:

- **New** — newly detected and not reviewed.
- **Acknowledged** — an administrator has seen and accepted ownership of the incident.
- **Snoozed** — hidden from active attention until a chosen date/time.
- **Resolved** — manually or automatically marked as resolved.
- **Dismissed** — removed from the active view while keeping an audit/history entry.
- **Ignored / accepted risk** — intentionally excluded from active warnings until the rule is re-enabled.

For each state, keep:

- incident start time;
- last check;
- detection source/evidence;
- current state;
- actor who changed the state;
- date/time of the action;
- optional comment/reason;
- automatic recovery state and recovery notification;
- full incident history.

### Warning actions

From the warning list and incident details, add:

- **Validate / acknowledge**;
- **Mark as resolved**;
- **Clear from active view**;
- **Snooze** for a duration or until a date/time;
- **Ignore / accept risk** for persistent expected conditions;
- **Reopen** a resolved/dismissed incident;
- **Restore ignored warning**;
- bulk selection and bulk actions.

Important behavior:

- ProxPanel must never delete the original Proxmox/Portainer/PBS/Wazuh source event.
- “Clear” only removes the incident from the active Health Center view; it remains in history/audit.
- If the underlying condition is still present after a clear/resolve, ProxPanel may reopen the incident according to its rule/cooldown.
- Acknowledging a warning must never change infrastructure state by itself.
- Every manual action is audited.

### Expected-condition exclusions

Some warnings are legitimate by design, especially **Machine non protégée**.

Allow scoped exclusions:

- specific VM/LXC;
- Proxmox tag/group;
- specific warning rule;
- server/node scope when relevant;
- optional expiry date;
- required reason/comment.

Example:

```text
LAB-WAZHU (100)
Machine non protégée

[Valider] [Résoudre] [Snooze] [Ignorer ce VM] [Détails]
```

An ignored VM must not disappear silently: show it in a dedicated **Ignored / accepted risks** view.

### Health Center workflow

- Active incidents grouped by severity and source.
- Separate views:
  - Active;
  - Acknowledged;
  - Snoozed;
  - Resolved;
  - Ignored / accepted risks;
  - History.
- Incident counters by severity and state.
- Search and filters by:
  - source;
  - server;
  - node;
  - VM/LXC/container;
  - warning type;
  - severity;
  - state;
  - date.
- “Select all” and bulk acknowledge/resolve/snooze/dismiss.
- Maintenance suppression.
- Cooldown and duplicate suppression.
- Correlate related Proxmox, backup, Docker, PBS and Wazuh events.
- Unified Health Center source adapters for Proxmox, Docker/Portainer, Wazuh and PBS.
- Automatic incident recovery when Docker, Wazuh or PBS returns to a healthy state.
- Health Center source filter and unified dashboard counters.
- Improve cluster health explanations.
- Recovery notifications only when the incident was previously active.
- Do not recreate duplicate incidents at every refresh.

### UX / polish

- Replace the current flat “Problèmes à corriger” list with a real Health Center.
- Quick actions available without opening every detail page.
- Clear distinction between:
  - real active problem;
  - acknowledged problem;
  - accepted risk;
  - historical/resolved problem.
- Keep destructive infrastructure actions separate from warning-management actions.
- Responsive desktop/tablet/mobile/PWA.
- Final Light/Dark theme pass for 1.7.2 features.

### Delivered in beta.9

- Persistent Health Center lifecycle: active, acknowledged, snoozed, resolved, dismissed and accepted risk.
- Unified incident sources:
  - Proxmox / backup warnings;
  - Docker / Portainer incidents;
  - Wazuh integration health, disconnected agents, critical/high CVEs, important alerts and optional sensitive FIM events;
  - PBS integration health, datastore pressure, recent failed tasks and failed verification states.
- Automatic resolution when the underlying source condition clears.
- Source badges and source filtering in the Health Center.
- Dashboard Health Center widget uses the unified incident inventory.
- Accepted-risk rules remain scoped to source + warning code + target.
- Audit 2.0 search and filters by user, action and result.
- Audit export in CSV and JSON.
- Active ProxPanel sessions can be listed and revoked from Administration → Users & security.
- Logout revokes the corresponding server-side session record.
- Custom roles gain the dedicated `health.manage` permission.

### Acceptance criteria

- A user can acknowledge, snooze, resolve, dismiss or ignore a warning without deleting the source event.
- A persistent unresolved condition can re-open after being manually cleared.
- Accepted-risk exclusions survive application restarts.
- Every warning state change is present in audit/history.
- Bulk actions work on several incidents.
- “Machine non protégée” can be intentionally excluded per VM/LXC without disabling backup monitoring globally.
- Health Center remains usable on mobile and with dozens/hundreds of incidents.

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
