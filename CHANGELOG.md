# ProxPanel 1.7.2-beta.8.2

## Français
- Détection CPU renforcée : cluster, API status, rapport Proxmox puis SSH/lscpu.
- Source du modèle CPU affichée et diagnostic d’accès plus précis.
- Cache négatif CPU raccourci.
- Refonte des sélecteurs ZIP de secours.
- Correction des débordements de l’installation manuelle OTA / package complet.

## English
- Stronger CPU model discovery: cluster, status API, Proxmox report then SSH/lscpu.
- CPU source display and clearer access diagnostics.
- Shorter negative CPU cache.
- Redesigned manual ZIP selectors.
- Fixed OTA/full package manual update overflow.

# ProxPanel 1.7.2-beta.8.1

## Français
- Correctif critique OTA pour les installations LXC Debian 13.
- Suppression de la dépendance obligatoire à `busybox unzip`.
- Utilisation de `unzip` natif avec fallback BusyBox.
- Correction de la lecture de `release.json`, de l’extraction OTA et des packages complets.
- Messages d’erreur ZIP plus explicites.

## English
- Critical OTA fix for native Debian 13 LXC installations.
- Removed the hard dependency on `busybox unzip`.
- Uses native `unzip` with BusyBox fallback.
- Fixed release.json reading, OTA extraction and full-package extraction.
- More explicit ZIP extraction errors.

# ProxPanel 1.7.2-beta.8

## Français
- Lancement officiel de l’installation native **LXC Debian 13** sans Docker, amd64 + arm64.
- Génération d’un package `proxpanel-lxc-v1.7.2-beta.8.tar.gz` depuis la même release que l’OTA et le package complet.
- OTA commun aux installations Docker et LXC.
- Nouveau mode **mise à jour complète** et **réparation de la version actuelle**.
- Vérification post-update `/healthz` et rollback automatique par le bootstrap en cas d’échec.
- Refonte de l’Administration avec navigation regroupée, accueil simplifié et accès maintenance plus clair.
- Passe responsive supplémentaire desktop/tablette/mobile/PWA.
- Détection CPU renforcée : variantes API Proxmox + fallback SSH/lscpu lorsque disponible.
- Diagnostic explicite du modèle CPU et affichage de sa source.

## English
- Official native **Debian 13 LXC** installation launch without Docker, amd64 + arm64.
- Generates `proxpanel-lxc-v1.7.2-beta.8.tar.gz` from the same release as OTA and full packages.
- Shared OTA package for Docker and LXC installations.
- New **full update** and **repair current installation** modes.
- Post-update `/healthz` validation with automatic bootstrap rollback on failure.
- Administration redesign with grouped navigation, cleaner home and clearer maintenance access.
- Additional desktop/tablet/mobile/PWA responsive pass.
- Stronger CPU detection using Proxmox API variants plus SSH/lscpu fallback when available.
- Explicit CPU diagnostics and model source.

# ProxPanel 1.7.2-beta.7

## Français
- Nouveau moteur **Automatisations 2.0** avec conditions, branches, retries, timeouts et dépendances entre étapes.
- Attente d’état VM/LXC avant poursuite des scénarios.
- Ciblage par VMID, tag Proxmox ou groupe ProxPanel.
- Étapes Docker via Portainer et étapes de sauvegarde Proxmox.
- Prévisualisation / dry-run sans action réelle.
- Modèles réutilisables et historique persistant avec résultat par étape.
- Affichage du **modèle exact du processeur** de chaque nœud Proxmox avec sockets, cœurs, threads et fréquence lorsque disponibles.
- Informations CPU enrichies dans le détail des nœuds.
- Correction du menu Administration mobile qui recouvrait le contenu.
- Correction de l’interface ZIP/rollback qui débordait et se superposait sur téléphone.

## English
- New **Automations 2.0** engine with conditions, branches, retries, timeouts and step dependencies.
- Wait-until VM/LXC state before continuing scenarios.
- Target by VMID, Proxmox tag or ProxPanel group.
- Docker steps through Portainer and Proxmox backup steps.
- Preview / dry-run without real actions.
- Reusable templates and persistent per-step execution history.
- Exact **CPU model** shown for each Proxmox node, including sockets, cores, threads and frequency when available.
- Richer CPU information in node details.
- Fixed mobile Administration navigation overlay.
- Fixed ZIP/rollback controls overflowing and overlapping on phones.

# ProxPanel 1.7.2-beta.5.1

## Français
- Correctif sécurité de l’issue #18 : une session active seule ne peut plus désactiver la 2FA.
- Ré-authentification forte obligatoire : mot de passe actuel + TOTP actuel.
- Un administrateur qui réinitialise la 2FA d’un autre compte doit utiliser ses propres facteurs et disposer lui-même d’une 2FA active.
- 5 échecs de ré-authentification en 15 minutes entraînent un blocage temporaire.
- Audit succès/échec et e-mail de sécurité au propriétaire lorsque la messagerie est configurée.
- Nouvelle modale de désactivation 2FA avec saisie des facteurs.
- Issue #19 évaluée : migration React/Vue/Vite reportée pour 1.7.2, décision documentée.

