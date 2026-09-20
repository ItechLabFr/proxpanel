# Autorisations API Proxmox VE pour ProxPanel

> ProxPanel applique le principe du moindre privilège. Il n'est pas nécessaire d'utiliser le rôle `Administrator`.

Le rôle prédéfini `PVEVMUser` **ne suffit pas à lui seul** pour ProxPanel.

Il couvre les opérations courantes sur les VM/LXC (lecture, sauvegarde, console et alimentation), mais ProxPanel lit également des informations au niveau **cluster**, **nœuds** et **stockages** pour construire le dashboard et le monitoring.

## Profil minimum recommandé

Pour un usage standard de ProxPanel (dashboard, inventaire VM/LXC, métriques, démarrage/arrêt/redémarrage, console et informations invité), créez un rôle personnalisé.

### Proxmox VE 9

```bash
pveum role add ProxPanelUser -privs "Sys.Audit Datastore.Audit VM.Audit VM.PowerMgmt VM.Console VM.Backup VM.GuestAgent.Audit"
```

Privilèges utilisés :

| Privilège | Utilisation dans ProxPanel |
|---|---|
| `Sys.Audit` | État du cluster, nœuds, ressources et métriques |
| `Datastore.Audit` | Voir les stockages et leur état |
| `VM.Audit` | Voir VM/LXC, configuration et état |
| `VM.PowerMgmt` | Start, stop, shutdown, reboot, reset/suspend selon disponibilité |
| `VM.Console` | Console noVNC / terminal |
| `VM.Backup` | Fonctions de sauvegarde associées aux VM/LXC |
| `VM.GuestAgent.Audit` | Informations QEMU Guest Agent en lecture seule (IP, OS, fichiers systèmes/stockage exposés par les commandes d'audit) |

### Proxmox VE 8

Sur Proxmox VE 8, les appels QEMU Guest Agent utilisés pour les informations invité sont historiquement contrôlés par `VM.Monitor`.

```bash
pveum role add ProxPanelUser -privs "Sys.Audit Datastore.Audit VM.Audit VM.PowerMgmt VM.Console VM.Backup VM.Monitor"
```

> Lors d'une migration de PVE 8 vers PVE 9, remplacez `VM.Monitor` par `VM.GuestAgent.Audit`.

## Attribution au compte et au token

Exemple avec un utilisateur dédié `proxpanel@pve` et un token `proxpanel` :

```bash
pveum user add proxpanel@pve
pveum user token add proxpanel@pve proxpanel -privsep 1
pveum acl modify / -user proxpanel@pve -role ProxPanelUser
pveum acl modify / -token 'proxpanel@pve!proxpanel' -role ProxPanelUser
```

Avec **Privilege Separation** activé (`privsep=1`), les permissions effectives du token sont toujours limitées par celles de son utilisateur parent. L'utilisateur doit donc disposer au minimum des mêmes droits que le token.

Vous pouvez vérifier les permissions avec :

```bash
pveum user permissions proxpanel@pve
pveum user token permissions proxpanel@pve proxpanel
```

## Sauvegardes : inventaire des archives et création

Pour lister réellement le contenu des stockages de sauvegarde et autoriser les opérations qui allouent de l'espace, Proxmox demande également `Datastore.AllocateSpace`.

Pour rester en moindre privilège, **ne l'ajoutez pas globalement à `/`**. Créez un rôle séparé et attribuez-le uniquement au(x) stockage(s) de sauvegarde utilisé(s) par ProxPanel.

```bash
pveum role add ProxPanelBackupStore -privs "Datastore.AllocateSpace"
pveum acl modify /storage/BKP_NAS02 -user proxpanel@pve -role ProxPanelBackupStore
pveum acl modify /storage/BKP_NAS02 -token 'proxpanel@pve!proxpanel' -role ProxPanelBackupStore
```

Remplacez `BKP_NAS02` par l'identifiant réel de votre stockage.

> `Datastore.AllocateSpace` est plus permissif que `Datastore.Audit`. Ne l'accordez que si vous utilisez les fonctions de sauvegarde correspondantes.

## Mode lecture seule

Pour un ProxPanel utilisé uniquement en supervision, vous pouvez partir du rôle `PVEAuditor` sur `/`.

Pour récupérer les informations QEMU Guest Agent :

- PVE 9 : ajoutez un rôle personnalisé contenant `VM.GuestAgent.Audit` ;
- PVE 8 : utilisez `VM.Monitor` comme compatibilité historique.

Les actions d'alimentation, la console et les opérations de sauvegarde seront alors indisponibles.

## Pourquoi `PVEVMUser` seul ne suffit pas

La documentation Proxmox décrit `PVEVMUser` comme permettant de voir les VM, les sauvegarder, utiliser la console et gérer leur alimentation. ProxPanel interroge aussi des API telles que :

- `/cluster/resources`
- `/cluster/status`
- `/cluster/tasks`
- `/nodes/{node}/rrddata`
- `/nodes/{node}/storage/{storage}/rrddata`
- les endpoints VM/LXC et QEMU Guest Agent

Les droits d'audit système et stockage sont donc nécessaires pour que les vues cluster, nœud et stockage soient complètes.

## Fonctions avancées

Certaines fonctions ProxPanel peuvent demander des privilèges supplémentaires (par exemple snapshots, restauration, migration, modification de configuration, upload d'ISO/template ou administration du nœud).

Ces droits ne font volontairement **pas** partie du profil minimum ci-dessus. Ajoutez-les uniquement si vous utilisez la fonction concernée.

## Références

- Documentation Proxmox VE — User Management / Permissions
- Documentation Proxmox VE — API tokens and privilege separation
- ProxPanel utilise l'API Proxmox VE et respecte les ACL configurées côté Proxmox.

---

# English summary

The built-in `PVEVMUser` role alone is **not sufficient** for the full ProxPanel dashboard because ProxPanel also reads cluster, node and storage information.

Recommended standard role on **PVE 9**:

```text
Sys.Audit
Datastore.Audit
VM.Audit
VM.PowerMgmt
VM.Console
VM.Backup
VM.GuestAgent.Audit
```

On **PVE 8**, use `VM.Monitor` instead of `VM.GuestAgent.Audit` for the QEMU Guest Agent calls used by ProxPanel.

If API-token privilege separation is enabled, grant the same role to both the backing user and the token. For backup-storage content/allocation features, add `Datastore.AllocateSpace` only on the relevant backup storage path(s).
