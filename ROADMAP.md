# ProxPanel Roadmap

This roadmap is indicative and can change as the project evolves.

## Current development series — 1.7.1

### 1.7.1-beta.1 — Console Reliability & Fast Mobile PWA Startup

Published.

- Remote-console diagnostics.
- noVNC reconnect handling.
- Mobile/tablet console improvements.
- Faster PWA startup on iPhone and tablets.

### 1.7.1-beta.2 — Infrastructure UX & Monitoring

The following work is intentionally grouped into a single beta.2 release.

#### VM storage visibility

- Show virtual disks attached to Windows and Linux QEMU VMs.
- Show filesystem/volume size, used space and free space when the guest can report it.
- Use the QEMU Guest Agent when available.
- Clearly distinguish Proxmox virtual disk capacity from guest filesystem usage.
- Support multiple disks, partitions and mount points.
- Clearly report Guest Agent unavailable, not running, timeout, unsupported response, insufficient permissions or unavailable filesystem information.
- Never display guessed filesystem usage as real guest data.

#### Multi-node interface redesign

- Remove duplicated resource/progress bars.
- Stop squeezing node information into narrow cards.
- Improve hierarchy: cluster/group → node → resources → machines/storage.
- Make node name, server/cluster source and health state immediately identifiable.
- Rework node cards for two or more nodes.
- Keep temperature, CPU, RAM, storage and connectivity readable for every node.
- Prefer horizontal scrolling or stacked layouts over unreadable compressed cards.

#### Global responsive audit

Audit the entire application, not only login/MFA:

- Dashboard, Machines, Nodes, Monitoring, Storage, Backups and Tasks.
- Dependencies, Changes, Maintenance, PVE updates and Automations.
- Notifications, Users, Administration and console dialogs.
- Generic modals, confirmation dialogs, tables, cards, filters and action buttons.

Mobile/tablet requirements:

- iPhone PWA safe areas.
- Android and iPad/tablet layouts.
- Virtual keyboard handling.
- Touch targets of at least ~44 px where practical.
- No hidden navigation actions.
- No important content outside the viewport.
- Responsive cards or controlled horizontal scrolling for tables.
- Small-screen modals must remain usable and scrollable.

#### Monitoring redesign

- Clear cluster/server/node health summary.
- Proxmox API reachability and latency.
- Node connectivity state.
- CPU usage and load.
- RAM usage.
- Storage capacity and usage.
- Network activity.
- Node temperatures and lm-sensors diagnostics.
- Guest Agent/storage-data availability where relevant.
- Last successful refresh and stale-data indication.
- Human-readable warning, critical, unavailable and stale states.
- Same monitoring data model in grouped and individual node views.

### beta.2 acceptance criteria

- Windows and Linux QEMU VM storage has a useful explicit state even when Guest Agent data is unavailable.
- Multi-node layouts remain readable with at least two nodes.
- Main pages are usable on iPhone portrait, tablet portrait and desktop.
- Monitoring clearly separates healthy, warning, critical, unavailable and stale states.
- No regression in LXC storage, temperature collection, login/MFA, console or PWA startup.
- New user-facing text is available in French and English.

## After beta.2

The remaining 1.7.1 betas are reserved for testing feedback, fixes, stabilization and smaller improvements discovered during beta.2 validation.

The 1.7.1 series remains limited to a maximum of 10 beta releases.

## Later

- Additional integrations where they provide clear operational value.
- More advanced capacity and historical analytics.
- More granular user permissions and audit workflows.

Feature requests are welcome through GitHub Issues.