## English
- Security fix for issue #18: an active session alone can no longer disable 2FA.
- Strong re-authentication required: current password + current TOTP.
- Administrators resetting another account’s 2FA must use their own factors and have 2FA enabled.
- Five failed re-auth attempts inside 15 minutes trigger a temporary lock.
- Success/failure audit and owner security email when mail is configured.
- New 2FA disable modal requiring fresh factors.
- Issue #19 evaluated: React/Vue/Vite migration deferred for 1.7.2 and documented.

# ProxPanel 1.7.2-beta.5

## Français
- Nouveau centre Docker **Images & Updates** par environnement Portainer.
- Inventaire des images utilisées, inutilisées et dangling.
- Détection des mises à jour par digest lorsque l’information distante est fiable.
- États séparés : mise à jour disponible, pull possible et redeploy requis.
- Pull manuel sans redémarrage implicite.
- Aperçu avant redeploy avec conteneurs/stacks concernés.
- Contrôle de santé après redeploy des stacks et conteneurs autonomes.
- Remplacement sécurisé des conteneurs autonomes avec tentative de rollback.
- Refus du redeploy autonome si IP/MAC statique ou réseau avancé est détecté.
- Historique/audit des checks, pulls, redeploys et suppressions.
- Fenêtres de maintenance et file planifiée explicite, désactivées par défaut.
- Aucun prune global automatique et aucun comportement Watchtower.
- Notifications Docker update/failure et données de démo déterministes.
- Responsive téléphone/tablette/PWA.

## English
- New per-environment Docker **Images & Updates** center.
- Used, unused and dangling image inventory.
- Digest-based update detection when remote information is reliable.
- Separate update available, pull available and redeploy required states.
- Manual pull with no implicit restart.
- Pre-redeploy preview for affected containers/stacks.
- Post-redeploy health verification for stacks and standalone containers.
- Safe standalone-container replacement with rollback attempt.
- Automatic refusal when static IP/MAC or advanced networking is detected.
- Check, pull, redeploy and removal history/audit.
- Maintenance windows and explicit scheduled queue, disabled by default.
- No automatic global prune and no Watchtower-style behavior.
- Docker update/failure notifications and deterministic demo fixtures.
- Responsive phone/tablet/PWA UI.

# ProxPanel 1.7.2-beta.4.3

## Français
- Correction de `WARNINGS: n` : avertissement et non échec critique.
- Classification centralisée des statuts de tâches Proxmox.
- Health Score : les warnings ne sont plus comptés comme des échecs.
- Nouveau type `backup.warning`.
- Diagnostics warning/critical enrichis sur e-mail, Discord, Telegram et webhook.
- Statut brut, type de tâche, utilisateur, horaires, durée, UPID, VMID/CT et logs lorsque disponibles.
- Centre Notifications/PWA enrichi pour les warnings de sauvegarde.
- Suppression des doublons tâche/backup pour `vzdump`.
- Redaction centrale des secrets avant envoi.

## English
- Fixed `WARNINGS: n` classification: warning instead of critical failure.
- Centralized Proxmox task status classification.
- Health Score no longer counts warnings as failures.
- New `backup.warning` event type.
- Rich warning/critical diagnostics across email, Discord, Telegram and webhooks.
- Raw status, task metadata, UPID, detected VMIDs/CTs and log excerpts when available.
- Backup warnings surfaced in Notifications/PWA.
- Removed duplicate generic task + backup alerts for `vzdump`.
- Central secret redaction before delivery.

# ProxPanel 1.7.2-beta.4.2

## Français
- E-mails warning/critical enrichis avec source technique, UPID et contexte de diagnostic.
- Ajout d'un bloc « Détails techniques / Logs » dans les alertes e-mail.
- Extraits de logs des tâches Proxmox et sauvegardes vzdump en erreur.
- Extraits de logs Docker pour les incidents conteneur lorsque Portainer les expose.
- Message d'erreur API conservé pour les incidents Portainer / Docker Engine.
- Filtrage des API keys, tokens, mots de passe, secrets, tickets Proxmox et cookies avant envoi.
- La beta.5 reste réservée à Docker Image & Update Management.

## English
- Warning/critical emails now include technical source, UPID and diagnostic context.
- Added a “Technical details / Logs” block to alert emails.
- Proxmox task and failed vzdump log excerpts.
- Docker container log excerpts when exposed through Portainer.
- API error messages retained for Portainer / Docker Engine incidents.
- API keys, tokens, passwords, secrets, Proxmox tickets and cookies are redacted before sending.
- beta.5 remains reserved for Docker Image & Update Management.

# ProxPanel 1.7.2-beta.4.1

## Français
- Nouveau Dashboard Docker graphique façon Proxmox.
- Historique CPU, RAM, réseau RX/TX et états des conteneurs.
- Périodes 1 h, 24 h, 7 j et 30 j.
- Filtre global ou par environnement Portainer.
- CPU normalisée par le nombre de CPU des hôtes.
- Historique persistant avec rétention 32 jours et downsampling.
- Rafraîchissement live sans reconstruire toute la page Docker.
- Exclusion des snapshots Docker trop anciens.
- Démo publique enrichie avec des historiques fictifs.

