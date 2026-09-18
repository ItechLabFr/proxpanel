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