## English
- New Proxmox-style graphical Docker Dashboard.
- CPU, memory, RX/TX network and container-state history.
- 1 h, 24 h, 7 d and 30 d ranges.
- Global or per-Portainer-environment filtering.
- CPU normalized by Docker host CPU count.
- Persistent 32-day history with downsampling.
- Live refresh without rebuilding the whole Docker page.
- Stale Docker snapshots excluded.
- Public demo historical fixtures.

# ProxPanel 1.7.2-beta.4

## Français
- Nouveau Dashboard Docker consolidé via Portainer.
- KPI environnements, running/stopped/unhealthy/restarting et stacks.
- Top CPU et RAM des conteneurs lorsque les statistiques Docker sont disponibles.
- Association persistante environnement Portainer ↔ VM/LXC Proxmox.
- Suggestion par hostname uniquement en cas de correspondance unique, jamais appliquée automatiquement.
- Association modifiable ou supprimable à tout moment.
- Données fictives de démo enrichies pour le Dashboard et la topologie.
- Responsive téléphone/tablette/PWA.

## English
- New consolidated Docker Dashboard through Portainer.
- Environment, running/stopped/unhealthy/restarting and stack KPIs.
- Top container CPU and memory when Docker statistics are available.
- Persistent Portainer environment ↔ Proxmox VM/LXC mapping.
- Hostname suggestion only for unique matches and never automatically applied.
- Mapping can be changed or removed at any time.
- Public demo fixtures extended for Dashboard and topology.
- Responsive phone/tablet/PWA layout.

# ProxPanel 1.7.2-beta.3

## Français
- Supervision Docker/Portainer en arrière-plan, même navigateur fermé.
- Alertes Portainer inaccessible et Docker Engine inaccessible.
- Détection fiable des conteneurs arrêtés, unhealthy et en redémarrages répétés.
- Alertes CPU/RAM conteneur quand les statistiques Docker sont disponibles.
- Pression stockage détectée uniquement avec des données Docker Used/Total fiables.
- Détection des stacks actives partiellement dégradées.
- Confirmation sur 2 contrôles par défaut avant incident, cooldown et anti-doublon.
- Notifications de récupération.
- Nouveaux événements Docker pour Panel, Discord, webhook, Telegram et e-mail.
- Incidents visibles dans Docker et Notifications.
- Les erreurs temporaires Portainer ne deviennent jamais de faux arrêts de conteneur.
- Actions Stop/Pause/Restart lancées depuis ProxPanel temporairement exclues de la détection d’arrêt inattendu.

## English
- Background Docker/Portainer monitoring, even when the browser is closed.
- Portainer unreachable and Docker Engine unreachable alerts.
- Reliable stopped, unhealthy and repeated-restart container detection.
- Container CPU/RAM alerts when Docker statistics are available.
- Storage pressure only when reliable Docker Used/Total capacity data exists.
- Partially degraded active-stack detection.
- Two-check confirmation by default, cooldown and duplicate suppression.
- Recovery notifications.
- New Docker events for Panel, Discord, webhook, Telegram and email.
- Incidents shown in Docker and Notifications.
- Temporary Portainer errors never become false stopped-container incidents.
- Stop/Pause/Restart actions started from ProxPanel are temporarily excluded from unexpected-stop detection.

# ProxPanel 1.7.2-beta.2

## Français
- Nouvelle console Docker par environnement Portainer.
- Inventaire des conteneurs : image, état, health, statut, ports, réseaux et stack.
- Détails avec statistiques CPU/RAM temps réel quand disponibles.
- Inspect filtré avec secrets et variables d’environnement masqués.
- Logs Docker directement dans ProxPanel.
- Exec non interactif via Portainer.
- Actions conteneur : start, stop, restart, pause, resume.
- Inventaire des stacks Portainer avec source, état et nombre de conteneurs.
- Actions stack : start, stop et redeploy avec confirmation.
- Toutes les actions Docker sont auditées.
- Interface responsive mobile/tablette.
- Packaging OTA complet + smoke-test conservés depuis beta.1.1.

## English
- New Docker operations workspace per Portainer environment.
- Container inventory: image, state, health, status, ports, networks and stack.
- Details with real-time CPU/RAM stats when available.
- Filtered Inspect with secrets and environment values redacted.
- Docker logs directly in ProxPanel.
- Non-interactive Exec through Portainer.
- Container actions: start, stop, restart, pause, resume.
- Portainer stack inventory with source, state and container count.
- Stack actions: start, stop and redeploy with confirmation.
- All Docker actions are audited.
- Responsive mobile/tablet interface.
- Complete OTA packaging + smoke-test retained from beta.1.1.

# ProxPanel 1.7.2-beta.1.1

## Français
- Hotfix critique du ZIP OTA de 1.7.2-beta.1.
- Corrige le 502 Bad Gateway causé par l'absence de `app/lib/reliability.js` après une mise à jour OTA.
- Le builder OTA copie désormais toute l'application afin qu'un nouveau dossier applicatif ne puisse plus être oublié.
- L'updater vérifie les dépendances JavaScript locales avant d'activer une release.
- La roadmap beta.2 reste inchangée : Docker Containers & Stacks.

## English
- Critical OTA ZIP hotfix for 1.7.2-beta.1.
- Fixes the 502 Bad Gateway caused by missing `app/lib/reliability.js` after an OTA update.
- The OTA builder now copies the complete application so new application directories cannot be omitted.
- The updater validates local JavaScript dependencies before activating a release.
- The beta.2 roadmap remains unchanged: Docker Containers & Stacks.

# ProxPanel 1.7.2-beta.1

## Français
- Première version de la série 1.7.2.
- Portainer devient la première intégration officiellement supportée.
- Portainer CE est testé en priorité ; la compatibilité Business Edition reste ouverte lorsque les API utilisées sont identiques.
- Ajout d'une configuration Portainer par URL + API Key / Access Token.
- Test de connexion avant sauvegarde de l'intégration.
- Support TLS et certificat auto-signé optionnel.
- Découverte automatique des environnements Portainer.
- Support initial Docker Standalone.
- Nouvelle page Docker avec état des environnements, version Docker, CPU, RAM, OS et compteurs de conteneurs.
- Le menu Docker reste caché si Portainer n'est pas configuré.
- Aucun accès direct au socket Docker.
- Une instance Portainer en erreur n'empêche pas les autres de remonter.
- Premiers tests fonctionnels automatisés pour les sauvegardes et la logique Docker/Portainer.
- PBS reste optionnel et est prévu pour beta.6.

## English
- First release in the 1.7.2 series.
- Portainer becomes the first officially supported integration.
- Portainer CE is tested first; Business Edition compatibility remains open where the same APIs are available.
- Adds Portainer configuration using URL + API Key / Access Token.
- Connection is tested before saving the integration.
- Adds TLS support with optional self-signed certificates.
- Automatically discovers Portainer environments.
- Initial Docker Standalone support.
- Adds a Docker page with environment state, Docker version, CPU, RAM, OS and container counters.
- Docker navigation stays hidden when Portainer is not configured.
- No direct Docker socket access.
- A failed Portainer instance does not block data from other configured instances.
- Adds initial automated functional tests for backup and Docker/Portainer reliability.
- PBS remains optional and is planned for beta.6.

# ProxPanel 1.7.1-beta.10

## Français
- Correction majeure des faux positifs de sauvegarde.
- Un stockage de backup temporairement inaccessible n'est plus interprété comme « aucun backup trouvé ».
- Conservation en mémoire du dernier inventaire backup valide pour servir de preuve pendant une indisponibilité temporaire.
- Les absences ne sont jamais déduites d'un inventaire partiel ou périmé.
- Le VMID est désormais récupéré depuis le volid quand Proxmox ne fournit pas directement le champ vmid.
- Les tâches vzdump réussies servent de preuve complémentaire d'une sauvegarde récente.
- Si une tâche vzdump réussie est plus récente que l'inventaire stockage, elle devient la référence de dernière sauvegarde.
- Comptage des points de restauration détectés par VM/LXC, utile avec les rétentions multi-jours.
- Le seuil par défaut reste de 36 h pour les sauvegardes quotidiennes.
- « Sauvegarde attendue absente » nécessite désormais deux contrôles consécutifs fiables avant l'envoi d'une notification.
- Une détection non fiable ou partielle remet le compteur de confirmation à zéro au lieu d'envoyer une alerte.
- Le même incident n'est plus renvoyé en boucle tant qu'il n'y a pas eu une vraie récupération.
- Ajout de l'état de l'inventaire backup dans l'état interne des alertes pour faciliter le diagnostic.
- Cette beta.10 clôture la série 1.7.1 avec une passe de stabilisation orientée fiabilité des sauvegardes.

## English
- Major fix for backup false positives.
- A temporarily unavailable backup storage is no longer interpreted as “no backup found”.
- Keeps the last valid backup inventory in memory as evidence during temporary outages.
- Backup absence is never inferred from partial or stale inventory data.
- VMID can now be recovered from volid when Proxmox does not expose vmid directly.
- Successful vzdump tasks are used as additional proof of a recent backup.
- If a successful vzdump task is newer than storage inventory, it becomes the last-backup reference.
- Counts detected restore points per VM/LXC, useful with multi-day retention policies.
- Default stale threshold remains 36 hours for daily backup schedules.
- “Expected backup missing” now requires two consecutive reliable checks before a notification is sent.
- Unreliable/partial detection resets the confirmation counter instead of sending an alert.
- The same incident is no longer repeatedly sent until a real recovery occurs.
- Backup inventory status is persisted in alert state for easier diagnostics.
- beta.10 closes the 1.7.1 series with a stabilization pass focused on backup reliability.

# ProxPanel 1.7.1-beta.9

## Français
- Refonte mobile de la page Machines.
- La case de sélection est désormais intégrée proprement dans la carte VM/LXC sur téléphone.
- Correction des débordements et chevauchements sur CPU, mémoire, stockage et nœud.
- Console et Actions sont désormais alignés proprement et tactiles sur mobile.
- Nouvelle barre d’actions groupées mobile, fixe au bas de l’écran, avec compteur de sélection.
- Conservation de la sélection des machines pendant les rafraîchissements/rendus.
- Bouton de désélection globale ajouté.
- Filtres Machines empilés proprement sur petit écran.
- Modales détail VM/LXC transformées en plein écran mobile avec en-tête et actions accessibles.
- Passe responsive globale sur grilles, toolbars, formulaires et cartes principales.
- Refonte complète du widget Santé du cluster.
- Suppression du gros cercle 100/100.
- Nouveau score compact avec barre de progression, état global et résumé lisible.
- Nœuds et stockages deviennent des états compacts séparés.
- Alertes, sauvegardes, température et tâches restent visibles dans une grille plus propre.
- Compatibilité Light/Dark des nouveaux composants.

## English
- Mobile redesign for the Machines page.
- Selection checkbox is now properly integrated into each VM/LXC card on phones.
- Fixes layout overflow and text collisions across CPU, memory, storage and node fields.
- Console and Actions buttons are properly aligned and touch-friendly on mobile.
- Adds a fixed mobile bulk-action bar with selected-machine count.
- Keeps machine selection across refreshes/renders.
- Adds a clear-all selection action.
- Machine filters now stack cleanly on small screens.
- VM/LXC detail modals become full-screen mobile sheets with accessible header/actions.
- Broader responsive pass across grids, toolbars, forms and primary cards.
- Complete Cluster Health widget redesign.
- Removes the oversized 100/100 circular gauge.
- Adds a compact health score with progress bar, global state and readable summary.
- Nodes and storages use dedicated compact state cards.
- Alerts, backups, temperature and tasks remain visible in a cleaner grid.
- New components support both Light and Dark themes.

# ProxPanel 1.7.1-beta.8

## Français
- Refonte complète du Mode TV.
- Nouvelle vue Synthèse avec six KPI principaux : CPU, mémoire, stockage, réseau, température et santé.
- Nouveau mur de supervision avec alertes, nœuds, sauvegardes, mises à jour et prévision de capacité.
- Nouvelle hiérarchie visuelle pensée pour les écrans muraux et la lecture à distance.
- Refonte du header TV avec état LIVE, source/cluster, horloge, actualisation et sélecteur Synthèse / Analytique / Studio.
- Responsive réellement recomposé selon l'écran : desktop, tablette et mobile/PWA ont des layouts dédiés.
- Sur mobile, les KPI passent en grille compacte et les panneaux sont réorganisés verticalement ; ce n'est plus un simple desktop réduit.
- Les vues Analytique et Studio utilisent désormais la nouvelle identité TV.
- Refonte complète de la page Administration > Supervision : seuils présentés sous forme de réglages structurés avec libellés, descriptions et unités.
- Refonte de Administration > Avancé : modules présentés en cartes compactes, disparition du champ d'ordre brut visible et meilleure organisation du temps réel.
- Refonte de l'installation automatique OTA : créneaux plus lisibles, jours sous forme de sélecteurs, horaires mieux structurés.
- Réduction importante des espaces vides dans les pages Administration concernées.
- Les nouveaux composants utilisent les variables de thème et restent cohérents en Light et Dark.

## English
- Complete TV Mode redesign.
- New Summary view with six primary KPIs: CPU, memory, storage, network, temperature and health.
- New wallboard supervision layout with alerts, nodes, backups, updates and capacity forecast.
- New visual hierarchy optimized for wall displays and distance readability.
- Redesigned TV header with LIVE state, cluster/source, clock, refresh status and Summary / Analytics / Studio switcher.
- True responsive recomposition: desktop, tablet and mobile/PWA use dedicated layouts.
- On mobile, KPIs use a compact grid and panels are vertically reorganized instead of shrinking desktop layout.
- Analytics and Studio views inherit the new TV visual identity.
- Complete Administration > Monitoring redesign with structured settings, descriptions and units.
- Administration > Advanced redesign with compact module cards and a cleaner real-time refresh control.
- OTA automatic-install scheduling redesigned with clearer windows, day selectors and time range layout.
- Significantly reduces unused empty space in the affected Administration pages.
- New components use theme variables and remain consistent across Light and Dark modes.

# ProxPanel 1.7.1-beta.7

## Français
- Finalisation du thème clair sur les composants qui restaient encore sombres.
- Les notifications/toasts de validation, avertissement et erreur suivent maintenant correctement le thème Light.
- Correction des tuiles Maximum/Moyenne du widget Températures.
- Correction des blocs internes de Santé du cluster.
- Correction des métriques, informations, snapshots et en-têtes de la fenêtre détail VM/LXC.
- Correction de la barre de filtres du Monitoring.
- Correction des cartes KPI Paquets/Critiques/Sécurité/Nœuds des mises à jour PVE.
- Correction de plusieurs blocs OTA, SMTP, diagnostics et formulaires encore sombres en Light.
- Refonte de la navigation Administration avec un menu secondaire permanent.
- Administration regroupe désormais Accueil, Général, Serveurs Proxmox, Interface & apparence, Supervision, Notifications, Utilisateurs & sécurité, Mises à jour, Application et Avancé.
- Notifications et Utilisateurs ne sont plus des entrées séparées dans le menu principal : ils sont intégrés dans Administration.
- Le menu Administration reste visible pendant la navigation et devient horizontal/scrollable sur mobile.
- Ajout d'un filtre rapide des rubriques Administration.

## English
- Completes the Light theme for components that still remained dark.
- Success, warning and error toasts now correctly follow the Light theme.
- Fixes Maximum/Average temperature summary tiles.
- Fixes internal Cluster Health tiles.
- Fixes VM/LXC detail metrics, information tiles, snapshots and modal headers.
- Fixes the Monitoring filter toolbar.
- Fixes PVE Updates KPI cards for Packages/Critical/Security/Nodes.
- Fixes several OTA, SMTP, diagnostics and form surfaces that still remained dark in Light mode.
- Redesigns Administration navigation with a persistent secondary menu.
- Administration now groups Home, General, Proxmox Servers, Interface & Appearance, Monitoring, Notifications, Users & Security, Updates, Application and Advanced.
- Notifications and Users are no longer separate primary sidebar items; they live inside Administration.
- Administration navigation stays visible while browsing and becomes horizontal/scrollable on mobile.
- Adds quick filtering for Administration sections.

# ProxPanel 1.7.1-beta.6

## Français
- Audit complet du thème clair : correction des surfaces encore sombres dans le dashboard, l'administration, les tableaux, formulaires, modales, notifications et menus.
- La couleur de la barre navigateur/PWA suit désormais automatiquement le thème sélectionné.
- Nouvelle recherche dans Administration pour retrouver rapidement un réglage (thème, Discord, 2FA, OTA, etc.).
- Nouveau bouton de réinitialisation de l'apparence.
- Nouveau diagnostic de connexion Proxmox accessible depuis l'état de connexion en cas d'erreur.
- Conservation des dernières données valides si Proxmox devient temporairement indisponible, avec bandeau de données non actualisées.
- Le Service Worker utilise désormais le réseau en priorité pour index.html, app.js, CSS et manifest afin d'éviter de rester bloqué sur un ancien JavaScript après une mise à jour.
- Les fichiers critiques PWA sont servis avec une politique de cache plus stricte.
- Détection d'une nouvelle version PWA prête avec bouton de rechargement.
- Raccourcis clavier desktop : / pour la recherche, G puis O/M/N/S pour Vue d'ensemble, Machines, Nœuds et Stockage.
- Les consoles noVNC/xterm restent volontairement sombres pour conserver leur lisibilité.

## English
- Full Light theme audit: fixes remaining dark surfaces across dashboard, administration, tables, forms, modals, notifications and menus.
- Browser/PWA theme color now follows the selected theme automatically.
- Adds Administration settings search for quickly finding theme, Discord, 2FA, OTA and other settings.
- Adds an appearance reset button.
- Adds Proxmox connection diagnostics accessible from the connection status when an error occurs.
- Keeps the last valid data visible if Proxmox becomes temporarily unavailable, with a stale-data warning banner.
- Service Worker now uses network-first behavior for index.html, app.js, CSS and manifest to avoid being stuck on old JavaScript after updates.
- Critical PWA files now use stricter cache headers.
- Detects when a new PWA version is ready and offers a reload action.
- Adds desktop keyboard shortcuts: / for search and G then O/M/N/S for Overview, Machines, Nodes and Storage.
- noVNC/xterm consoles intentionally remain dark for readability.

# ProxPanel 1.7.1-beta.5

## Français
- Corrige immédiatement l'erreur `notifyProblems is not defined` qui empêchait le dashboard de terminer son chargement.
- Restaure le gestionnaire de notifications supprimé accidentellement lors de la refonte Administration/chargement.
- Le chargement des données Proxmox ne bascule plus en erreur après récupération réussie du dashboard.
- Durcit la lecture de l'historique local des notifications pour éviter qu'une valeur localStorage invalide provoque une nouvelle erreur.
- Cache PWA et assets navigateur passés en 1.7.1-beta.5.

## English
- Immediately fixes the `notifyProblems is not defined` error that prevented dashboard loading from completing.
- Restores the notification handler accidentally removed during the Administration/loading refactor.
- Proxmox data loading no longer falls into an error state after a successful dashboard fetch.
- Hardens local notification-history parsing to avoid malformed localStorage values causing another error.
- Bumps PWA cache and browser assets to 1.7.1-beta.5.

# ProxPanel 1.7.1-beta.4

## Français
- Correctif urgent de connexion Proxmox après la 1.7.1-beta.3.
- Valide une vue multi-nœuds mémorisée avant le premier chargement du dashboard.
- Si une vue multi-nœuds sauvegardée est supprimée, invalide ou indisponible, retour automatique sur le serveur Proxmox sélectionné.
- Empêche une erreur de vue dashboard de faire apparaître toute l'application comme déconnectée.
- Rend la récupération de session PVE non bloquante pour le dashboard déjà chargé.
- Le logo ProxPanel conserve désormais son identité orange dans tous les thèmes et ne suit plus la couleur d'accent.
- Cache PWA et assets navigateur passés en 1.7.1-beta.4 pour forcer la récupération du correctif.

## English
- Urgent Proxmox connection hotfix following 1.7.1-beta.3.
- Validates a persisted multi-node view before the first dashboard request.
- Automatically falls back to the selected Proxmox server when a saved multi-node view is deleted, invalid or unavailable.
- Prevents a dashboard-view failure from making the whole application appear disconnected.
- Makes PVE session retrieval non-blocking once the dashboard is already loaded.
- Keeps the ProxPanel logo orange across every theme instead of inheriting the theme accent.
- Bumps PWA cache and browser assets to 1.7.1-beta.4 so clients retrieve the hotfix.

# ProxPanel 1.7.1-beta.3

## Français
- Refonte du chargement initial : seules les données indispensables bloquent désormais le premier écran.
- Suppression du préchargement massif des données Audit, utilisateurs, automatisations, restaurations et administration ; ces données sont chargées à la demande.
- Déduplication des requêtes GET simultanées et instrumentation des temps de réponse API dans Administration > Application.
- Navigation perçue plus rapide : la page s'affiche immédiatement puis ses données sont complétées sans attendre le chargement réseau.
- Refonte complète de l'Administration en centre de configuration avec sous-sections dédiées.
- Nouveau menu latéral mieux hiérarchisé, sections repliables et état mémorisé.
- Ajout de six thèmes complets : ProxPanel Dark, Graphite Blue, Light, Neon / Cyber, Purple Control et High Contrast.
- Nouveaux réglages d'interface : mode sombre/clair/auto, accent optionnel, densité, largeur du menu et réduction des animations.
- Prévisualisation immédiate des thèmes et réglages visuels sans rechargement complet.
- Améliorations responsive de la nouvelle Administration et de la navigation sur mobile/PWA.

## English
- Reworks startup loading so only essential data blocks the first usable screen.
- Removes eager loading of Audit, users, automations, restore tests and administration datasets; they now load on demand.
- Deduplicates concurrent GET requests and records API timings in Administration > Application.
- Makes navigation feel faster by rendering the target page immediately and completing network data afterwards.
- Redesigns Administration as a structured configuration center with dedicated sections.
- Adds a clearer hierarchical sidebar with collapsible sections and persisted state.
- Adds six full themes: ProxPanel Dark, Graphite Blue, Light, Neon / Cyber, Purple Control and High Contrast.
- Adds UI settings for dark/light/auto mode, optional accent, density, menu width and reduced motion.
- Adds instant theme and appearance previews without a full page reload.
- Improves responsive behavior for the new Administration and navigation on mobile/PWA.

# ProxPanel 1.7.1-beta.2

## Français
- Stockage VM Windows/Linux enrichi via QEMU Guest Agent : partitions, volumes, utilisé, libre, total et pourcentage.
- Distinction entre capacité virtuelle Proxmox et occupation réelle invitée.
- Diagnostics explicites si les données Guest Agent sont indisponibles ; aucun faux 0 Go.
- Refonte multi-nœuds avec cartes lisibles et source serveur/cluster.
- Audit responsive global téléphone/tablette, y compris tableaux Machines et modales.
- Monitoring enrichi : API, latence, nœuds, CPU, RAM, stockage, température, Guest Agent et données périmées.
- Cohérence renforcée des données stockage/température entre vues regroupées, individuelles et live.

## English
- Adds Windows/Linux VM storage details through QEMU Guest Agent: filesystems, used, free, total and usage percentage.
- Separates Proxmox virtual capacity from actual guest usage.
- Adds explicit Guest Agent unavailability diagnostics and avoids fake 0 GB values.
- Redesigns multi-node cards and clearly identifies the source server/cluster.
- Adds a global phone/tablet responsive pass, including Machines tables and modals.
- Expands Monitoring with API, latency, nodes, CPU, RAM, storage, temperature, Guest Agent and stale-data states.
- Improves storage/temperature consistency across grouped, individual and live views.

# ProxPanel 1.7.1-beta.1

## Français
- Diagnostic console par étapes et reconnexion automatique noVNC.
- Sessions console temporaires portées à 5 minutes.
- Console mobile/tablette plus lisible et plus facile à utiliser.
- Premier affichage PWA accéléré sur iPhone grâce au chargement progressif.
- Données secondaires déplacées en arrière-plan.
- Dashboard initial chargé sans historique, puis graphiques complétés après affichage.
- Service Worker et cache HTTP optimisés pour les fichiers versionnés.

## English
- Adds step-by-step console diagnostics and automatic noVNC reconnect.
- Extends temporary console sessions to 5 minutes.
- Improves phone/tablet console usability.
- Speeds up the first PWA render on iPhone with progressive loading.
- Moves secondary startup data to background loading.
- Loads the initial dashboard without history, then fetches historical charts after the first render.
- Optimizes Service Worker and HTTP caching for versioned assets.

# ProxPanel 1.7.0-beta.16

## Français
- Corrige la température CPU absente dans les vues individuelles des nœuds.
- Aligne les routes dashboard et live individuelles sur la collecte lm-sensors des vues regroupées.
- Corrige la disparition de la température pendant le rafraîchissement live.
- Ajoute la règle de versioning : prochaine série en 1.7.1-beta.1, 10 betas maximum par version.

## English
- Fixes missing CPU temperature values in individual node views.
- Aligns individual dashboard and live routes with the lm-sensors collection used by grouped views.
- Fixes temperatures disappearing during live refresh.
- Adds the versioning rule: next series starts at 1.7.1-beta.1, with a maximum of 10 beta releases per version.

# ProxPanel 1.7.0-beta.15

## Authentication & Mobile UX
- Refonte complète de l’écran de connexion sur desktop, tablette et téléphone.
- Nouveau parcours en deux étapes visuelles : identifiants puis MFA.
- Champ Authenticator à 6 chiffres optimisé pour le clavier numérique mobile et l’autocomplétion OTP.
- Validation automatique lorsque les 6 chiffres sont saisis.
- Nouveaux écrans dédiés pour les codes de récupération et le secours par e-mail.
- Secours e-mail avec expiration visible et délai avant renvoi.
- Ajout de l’affichage/masquage du mot de passe et de la détection Verr. Maj.
- Première installation avec confirmation du mot de passe et indicateur de robustesse.
- Erreurs d’authentification affichées directement dans la carte.
- Support 100dvh, safe-area iOS, clavier virtuel, petits écrans et prefers-reduced-motion.

## Correctifs
- Corrige le login et le MFA trop compacts sur téléphone et tablette.
- Corrige les petites zones tactiles des méthodes de récupération.
- Corrige plusieurs risques de débordement avec le clavier mobile.
- Améliore la continuité visuelle après une erreur MFA.

# ProxPanel 1.7.0-beta.14

## Traduction FR / EN exhaustive
- Passe complète sur les textes UI encore codés en français.
- Traduction des boutons, champs, options, confirmations, prompts, toasts et notifications navigateur.
- Couverture renforcée du Dashboard, TV, Machines, Nœuds, Monitoring, Stockage, Backups, OTA, Notifications, Utilisateurs et Administration.
- Ajout de règles pour les textes dynamiques (compteurs, actions, migrations, backups, OTA, 2FA).
- Le changement FR / EN reste instantané et sans redémarrage.

# ProxPanel 1.7.0-beta.13

- Traduction FR/EN étendue à toute l’interface et aux messages dynamiques.
- Diagnostics température, OTA, utilisateurs, machines, sauvegardes et actions désormais traduits en English.
- Changement de langue toujours instantané, sans rebuild ni redémarrage.

# ProxPanel 1.7.0-beta.14

## Français / English
- Ajout d’un sélecteur FR / EN instantané côté frontend.
- Ajout d’une langue par défaut persistante dans les paramètres.
- Le choix rapide est local au navigateur et ne nécessite ni rebuild ni redémarrage.
- La page de connexion, le dashboard, le mode TV, l’administration et les principaux flux UI suivent la langue active.
- Formats régionaux FR/EN pour dates, nombres et tailles.
- Cache PWA incrémenté afin de déployer immédiatement les ressources de traduction.

# ProxPanel 1.7.0-beta.11

## Diagnostic température
- Affichage de la cause exacte lorsqu’une température est indisponible, directement par nœud.
- Causes distinguées : client SSH absent, `sshpass` absent, compte PAM requis, mot de passe absent/illisible, adresse de nœud introuvable, authentification refusée, nœud injoignable, `lm-sensors` absent et aucune sonde CPU exploitable.
- Une action recommandée accompagne chaque diagnostic dans le détail du nœud.
- Le Dashboard et les modes TV n’affichent plus un simple `—` sans explication.
- Les erreurs de collecte restent non bloquantes pour le Dashboard.

# ProxPanel 1.7.0-beta.10

## Correctif des graphiques
- Suppression réelle de `stroke-dasharray` et `stroke-dashoffset` sur les courbes CPU, RAM, stockage, réseau et TV.
- L’animation de dessin est remplacée par un fondu léger qui ne peut pas couper la ligne.
- Les points utilisent leurs timestamps réels pour l’axe horizontal quand ils sont disponibles.
- Les aires sous les courbes sont reconstruites avec le même chemin continu.

## Cache PWA
- `styles.css` et `app.js` utilisent désormais une URL versionnée par release.
- Le Service Worker charge CSS/JS en network-first afin qu’une OTA n’affiche plus un ancien rendu depuis le cache.

## Santé du cluster
- Conservation de la nouvelle carte Santé introduite en beta.9.
- La correction de cache garantit que son nouveau style est également chargé après OTA.

# ProxPanel 1.7.0-beta.8

## Dashboard Studio
- Widgets affichables/masquables avec tailles S/M/L/XL.
- Densité Compacte, Confortable ou Aérée.
- Animations douces optionnelles avec respect de `prefers-reduced-motion`.
- Présentation des machines au choix : Cartes, Compact ou Tableau.
